'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Link as LinkIcon, Loader2, Plus, Trash2 } from 'lucide-react';

interface ValidationTableProps {
  items?: any[];
  onItemsChange?: (items: any[]) => void;
  rutEmisor?: string;
}

export default function ValidationTable({ items: propItems, onItemsChange, rutEmisor }: ValidationTableProps) {
  const [localItems, setLocalItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<{ [key: string]: string }>({});
  const [processingItems, setProcessingItems] = useState<{ [key: string]: boolean }>({});

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
    const codigos = itemsList.map(item => item.codigo || item.supplier_code).filter(c => c && c !== 'S/C');
    if (codigos.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('sku_equivalences')
        .select('supplier_code, internal_sku, rut_provider')
        .in('supplier_code', codigos);

      if (error) throw error;

      if (data) {
        const updatedItems = itemsList.map(item => {
          const itemCodigo = item.codigo || item.supplier_code;
          const itemRut = item.rut_provider || rutEmisor;
          
          const match = data.find(eq => 
            eq.supplier_code === itemCodigo && 
            (eq.rut_provider === itemRut || !eq.rut_provider)
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
      
      const mappedQueue = (data || []).map(item => ({
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
        
        // Persistencia automática en Supabase si viene del XML
        const item = localItems.find(i => (i.id || i.index) === id);
        if (item && item.codigo && rutEmisor) {
          const { error } = await supabase
            .from('sku_equivalences')
            .upsert({
              internal_sku: foundSku,
              supplier_code: item.codigo,
              rut_provider: rutEmisor,
              supplier_name: 'Proveedor'
            }, { onConflict: 'supplier_code,rut_provider' });
            
          if (!error) {
            alert(`¡Vinculado automáticamente! ${item.codigo} -> ${foundSku}`);
          }
        }
      } else {
        alert('No se encontró el producto en Bsale con ese código de barras.');
      }
    } catch (e) {
      console.error('Error in barcode scan:', e);
      alert('Error al consultar Bsale.');
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
      impuestosAdicionales: 0
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
        </div>
      </div>

      {displayItems.length === 0 ? (
        <p className="text-center text-gray-500 py-6">No hay productos pendientes de validación.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-white uppercase bg-primary">
              <tr>
                <th scope="col" className="px-4 py-3">Producto</th>
                <th scope="col" className="px-4 py-3">Cód. Prov.</th>
                <th scope="col" className="px-4 py-3">Cant.</th>
                <th scope="col" className="px-4 py-3">PCU</th>
                <th scope="col" className="px-4 py-3">Escanear Barra</th>
                <th scope="col" className="px-4 py-3">SKU Bsale</th>
                <th scope="col" className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item, idx) => {
                const id = item.id || item.index || idx;
                return (
                  <tr key={id} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <textarea
                        value={item.nombre || item.product_name || ''}
                        onChange={(e) => handleUpdateItem(id, 'nombre', e.target.value)}
                        className="w-full border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary resize-y"
                        rows={2}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.codigo || item.supplier_code || ''}
                        onChange={(e) => handleUpdateItem(id, 'codigo', e.target.value)}
                        className="w-24 border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="any"
                        value={item.cantidad || 0}
                        onChange={(e) => handleUpdateItem(id, 'cantidad', Number(e.target.value))}
                        className="w-16 border rounded-md px-2 py-1 text-sm"
                        min="0"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="any"
                        value={item.precioUnitario || item.precioNeto || 0}
                        onChange={(e) => handleUpdateItem(id, 'precioUnitario', Number(e.target.value))}
                        className="w-24 border rounded-md px-2 py-1 text-sm"
                        min="0"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        placeholder="Escanear..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleBarcodeScan(id, (e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).value = ''; // Limpiar después de escanear
                          }
                        }}
                        className="w-32 border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        placeholder="SKU Bsale"
                        value={item.internal_sku || selectedSkus[id] || ''}
                        onChange={(e) => {
                          handleUpdateItem(id, 'internal_sku', e.target.value);
                          setSelectedSkus(prev => ({ ...prev, [id]: e.target.value }));
                        }}
                        className="w-24 border rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3 flex space-x-2">
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
    </div>
  );
}
