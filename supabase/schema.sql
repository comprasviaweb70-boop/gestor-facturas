-- Schema for SIAI Pantalla de Validación

-- Table: sku_equivalences
CREATE TABLE IF NOT EXISTS sku_equivalences (
    id BIGSERIAL PRIMARY KEY,
    internal_sku TEXT NOT NULL,
    supplier_code TEXT NOT NULL,
    rut_provider TEXT NOT NULL,
    supplier_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(supplier_code, rut_provider)
);

-- Table: invoice_processing
CREATE TABLE IF NOT EXISTS invoice_processing (
    id BIGSERIAL PRIMARY KEY,
    folio TEXT NOT NULL,
    rut_emisor TEXT NOT NULL,
    razon_social TEXT,
    status TEXT DEFAULT 'PENDIENTE',
    xml_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(folio, rut_emisor)
);

-- Table: validation_queue
CREATE TABLE IF NOT EXISTS validation_queue (
    id BIGSERIAL PRIMARY KEY,
    product_name TEXT NOT NULL,
    supplier_code TEXT NOT NULL,
    rut_provider TEXT NOT NULL,
    status TEXT DEFAULT 'SIN_MAPEAR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id BIGSERIAL PRIMARY KEY,
    rut TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    extraction_preference TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies for proveedores
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública de proveedores" 
ON proveedores FOR SELECT 
TO public
USING (true);

CREATE POLICY "Permitir inserción pública de proveedores" 
ON proveedores FOR INSERT 
TO public
WITH CHECK (true);

CREATE POLICY "Permitir actualización pública de proveedores" 
ON proveedores FOR UPDATE 
TO public
USING (true)
WITH CHECK (true);

-- Table: ignored_invoices
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

-- RLS Policies for ignored_invoices
ALTER TABLE ignored_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública de ignored_invoices"
ON ignored_invoices FOR SELECT
TO public
USING (true);

CREATE POLICY "Permitir inserción pública de ignored_invoices"
ON ignored_invoices FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Permitir eliminación pública de ignored_invoices"
ON ignored_invoices FOR DELETE
TO public
USING (true);
