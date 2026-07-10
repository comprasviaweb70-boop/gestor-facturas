import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runPipeline } from '../supplier-rules';
import { TaxRate } from '../types/invoice';

const FIXTURES_DIR = join(__dirname, '../../../test/fixtures/invoices');

function loadFixture(name: string) {
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf-8');
  return JSON.parse(raw);
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const MOCK_TAX_RATES: TaxRate[] = [
  { product_type: 'CERVEZA', tax_percentage: 20.5 },
  { product_type: 'BEBIDA', tax_percentage: 18 },
  { product_type: 'PISCO', tax_percentage: 31.5 },
  { product_type: 'AGUA', tax_percentage: 10 },
  { product_type: 'VINO', tax_percentage: 20.5 },
  { product_type: 'TABACO', tax_percentage: 0 },
];

interface ExpectedItem {
  nombre: string;
  codigo: string;
  cantidad: number;
  precioBrutoUnitario?: number;
  impuestosAdicionales: number;
  fleteTotal: number;
  unidadesPorPack?: number;
  cantidadReal?: number;
}

function compareItem(actual: any, expected: ExpectedItem, idx: number) {
  expect(actual.nombre, `item[${idx}].nombre`).toBe(expected.nombre);
  expect(actual.codigo, `item[${idx}].codigo`).toBe(expected.codigo);
  expect(actual.cantidad, `item[${idx}].cantidad`).toBe(expected.cantidad);
  if (expected.precioBrutoUnitario !== undefined) {
    expect(actual.precioBrutoUnitario, `item[${idx}].precioBrutoUnitario`).toBe(expected.precioBrutoUnitario);
  }
  if (expected.impuestosAdicionales !== undefined) {
    expect(actual.impuestosAdicionales, `item[${idx}].impuestosAdicionales`).toBeCloseTo(expected.impuestosAdicionales, 0);
  }
  if (expected.fleteTotal !== undefined) {
    expect(actual.fleteTotal, `item[${idx}].fleteTotal`).toBeCloseTo(expected.fleteTotal, 0);
  }
  if (expected.unidadesPorPack !== undefined) {
    expect(actual.unidadesPorPack, `item[${idx}].unidadesPorPack`).toBe(expected.unidadesPorPack);
  }
  if (expected.cantidadReal !== undefined) {
    expect(actual.cantidadReal, `item[${idx}].cantidadReal`).toBe(expected.cantidadReal);
  }
}

describe('Pipeline de reglas por proveedor — Fixtures de regresión', () => {
  const fixtures = [
    'hiperkor.json',
    'dimak.json',
    'bat-chile.json',
    'mad-charlies.json',
    'zapata.json',
    'vct.json',
    'general.json',
    'coca-cola.json',
  ];

  fixtures.forEach((fixtureName) => {
    const fixture = loadFixture(fixtureName);
    const provider = fixture.provider as string;

    describe(`${provider}`, () => {
      it('preserva metadatos de la factura', () => {
        const data = deepClone(fixture.rawData);
        const result = runPipeline(data, MOCK_TAX_RATES, fixture.sourceFormat as 'xml' | 'pdf' | 'image');
        expect(result.folio).toBe(fixture.rawData.folio);
        expect(result.razonSocial).toBe(fixture.rawData.razonSocial);
      });

      it('produce el número correcto de ítems', () => {
        const data = deepClone(fixture.rawData);
        const result = runPipeline(data, MOCK_TAX_RATES, fixture.sourceFormat as 'xml' | 'pdf' | 'image');
        expect(result.items.length).toBe(fixture.expectedItems.length);
      });

      it('transforma cada ítem correctamente', () => {
        const data = deepClone(fixture.rawData);
        const result = runPipeline(data, MOCK_TAX_RATES, fixture.sourceFormat as 'xml' | 'pdf' | 'image');
        fixture.expectedItems.forEach((expected: ExpectedItem, idx: number) => {
          expect(idx < result.items.length, `ítem[${idx}] existe`).toBe(true);
          compareItem(result.items[idx], expected, idx);
        });
      });
    });
  });
});
