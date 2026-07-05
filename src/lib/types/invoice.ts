export interface InvoiceItem {
  nombre: string;
  codigo: string;
  cantidad: number;
  precioUnitario: number;
  precioBrutoUnitario: number;
  subtotalNeto: number;
  impuestosAdicionales: number;
  fleteTotal: number;
  tasaImpuestoAdicional?: number;
  unidadesPorPack?: number;
  cantidadReal?: number;
  internal_sku?: string;
}

export interface InvoiceData {
  rutEmisor: string;
  folio: string;
  razonSocial: string;
  items: InvoiceItem[];
  sourceFormat: 'xml' | 'pdf' | 'image';
  extractorUsed: 'claude' | 'gemini';
  extractionWarnings?: string[];
}

export interface TaxRate {
  product_type: string;
  tax_percentage: number;
}

export interface PipelineContext {
  rutEmisor: string;
  razonSocial: string;
  items: InvoiceItem[];
  taxRates: TaxRate[];
  warnings: string[];
}

export type RuleStage = 'multiplier' | 'tax' | 'post-process';

export interface SupplierRule {
  stage: RuleStage;
  rutPrefix?: string;
  nameContains?: string;
  apply: (ctx: PipelineContext) => PipelineContext;
}
