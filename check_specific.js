const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSpecific() {
  const { data, error } = await supabase
    .from('sku_equivalences')
    .select('*')
    .in('supplier_code', ['ENKO001', '2801798', '100109', '100107', '85']);

  console.log('Matches found:', data);
  if (error) console.error('Error:', error);
}

checkSpecific();
