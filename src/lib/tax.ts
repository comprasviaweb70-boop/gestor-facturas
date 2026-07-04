import { supabase } from './supabase';

export interface TaxRate {
  product_type: string;
  tax_percentage: number;
}

export async function fetchTaxRates(): Promise<TaxRate[]> {
  const { data, error } = await supabase
    .from('tax_rates')
    .select('product_type, tax_percentage');

  if (error) {
    console.error('Error fetching tax rates:', error);
    return [];
  }

  return data || [];
}

export function detectTaxByProductName(
  productName: string,
  taxRates: TaxRate[]
): number {
  const nombreUpper = productName.toUpperCase();
  for (const rate of taxRates) {
    const keyword = (rate.product_type || '').trim().toUpperCase();
    if (keyword && nombreUpper.includes(keyword)) {
      return rate.tax_percentage / 100;
    }
  }
  return 0;
}

export function calcularFleteOcultoBruto(
  pBrutoUni: number,
  pNetoUni: number,
  imptoAdicRate: number
): number {
  if (!pBrutoUni || pBrutoUni <= 0) return 0;
  const fleteUni = (pBrutoUni - (pNetoUni * (1 + 0.19 + imptoAdicRate))) / 1.19;
  return Math.max(0, fleteUni);
}
