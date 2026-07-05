import { supabase } from './supabase';
import { hasValidCode } from './skuUtils';

export interface EquivalenceResult {
  eqMap: Map<string, any>;
  itemsToQueue: Array<{
    product_name: string;
    supplier_code: string;
    rut_provider: string;
    status: string;
  }>;
}

export async function processEquivalences(
  items: any[],
  rutEmisor: string
): Promise<EquivalenceResult> {
  const codigos = items.map(item => item.codigo).filter(hasValidCode);
  const eqMap = new Map();
  const itemsToQueue: EquivalenceResult['itemsToQueue'] = [];

  if (codigos.length === 0) {
    return { eqMap, itemsToQueue };
  }

  const { data: equivalences, error: eqError } = await supabase
    .from('sku_equivalences')
    .select('*')
    .in('supplier_code', codigos);

  if (eqError) {
    console.error('Error fetching equivalences:', eqError);
    return { eqMap, itemsToQueue };
  }

  equivalences?.forEach((eq: any) => {
    eqMap.set(eq.supplier_code + '_' + eq.rut_provider, eq);
    if (!eq.rut_provider) {
      eqMap.set(eq.supplier_code + '_null', eq);
    }
  });

  const legacyItems = items.filter((item: any) => {
    return !eqMap.has(item.codigo + '_' + rutEmisor) && eqMap.has(item.codigo + '_null');
  });

  if (legacyItems.length > 0) {
    const firstLegacy = eqMap.get(legacyItems[0].codigo + '_null');
    if (firstLegacy && firstLegacy.supplier_name) {
      const supplierName = firstLegacy.supplier_name;

      const { error: updateError } = await supabase
        .from('sku_equivalences')
        .update({ rut_provider: rutEmisor })
        .eq('supplier_name', supplierName)
        .is('rut_provider', null);

      if (updateError) {
        console.error('Error in massive update for rut_provider:', updateError);
      } else {
        console.log('Auto-llenado exitoso para el proveedor ' + supplierName + ' con RUT ' + rutEmisor);
      }
    }
  }

  for (const item of items) {
    if (!hasValidCode(item.codigo)) continue;

    const hasEq = eqMap.has(item.codigo + '_' + rutEmisor) || eqMap.has(item.codigo + '_null');

    if (!hasEq) {
      itemsToQueue.push({
        product_name: item.nombre,
        supplier_code: item.codigo,
        rut_provider: rutEmisor,
        status: 'SIN_MAPEAR'
      });
    }
  }

  if (itemsToQueue.length > 0) {
    const { error: queueError } = await supabase
      .from('validation_queue')
      .upsert(itemsToQueue, { onConflict: 'supplier_code,rut_provider' });

    if (queueError) {
      console.error('Error inserting into queue in batch:', queueError);
    }
  }

  return { eqMap, itemsToQueue };
}

export async function fetchTaxRates(): Promise<Array<{ product_type: string; tax_percentage: number }>> {
  const { data, error } = await supabase
    .from('tax_rates')
    .select('product_type, tax_percentage');

  if (error || !data) {
    console.error('Error fetching tax rates:', error);
    return [];
  }

  return data;
}
