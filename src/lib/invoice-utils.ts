/**
 * Utilidades para procesamiento de facturas electrónicas chilenas.
 * Funciones puras extraídas de process-xml/route.ts para facilitar testing.
 */

/**
 * Extrae un objeto JSON válido desde un string que puede contener texto adicional.
 * Intenta múltiples estrategias: buscar llaves/corchetes, y reparar JSON malformado.
 */
export function extractJson(str: string): unknown {
  const cleaned = str.trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = cleaned.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(potentialJson); } catch {}
  }

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const potentialArray = cleaned.substring(firstBracket, lastBracket + 1);
    try { return JSON.parse(potentialArray); } catch {}
  }

  const fixJson = (s: string): unknown => {
    try {
      return JSON.parse(s
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":')
        .replace(/,(\s*[}\]])/g, '$1')
      );
    } catch { return null; }
  };

  const fixed = fixJson(cleaned);
  if (fixed) return fixed;

  throw new Error('No se pudo extraer JSON válido de la respuesta de Claude');
}

/**
 * Parsea un número que puede estar en formato español (punto como separador de miles,
 * coma como separador decimal) o formato estándar.
 */
export function parseSpanishNumber(val: string | number | null | undefined): number {
  if (typeof val === 'string') {
    let str = val.trim();
    if (str.includes('.') && str.includes(',')) {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    } else if (str.includes(',')) {
      str = str.replace(/,/g, '.');
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  return 0;
}

/**
 * Normaliza un porcentaje de descuento a valor decimal.
 * Soporta formatos: 4.63%, 4,63%, 4.63, 0.0463, "4,63%".
 * Retorna un valor entre 0 y 1 (ej: 4.63% -> 0.0463).
 */
export function parseDiscountPercentage(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    if (isNaN(val) || val < 0) return 0;
    return val > 1 ? val / 100 : val;
  }
  const str = String(val).trim().replace(/\s+/g, ' ');
  if (!str) return 0;
  const numeric = str.replace(/%/g, '').replace(/,/g, '.');
  const num = parseFloat(numeric);
  if (isNaN(num) || num < 0) return 0;
  return num > 1 ? num / 100 : num;
}

/**
 * Parsea montos extraídos por OCR/IA desde imágenes o PDFs de facturas chilenas.
 * En este contexto el punto es siempre separador de miles y la coma es separador decimal.
 * Aplica únicamente a la vía imagen/PDF; el XML ya entrega los montos bien definidos.
 */
export function parseChileanImageAmount(val: string | number | null | undefined): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (!val || typeof val !== 'string') return 0;

  let str = val.trim();
  if (str.includes('.') && str.includes(',')) {
    // 1.234,56 -> 1234.56
    str = str.replace(/\./g, '').replace(/,/g, '.');
  } else if (str.includes(',')) {
    // 716,50 -> 716.50 (decimal con coma)
    str = str.replace(/,/g, '.');
  } else if (str.includes('.')) {
    // 4.299 -> 4299 (punto como miles); 1.234.567 -> 1234567
    // Conserva el caso donde un punto decimal tenga 1-2 dígitos (poco común en CLP),
    // pero para montos enteros chilenos asumimos miles si todos los grupos son de 3 dígitos.
    const parts = str.split('.');
    const allGroupsThreeDigits = parts.every((part, idx) => {
      if (idx === 0) return /^-?\d{1,3}$/.test(part);
      return /^\d{3}$/.test(part);
    });
    if (allGroupsThreeDigits) {
      str = str.replace(/\./g, '');
    }
    // Si no cumple, se deja el punto como decimal y parseFloat decide.
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Calcula el flete oculto en el precio bruto unitario.
 * Fórmula: [[Bruto - (Neto * (1 + 0.19 + ILA))] / 1.19]
 */
export function calcularFleteOcultoBruto(pBrutoUni: number, pNetoUni: number, imptoAdicRate: number): number {
  if (!pBrutoUni || pBrutoUni <= 0) return 0;
  const fleteUni = (pBrutoUni - (pNetoUni * (1 + 0.19 + imptoAdicRate))) / 1.19;
  return Math.max(0, fleteUni);
}

/**
 * Normaliza un RUT chileno quitando puntos, guiones y espacios.
 * Retorna el RUT en formato alfanumérico puro en mayúsculas (ej: 12345678K).
 */
export function normalizeRut(rut: string | undefined | null): string {
  if (!rut) return '';
  return rut.replace(/[^0-9Kk]/g, '').toUpperCase();
}

/**
 * Detecta el multiplicador de unidades por pack/display en el nombre de un producto.
 * Reglas generales (no específicas de proveedor).
 */
export function detectPackMultiplier(nombreProducto: string): number {
  const nombreUpper = (nombreProducto || '').toUpperCase();
  let multiplier = 1;

  // Caso 1: Patrón AxBxC (ej: 12X30X15 GRS), el segundo término es la cantidad
  const multiXMatch = nombreUpper.match(/(\d+)\s*X\s*(\d+)\s*X\s*\d+/);
  if (multiXMatch) {
    multiplier = parseInt(multiXMatch[2], 10);
  } else {
    // Caso 2: Palabra unidades, unid, un precedida por un número
    const unMatch = nombreUpper.match(/(\d+)\s*(?:UNIDADES|UNID|UN)\b/);
    if (unMatch) {
      multiplier = parseInt(unMatch[1], 10);
    } else {
      // Caso 3: PACK o DISPLAY seguido de un número
      const packMatch = nombreUpper.match(/(?:PACK|DISPLAY)\s*(?:DE\s*)?(\d+)/);
      if (packMatch) {
        multiplier = parseInt(packMatch[1], 10);
      }
    }
  }

  return multiplier;
}

/**
 * Detecta multiplicador específico para HIPERKOR (RUT: 78753810K).
 * Busca patrones como X6, CJ 24, CJA 12, 6 UN.
 */
export function detectHiperkorMultiplier(nombreProducto: string): number {
  const nombreUpper = (nombreProducto || '').toUpperCase();
  const match = nombreUpper.match(/(?:\bX\s*(\d+)\b|\b(?:CJ|CJA|CAJA)\s*(\d+)\b|(\d+)\s*(?:UN|UNID|UNIDADES)\b)/);
  if (match) {
    return parseInt(match[1] || match[2] || match[3], 10);
  }
  return 1;
}

/**
 * Detecta multiplicador específico para DIMAK (RUT: 788095600).
 * Busca número seguido de espacio y X al final (ej: "CERVEZA 6 X").
 */
export function detectDimakMultiplier(nombreProducto: string): number {
  const nombreUpper = (nombreProducto || '').toUpperCase().trim();
  const match = nombreUpper.match(/(\d+)\s+X$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

/**
 * Detecta multiplicador específico para BAT Chile S.A (RUT: 885029000).
 * Busca patrones como 20s, 18s, 10s al final del nombre.
 */
export function detectBatMultiplier(nombreProducto: string): number {
  const nombreUpper = (nombreProducto || '').toUpperCase();
  const match = nombreUpper.match(/(10|18|20)S\b/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

export interface CocaColaMultiplier {
  antes: number;
  despues: number;
  multiplier: number;
}

/**
 * Detecta multiplicador específico para Coca-Cola Embonor (RUT: 93.281.000-K).
 * Soporta patrones como X06, X6, 12X6, 2X4.
 * Retorna { antes, despues, multiplier } donde multiplier = antes * despues.
 */
export function detectCocaColaMultiplier(nombreProducto: string): CocaColaMultiplier {
  const nombreUpper = (nombreProducto || '').toUpperCase();
  const match = nombreUpper.match(/(\d+)?\s*X\s*0*(\d+)/);
  if (match) {
    const antes = match[1] ? parseInt(match[1], 10) : 1;
    const despues = parseInt(match[2], 10);
    return { antes, despues, multiplier: antes * despues };
  }
  return { antes: 1, despues: 1, multiplier: 1 };
}

/**
 * Detecta el tamaño del pack en nombres de productos de VCT (Comercial Peumo).
 * Busca patrones como 6BOT, 06TPK, 12BOT y retorna el número entero.
 * Si no se detecta patrón, retorna 1.
 */
export function detectVctPackSize(nombreProducto: string): number {
  const nombreUpper = (nombreProducto || '').toUpperCase();
  const match = nombreUpper.match(/(\d+)\s*(?:BOT|TPK)\b/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

/**
 * Detecta el grado alcohólico en un nombre de producto (para DIMAK).
 * Retorna la tasa de impuesto correspondiente (0.205 para <20°, 0.315 para >=20°).
 * Retorna 0 si no se detecta grado alcohólico.
 */
export function detectAlcoholTaxRate(nombreProducto: string): number {
  const nombreUpper = (nombreProducto || '').toUpperCase();
  const match = nombreUpper.match(/(\d+(?:[.,]\d+)?)\s*(?:°|º|Â°|ÃÂ°|Ã°)/);
  if (match) {
    const grados = parseFloat(match[1].replace(',', '.'));
    return grados < 20 ? 0.205 : 0.315;
  }
  return 0;
}

/**
 * Distribuye un monto de flete/delivery entre ítems proporcionalmente a sus cantidades.
 * Retorna un nuevo array con fleteTotal asignado a cada ítem.
 */
export function distributeFreight(items: Array<{ cantidad: number; fleteTotal?: number }>, totalDelivery: number): Array<{ cantidad: number; fleteTotal: number }> {
  const totalUnits = items.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);
  if (totalUnits <= 0) return items.map(item => ({ ...item, fleteTotal: 0 }));

  const deliveryUnitario = totalDelivery / totalUnits;
  return items.map(item => ({
    ...item,
    fleteTotal: deliveryUnitario * (Number(item.cantidad) || 1),
  }));
}

/**
 * Valida los ítems para una recepción de stock en Bsale.
 * Retorna los ítems inválidos (sin código o con cantidad <= 0).
 */
export function validateStockItems(items: Array<{ code?: string; quantity?: number }>): Array<{ code?: string; quantity?: number }> {
  return items.filter(item => !item.code || (item.quantity ?? 0) <= 0);
}

/**
 * Construye el payload de recepción de stock para la API de Bsale.
 */
export function buildStockReceptionPayload(
  officeId: number,
  folio: string | undefined,
  razonSocial: string | undefined,
  items: Array<{ quantity: number; code: string; cost: number }>
) {
  return {
    document: "Factura",
    officeId: Number(officeId),
    documentNumber: String(folio || ''),
    note: `Recepción automática - ${razonSocial || 'Proveedor'}`,
    details: items.map(item => ({
      quantity: Number(item.quantity),
      code: String(item.code),
      cost: Number(item.cost),
    })),
  };
}
