import { PipelineContext, SupplierRule } from '../types/invoice';
import { detectAlcoholTaxRate, detectVctPackSize, distributeFreight } from '../invoice-utils';
import { matchesProvider } from './multiplier-rules';

export const madCharliesPostProcessRule: SupplierRule = {
  stage: 'post-process',
  rutPrefix: '776596078',
  nameContains: 'MAD CHARLIES',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const name = (item.nombre || '').toUpperCase();
      if (name.includes('SIN ALCOHOL')) {
        item.impuestosAdicionales = (item.subtotalNeto || 0) * 0.10;
      } else if (!name.includes('DELIVERY') && !name.includes('FLETE')) {
        item.impuestosAdicionales = (item.subtotalNeto || 0) * 0.205;
      }
    });

    const deliveryItemIndex = ctx.items.findIndex((item) => {
      const name = (item.nombre || '').toUpperCase();
      return name.includes('DELIVERY') || name.includes('FLETE');
    });

    if (deliveryItemIndex >= 0) {
      const deliveryItem = ctx.items[deliveryItemIndex];
      const totalDelivery = deliveryItem.subtotalNeto || ((deliveryItem.cantidad || 0) * (deliveryItem.precioUnitario || 0));
      ctx.items.splice(deliveryItemIndex, 1);

      const itemsConFlete = distributeFreight(ctx.items, totalDelivery);
      ctx.items.forEach((item, idx) => {
        item.fleteTotal = itemsConFlete[idx].fleteTotal;
      });
    }
    return ctx;
  },
};

export const dimakPostProcessRule: SupplierRule = {
  stage: 'post-process',
  rutPrefix: '788095600',
  nameContains: 'DIMAK',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const tasa = detectAlcoholTaxRate(item.nombre);
      if (tasa > 0) {
        item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * tasa);
        console.log(`DIMAK: Detectado grado alcohólico en ${item.nombre}. Aplicando ILA ${tasa * 100}% -> ${item.impuestosAdicionales}`);
      }
    });
    return ctx;
  },
};

export const vctPostProcessRule: SupplierRule = {
  stage: 'post-process',
  rutPrefix: '850379009',
  nameContains: 'VCT',
  apply: (ctx) => {
    console.log('VCT: Aplicando reglas especiales');

    // 1. Detectar y remover ítems de servicio logístico, acumulando su valor como flete adicional.
    const servLogIndices: number[] = [];
    let extraServLog = 0;

    ctx.items.forEach((item, index) => {
      const nombre = (item.nombre || '').toUpperCase();
      if ((nombre.includes('SERV') && nombre.includes('LOG')) ||
          nombre.includes('SERVICIO LOGISTICO') ||
          nombre.includes('SERVICIO LOGÍSTICO') ||
          nombre.includes('SERV. LOG')) {
        extraServLog += item.subtotalNeto || ((item.cantidad || 1) * (item.precioUnitario || 0));
        servLogIndices.push(index);
      }
    });

    if (servLogIndices.length > 0) {
      for (let i = servLogIndices.length - 1; i >= 0; i--) {
        ctx.items.splice(servLogIndices[i], 1);
      }
    }

    // 2. Calcular unidades reales: CAJ multiplica por packSize; BOT usa Cant directamente.
    ctx.items.forEach((item) => {
      const unidad = (item.unidad || 'CAJ').toUpperCase();
      const packSize = detectVctPackSize(item.nombre);
      const originalCantidad = item.cantidad || 0;

      const unidades = unidad === 'CAJ' && packSize > 1
        ? originalCantidad * packSize
        : originalCantidad;

      item.unidadesPorPack = packSize;
      item.cantidadReal = unidades;
      item.cantidad = unidades;

      if (item.subtotalNeto && item.subtotalNeto > 0 && unidades > 0) {
        item.precioUnitario = item.subtotalNeto / unidades;
      }

      console.log(`VCT: ${item.nombre} -> Unidad: ${unidad}, PackSize: ${packSize}, ${originalCantidad} -> ${unidades} unidades`);
    });

    // 3. Distribuir flete adicional proveniente de ítems de servicio logístico.
    if (extraServLog > 0) {
      const totalUnits = ctx.items.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);
      if (totalUnits > 0) {
        const fleteExtraUnitario = extraServLog / totalUnits;
        ctx.items.forEach((item) => {
          item.fleteTotal = (item.fleteTotal || 0) + (fleteExtraUnitario * (item.cantidad || 1));
        });
      }
    }

    // 4. Aplicar impuesto adicional SOBRE el neto del producto (sin flete).
    ctx.items.forEach((item) => {
      const tasa = item.tasaImpuestoAdicional;
      if (typeof tasa === 'number' && tasa > 0) {
        item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * tasa);
        console.log(`VCT: Impuesto ${tasa * 100}% aplicado a ${item.nombre}: ${item.impuestosAdicionales}`);
      } else {
        const nombreUpper = (item.nombre || '').toUpperCase();
        let taxApplied = false;
        for (const rate of ctx.taxRates) {
          const keyword = (rate.product_type || '').trim().toUpperCase();
          if (keyword && nombreUpper.includes(keyword)) {
            const porcentaje = rate.tax_percentage / 100;
            item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * porcentaje);
            console.log(`VCT: Impuesto ${rate.product_type} (${rate.tax_percentage}%) aplicado a ${item.nombre}: ${item.impuestosAdicionales}`);
            taxApplied = true;
            break;
          }
        }
        if (!taxApplied) {
          item.impuestosAdicionales = 0;
        }
      }
    });

    return ctx;
  },
};

export const postProcessRules: SupplierRule[] = [
  madCharliesPostProcessRule,
  dimakPostProcessRule,
  vctPostProcessRule,
];
