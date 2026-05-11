import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('sku_equivalences')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    return NextResponse.json({ 
      status: 'success', 
      message: 'Conexión exitosa con Supabase',
      total_registros: count 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Error de conexión con Supabase', 
      error: error.message 
    }, { status: 500 });
  }
}
