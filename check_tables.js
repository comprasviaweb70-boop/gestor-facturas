const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTables() {
  const { data: providers, error: err1 } = await supabase.from('providers').select('*').limit(1);
  console.log('Providers table:', err1 ? 'Error/Not exists: ' + err1.message : 'Exists!');
  
  const { data: suppliers, error: err2 } = await supabase.from('suppliers').select('*').limit(1);
  console.log('Suppliers table:', err2 ? 'Error/Not exists: ' + err2.message : 'Exists!');
}

checkTables();
