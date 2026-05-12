const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNombre() {
  const { data, error } = await supabase.from('proveedores').select('nombre').limit(1);
  console.log('Has nombre column:', error ? 'No: ' + error.message : 'Yes!');
}

checkNombre();
