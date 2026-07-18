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

export const bundorTaxRule: SupplierRule = {
  stage: 'tax',
  rutPrefix: '76424467',
  nameContains: 'BUNDOR',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const nombreUpper = (item.nombre || '').toUpperCase();

      // Saltar líneas de flete/delivery
      if (nombreUpper.includes('FLETE') || nombreUpper.includes('DELIVERY')) {
        item.impuestosAdicionales = 0;
        return;
      }

      let taxRate = detectAlcoholTaxRate(item.nombre);

      if (taxRate === 0) {
        // Fallback por taxRates de BD
        for (const rate of ctx.taxRates) {
          const keyword = (rate.product_type || '').trim().toUpperCase();
          if (keyword && nombreUpper.includes(keyword)) {
            taxRate = rate.tax_percentage / 100;
            break;
          }
        }
      }

      item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * taxRate);
      console.log(`BUNDOR: ${item.nombre} -> ILA ${(taxRate * 100).toFixed(1)}% = ${item.impuestosAdicionales}`);
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
    if (matchesProvider(ctx, '76424467', 'BUNDOR')) return ctx;

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

      // === P1: Tasa extraída por IA desde el pie de la factura ===
      const tasaP1 = Number(item.tasaImpuestoAdicional) || 0;

      // === P2: Grado alcohólico en el nombre del producto ===
      const tasaP2 = detectAlcoholTaxRate(item.nombre || '');

      // === P3: Reglas por nombre (keywords BD + hardcoded). Última palabra en discrepancias ===
      const resolveP3 = (nombre: string): number | null => {
        // 3a: Reglas hardcodeadas explícitas (más específicas, tienen prioridad)
        if (nombre.includes('CERVEZA')) return 0.205;
        if (nombre.includes('ZERO') || nombre.includes('SUGARFREE') ||
            nombre.includes('MAS') || nombre.includes('SEVEN UP') ||
            nombre.includes('SPRIM')) return 0.10;
        if (nombre.includes('AGUA') || nombre.includes('GATORADE') ||
            nombre.includes('CACHANTUN') || nombre.includes('CATUN') ||
            nombre.includes('WATTS') || nombre.includes('JUGO') ||
            nombre.includes('NECTAR')) return 0;

        // 3b: Buscar en taxRates desde BD
        for (const rate of ctx.taxRates) {
          const keyword = (rate.product_type || '').trim().toUpperCase();
          if (keyword && nombre.includes(keyword)) {
            return rate.tax_percentage / 100;
          }
        }

        return null;
      };

      let tasa: number | null = null;

      const p1Active = tasaP1 > 0;
      const p2Active = tasaP2 > 0;

      if (p1Active && p2Active) {
        if (tasaP1 === tasaP2) {
          // P1 y P2 concuerdan → usar ese valor
          tasa = tasaP1;
          console.log(`[CCU Tax P1=P2] "${item.nombre}" | tasa concordante: ${tasa}`);
        } else {
          // Discrepancia → P3 tiene la última palabra
          tasa = resolveP3(nombreUpper);
          console.log(`[CCU Tax Discrepancia] "${item.nombre}" | P1=${tasaP1} vs P2=${tasaP2} → P3=${tasa}`);
        }
      } else if (p1Active) {
        tasa = tasaP1;
        console.log(`[CCU Tax P1] "${item.nombre}" | tasa IA: ${tasa}`);
      } else if (p2Active) {
        tasa = tasaP2;
        console.log(`[CCU Tax P2] "${item.nombre}" | tasa alcohol: ${tasa}`);
      } else {
        // Ni P1 ni P2 → P3 decide
        tasa = resolveP3(nombreUpper);
        if (tasa !== null) {
          console.log(`[CCU Tax P3] "${item.nombre}" | tasa por nombre: ${tasa}`);
        }
      }

      // === P4: "GATO" (pero NO "GATORADE") → VINO → 20.5% ===
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
  bundorTaxRule,
  generalTaxRule,
  zapataTaxRule,
];
