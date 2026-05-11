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
