'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Link as LinkIcon, Loader2 } from 'lucide-react';

export default function ValidationTable() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkus, setSelectedSkus] = useState<{ [key: string]: string }>({});
  const [processingItems, setProcessingItems] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('validation_queue')
        .select('*')
        .eq('status', 'SIN_MAPEAR');

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVincular = async (item: any) => {
    const selectedSku = selectedSkus[item.id];
    if (!selectedSku) {
      alert('Por favor, ingresa un SKU de Bsale primero.');
      return;
    }

    setProcessingItems(prev => ({ ...prev, [item.id]: true }));

    try {
      // a) Upsert en sku_equivalences
      const { error: upsertError } = await supabase
        .from('sku_equivalences')
        .upsert({
          internal_sku: selectedSku,
          supplier_code: item.supplier_code,
          rut_provider: item.rut_provider,
          supplier_name: 'Proveedor' // Podríamos pasarlo si lo tenemos
        }, { onConflict: 'supplier_code,rut_provider' });

      if (upsertError) throw upsertError;

      // b) Cambiar estado en validation_queue a 'MAPEADO'
      const { error: updateError } = await supabase
        .from('validation_queue')
        .update({ status: 'MAPEADO' })
        .eq('supplier_code', item.supplier_code)
        .eq('rut_provider', item.rut_provider);

      if (updateError) throw updateError;

      // Refrescar la tabla
      await fetchQueue();
      alert('Vinculación exitosa');
    } catch (error) {
      console.error('Error vinculando:', error);
      alert('Error al realizar la vinculación.');
    } finally {
      setProcessingItems(prev => ({ ...prev, [item.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-gray-600">Cargando cola de validación...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-primary">Productos por Validar (Sin Mapear)</h2>
        <button
          onClick={fetchQueue}
          className="text-sm text-primary hover:text-primary/80 font-medium"
        >
          Actualizar
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-gray-500 py-6">No hay productos pendientes de validación.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-white uppercase bg-primary">
              <tr>
                <th scope="col" className="px-6 py-3">Producto (Factura)</th>
                <th scope="col" className="px-6 py-3">Código Prov.</th>
                <th scope="col" className="px-6 py-3">RUT Prov.</th>
                <th scope="col" className="px-6 py-3">SKU Bsale</th>
                <th scope="col" className="px-6 py-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{item.product_name}</td>
                  <td className="px-6 py-4">{item.supplier_code}</td>
                  <td className="px-6 py-4">{item.rut_provider}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center border rounded-md px-2 py-1 bg-white focus-within:ring-1 focus-within:ring-primary">
                      <input
                        type="text"
                        placeholder="Ingresar SKU Bsale..."
                        value={selectedSkus[item.id] || ''}
                        onChange={(e) => setSelectedSkus(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="border-none outline-none text-sm w-full focus:ring-0"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleVincular(item)}
                      disabled={processingItems[item.id] || !selectedSkus[item.id]}
                      className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-full shadow-sm text-white transition-colors ${processingItems[item.id] || !selectedSkus[item.id]
                          ? 'bg-gray-300 cursor-not-allowed'
                          : 'bg-action hover:bg-orange-600'
                        }`}
                    >
                      {processingItems[item.id] ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <LinkIcon className="h-3 w-3 mr-1" />
                      )}
                      Vincular
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
