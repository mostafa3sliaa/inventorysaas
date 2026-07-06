"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant } from "@/components/shared/TenantProvider";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { UploadCloud, Image as ImageIcon, Shield, User, Trash2, AlertTriangle, Users, Settings, LogOut, Check, X, ShieldAlert, Palette, Building2, Plus, Pencil, Activity, Clock } from "lucide-react";
import { logActivity } from "@/utils/logger";

export default function SettingsPage() {
  const availablePages = [
    { id: "/dashboard/inventory", label: "المخزون" },
    { id: "/dashboard/orders", label: "الطلبات" },
    { id: "/dashboard/treasury", label: "الخزنة" },
    { id: "/dashboard/suppliers", label: "الموردين" },
    { id: "/dashboard/reports", label: "التقارير" },
    { id: "/dashboard/settings", label: "الإعدادات" },
  ];

  const { tenant, currentUser, loading: tenantLoading, refreshTenant } = useTenant();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4F46E5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // User Management State
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("sales");
  const [newUserPages, setNewUserPages] = useState<string[]>([]);
  const [addingUser, setAddingUser] = useState(false);

  // Edit User State
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("sales");
  const [editPassword, setEditPassword] = useState("");
  const [editUserPages, setEditUserPages] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || "");
      setColor(tenant.primary_color || "#000000");
      setLogoUrl(tenant.logo_url || "");
    }
  }, [tenant]);

  useEffect(() => {
    if (tenant && currentUser?.role === "admin") {
      fetchUsers();
      fetchActivityLogs();
    }
  }, [tenant, currentUser]);

  const fetchActivityLogs = async () => {
    setLoadingActivity(true);
    const { data, error } = await supabase
      .from("activity_logs")
      .select(`*, users(full_name)`)
      .eq("tenant_id", tenant?.id)
      .order("created_at", { ascending: false })
      .limit(100);
      
    if (!error && data) {
      setActivityLogs(data);
    }
    setLoadingActivity(false);
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("tenant_id", tenant?.id)
      .order("created_at", { ascending: true });
      
    if (!error && data) {
      setUsers(data);
    }
    setLoadingUsers(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", userId);
      
    if (error) {
      toast.error("فشل في تحديث صلاحية المستخدم");
    } else {
      logActivity(supabase, tenant?.id, currentUser?.id, "تغيير صلاحية مستخدم", "user", userId);
      toast.success("تم تحديث الصلاحية بنجاح");
      fetchUsers();
    }
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);

    const { error } = await supabase
      .from("users")
      .update({ full_name: editName, role: editRole, permissions: { pages: editUserPages } })
      .eq("id", editingUser.id);

    if (error) {
      toast.error("حدث خطأ أثناء تعديل بيانات المستخدم");
      setSavingEdit(false);
      return;
    }

    // Update password if provided
    if (editPassword && editPassword.length >= 6) {
      try {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: editPassword })
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "فشل تحديث كلمة المرور");
        }
      } catch (err: any) {
        toast.error(err.message);
        setSavingEdit(false);
        return;
      }
    } else if (editPassword && editPassword.length > 0 && editPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      setSavingEdit(false);
      return;
    }

    logActivity(supabase, tenant?.id, currentUser?.id, "تعديل بيانات مستخدم", "user", editingUser.id);
    toast.success("تم التعديل بنجاح");
    setEditUserOpen(false);
    fetchUsers();
    setSavingEdit(false);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("هل أنت متأكد من إزالة هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    
    // Note: This only deletes the profile from public.users, not auth.users
    // A proper implementation needs Edge Functions to delete auth user
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);
      
    if (error) {
      toast.error("فشل في إزالة المستخدم");
    } else {
      logActivity(supabase, tenant?.id, currentUser?.id, "إزالة مستخدم", "user", userId);
      toast.success("تم إزالة المستخدم بنجاح");
      fetchUsers();
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setAddingUser(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          data: {
            full_name: newUserName,
            role: newUserRole,
            tenant_id: tenant.id,
            permissions: { pages: newUserPages }
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || data.message || "فشل إضافة المستخدم");
      }

      logActivity(supabase, tenant?.id, currentUser?.id, "إضافة مستخدم جديد", "user");
      toast.success("تم إضافة المستخدم بنجاح!");
      setAddUserOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);
    
    const { error } = await supabase
      .from("tenants")
      .update({ name, primary_color: color, logo_url: logoUrl })
      .eq("id", tenant.id);

    if (error) {
      toast.error("حدث خطأ أثناء حفظ الإعدادات");
    } else {
      logActivity(supabase, tenant?.id, currentUser?.id, "تحديث إعدادات النظام", "settings");
      toast.success("تم حفظ الإعدادات بنجاح");
      document.documentElement.style.setProperty("--primary", color);
      if (typeof refreshTenant === "function") {
        await refreshTenant();
      }
    }
    
    setSaving(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error("يجب اختيار صورة");
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${tenant?.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from("branding")
        .getPublicUrl(filePath);
        
      if (data) {
        setLogoUrl(data.publicUrl);
        toast.success("تم رفع الشعار بنجاح، لا تنس حفظ التغييرات");
      }
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  const handleResetData = async () => {
    if (!window.confirm("هل أنت متأكد من مسح جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه.")) return;

    setResetting(true);
    try {
      const res = await fetch("/api/reset-data", {
        method: "POST"
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "فشل تصفير البيانات");
      
      logActivity(supabase, tenant?.id, currentUser?.id, "تصفير ومسح جميع البيانات", "settings");
      toast.success(data.message);
      // Reload page to reflect changes
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setResetting(false);
    }
  };

  if (tenantLoading) return <div className="flex items-center justify-center h-64 text-gray-500">جاري التحميل...</div>;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 dark:from-[#0F172A] dark:via-[#0F172A] dark:to-[#1E293B] -m-4 sm:-m-8 p-4 sm:p-8 overflow-hidden">
      {/* Decorative Blobs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-400/20 dark:bg-indigo-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-400/20 dark:bg-purple-600/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />
      
      <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20 text-indigo-700 dark:text-indigo-300 rounded-2xl shadow-inner">
              <Settings className="w-6 h-6" />
            </div>
            <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-l from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 tracking-tight">إعدادات النظام</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 pr-14 leading-relaxed max-w-xl">
            قم بتخصيص الهوية البصرية لشركتك، وإدارة فريق العمل والصلاحيات، وتحكم كامل في إعدادات المنصة بما يتناسب مع احتياجات عملك.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSave} 
            disabled={saving} 
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 px-8 rounded-2xl h-12 font-bold"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                جاري الحفظ...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                حفظ التغييرات
              </span>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-8 w-full items-start" orientation="vertical">
        <TabsList className="flex flex-row md:flex-col w-full md:w-64 h-auto items-stretch justify-start rounded-2xl bg-white/60 dark:bg-[#1E293B]/60 backdrop-blur-md p-3 text-gray-500 shadow-lg shadow-indigo-500/5 border border-white/40 dark:border-white/10 shrink-0 gap-2 overflow-x-auto">
          <TabsTrigger 
            value="general" 
            className="flex items-center gap-3 justify-start rounded-xl px-5 py-3.5 text-sm font-bold transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-white/50 dark:hover:bg-white/5 w-full whitespace-nowrap"
          >
            <Building2 className="w-4 h-4" />
            الإعدادات العامة
          </TabsTrigger>
          <TabsTrigger 
            value="users" 
            className="flex items-center gap-3 justify-start rounded-xl px-5 py-3.5 text-sm font-bold transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-white/50 dark:hover:bg-white/5 w-full whitespace-nowrap"
          >
            <Users className="w-4 h-4" />
            إدارة المستخدمين
          </TabsTrigger>
          <TabsTrigger 
            value="activity" 
            className="flex items-center gap-3 justify-start rounded-xl px-5 py-3.5 text-sm font-bold transition-all duration-300 data-[state=active]:bg-white dark:data-[state=active]:bg-indigo-600 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-white/50 dark:hover:bg-white/5 w-full whitespace-nowrap"
          >
            <Activity className="w-4 h-4" />
            سجل النشاط
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0 w-full">
        {/* General Settings Tab */}
        <TabsContent value="general" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0 data-[state=inactive]:hidden">
          
          {/* Visual Identity Card */}
          <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-indigo-500/5 border border-white/60 dark:border-white/[0.08] overflow-hidden transition-all duration-300 hover:shadow-indigo-500/10">
            <div className="border-b border-gray-100 dark:border-white/[0.06] p-6 bg-gradient-to-r from-gray-50/50 to-white dark:from-white/[0.02] dark:to-transparent flex items-center gap-4">
              <Palette className="w-6 h-6 text-indigo-600 drop-shadow-sm" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">الهوية البصرية</h3>
                <p className="text-sm text-gray-500 mt-0.5">تخصيص اسم الشركة والشعار واللون المميز للتطبيق</p>
              </div>
            </div>
            
            <div className="p-8">
              <div className="flex flex-col md:flex-row gap-10">
                
                {/* Form Fields */}
                <div className="space-y-6 flex-1 max-w-md">
                  <div className="space-y-2.5">
                    <Label htmlFor="companyName" className="text-sm font-medium text-gray-700 dark:text-gray-300">اسم الشركة</Label>
                    <Input 
                      id="companyName" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      className="text-right h-12 bg-white dark:bg-[#0F172A] border-gray-200 dark:border-white/[0.1] focus-visible:ring-indigo-500 rounded-xl"
                      placeholder="أدخل اسم الشركة..."
                    />
                  </div>
                  
                  <div className="space-y-2.5">
                    <Label htmlFor="primaryColor" className="text-sm font-medium text-gray-700 dark:text-gray-300">اللون الأساسي (Primary Color)</Label>
                    <div className="flex gap-4 items-center p-3 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-[#0F172A]">
                      <div className="relative overflow-hidden rounded-lg w-10 h-10 border border-black/10 shrink-0 shadow-sm">
                        <input 
                          id="primaryColor" 
                          type="color"
                          value={color} 
                          onChange={(e) => setColor(e.target.value)} 
                          className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                        />
                      </div>
                      <div className="flex-1 font-mono text-sm text-gray-600 dark:text-gray-300 dir-ltr">{color.toUpperCase()}</div>
                    </div>
                  </div>
                </div>

                {/* Logo Upload */}
                <div className="flex-1">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2.5 block">شعار الشركة (Logo)</Label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-200 dark:border-white/[0.1] rounded-2xl bg-gray-50 dark:bg-[#0F172A] hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all cursor-pointer overflow-hidden min-h-[220px]"
                  >
                    {logoUrl ? (
                      <div className="relative w-40 h-40 flex items-center justify-center p-4 bg-white dark:bg-[#1E293B] rounded-xl shadow-sm border border-gray-100 dark:border-white/[0.05] group-hover:scale-105 transition-transform duration-300 z-10">
                        <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-20 h-20 mb-4 rounded-full bg-white dark:bg-[#1E293B] shadow-sm border border-gray-100 dark:border-white/[0.05] flex items-center justify-center text-gray-300 dark:text-gray-600 group-hover:scale-110 group-hover:text-indigo-400 transition-all duration-300 z-10">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    
                    <div className="mt-4 text-center z-10">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {uploading ? "جاري الرفع..." : (logoUrl ? "اضغط لتغيير الشعار" : "اضغط لرفع شعار جديد")}
                      </p>
                      <p className="text-xs text-gray-400 mt-1.5">
                        PNG, JPG, SVG (حد أقصى 2MB)
                      </p>
                    </div>

                    {/* Hidden input */}
                    <input
                      type="file"
                      id="logo-upload"
                      accept="image/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-sm border border-red-100 dark:border-red-900/20 overflow-hidden relative group">
            {/* Soft red glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-900/10 dark:to-transparent pointer-events-none" />
            
            <div className="p-8 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl shrink-0 group-hover:scale-110 transition-transform">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-700 dark:text-red-400">منطقة الخطر (Danger Zone)</h3>
                  <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1 max-w-xl leading-relaxed">
                    تصفير النظام يمحو <span className="font-semibold underline decoration-red-300 underline-offset-2">جميع</span> المنتجات، الطلبات، العملاء، والموردين. 
                    ستحتفظ فقط بحسابك (المدير) وإعدادات الهوية البصرية. <br/>
                    <strong className="font-bold text-red-700 dark:text-red-400 mt-1 block">هذا الإجراء نهائي ولا يمكن التراجع عنه بأي شكل.</strong>
                  </p>
                </div>
              </div>
              
              <Button 
                variant="destructive" 
                onClick={handleResetData} 
                disabled={resetting || currentUser?.role !== "admin"} 
                className="shrink-0 h-12 px-6 rounded-xl shadow-sm hover:shadow-md transition-all font-semibold"
              >
                {resetting ? "جاري مسح البيانات..." : "مسح جميع البيانات والبدء من جديد"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Users Management Tab */}
        <TabsContent value="users" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0 data-[state=inactive]:hidden">
          <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-indigo-500/5 border border-white/60 dark:border-white/[0.08] overflow-hidden transition-all duration-300 hover:shadow-indigo-500/10">
            
            <div className="border-b border-gray-100 dark:border-white/[0.06] p-6 bg-gray-50/50 dark:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">فريق العمل والموظفين</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    إدارة صلاحيات الوصول والدخول للمنصة
                  </p>
                </div>
              </div>
              
              {currentUser?.role === "admin" && (
                <Button 
                  onClick={() => setAddUserOpen(true)} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md transition-all rounded-xl h-11"
                >
                  <Plus className="w-4 h-4 ml-1.5" />
                  إضافة مستخدم جديد
                </Button>
              )}
            </div>

            <div className="p-0">
              {currentUser?.role !== "admin" ? (
                <div className="text-center p-16">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-[#0F172A] rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 dark:border-white/[0.05]">
                    <Shield className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">صلاحيات غير كافية</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    عذراً، يجب أن تكون بحساب مدير (Admin) للوصول إلى قسم إدارة المستخدمين وتعديل الصلاحيات.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center p-12 text-gray-400">
                      <span className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin mr-3" />
                      جاري تحميل المستخدمين...
                    </div>
                  ) : users.length === 0 ? (
                    <div className="text-center p-12 text-gray-500">لا يوجد مستخدمين آخرين مسجلين في النظام.</div>
                  ) : (
                    users.map((user) => (
                      <div key={user.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors gap-4 group">
                        
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm font-bold text-lg">
                            {user.full_name?.charAt(0) || <User className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">{user.full_name}</p>
                              {user.id === currentUser?.id && (
                                <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                  أنت
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 dir-ltr text-right mt-0.5 font-medium opacity-80">{user.email}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0 opacity-100 md:opacity-70 group-hover:opacity-100 transition-opacity">
                          <Select 
                            defaultValue={user.role} 
                            onValueChange={(val) => handleRoleChange(user.id, val)}
                            disabled={user.id === currentUser?.id}
                          >
                            <SelectTrigger className="w-[150px] h-10 bg-white dark:bg-[#0F172A] border-gray-200 dark:border-white/[0.1] rounded-lg focus:ring-indigo-500">
                              <SelectValue placeholder="الصلاحية" />
                            </SelectTrigger>
                            <SelectContent dir="rtl" className="rounded-xl border-gray-100 shadow-lg">
                              <SelectItem value="admin" className="focus:bg-indigo-50 focus:text-indigo-700 font-medium">مدير (Admin)</SelectItem>
                              <SelectItem value="sales" className="focus:bg-indigo-50 focus:text-indigo-700 font-medium">مبيعات (Sales)</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-10 w-10 shrink-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 border-gray-200 dark:border-white/[0.1] rounded-lg transition-colors"
                            onClick={() => {
                              setEditingUser(user);
                              setEditName(user.full_name || "");
                              setEditRole(user.role || "sales");
                              setEditUserPages(user.permissions?.pages || []);
                              setEditPassword("");
                              setEditUserOpen(true);
                            }}
                            title="تعديل بيانات المستخدم"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-10 w-10 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-gray-200 dark:border-white/[0.1] rounded-lg transition-colors"
                            disabled={user.id === currentUser?.id}
                            onClick={() => handleDeleteUser(user.id)}
                            title="حذف المستخدم"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      
        {/* Activity Log Tab */}
        <TabsContent value="activity" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0 data-[state=inactive]:hidden">
          <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-indigo-500/5 border border-white/60 dark:border-white/[0.08] overflow-hidden transition-all duration-300 hover:shadow-indigo-500/10">
            <div className="border-b border-gray-100 dark:border-white/[0.06] p-6 bg-gradient-to-r from-gray-50/50 to-white dark:from-white/[0.02] dark:to-transparent flex items-center gap-4">
              <Activity className="w-6 h-6 text-indigo-600 drop-shadow-sm" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">سجل نشاط الفريق</h3>
                <p className="text-sm text-gray-500 mt-0.5">متابعة كافة العمليات التي قام بها فريق العمل</p>
              </div>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-gray-50 dark:bg-[#0F172A]">
                  <tr>
                    <th className="p-4 font-semibold text-gray-700 dark:text-gray-300">المستخدم</th>
                    <th className="p-4 font-semibold text-gray-700 dark:text-gray-300">العملية</th>
                    <th className="p-4 font-semibold text-gray-700 dark:text-gray-300">التفاصيل</th>
                    <th className="p-4 font-semibold text-gray-700 dark:text-gray-300">الوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {loadingActivity ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">جاري التحميل...</td></tr>
                  ) : activityLogs.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">لا يوجد سجل نشاط حتى الآن</td></tr>
                  ) : activityLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                            {log.users?.full_name?.charAt(0) || <User className="w-4 h-4"/>}
                          </div>
                          <span className="font-medium">{log.users?.full_name || 'غير معروف'}</span>
                        </div>
                      </td>
                      <td className="p-4 font-medium text-gray-900 dark:text-gray-200">
                        {log.action}
                      </td>
                      <td className="p-4">
                        {log.entity_type === 'order' && (
                          <a href={`/dashboard/orders?search=${log.entity_id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:scale-105 shadow-sm transition-all dark:bg-indigo-500/10 dark:text-indigo-400 text-sm font-bold border border-indigo-100 dark:border-indigo-500/20">
                            {log.details?.order_name ? log.details.order_name : `عرض الطلب #${log.entity_id?.substring(0, 6).toUpperCase()}`}
                          </a>
                        )}
                      </td>
                      <td className="p-4 text-sm text-gray-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(log.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
        </div>
      </Tabs>

      {/* Modern Add User Dialog */}
      {addUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" dir="rtl">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => !addingUser && setAddUserOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 border border-gray-100 dark:border-white/[0.05] flex flex-col max-h-[90vh]">
            <div className="p-6 border-b shrink-0 border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <User className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">مستخدم جديد</h3>
              </div>
              <button 
                onClick={() => !addingUser && setAddUserOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-[#0F172A] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-6 space-y-5 overflow-y-auto">
              <div className="space-y-2.5">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">الاسم الرباعي</Label>
                <Input 
                  required 
                  value={newUserName} 
                  onChange={e => setNewUserName(e.target.value)} 
                  placeholder="مثال: أحمد محمد علي" 
                  className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors"
                />
              </div>
              
              <div className="space-y-2.5">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">البريد الإلكتروني (لتسجيل الدخول)</Label>
                <Input 
                  required 
                  type="email" 
                  value={newUserEmail} 
                  onChange={e => setNewUserEmail(e.target.value)} 
                  placeholder="name@company.com" 
                  className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors text-left dir-ltr"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2.5">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">كلمة المرور المؤقتة</Label>
                  <Input 
                    required 
                    type="password" 
                    value={newUserPassword} 
                    onChange={e => setNewUserPassword(e.target.value)} 
                    placeholder="••••••••" 
                    minLength={6} 
                    className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors text-left dir-ltr"
                  />
                </div>
                
                <div className="space-y-2.5">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">الصلاحية (الدور)</Label>
                  <Select value={newUserRole} onValueChange={setNewUserRole}>
                    <SelectTrigger className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl" className="rounded-xl border-gray-100 shadow-lg">
                      <SelectItem value="sales" className="focus:bg-indigo-50 focus:text-indigo-700 font-medium py-2.5">مبيعات (Sales)</SelectItem>
                      <SelectItem value="admin" className="focus:bg-indigo-50 focus:text-indigo-700 font-medium py-2.5">مدير (Admin)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newUserRole !== "admin" && (
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">الصفحات المسموح بها (الصلاحيات)</Label>
                  <div className="grid grid-cols-2 gap-3 p-4 border border-gray-100 dark:border-white/[0.05] rounded-xl bg-gray-50/50 dark:bg-[#0F172A]/50">
                    {availablePages.map((page) => (
                      <label key={page.id} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center">
                          <input 
                            type="checkbox" 
                            checked={newUserPages.includes(page.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUserPages(prev => [...prev, page.id]);
                              } else {
                                setNewUserPages(prev => prev.filter(p => p !== page.id));
                              }
                            }}
                            className="peer w-5 h-5 appearance-none border-2 border-gray-200 dark:border-white/10 rounded-md checked:bg-indigo-600 checked:border-indigo-600 transition-colors"
                          />
                          <Check className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                        </div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{page.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-6 mt-2 border-t border-gray-100 dark:border-white/[0.05]">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setAddUserOpen(false)}
                  className="rounded-xl px-5 hover:bg-gray-100 font-medium"
                >
                  إلغاء
                </Button>
                <Button 
                  type="submit" 
                  disabled={addingUser} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-8 shadow-sm transition-all font-medium"
                >
                  {addingUser ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      جاري الإنشاء...
                    </span>
                  ) : "إنشاء الحساب"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      {editUserOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" dir="rtl">
          <div 
            className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => !savingEdit && setEditUserOpen(false)}
          />
          
          <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 border border-gray-100 dark:border-white/[0.05] flex flex-col max-h-[90vh]">
            <div className="p-6 border-b shrink-0 border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                  <Pencil className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">تعديل بيانات المستخدم</h3>
              </div>
              <button 
                onClick={() => !savingEdit && setEditUserOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-[#0F172A] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditUserSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div className="space-y-2.5">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">الاسم الرباعي</Label>
                <Input 
                  required 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors"
                />
              </div>
              
              <div className="space-y-2.5">
                <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex justify-between">
                  <span>البريد الإلكتروني</span>
                  <span className="text-xs text-red-500">لا يمكن تعديله للحماية</span>
                </Label>
                <Input 
                  disabled
                  value={editingUser.email} 
                  className="h-11 rounded-xl bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 cursor-not-allowed text-left dir-ltr opacity-70"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2.5">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex justify-between">
                    <span>كلمة المرور الجديدة</span>
                    <span className="text-xs text-gray-400">اختياري</span>
                  </Label>
                  <Input 
                    type="password" 
                    value={editPassword} 
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder="اتركها فارغة لعدم التغيير" 
                    className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors text-left dir-ltr"
                  />
                  <p className="text-[11px] text-gray-400 mt-1 leading-tight">
                    أدخل كلمة مرور جديدة إذا أردت تغييرها للموظف (6 أحرف على الأقل).
                  </p>
                </div>
                
                <div className="space-y-2.5">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">الصلاحية (الدور)</Label>
                  <Select value={editRole} onValueChange={setEditRole} disabled={editingUser.id === currentUser?.id}>
                    <SelectTrigger className="h-11 rounded-xl bg-gray-50 dark:bg-[#0F172A] border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-[#1E293B] transition-colors">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl" className="rounded-xl border-gray-100 shadow-lg">
                      <SelectItem value="sales" className="focus:bg-indigo-50 focus:text-indigo-700 font-medium py-2.5">مبيعات (Sales)</SelectItem>
                      <SelectItem value="admin" className="focus:bg-indigo-50 focus:text-indigo-700 font-medium py-2.5">مدير (Admin)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editRole !== "admin" && (
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">الصفحات المسموح بها (الصلاحيات)</Label>
                  <div className="grid grid-cols-2 gap-3 p-4 border border-gray-100 dark:border-white/[0.05] rounded-xl bg-gray-50/50 dark:bg-[#0F172A]/50">
                    {availablePages.map((page) => (
                      <label key={page.id} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center">
                          <input 
                            type="checkbox" 
                            checked={editUserPages.includes(page.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditUserPages(prev => [...prev, page.id]);
                              } else {
                                setEditUserPages(prev => prev.filter(p => p !== page.id));
                              }
                            }}
                            className="peer w-5 h-5 appearance-none border-2 border-gray-200 dark:border-white/10 rounded-md checked:bg-indigo-600 checked:border-indigo-600 transition-colors"
                          />
                          <Check className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                        </div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{page.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-6 mt-2 border-t border-gray-100 dark:border-white/[0.05]">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setEditUserOpen(false)}
                  className="rounded-xl px-5 hover:bg-gray-100 font-medium"
                >
                  إلغاء
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingEdit} 
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-8 shadow-sm transition-all font-medium"
                >
                  {savingEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
