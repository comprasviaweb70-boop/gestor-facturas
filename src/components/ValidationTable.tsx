'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Link as LinkIcon, Loader2, Plus, Trash2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface ValidationTableProps {
  items?: any[];
  onItemsChange?: (items: any[]) => void;
  rutEmisor?: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning';
}

export default function ValidationTable({ items: propItems, onItemsChange, rutEmisor }: ValidationTableProps) {
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<{ [key: string]: string }>({});
  const [processingItems, setProcessingItems] = useState<{ [key: string]: boolean }>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    if (propItems && propItems.length > 0) {
      const propCodes = propItems.map(i => i.codigo).join(',');
      const localCodes = localItems.map(i => i.codigo).join(',');
      
      if (propCodes !== localCodes || localItems.length === 0) {
        // Asignar ID e Index únicos si no los tienen para evitar fallos en la eliminación
        const itemsWithId = propItems.map((item, index) => ({
          ...item,
          id: item.id || `xml-${index}`,
          index: item.index !== undefined ? item.index : index
        }));
        setLocalItems(itemsWithId);
        searchEquivalences(itemsWithId);
      }
    } else if (!propItems) {
      fetchQueue();
    }
  }, [propItems]);

  const searchEquivalences = async (itemsList: any[]) => {
    const codigos = itemsList.map(item => (item.codigo || item.supplier_code || '').trim()).filter(c => c && c !== 'S/C');
    if (codigos.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('sku_equivalences')
        .select('supplier_code, internal_sku, rut_provider')
        .in('supplier_code', codigos);

      if (error) throw error;

      if (data) {
        const updatedItems = itemsList.map(item => {
          const itemCodigo = (item.codigo || item.supplier_code || '').trim();
          const itemRut = item.rut_provider || rutEmisor;
          
          const match = data.find(eq => 
            (eq.supplier_code || '').trim() === itemCodigo && 
            (!eq.rut_provider || eq.rut_provider === itemRut)
          );
          
          if (match) {
            return { ...item, internal_sku: match.internal_sku };
          }
          return item;
        });
        
        setLocalItems(updatedItems);
        if (onItemsChange) {
          onItemsChange(updatedItems);
        }
      }
    } catch (error) {
      console.error('Error searching equivalences in table:', error);
    }
  };

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('validation_queue')
        .select('*')
        .eq('status', 'SIN_MAPEAR');

      if (error) throw error;
      
      const queueItems = data || [];
      
      // Auto-limpiar: verificar cuáles ya tienen equivalencia y marcarlos
      if (queueItems.length > 0) {
        const codes = queueItems.map(q => q.supplier_code).filter(Boolean);
        const { data: existingEqs } = await supabase
          .from('sku_equivalences')
          .select('supplier_code, rut_provider')
          .in('supplier_code', codes);
        
        if (existingEqs && existingEqs.length > 0) {
          const alreadyMapped = queueItems.filter(q => 
            existingEqs.some(eq => 
              eq.supplier_code === q.supplier_code && 
              (!eq.rut_provider || eq.rut_provider === q.rut_provider)
            )
          );
          
          // Marcar como MAPEADO en la BD
          for (const item of alreadyMapped) {
            await supabase
              .from('validation_queue')
              .update({ status: 'MAPEADO' })
              .eq('id', item.id);
          }
          
          // Filtrar los ya mapeados del resultado
          const remaining = queueItems.filter(q => 
            !alreadyMapped.some(m => m.id === q.id)
          );
          
          const mappedQueue = remaining.map(item => ({
            ...item,
            codigo: item.supplier_code,
            nombre: item.product_name,
            id: item.id
          }));
          
          setLocalItems(mappedQueue);
          if (alreadyMapped.length > 0) {
            showToast(`${alreadyMapped.length} producto(s) ya mapeados fueron removidos de la cola.`, 'success');
          }
          return;
        }
      }
      
      const mappedQueue = queueItems.map(item => ({
        ...item,
        codigo: item.supplier_code,
        nombre: item.product_name,
        id: item.id
      }));
      
      setLocalItems(mappedQueue);
      searchEquivalences(mappedQueue);
    } catch (error) {
      console.error('Error fetching queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeQueue = async () => {
    if (!confirm('¿Eliminar TODOS los productos de la cola de validación? Esto no afecta las equivalencias guardadas.')) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('validation_queue')
        .delete()
        .eq('status', 'SIN_MAPEAR');
      if (error) throw error;
      setLocalItems([]);
      showToast('Cola de validación limpiada.', 'success');
    } catch (error) {
      console.error('Error purging queue:', error);
      showToast('Error al limpiar la cola.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = (id: string | number, field: string, value: any) => {
    const updatedItems = localItems.map(item => {
      const itemId = item.id || item.index;
      if (itemId === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setLocalItems(updatedItems);
    if (onItemsChange) {
      onItemsChange(updatedItems);
    }
  };

  const handleBarcodeScan = async (id: string | number, barcode: string) => {
    if (!barcode) return;
    
    try {
      // Intentar primero por código de barras
      const res = await fetch(`/api/bsale/search?barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      
      let foundSku = '';
      let foundName = '';
      
      if (data.items && data.items.length > 0) {
        foundSku = data.items[0].code;
        foundName = data.items[0].name;
      } else {
        // Fallback: Intentar por código (SKU) por si acaso el escáner leyó el SKU o Bsale lo tiene ahí
        const resCode = await fetch(`/api/bsale/search?code=${encodeURIComponent(barcode)}`);
        const dataCode = await resCode.json();
        
        if (dataCode.items && dataCode.items.length > 0) {
          foundSku = dataCode.items[0].code;
          foundName = dataCode.items[0].name;
        }
      }
      
      if (foundSku) {
        // Actualizar SKU y Nombre en el estado local directamente
        const updatedItems = localItems.map(item => {
          const itemId = item.id || item.index;
          if (itemId === id) {
            return { ...item, internal_sku: foundSku, nombre: foundName || item.nombre };
          }
          return item;
        });
        setLocalItems(updatedItems);
        if (onItemsChange) {
          onItemsChange(updatedItems);
        }
        
        // Persistencia automática en Supabase
        const item = localItems.find(i => (i.id || i.index) === id);
        const activeRut = rutEmisor || (item && item.rut_provider);
        const activeCodigo = item ? (item.codigo || item.supplier_code || '').trim() : null;
        
        if (item && activeCodigo && activeRut) {
          console.log('=== SAVING EQUIVALENCE ===');
          console.log('activeCodigo:', activeCodigo);
          console.log('activeRut:', activeRut);
          console.log('foundSku:', foundSku);
          
          // Check if equivalence already exists
          const { data: existing, error: checkError } = await supabase
            .from('sku_equivalences')
            .select('id')
            .eq('supplier_code', activeCodigo)
            .eq('rut_provider', activeRut)
            .limit(1);

          if (checkError) {
            console.error('Error checking existing:', checkError);
          }
          console.log('existing:', existing);

          let saveError = null;
          
          if (existing && existing.length > 0) {
            // Update existing
            const { error } = await supabase
              .from('sku_equivalences')
              .update({ internal_sku: foundSku, supplier_name: 'Proveedor' })
              .eq('id', existing[0].id);
            saveError = error;
            console.log('UPDATE result error:', error);
          } else {
            // Insert new
            const { data: insertData, error } = await supabase
              .from('sku_equivalences')
              .insert({
                internal_sku: foundSku,
                source_sku: activeCodigo,
                supplier_code: activeCodigo,
                rut_provider: activeRut,
                supplier_name: 'Proveedor'
              })
              .select();
            saveError = error;
            console.log('INSERT result:', insertData, 'error:', error);
          }
            
          if (!saveError) {
            showToast(`✓ Vinculado: ${activeCodigo} → ${foundSku}`, 'success');
            
            // Si estamos en modo cola (sin propItems), marcar como mapeado en la cola
            if (!propItems && item.id) {
              await supabase
                .from('validation_queue')
                .update({ status: 'MAPEADO' })
                .eq('id', item.id);
            }
          } else {
            console.error('Error saving equivalence:', saveError);
            showToast(`Error al guardar: ${saveError.message}`, 'error');
          }
        } else {
          console.warn('Missing data for save:', { activeCodigo, activeRut, hasItem: !!item });
          showToast(`No se pudo guardar: faltan datos (Cód: ${activeCodigo || '?'}, RUT: ${activeRut || '?'})`, 'warning');
        }
      } else {
        showToast('No se encontró el producto en Bsale con ese código.', 'warning');
      }
    } catch (e) {
      console.error('Error in barcode scan:', e);
      showToast('Error al consultar Bsale.', 'error');
    }
  };

  const handleAddRow = () => {
    const newRow = {
      id: `new-${Date.now()}`,
      index: localItems.length,
      nombre: 'Nuevo Producto',
      codigo: 'S/C',
      cantidad: 1,
      precioUnitario: 0,
      subtotalNeto: 0,
      impuestosAdicionales: 0,
      fleteTotal: 0
    };
    const updatedItems = [...localItems, newRow];
    setLocalItems(updatedItems);
    if (onItemsChange) {
      onItemsChange(updatedItems);
    }
  };

  const handleRemoveRow = (id: string | number) => {
    const updatedItems = localItems.filter(item => (item.id || item.index) !== id);
    setLocalItems(updatedItems);
    if (onItemsChange) {
      onItemsChange(updatedItems);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-gray-600">Cargando datos...</span>
      </div>
    );
  }

  const displayItems = showAll ? localItems : localItems.filter(item => !item.internal_sku);

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-primary">
          {propItems ? 'Productos de la Factura' : 'Productos por Validar (Sin Mapear)'}
        </h2>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Mostrar todos</span>
          </label>
          {propItems && (
            <button
              onClick={handleAddRow}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-action hover:bg-orange-600 transition-colors"
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar Fila
            </button>
          )}
          <button
            onClick={fetchQueue}
            className="text-sm text-primary hover:text-primary/80 font-medium px-3 py-1.5"
          >
            Actualizar
          </button>
          <button
            onClick={handlePurgeQueue}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5"
          >
            Limpiar Cola
          </button>
        </div>
      </div>

      {displayItems.length === 0 ? (
        <p className="text-center text-gray-500 py-6">No hay productos pendientes de validación.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-white uppercase bg-primary">
              <tr>
                <th scope="col" className="px-3 py-3">Producto</th>
                <th scope="col" className="px-3 py-3">Cód. Prov.</th>
                <th scope="col" className="px-3 py-3 text-center">Cant.</th>
                <th scope="col" className="px-3 py-3 text-right">Subtotal Neto</th>
                <th scope="col" className="px-3 py-3 text-right">Impto. Adic.</th>
                <th scope="col" className="px-3 py-3 text-right">Flete</th>
                <th scope="col" className="px-3 py-3 text-right bg-primary/80">PCU</th>
                <th scope="col" className="px-3 py-3">Escanear Barra</th>
                <th scope="col" className="px-3 py-3">SKU Bsale</th>
                <th scope="col" className="px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item, idx) => {
                const id = item.id || item.index || idx;
                const subtotalNeto = Number(item.subtotalNeto) || 0;
                const imptoAdic = Number(item.impuestosAdicionales) || 0;
                const flete = Number(item.fleteTotal) || 0;
                const cantidad = Number(item.cantidad) || 1;
                const pcu = (subtotalNeto + imptoAdic + flete) / cantidad;
                
                return (
                  <tr key={id} className="bg-white border-b hover:bg-gray-50">
                    {/* Producto */}
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <textarea
                        value={item.nombre || item.product_name || ''}
                        onChange={(e) => handleUpdateItem(id, 'nombre', e.target.value)}
                        className="w-full border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary resize-y"
                        rows={2}
                      />
                    </td>
                    {/* Cód. Prov. */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.codigo || item.supplier_code || ''}
                        onChange={(e) => handleUpdateItem(id, 'codigo', e.target.value)}
                        className="w-24 border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    {/* Cantidad */}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        step="any"
                        value={item.cantidad || 0}
                        onChange={(e) => handleUpdateItem(id, 'cantidad', Number(e.target.value))}
                        className="w-16 border rounded-md px-2 py-1 text-sm text-center"
                        min="0"
                      />
                      {item.unidadesPorPack && item.unidadesPorPack > 1 && (
                        <div className="text-xs text-orange-600 mt-1 font-medium" title="Detectado como pack/display">
                          Pack ×{item.unidadesPorPack}
                        </div>
                      )}
                    </td>
                    {/* Subtotal Neto (editable) */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={subtotalNeto}
                        onChange={(e) => handleUpdateItem(id, 'subtotalNeto', Number(e.target.value))}
                        className="w-24 border rounded-md px-2 py-1 text-sm text-right"
                        min="0"
                      />
                    </td>
                    {/* Impto. Adicional (editable) */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={imptoAdic}
                        onChange={(e) => handleUpdateItem(id, 'impuestosAdicionales', Number(e.target.value))}
                        className="w-20 border rounded-md px-2 py-1 text-sm text-right"
                        min="0"
                      />
                    </td>
                    {/* Flete (editable) */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={flete}
                        onChange={(e) => handleUpdateItem(id, 'fleteTotal', Number(e.target.value))}
                        className="w-20 border rounded-md px-2 py-1 text-sm text-right"
                        min="0"
                      />
                    </td>
                    {/* PCU (calculado) */}
                    <td className="px-3 py-2 text-right font-semibold text-primary">
                      ${Math.round(pcu).toLocaleString('es-CL')}
                    </td>
                    {/* Escanear Barra */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        placeholder="Escanear..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleBarcodeScan(id, (e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                        className="w-28 border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    {/* SKU Bsale */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        placeholder="SKU"
                        value={item.internal_sku || selectedSkus[id] || ''}
                        onChange={(e) => {
                          handleUpdateItem(id, 'internal_sku', e.target.value);
                          setSelectedSkus(prev => ({ ...prev, [id]: e.target.value }));
                        }}
                        className="w-20 border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    {/* Acciones */}
                    <td className="px-3 py-2 flex space-x-1">
                      <button
                        onClick={() => handleBarcodeScan(id, selectedSkus[id] || '')}
                        className="p-1.5 text-primary hover:text-primary/80"
                        title="Vincular"
                      >
                        <LinkIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveRow(id)}
                        className="p-1.5 text-red-500 hover:text-red-700"
                        title="Eliminar fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center space-x-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
                toast.type === 'success' ? 'bg-green-600 text-white' :
                toast.type === 'error' ? 'bg-red-600 text-white' :
                'bg-yellow-500 text-white'
              }`}
            >
              {toast.type === 'success' && <CheckCircle className="h-4 w-4 flex-shrink-0" />}
              {toast.type === 'error' && <XCircle className="h-4 w-4 flex-shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
