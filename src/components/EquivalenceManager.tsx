'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Database, Search, Trash2, Save, X, ChevronDown, ChevronUp, Pencil, Loader2 } from 'lucide-react';

interface Equivalence {
  id: string;
  internal_sku: string;
  source_sku: string;
  supplier_code: string;
  supplier_name: string;
  rut_provider: string | null;
  created_at: string;
}

export default function EquivalenceManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [equivalences, setEquivalences] = useState<Equivalence[]>([]);
  const [filteredEquivalences, setFilteredEquivalences] = useState<Equivalence[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Equivalence>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const fetchEquivalences = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sku_equivalences')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEquivalences(data || []);
      setFilteredEquivalences(data || []);
      setPage(0);
    } catch (error) {
      console.error('Error fetching equivalences:', error);
      alert('Error al cargar las equivalencias.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && equivalences.length === 0) {
      fetchEquivalences();
    }
  }, [isOpen, equivalences.length, fetchEquivalences]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredEquivalences(equivalences);
    } else {
      const term = searchTerm.toLowerCase().trim();
      setFilteredEquivalences(
        equivalences.filter(eq =>
          (eq.internal_sku || '').toLowerCase().includes(term) ||
          (eq.source_sku || '').toLowerCase().includes(term) ||
          (eq.supplier_code || '').toLowerCase().includes(term) ||
          (eq.supplier_name || '').toLowerCase().includes(term) ||
          (eq.rut_provider || '').toLowerCase().includes(term)
        )
      );
    }
    setPage(0);
  }, [searchTerm, equivalences]);

  const handleEdit = (eq: Equivalence) => {
    setEditingId(eq.id);
    setEditValues({
      internal_sku: eq.internal_sku,
      supplier_code: eq.supplier_code,
      supplier_name: eq.supplier_name,
      rut_provider: eq.rut_provider,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    try {
      const { error } = await supabase
        .from('sku_equivalences')
        .update({
          internal_sku: editValues.internal_sku,
          supplier_code: editValues.supplier_code,
          supplier_name: editValues.supplier_name,
          rut_provider: editValues.rut_provider,
        })
        .eq('id', id);

      if (error) throw error;

      // Actualizar en estado local
      setEquivalences(prev =>
        prev.map(eq => eq.id === id ? { ...eq, ...editValues } as Equivalence : eq)
      );
      setEditingId(null);
      setEditValues({});
      alert('Equivalencia actualizada correctamente.');
    } catch (error: any) {
      console.error('Error updating equivalence:', error);
      alert('Error al actualizar: ' + error.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta equivalencia? Esta acción no se puede deshacer.')) {
      return;
    }
    
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('sku_equivalences')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEquivalences(prev => prev.filter(eq => eq.id !== id));
      alert('Equivalencia eliminada correctamente.');
    } catch (error: any) {
      console.error('Error deleting equivalence:', error);
      alert('Error al eliminar: ' + error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const paginatedItems = filteredEquivalences.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredEquivalences.length / PAGE_SIZE);

  return (
    <div className="w-full max-w-6xl mx-auto mt-8">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center px-6 py-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Database className="h-5 w-5 text-primary" />
          <div className="text-left">
            <h2 className="text-lg font-semibold text-primary">Gestión de Equivalencias SKU</h2>
            <p className="text-xs text-gray-500">Editar o eliminar pareos existentes ({equivalences.length} registros)</p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="bg-white mt-2 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por SKU, código proveedor, nombre o RUT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            
            {/* Buscador por Código de Barras */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Escanear código de barras..."
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const barcode = e.currentTarget.value.trim();
                    if (!barcode) return;
                    
                    try {
                      const res = await fetch(`/api/bsale/search?barcode=${encodeURIComponent(barcode)}`);
                      const data = await res.json();
                      
                      if (data.items && data.items.length > 0) {
                        const sku = data.items[0].code;
                        setSearchTerm(sku);
                        alert(`Encontrado en Bsale: ${data.items[0].name}. Filtrando por SKU: ${sku}`);
                      } else {
                        alert('No se encontró producto en Bsale con ese código de barras.');
                      }
                    } catch (error) {
                      console.error('Error searching barcode:', error);
                      alert('Error al buscar el código de barras.');
                    } finally {
                      e.currentTarget.value = ''; // Limpiar input
                    }
                  }
                }}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-gray-50"
              />
            </div>

            <button
              onClick={fetchEquivalences}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg text-primary border border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 justify-center"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recargar'}
            </button>
          </div>

          {/* Stats Bar */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 flex justify-between">
            <span>Mostrando {paginatedItems.length} de {filteredEquivalences.length} equivalencias</span>
            {searchTerm && <span>Filtro activo: &quot;{searchTerm}&quot;</span>}
          </div>

          {loading ? (
            <div className="flex justify-center items-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-gray-600">Cargando equivalencias...</span>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-white uppercase bg-primary/80">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">SKU Bsale</th>
                      <th scope="col" className="px-3 py-2.5">Cód. Proveedor</th>
                      <th scope="col" className="px-3 py-2.5">Proveedor</th>
                      <th scope="col" className="px-3 py-2.5">RUT</th>
                      <th scope="col" className="px-3 py-2.5">Fecha</th>
                      <th scope="col" className="px-3 py-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                          {searchTerm ? 'No se encontraron equivalencias con ese filtro.' : 'No hay equivalencias registradas.'}
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((eq) => (
                        <tr key={eq.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                          {editingId === eq.id ? (
                            <>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={editValues.internal_sku || ''}
                                  onChange={(e) => setEditValues({ ...editValues, internal_sku: e.target.value })}
                                  className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={editValues.supplier_code || ''}
                                  onChange={(e) => setEditValues({ ...editValues, supplier_code: e.target.value })}
                                  className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={editValues.supplier_name || ''}
                                  onChange={(e) => setEditValues({ ...editValues, supplier_name: e.target.value })}
                                  className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={editValues.rut_provider || ''}
                                  onChange={(e) => setEditValues({ ...editValues, rut_provider: e.target.value })}
                                  className="w-full border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-400">
                                {new Date(eq.created_at).toLocaleDateString('es-CL')}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-center space-x-1">
                                  <button
                                    onClick={() => handleSave(eq.id)}
                                    disabled={savingId === eq.id}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                                    title="Guardar"
                                  >
                                    {savingId === eq.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md transition-colors"
                                    title="Cancelar"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 font-mono text-xs text-gray-900">{eq.internal_sku}</td>
                              <td className="px-3 py-2 font-medium text-gray-700">{eq.supplier_code}</td>
                              <td className="px-3 py-2">{eq.supplier_name || '—'}</td>
                              <td className="px-3 py-2 text-xs">{eq.rut_provider || <span className="text-gray-300">sin RUT</span>}</td>
                              <td className="px-3 py-2 text-xs text-gray-400">
                                {new Date(eq.created_at).toLocaleDateString('es-CL')}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-center space-x-1">
                                  <button
                                    onClick={() => handleEdit(eq)}
                                    className="p-1.5 text-primary hover:bg-blue-50 rounded-md transition-colors"
                                    title="Editar"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(eq.id)}
                                    disabled={deletingId === eq.id}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                    title="Eliminar"
                                  >
                                    {deletingId === eq.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-sm text-gray-500">
                    Página {page + 1} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
