import { supabase } from './supabase';

interface EquivalenceMap {
  [supplierCode: string]: string;
}

export async function fetchEquivalenceMap(
  supplierCodes: string[],
  rutEmisor?: string
): Promise<EquivalenceMap> {
  const equivalences: EquivalenceMap = {};
  const codes = supplierCodes.filter(Boolean);

  if (codes.length === 0) return equivalences;

  const { data, error } = await supabase
    .from('sku_equivalences')
    .select('supplier_code, internal_sku, rut_provider')
    .in('supplier_code', codes);

  if (error) {
    console.error('Error fetching equivalences:', error);
    return equivalences;
  }

  if (data) {
    data.forEach((eq: { supplier_code: string; internal_sku: string; rut_provider: string | null }) => {
      if (eq.rut_provider === rutEmisor) {
        equivalences[eq.supplier_code] = eq.internal_sku;
      } else if (!eq.rut_provider && !equivalences[eq.supplier_code]) {
        equivalences[eq.supplier_code] = eq.internal_sku;
      }
    });
  }

  return equivalences;
}
