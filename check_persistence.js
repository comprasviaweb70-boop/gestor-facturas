const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAll() {
  // Check equivalences for Mad Charlies codes
  const codes = ['WCIL', 'ASAL', 'AAL', 'BAL'];
  const { data: equivByCode } = await supabase
    .from('sku_equivalences')
    .select('*')
    .in('supplier_code', codes);
  console.log('=== Equivalences for Mad Charlies codes ===');
  console.log(equivByCode);

  // Check equivalences for Mad Charlies RUT
  const { data: equivByRut } = await supabase
    .from('sku_equivalences')
    .select('*')
    .eq('rut_provider', '77659607-8');
  console.log('\n=== Equivalences for RUT 77659607-8 ===');
  console.log(equivByRut);

  // Check all recent equivalences
  const { data: recentEquiv } = await supabase
    .from('sku_equivalences')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\n=== Last 10 equivalences ===');
  console.log(recentEquiv);
}

checkAll();
