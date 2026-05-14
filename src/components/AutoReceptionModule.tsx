'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search, Zap, EyeOff, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AutoReceptionModuleProps {
  onDataExtracted: (data: any) => void;
}

export default function AutoReceptionModule({ onDataExtracted }: AutoReceptionModuleProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ total: 0, pendientes: 0, procesadas: 0 });

  // Cargar IDs ignorados desde Supabase al montar
  useEffect(() => {
    loadIgnoredIds();
  }, []);

  const loadIgnoredIds = async () => {
    try {
      const { data, error } = await supabase
        .from('ignored_invoices')
        .select('bsale_doc_id');
      if (!error && data) {
        setIgnoredIds(new Set(data.map((d: any) => d.bsale_doc_id)));
      }
    } catch (e) {
      // Si la tabla no existe aún, no pasa nada
      console.log('Tabla ignored_invoices no encontrada, se creará al ignorar la primera factura');
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fetch-invoices');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setStats({
        total: data.total || 0,
        pendientes: data.pendientes || 0,
        procesadas: data.procesadas || 0,
      });
      
      // Filtrar las ignoradas localmente
      const filteredInvoices = (data.invoices || []).filter(
        (inv: any) => !ignoredIds.has(inv.id)
      );
      setInvoices(filteredInvoices);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      alert('Error al buscar facturas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIgnore = async (inv: any) => {
    if (!confirm(`¿Descartar la factura ${inv.folio} de ${inv.razonSocial}?\n\nNo aparecerá de nuevo en la lista.`)) return;
    
    setIgnoringId(inv.id);
    try {
      // Guardar en Supabase
      const { error } = await supabase
        .from('ignored_invoices')
        .insert({
          bsale_doc_id: inv.id,
          folio: String(inv.folio),
          rut_proveedor: inv.rutProveedor,
          razon_social: inv.razonSocial,
          monto_total: inv.montoTotal,
          motivo: 'No representa aumento de stock'
        });

      if (error) {
        console.error('Error guardando en Supabase:', error);
        // Si la tabla no existe, crear la entrada solo en memoria
      }

      // Actualizar estado local
      setIgnoredIds(prev => new Set([...prev, inv.id]));
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
    } catch (e: any) {
      console.error('Error al ignorar:', e);
    } finally {
      setIgnoringId(null);
    }
  };

  const handleProcess = async (id: string) => {
    setProcessingId(id);
    try {
      // 1. Obtener XML
      const resXml = await fetch(`/api/fetch-xml?id=${id}`);
      if (!resXml.ok) throw new Error('Error al obtener XML de Bsale');
      const xmlContent = await resXml.text();
      
      // 2. Procesar con Claude
      const resProcess = await fetch('/api/process-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xmlContent })
      });
      
      const result = await resProcess.json();
      if (result.error) throw new Error(result.error);
      
      // 3. Notificar al padre (llenar la tabla de validación)
      onDataExtracted(result);
      
      alert('¡Factura procesada con éxito!');
      
      // Marcar como procesada localmente para visualización
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, procesada: true } : inv));
      
    } catch (error: any) {
      console.error('Error processing invoice:', error);
      alert('Error al procesar factura: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const visibleInvoices = invoices.filter(inv => !ignoredIds.has(inv.id));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-primary">Módulo de Recepción Automática</h2>
          <p className="text-sm text-gray-500">Consulta y procesa facturas electrónicas directamente desde Bsale</p>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 transition-colors shadow-sm disabled:bg-gray-400"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Buscar Facturas Nuevas
        </button>
      </div>

      {/* Estadísticas */}
      {stats.total > 0 && (
        <div className="flex gap-4 mb-4 text-xs">
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
            {stats.total} en Bsale
          </span>
          <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">
            {visibleInvoices.length} pendientes
          </span>
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
            {stats.procesadas} procesadas
          </span>
          {ignoredIds.size > 0 && (
            <span className="bg-gray-50 text-gray-500 px-3 py-1 rounded-full font-medium">
              {ignoredIds.size} ignoradas
            </span>
          )}
        </div>
      )}

      {visibleInvoices.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-white uppercase bg-primary">
              <tr>
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Folio</th>
                <th scope="col" className="px-4 py-3">RUT Proveedor</th>
                <th scope="col" className="px-4 py-3">Razón Social</th>
                <th scope="col" className="px-4 py-3 text-right">Monto Total</th>
                <th scope="col" className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((inv) => (
                <tr key={inv.id} className={`border-b hover:bg-gray-50 ${inv.procesada ? 'bg-green-50/50' : 'bg-white'}`}>
                  <td className="px-4 py-3">{inv.fecha}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.folio}</td>
                  <td className="px-4 py-3">{inv.rutProveedor}</td>
                  <td className="px-4 py-3">{inv.razonSocial}</td>
                  <td className="px-4 py-3 text-right">${inv.montoTotal.toLocaleString('es-CL')}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {inv.procesada ? (
                        <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                          Procesada
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleProcess(inv.id)}
                            disabled={processingId !== null || ignoringId !== null}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-action hover:bg-orange-600 transition-colors disabled:bg-gray-400"
                            title="Procesar factura con Claude"
                          >
                            {processingId === inv.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3 mr-1" />
                            )}
                            Procesar
                          </button>
                          <button
                            onClick={() => handleIgnore(inv)}
                            disabled={processingId !== null || ignoringId !== null}
                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-600 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                            title="Ignorar - No representa aumento de stock"
                          >
                            {ignoringId === inv.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <EyeOff className="h-3 w-3 mr-1" />
                            )}
                            Ignorar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        loading ? null : (
          <p className="text-center text-gray-500 py-4">
            {invoices.length === 0 
              ? 'Haz clic en "Buscar Facturas Nuevas" para listar los documentos.'
              : 'Todas las facturas han sido procesadas o ignoradas.'}
          </p>
        )
      )}
    </div>
  );
}
