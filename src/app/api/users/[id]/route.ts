import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // 1. Verify the current user is logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // 2. Verify the current user is an admin
    const { data: userData } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'صلاحيات إدارية مطلوبة' }, { status: 403 });
    }

    // 2.5 Verify target user belongs to the same tenant (Prevent IDOR)
    const { data: targetUser } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', id)
      .single();

    if (!targetUser || targetUser.tenant_id !== userData.tenant_id) {
      return NextResponse.json({ error: 'غير مصرح لك بتعديل بيانات مستخدم خارج شركتك' }, { status: 403 });
    }

    // 3. Get the request body
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 });
    }

    // 4. Initialize Admin Client
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: 'مفتاح SUPABASE_SERVICE_ROLE_KEY مفقود في إعدادات الخادم (.env.local)' 
      }, { status: 500 });
    }

    const adminAuthClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 5. Update user password
    const { data: updatedUser, error: updateError } = await adminAuthClient.auth.admin.updateUserById(
      id,
      { password: password }
    );

    if (updateError) {
      console.error("Admin Auth Update Error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
  } catch (error: any) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: error.message || 'حدث خطأ داخلي' }, { status: 500 });
  }
}
