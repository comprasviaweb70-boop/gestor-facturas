const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkProveedores() {
  const { data, error } = await supabase.from('proveedores').select('*').limit(1);
  console.log('Proveedores table:', error ? 'Error: ' + error.message : 'Exists!');
  if (!error) console.log('Data:', data);
}

checkProveedores();
