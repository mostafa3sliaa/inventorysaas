"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function ExchangeModal({ open, onOpenChange, order, tenantId, allVariants, onSuccess }: any) {
  const [returnedItems, setReturnedItems] = useState<any[]>([]);
  const [newItems, setNewItems] = useState<any[]>([{ variantId: "", quantity: 1, unitPrice: "" }]);
  const [shippingFee, setShippingFee] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order && open) {
      setReturnedItems(order.order_items
        .filter((item: any) => item.quantity > 0)
        .map((item: any) => ({
          ...item,
          returnQuantity: 0,
          isDamaged: false
        })));
      setNewItems([{ variantId: "", quantity: 1, unitPrice: "" }]);
      setShippingFee("0");
    }
  }, [order, open]);

  const handleReturnedQuantityChange = (idx: number, qty: number) => {
    const newArr = [...returnedItems];
    newArr[idx] = { ...newArr[idx], returnQuantity: Math.min(Math.max(0, qty), newArr[idx].quantity) };
    setReturnedItems(newArr);
  };

  const handleDamagedChange = (idx: number, isDamaged: boolean) => {
    const newArr = [...returnedItems];
    newArr[idx] = { ...newArr[idx], isDamaged };
    setReturnedItems(newArr);
  };

  const addNewItem = () => setNewItems([...newItems, { variantId: "", quantity: 1, unitPrice: "" }]);
  const removeNewItem = (idx: number) => setNewItems(newItems.filter((_, i) => i !== idx));
  const handleNewItemChange = (idx: number, field: string, val: any, e?: React.ChangeEvent<HTMLInputElement>) => {
    const newArr = [...newItems];
    
    if (field === "quantity") {
      const variantId = newArr[idx].variantId;
      if (variantId) {
        const v = allVariants.find((av: any) => String(av.id) === String(variantId));
        if (v) {
          let otherQty = 0;
          newArr.forEach((item, i) => {
            if (i !== idx && String(item.variantId) === String(variantId)) {
              otherQty += parseInt(item.quantity) || 0;
            }
          });
          const maxAllowed = Math.max(0, Number(v.stock_quantity) - otherQty);
          let numVal = parseInt(val);
          if (numVal > maxAllowed) {
            toast.error(`عفواً، أقصى كمية متاحة في المخزن هي ${maxAllowed}`);
            numVal = maxAllowed;
            val = numVal.toString();
            if (e && e.target) {
              e.target.value = val;
            }
          }
        }
      }
    }
    
    newArr[idx] = { ...newArr[idx], [field]: val };
    if (field === "variantId") {
      const v = allVariants.find((av: any) => String(av.id) === String(val));
      if (v) newArr[idx].unitPrice = v.price ?? "";
    }
    setNewItems(newArr);
  };

  const returnedTotal = returnedItems.reduce((acc, curr) => acc + (curr.returnQuantity * curr.unit_price), 0);
  const newTotal = newItems.reduce((acc, curr) => acc + ((parseInt(curr.quantity)||0) * (parseFloat(curr.unitPrice)||0)), 0);
  const shipping = parseFloat(shippingFee) || 0;
  const difference = newTotal + shipping - returnedTotal;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !order) return;
    
    // validate
    const hasReturns = returnedItems.some(i => i.returnQuantity > 0);
    const hasNew = newItems.some(i => i.variantId && parseInt(i.quantity) > 0);
    if (!hasReturns && !hasNew) {
      toast.error("يجب اختيار منتج مسترجع أو إضافة منتج جديد على الأقل");
      return;
    }

    // التحقق من توافر المخزون للمنتجات الجديدة قبل الاستبدال
    const requestedQty: Record<string, number> = {};
    for (const item of newItems) {
      if (item.variantId && parseInt(item.quantity) > 0) {
        requestedQty[item.variantId] = (requestedQty[item.variantId] || 0) + parseInt(item.quantity);
      }
    }

    for (const [vId, qty] of Object.entries(requestedQty)) {
      const v = allVariants.find((av: any) => String(av.id) === String(vId));
      if (v && Number(v.stock_quantity) < qty) {
        toast.error(`❌ عذراً، لا يمكن إتمام الاستبدال! المخزون المتوفر من ${v.productName} (${v.variantName}) هو ${v.stock_quantity} فقط، وأنت طلبت ${qty}.`);
        return;
      }
    }

    setIsSubmitting(true);
    const supabase = createClient();
    try {
      // 1. Create Exchange Order
      const { data: exOrder, error: exError } = await supabase.from('orders').insert({
        tenant_id: tenantId,
        customer_id: order.customer_id,
        order_type: 'exchange',
        parent_order_id: order.id,
        total_amount: difference,
        shipping_fee: shipping,
        status: 'pending',
        payment_status: 'unpaid',
        source: order.source || 'manual'
      }).select().single();

      if (exError) throw exError;

      // 2. Prepare items (Returns + New)
      const insertItems = [];
      let totalLoss = 0;

      // Returns
      for (const ret of returnedItems) {
        if (ret.returnQuantity > 0) {
          insertItems.push({
            order_id: exOrder.id,
            product_variant_id: ret.product_variant_id,
            quantity: -ret.returnQuantity, // Negative quantity for returns
            unit_price: ret.unit_price
          });

          // Calculate loss based on variant cost if damaged
          if (ret.isDamaged) {
             const v = allVariants.find((av:any) => av.id === ret.product_variant_id);
             if (v) {
                totalLoss += (parseFloat(v.cost_price) || 0) * ret.returnQuantity;
             }
          }
        }
      }

      // New Items
      for (const newItem of newItems) {
        if (newItem.variantId && parseInt(newItem.quantity) > 0) {
          insertItems.push({
            order_id: exOrder.id,
            product_variant_id: newItem.variantId,
            quantity: parseInt(newItem.quantity), // Positive quantity for new items
            unit_price: parseFloat(newItem.unitPrice)
          });
        }
      }

      if (insertItems.length > 0) {
        const { error: itemsErr } = await supabase.from('order_items').insert(insertItems);
        if (itemsErr) throw itemsErr;
      }
      
      // If any returned items were damaged, the trigger automatically incremented their stock
      // (because of negative quantity). We must decrement them back to discard them.
      for (const ret of returnedItems) {
        if (ret.returnQuantity > 0 && ret.isDamaged) {
          const { data: variant } = await supabase.from('product_variants').select('stock_quantity').eq('id', ret.product_variant_id).single();
          if (variant) {
            await supabase.from('product_variants').update({ stock_quantity: Number(variant.stock_quantity) - Number(ret.returnQuantity) }).eq('id', ret.product_variant_id);
          }
        }
      }

      // 3. Treasury Updates
      // a) Record Damaged Items Loss (Expense)
      // Note: The exchange order's difference (sales revenue/loss) will be natively 
      // calculated by Treasury/page.tsx once the exchange order is marked as 'delivered'/'paid'.
      if (totalLoss > 0) {
         await supabase.from('transactions').insert({
          tenant_id: tenantId,
          type: 'expense',
          amount: totalLoss,
          description: `خسارة توالف استبدال للطلب #${order.id.substring(0,8)}`,
          category: 'loss',
          transaction_date: new Date().toISOString()
        });
      }

      toast.success("تم إجراء الاستبدال بنجاح");
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "حدث خطأ أثناء الاستبدال");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] !p-4 !gap-2 overflow-y-auto flex flex-col [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" dir="rtl">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-xl font-bold text-indigo-900 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            <span>إجراء استبدال للطلب #{order?.id?.substring(0,8)}</span>
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs mt-1">
            حدد المنتجات التي سيعيدها العميل، وأضف المنتجات الجديدة لتسوية الفروقات.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              
              {/* Items Section (Right Side - 2/3 width) */}
              <div className="lg:col-span-2 space-y-3">
                
                {/* Returned Items */}
                <div className="bg-gray-50 p-3 rounded-lg border shadow-sm">
                  <h3 className="font-bold text-gray-800 border-b pb-1 mb-2 flex items-center gap-2 text-sm">
                    📦 المنتجات المسترجعة (من العميل)
                  </h3>
                  <div className="space-y-2">
                    {returnedItems.map((item, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row gap-4 items-center bg-white p-3 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="font-bold text-gray-800 text-sm">{item.product_variants?.products?.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            النوع: {item.product_variants?.name} | السعر: <span className="font-medium text-gray-700">{item.unit_price} ج.م</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-gray-500">الكمية المسترجعة</Label>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                min="0" max={item.quantity} 
                                value={item.returnQuantity} 
                                onChange={e => handleReturnedQuantityChange(idx, parseInt(e.target.value)||0)}
                                className="w-16 h-8 text-center text-sm bg-white"
                              />
                              <span className="text-xs text-gray-400">/ {item.quantity}</span>
                            </div>
                          </div>
                          
                          <div className="w-px h-8 bg-gray-200"></div>
                          
                          <div className="flex flex-col gap-1.5 items-center justify-center pt-1">
                            <Label htmlFor={`damaged-${idx}`} className="text-xs text-gray-500">
                              تالف؟
                            </Label>
                            <div className="flex items-center gap-1.5">
                              <Checkbox 
                                id={`damaged-${idx}`} 
                                checked={item.isDamaged} 
                                onCheckedChange={(c: boolean) => handleDamagedChange(idx, !!c)} 
                                disabled={item.returnQuantity === 0}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* New Items */}
                <div className="space-y-4 bg-indigo-50/50 dark:bg-indigo-500/5 p-4 rounded-lg border border-indigo-100 dark:border-indigo-500/10">
                  <h3 className="font-semibold text-base text-indigo-800 dark:text-indigo-300 border-b border-indigo-200 dark:border-indigo-500/20 pb-2 flex items-center gap-2">
                    ✨ المنتجات البديلة (الجديدة)
                  </h3>
                  <div className="space-y-2">
                    {newItems.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-white hover:bg-gray-50 transition-colors p-2 rounded-lg border border-gray-200">
                        <div className="flex-1 w-full">
                          <select
                            className="h-9 w-full rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white px-2"
                            value={item.variantId}
                            onChange={(e) => handleNewItemChange(idx, "variantId", e.target.value)}
                          >
                            <option value="">-- اختر المنتج --</option>
                            {allVariants.map((v: any) => (
                              <option key={v.id} value={v.id}>{v.productName} - {v.variantName} (المتبقي: {v.stock_quantity||0})</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 border rounded-md px-2 bg-white">
                            <Input 
                              type="number" min="0" placeholder="السعر" 
                              value={item.unitPrice} 
                              onChange={e => handleNewItemChange(idx, "unitPrice", e.target.value)}
                              className="h-8 w-20 text-center border-0 focus-visible:ring-0 px-1 text-sm"
                            />
                            <span className="text-xs text-gray-500">ج.م</span>
                          </div>
                          <div className="flex items-center gap-1 border rounded-md px-2 bg-white">
                            <Input 
                              type="number" min="1" 
                              max={(() => {
                                const v = allVariants.find((av: any) => String(av.id) === String(item.variantId));
                                if (!v) return undefined;
                                let otherQty = 0;
                                newItems.forEach((oi, i) => { if (i !== idx && String(oi.variantId) === String(item.variantId)) otherQty += parseInt(oi.quantity)||0; });
                                return Math.max(1, Number(v.stock_quantity) - otherQty);
                              })()}
                              placeholder="1" 
                              value={item.quantity} 
                              onChange={e => updateNewItem(idx, 'quantity', e.target.value)}
                              className="h-8 text-center text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    type="button" variant="outline" size="sm" 
                    onClick={addNewItem} 
                    className="w-full border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 h-8 text-sm"
                  >
                    <Plus className="w-3 h-3 ml-1" />
                    إضافة منتج بديل
                  </Button>
                </div>
              </div>

              {/* Summary Section (Left Side - 1/3 width) */}
              <div className="lg:col-span-1">
                <div className="bg-white p-3 rounded-lg border shadow-sm sticky top-4">
                  <h3 className="font-bold text-gray-800 border-b pb-1 mb-2 flex items-center gap-2 text-sm">
                    💰 التسوية المالية
                  </h3>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-600">إجمالي المرتجعات</span>
                      <span className="font-semibold text-red-600" dir="ltr">- {returnedTotal.toLocaleString()} ج.م</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-600">إجمالي البدائل</span>
                      <span className="font-semibold text-green-600" dir="ltr">+ {newTotal.toLocaleString()} ج.م</span>
                    </div>
                    
                    <div className="flex flex-col gap-1 pt-2 border-t">
                      <Label className="text-xs text-gray-600">مصاريف شحن الاستبدال</Label>
                      <div className="relative">
                        <Input 
                          type="number" min="0" 
                          value={shippingFee} 
                          onChange={e => setShippingFee(e.target.value)} 
                          className="w-full h-8 bg-white text-left pr-6 text-sm" dir="ltr"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]">ج.م</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t bg-gray-50 p-2 rounded-md border text-center">
                    <div className="text-xs text-gray-500 mb-1">النتيجة النهائية</div>
                    <div className="font-bold text-gray-800 mb-1 text-sm">
                      {difference > 0 ? "المطلوب سداده" : difference < 0 ? "المطلوب رده" : "خالص"}
                    </div>
                    <div className="flex items-center justify-center gap-1" dir="ltr">
                      <span className={`font-bold text-lg ${difference > 0 ? 'text-indigo-700' : difference < 0 ? 'text-green-600' : 'text-gray-800'}`}>
                        {Math.abs(difference).toLocaleString()}
                      </span>
                      <span className="text-gray-500 font-bold text-xs">ج.م</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2 flex gap-2 sm:justify-end">
             <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="h-8 text-sm">
               إلغاء
             </Button>
             <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px] h-8 text-sm">
               {isSubmitting ? "جاري الحفظ..." : "تأكيد الاستبدال"}
             </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
