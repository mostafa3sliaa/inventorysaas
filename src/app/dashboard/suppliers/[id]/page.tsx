"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plus, MinusCircle, Wallet, User, Search, FileText, X, Trash2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/components/shared/TenantProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SupplierDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const supplierId = params.id as string;
  const { tenant } = useTenant();
  
  const [supplier, setSupplier] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Transaction Modal State
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  
  const [purchaseItems, setPurchaseItems] = useState<any[]>([
    { productName: "", variantName: "", quantity: "", unitCost: "" }
  ]);
  const [returnItems, setReturnItems] = useState<any[]>([
    { variantId: "", quantity: "", unitCost: "" }
  ]);
  const [paidAmount, setPaidAmount] = useState("");

  // Number Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (supplierId) {
      fetchSupplierData();
    }
  }, [supplierId]);

  const fetchSupplierData = async () => {
    setLoading(true);
    
    // Fetch supplier info
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .single();
      
    if (supplierData) {
      setSupplier(supplierData);
    }

    // Fetch transactions (purchases)
    const { data: transData } = await supabase
      .from("purchases")
      .select(`
        *,
        purchase_items (
          id, quantity, unit_cost, product_variants ( size, products ( name ) )
        )
      `)
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false });

    if (transData) {
      setTransactions(transData);
    }

    // Fetch products and variants
    const { data: prodData } = await supabase
      .from("products")
      .select(`*, product_variants (*)`);
      
    if (prodData) {
      setProducts(prodData);
    }
    
    setLoading(false);
  };

  const addPurchaseItem = () => {
    setPurchaseItems([...purchaseItems, { productName: "", variantName: "", quantity: "", unitCost: "" }]);
  };

  const removePurchaseItem = (index: number) => {
    const newItems = [...purchaseItems];
    newItems.splice(index, 1);
    setPurchaseItems(newItems);
  };

  const addReturnItem = () => {
    setReturnItems([...returnItems, { variantId: "", quantity: "", unitCost: "" }]);
  };

  const removeReturnItem = (index: number) => {
    const newItems = [...returnItems];
    newItems.splice(index, 1);
    setReturnItems(newItems);
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...purchaseItems];
    newItems[index][field] = value;
    
    // Try to auto-fill unitCost if product name matches existing
    if (field === "productName") {
      const existingProduct = products.find(p => p.name.trim().toLowerCase() === value.trim().toLowerCase());
      if (existingProduct && existingProduct.product_variants?.length > 0 && !newItems[index].unitCost) {
        newItems[index].unitCost = existingProduct.product_variants[0].normal_cost?.toString() || "0";
      }
    }

    setPurchaseItems(newItems);
  };

  const handleReturnItemChange = (index: number, field: string, value: string) => {
    const newItems = [...returnItems];
    newItems[index][field] = value;
    
    // Auto-fill unitCost when selecting a product from inventory
    if (field === "variantId") {
      const selectedVariant = allVariants.find(v => v.id === value);
      if (selectedVariant) {
        newItems[index].unitCost = selectedVariant.cost?.toString() || "0";
      }
    }
    
    setReturnItems(newItems);
  };

  const calculatedInvoiceAmount = purchaseItems.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitCost) || 0), 0);
  const calculatedInvoiceQty = purchaseItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  const calculatedReturnAmount = returnItems.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitCost) || 0), 0);
  const calculatedReturnQty = returnItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  // Flatten variants for the select dropdown
  const allVariants = products.flatMap(p => 
    (p.product_variants || []).map((v: any) => ({
      id: v.id,
      productName: p.name,
      variantName: v.size,
      cost: v.normal_cost
    }))
  );

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !supplier) return;
    setIsSubmitting(true);

    const paidAmt = Number(paidAmount) || 0;

    if (calculatedInvoiceAmount === 0 && calculatedReturnAmount === 0 && paidAmt === 0) {
      toast.error("يجب إدخال قيمة في حقل واحد على الأقل");
      setIsSubmitting(false);
      return;
    }

    let totalBalanceChange = 0;
    const transactionTimestamp = new Date().toISOString();
    
    // 1. Purchase (Invoice)
    if (calculatedInvoiceAmount > 0) {
      const validItems = purchaseItems.filter(i => i.productName.trim() !== "" && Number(i.quantity) > 0);
      if (validItems.length === 0) {
        toast.error("الرجاء إدخال اسم المنتج والكمية للمشتريات بشكل صحيح");
        setIsSubmitting(false);
        return;
      }

      const { data: purchaseData, error: purchaseError } = await supabase.from("purchases").insert({
        tenant_id: tenant.id, 
        supplier_id: supplier.id,
        total_amount: calculatedInvoiceAmount, 
        paid_amount: 0, 
        status: "completed",
        type: "invoice", 
        quantity: calculatedInvoiceQty, 
        created_at: transactionTimestamp
      }).select().single();

      if (purchaseError) {
        toast.error("فشل في حفظ الفاتورة: " + purchaseError.message);
      } else if (purchaseData) {
        const itemsToInsert = [];
        for (const i of validItems) {
          let productId = null;
          let variantId = null;
          const pName = i.productName.trim();
          const vName = i.variantName.trim() || "-";

          const existingProduct = products.find(p => p.name.trim().toLowerCase() === pName.toLowerCase());
          if (existingProduct) {
            productId = existingProduct.id;
          } else {
            const { data: newProd } = await supabase.from("products").insert({
              tenant_id: tenant.id, name: pName, category: "عام"
            }).select().single();
            if (newProd) productId = newProd.id;
          }

          if (productId) {
            const { data: existingVariant } = await supabase.from("product_variants")
              .select("id").eq("product_id", productId).eq("size", vName).limit(1).single();

            if (existingVariant) {
              variantId = existingVariant.id;
            } else {
              const { data: newVar } = await supabase.from("product_variants").insert({
                product_id: productId, size: vName, color: "-", normal_cost: Number(i.unitCost)
              }).select().single();
              if (newVar) variantId = newVar.id;
            }
          }

          if (variantId) {
            itemsToInsert.push({
              purchase_id: purchaseData.id,
              product_variant_id: variantId,
              quantity: Number(i.quantity),
              unit_cost: Number(i.unitCost)
            });
          }
        }

        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase.from("purchase_items").insert(itemsToInsert);
          if (itemsError) {
            toast.error("فشل حفظ تفاصيل المشتريات: " + itemsError.message);
          } else {
            // Update the Base Stock Level (baseline_stock) for each variant
            // so the 20% alert is calculated based on the new total capacity
            for (const item of itemsToInsert) {
              const { data: v } = await supabase.from("product_variants").select("stock_quantity").eq("id", item.product_variant_id).single();
              if (v) {
                // The DB trigger has already updated the stock_quantity, 
                // we set the base limit to this new high value
                await supabase.from("product_variants").update({ baseline_stock: v.stock_quantity }).eq("id", item.product_variant_id);
              }
            }
          }
        }
      }
      totalBalanceChange += calculatedInvoiceAmount;
    }

    // 2. Return 
    if (calculatedReturnAmount > 0) {
      const validReturns = returnItems.filter(i => i.variantId !== "" && Number(i.quantity) > 0);
      if (validReturns.length === 0) {
        toast.error("الرجاء تحديد المنتج المرتجع والكمية بشكل صحيح");
        setIsSubmitting(false);
        return;
      }

      const { data: returnData, error: returnError } = await supabase.from("purchases").insert({
        tenant_id: tenant.id, 
        supplier_id: supplier.id,
        total_amount: -calculatedReturnAmount, 
        paid_amount: 0, 
        status: "completed",
        type: "return", 
        quantity: -calculatedReturnQty, 
        created_at: transactionTimestamp
      }).select().single();

      if (returnError) {
        toast.error("فشل في حفظ المرتجع: " + returnError.message);
      } else if (returnData) {
        const itemsToInsert = validReturns.map(i => ({
          purchase_id: returnData.id,
          product_variant_id: i.variantId,
          quantity: -Number(i.quantity), // Negative qty deducts from inventory
          unit_cost: Number(i.unitCost)
        }));

        const { error: itemsError } = await supabase.from("purchase_items").insert(itemsToInsert);
        if (itemsError) toast.error("فشل في تحديث المخزون للمرتجع: " + itemsError.message);
      }
      totalBalanceChange -= calculatedReturnAmount;
    }

    // 3. Payment
    if (paidAmt > 0) {
      await supabase.from("purchases").insert({
        tenant_id: tenant.id, supplier_id: supplier.id,
        total_amount: -paidAmt, paid_amount: paidAmt, status: "completed",
        type: "payment", quantity: 0, created_at: transactionTimestamp
      });
      
      await supabase.from("transactions").insert({
        tenant_id: tenant.id,
        type: "expense",
        amount: paidAmt,
        category: "مدفوعات موردين",
        description: `دفعة للمورد: ${supplier.name}`,
        transaction_date: transactionTimestamp
      });

      totalBalanceChange -= paidAmt;
    }

    // Update Supplier Balance
    const newBalance = Number(supplier.balance) + totalBalanceChange;
    const { error: updateError } = await supabase
      .from("suppliers")
      .update({ balance: newBalance })
      .eq("id", supplier.id);

    if (updateError) {
      toast.error("تم حفظ العمليات لكن فشل تحديث الرصيد");
    } else {
      toast.success("تم تسجيل العملية بنجاح! تم تحديث المخزون وحساب المورد.");
      setInvoiceOpen(false);
      setPurchaseItems([{ productName: "", variantName: "", quantity: "", unitCost: "" }]);
      setReturnItems([{ variantId: "", quantity: "", unitCost: "" }]);
      setPaidAmount("");
      fetchSupplierData();
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-lg font-bold text-gray-500">جاري تحميل بيانات المورد...</div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <User className="w-16 h-16 text-red-200" />
        <div className="text-xl font-bold text-red-500">لم يتم العثور على المورد!</div>
        <Button variant="outline" onClick={() => router.push("/dashboard/suppliers")}>العودة لقائمة الموردين</Button>
      </div>
    );
  }

  const balance = Number(supplier.balance);
  const isWeOwe = balance > 0;
  const isOwedToUs = balance < 0;

  const groupedObj: Record<string, any> = {};
  
  transactions.forEach(tx => {
    const txTime = new Date(tx.created_at).getTime();
    
    let groupKey = Object.keys(groupedObj).find(key => {
      return Math.abs(Number(key) - txTime) < 2000;
    });

    if (!groupKey) {
      groupKey = txTime.toString();
      groupedObj[groupKey] = {
        timestamp: tx.created_at,
        invoiceAmount: 0,
        invoiceQty: 0,
        returnAmount: 0,
        returnQty: 0,
        paidAmount: 0,
        items: [],
      };
    }

    if (tx.purchase_items && tx.purchase_items.length > 0) {
      groupedObj[groupKey].items.push(...tx.purchase_items.map((item: any) => ({ ...item, type: tx.type })));
    }

    if (tx.type === "invoice" || (tx.type !== "payment" && tx.type !== "return" && tx.total_amount > 0)) {
      groupedObj[groupKey].invoiceAmount += Math.abs(tx.total_amount);
      groupedObj[groupKey].invoiceQty += Math.abs(tx.quantity || 0);
    } else if (tx.type === "return" || (tx.type !== "payment" && tx.total_amount < 0)) {
      groupedObj[groupKey].returnAmount += Math.abs(tx.total_amount);
      groupedObj[groupKey].returnQty += Math.abs(tx.quantity || 0);
    } else if (tx.type === "payment") {
      groupedObj[groupKey].paidAmount += Math.abs(tx.total_amount);
    }
  });

  const groupedTransactions = Object.values(groupedObj).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredGroups = groupedTransactions.filter(group => {
    if (filterDate) {
      const formattedGroupDate = new Date(group.timestamp).toLocaleDateString("en-GB", { year: 'numeric', month: '2-digit', day: '2-digit' });
      if (!formattedGroupDate.includes(filterDate.trim())) {
        return false;
      }
    }

    if (!searchQuery) return true;
    const q = searchQuery.trim();
    return (
      group.invoiceAmount.toString().includes(q) ||
      group.invoiceQty.toString().includes(q) ||
      group.returnAmount.toString().includes(q) ||
      group.returnQty.toString().includes(q) ||
      group.paidAmount.toString().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20 -m-6 sm:-m-8">
      
      {/* Top Header Card */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-6 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          
          {/* Supplier Info */}
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="shrink-0 h-10 w-10 rounded-full border-gray-200 hover:bg-gray-100 transition-all shadow-sm" onClick={() => router.push("/dashboard/suppliers")}>
              <ArrowRight className="w-4 h-4 text-gray-700" />
            </Button>
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">{supplier.name}</h1>
              <p className="text-sm text-gray-500 font-medium mt-0.5" dir="ltr">{supplier.phone || "بدون رقم هاتف"}</p>
            </div>
          </div>

          {/* Balance & Action */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className={`flex flex-col justify-center px-4 py-2 rounded-2xl border ${
              isWeOwe ? "bg-red-50/50 border-red-100" : 
              isOwedToUs ? "bg-green-50/50 border-green-100" : 
              "bg-gray-50 border-gray-100"
            }`}>
              <span className={`text-[11px] font-bold uppercase mb-0.5 ${
                isWeOwe ? "text-red-600" : isOwedToUs ? "text-green-600" : "text-gray-500"
              }`}>
                {isWeOwe ? "علينا (دين)" : isOwedToUs ? "لنا (مستحقات)" : "الرصيد"}
              </span>
              <div className="text-xl font-black leading-none" dir="ltr">
                <span className={isOwedToUs ? "text-green-700" : isWeOwe ? "text-red-700" : "text-gray-800"}>
                  {isOwedToUs ? "+" : isWeOwe ? "-" : ""}
                  {Math.abs(balance).toLocaleString()}
                </span>
                <span className="text-xs font-bold opacity-60 mr-1"> ج.م</span>
              </div>
            </div>

            <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
              <DialogTrigger render={
                <Button className="h-14 px-5 font-bold bg-gray-900 hover:bg-gray-800 text-white rounded-2xl shadow-sm transition-all flex items-center gap-2" />
              }>
                <Plus className="w-5 h-5" />
                <span>معاملة جديدة</span>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl rounded-3xl max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black text-gray-900">تسجيل فاتورة مشتريات أو معاملة</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddTransaction} className="mt-4">
                  <div className="grid gap-6 py-2 max-h-[70vh] overflow-y-auto px-2">
                    
                    {/* قسم المشتريات (Detailed) */}
                    <div className="space-y-4 p-5 border border-blue-100 bg-gradient-to-br from-blue-50/80 to-blue-50/30 rounded-3xl shadow-sm">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-blue-900 flex items-center gap-2 text-lg">
                          فاتورة المشتريات <span className="text-sm font-medium text-blue-600/80">(إضافة للمخزون)</span>
                        </h4>
                        <div className="text-left font-bold text-blue-900 text-lg" dir="ltr">
                          الإجمالي: {calculatedInvoiceAmount.toLocaleString()} <span className="text-sm">ج.م</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {purchaseItems.map((item, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-blue-100 relative">
                            <div className="flex-1 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">اسم المنتج</Label>
                              <Input 
                                type="text" className="h-10 text-sm" 
                                value={item.productName} onChange={e => handleItemChange(idx, "productName", e.target.value)}
                                placeholder="مثال: تيشيرت صيفي"
                              />
                            </div>
                            <div className="w-full sm:w-28 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">الصنف/النوع</Label>
                              <Input 
                                type="text" className="h-10 text-sm text-center" 
                                value={item.variantName} onChange={e => handleItemChange(idx, "variantName", e.target.value)}
                                placeholder="مثال: L"
                              />
                            </div>
                            <div className="w-full sm:w-20 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">الكمية</Label>
                              <Input 
                                type="number" min="1" dir="ltr" className="h-10 text-center" 
                                value={item.quantity} onChange={e => handleItemChange(idx, "quantity", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div className="w-full sm:w-24 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">السعر (ج.م)</Label>
                              <Input 
                                type="number" min="0" dir="ltr" className="h-10 text-center" 
                                value={item.unitCost} onChange={e => handleItemChange(idx, "unitCost", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div className="flex items-end justify-center pt-2 sm:pt-0">
                              <Button type="button" variant="ghost" size="icon" className="text-red-400 hover:text-red-600 hover:bg-red-50 h-10 w-10" onClick={() => removePurchaseItem(idx)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addPurchaseItem} className="w-full border-dashed text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-bold">
                          <Plus className="w-4 h-4 ml-2" />
                          إضافة منتج آخر للفاتورة
                        </Button>
                      </div>
                    </div>

                    {/* قسم المرتجعات */}
                    <div className="space-y-4 p-5 border border-red-100 bg-gradient-to-br from-red-50/80 to-red-50/30 rounded-3xl shadow-sm">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-red-900 flex items-center gap-2 text-lg">
                          المرتجعات الإجمالية <span className="text-sm font-medium text-red-600/80">(خصم من الديون)</span>
                        </h4>
                        <div className="text-left font-bold text-red-900 text-lg" dir="ltr">
                          الإجمالي: {calculatedReturnAmount.toLocaleString()} <span className="text-sm">ج.م</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {returnItems.map((item, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-red-100 relative">
                            <div className="flex-1 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">المنتج المرتجع (اختر من المخزون)</Label>
                              <select 
                                className="flex h-10 w-full items-center justify-between rounded-md border border-red-100 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                                value={item.variantId}
                                onChange={e => handleReturnItemChange(idx, "variantId", e.target.value)}
                              >
                                <option value="" disabled>-- اختر المنتج --</option>
                                {allVariants.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.productName} {v.variantName !== "-" ? `(${v.variantName})` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="w-full sm:w-20 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">الكمية</Label>
                              <Input 
                                type="number" min="1" dir="ltr" className="h-10 text-center border-red-100 focus-visible:ring-red-200" 
                                value={item.quantity} onChange={e => handleReturnItemChange(idx, "quantity", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div className="w-full sm:w-24 space-y-1">
                              <Label className="text-xs text-gray-500 font-bold">السعر (ج.م)</Label>
                              <Input 
                                type="number" min="0" dir="ltr" className="h-10 text-center border-red-100 focus-visible:ring-red-200" 
                                value={item.unitCost} onChange={e => handleReturnItemChange(idx, "unitCost", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div className="flex items-end justify-center pt-2 sm:pt-0">
                              <Button type="button" variant="ghost" size="icon" className="text-red-400 hover:text-red-600 hover:bg-red-50 h-10 w-10" onClick={() => removeReturnItem(idx)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addReturnItem} className="w-full border-dashed text-red-600 border-red-200 hover:bg-red-50 font-bold">
                          <Plus className="w-4 h-4 ml-2" />
                          إضافة منتج آخر للمرتجع
                        </Button>
                      </div>
                    </div>

                    {/* قسم السداد النقدي */}
                    <div className="space-y-4 p-5 border border-green-100 bg-gradient-to-br from-green-50/80 to-green-50/30 rounded-3xl shadow-sm">
                      <h4 className="font-bold text-green-900 flex items-center gap-2 text-lg">
                        سداد نقدي <span className="text-sm font-medium text-green-600/80">(دفع مبلغ للمورد)</span>
                      </h4>
                      <div className="space-y-2">
                        <Label htmlFor="paidAmount" className="text-sm font-bold text-gray-700">المبلغ المدفوع (ج.م)</Label>
                        <Input id="paidAmount" type="number" min="0" dir="ltr" className="h-12 rounded-xl text-lg font-bold bg-white border-green-100 focus-visible:ring-green-200" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                  </div>
                  <DialogFooter className="pt-4 border-t mt-4 border-gray-100 px-2">
                    <Button type="submit" disabled={isSubmitting} className="w-full h-14 rounded-2xl text-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all">
                      {isSubmitting ? "جاري الحفظ..." : "تأكيد وتسجيل العملية وتحديث المخزون"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Header of Ledger */}
          <div className="bg-gray-50/80 border-b border-gray-100 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg leading-tight">شيت المعاملات</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">{filteredGroups.length} معاملة شاملة مسجلة</p>
              </div>
            </div>

            {/* Number/Amount Filter and Date Filter */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm w-full sm:w-auto">
                <span className="text-xs font-bold text-gray-500 pr-1 shrink-0">التاريخ:</span>
                <Input 
                  type="text"
                  placeholder="مثال: 03/07/2026"
                  value={filterDate} 
                  onChange={e => setFilterDate(e.target.value)} 
                  className="h-9 text-sm rounded-xl border-gray-100 bg-gray-50 hover:bg-gray-100 focus-visible:ring-0 w-full sm:w-[150px]" 
                  title="ابحث بيوم محدد" 
                />
                {filterDate && (
                  <Button variant="ghost" size="icon" onClick={() => setFilterDate("")} className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0 ml-1">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm w-full sm:w-auto relative">
                <Search className="w-5 h-5 text-gray-400 absolute right-3" />
                <Input 
                  type="text" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="h-10 text-sm rounded-xl border-gray-100 bg-gray-50 hover:bg-gray-100 focus-visible:ring-0 w-full sm:w-[220px] pr-10" 
                  placeholder="ابحث برقم (مبلغ أو كمية)..." 
                />
              </div>
            </div>
          </div>

          {/* Transactions Sheet (Table) */}
          <div className="p-0 overflow-x-auto">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-20 bg-gray-50/50 flex flex-col items-center justify-center border-t border-gray-100">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-4">
                  <FileText className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="font-bold text-xl text-gray-700 mb-1">لا توجد معاملات مسجلة</h3>
                <p className="text-gray-400 font-medium max-w-sm">لم يتم تسجيل أي فواتير أو مرتجعات أو دفعات مالية تطابق بحثك.</p>
              </div>
            ) : (
              <Table className="min-w-[800px]">
                <TableHeader className="bg-gray-50/50">
                  <TableRow className="border-b-2 border-gray-200 hover:bg-transparent">
                    <TableHead className="text-right font-bold text-gray-500 w-[180px] py-4">التاريخ والوقت</TableHead>
                    <TableHead className="text-right font-bold text-gray-500 py-4">مبلغ الشراء</TableHead>
                    <TableHead className="text-right font-bold text-gray-500 py-4">عدد القطع</TableHead>
                    <TableHead className="text-right font-bold text-gray-500 py-4">مبلغ المرتجع</TableHead>
                    <TableHead className="text-right font-bold text-gray-500 py-4">المرتجع (عدد)</TableHead>
                    <TableHead className="text-right font-bold text-gray-500 py-4">السداد النقدي</TableHead>
                    <TableHead className="text-center font-bold text-gray-500 py-4">التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100">
                  {filteredGroups.map((group, idx) => (
                    <TableRow key={idx} className="hover:bg-indigo-50/30 transition-colors">
                      <TableCell className="font-medium align-middle py-4">
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-bold" dir="ltr">{new Date(group.timestamp).toLocaleDateString("en-GB", { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                          <span className="text-gray-400 text-xs mt-0.5" dir="ltr">{new Date(group.timestamp).toLocaleTimeString("en-US", {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        {group.invoiceAmount > 0 ? (
                          <span className="font-bold text-gray-900" dir="ltr">
                            {group.invoiceAmount.toLocaleString()} <span className="text-xs text-gray-400 font-normal">ج.م</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="align-middle">
                        {group.invoiceQty > 0 ? (
                          <span className="font-bold text-gray-700" dir="ltr">
                            {group.invoiceQty} <span className="text-xs text-gray-400 font-normal">قطعة</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="align-middle">
                        {group.returnAmount > 0 ? (
                          <span className="font-bold text-red-600" dir="ltr">
                            {group.returnAmount.toLocaleString()} <span className="text-xs text-red-400 font-normal">ج.م</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="align-middle">
                        {group.returnQty > 0 ? (
                          <span className="font-bold text-red-500" dir="ltr">
                            {group.returnQty} <span className="text-xs text-red-300 font-normal">قطعة</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="align-middle">
                        {group.paidAmount > 0 ? (
                          <span className="font-bold text-green-600" dir="ltr">
                            {group.paidAmount.toLocaleString()} <span className="text-xs text-green-500 font-normal">ج.م</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="align-middle text-center">
                        {group.items && group.items.length > 0 ? (
                          <Dialog>
                            <DialogTrigger render={<Button variant="ghost" size="icon" className="text-indigo-600 hover:bg-indigo-50" />}>
                              <FileText className="w-5 h-5" />
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
                              <DialogHeader>
                                <DialogTitle>تفاصيل المنتجات</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                                {group.items.map((item: any, i: number) => (
                                  <div key={i} className={`flex justify-between items-center p-3 text-sm rounded-lg border ${item.type === 'return' ? 'bg-red-50/50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold">{item.product_variants?.products?.name || "منتج محذوف"}</span>
                                        {item.type === 'return' && <span className="bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded-full font-bold">مرتجع</span>}
                                      </div>
                                      <p className="text-gray-500 text-xs mt-1">{item.product_variants?.size || "-"}</p>
                                    </div>
                                    <div className="text-left">
                                      <p dir="ltr">{Math.abs(item.quantity)} x {item.unit_cost} ج.م</p>
                                      <p className={`font-bold ${item.type === 'return' ? 'text-red-600' : 'text-blue-600'}`} dir="ltr">
                                        {(Math.abs(item.quantity) * item.unit_cost).toLocaleString()} ج.م
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
