const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample record:', data);
  }
}

inspectSuppliers();
