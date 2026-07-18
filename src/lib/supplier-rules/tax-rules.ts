import { PipelineContext, SupplierRule } from '../types/invoice';
import { calcularFleteOcultoBruto, detectAlcoholTaxRate } from '../invoice-utils';
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
    if (matchesProvider(ctx, '99554560', 'CCU')) return ctx;

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

export const ccuTaxRule: SupplierRule = {
  stage: 'tax',
  rutPrefix: '99554560',
  nameContains: 'CCU',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const nombreUpper = (item.nombre || '').toUpperCase().trim();
      let tasa: number | null = null;

      // === Prioridad 1: Tasa extraída por IA desde el pie de la factura ===
      const tasaIA = Number(item.tasaImpuestoAdicional);
      if (tasaIA > 0) {
        tasa = tasaIA;
        console.log(`[CCU Tax P1-IA] "${item.nombre}" | tasa desde factura: ${tasa}`);
      }

      // === Prioridad 2: Grado alcohólico en el nombre del producto ===
      if (tasa === null) {
        const tasaAlcohol = detectAlcoholTaxRate(item.nombre || '');
        if (tasaAlcohol > 0) {
          tasa = tasaAlcohol;
          console.log(`[CCU Tax P2-Alcohol] "${item.nombre}" | tasa por grado alcohólico: ${tasa}`);
        }
      }

      // === Prioridad 3: Palabras clave en taxRates (BD) + reglas hardcodeadas ===
      if (tasa === null) {
        // 3a: Buscar en taxRates desde BD
        for (const rate of ctx.taxRates) {
          const keyword = (rate.product_type || '').trim().toUpperCase();
          if (keyword && nombreUpper.includes(keyword)) {
            tasa = rate.tax_percentage / 100;
            console.log(`[CCU Tax P3a-taxRates] "${item.nombre}" | keyword "${keyword}" → ${tasa}`);
            break;
          }
        }

        // 3b: Reglas hardcodeadas si no se encontró en BD
        if (tasa === null) {
          if (nombreUpper.includes('CERVEZA')) {
            tasa = 0.205;
          } else if (nombreUpper.includes('ZERO') || nombreUpper.includes('SUGARFREE') ||
                     nombreUpper.includes('MAS') || nombreUpper.includes('SEVEN UP') ||
                     nombreUpper.includes('SPRIM')) {
            tasa = 0.10;
          } else if (nombreUpper.includes('AGUA') || nombreUpper.includes('GATORADE') ||
                     nombreUpper.includes('CACHANTUN') || nombreUpper.includes('CATUN') ||
                     nombreUpper.includes('WATTS') || nombreUpper.includes('JUGO') ||
                     nombreUpper.includes('NECTAR')) {
            tasa = 0;
          }
          if (tasa !== null) {
            console.log(`[CCU Tax P3b-hardcoded] "${item.nombre}" | tasa: ${tasa}`);
          }
        }
      }

      // === Prioridad 4: "GATO" (pero NO "GATORADE") → VINO → 20.5% ===
      if (tasa === null) {
        if (nombreUpper.includes('GATO') && !nombreUpper.includes('GATORADE')) {
          tasa = 0.205;
          console.log(`[CCU Tax P4-GATO] "${item.nombre}" | clasificado como VINO → ${tasa}`);
        }
      }

      // === Fallback: default 18% ===
      if (tasa === null) {
        tasa = 0.18;
        console.log(`[CCU Tax Fallback] "${item.nombre}" | default → ${tasa}`);
      }

      // Calcular impuestos adicionales
      item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * tasa);

      // Calcular flete basado en PTU (precioBrutoUnitario)
      const cantidad = item.cantidad || 1;
      const ptu = item.precioBrutoUnitario || 0;
      const subtotalConIva = (item.subtotalNeto || 0) * 1.19;

      item.fleteTotal = (cantidad * ptu - item.impuestosAdicionales - subtotalConIva) / 1.19;

      if (item.fleteTotal <= 0) {
        console.warn(`Advertencia: Flete calculado ≤ 0 para ${item.nombre}. Posible error en OCR de PTU o Subtotal.`);
      }

      console.log(`CCU: ${item.nombre} | PTU: ${ptu}, Cantidad: ${cantidad}, SubtotalNeto: ${item.subtotalNeto}, Impuestos: ${item.impuestosAdicionales}, Flete: ${item.fleteTotal}`);
    });
    return ctx;
  },
};

export const taxRules: SupplierRule[] = [
  hiperkorTaxRule,
  ccuTaxRule,
  generalTaxRule,
  zapataTaxRule,
];
