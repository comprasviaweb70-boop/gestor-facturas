const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmhrtwhurqnmnmjztqh.supabase.co';
const supabaseAnonKey = 'sb_publishable_BsfD6sgJSsthzLAeRqO3tA_X9p4gYGd';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTable() {
  // Intentar insertar y leer de la tabla para verificar si existe
  const { data, error } = await supabase
    .from('ignored_invoices')
    .select('id')
    .limit(1);
  
  if (error) {
    console.log('La tabla ignored_invoices NO existe aún.');
    console.log('Error:', error.message);
    console.log('\n=== EJECUTA ESTE SQL EN SUPABASE SQL EDITOR ===\n');
    console.log(`
CREATE TABLE IF NOT EXISTS ignored_invoices (
    id BIGSERIAL PRIMARY KEY,
    bsale_doc_id TEXT NOT NULL UNIQUE,
    folio TEXT,
    rut_proveedor TEXT,
    razon_social TEXT,
    monto_total NUMERIC,
    motivo TEXT DEFAULT 'No representa aumento de stock',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ignored_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública de ignored_invoices"
ON ignored_invoices FOR SELECT TO public USING (true);

CREATE POLICY "Permitir inserción pública de ignored_invoices"
ON ignored_invoices FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Permitir eliminación pública de ignored_invoices"
ON ignored_invoices FOR DELETE TO public USING (true);
    `);
  } else {
    console.log('✅ La tabla ignored_invoices YA existe.');
    console.log('Registros actuales:', data.length);
  }
}

createTable();
