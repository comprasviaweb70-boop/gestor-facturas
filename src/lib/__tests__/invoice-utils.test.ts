import { describe, it, expect } from 'vitest';
import {
  extractJson,
  parseSpanishNumber,
  calcularFleteOcultoBruto,
  normalizeRut,
  detectPackMultiplier,
  detectHiperkorMultiplier,
  detectDimakMultiplier,
  detectBatMultiplier,
  detectAlcoholTaxRate,
  distributeFreight,
  validateStockItems,
  buildStockReceptionPayload,
} from '../invoice-utils';

// =============================================================================
// extractJson
// =============================================================================
describe('extractJson', () => {
  it('extrae JSON limpio directamente', () => {
    const result = extractJson('{"rutEmisor": "12345678-9", "folio": "123"}');
    expect(result).toEqual({ rutEmisor: '12345678-9', folio: '123' });
  });

  it('extrae JSON envuelto en texto adicional', () => {
    const result = extractJson('Aquí está el resultado: {"folio": "456"} fin.');
    expect(result).toEqual({ folio: '456' });
  });

  it('extrae JSON con bloques markdown de código', () => {
    const result = extractJson('```json\n{"items": [1, 2, 3]}\n```');
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('extrae array JSON', () => {
    const result = extractJson('[{"id": 1}, {"id": 2}]');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('extrae array JSON envuelto en texto (sin objetos internos)', () => {
    const result = extractJson('El resultado es: [1, 2, 3] eso es todo.');
    expect(result).toEqual([1, 2, 3]);
  });

  it('prioriza objeto sobre array cuando ambos existen', () => {
    // La función busca {} antes que [], así que extrae el objeto interior
    const result = extractJson('El resultado es: [{"nombre": "test"}] eso es todo.');
    expect(result).toEqual({ nombre: 'test' });
  });

  it('repara JSON con comillas simples', () => {
    const result = extractJson("{'nombre': 'producto', 'precio': 100}");
    expect(result).toEqual({ nombre: 'producto', precio: 100 });
  });

  it('repara JSON con trailing commas', () => {
    const result = extractJson('{"a": 1, "b": 2, }');
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('lanza error si no puede extraer JSON válido', () => {
    expect(() => extractJson('esto no es JSON en absoluto'))
      .toThrow('No se pudo extraer JSON válido');
  });

  it('lanza error para string vacío', () => {
    expect(() => extractJson('')).toThrow('No se pudo extraer JSON válido');
  });

  it('extrae JSON complejo con items anidados', () => {
    const input = `{"rutEmisor": "79576940-4", "folio": "12345", "razonSocial": "ZAPATA", "items": [{"nombre": "CERVEZA", "codigo": "SKU001", "cantidad": 10, "precioUnitario": 500}]}`;
    const result = extractJson(input);
    expect(result.rutEmisor).toBe('79576940-4');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].cantidad).toBe(10);
  });
});

// =============================================================================
// parseSpanishNumber
// =============================================================================
describe('parseSpanishNumber', () => {
  it('parsea número entero como string', () => {
    expect(parseSpanishNumber('100')).toBe(100);
  });

  it('parsea número decimal con punto', () => {
    expect(parseSpanishNumber('100.5')).toBe(100.5);
  });

  it('parsea formato español: coma como decimal', () => {
    expect(parseSpanishNumber('100,5')).toBe(100.5);
  });

  it('parsea formato español completo: puntos como miles y coma como decimal', () => {
    expect(parseSpanishNumber('1.234,56')).toBe(1234.56);
  });

  it('parsea número con múltiples separadores de miles', () => {
    expect(parseSpanishNumber('1.234.567,89')).toBe(1234567.89);
  });

  it('retorna 0 para string no numérico', () => {
    expect(parseSpanishNumber('abc')).toBe(0);
  });

  it('retorna 0 para string vacío', () => {
    expect(parseSpanishNumber('')).toBe(0);
  });

  it('retorna el número si ya es tipo number', () => {
    expect(parseSpanishNumber(42)).toBe(42);
  });

  it('retorna 0 para NaN', () => {
    expect(parseSpanishNumber(NaN)).toBe(0);
  });

  it('retorna 0 para null', () => {
    expect(parseSpanishNumber(null)).toBe(0);
  });

  it('retorna 0 para undefined', () => {
    expect(parseSpanishNumber(undefined)).toBe(0);
  });

  it('maneja números negativos como string', () => {
    expect(parseSpanishNumber('-50')).toBe(-50);
  });

  it('parsea string con espacios', () => {
    expect(parseSpanishNumber('  100  ')).toBe(100);
  });

  it('parsea cantidad decimal con coma (ej: factura chilena)', () => {
    expect(parseSpanishNumber('0,6')).toBe(0.6);
  });
});

// =============================================================================
// calcularFleteOcultoBruto
// =============================================================================
describe('calcularFleteOcultoBruto', () => {
  it('retorna 0 si precio bruto es 0', () => {
    expect(calcularFleteOcultoBruto(0, 100, 0)).toBe(0);
  });

  it('retorna 0 si precio bruto es negativo', () => {
    expect(calcularFleteOcultoBruto(-10, 100, 0)).toBe(0);
  });

  it('calcula flete sin impuesto adicional (ILA=0)', () => {
    // Bruto=1500, Neto=1000, ILA=0
    // Flete = (1500 - (1000 * (1 + 0.19 + 0))) / 1.19
    //       = (1500 - 1190) / 1.19
    //       = 310 / 1.19 ≈ 260.504
    const result = calcularFleteOcultoBruto(1500, 1000, 0);
    expect(result).toBeCloseTo(260.504, 2);
  });

  it('calcula flete con impuesto adicional 20.5% (cervezas)', () => {
    // Bruto=1700, Neto=1000, ILA=0.205
    // Flete = (1700 - (1000 * (1 + 0.19 + 0.205))) / 1.19
    //       = (1700 - 1395) / 1.19
    //       = 305 / 1.19 ≈ 256.302
    const result = calcularFleteOcultoBruto(1700, 1000, 0.205);
    expect(result).toBeCloseTo(256.302, 2);
  });

  it('calcula flete con impuesto adicional 31.5% (destilados)', () => {
    // Bruto=2000, Neto=1000, ILA=0.315
    // Flete = (2000 - (1000 * (1 + 0.19 + 0.315))) / 1.19
    //       = (2000 - 1505) / 1.19
    //       = 495 / 1.19 ≈ 415.966
    const result = calcularFleteOcultoBruto(2000, 1000, 0.315);
    expect(result).toBeCloseTo(415.966, 2);
  });

  it('retorna 0 si el cálculo sería negativo (sin flete oculto)', () => {
    // Bruto=1000, Neto=1000, ILA=0
    // Flete = (1000 - 1190) / 1.19 = -190/1.19 → negativo → 0
    const result = calcularFleteOcultoBruto(1000, 1000, 0);
    expect(result).toBe(0);
  });

  it('retorna 0 si bruto es exactamente el neto con IVA', () => {
    // Bruto = Neto * 1.19 → flete = 0
    const result = calcularFleteOcultoBruto(1190, 1000, 0);
    expect(result).toBeCloseTo(0, 2);
  });
});

// =============================================================================
// normalizeRut
// =============================================================================
describe('normalizeRut', () => {
  it('quita puntos y guión', () => {
    expect(normalizeRut('79.576.940-4')).toBe('795769404');
  });

  it('mantiene dígito verificador K en mayúscula', () => {
    expect(normalizeRut('78.753.810-k')).toBe('78753810K');
  });

  it('maneja RUT sin formato', () => {
    expect(normalizeRut('795769404')).toBe('795769404');
  });

  it('retorna string vacío para null', () => {
    expect(normalizeRut(null)).toBe('');
  });

  it('retorna string vacío para undefined', () => {
    expect(normalizeRut(undefined)).toBe('');
  });

  it('quita espacios', () => {
    expect(normalizeRut('79 576 940 - 4')).toBe('795769404');
  });
});

// =============================================================================
// detectPackMultiplier (reglas generales)
// =============================================================================
describe('detectPackMultiplier', () => {
  it('detecta patrón AxBxC tomando el segundo término', () => {
    expect(detectPackMultiplier('GALLETA 12X30X15 GRS')).toBe(30);
  });

  it('detecta unidades con "UNIDADES"', () => {
    expect(detectPackMultiplier('CERVEZA LAGER 24 UNIDADES')).toBe(24);
  });

  it('detecta unidades con "UNID"', () => {
    expect(detectPackMultiplier('BEBIDA 6 UNID')).toBe(6);
  });

  it('detecta unidades con "UN" (boundary)', () => {
    expect(detectPackMultiplier('JUGO NARANJA 12UN')).toBe(12);
  });

  it('no confunde "BUN" o "BUNDT" con "UN"', () => {
    // "BUN" no debe matchear por el \b boundary
    expect(detectPackMultiplier('BUNDT CAKE CHOCOLATE')).toBe(1);
  });

  it('detecta PACK seguido de número', () => {
    expect(detectPackMultiplier('COCA COLA PACK 6')).toBe(6);
  });

  it('detecta PACK DE número', () => {
    expect(detectPackMultiplier('CERVEZA PACK DE 12')).toBe(12);
  });

  it('detecta DISPLAY seguido de número', () => {
    expect(detectPackMultiplier('CHOCOLATE DISPLAY 24')).toBe(24);
  });

  it('retorna 1 si no detecta patrón', () => {
    expect(detectPackMultiplier('COCA COLA 1.5LT')).toBe(1);
  });

  it('retorna 1 para string vacío', () => {
    expect(detectPackMultiplier('')).toBe(1);
  });
});

// =============================================================================
// detectHiperkorMultiplier
// =============================================================================
describe('detectHiperkorMultiplier', () => {
  it('detecta patrón X6', () => {
    expect(detectHiperkorMultiplier('PEPSI DES 1.5LT X6 BEBIDA')).toBe(6);
  });

  it('detecta patrón X 12 con espacio', () => {
    expect(detectHiperkorMultiplier('CERVEZA X 12')).toBe(12);
  });

  it('detecta CJ 24', () => {
    expect(detectHiperkorMultiplier('AGUA MINERAL CJ 24')).toBe(24);
  });

  it('detecta CJA 12', () => {
    expect(detectHiperkorMultiplier('JUGO CJA 12')).toBe(12);
  });

  it('detecta CAJA 6', () => {
    expect(detectHiperkorMultiplier('VINO CAJA 6')).toBe(6);
  });

  it('detecta 6 UN', () => {
    expect(detectHiperkorMultiplier('BEBIDA 6 UN')).toBe(6);
  });

  it('detecta 12 UNID', () => {
    expect(detectHiperkorMultiplier('AGUA 12 UNID')).toBe(12);
  });

  it('retorna 1 si no encuentra patrón', () => {
    expect(detectHiperkorMultiplier('MANZANA VERDE 1KG')).toBe(1);
  });
});

// =============================================================================
// detectDimakMultiplier
// =============================================================================
describe('detectDimakMultiplier', () => {
  it('detecta número seguido de X al final', () => {
    expect(detectDimakMultiplier('CERVEZA 6 X')).toBe(6);
  });

  it('detecta otro número', () => {
    expect(detectDimakMultiplier('BEBIDA COLA 12 X')).toBe(12);
  });

  it('retorna 1 si X no está al final', () => {
    expect(detectDimakMultiplier('CERVEZA X 6')).toBe(1);
  });

  it('retorna 1 si no hay patrón', () => {
    expect(detectDimakMultiplier('CERVEZA LAGER 500ML')).toBe(1);
  });
});

// =============================================================================
// detectBatMultiplier
// =============================================================================
describe('detectBatMultiplier', () => {
  it('detecta 20S (20 cigarros por paquete)', () => {
    expect(detectBatMultiplier('KENT SILVER 20S')).toBe(20);
  });

  it('detecta 10S (10 cigarros por paquete)', () => {
    expect(detectBatMultiplier('LUCKY STRIKE 10S')).toBe(10);
  });

  it('detecta 18S (18 cigarros por paquete)', () => {
    expect(detectBatMultiplier('PALL MALL 18S')).toBe(18);
  });

  it('es case-insensitive', () => {
    expect(detectBatMultiplier('kent silver 20s')).toBe(20);
  });

  it('retorna 1 si no hay patrón de cigarros', () => {
    expect(detectBatMultiplier('MARLBORO RED BOX')).toBe(1);
  });

  it('no matchea números que no son 10, 18 o 20', () => {
    expect(detectBatMultiplier('PRODUCTO 15S')).toBe(1);
  });
});

// =============================================================================
// detectAlcoholTaxRate
// =============================================================================
describe('detectAlcoholTaxRate', () => {
  it('retorna 0.205 para grado < 20 (cerveza)', () => {
    expect(detectAlcoholTaxRate('CERVEZA LAGER 5° 500ML')).toBe(0.205);
  });

  it('retorna 0.315 para grado >= 20 (destilados)', () => {
    expect(detectAlcoholTaxRate('PISCO 35° 750ML')).toBe(0.315);
  });

  it('retorna 0.315 para exactamente 20°', () => {
    expect(detectAlcoholTaxRate('LICOR 20° BOTELLA')).toBe(0.315);
  });

  it('maneja símbolo º (ordinal)', () => {
    expect(detectAlcoholTaxRate('VINO 14º CABERNET')).toBe(0.205);
  });

  it('maneja grado con encoding incorrecto Â°', () => {
    expect(detectAlcoholTaxRate('CERVEZA 5Â° LAGER')).toBe(0.205);
  });

  it('maneja grado decimal con coma', () => {
    expect(detectAlcoholTaxRate('CERVEZA 4,5° ALE')).toBe(0.205);
  });

  it('retorna 0 si no hay grado alcohólico', () => {
    expect(detectAlcoholTaxRate('BEBIDA GASEOSA 1.5LT')).toBe(0);
  });
});

// =============================================================================
// distributeFreight
// =============================================================================
describe('distributeFreight', () => {
  it('distribuye flete proporcionalmente entre ítems', () => {
    const items = [
      { cantidad: 10, fleteTotal: 0 },
      { cantidad: 20, fleteTotal: 0 },
    ];
    const result = distributeFreight(items, 300);
    expect(result[0].fleteTotal).toBeCloseTo(100, 2); // 10/30 * 300
    expect(result[1].fleteTotal).toBeCloseTo(200, 2); // 20/30 * 300
  });

  it('maneja un solo ítem', () => {
    const items = [{ cantidad: 5, fleteTotal: 0 }];
    const result = distributeFreight(items, 500);
    expect(result[0].fleteTotal).toBeCloseTo(500, 2);
  });

  it('retorna 0 si no hay unidades totales', () => {
    const items = [{ cantidad: 0, fleteTotal: 0 }];
    const result = distributeFreight(items, 300);
    expect(result[0].fleteTotal).toBe(0);
  });

  it('maneja cantidades decimales', () => {
    const items = [
      { cantidad: 0.5, fleteTotal: 0 },
      { cantidad: 1.5, fleteTotal: 0 },
    ];
    const result = distributeFreight(items, 200);
    expect(result[0].fleteTotal).toBeCloseTo(50, 2);  // 0.5/2 * 200
    expect(result[1].fleteTotal).toBeCloseTo(150, 2); // 1.5/2 * 200
  });
});

// =============================================================================
// validateStockItems
// =============================================================================
describe('validateStockItems', () => {
  it('retorna ítems sin código', () => {
    const items = [
      { code: 'SKU1', quantity: 5 },
      { code: '', quantity: 10 },
      { code: 'SKU3', quantity: 3 },
    ];
    const invalid = validateStockItems(items);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].code).toBe('');
  });

  it('retorna ítems con cantidad 0', () => {
    const items = [
      { code: 'SKU1', quantity: 0 },
      { code: 'SKU2', quantity: 5 },
    ];
    const invalid = validateStockItems(items);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].code).toBe('SKU1');
  });

  it('retorna ítems con cantidad negativa', () => {
    const items = [
      { code: 'SKU1', quantity: -1 },
    ];
    const invalid = validateStockItems(items);
    expect(invalid).toHaveLength(1);
  });

  it('retorna array vacío si todos son válidos', () => {
    const items = [
      { code: 'SKU1', quantity: 5 },
      { code: 'SKU2', quantity: 10 },
    ];
    const invalid = validateStockItems(items);
    expect(invalid).toHaveLength(0);
  });

  it('retorna ítems sin propiedad code (undefined)', () => {
    const items: Array<{ code?: string; quantity?: number }> = [
      { quantity: 5 },
    ];
    const invalid = validateStockItems(items);
    expect(invalid).toHaveLength(1);
  });
});

