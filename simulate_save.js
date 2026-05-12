const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function simulateSave() {
  const activeCodigo = 'WCIL';
  const activeRut = '77659607-8';
  const foundSku = 'TEST_SIMULATE_123';

  // Exactly replicate what the frontend does now
  console.log('1. Checking if equivalence exists...');
  const { data: existing, error: checkErr } = await supabase
    .from('sku_equivalences')
    .select('id')
    .eq('supplier_code', activeCodigo)
    .eq('rut_provider', activeRut)
    .limit(1);

  console.log('   existing:', existing, 'error:', checkErr);

  if (existing && existing.length > 0) {
    console.log('2. Updating existing...');
    const { data, error } = await supabase
      .from('sku_equivalences')
      .update({ internal_sku: foundSku, supplier_name: 'Proveedor' })
      .eq('id', existing[0].id)
      .select();
    console.log('   result:', data, 'error:', error);
  } else {
    console.log('2. Inserting new...');
    const { data, error } = await supabase
      .from('sku_equivalences')
      .insert({
        internal_sku: foundSku,
        source_sku: activeCodigo,
        supplier_code: activeCodigo,
        rut_provider: activeRut,
        supplier_name: 'Proveedor'
      })
      .select();
    console.log('   result:', data, 'error:', error);

    // Verify it was saved
    if (!error) {
      console.log('\n3. Verifying save...');
      const { data: verify } = await supabase
        .from('sku_equivalences')
        .select('*')
        .eq('supplier_code', activeCodigo)
        .eq('rut_provider', activeRut);
      console.log('   verify:', verify);

      // Clean up test
      if (verify && verify.length > 0) {
        await supabase.from('sku_equivalences').delete().eq('id', verify[0].id);
        console.log('   cleaned up test record');
      }
    }
  }

  // Also clean up the Delivery Latas from the queue
  console.log('\n4. Cleaning Delivery Latas from queue...');
  const { error: delErr } = await supabase
    .from('validation_queue')
    .delete()
    .eq('supplier_code', 'DELIVL')
    .eq('rut_provider', '77659607-8');
  console.log('   delete error:', delErr);
}

simulateSave();
