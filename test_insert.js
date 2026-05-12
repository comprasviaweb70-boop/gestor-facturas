const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testInsert() {
  // Test: try to upsert a pairing and see what happens
  const { data, error } = await supabase
    .from('sku_equivalences')
    .upsert({
      internal_sku: 'TEST_SKU_123',
      supplier_code: 'WCIL',
      rut_provider: '77659607-8',
      supplier_name: 'MAD CHARLIES'
    }, { onConflict: 'supplier_code,rut_provider' })
    .select();

  console.log('Upsert result:', data);
  if (error) {
    console.error('Upsert error:', JSON.stringify(error, null, 2));
  }

  // Also try a simple insert
  const { data: data2, error: error2 } = await supabase
    .from('sku_equivalences')
    .insert({
      internal_sku: 'TEST_SKU_456',
      supplier_code: 'TEST_CODE_456',
      rut_provider: '77659607-8',
      supplier_name: 'MAD CHARLIES'
    })
    .select();

  console.log('\nInsert result:', data2);
  if (error2) {
    console.error('Insert error:', JSON.stringify(error2, null, 2));
  }

  // Clean up test data
  if (!error) {
    await supabase.from('sku_equivalences').delete().eq('supplier_code', 'WCIL').eq('rut_provider', '77659607-8');
  }
  if (!error2) {
    await supabase.from('sku_equivalences').delete().eq('supplier_code', 'TEST_CODE_456');
  }
}

testInsert();
