const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fullCheck() {
  // 1. Check if ANY Mad Charlies equivalences exist
  const codes = ['WCIL', 'ASAL', 'AAL', 'BAL', 'DELIVL'];
  const { data: byCode } = await supabase
    .from('sku_equivalences')
    .select('*')
    .in('supplier_code', codes);
  console.log('=== Equivalences for Mad Charlies codes ===');
  console.log(byCode);

  // 2. Check most recent 5 records
  const { data: recent } = await supabase
    .from('sku_equivalences')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\n=== Last 5 equivalences (most recent) ===');
  recent?.forEach(r => {
    console.log(`  ${r.supplier_code} -> ${r.internal_sku} | ${r.supplier_name} | rut: ${r.rut_provider} | ${r.created_at}`);
  });

  // 3. Count total
  const { count } = await supabase
    .from('sku_equivalences')
    .select('*', { count: 'exact', head: true });
  console.log(`\n=== Total equivalences: ${count} ===`);

  // 4. Check validation_queue for Mad Charlies
  const { data: queue } = await supabase
    .from('validation_queue')
    .select('*')
    .eq('rut_provider', '77659607-8');
  console.log('\n=== Queue items for Mad Charlies ===');
  console.log(queue);
}

fullCheck();
