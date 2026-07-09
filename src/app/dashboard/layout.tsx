"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { TenantProvider, useTenant } from "@/components/shared/TenantProvider";
import { useTheme } from "next-themes";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  ShoppingCart, 
  Truck, 
  Settings,
  LogOut,
  BarChart3,
  Bell,
  Moon,
  Sun,
  Wallet
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <DashboardContent>{children}</DashboardContent>
    </TenantProvider>
  );
}

const navItems = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/treasury", label: "الخزنة", icon: Wallet },
  { href: "/dashboard/suppliers", label: "الموردين", icon: Users },
  { href: "/dashboard/inventory", label: "المخزون", icon: Package },
  { href: "/dashboard/orders", label: "الطلبات", icon: Truck },
  { href: "/dashboard/reports", label: "التقارير", icon: BarChart3 },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { tenant, currentUser, loading } = useTenant();
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [lowStockVariants, setLowStockVariants] = useState<any[]>([]);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [supplierDues, setSupplierDues] = useState(0);
  const [isRead, setIsRead] = useState(true);
  const [prevCount, setPrevCount] = useState(0);

  useEffect(() => {
    const savedIsRead = localStorage.getItem("notifications_is_read");
    const savedPrevCount = localStorage.getItem("notifications_prev_count");
    if (savedIsRead !== null) {
      setIsRead(savedIsRead === "true");
    }
    if (savedPrevCount !== null) {
      setPrevCount(Number(savedPrevCount));
    }

    // Unlock audio on first interaction to allow sounds
    const unlockAudio = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 0;
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          osc.start(0);
          osc.stop(0.01);
        }
      } catch (e) {}
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);
  const supabase = createClient();

  useEffect(() => {
    const fetchAlerts = async () => {
      const [
        { data: stockData },
        { count: pendingCount },
        { data: suppliersData }
      ] = await Promise.all([
        supabase.from("product_variants").select(`*, products(name)`),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending").eq("is_deleted", false),
        supabase.from('suppliers').select('balance').gt('balance', 0)
      ]);

      if (stockData) {
        const lowStock = stockData.filter(v => {
          if (v.stock_quantity <= 0) return true; // Always alert if out of stock
          
          // Use low_stock_threshold as the "Base Stock Level" (last_restock_level).
          // If not set, use current stock so it doesn't alert immediately.
          const baseLevel = v.low_stock_threshold || v.stock_quantity || 1;
          
          // Alert if stock is at or below 20% of the base level
          return v.stock_quantity <= (baseLevel * 0.20);
        });
        setLowStockVariants(lowStock);
      }
      if (pendingCount !== null) {
        setPendingOrdersCount(pendingCount);
      }
      if (suppliersData) {
        const dues = suppliersData.reduce((acc, curr) => acc + Number(curr.balance), 0);
        setSupplierDues(dues);
      }
    };
    fetchAlerts();

    const channel = supabase
      .channel('layout-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchAlerts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const notificationCount = lowStockVariants.length + (pendingOrdersCount > 0 ? 1 : 0) + (supplierDues > 0 ? 1 : 0);

  useEffect(() => {
    // Only update and compare if notificationCount is greater than 0
    // to avoid false resets during initial data loading
    if (notificationCount > 0) {
      if (notificationCount > prevCount) {
        setIsRead(false);
        localStorage.setItem("notifications_is_read", "false");
        
        // Play audio notification using Web Audio API
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            // Resume context if suspended (browser policy)
            if (audioContext.state === 'suspended') {
              audioContext.resume();
            }
            const osc = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioContext.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.5); // Drop to A4
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            osc.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            osc.start();
            osc.stop(audioContext.currentTime + 0.5);
          }
        } catch (e) {
          console.error("Audio playback failed", e);
        }
      }
      setPrevCount(notificationCount);
      localStorage.setItem("notifications_prev_count", notificationCount.toString());
    }
  }, [notificationCount, prevCount]);

  const handleMarkAllAsRead = () => {
    setIsRead(true);
    localStorage.setItem("notifications_is_read", "true");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-white dark:bg-[#0F172A] overflow-hidden">
      {/* ─── Sidebar (Desktop) ─── */}
      <aside className="w-[260px] bg-white dark:bg-[#0F172A] border-l border-gray-100 dark:border-white/[0.06] flex-shrink-0 z-10 hidden md:flex flex-col">
        {/* Brand */}
        <div className="h-16 flex items-center justify-center border-b border-gray-100 dark:border-white/[0.06] px-6">
          {tenant?.logo_url ? (
            <img 
              src={tenant.logo_url} 
              alt={tenant.name || "Logo"} 
              className="max-h-10 w-auto object-contain"
            />
          ) : (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {tenant?.name || "مخزني SaaS"}
            </h1>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {navItems.filter((item) => {
              if (item.href === "/dashboard") return true;
              if (currentUser?.role === "admin") return true;
              if (Array.isArray(currentUser?.permissions?.pages) && currentUser.permissions.pages.includes(item.href)) return true;
              return false;
            }).map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link 
                    href={item.href} 
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${active 
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" 
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] hover:text-gray-900 dark:hover:text-gray-200"
                      }`}
                  >
                    <item.icon className={`w-5 h-5 ${active ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        
        {/* Sign Out */}
        <div className="p-3 border-t border-gray-100 dark:border-white/[0.06]">
          <button 
            onClick={handleSignOut} 
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-[#0F172A] border-b border-gray-100 dark:border-white/[0.06] flex items-center px-6 sticky top-0 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            
            {/* Notifications */}
            <DropdownMenu onOpenChange={(open) => { if (open) handleMarkAllAsRead() }}>
              <DropdownMenuTrigger className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-lg transition-colors relative outline-none">
                <Bell className="w-[18px] h-[18px]" />
                {notificationCount > 0 && !isRead && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {notificationCount > 9 ? '+9' : notificationCount}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80" dir="rtl">
                <DropdownMenuGroup>
                  <div className="flex justify-between items-center px-3 py-2">
                    <DropdownMenuLabel className="p-0 text-sm font-semibold">الإشعارات</DropdownMenuLabel>
                  </div>
                  <DropdownMenuSeparator />
                  
                  {pendingOrdersCount > 0 && (
                    <DropdownMenuItem 
                      onClick={() => router.push('/dashboard/orders')}
                      className="flex flex-col items-start cursor-pointer text-right p-3 gap-1"
                    >
                      <span className="font-medium text-sm">🛒 طلبات بانتظار التأكيد</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        لديك {pendingOrdersCount} طلب بانتظار المراجعة والشحن
                      </span>
                    </DropdownMenuItem>
                  )}

                  {supplierDues > 0 && (
                    <DropdownMenuItem 
                      onClick={() => router.push('/dashboard/suppliers')}
                      className="flex flex-col items-start cursor-pointer text-right p-3 gap-1"
                    >
                      <span className="font-medium text-sm">💳 مستحقات موردين</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        إجمالي الديون للموردين: {supplierDues.toLocaleString()} ج.م
                      </span>
                    </DropdownMenuItem>
                  )}

                  {lowStockVariants.length > 0 && lowStockVariants.map(v => (
                    <DropdownMenuItem 
                      key={v.id} 
                      onClick={() => router.push('/dashboard/inventory')}
                      className="flex flex-col items-start cursor-pointer text-right p-3 gap-1"
                    >
                      <span className="font-medium text-sm">{v.products?.name}</span>
                      <span className="text-xs text-red-500">
                        📦 مخزون منخفض: {v.stock_quantity} (المقاس: {v.size})
                      </span>
                    </DropdownMenuItem>
                  ))}

                  {notificationCount === 0 && (
                    <DropdownMenuItem disabled className="text-center py-6">
                      <span className="text-gray-400 text-sm">لا توجد إشعارات جديدة</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Divider */}
            <div className="h-6 w-px bg-gray-200 dark:bg-white/[0.08]" />

            {/* User */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:block">
                {tenant?.name || "مخزني"}
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                {tenant?.name?.charAt(0) || "م"}
              </div>
            </div>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-24 md:pb-8 bg-gray-50/50 dark:bg-[#0F172A]">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* ─── Mobile Bottom Navigation ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#0F172A] border-t border-gray-100 dark:border-white/[0.06] z-50 px-2 py-1.5 flex justify-around items-center">
        {[navItems[0], navItems[2], navItems[3], navItems[4]].filter((item) => {
          if (item.href === "/dashboard") return true;
          if (currentUser?.role === "admin") return true;
          if (Array.isArray(currentUser?.permissions?.pages) && currentUser.permissions.pages.includes(item.href)) return true;
          return false;
        }).map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link 
              key={item.href}
              href={item.href} 
              className={`flex flex-col items-center py-1.5 px-3 rounded-lg transition-colors
                ${active 
                  ? "text-indigo-600 dark:text-indigo-400" 
                  : "text-gray-400 dark:text-gray-500"
                }`}
            >
              <item.icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-medium">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
