"use client";

import { useState, useEffect } from "react";
import { DollarSign, Package, ShoppingCart, Truck, AlertTriangle, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function DashboardPage() {
  const [lowStockVariants, setLowStockVariants] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    pendingOrders: 0,
    inventoryValue: 0,
    supplierDues: 0,
    vaultProfit: 0,
    totalOrdersCount: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    // Fetch tenant first (needed for other queries)
    const { data: tenantData } = await supabase.from("tenants").select("*").single();
    if (tenantData) setTenant(tenantData);
    if (!tenantData) return;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run all queries in parallel
    const [
      lowStockRes,
      salesRes,
      pendingRes,
      totalOrdersRes,
      recentOrdersRes,
      suppliersRes,
      paidOrdersRes
    ] = await Promise.all([
      // 1. Low Stock & Inventory Value
      supabase.from("product_variants").select(`*, products ( name )`),
      // 2. Sales data (last 30 days)
      supabase.from('orders').select('total_amount, shipping_fee, created_at')
        .eq('tenant_id', tenantData.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .not('status', 'in', '("cancelled","returned_inventory","returned_shipping")')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      // 3. Pending Orders count
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantData.id)
        .eq('status', 'pending')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      // 4. Total Orders count
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantData.id)
        .or('is_deleted.is.null,is_deleted.eq.false'),
      // 5. Recent Orders
      supabase.from('orders').select(`id, total_amount, created_at, customers ( name )`)
        .eq('tenant_id', tenantData.id)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('created_at', { ascending: false })
        .limit(5),
      // 6. Supplier Dues
      supabase.from('suppliers').select('balance')
        .eq('tenant_id', tenantData.id)
        .gt('balance', 0),
      // 7. Vault Profit
      supabase.from('orders')
        .select(`id, is_deleted, total_amount, shipping_fee, order_items ( quantity, unit_price, product_variants ( normal_cost ) )`)
        .in('payment_status', ['paid', 'partial'])
        .eq('tenant_id', tenantData.id)
    ]);

    // Process results
    let newMetrics: any = {};

    // Low Stock
    if (lowStockRes.data) {
      const lowStock = lowStockRes.data.filter(v => {
        const baseline = Number(v.baseline_stock) || 1;
        const ratio = Number(v.stock_quantity) / baseline;
        return ratio <= 0.20;
      });
      setLowStockVariants(lowStock);
      newMetrics.inventoryValue = lowStockRes.data.reduce((acc, curr) => acc + (Number(curr.stock_quantity) * Number(curr.normal_cost)), 0);
    }

    // Sales
    if (salesRes.data) {
      const thisMonthSales = salesRes.data.filter(s => new Date(s.created_at) >= new Date(startOfMonth));
      newMetrics.totalSales = thisMonthSales.reduce((acc, curr) => acc + (Number(curr.total_amount) - Number(curr.shipping_fee || 0)), 0);

      const dailySales: Record<string, number> = {};
      salesRes.data.forEach(order => {
        const date = new Date(order.created_at).toLocaleDateString('en-CA');
        if (!dailySales[date]) dailySales[date] = 0;
        dailySales[date] += (Number(order.total_amount) - Number(order.shipping_fee || 0));
      });
      setChartData(Object.keys(dailySales).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).map(date => ({ date, amount: dailySales[date] })));
    }

    // Counts
    if (pendingRes.count !== null) newMetrics.pendingOrders = pendingRes.count;
    newMetrics.totalOrdersCount = totalOrdersRes.count || 0;

    // Recent Orders
    if (recentOrdersRes.data) setRecentOrders(recentOrdersRes.data);

    // Supplier Dues
    if (suppliersRes.data) {
      newMetrics.supplierDues = suppliersRes.data.reduce((acc, curr) => acc + Number(curr.balance), 0);
    }

    // Vault Profit
    if (paidOrdersRes.data) {
      let vaultProfit = 0;
      paidOrdersRes.data.filter((o: any) => o.is_deleted !== true).forEach(order => {
        let orderRevenue = 0;
        let totalCost = 0;
        order.order_items?.forEach((item: any) => {
           const qty = Number(item.quantity) || 0;
           const price = Number(item.unit_price) || 0;
           const cost = Number(item.product_variants?.normal_cost) || 0;
           
           orderRevenue += qty * price;
           totalCost += qty * cost;
        });

        // Use manual total_amount if present (e.g. from partial deliveries or discounts)
        // Subtract shipping fee to get actual item revenue for profit calculation
        const itemRevenue = (order.total_amount !== null && order.total_amount !== undefined) 
          ? Number(order.total_amount) - Number(order.shipping_fee || 0)
          : orderRevenue;
          
        vaultProfit += (itemRevenue - totalCost);
      });
      newMetrics.vaultProfit = vaultProfit;
    }

    // Set all metrics at once (single state update instead of 6 separate ones)
    setMetrics(prev => ({ ...prev, ...newMetrics }));
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">نظرة عامة</h2>
        <p className="text-sm text-gray-500 mt-1">ملخص أداء متجرك لهذا الشهر</p>
      </div>

      {/* ─── Metric Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">المبيعات (الشهر)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white" dir="ltr">
            {metrics.totalSales.toLocaleString()} <span className="text-sm font-normal text-gray-400">ج.م</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">من أول الشهر الحالي</p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">الخزنة (الأرباح)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white" dir="ltr">
            {metrics.vaultProfit.toLocaleString()} <span className="text-sm font-normal text-gray-400">ج.م</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">من الطلبات المدفوعة</p>
        </div>
        
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">الطلبات المعلقة</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white" dir="ltr">
            {metrics.pendingOrders}
          </div>
          <p className="text-xs text-gray-400 mt-1">بانتظار التأكيد أو الشحن</p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">قيمة المخزون</span>
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white" dir="ltr">
            {metrics.inventoryValue.toLocaleString()} <span className="text-sm font-normal text-gray-400">ج.م</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">بناءً على سعر الشراء</p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">مستحقات الموردين</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <Truck className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400" dir="ltr">
            {metrics.supplierDues.toLocaleString()} <span className="text-sm font-normal">ج.م</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">إجمالي الديون</p>
        </div>
      </div>

      {/* ─── Low Stock Alert ─── */}
      {lowStockVariants.length > 0 && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-red-200 dark:border-red-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">تنبيهات انخفاض المخزون</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockVariants.map((v) => {
              const baseline = Number(v.baseline_stock) || 1;
              const ratio = Number(v.stock_quantity) / baseline;
              let alertText = "تنبيه";
              if (ratio <= 0) alertText = "نفذ المخزون (0%)";
              else if (ratio <= 0.1) alertText = "متبقي 10% أو أقل";
              else if (ratio <= 0.2) alertText = "متبقي 20% أو أقل";
              
              return (
              <Badge key={v.id} variant="destructive" className="px-3 py-1 text-xs bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                {v.products?.name} - {v.size} ({v.color}) | {alertText} (الكمية: {v.stock_quantity})
              </Badge>
            )})}
          </div>
        </div>
      )}

      {/* ─── Charts & Recent Orders ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-4 bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">المبيعات الأخيرة (30 يوم)</h3>
          <div className="h-[280px] w-full" dir="ltr">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-white/10">
                <span className="text-gray-400 text-sm">لا توجد بيانات كافية</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => {
                      const d = new Date(value);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis 
                    stroke="#9CA3AF" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `${value.toLocaleString()}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: '13px' }}
                    formatter={(value: any) => [`${Number(value).toLocaleString()} ج.م`, 'المبيعات']}
                    labelFormatter={(label) => {
                      const d = new Date(label);
                      return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#4F46E5" 
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#4F46E5' }}
                    animationDuration={1200}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-3 bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">أحدث الطلبات</h3>
          {recentOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              لا توجد طلبات مسجلة بعد
            </div>
          ) : (
            <div className="space-y-4">
              {recentOrders.map((order, i) => (
                <div key={order.id} className="flex items-center gap-3 py-2">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {order.customers?.name || "عميل غير معروف"}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {tenant?.name || 'ميتش'} #{String(metrics.totalOrdersCount - i).padStart(4, '0')}
                    </p>
                  </div>
                  <div className="font-semibold text-sm text-gray-900 dark:text-white whitespace-nowrap" dir="ltr">
                    +{Number(order.total_amount).toLocaleString()} ج.م
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
