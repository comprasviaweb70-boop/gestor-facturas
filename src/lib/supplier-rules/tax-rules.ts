import { PipelineContext, SupplierRule } from '../types/invoice';
import { calcularFleteOcultoBruto } from '../invoice-utils';
import { matchesProvider } from './multiplier-rules';

export const hiperkorTaxRule: SupplierRule = {
  stage: 'tax',
  rutPrefix: '78753810',
  nameContains: 'HIPER',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const nombreUpper = (item.nombre || '').toUpperCase();
      let taxPercentage = 0;

      for (const rate of ctx.taxRates) {
        const keyword = (rate.product_type || '').trim().toUpperCase();
        if (keyword && nombreUpper.includes(keyword)) {
          taxPercentage = rate.tax_percentage / 100;
          break;
        }
      }

      if (taxPercentage === 0 && (nombreUpper.includes('CERVEZA') || nombreUpper.includes('BEBIDA') || nombreUpper.includes('STELLA'))) {
        taxPercentage = 0.205;
      }

      if (nombreUpper.includes('AGUA')) {
        taxPercentage = 0.10;
      }

      const grossValue = item.subtotalNeto || ((item.cantidad || 1) * (item.precioUnitario || 0));
      const factor = 1 + 0.19 + taxPercentage;
      const netValue = grossValue / factor;

      item.subtotalNeto = netValue;
      item.precioUnitario = netValue / (item.cantidad || 1);
      item.impuestosAdicionales = netValue * taxPercentage;
      item.fleteTotal = 0;

      console.log(`HIPERKOR: ${item.nombre} -> Bruto: ${grossValue}, Neto: ${netValue}, AddTax: ${item.impuestosAdicionales}`);
    });
    return ctx;
  },
};

export const generalTaxRule: SupplierRule = {
  stage: 'tax',
  apply: (ctx) => {
    if (matchesProvider(ctx, '78753810', 'HIPER')) return ctx;
    if (matchesProvider(ctx, '93281000', 'COCA')) return ctx;

    ctx.items.forEach((item) => {
      if (!item.impuestosAdicionales || item.impuestosAdicionales === 0) {
        const nombreUpper = (item.nombre || '').toUpperCase();

        if (nombreUpper.includes('SCOREGORILLA') || nombreUpper.includes('RB ACAI') || nombreUpper.includes('REDBULRED')) {
          item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * 0.18);
          console.log(`Aplicado impuesto especial Bebida Energética (18%) a ${item.nombre}`);
        } else {
          for (const rate of ctx.taxRates) {
            const keyword = (rate.product_type || '').trim().toUpperCase();
            if (keyword && nombreUpper.includes(keyword)) {
              const taxPercentage = rate.tax_percentage / 100;
              item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * taxPercentage);
              console.log(`Aplicado impuesto ${rate.product_type} (${rate.tax_percentage}%) a ${item.nombre}: ${item.impuestosAdicionales}`);
              break;
            }
          }
        }
      }
    });
    return ctx;
  },
};

export const zapataTaxRule: SupplierRule = {
  stage: 'tax',
  rutPrefix: '79576940',
  nameContains: 'ZAPATA',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      let currentTaxRate = Number(item.tasaImpuestoAdicional) || 0;
      const nombreUpper = (item.nombre || '').toUpperCase();

      if (currentTaxRate === 0) {
        for (const rate of ctx.taxRates) {
          const keyword = (rate.product_type || '').trim().toUpperCase();
          if (keyword && nombreUpper.includes(keyword)) {
            currentTaxRate = rate.tax_percentage / 100;
            break;
          }
        }
      }

      if (item.precioBrutoUnitario && item.precioBrutoUnitario > 0) {
        const fleteUni = calcularFleteOcultoBruto(item.precioBrutoUnitario, item.precioUnitario, currentTaxRate);
        item.fleteTotal = Math.round(fleteUni * (item.cantidad || 1));

        const originalNeto = item.precioUnitario || 0;
        item.precioUnitario = originalNeto - fleteUni;
        item.subtotalNeto = item.precioUnitario * (item.cantidad || 1);

        console.log(`ZAPATA: Flete oculto ${fleteUni}. Neto original: ${originalNeto} -> Neto real: ${item.precioUnitario} (Tasa ILA: ${currentTaxRate})`);
      }
    });
    return ctx;
  },
};

export const taxRules: SupplierRule[] = [
  hiperkorTaxRule,
  generalTaxRule,
  zapataTaxRule,
];
