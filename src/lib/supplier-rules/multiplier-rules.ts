import { PipelineContext, SupplierRule } from '../types/invoice';
import {
  detectHiperkorMultiplier,
  detectDimakMultiplier,
  detectBatMultiplier,
  detectCocaColaMultiplier,
  detectPackMultiplier,
  detectCcuPackMultiplier,
} from '../invoice-utils';

function matchesProvider(ctx: PipelineContext, rutPrefix?: string, nameContains?: string): boolean {
  if (rutPrefix && ctx.rutEmisor.startsWith(rutPrefix)) return true;
  if (nameContains && ctx.razonSocial.toUpperCase().includes(nameContains)) return true;
  return false;
}

export const hiperkorMultiplierRule: SupplierRule = {
  stage: 'multiplier',
  rutPrefix: '78753810',
  nameContains: 'HIPER',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const mult = detectHiperkorMultiplier(item.nombre);
      if (mult > 1) {
        item.unidadesPorPack = mult;
        item.cantidadReal = (item.cantidad || 0) * mult;
        const originalCantidad = item.cantidad || 0;
        item.cantidad = item.cantidadReal;
        if (item.subtotalNeto && item.subtotalNeto > 0) {
          item.precioUnitario = item.subtotalNeto / item.cantidadReal;
        }
        console.log(`Pack Applied Auto (Hiperkor): ${item.nombre} -> Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
      } else {
        item.unidadesPorPack = 1;
        item.cantidadReal = item.cantidad || 0;
      }
    });
    return ctx;
  },
};

export const dimakMultiplierRule: SupplierRule = {
  stage: 'multiplier',
  rutPrefix: '788095600',
  nameContains: 'DIMAK',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const mult = detectDimakMultiplier(item.nombre);
      if (mult > 1) {
        item.unidadesPorPack = mult;
        item.cantidadReal = (item.cantidad || 0) * mult;
        const originalCantidad = item.cantidad || 0;
        item.cantidad = item.cantidadReal;
        if (item.subtotalNeto && item.subtotalNeto > 0) {
          item.precioUnitario = item.subtotalNeto / item.cantidadReal;
        }
        console.log(`Pack Applied Auto (DIMAK): ${item.nombre} -> Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
      } else {
        item.unidadesPorPack = 1;
        item.cantidadReal = item.cantidad || 0;
      }
    });
    return ctx;
  },
};

export const batMultiplierRule: SupplierRule = {
  stage: 'multiplier',
  rutPrefix: '885029000',
  nameContains: 'BAT CHILE',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const mult = detectBatMultiplier(item.nombre);
      if (mult > 1) {
        item.unidadesPorPack = mult;
        item.cantidadReal = (item.cantidad || 0) * mult;
        const originalCantidad = item.cantidad || 0;
        item.cantidad = item.cantidadReal;
        if (item.subtotalNeto && item.subtotalNeto > 0) {
          item.precioUnitario = item.subtotalNeto / item.cantidadReal;
        }
        console.log(`Pack Applied Auto (BAT): ${item.nombre} -> Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
      } else {
        item.unidadesPorPack = 1;
        item.cantidadReal = item.cantidad || 0;
      }
    });
    return ctx;
  },
};

export const cocaColaMultiplierRule: SupplierRule = {
  stage: 'multiplier',
  rutPrefix: '93281000',
  nameContains: 'COCA',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const { antes, despues, multiplier } = detectCocaColaMultiplier(item.nombre);
      const visualQuantity = item.cantidad || 0;
      item.unidadesPorPack = antes * despues;
      item.cantidadReal = visualQuantity * multiplier;
      const originalCantidad = item.cantidad || 0;
      item.cantidad = item.cantidadReal;
      if (item.subtotalNeto && item.subtotalNeto > 0 && item.cantidadReal > 0) {
        item.precioUnitario = item.subtotalNeto / item.cantidadReal;
      }
      if (multiplier > 1) {
        console.log(`Pack Applied Auto (Coca-Cola): ${item.nombre} -> ${antes}X${despues}, Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
      }
    });
    return ctx;
  },
};

export const ccuMultiplierRule: SupplierRule = {
  stage: 'multiplier',
  rutPrefix: '99554560',
  nameContains: 'CCU',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      const mult = detectCcuPackMultiplier(item.nombre);
      if (mult > 1) {
        item.unidadesPorPack = mult;
        item.cantidadReal = (item.cantidad || 0) * mult;
        const originalCantidad = item.cantidad || 0;
        item.cantidad = item.cantidadReal;
        if (item.subtotalNeto && item.subtotalNeto > 0) {
          item.precioUnitario = item.subtotalNeto / item.cantidadReal;
        }
        console.log(`Pack Applied Auto (CCU): ${item.nombre} -> Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
      } else {
        item.unidadesPorPack = 1;
        item.cantidadReal = item.cantidad || 0;
      }
    });
    return ctx;
  },
};

export const generalPackRule: SupplierRule = {
  stage: 'multiplier',
  apply: (ctx) => {
    ctx.items.forEach((item) => {
      if (item.unidadesPorPack && item.unidadesPorPack > 1) return;
      const mult = detectPackMultiplier(item.nombre);
      item.unidadesPorPack = mult;
      item.cantidadReal = (item.cantidad || 0) * mult;
      if (mult > 1) {
        const originalCantidad = item.cantidad || 0;
        item.cantidad = item.cantidadReal;
        if (item.subtotalNeto && item.subtotalNeto > 0) {
          item.precioUnitario = item.subtotalNeto / item.cantidadReal;
        }
        console.log(`Pack Applied Auto (General): ${item.nombre} -> Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
      }
    });
    return ctx;
  },
};

export const multiplierRules: SupplierRule[] = [
  hiperkorMultiplierRule,
  dimakMultiplierRule,
  batMultiplierRule,
  cocaColaMultiplierRule,
  ccuMultiplierRule,
  generalPackRule,
];

export { matchesProvider };
