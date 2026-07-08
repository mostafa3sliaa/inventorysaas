import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'صلاحيات إدارية مطلوبة' }, { status: 403 });
    }

    // Delete from tables in order to respect constraints
    // Cascades will handle items and variants
    const tables = ['orders', 'customers', 'purchases', 'products', 'suppliers', 'transactions'];
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
        
      if (error) {
        console.error(`Error deleting from ${table}:`, error);
        throw new Error(`فشل تفريغ ${table}: ${error.message}`);
      }
    }

    return NextResponse.json({ success: true, message: 'تم تصفير البيانات بنجاح' });
  } catch (error: any) {
    console.error('Reset data error:', error);
    return NextResponse.json({ error: error.message || 'حدث خطأ داخلي' }, { status: 500 });
  }
}
