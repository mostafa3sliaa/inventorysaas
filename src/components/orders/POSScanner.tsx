"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Search, Trash2, Printer, Download, Save } from "lucide-react";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/components/shared/TenantProvider";
import * as XLSX from "xlsx";

export function POSScanner({ onOrderCreated }: { onOrderCreated?: () => void }) {
  const { tenant } = useTenant();
  const supabase = createClient();
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [scanCode, setScanCode] = useState("");
  const [cart, setCart] = useState<any[]>([]);
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    governorate: "",
    address: ""
  });
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchProducts();
    // Auto focus scanner on load
    if (scannerInputRef.current) {
      scannerInputRef.current.focus();
    }
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id, name,
        product_variants (id, size, color, selling_price, stock_quantity, sku, barcode)
      `);
    if (!error && data) {
      setProducts(data);
    }
  };

  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = scanCode.trim();
      if (!code) return;

      // Find product variant by SKU or Barcode
      let foundVariant = null;
      let foundProduct = null;

      for (const prod of products) {
        const variant = prod.product_variants.find(
          (v: any) => (v.sku && v.sku.toLowerCase() === code.toLowerCase()) || 
                      (v.barcode && v.barcode.toLowerCase() === code.toLowerCase())
        );
        if (variant) {
          foundVariant = variant;
          foundProduct = prod;
          break;
        }
      }

      if (foundVariant && foundProduct) {
        // Add to cart
        setCart(prev => {
          const existing = prev.find(item => item.variantId === foundVariant.id);
          if (existing) {
            return prev.map(item => 
              item.variantId === foundVariant.id 
                ? { ...item, quantity: item.quantity + 1 }
                : item
            );
          }
          return [...prev, {
            variantId: foundVariant.id,
            productId: foundProduct.id,
            productName: foundProduct.name,
            variantName: [foundVariant.size, foundVariant.color].filter(c => c && c !== "-").join(" / ") || "أساسي",
            price: foundVariant.selling_price || 0,
            quantity: 1,
            maxStock: foundVariant.stock_quantity
          }];
        });
        toast.success(`تم إضافة: ${foundProduct.name}`);
      } else {
        toast.error("لم يتم العثور على المنتج بهذا الكود");
      }

      setScanCode("");
    }
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity < 1) return;
    setCart(prev => prev.map(item => 
      item.variantId === variantId ? { ...item, quantity } : item
    ));
  };

  const removeItem = (variantId: string) => {
    setCart(prev => prev.filter(item => item.variantId !== variantId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const grandTotal = cartTotal + shippingFee;

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      toast.error("السلة فارغة!");
      return;
    }
    if (!customer.name || !customer.phone) {
      toast.error("يرجى إدخال اسم ورقم هاتف العميل");
      return;
    }
    if (!tenant) return;

    setIsSubmitting(true);
    try {
      // 1. Create Customer
      const { data: custData, error: custError } = await supabase
        .from("customers")
        .insert([{
          tenant_id: tenant.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          governorate: customer.governorate,
        }])
        .select()
        .single();

      if (custError) throw custError;

      // 2. Create Order
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([{
          tenant_id: tenant.id,
          customer_id: custData.id,
          total_amount: grandTotal,
          shipping_fee: shippingFee,
          status: "pending",
          source: "POS / Scanner",
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // 3. Create Order Items and Update Stock
      for (const item of cart) {
        await supabase
          .from("order_items")
          .insert([{
            tenant_id: tenant.id,
            order_id: orderData.id,
            product_id: item.productId,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.price * item.quantity
          }]);

        // Reduce stock
        await supabase.rpc('decrement_stock', {
          p_variant_id: item.variantId,
          p_quantity: item.quantity
        });
      }

      toast.success("تم إنشاء الطلب بنجاح!");
      setCart([]);
      setCustomer({ name: "", phone: "", governorate: "", address: "" });
      setShippingFee(0);
      if (onOrderCreated) onOrderCreated();

      // Refocus scanner
      setTimeout(() => {
        if (scannerInputRef.current) scannerInputRef.current.focus();
      }, 100);

    } catch (err: any) {
      toast.error("حدث خطأ أثناء إنشاء الطلب: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    if (cart.length === 0) {
      toast.error("لا توجد منتجات للتصدير");
      return;
    }
    const dataToExport = cart.map((item, index) => ({
      "م": index + 1,
      "المنتج": item.productName,
      "التنويعة": item.variantName,
      "الكمية": item.quantity,
      "السعر": item.price,
      "الإجمالي": item.price * item.quantity
    }));

    // Add customer info at the end
    dataToExport.push({
      "م": "---" as any,
      "المنتج": `العميل: ${customer.name}`,
      "التنويعة": `هاتف: ${customer.phone}`,
      "الكمية": `المحافظة: ${customer.governorate}` as any,
      "السعر": ("الشحن: " + shippingFee) as any,
      "الإجمالي": ("الإجمالي: " + grandTotal) as any
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "فاتورة");
    XLSX.writeFile(workbook, `فاتورة_نقاط_البيع_${new Date().getTime()}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Scanner Section */}
      <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <Label className="text-gray-900 dark:text-gray-200 text-lg font-bold">ضرب باركود المنتج / الكود (SKU)</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                ref={scannerInputRef}
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={handleScan}
                placeholder="امسح الباركود أو اكتب الكود هنا واضغط Enter..."
                className="pl-3 pr-10 h-14 text-lg font-mono bg-gray-50 focus:bg-white dark:bg-[#0F172A] border-2 border-indigo-200 dark:border-indigo-500/30 focus-visible:ring-indigo-500 rounded-xl"
              />
            </div>
            <p className="text-xs text-gray-500">يقوم المسدس تلقائياً بالضغط على Enter بعد قراءة الباركود</p>
          </div>
        </div>
      </div>

      {/* Cart & Customer Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cart Table (takes 2 columns) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm flex flex-col print:border-none print:shadow-none print:p-0">
          <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white border-b pb-2 print:hidden">المنتجات في الفاتورة</h3>
          <h3 className="hidden print:block font-bold text-2xl text-center mb-6">فاتورة مبيعات</h3>
          
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المنتج</TableHead>
                  <TableHead className="text-center w-24">الكمية</TableHead>
                  <TableHead className="text-center">السعر</TableHead>
                  <TableHead className="text-center">الإجمالي</TableHead>
                  <TableHead className="w-12 print:hidden"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 h-32">
                      <Package className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      لم يتم مسح أي منتجات بعد
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map((item) => (
                    <TableRow key={item.variantId}>
                      <TableCell>
                        <div className="font-bold text-gray-900">{item.productName}</div>
                        <div className="text-xs text-gray-500">{item.variantName}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input 
                          type="number" 
                          min={1} 
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.variantId, parseInt(e.target.value) || 1)}
                          className="w-full text-center font-bold h-8 print:border-none print:p-0 print:bg-transparent"
                        />
                      </TableCell>
                      <TableCell className="text-center font-semibold">{item.price} ج.م</TableCell>
                      <TableCell className="text-center font-bold text-indigo-600 dark:text-indigo-400">
                        {item.price * item.quantity} ج.م
                      </TableCell>
                      <TableCell className="print:hidden">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeItem(item.variantId)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Customer & Checkout (takes 1 column) */}
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm space-y-6">
          <div className="print:hidden">
            <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white border-b pb-2">بيانات العميل</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} placeholder="اسم العميل" />
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف</Label>
                <Input value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} placeholder="01XXXXXXXXX" />
              </div>
              <div className="space-y-2">
                <Label>المحافظة</Label>
                <Input value={customer.governorate} onChange={e => setCustomer({...customer, governorate: e.target.value})} placeholder="مثال: القاهرة" />
              </div>
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Input value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})} placeholder="العنوان التفصيلي" />
              </div>
            </div>
          </div>

          <div className="hidden print:block mb-8">
            <h4 className="font-bold border-b pb-1 mb-2">بيانات العميل</h4>
            <p><strong>الاسم:</strong> {customer.name || "---"}</p>
            <p><strong>الهاتف:</strong> {customer.phone || "---"}</p>
            <p><strong>العنوان:</strong> {customer.governorate} - {customer.address}</p>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between text-gray-500">
              <span>إجمالي المنتجات:</span>
              <span className="font-bold">{cartTotal} ج.م</span>
            </div>
            <div className="flex justify-between items-center print:hidden">
              <span className="text-gray-500">مصاريف الشحن:</span>
              <Input 
                type="number" 
                value={shippingFee || ""} 
                onChange={(e) => setShippingFee(parseFloat(e.target.value) || 0)} 
                className="w-24 text-center h-8"
              />
            </div>
            <div className="hidden print:flex justify-between text-gray-500">
              <span>مصاريف الشحن:</span>
              <span className="font-bold">{shippingFee} ج.م</span>
            </div>
            <div className="flex justify-between text-xl font-black text-gray-900 dark:text-white pt-2 border-t">
              <span>الإجمالي النهائي:</span>
              <span className="text-indigo-600 dark:text-indigo-400">{grandTotal} ج.م</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-4 print:hidden">
            <Button 
              variant="outline" 
              className="w-full text-green-700 bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-500/10 dark:border-green-500/20"
              onClick={handleExportExcel}
            >
              <Download className="w-4 h-4 mr-2" />
              إكسيل
            </Button>
            <Button 
              variant="outline" 
              className="w-full text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 mr-2" />
              طباعة
            </Button>
            <Button 
              className="col-span-2 w-full h-12 text-lg font-bold bg-indigo-600 hover:bg-indigo-700"
              onClick={handleCreateOrder}
              disabled={isSubmitting || cart.length === 0}
            >
              <Save className="w-5 h-5 mr-2" />
              {isSubmitting ? "جاري الحفظ..." : "تأكيد وإنشاء الطلب"}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
