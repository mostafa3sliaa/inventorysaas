"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Search, User, TrendingDown, TrendingUp, Users, ArrowUpRight, ArrowDownRight, UserPlus, Wallet } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/components/shared/TenantProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Link from "next/link";

export default function SuppliersPage() {
  const { tenant } = useTenant();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  const supabase = createClient();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("created_at", { ascending: false });
      
    if (error) {
      toast.error("فشل في تحميل الموردين");
    } else {
      setSuppliers(data || []);
    }
    setLoading(false);
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    
    setIsSubmitting(true);
    const { error } = await supabase.from("suppliers").insert({
      tenant_id: tenant.id,
      name,
      phone,
      balance: 0
    });
    
    if (error) {
      toast.error("فشل في إضافة المورد: " + error.message);
    } else {
      toast.success("تمت إضافة المورد بنجاح!");
      setIsOpen(false);
      setName("");
      setPhone("");
      fetchSuppliers();
    }
    setIsSubmitting(false);
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.phone && s.phone.includes(searchQuery))
  );

  // Calculations for Summary
  const totalSuppliers = suppliers.length;
  const netBalance = suppliers.reduce((acc, s) => acc + Number(s.balance), 0);
  const totalOwedToUs = suppliers.filter(s => Number(s.balance) < 0).reduce((acc, s) => acc + Math.abs(Number(s.balance)), 0);
  const totalWeOwe = suppliers.filter(s => Number(s.balance) > 0).reduce((acc, s) => acc + Number(s.balance), 0);
  
  const isNetWeOwe = netBalance > 0;
  const isNetOwedToUs = netBalance < 0;

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">الموردين</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">إدارة حسابات الموردين والأرصدة المستحقة</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger render={
            <Button className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              <span className="font-bold text-md">إضافة مورد جديد</span>
            </Button>
          } />
          <DialogContent className="sm:max-w-[425px] rounded-3xl max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-gray-900">مورد جديد</DialogTitle>
              <DialogDescription className="text-md">
                أدخل بيانات المورد لبدء تسجيل المعاملات معه.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSupplier}>
              <div className="grid gap-5 py-6">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-sm font-bold text-gray-700">اسم المورد</Label>
                  <Input 
                    id="name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 rounded-xl border-gray-200 focus-visible:ring-indigo-500 bg-gray-50/50"
                    placeholder="مثال: شركة النور للتجارة"
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone" className="text-sm font-bold text-gray-700">رقم الهاتف (اختياري)</Label>
                  <Input 
                    id="phone" 
                    dir="ltr"
                    className="h-12 rounded-xl text-right border-gray-200 focus-visible:ring-indigo-500 bg-gray-50/50"
                    value={phone}
                    placeholder="01xxxxxxxxx"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl text-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all">
                  {isSubmitting ? "جاري الإضافة..." : "حفظ المورد"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Suppliers */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="absolute -left-6 -top-6 text-gray-50 opacity-50 rotate-12">
            <Users className="w-32 h-32" />
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 flex items-center justify-center shrink-0 relative z-10">
            <Users className="w-7 h-7" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-bold text-gray-500 mb-1">إجمالي الموردين</p>
            <h3 className="text-3xl font-black text-gray-900">{totalSuppliers}</h3>
          </div>
        </div>

        {/* Total Owed To Us (لينا) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="absolute -left-6 -top-6 opacity-50 rotate-12 text-green-50">
            <TrendingUp className="w-32 h-32" />
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 relative z-10 bg-green-50 text-green-600">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center w-full mb-1">
              <p className="text-sm font-bold text-green-600/80">إجمالي مستحقات لينا</p>
            </div>
            <h3 className="text-2xl font-black text-green-700" dir="ltr">
              +{totalOwedToUs.toLocaleString()} <span className="text-xs text-gray-500 font-bold">ج.م</span>
            </h3>
          </div>
        </div>

        {/* Total We Owe (علينا) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="absolute -left-6 -top-6 opacity-50 -rotate-12 text-red-50">
            <TrendingDown className="w-32 h-32" />
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 relative z-10 bg-red-50 text-red-600">
            <TrendingDown className="w-7 h-7" />
          </div>
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center w-full mb-1">
              <p className="text-sm font-bold text-red-600/80">إجمالي ديون علينا</p>
            </div>
            <h3 className="text-2xl font-black text-red-700" dir="ltr">
              -{totalWeOwe.toLocaleString()} <span className="text-xs text-gray-500 font-bold">ج.م</span>
            </h3>
          </div>
        </div>

        {/* Net Balance */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className={`absolute -left-6 -top-6 opacity-50 ${isNetWeOwe ? "-rotate-12 text-red-50" : "rotate-12 text-green-50"}`}>
            <Wallet className="w-32 h-32" />
          </div>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 relative z-10 ${
            isNetWeOwe ? "bg-red-50 text-red-600" : 
            isNetOwedToUs ? "bg-green-50 text-green-600" : 
            "bg-gray-50 text-gray-600"
          }`}>
            <Wallet className="w-7 h-7" />
          </div>
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center w-full mb-1">
              <p className={`text-sm font-bold ${
                isNetWeOwe ? "text-red-600/80" : 
                isNetOwedToUs ? "text-green-600/80" : 
                "text-gray-500"
              }`}>الرصيد الصافي</p>
              <span className={`text-[10px] px-2 py-1 rounded-full font-bold border ${
                isNetWeOwe ? "bg-red-50 text-red-700 border-red-100" : 
                isNetOwedToUs ? "bg-green-50 text-green-700 border-green-100" : 
                "bg-gray-50 text-gray-600 border-gray-200"
              }`}>
                {isNetWeOwe ? "علينا" : isNetOwedToUs ? "لينا" : "مُصفّر"}
              </span>
            </div>
            <h3 className={`text-2xl font-black ${
              isNetWeOwe ? "text-red-700" : 
              isNetOwedToUs ? "text-green-700" : 
              "text-gray-900"
            }`} dir="ltr">
              {isNetOwedToUs ? "+" : isNetWeOwe ? "-" : ""}
              {Math.abs(netBalance).toLocaleString()} <span className="text-xs text-gray-500 font-bold">ج.م</span>
            </h3>
          </div>
        </div>
      </div>

      {/* Search & List Section */}
      <div className="bg-white border border-gray-100 rounded-3xl p-2 shadow-sm">
        <div className="p-4 border-b border-gray-50 mb-4 flex justify-between items-center bg-gray-50/50 rounded-t-[22px]">
          <h3 className="font-bold text-gray-800 text-lg">قائمة الموردين</h3>
          <div className="relative w-full max-w-xs">
            <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
            <Input 
              placeholder="ابحث بالاسم أو الهاتف..." 
              className="pr-10 h-10 bg-white border-white shadow-sm focus-visible:ring-indigo-500 rounded-xl text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4 text-gray-400">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="font-medium text-lg">جاري تحميل الموردين...</span>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center gap-3 text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                <User className="w-16 h-16 opacity-30 text-gray-500" />
                <span className="font-bold text-xl text-gray-600">لا يوجد موردين مضافين أو مطابقين للبحث</span>
              </div>
            ) : (
              filteredSuppliers.map((supplier) => {
                const balance = Number(supplier.balance);
                const isWeOwe = balance > 0;
                const isOwedToUs = balance < 0;

                return (
                  <Link key={supplier.id} href={`/dashboard/suppliers/${supplier.id}`} className="block outline-none group">
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col h-full">
                      
                      {/* Top Badge */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 group-hover:scale-110 transition-transform duration-300">
                          <User className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                          isWeOwe ? "bg-red-50 text-red-600 border-red-100" : 
                          isOwedToUs ? "bg-green-50 text-green-600 border-green-100" : 
                          "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>
                          {isWeOwe ? "علينا" : isOwedToUs ? "لينا" : "مُصفّر"}
                        </div>
                      </div>

                      {/* Supplier Info */}
                      <div className="mb-6 flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors line-clamp-1">{supplier.name}</h3>
                        <p className="text-sm text-gray-400 font-medium" dir="ltr">{supplier.phone || "بدون رقم هاتف"}</p>
                      </div>

                      {/* Balance Area */}
                      <div className={`p-4 rounded-xl border flex flex-col items-end ${
                        isWeOwe ? "bg-red-50/50 border-red-100" : 
                        isOwedToUs ? "bg-green-50/50 border-green-100" : 
                        "bg-gray-50 border-gray-100"
                      }`}>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">الرصيد الإجمالي</div>
                        <div dir="ltr" className={`text-xl font-black ${
                          isWeOwe ? "text-red-700" : 
                          isOwedToUs ? "text-green-700" : 
                          "text-gray-700"
                        }`}>
                          {isOwedToUs ? "+" : isWeOwe ? "-" : ""}
                          {Math.abs(balance).toLocaleString()} <span className="text-xs font-bold">ج.م</span>
                        </div>
                      </div>

                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