// =============================================================================
// buildStockReceptionPayload
// =============================================================================
describe('buildStockReceptionPayload', () => {
  it('construye payload correcto con todos los campos', () => {
    const items = [
      { quantity: 10, code: 'SKU001', cost: 1500 },
      { quantity: 5, code: 'SKU002', cost: 2000 },
    ];
    const payload = buildStockReceptionPayload(1, '12345', 'PROVEEDOR SA', items);

    expect(payload.document).toBe('Factura');
    expect(payload.officeId).toBe(1);
    expect(payload.documentNumber).toBe('12345');
    expect(payload.note).toBe('Recepción automática - PROVEEDOR SA');
    expect(payload.details).toHaveLength(2);
    expect(payload.details[0]).toEqual({ quantity: 10, code: 'SKU001', cost: 1500 });
    expect(payload.details[1]).toEqual({ quantity: 5, code: 'SKU002', cost: 2000 });
  });

  it('maneja folio undefined', () => {
    const items = [{ quantity: 1, code: 'A', cost: 100 }];
    const payload = buildStockReceptionPayload(2, undefined, 'TEST', items);
    expect(payload.documentNumber).toBe('');
  });

  it('maneja razonSocial undefined', () => {
    const items = [{ quantity: 1, code: 'A', cost: 100 }];
    const payload = buildStockReceptionPayload(2, '999', undefined, items);
    expect(payload.note).toBe('Recepción automática - Proveedor');
  });

  it('convierte officeId a número', () => {
    const items = [{ quantity: 1, code: 'A', cost: 100 }];
    const payload = buildStockReceptionPayload('5' as unknown as number, '1', 'X', items);
    expect(payload.officeId).toBe(5);
  });
});
