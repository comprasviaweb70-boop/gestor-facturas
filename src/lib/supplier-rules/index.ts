import { PipelineContext, SupplierRule, InvoiceData, InvoiceItem, TaxRate, InvoiceDiscount } from '../types/invoice';
import { normalizeRut, parseSpanishNumber, parseChileanImageAmount, parseDiscountPercentage } from '../invoice-utils';
import { multiplierRules, matchesProvider } from './multiplier-rules';
import { taxRules } from './tax-rules';
import { postProcessRules } from './post-process-rules';

function normalizeItems(items: any[], sourceFormat: 'xml' | 'pdf' | 'image'): InvoiceItem[] {
  const parseAmount = sourceFormat === 'xml' ? parseSpanishNumber : parseChileanImageAmount;

  return items.map((item: any) => {
    // Mapear cantidadVisual a cantidad si viene del prompt CCU actualizado
    if (!item.cantidad && item.cantidadVisual !== undefined) {
      item.cantidad = item.cantidadVisual;
    }
    if (typeof item.cantidad === 'string') {
      item.cantidad = parseFloat(item.cantidad.replace(/,/g, '.'));
    }
    item.cantidad = Number(item.cantidad) || 0;
    item.precioUnitario = parseAmount(item.precioUnitario);
    item.precioBrutoUnitario = parseAmount(item.precioBrutoUnitario);
    item.subtotalNeto = parseAmount(item.subtotalNeto);
    item.impuestosAdicionales = parseAmount(item.impuestosAdicionales);
    item.fleteTotal = parseAmount(item.fleteTotal);
    return item as InvoiceItem;
  });
}

function normalizeDiscount(rawDiscount: any, sourceFormat: 'xml' | 'pdf' | 'image'): InvoiceDiscount | undefined {
  if (!rawDiscount || typeof rawDiscount !== 'object') return undefined;
  const parseAmount = sourceFormat === 'xml' ? parseSpanishNumber : parseChileanImageAmount;
  const porcentaje = parseDiscountPercentage(rawDiscount.porcentaje);
  const monto = parseAmount(rawDiscount.monto);
  if (porcentaje === 0 && monto === 0) return undefined;
  return { porcentaje, monto };
}

function runStage(rules: SupplierRule[], ctx: PipelineContext): PipelineContext {
  for (const rule of rules) {
    const hasProviderFilter = rule.rutPrefix || rule.nameContains;
    if (!hasProviderFilter) {
      ctx = rule.apply(ctx);
    } else if (matchesProvider(ctx, rule.rutPrefix, rule.nameContains)) {
      ctx = rule.apply(ctx);
    }
  }
  return ctx;
}

export function runPipeline(
  rawData: any,
  taxRates: TaxRate[],
  sourceFormat: 'xml' | 'pdf' | 'image' = 'xml',
  extractorUsed: 'claude' | 'gemini' = 'claude'
): InvoiceData {
  const rutEmisor = normalizeRut(rawData.rutEmisor || '');
  const razonSocial = rawData.razonSocial || '';
  const items = rawData.items && Array.isArray(rawData.items) ? normalizeItems([...rawData.items], sourceFormat) : [];
  const descuentoGlobal = normalizeDiscount(rawData.descuentoGlobal, sourceFormat);

  let ctx: PipelineContext = {
    rutEmisor,
    razonSocial,
    items,
    taxRates,
    warnings: [],
    descuentoGlobal,
  };

  ctx = runStage(multiplierRules, ctx);
  ctx = runStage(taxRules, ctx);
  ctx = runStage(postProcessRules, ctx);

  return {
    rutEmisor,
    folio: rawData.folio || '',
    razonSocial,
    items: ctx.items,
    sourceFormat,
    extractorUsed,
    descuentoGlobal,
    extractionWarnings: ctx.warnings,
  };
}

export { multiplierRules, taxRules, postProcessRules, matchesProvider };
export type { SupplierRule, PipelineContext, InvoiceData, InvoiceItem, TaxRate };
