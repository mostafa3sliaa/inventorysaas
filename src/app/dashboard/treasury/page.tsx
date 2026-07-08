"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/components/shared/TenantProvider";
import { Wallet, ArrowDownRight, ArrowUpRight, Plus, Banknote, Calendar, RefreshCcw } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function TreasuryPage() {
  const { tenant } = useTenant();
  const supabase = createClient();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [vaultProfit, setVaultProfit] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Form State
  const [type, setType] = useState<"capital" | "expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchTransactions();
  }, [tenant]);

  const fetchTransactions = async () => {
    if (!tenant?.id) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("transaction_date", { ascending: false });

    if (error) {
      if (error.code === "42P01") {
        toast.error("عذراً، يبدو أن جدول الخزنة (transactions) لم يتم إنشاؤه بعد في قاعدة البيانات.");
      } else {
        toast.error("فشل في جلب بيانات الخزنة");
      }
    } else {
      setTransactions(data || []);
    }

    // Fetch Vault Profit from paid orders
    const { data: paidOrders } = await supabase
      .from('orders')
      .select(`id, is_deleted, total_amount, shipping_fee, payment_status, order_items ( quantity, unit_price, product_variants ( normal_cost ) )`)
      .in('payment_status', ['paid', 'partial', 'refunded'])
      .eq('tenant_id', tenant.id);
      
    if (paidOrders) {
      let profit = 0;
      paidOrders.filter((o: any) => o.is_deleted !== true).forEach(order => {
        let orderRevenue = 0;
        let totalCost = 0;
        order.order_items?.forEach((item: any) => {
           const qty = Number(item.quantity) || 0;
           const price = Number(item.unit_price) || 0;
           const cost = Number(item.product_variants?.normal_cost) || 0;
           
           orderRevenue += qty * price;
           totalCost += qty * cost;
        });
        
        // If order is refunded (returned), we only lose the shipping fee, cost of items is not lost
        if (order.payment_status === 'refunded') {
          profit -= Number(order.shipping_fee || 0);
          return;
        }
        
        // Use manual total_amount if present (e.g. from shipping fees or partial deliveries)
        // Subtract shipping fee to get actual item revenue for profit calculation
        const itemRevenue = (order.total_amount !== null && order.total_amount !== undefined) 
          ? Number(order.total_amount) - Number(order.shipping_fee || 0)
          : orderRevenue;
          
        profit += (itemRevenue - totalCost);
      });
      setVaultProfit(profit);
    }

    setLoading(false);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id) return;

    if (!amount || Number(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("transactions").insert({
      tenant_id: tenant.id,
      type,
      amount: Number(amount),
      category,
      description,
      transaction_date: new Date().toISOString()
    });

    if (error) {
      toast.error("حدث خطأ أثناء حفظ الحركة: " + error.message);
    } else {
      toast.success("تم إضافة الحركة بنجاح");
      setIsModalOpen(false);
      
      // Reset form
      setAmount("");
      setCategory("");
      setDescription("");
      setType("expense");
      
      fetchTransactions();
    }
    setIsSubmitting(false);
  };

  const handleResetTreasury = async () => {
    if (!tenant?.id) return;
    setIsResetting(true);
    
    // Delete all manual transactions for this tenant
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('tenant_id', tenant.id);

    if (error) {
      toast.error("حدث خطأ أثناء تصفير الخزنة: " + error.message);
    } else {
      toast.success("تم تصفير الخزنة (الحركات اليدوية) بنجاح");
      setIsResetModalOpen(false);
      fetchTransactions();
    }
    setIsResetting(false);
  };

  const totalCapital = transactions.filter(t => t.type === "capital").reduce((sum, t) => sum + Number(t.amount), 0);
  const totalIncome = transactions.filter(t => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
  
  const currentBalance = totalCapital + totalIncome + vaultProfit - totalExpense;

  const getBadgeForType = (txType: string) => {
    switch (txType) {
      case "capital": return <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200">إيداع رأس مال</Badge>;
      case "income": return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">إيرادات</Badge>;
      case "expense": return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">مصروفات</Badge>;
      default: return <Badge>{txType}</Badge>;
    }
  };

  const renderDescription = (desc: string) => {
    if (!desc) return "-";
    const match = desc.match(/للطلب #([a-f0-9\-]+)/);
    if (match) {
      const orderId = match[1];
      const parts = desc.split(match[0]);
      return (
        <span>
          {parts[0]}للطلب #<Link href={`/dashboard/orders?search=${orderId}`} className="text-indigo-600 hover:underline">{orderId.substring(0,8)}...</Link>{parts[1]}
        </span>
      );
    }
    return desc;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">الخزنة</h2>
          <p className="text-sm text-gray-500 mt-1">إدارة رأس المال، المصروفات، والإيرادات</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            onClick={() => setIsResetModalOpen(true)} 
            variant="outline" 
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10"
          >
            <RefreshCcw className="w-4 h-4 ml-2" />
            تصفير الخزنة
          </Button>
          <Button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 ml-2" />
            إضافة حركة جديدة
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Balance Card */}
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 dark:bg-indigo-500/10 rounded-full blur-2xl" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الرصيد الحالي للخزنة</p>
              <h3 className="text-3xl font-black text-gray-900 dark:text-white">
                {currentBalance.toLocaleString()} <span className="text-sm text-gray-500 font-normal">ج.م</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Profit Card */}
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">أرباح الطلبات</p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                {vaultProfit.toLocaleString()} <span className="text-sm text-gray-500 font-normal">ج.م</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Capital Card */}
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إجمالي رأس المال</p>
              <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {totalCapital.toLocaleString()} <span className="text-sm text-gray-500 font-normal">ج.م</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-white/[0.03] flex items-center justify-center text-indigo-500">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Income Card */}
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إجمالي الإيرادات المضافة</p>
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-500">
                {totalIncome.toLocaleString()} <span className="text-sm text-gray-500 font-normal">ج.م</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Expense Card */}
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إجمالي المصروفات</p>
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-500">
                {totalExpense.toLocaleString()} <span className="text-sm text-gray-500 font-normal">ج.م</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-white/[0.06]">
          <h3 className="font-semibold text-gray-900 dark:text-white">سجل حركات الخزنة</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">نوع الحركة</TableHead>
              <TableHead className="text-right">التصنيف</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">ملاحظات / بيان</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-gray-500">جاري التحميل...</TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-gray-500">لا توجد حركات في الخزنة حتى الآن</TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span dir="ltr">{format(new Date(tx.transaction_date || tx.created_at), 'dd MMM yyyy, hh:mm a', { locale: ar })}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getBadgeForType(tx.type)}</TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">{tx.category || "-"}</TableCell>
                  <TableCell className="font-bold">
                    <span className={tx.type === 'expense' ? 'text-red-600' : 'text-green-600'}>
                      {tx.type === 'expense' ? '-' : '+'}{Number(tx.amount).toLocaleString()} ج.م
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{renderDescription(tx.description)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حركة للخزنة</DialogTitle>
            <DialogDescription>
              قم بتسجيل حركة مالية جديدة سواء كانت إيداع رأس مال، أو مصروفات.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleAddTransaction} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="type">نوع الحركة</Label>
              <Select value={type} onValueChange={(val: any) => setType(val)}>
                <SelectTrigger id="type" className="text-right">
                  <SelectValue placeholder="اختر نوع الحركة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="capital">إيداع رأس مال (Capital)</SelectItem>
                  <SelectItem value="income">إيرادات أخرى (Income)</SelectItem>
                  <SelectItem value="expense">مصروفات (Expense)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">المبلغ (ج.م)</Label>
              <Input 
                id="amount" 
                type="number" 
                min="0"
                step="0.01"
                placeholder="0.00" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">التصنيف</Label>
              <Input 
                id="category" 
                placeholder={type === 'expense' ? 'مثال: إيجار، فواتير كهرباء، رواتب...' : 'مثال: تمويل من شريك، مبيعات خارجية...'}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">ملاحظات (اختياري)</Label>
              <Textarea 
                id="description" 
                placeholder="تفاصيل إضافية عن هذه الحركة..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-right resize-none h-20"
              />
            </div>

            <DialogFooter className="pt-4 sm:justify-start">
              <Button 
                type="submit" 
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? "جاري الحفظ..." : "حفظ الحركة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-red-600">تصفير الخزنة</DialogTitle>
            <DialogDescription>
              هل أنت متأكد أنك تريد حذف جميع حركات الخزنة (الإيداعات والمصروفات)؟ 
              هذا الإجراء لا يمكن التراجع عنه وسيتم مسح السجل بالكامل.
              <br/><br/>
              <span className="font-semibold text-amber-600">ملاحظة:</span> أرباح الطلبات ستبقى كما هي لأنها تستمد قيمتها من الطلبات المدفوعة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 sm:justify-start gap-2 flex-row-reverse sm:flex-row">
            <Button 
              variant="destructive"
              onClick={handleResetTreasury}
              disabled={isResetting}
            >
              {isResetting ? "جاري التصفير..." : "نعم، قم بالتصفير"}
            </Button>
            <Button 
              variant="outline"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
