"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let authError = null;
    try {
      let submitEmail = email;
      if (!submitEmail.includes('@')) {
         submitEmail = `${submitEmail}@inventorysaas.com`;
      }
      
      let submitPassword = password;
      if (submitPassword === 'bobos') {
         submitPassword = 'bobosbobos';
      } else if (submitPassword.length > 0 && submitPassword.length < 6) {
         submitPassword = submitPassword + '123456';
      }

      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: submitEmail,
          password: submitPassword,
        });
        authError = signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: submitEmail,
          password: submitPassword,
          options: {
            data: {
              full_name: fullName,
            }
          }
        });
        authError = signUpError;
      }

      if (authError) {
        setError(isLogin ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : authError.message);
        toast.error(isLogin ? "فشل تسجيل الدخول" : "فشل إنشاء الحساب");
        setLoading(false);
      } else {
        toast.success(isLogin ? "تم تسجيل الدخول بنجاح!" : "تم إنشاء الحساب بنجاح!");
        router.push("/dashboard");
      }
    } catch (err: any) {
      console.error("Login Exception:", err);
      setError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Side — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl" />
        
        <div className="relative z-10 text-center text-white max-w-md">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">مخزني SaaS</h1>
          <p className="text-lg text-indigo-100 leading-relaxed">
            أدر مخزونك، طلباتك، ومبيعاتك بكل سهولة واحترافية من مكان واحد.
          </p>
        </div>
      </div>

      {/* Right Side — Form */}
      <div className="flex-1 flex items-center justify-center bg-white p-6 sm:p-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {isLogin ? "مرحباً بعودتك" : "إنشاء حساب جديد"}
            </h2>
            <p className="text-gray-500 text-sm">
              {isLogin ? "أدخل بياناتك للوصول إلى لوحة التحكم" : "سجّل شركتك لتبدأ في إدارة مخزونك"}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-100">
                {error}
              </div>
            )}
            
            {!isLogin && (
              <div className="space-y-2 text-right">
                <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">الاسم الكامل (أو اسم الشركة)</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="محمد أحمد"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={!isLogin}
                  className="text-right h-11 rounded-lg border-gray-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                />
              </div>
            )}
            
            <div className="space-y-2 text-right">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">اسم المستخدم</Label>
              <Input
                id="email"
                type="text"
                placeholder="bobos"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="text-right h-11 rounded-lg border-gray-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
              />
            </div>

            <div className="space-y-2 text-right">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="text-right h-11 rounded-lg border-gray-200 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors" 
              disabled={loading}
            >
              {loading ? "جاري المعالجة..." : (isLogin ? "تسجيل الدخول" : "إنشاء الحساب")}
            </Button>

            <div className="text-center">
              <button 
                type="button" 
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
              >
                {isLogin ? "ليس لديك حساب؟ سجل الآن" : "لديك حساب بالفعل؟ تسجيل الدخول"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
