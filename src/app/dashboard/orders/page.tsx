"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Plus, Search, Filter, Printer, ShoppingBag, Eye, Trash2, Edit, ArrowRightLeft, Truck, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";
import ExchangeModal from "./ExchangeModal";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/components/shared/TenantProvider";
import { logActivity } from "@/utils/logger";

function ProductSelect({ 
  value, 
  onChange, 
  options 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: any[];
}) {
  const [open, setOpen] = React.useState(false);
  
  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-10 w-full justify-between items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 font-normal hover:bg-gray-50 text-right"
        title={selectedOption ? `${selectedOption.productName} - ${selectedOption.variantName}` : ""}
      >
        {selectedOption 
          ? <span className="text-right w-full truncate">{`${selectedOption.productName} - ${selectedOption.variantName} (المتبقي: ${selectedOption.stock_quantity || 0})`}</span>
          : <span className="text-gray-500 text-right w-full">-- اختر المنتج --</span>}
        <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0" dir="rtl">
        <Command>
          <CommandInput placeholder="ابحث باسم المنتج أو المقاس..." />
          <CommandList>
            <CommandEmpty>لم يتم العثور على منتجات.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.productName} ${option.variantName}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4",
                      value === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.productName} - {option.variantName} (المتبقي: {option.stock_quantity || 0})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function OrdersPage() {
  const { tenant, currentUser } = useTenant();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  
  const [orderItems, setOrderItems] = useState<any[]>([
    { variantId: "", quantity: 1, unitPrice: "" }
  ]);
  const [shippingFee, setShippingFee] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  
  const [products, setProducts] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeOrder, setExchangeOrder] = useState<any>(null);
  
  const handleOpenEdit = (order: any) => {
    if (order.status === 'returned_inventory') {
      return toast.error("لا يمكن تعديل طلب مرتجع للمخزن");
    }
    setEditingOrder(order);
    setCustomerName(order.customers?.name || "");
    setCustomerPhone(order.customers?.phone || "");
    setCustomerCity(order.customers?.city || "");
    setCustomerAddress(order.customers?.address || "");
    if (order.order_items && order.order_items.length > 0) {
      setOrderItems(order.order_items.map((item: any) => ({
        variantId: item.product_variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price
      })));
    } else {
      setOrderItems([{ variantId: "", quantity: 1, unitPrice: "" }]);
    }
    setShippingFee(order.shipping_fee || "");
    setOrderNotes(order.notes || "");
    setNewStatus(order.status || "pending");
    setNewPaymentStatus(order.payment_status || "unpaid");
    
    // For shipping info
    const shipment = Array.isArray(order.shipments) ? order.shipments[0] : order.shipments;
    setNewCourier(shipment?.courier || "");
    setNewTracking(shipment?.tracking_number || "");
    
    setIsOpen(true);
  };

  const handleOpenExchange = (order: any) => {
    setExchangeOrder(order);
    setExchangeOpen(true);
  };
  
  const handleCloseDialog = () => {
    setIsOpen(false);
    setTimeout(() => {
      setEditingOrder(null);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerCity("");
      setCustomerAddress("");
      setOrderItems([{ variantId: "", quantity: 1, unitPrice: "" }]);
      setShippingFee("");
      setOrderNotes("");
      setNewStatus("pending");
      setNewPaymentStatus("unpaid");
      setNewCourier("");
      setNewTracking("");
    }, 200);
  };
  
  const [newStatus, setNewStatus] = useState("pending");
  const [newPaymentStatus, setNewPaymentStatus] = useState("unpaid");
  const [newStockLocation, setNewStockLocation] = useState<"inventory" | "shipping">("inventory");
  const [newCourier, setNewCourier] = useState("");
  const [newTracking, setNewTracking] = useState("");

  const [activeTab, setActiveTab] = useState("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shippingCompanyFilter, setShippingCompanyFilter] = useState("all");

  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [shippingLoss, setShippingLoss] = useState("");
  const [customerRefusedShipping, setCustomerRefusedShipping] = useState(false);
  const [partialModalOpen, setPartialModalOpen] = useState(false);
  const [newAmountPaid, setNewAmountPaid] = useState("");
  const [newReturnedItems, setNewReturnedItems] = useState<any[]>([]);
  const [partialOrder, setPartialOrder] = useState<any>(null);
  const [partialItems, setPartialItems] = useState<any[]>([]);
  const [partialNewTotal, setPartialNewTotal] = useState("");
  
  // Partial Delivery Submit Handler
  const handlePartialDeliverySubmit = async () => {
    if (!partialOrder || !partialNewTotal) return;
    setIsSubmitting(true);
    try {
      const totalReturned = partialItems.reduce((acc, item) => acc + item.qty_returned, 0);
      if (totalReturned === 0) {
        toast.error("يجب تحديد القطع المرتجعة للاستلام الجزئي");
        setIsSubmitting(false);
        return;
      }
      
      // 1. Return stock for qty_returned and update order_items
      for (const item of partialItems) {
        if (item.qty_returned > 0) {
          // Decrement order_items so the item is actually removed from the order
          // The database trigger 'trigger_update_inventory_on_order' will automatically restore the stock
          const { data: orderItem } = await supabase.from("order_items").select("id, quantity").eq("id", item.order_item_id).single();
          if (orderItem) {
            const newQty = Math.max(0, Number(orderItem.quantity) - Number(item.qty_returned));
            await supabase.from("order_items").update({ quantity: newQty }).eq("id", orderItem.id);
          }
        }
      }
      
      // 2. Update order (status: delivered, total_amount: partialNewTotal, payment_status: paid)
      // Save notes indicating it was a partial delivery
      const notes = partialOrder.notes ? partialOrder.notes + "\n[استلام جزئي]" : "[استلام جزئي]";
      await supabase.from("orders").update({ 
        status: "delivered", 
        payment_status: "paid", 
        total_amount: partialNewTotal,
        notes: notes
      }).eq("id", partialOrder.id);
      
      const orderNamePartial = `#${partialOrder.id.substring(0,8)}`;
      logActivity(supabase, tenant?.id, currentUser?.id, "تأكيد استلام جزئي", "order", partialOrder.id, { order_name: orderNamePartial });
      toast.success("تم تأكيد الاستلام الجزئي بنجاح!");
      setPartialModalOpen(false);
      setExpandedOrderId(null);
      fetchOrders();
    } catch (e) {
      console.error(e);
      toast.error("حدث خطأ");
    } finally {
      setIsSubmitting(false);
    }
  };
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const handleOpenStatus = (order: any) => {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      return;
    }
    setShippingLoss("");
    setNewAmountPaid("");
    setNewReturnedItems(order.order_items?.map((i: any) => ({ id: i.product_variant_id, quantity: 0, max: i.quantity, title: i.product_variants?.products?.name || "منتج" })) || []);
    setSelectedOrder(order);
    
    let initialStatus = order.status || "pending";
    if (initialStatus === "returned_inventory" || initialStatus === "returned_shipping") {
      initialStatus = "cancelled";
    }
    setNewStatus(initialStatus);
    
    setNewPaymentStatus(order.payment_status || "unpaid");
    setNewStockLocation(order.source === "stock_in_inventory" ? "inventory" : "shipping");
    
    const shipment = Array.isArray(order.shipments) ? order.shipments[0] : order.shipments || {};
    setNewCourier(shipment.courier || "");
    setNewTracking(shipment.tracking_number || "");
    setNewNotes(order.notes || "");
    setCustomerRefusedShipping(false);
    setExpandedOrderId(order.id);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrderIds((prev) => [...prev, id]);
    } else {
      setSelectedOrderIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleBulkApply = async () => {
    if (!bulkStatus && !bulkPaymentStatus) return;
    
    setConfirmDialog({
      isOpen: true,
      title: "تأكيد الإجراء الجماعي",
      message: "هل أنت متأكد من تطبيق التغييرات على الطلبات المحددة؟",
      onConfirm: async () => {
        setIsSubmitting(true);
        
        // Process status update if selected
        if (bulkStatus) {
          const isStockDeducted = (status: string) => !["returned_inventory", "cancelled"].includes(status);
          
          for (const orderId of selectedOrderIds) {
            const order = orders.find(o => o.id === orderId);
            if (!order) continue;

            const currentDeducted = isStockDeducted(order.status || "pending");
            const finalDeducted = isStockDeducted(bulkStatus);

            if (currentDeducted && !finalDeducted) {
              // Restore stock
              const items = order.order_items;
              if (items && items.length > 0) {
                for (const item of items) {
                  const { data: variant } = await supabase.from("product_variants").select("stock_quantity").eq("id", item.product_variant_id).single();
                  if (variant) {
                    await supabase.from("product_variants").update({ stock_quantity: Number(variant.stock_quantity) + Number(item.quantity) }).eq("id", item.product_variant_id);
                  }
                }
              }
            } else if (!currentDeducted && finalDeducted) {
              // Deduct stock
              const items = order.order_items;
              if (items && items.length > 0) {
                for (const item of items) {
                  const { data: variant } = await supabase.from("product_variants").select("stock_quantity").eq("id", item.product_variant_id).single();
                  if (variant) {
                    await supabase.from("product_variants").update({ stock_quantity: Math.max(0, Number(variant.stock_quantity) - Number(item.quantity)) }).eq("id", item.product_variant_id);
                  }
                }
              }
            }
            const orderSource = ["returned_inventory", "pending"].includes(bulkStatus) ? "stock_in_inventory" : "stock_in_shipping";
            await supabase.from("orders").update({ status: bulkStatus, source: orderSource }).eq("id", order.id);

            // If the status is changing to anything other than returned_inventory/cancelled, 
            // ensure we delete any previous shipping loss transaction for this order
            if (!["returned_inventory", "cancelled"].includes(bulkStatus)) {
              await supabase.from("transactions").delete()
                .like("description", `%${order.id.substring(0,6)}%`)
                .eq("category", "مصروفات")
                .eq("tenant_id", tenant?.id);
            }
          }
        }

        toast.success("تم تطبيق التغييرات على الطلبات المحددة بنجاح");
        fetchOrders();
        setSelectedOrderIds([]);
        setBulkStatus("");
        setIsSubmitting(false);
      }
    });
  };

  const supabase = createClient();

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    const urlParams = new URLSearchParams(window.location.search);
    const search = urlParams.get('search');
    if (search) {
      setSearchTerm(search);
    }
  }, []);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select(`*, product_variants (*)`);
    setProducts(data || []);
  };

  const isOrderMatchingSearchAndShipping = (order: any) => {
    const isPhoneSearch = /^[\\+\\d\\s]+$/.test(searchTerm.trim());
    const cleanSearchTerm = searchTerm.replace(/\\D/g, '').replace(/^(20|0)+/, '');
    const cleanPhone = (order.customers?.phone || "").replace(/\\D/g, '').replace(/^(20|0)+/, '');
    
    const phoneMatch = (order.customers?.phone || "").includes(searchTerm) || 
                       (isPhoneSearch && cleanSearchTerm.length > 0 && cleanPhone.includes(cleanSearchTerm));

    const searchMatch = (order.id || "").toString().toLowerCase().includes(searchTerm.toLowerCase()) || 
           (order.customers?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
           phoneMatch;
           
    const courier = Array.isArray(order.shipments) ? order.shipments[0]?.courier : order.shipments?.courier;
    const shippingCompanyMatch = shippingCompanyFilter === "all" || courier === shippingCompanyFilter;
    
    return searchMatch && shippingCompanyMatch;
  };

  const filteredOrders = orders.filter((order) => {
    const statusMatch = statusFilter === "all" || 
                        order.status === statusFilter || 
                        (statusFilter === "cancelled" && ["returned_inventory", "returned_shipping"].includes(order.status));
           
    const isDeleted = order.is_deleted === true;
    const tabMatch = activeTab === "deleted" ? isDeleted : !isDeleted;
    
    return tabMatch && statusMatch && isOrderMatchingSearchAndShipping(order);
  });

  const allVariants = products.flatMap(p => 
    (p.product_variants || []).map((v: any) => ({
      id: v.id,
      productName: p.name,
      variantName: [v.size, v.color].filter(c => c && c !== "-").join(" / ") || "أساسي",
      price: v.selling_price,
      stock_quantity: v.stock_quantity,
      cost_price: v.normal_cost
    }))
  );

  const handleOrderItemChange = (index: number, field: string, value: string, e?: React.ChangeEvent<HTMLInputElement>) => {
    const newItems = [...orderItems];
    
    if (field === "quantity") {
      const variantId = newItems[index].variantId;
      if (variantId) {
        const v = allVariants.find(av => av.id === variantId);
        if (v) {
          let otherQty = 0;
          newItems.forEach((item, i) => {
            if (i !== index && item.variantId === variantId) {
              otherQty += Number(item.quantity) || 0;
            }
          });
          const maxAllowed = Math.max(0, Number(v.stock_quantity) - otherQty);
          let numVal = Number(value);
          if (numVal > maxAllowed) {
            toast.error(`عفواً، أقصى كمية متاحة في المخزن هي ${maxAllowed}`);
            numVal = maxAllowed;
            value = numVal.toString();
            if (e && e.target) {
              e.target.value = value;
            }
          }
        }
      }
    }
    
    newItems[index][field] = value;
    if (field === "variantId") {
      const v = allVariants.find(av => av.id === value);
      if (v) newItems[index].unitPrice = v.price?.toString() || "0";
    }
    setOrderItems(newItems);
  };

  const addOrderItem = () => setOrderItems([...orderItems, { variantId: "", quantity: 1, unitPrice: "" }]);
  const removeOrderItem = (index: number) => {
    const newItems = [...orderItems];
    newItems.splice(index, 1);
    setOrderItems(newItems);
  };

  const calculatedItemsTotal = orderItems.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitPrice) || 0), 0);
  const finalTotalAmount = calculatedItemsTotal + (Number(shippingFee) || 0);

  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // التحقق من توافر المخزون قبل إنشاء الطلب
    const requestedQty: Record<string, number> = {};
    for (const item of orderItems) {
      if (item.variantId) {
        requestedQty[item.variantId] = (requestedQty[item.variantId] || 0) + Number(item.quantity);
      }
    }
    
    for (const [vId, qty] of Object.entries(requestedQty)) {
      const v = allVariants.find(av => av.id === vId);
      if (v && Number(v.stock_quantity) < qty) {
        toast.error(`❌ عذراً، لا يمكن إتمام الطلب! المخزون المتوفر من ${v.productName} (${v.variantName}) هو ${v.stock_quantity} فقط، وأنت طلبت ${qty}.`);
        setIsSubmitting(false);
        return;
      }
    }
    
    let customerId = null;
    
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", customerPhone)
      .single();
      
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await supabase
        .from("customers")
        .update({
          name: customerName,
          city: customerCity,
          address: customerAddress
        })
        .eq("id", customerId);
    } else {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({
          name: customerName,
          phone: customerPhone,
          city: customerCity,
          address: customerAddress,
          tenant_id: tenant?.id
        })
        .select("id")
        .single();

      if (customerError || !customer) {
        setIsSubmitting(false);
        return;
      }
      customerId = customer.id;
    }

    let orderId = editingOrder?.id;

    if (editingOrder) {
      // 1. Delete old items (DB trigger handles stock restoration automatically on DELETE)
      await supabase.from("order_items").delete().eq("order_id", editingOrder.id);

      // 3. Update Order
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          customer_id: customerId,
          total_amount: finalTotalAmount,
          shipping_fee: Number(shippingFee) || 0,
          notes: orderNotes
        })
        .eq("id", editingOrder.id);

      if (orderError) {
        setIsSubmitting(false);
        return;
      }
    } else {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: customerId,
          total_amount: finalTotalAmount,
          status: "pending",
          payment_status: "unpaid",
          source: "stock_in_inventory",
          tenant_id: tenant?.id,
          shipping_fee: Number(shippingFee) || 0,
          notes: orderNotes
        })
        .select("id")
        .single();

      if (orderError || !order) {
        setIsSubmitting(false);
        return;
      }
      orderId = order.id;
    }

    for (const item of orderItems) {
      if (!item.variantId) continue;
      await supabase
        .from("order_items")
        .insert({
          order_id: orderId,
          product_variant_id: item.variantId,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice)
        });
        
      // التحقق من المخزون وتنبيه المستخدم
      const { data: variantData } = await supabase
        .from("product_variants")
        .select(`stock_quantity, low_stock_threshold, size, products(name)`)
        .eq("id", item.variantId)
        .single();
        
      if (variantData && variantData.stock_quantity <= (variantData.low_stock_threshold || 5)) {
        const productName = Array.isArray(variantData.products) ? variantData.products[0]?.name : (variantData.products as any)?.name;
        toast(`⚠️ تنبيه: مخزون منخفض لـ ${productName} (${variantData.size}). المتبقي: ${variantData.stock_quantity}`, {
          style: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #F87171' },
          duration: 6000
        });
      }
    }

    if (editingOrder) {
      logActivity(supabase, tenant?.id, currentUser?.id, "تعديل الطلب", "order", orderId, { order_name: `#${orderId.substring(0,8)}` });
      toast.success("تم تعديل الطلب بنجاح");
    } else {
      logActivity(supabase, tenant?.id, currentUser?.id, "إنشاء طلب جديد", "order", orderId, { order_name: `#${orderId.substring(0,8)}` });
      toast.success("تم إضافة الطلب بنجاح");
    }
    
    handleCloseDialog();
    fetchOrders();
    setIsSubmitting(false);
  };

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        customers ( name, phone, city, address ),
        shipments ( courier, tracking_number ),
        order_items ( id, product_variant_id, quantity, unit_price, product_variants ( size, products ( name ) ) )
      `)
      .order("created_at", { ascending: false });
      
    if (error) {
      toast.error("فشل في تحميل الطلبات");
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  const getStatusBadge = (order: any) => {
    const status = order.status;
    const payment = order.payment_status;

    if (status === "delivered" && payment === "partial") {
      return <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs font-bold">توصيل جزئي</span>;
    }

    switch(status) {
      case "pending": return <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold">في الانتظار</span>;
      case "shipped": return <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold">في الشحن</span>;
      case "delivered": return <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">تم التوصيل</span>;
      case "partially_delivered": return <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs font-bold">توصيل جزئي</span>;
      case "cancelled": 
      case "returned_inventory":
      case "returned_shipping":
        return <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">ملغي / مرتجع</span>;
      default: return <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  const getPaymentStatusBadge = (status: string) => { return null; };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSubmitting(true);

    let finalPaymentStatus = selectedOrder.payment_status;
    let computedNotes = newNotes;

    if (computedNotes) {
      computedNotes = computedNotes
        .split('|')
        .map(n => n.trim())
        .filter(n => !n.startsWith('خسارة شحن:') && n !== 'العميل رفض دفع الشحن' && n.length > 0)
        .join(' | ');
    }

    const isStockDeducted = (status: string) => {
      return !["cancelled", "returned_inventory", "returned_shipping"].includes(status);
    };

    let dbStatus = newStatus;
    if (newStatus === "cancelled") {
      dbStatus = "returned_inventory";
      finalPaymentStatus = "unpaid";
    }
    if (newStatus === "partially_delivered") dbStatus = "delivered";

    const currentDeducted = isStockDeducted(selectedOrder.status || "pending");
    const finalDeducted = isStockDeducted(dbStatus);

    if (currentDeducted && !finalDeducted) {
      // Need to restore full stock (moving to cancelled/returned state)
      const items = selectedOrder.order_items || [];
      for (const item of items) {
        const { data: variant } = await supabase.from("product_variants").select("stock_quantity").eq("id", item.product_variant_id).single();
        if (variant) {
          await supabase.from("product_variants").update({ stock_quantity: Number(variant.stock_quantity) + Number(item.quantity) }).eq("id", item.product_variant_id);
        }
      }
    } else if (!currentDeducted && finalDeducted) {
      // Need to DEDUCT full stock (moving from cancelled back to active state)
      const items = selectedOrder.order_items || [];
      for (const item of items) {
        const { data: variant } = await supabase.from("product_variants").select("stock_quantity").eq("id", item.product_variant_id).single();
        if (variant) {
          await supabase.from("product_variants").update({ stock_quantity: Number(variant.stock_quantity) - Number(item.quantity) }).eq("id", item.product_variant_id);
        }
      }
    }

    // Process shipping loss independently from stock changes

    // Process shipping loss independently from stock changes
    if (newStatus === "cancelled") {
      // First, always delete any existing shipping loss transaction for this order to prevent duplicates
      await supabase.from("transactions").delete()
        .like("description", `%${selectedOrder.id.substring(0,6)}%`)
        .eq("category", "مصروفات")
        .eq("tenant_id", tenant?.id);

      if (shippingLoss && Number(shippingLoss) > 0) {
        await supabase.from("transactions").insert({
          tenant_id: tenant?.id,
          type: "expense",
          amount: Number(shippingLoss),
          category: "مصروفات",
          description: `خسارة شحن للطلب رقم ${selectedOrder.id.substring(0,6)}`,
          transaction_date: new Date().toISOString()
        });
        computedNotes = computedNotes ? `${computedNotes} | خسارة شحن: ${shippingLoss}` : `خسارة شحن: ${shippingLoss}`;
        setShippingLoss(""); // reset after processing
      }
    } else {
      // If order was changed from cancelled to delivered/shipped, remove any shipping loss expense
      await supabase.from("transactions").delete()
        .like("description", `%${selectedOrder.id.substring(0,6)}%`)
        .eq("category", "مصروفات")
        .eq("tenant_id", tenant?.id);
    }
    
    if (selectedOrder.order_type === "exchange") {
      // First, always delete any existing refused shipping transaction for this order to prevent duplicates
      await supabase.from("transactions").delete()
        .like("description", `%رفض العميل%`)
        .like("description", `%${selectedOrder.id.substring(0,6)}%`)
        .eq("category", "مصروفات")
        .eq("tenant_id", tenant?.id);

      if (newStatus === "delivered" && customerRefusedShipping) {
        const shipFee = Number(selectedOrder.shipping_fee || 0);
        if (shipFee > 0) {
          await supabase.from("transactions").insert({
            tenant_id: tenant?.id,
            type: "expense",
            amount: shipFee,
            category: "مصروفات",
            description: `خسارة شحن (رفض العميل) لاستبدال الطلب رقم ${selectedOrder.id.substring(0,6)}`,
            transaction_date: new Date().toISOString()
          });
          computedNotes = computedNotes ? `${computedNotes} | العميل رفض دفع الشحن` : `العميل رفض دفع الشحن`;
        }
      }
    }

    if (newStatus === "partially_delivered") {
      const totalReturned = newReturnedItems.reduce((acc, r) => acc + r.quantity, 0);
      if (totalReturned === 0) {
        toast.error("يجب تحديد القطع المرتجعة للطلب الجزئي");
        setIsSubmitting(false);
        return;
      }
      
      finalPaymentStatus = "partial";
      for (const ret of newReturnedItems) {
        if (ret.quantity > 0) {
          // Update order_items quantity so Treasury calculates profit correctly
          // The database trigger 'trigger_update_inventory_on_order' will automatically restore the stock
          const orderItem = selectedOrder.order_items?.find((i: any) => i.id === ret.id);
          if (orderItem) {
            const newQty = Math.max(0, Number(orderItem.quantity) - Number(ret.quantity));
            await supabase.from("order_items").update({ quantity: newQty }).eq("id", orderItem.id);
          }
        }
      }

      if (newAmountPaid && Number(newAmountPaid) > 0) {
        computedNotes = computedNotes ? `${computedNotes} | تحصيل جزئي: ${newAmountPaid}` : `تحصيل جزئي: ${newAmountPaid}`;
      }
    } 
    else if (newStatus === "delivered") {
      finalPaymentStatus = "paid";
    }

    const orderSource = ["cancelled", "returned_inventory", "pending"].includes(newStatus) ? "stock_in_inventory" : "stock_in_shipping";

    const updateObj: any = { status: dbStatus, payment_status: finalPaymentStatus, source: orderSource };
    if (newStatus === "partially_delivered" && newAmountPaid && Number(newAmountPaid) > 0) {
      updateObj.total_amount = Number(newAmountPaid);
    }
    if (computedNotes) {
      updateObj.notes = computedNotes;
    }
    const { error: orderError } = await supabase.from("orders").update(updateObj).eq("id", selectedOrder.id);
    if (orderError) {
      console.error(orderError);
      toast.error(orderError.message || "حدث خطأ أثناء تحديث حالة الطلب");
      setIsSubmitting(false);
      return;
    }

    if (newCourier || newTracking) {
      const { data: existingShipment, error: checkError } = await supabase.from("shipments").select("id").eq("order_id", selectedOrder.id).maybeSingle();
      if (!checkError && existingShipment) {
        await supabase.from("shipments").update({ courier: newCourier, tracking_number: newTracking || null }).eq("id", existingShipment.id);
      } else if (!checkError) {
        await supabase.from("shipments").insert({ 
          order_id: selectedOrder.id, 
          courier: newCourier, 
          tracking_number: newTracking || null
        });
      }
    }
    
    const orderNameStatus = `#${selectedOrder.id.substring(0,8)}`;
    logActivity(supabase, tenant?.id, currentUser?.id, `تحديث حالة الطلب إلى: ${getStatusText(dbStatus)}`, "order", selectedOrder.id, { order_name: orderNameStatus });
    setExpandedOrderId(null);
    setNewReturnedItems([]);
    setNewAmountPaid("");
    fetchOrders();
    setIsSubmitting(false);
  };

  const handleDeleteOrder = async (order: any) => {
    setConfirmDialog({
      isOpen: true,
      title: "نقل للمحذوفات",
      message: "هل أنت متأكد من نقل هذا الطلب للمحذوفات؟ سيتم استرجاع المنتجات للمخزن إذا لم تكن مسترجعة بالفعل.",
      onConfirm: async () => {
        // Update local state instantly
        setOrders((prev) => prev.map(o => o.id === order.id ? { ...o, is_deleted: true, status: 'returned_inventory' } : o));
        setSelectedOrderIds(prev => prev.filter(id => id !== order.id));

        // Restore stock if it was currently deducted
        const isStockDeducted = !["cancelled", "returned_inventory", "returned_shipping"].includes(order.status || "pending");
        if (isStockDeducted && order.order_items) {
           for (const item of order.order_items) {
              const { data: variant } = await supabase.from("product_variants").select("stock_quantity").eq("id", item.product_variant_id).single();
              if (variant) {
                await supabase.from("product_variants").update({ stock_quantity: Number(variant.stock_quantity) + Number(item.quantity) }).eq("id", item.product_variant_id);
              }
           }
        }

        // Also delete any shipping loss transactions related to this order
        await supabase.from("transactions").delete().like("description", `%${order.id.substring(0,6)}%`);

        const { error } = await supabase.from("orders").update({ is_deleted: true, status: 'returned_inventory' }).eq("id", order.id);
        if (error) {
          toast.error("فشل في حذف الطلب");
          fetchOrders(); // rollback on error
        } else {
          const orderNameDel = `#${order.id.substring(0,8)}`;
          logActivity(supabase, tenant?.id, currentUser?.id, "نقل الطلب للمحذوفات واسترجاع المخزون", "order", order.id, { order_name: orderNameDel });
          toast.success("تم نقل الطلب للمحذوفات واسترجاع المنتجات بنجاح");
        }
      }
    });
  };

  const handleRestoreOrder = async (order: any) => {
    setConfirmDialog({
      isOpen: true,
      title: "استعادة الطلب",
      message: "هل أنت متأكد من استعادة هذا الطلب؟",
      onConfirm: async () => {
        // Update local state instantly
        setOrders((prev) => prev.map(o => o.id === order.id ? { ...o, is_deleted: false } : o));
        setSelectedOrderIds(prev => prev.filter(id => id !== order.id));

        const { error } = await supabase.from("orders").update({ is_deleted: false }).eq("id", order.id);
        if (error) {
          console.error("Restore Error:", error);
          toast.error("فشل في استعادة الطلب: " + error.message);
          fetchOrders(); // rollback on error
        } else {
          const orderNameRes = `#${order.id.substring(0,8)}`;
          logActivity(supabase, tenant?.id, currentUser?.id, "استعادة الطلب من المحذوفات", "order", order.id, { order_name: orderNameRes });
          toast.success("تم استعادة الطلب بنجاح");
        }
      }
    });
  };

  const handleOpenDetails = (order: any) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case "pending": return "في الانتظار";
      case "shipped": return "في الشحن";
      case "delivered": return "تم التوصيل";
      case "partially_delivered": return "توصيل جزئي";
      case "returned_inventory": return "مرتجع لمخزن التاجر";
      case "returned_shipping": return "مرتجع لشركة الشحن";
      case "cancelled": return "ملغي / مرتجع";
      default: return status;
    }
  };

  const getPaymentStatusText = (status: string) => {
    switch(status) {
      case "unpaid": return "غير مدفوع";
      case "paid": return "مدفوع";
      case "partial": return "مدفوع جزئياً";
      case "refunded": return "مسترد";
      default: return status;
    }
  };

  const handlePrintWaybill = (order: any) => {
    const serial = String(orders.length - orders.findIndex(o => o.id === order.id)).padStart(4, '0');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>بوليصة شحن - ${tenant?.name || 'ميتش'} #${serial}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            .waybill { border: 2px solid #000; padding: 30px; max-width: 800px; margin: 0 auto; border-radius: 10px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
            .order-number { font-size: 20px; color: #555; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .info-group { margin-bottom: 10px; font-size: 16px; }
            .info-label { font-weight: bold; width: 120px; display: inline-block; color: #555; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th, .table td { border: 1px solid #000; padding: 12px; text-align: right; }
            .table th { background-color: #f8f9fa; font-weight: bold; }
            .total { font-weight: bold; font-size: 22px; margin-top: 30px; text-align: left; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #000; }
            .footer-note { text-align: center; margin-top: 40px; font-size: 14px; color: #777; }
            
            @media print {
              body { padding: 0; }
              .waybill { border: none; padding: 0; max-width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="waybill">
            <div class="header">
              <div class="title">${tenant?.name || 'ميتش'} - بوليصة شحن</div>
              <div class="order-number">طلب رقم: #${order.id.substring(0,8)}</div>
              <div style="margin-top: 10px;">
                <svg class="barcode" data-order-id="${order.id}"></svg>
              </div>
            </div>
            
            <div class="info-section">
              <div>
                <div class="info-group"><span class="info-label">اسم العميل:</span> <span>${order.customers?.name || '-'}</span></div>
                <div class="info-group"><span class="info-label">رقم الهاتف:</span> <span><bdi>${order.customers?.phone || '-'}</bdi></span></div>
              </div>
              <div>
                <div class="info-group"><span class="info-label">المحافظة:</span> <span>${order.customers?.city || '-'}</span></div>
                <div class="info-group"><span class="info-label">العنوان:</span> <span>${order.customers?.address || '-'}</span></div>
              </div>
            </div>
            
            <div class="info-section" style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
              <div>
                <div class="info-group"><span class="info-label">الحالة:</span> <span>${getStatusText(order.status)}</span></div>
                
                ${order.notes ? `<div class="info-group" style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;"><span class="info-label">ملاحظات:</span> <span>${order.notes}</span></div>` : ''}
              </div>
              <div>
                <div class="info-group"><span class="info-label">شركة الشحن:</span> <span>${Array.isArray(order.shipments) ? order.shipments[0]?.courier || '-' : order.shipments?.courier || '-'}</span></div>
                <div class="info-group"><span class="info-label">رقم التتبع:</span> <span dir="ltr">${Array.isArray(order.shipments) ? order.shipments[0]?.tracking_number || '-' : order.shipments?.tracking_number || '-'}</span></div>
              </div>
            </div>
            
            <table class="table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${(order.order_items || []).map((item: any) => `
                  <tr>
                    <td>${item.product_variants?.products?.name || 'منتج غير معروف'} - ${item.product_variants?.size || ''}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit_price} ج.م</td>
                    <td>${(Number(item.quantity) * Number(item.unit_price)).toLocaleString()} ج.م</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="total">
              إجمالي المطلوب تحصيله: ${Number(order.total_amount).toLocaleString()} ج.م
            </div>
            
            <div class="footer-note">
              شكراً لتعاملكم معنا
            </div>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <script>
            window.onload = function() { 
              var barcodes = document.querySelectorAll('.barcode');
              barcodes.forEach(function(svg) {
                var orderId = svg.getAttribute('data-order-id');
                if (orderId && typeof JsBarcode !== 'undefined') {
                  JsBarcode(svg, orderId, {
                    format: "CODE128",
                    lineColor: "#000",
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    margin: 0
                  });
                }
              });
              window.setTimeout(function() { 
                window.print(); 
                window.setTimeout(function() { window.close(); }, 500); 
              }, 500);
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintMultipleWaybills = () => {
    const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>طباعة بوليصات الشحن - ${tenant?.name || 'ميتش'}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            .waybill { border: 2px dashed #000; padding: 20px; max-width: 800px; margin: 0 auto 30px auto; border-radius: 10px; page-break-inside: avoid; }
            .waybill:nth-child(3n) { page-break-after: always; margin-bottom: 0; }
            .waybill:last-child { page-break-after: auto; margin-bottom: 0; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 15px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .order-number { font-size: 18px; color: #555; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 15px; }
            .info-group { margin-bottom: 5px; font-size: 14px; }
            .info-label { font-weight: bold; width: 100px; display: inline-block; color: #555; }
            .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
            .table th, .table td { border: 1px solid #000; padding: 8px; text-align: right; }
            .table th { background-color: #f8f9fa; font-weight: bold; }
            .total { font-weight: bold; font-size: 18px; margin-top: 15px; text-align: left; background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #000; }
            .footer-note { text-align: center; margin-top: 15px; font-size: 12px; color: #777; }
            
            @media print {
              body { padding: 0; }
              .waybill { border: 2px dashed #000; max-width: 100%; margin-bottom: 20px; }
              .waybill:nth-child(3n) { margin-bottom: 0; }
            }
          </style>
        </head>
        <body>
          ${selectedOrders.map(order => {
            const serial = String(orders.length - orders.findIndex(o => o.id === order.id)).padStart(4, '0');
            return `
              <div class="waybill">
                <div class="header">
                  <div class="title">${tenant?.name || 'ميتش'} - بوليصة شحن</div>
                  <div class="order-number">طلب رقم: #${order.id.substring(0,8)}</div>
                  <div style="margin-top: 10px;">
                    <svg class="barcode" data-order-id="${order.id.substring(0,8)}"></svg>
                  </div>
                </div>
                
                <div class="info-section">
                  <div>
                    <div class="info-group"><span class="info-label">اسم العميل:</span> <span>${order.customers?.name || '-'}</span></div>
                    <div class="info-group"><span class="info-label">رقم الهاتف:</span> <span><bdi>${order.customers?.phone || '-'}</bdi></span></div>
                  </div>
                  <div>
                    <div class="info-group"><span class="info-label">المحافظة:</span> <span>${order.customers?.city || '-'}</span></div>
                    <div class="info-group"><span class="info-label">العنوان:</span> <span>${order.customers?.address || '-'}</span></div>
                  </div>
                </div>
                
                <div class="info-section" style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 15px;">
                  <div>
                    <div class="info-group"><span class="info-label">الحالة:</span> <span>${getStatusText(order.status)}</span></div>
                    
                    ${order.notes ? `<div class="info-group" style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;"><span class="info-label">ملاحظات:</span> <span>${order.notes}</span></div>` : ''}
                  </div>
                  <div>
                    <div class="info-group"><span class="info-label">شركة الشحن:</span> <span>${Array.isArray(order.shipments) ? order.shipments[0]?.courier || '-' : order.shipments?.courier || '-'}</span></div>
                    <div class="info-group"><span class="info-label">رقم التتبع:</span> <span dir="ltr">${Array.isArray(order.shipments) ? order.shipments[0]?.tracking_number || '-' : order.shipments?.tracking_number || '-'}</span></div>
                  </div>
                </div>
                
                <table class="table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>الكمية</th>
                      <th>السعر</th>
                      <th>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(order.order_items || []).map((item: any) => `
                      <tr>
                        <td>${item.product_variants?.products?.name || 'منتج غير معروف'} - ${item.product_variants?.size || ''}</td>
                        <td>${item.quantity}</td>
                        <td>${item.unit_price} ج.م</td>
                        <td>${(Number(item.quantity) * Number(item.unit_price)).toLocaleString()} ج.م</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                
                <div class="total">
                  إجمالي المطلوب تحصيله: ${Number(order.total_amount).toLocaleString()} ج.م
                </div>
                
                <div class="footer-note">
                  شكراً لتعاملكم معنا
                </div>
              </div>
            `;
          }).join('')}
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <script>
            window.onload = function() { 
              var barcodes = document.querySelectorAll('.barcode');
              barcodes.forEach(function(svg) {
                var orderId = svg.getAttribute('data-order-id');
                if (orderId && typeof JsBarcode !== 'undefined') {
                  JsBarcode(svg, orderId, {
                    format: "CODE128",
                    lineColor: "#000",
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    margin: 0
                  });
                }
              });
              window.setTimeout(function() { 
                window.print(); 
                window.setTimeout(function() { window.close(); }, 500); 
              }, 500);
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const isAllSelected = filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة الطلبات</h1>
          <p className="text-sm text-gray-500 mt-1">تابع طلبات عملائك وقم بإدارتها بسهولة</p>
        </div>
        
        <Button onClick={() => setIsOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 ml-2" />
          إضافة طلب
        </Button>

        <ExchangeModal
          open={exchangeOpen}
          onOpenChange={setExchangeOpen}
          order={exchangeOrder}
          tenantId={tenant?.id}
          allVariants={allVariants}
          onSuccess={fetchOrders}
        />
        
        <Dialog open={isOpen} onOpenChange={handleCloseDialog}>
          <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[95vh] !p-4 !gap-2 overflow-y-hidden flex flex-col [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" dir="rtl">
            <DialogHeader className="pb-2 border-b">
              <DialogTitle className="text-xl font-bold text-indigo-900">
                {editingOrder ? "تعديل الطلب" : "إضافة طلب جديد"}
              </DialogTitle>
              <DialogDescription className="text-gray-500 text-xs mt-1">
                أدخل كافة بيانات العميل وتفاصيل الطلب.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddOrder} className="mt-1 space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                
                {/* Customer Details */}
                <div className="space-y-3 bg-gray-50 p-3 rounded-lg border">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-1 flex items-center gap-2">
                    👤 بيانات العميل
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="grid gap-1">
                      <Label htmlFor="customerName" className="text-xs">الاسم بالكامل</Label>
                      <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required placeholder="أحمد محمد" className="h-8 text-sm" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="customerPhone" className="text-xs">رقم الهاتف</Label>
                      <Input id="customerPhone" dir="ltr" className="text-right h-8 text-sm" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required placeholder="01xxxx" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="customerCity" className="text-xs">المدينة</Label>
                      <Input id="customerCity" value={customerCity} onChange={(e) => setCustomerCity(e.target.value)} required placeholder="القاهرة" className="h-8 text-sm" />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="customerAddress" className="text-xs">العنوان</Label>
                      <Input id="customerAddress" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} required placeholder="الشارع، العمارة" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid gap-1 mt-1">
                    <Label htmlFor="orderNotes" className="text-xs">ملاحظات (اختياري)</Label>
                    <Textarea id="orderNotes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="ملاحظات..." className="h-8 min-h-[32px] py-1 resize-none text-sm" />
                  </div>
                </div>

                {/* Order Details */}
                <div className="space-y-2 bg-indigo-50/50 dark:bg-indigo-500/5 p-3 rounded-lg border border-indigo-100 dark:border-indigo-500/10 flex flex-col h-full">
                  <h3 className="font-semibold text-sm text-indigo-800 dark:text-indigo-300 border-b border-indigo-200 dark:border-indigo-500/20 pb-1 flex items-center gap-2 shrink-0">
                    📦 المنتجات المطلوبة
                  </h3>
                  
                  <div className="hidden md:flex gap-2 px-2 pb-1 text-[10px] font-bold text-gray-500 shrink-0">
                    <div className="flex-1">المنتج</div>
                    <div className="w-24 text-center">السعر</div>
                    <div className="w-20 text-center">الكمية</div>
                    {orderItems.length > 1 && <div className="w-8"></div>}
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-[100px] max-h-[180px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-indigo-200 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {orderItems.map((item, index) => (
                      <div key={index} className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-gray-50/80 hover:bg-gray-100 transition-colors p-2 rounded-lg border border-gray-100 relative w-full group">
                        <div className="flex-1 w-full min-w-0">
                          <ProductSelect
                            value={item.variantId}
                            onChange={(val) => handleOrderItemChange(index, "variantId", val)}
                            options={allVariants}
                          />
                        </div>
                        <div className="flex w-full md:w-auto gap-2">
                          <div className="w-full md:w-24">
                            <Input 
                              type="number" 
                              min="0" 
                              value={item.unitPrice} 
                              onChange={(e) => handleOrderItemChange(index, "unitPrice", e.target.value)} 
                              onFocus={(e) => e.target.select()}
                              required 
                              placeholder="السعر"
                              className="h-8 px-2 bg-white text-center text-sm font-semibold text-gray-900 border-gray-200"
                            />
                          </div>
                          <div className="w-full md:w-20">
                            <Input 
                              type="number" 
                              min="1" 
                              max={(() => {
                                const v = allVariants.find(av => av.id === item.variantId);
                                if (!v) return undefined;
                                let otherQty = 0;
                                orderItems.forEach((oi, i) => { if (i !== index && oi.variantId === item.variantId) otherQty += Number(oi.quantity)||0; });
                                return Math.max(1, Number(v.stock_quantity) - otherQty);
                              })()}
                              value={item.quantity} 
                              onChange={(e) => handleOrderItemChange(index, "quantity", e.target.value, e)} 
                              onFocus={(e) => e.target.select()}
                              required 
                              placeholder="الكمية"
                              className="h-8 px-2 bg-white text-center text-sm font-bold text-indigo-700 border-gray-200"
                            />
                          </div>
                          
                          {orderItems.length > 1 && (
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeOrderItem(index)}
                              className="h-8 w-8 text-red-500 hover:text-white hover:bg-red-500 rounded-md transition-colors shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={addOrderItem}
                    className="w-full border-dashed border border-indigo-300 text-indigo-700 hover:bg-indigo-100 bg-white h-8 text-xs shrink-0"
                  >
                    <Plus className="w-3 h-3 ml-1" />
                    إضافة منتج آخر
                  </Button>
                  
                  <div className="pt-2 mt-2 border-t border-blue-200 space-y-2 shrink-0">
                    <div className="flex items-center gap-2 justify-between">
                      <Label htmlFor="shippingFee" className="text-xs">مصاريف الشحن (ج.م)</Label>
                      <Input 
                        id="shippingFee" 
                        type="number" 
                        min="0"
                        value={shippingFee} 
                        onChange={(e) => setShippingFee(e.target.value)} 
                        onFocus={(e) => e.target.select()}
                        className="h-8 w-24 text-sm bg-white text-left"
                        dir="ltr"
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-between bg-indigo-600 text-white p-2 rounded-md shadow-sm">
                      <span className="font-bold text-xs">الإجمالي (شامل الشحن)</span>
                      <div className="flex items-center gap-1" dir="ltr">
                        <span className="text-sm font-black">{finalTotalAmount.toLocaleString()}</span>
                        <span className="text-[10px] opacity-80">ج.م</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              <DialogFooter className="mt-2 flex gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting} className="h-8 text-sm">
                  إلغاء
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px] h-8 text-sm">
                  {isSubmitting ? "جاري الإضافة..." : "حفظ الطلب"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-max">
          <button 
            onClick={() => setActiveTab("active")}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === "active" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            الطلبات النشطة
          </button>
          <button 
            onClick={() => setActiveTab("deleted")}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === "deleted" ? "bg-white text-red-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            سجل المحذوفات
          </button>
        </div>
        <div className="flex gap-2 w-full max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="ابحث بالاسم، الهاتف، أو رقم الطلب..." 
              className="pr-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {selectedOrderIds.length > 0 && activeTab === "active" && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
          <div className="font-bold flex items-center gap-2">
            <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">{selectedOrderIds.length}</span>
            طلب محدد
          </div>
          <div className="flex flex-wrap justify-center sm:justify-end gap-2 items-center w-full sm:w-auto">
            <select
              className="h-9 px-3 rounded-md border border-gray-200 text-sm focus:outline-none"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="">تغيير الحالة...</option>
              <option value="pending">في الانتظار</option>
              <option value="shipped">في الشحن</option>
              <option value="delivered">تم التوصيل</option>
            </select>

            <Button 
              size="sm" 
              onClick={handleBulkApply} 
              disabled={isSubmitting || !bulkStatus} 
              className="bg-indigo-600 hover:bg-indigo-700 h-9"
            >
              تطبيق
            </Button>

            <Button variant="outline" size="sm" className="bg-white hover:bg-gray-50 text-gray-700" onClick={handlePrintMultipleWaybills} disabled={isSubmitting}>
              <Printer className="w-4 h-4 ml-2" />
              طباعة بوليصات
            </Button>

            <Button variant="outline" size="sm" className="bg-white hover:bg-gray-50" onClick={() => setSelectedOrderIds([])} disabled={isSubmitting}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-gray-300 accent-indigo-600 cursor-pointer" 
                  checked={isAllSelected} 
                  onChange={(e) => handleSelectAll(e.target.checked)} 
                />
              </TableHead>
              <TableHead className="text-right">رقم الطلب</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-right">الإجمالي (ج.م)</TableHead>
              <TableHead className="text-right p-0">
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || "all")}>
                  <SelectTrigger className="w-full border-none bg-transparent shadow-none font-bold text-gray-500 hover:text-gray-900 focus:ring-0 text-right px-4">
                    <SelectValue placeholder="الحالة">
                      {statusFilter === "all" ? "الحالة" : getStatusText(statusFilter)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الحالة</SelectItem>
                    <SelectItem value="pending">{`في الانتظار (${orders.filter(o => (activeTab === 'deleted' ? o.is_deleted : !o.is_deleted) && o.status === 'pending' && isOrderMatchingSearchAndShipping(o)).length})`}</SelectItem>
                    <SelectItem value="shipped">{`في الشحن (${orders.filter(o => (activeTab === 'deleted' ? o.is_deleted : !o.is_deleted) && o.status === 'shipped' && isOrderMatchingSearchAndShipping(o)).length})`}</SelectItem>
                    <SelectItem value="delivered">{`تم التوصيل (${orders.filter(o => (activeTab === 'deleted' ? o.is_deleted : !o.is_deleted) && o.status === 'delivered' && isOrderMatchingSearchAndShipping(o)).length})`}</SelectItem>
                    <SelectItem value="partially_delivered">{`توصيل جزئي (${orders.filter(o => (activeTab === 'deleted' ? o.is_deleted : !o.is_deleted) && o.status === 'partially_delivered' && isOrderMatchingSearchAndShipping(o)).length})`}</SelectItem>
                    <SelectItem value="cancelled">{`ملغي / مرتجع (${orders.filter(o => (activeTab === 'deleted' ? o.is_deleted : !o.is_deleted) && ['cancelled', 'returned_inventory', 'returned_shipping'].includes(o.status) && isOrderMatchingSearchAndShipping(o)).length})`}</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              
              <TableHead className="text-right p-0">
                <Select value={shippingCompanyFilter} onValueChange={(val) => setShippingCompanyFilter(val || "all")}>
                  <SelectTrigger className="w-full border-none bg-transparent shadow-none font-bold text-gray-500 hover:text-gray-900 focus:ring-0 text-right px-4">
                    <SelectValue placeholder="شركة الشحن">
                      {shippingCompanyFilter === "all" ? "شركة الشحن" : shippingCompanyFilter}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {Array.from(new Set(orders.map(order => {
                      const courier = Array.isArray(order.shipments) ? order.shipments[0]?.courier : order.shipments?.courier;
                      return courier;
                    }).filter(Boolean))).map((courier, idx) => (
                      <SelectItem key={idx} value={courier as string}>
                        {courier as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="text-right">رقم التتبع</TableHead>
              <TableHead className="text-right" colSpan={activeTab === "active" ? 1 : 2}>ملاحظات</TableHead>
              <TableHead className="text-left"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24">
                  لا يوجد طلبات حالياً
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => {
                const shipment = Array.isArray(order.shipments) ? order.shipments[0] : order.shipments || {};
                const isExpanded = expandedOrderId === order.id;

                return (
                  <React.Fragment key={order.id}>
                    <TableRow className={isExpanded ? "bg-indigo-50/40" : "hover:bg-gray-50/50"}>
                      <TableCell className="text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer" 
                          checked={selectedOrderIds.includes(order.id)} 
                          onChange={(e) => handleSelectOne(order.id, e.target.checked)} 
                        />
                      </TableCell>
                      <TableCell className="font-medium text-xs font-mono" dir="ltr">
                        #{order.id.substring(0,8)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800">{order.customers?.name || "-"}</span>
                          <span className="text-xs text-gray-500 font-mono mt-0.5">{order.customers?.phone || ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{Number(order.total_amount).toLocaleString()}</TableCell>

                      {isExpanded ? (
                        <>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <select
                                className="flex h-8 w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                value={newStatus}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewStatus(val);
                                  if (val === "partially_delivered") {
                                    setPartialOrder(order);
                                    setPartialItems(order.order_items?.map((i: any) => ({
                                      order_item_id: i.id,
                                      product_variant_id: i.product_variant_id,
                                      title: i.product_variants?.products?.name || "منتج",
                                      qty_returned: 0,
                                      max: i.quantity,
                                      unit_price: i.unit_price
                                    })) || []);
                                    setPartialNewTotal(order.total_amount?.toString() || "");
                                    setPartialModalOpen(true);
                                  }
                                }}
                              >
                                <option value="pending">في الانتظار</option>
                                <option value="shipped">في الشحن</option>
                                <option value="delivered">تم التوصيل</option>
                                <option value="partially_delivered">توصيل جزئي</option>
                                <option value="cancelled">ملغي / مرتجع</option>
                              </select>
                              {newStatus === "cancelled" && (
                                <Input 
                                  value={shippingLoss} 
                                  onChange={(e) => setShippingLoss(e.target.value)} 
                                  placeholder="خسارة الشحن" 
                                  type="number"
                                  className="h-8 w-32 text-xs px-2 border-red-200 focus-visible:ring-red-500 mt-1" 
                                />
                              )}
                              {newStatus === "delivered" && order.order_type === "exchange" && (
                                <div className="flex items-center gap-2 mt-2">
                                  <input 
                                    type="checkbox" 
                                    id={`refuse-ship-${order.id}`} 
                                    className="w-4 h-4 rounded border-gray-300 accent-red-600 cursor-pointer" 
                                    checked={customerRefusedShipping} 
                                    onChange={(e) => setCustomerRefusedShipping(e.target.checked)} 
                                  />
                                  <label htmlFor={`refuse-ship-${order.id}`} className="text-[11px] text-red-600 font-bold whitespace-nowrap cursor-pointer">
                                    رفض دفع الشحن (خسارة)
                                  </label>
                                </div>
                              )}

                              {!["pending", "returned_inventory", "shipped", "returned_shipping", "cancelled", "delivered", "partially_delivered"].includes(newStatus) && (
                                <select
                                  className={`flex h-7 w-32 rounded-md border px-1 py-0 text-[10px] focus:outline-none ${newStockLocation === "inventory" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-green-50 text-green-700 border-green-200"}`}
                                  value={newStockLocation}
                                  onChange={(e) => setNewStockLocation(e.target.value as "inventory" | "shipping")}
                                >
                                  <option value="shipping">🚚 في شركة الشحن</option>
                                  <option value="inventory">📦 في المخزن</option>
                                </select>
                              )}
                            </div>
                          </TableCell>
                          
                          <TableCell>
                            <Input value={newCourier} onChange={(e) => setNewCourier(e.target.value)} placeholder="شركة الشحن" className="h-8 w-24 text-xs px-2" />
                          </TableCell>
                          <TableCell dir="ltr" className="text-right">
                            <Input value={newTracking} onChange={(e) => setNewTracking(e.target.value)} placeholder="رقم التتبع" className="h-8 w-28 text-xs font-mono px-2" />
                          </TableCell>
                          <TableCell className="text-right" colSpan={activeTab === "active" ? 1 : 2}>
                            {newPaymentStatus === "partial" && (
                              <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="ملاحظات الدفع الجزئي..." className="h-8 w-32 text-xs px-2" />
                            )}
                          </TableCell>
                          <TableCell className="text-left">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" onClick={handleUpdateStatus} disabled={isSubmitting} className="h-8 text-xs px-2 bg-indigo-600 hover:bg-indigo-700">
                                {isSubmitting ? "..." : "حفظ"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setExpandedOrderId(null)} className="h-8 text-xs px-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                                إلغاء
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>{getStatusBadge(order)}</TableCell>
                          
                          <TableCell>{shipment.courier || "-"}</TableCell>
                          <TableCell dir="ltr" className="text-right">
                            {shipment.tracking_number ? (
                              <span className="font-mono text-xs bg-gray-50 px-2 py-1 rounded border">
                                {shipment.tracking_number}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-gray-500 max-w-[120px] truncate" colSpan={activeTab === "active" ? 1 : 2}>
                            {order.payment_status === "partial" && order.notes ? order.notes : ""}
                          </TableCell>
                          <TableCell className="text-left">
                            <div className="flex items-center justify-end gap-2">
                              {activeTab === "active" ? (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => handleOpenStatus(order)} className="h-8">
                                    تحديث الحالة
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handlePrintWaybill(order)} className="text-gray-600 h-8 w-8 hover:bg-gray-100" title="طباعة بوليصة">
                                    <Printer className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleOpenDetails(order)} className="text-indigo-600 h-8 w-8 hover:bg-indigo-50" title="التفاصيل">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(order)} className="text-yellow-600 h-8 w-8 hover:bg-yellow-50" title="تعديل">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleOpenExchange(order)} className="text-teal-600 h-8 w-8 hover:bg-teal-50" title="استبدال">
                                    <ArrowRightLeft className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteOrder(order)} className="text-red-500 h-8 w-8 hover:bg-red-50 hover:text-red-600" title="حذف">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => handleOpenDetails(order)} className="text-indigo-600 h-8 w-8 hover:bg-indigo-50">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleRestoreOrder(order)} className="h-8 border-green-500 text-green-600 hover:bg-green-50">
                                    استعادة
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-indigo-900 border-b pb-4">تفاصيل الطلب</DialogTitle>
            <DialogDescription dir="ltr" className="text-right text-lg font-mono text-indigo-600 mt-2">
              {selectedOrder ? `#${selectedOrder.id.substring(0,8)}` : ""}
            </DialogDescription>
          </DialogHeader>
          
          {(() => {
            const displayOrder = orders.find(o => o.id === selectedOrder?.id) || selectedOrder;
            if (!displayOrder) return null;
            return (
            <div className="grid md:grid-cols-2 gap-6 mt-2">
              
              {/* Right Column (in RTL): Customer & Shipping Info */}
              <div className="space-y-6">
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 shadow-sm">
                  <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                    👤 بيانات العميل
                  </h4>
                  <div className="text-sm space-y-3">
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500">الاسم:</span> <span className="font-medium">{displayOrder.customers?.name}</span></div>
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500">الهاتف:</span> <span className="font-medium font-mono" dir="ltr">{displayOrder.customers?.phone}</span></div>
                    <div className="flex justify-between border-b pb-2"><span className="text-gray-500">المدينة:</span> <span className="font-medium">{displayOrder.customers?.city}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">العنوان:</span> <span className="font-medium text-left max-w-[200px]">{displayOrder.customers?.address}</span></div>
                  </div>
                </div>
                
                <div className="bg-indigo-50/70 p-5 rounded-xl border border-indigo-100 shadow-sm">
                  <h4 className="font-bold text-indigo-800 mb-4 flex items-center gap-2 text-lg">
                    <Truck className="w-5 h-5" />
                    حالة الطلب والشحن
                  </h4>
                  <div className="text-sm space-y-3">
                    <div className="flex justify-between items-center border-b border-indigo-100 pb-2"><span className="text-gray-500">الحالة:</span> <span>{getStatusBadge(displayOrder)}</span></div>
                    
                    <div className="flex justify-between items-center border-b border-indigo-100 pb-2">
                      <span className="text-gray-500">شركة الشحن:</span> 
                      <span className="font-medium bg-white px-2 py-1 rounded border">{Array.isArray(displayOrder.shipments) ? displayOrder.shipments[0]?.courier || "-" : displayOrder.shipments?.courier || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">رقم التتبع:</span> 
                      <span className="font-mono text-left bg-white px-2 py-1 rounded border" dir="ltr">{Array.isArray(displayOrder.shipments) ? displayOrder.shipments[0]?.tracking_number || "-" : displayOrder.shipments?.tracking_number || "-"}</span>
                    </div>
                    {displayOrder.notes && (
                      <div className="mt-3 pt-3 border-t border-indigo-200">
                        <span className="text-gray-500 block mb-2 font-medium">ملاحظات الإدارة:</span>
                        <p className="bg-white p-3 rounded-lg text-gray-700 text-sm leading-relaxed border shadow-inner">{displayOrder.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Left Column (in RTL): Products & Total */}
              <div className="space-y-6 flex flex-col">
                <div className="flex-1 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                    📦 المنتجات المطلوبة
                  </h4>
                  <div className="border rounded-lg divide-y bg-gray-50/50 flex-1 overflow-y-auto max-h-[300px]">
                    {displayOrder.order_items?.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center p-4 hover:bg-white transition-colors">
                        <div>
                          <p className="font-bold text-gray-800">{item.product_variants?.products?.name}</p>
                          <p className="text-gray-500 text-xs mt-1 bg-gray-200 inline-block px-2 py-0.5 rounded">{item.product_variants?.size}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-gray-500 text-xs">{item.quantity} × {item.unit_price} ج.م</p>
                          <p className="font-bold text-indigo-600 mt-1">{Number(item.quantity) * Number(item.unit_price)} ج.م</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-between items-center bg-gradient-to-l from-indigo-600 to-indigo-800 text-white p-5 rounded-xl font-bold shadow-lg mt-auto">
                  <span className="text-lg">إجمالي الطلب:</span>
                  <span className="text-2xl">{Number(displayOrder.total_amount).toLocaleString()} ج.م</span>
                </div>
              </div>

            </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      
      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => !open && setConfirmDialog(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{confirmDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700 font-medium">{confirmDialog.message}</p>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}>
              إلغاء
            </Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white" 
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
              }}
            >
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial Delivery Modal */}
      <Dialog open={partialModalOpen} onOpenChange={setPartialModalOpen}>
        <DialogContent className="sm:max-w-[450px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-teal-700">تفاصيل التوصيل الجزئي</DialogTitle>
            <DialogDescription>
              {partialOrder ? `طلب #${partialOrder.id.substring(0,8)}` : ''}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-teal-700 font-bold">المبلغ المحصل الفعلي</Label>
              <Input 
                value={partialNewTotal} 
                onChange={(e) => setPartialNewTotal(e.target.value)} 
                placeholder="أدخل المبلغ المحصل" 
                type="number"
                className="border-teal-200 focus-visible:ring-teal-500 text-lg font-bold" 
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-teal-700 font-bold">القطع المرتجعة (ستعود للمخزن تلقائياً)</Label>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {partialItems.map((ritem, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 bg-white p-3 rounded-md border border-gray-200 shadow-sm">
                    <span className="truncate flex-1 text-sm font-medium" title={ritem.title}>{ritem.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">من أصل {ritem.max}</span>
                      <Select 
                        value={ritem.qty_returned.toString()}
                        onValueChange={(val) => {
                          const v = parseInt(val) || 0;
                          const copy = [...partialItems];
                          copy[idx].qty_returned = v;
                          setPartialItems(copy);
                        }}
                      >
                        <SelectTrigger className="w-20 h-8 text-center border-teal-100 focus:ring-teal-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: ritem.max + 1 }).map((_, i) => (
                            <SelectItem key={i} value={i.toString()}>{i}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button onClick={handlePartialDeliverySubmit} disabled={isSubmitting} className="bg-teal-600 hover:bg-teal-700 text-white w-full sm:w-auto">
              {isSubmitting ? "جاري الحفظ..." : "تأكيد التوصيل الجزئي"}
            </Button>
            <Button variant="ghost" onClick={() => setPartialModalOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
