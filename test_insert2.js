const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testCorrectInsert() {
  // Try insert with source_sku included
  const { data, error } = await supabase
    .from('sku_equivalences')
    .insert({
      internal_sku: 'TEST_SKU_789',
      source_sku: 'WCIL',
      supplier_code: 'WCIL',
      rut_provider: '77659607-8',
      supplier_name: 'MAD CHARLIES'
    })
    .select();

  console.log('Insert result:', data);
  if (error) {
    console.error('Insert error:', JSON.stringify(error, null, 2));
  }

  // Clean up
  if (data && data.length > 0) {
    await supabase.from('sku_equivalences').delete().eq('id', data[0].id);
    console.log('Cleaned up test record');
  }
}

testCorrectInsert();
