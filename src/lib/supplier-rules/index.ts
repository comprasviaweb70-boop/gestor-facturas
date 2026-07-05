import { PipelineContext, SupplierRule, InvoiceData, InvoiceItem, TaxRate } from '../types/invoice';
import { normalizeRut, parseSpanishNumber } from '../invoice-utils';
import { multiplierRules, matchesProvider } from './multiplier-rules';
import { taxRules } from './tax-rules';
import { postProcessRules } from './post-process-rules';

function normalizeItems(items: any[]): InvoiceItem[] {
  return items.map((item: any) => {
    if (typeof item.cantidad === 'string') {
      item.cantidad = parseFloat(item.cantidad.replace(/,/g, '.'));
    }
    item.cantidad = Number(item.cantidad) || 0;
    item.precioUnitario = parseSpanishNumber(item.precioUnitario);
    item.precioBrutoUnitario = parseSpanishNumber(item.precioBrutoUnitario);
    item.subtotalNeto = parseSpanishNumber(item.subtotalNeto);
    item.impuestosAdicionales = parseSpanishNumber(item.impuestosAdicionales);
    item.fleteTotal = item.fleteTotal || 0;
    return item as InvoiceItem;
  });
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
  const items = rawData.items && Array.isArray(rawData.items) ? normalizeItems([...rawData.items]) : [];

  let ctx: PipelineContext = {
    rutEmisor,
    razonSocial,
    items,
    taxRates,
    warnings: [],
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
    extractionWarnings: ctx.warnings,
  };
}

export { multiplierRules, taxRules, postProcessRules, matchesProvider };
export type { SupplierRule, PipelineContext, InvoiceData, InvoiceItem, TaxRate };
