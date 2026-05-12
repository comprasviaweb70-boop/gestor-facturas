const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectProveedores() {
  const { data, error } = await supabase.from('proveedores').select('rut').limit(1);
  console.log('Has rut column:', error ? 'No: ' + error.message : 'Yes!');
  
  const { data: data2, error: error2 } = await supabase.from('proveedores').select('nombre_fantasia').limit(1);
  console.log('Has nombre_fantasia column:', error2 ? 'No: ' + error2.message : 'Yes!');
}

inspectProveedores();
