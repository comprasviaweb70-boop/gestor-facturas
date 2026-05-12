const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
  const { data: queue, error: qError } = await supabase
    .from('validation_queue')
    .select('*')
    .limit(5);

  const { data: equiv, error: eError } = await supabase
    .from('sku_equivalences')
    .select('*')
    .limit(5);

  console.log('Queue data:', queue);
  console.log('Equivalences data:', equiv);
}

checkData();
