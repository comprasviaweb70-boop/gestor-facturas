const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTaxes() {
  const { data, error } = await supabase
    .from('tax_rates')
    .select('*');

  console.log('Tax rates:', data);
  if (error) console.error('Error:', error);
}

checkTaxes();
