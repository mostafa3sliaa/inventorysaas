"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, DollarSign, FileText, Sheet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [salesTotal, setSalesTotal] = useState(0);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [dateRange, setDateRange] = useState("monthly");
  const [chartData, setChartData] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetchMetrics();
    generateMockChartData();
  }, [dateRange]);

  const generateMockChartData = () => {
    if (dateRange === "monthly") {
      setChartData([
        { name: "الأسبوع 1", sales: 4000, purchases: 2400 },
        { name: "الأسبوع 2", sales: 3000, purchases: 1398 },
        { name: "الأسبوع 3", sales: 12000, purchases: 9800 },
        { name: "الأسبوع 4", sales: 2780, purchases: 3908 },
      ]);
    } else {
      setChartData([
        { name: "الشهر 1", sales: 15000, purchases: 8000 },
        { name: "الشهر 2", sales: 23000, purchases: 12000 },
        { name: "الشهر 3", sales: 18000, purchases: 9500 },
      ]);
    }
  };

  const fetchMetrics = async () => {
    setLoading(true);
    const { data: salesData } = await supabase
      .from("orders")
      .select("total_amount, shipping_fee")
      .not('status', 'in', '("cancelled","returned_inventory","returned_shipping")');
    const { data: purchasesData } = await supabase
      .from("purchases")
      .select("total_amount");
    const tSales = salesData?.reduce((acc, curr) => acc + (Number(curr.total_amount) - Number(curr.shipping_fee || 0)), 0) || 0;
    const tPurchases = purchasesData?.reduce((acc, curr) => acc + Number(curr.total_amount), 0) || 0;
    setSalesTotal(tSales);
    setPurchasesTotal(tPurchases);
    setLoading(false);
  };

  const exportExcel = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, total_amount, shipping_fee, status, created_at, customers(name)")
      .order("created_at", { ascending: false });

    if (error) { toast.error("حدث خطأ أثناء التصدير"); return; }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("تقرير المبيعات", { views: [{ rightToLeft: true }] });

    worksheet.columns = [
      { header: "رقم الطلب", key: "id", width: 35 },
      { header: "العميل", key: "customer", width: 25 },
      { header: "المبلغ (ج.م)", key: "amount", width: 15 },
      { header: "الحالة", key: "status", width: 15 },
      { header: "التاريخ", key: "date", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    worksheet.getRow(1).alignment = { horizontal: 'center' };

    data.forEach((order: any) => {
      worksheet.addRow({
        id: order.id,
        customer: order.customers?.name || "غير معروف",
        amount: Number(order.total_amount) - Number(order.shipping_fee || 0),
        status: order.status === "pending" ? "قيد الانتظار" : order.status === "shipped" ? "تم الشحن" : "مكتمل",
        date: new Date(order.created_at).toLocaleDateString("ar-EG")
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `تقرير_المبيعات_${new Date().getTime()}.xlsx`;
    link.click();
    toast.success("تم تصدير Excel بنجاح");
  };

  const exportPDF = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, total_amount, status, created_at, customers(name)")
      .limit(50)
      .order("created_at", { ascending: false });

    if (error) { toast.error("حدث خطأ أثناء التصدير"); return; }

    const jsPDF = (await import("jspdf")).default;
    await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFont("helvetica");
    doc.setFontSize(20);
    doc.text("Sales Report", 105, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 22, { align: "center" });

    const tableColumn = ["Order ID", "Customer", "Amount (EGP)", "Status", "Date"];
    const tableRows: any[] = [];

    data.forEach((order: any) => {
      tableRows.push([
        order.id.split('-')[0],
        order.customers?.name || "Unknown",
        Number(order.total_amount) - Number(order.shipping_fee || 0),
        order.status,
        new Date(order.created_at).toLocaleDateString()
      ]);
    });

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    doc.save(`Sales_Report_${new Date().getTime()}.pdf`);
    toast.success("تم تصدير PDF بنجاح");
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">التقارير والأرباح</h2>
          <p className="text-sm text-gray-500 mt-1">عرض ملخص مالي وتحليل الأداء</p>
        </div>
        <div className="flex bg-gray-100 dark:bg-white/[0.06] p-1 rounded-lg">
          <button 
            onClick={() => setDateRange("monthly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${dateRange === "monthly" ? "bg-white dark:bg-[#1E293B] shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700"}`}
          >
            شهري
          </button>
          <button 
            onClick={() => setDateRange("quarterly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${dateRange === "quarterly" ? "bg-white dark:bg-[#1E293B] shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700"}`}
          >
            ربع سنوي
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">إجمالي المبيعات</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{loading ? "..." : salesTotal.toLocaleString()} ج.م</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">إجمالي المشتريات</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600">{loading ? "..." : purchasesTotal.toLocaleString()} ج.م</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">صافي الربح / الخسارة</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-indigo-600" />
            </div>
          </div>
          <div className={`text-2xl font-bold ${salesTotal - purchasesTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {loading ? "..." : (salesTotal - purchasesTotal).toLocaleString()} ج.م
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2 mb-6">
          <TabsTrigger value="overview">نظرة عامة على الأداء</TabsTrigger>
          <TabsTrigger value="exports">تصدير التقارير</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              مقارنة المبيعات والمشتريات ({dateRange === "monthly" ? "شهري" : "ربع سنوي"})
            </h3>
            <div className="h-[400px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} stroke="#9CA3AF" fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value}`} stroke="#9CA3AF" fontSize={11} />
                  <Tooltip 
                    cursor={{fill: 'rgba(79, 70, 229, 0.04)'}}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: '13px' }} 
                  />
                  <Legend />
                  <Bar dataKey="sales" name="المبيعات" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="purchases" name="المشتريات" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="exports">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-6">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 rounded-lg flex items-center justify-center mb-4">
                <Sheet className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">تقرير Excel</h3>
              <p className="text-sm text-gray-500 mb-4">تحميل تقرير مفصل بصيغة Excel.</p>
              <Button onClick={exportExcel} className="w-full flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Download className="w-4 h-4" />
                تحميل التقرير
              </Button>
            </div>

            <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-white/[0.06] p-6">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 text-red-700 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">تقرير PDF</h3>
              <p className="text-sm text-gray-500 mb-4">نسخة جاهزة للطباعة بصيغة PDF.</p>
              <Button onClick={exportPDF} className="w-full flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white">
                <Download className="w-4 h-4" />
                تحميل التقرير
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
