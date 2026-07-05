'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search, Zap, EyeOff, RotateCcw, FileText, Eye } from 'lucide-react';
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
  const [preferences, setPreferences] = useState<Record<string, 'xml' | 'vision'>>({});
  const [pendingPrefRut, setPendingPrefRut] = useState<string | null>(null);

  // Cargar IDs ignorados y preferencias desde Supabase al montar
  useEffect(() => {
    loadIgnoredIds();
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('rut, extraction_preference')
        .not('extraction_preference', 'is', null);
      if (!error && data) {
        const prefMap: Record<string, 'xml' | 'vision'> = {};
        data.forEach((p: any) => {
          if (p.extraction_preference === 'xml' || p.extraction_preference === 'vision') {
            prefMap[p.rut] = p.extraction_preference;
          }
        });
        setPreferences(prefMap);
      }
    } catch (e) {
      console.log('No se pudieron cargar preferencias:', e);
    }
  };

  const savePreference = async (rut: string, preference: 'xml' | 'vision') => {
    try {
      const { error } = await supabase
        .from('proveedores')
        .upsert({ rut, extraction_preference: preference }, { onConflict: 'rut' });
      if (error) {
        // Intentar update si el RUT ya existe sin preferencia
        await supabase
          .from('proveedores')
          .update({ extraction_preference: preference })
          .eq('rut', rut);
      }
      setPreferences(prev => ({ ...prev, [rut]: preference }));
    } catch (e) {
      console.error('Error guardando preferencia:', e);
    }
  };

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
      alert('Error al ignorar la factura: ' + (e.message || 'Error desconocido'));
    } finally {
      setIgnoringId(null);
    }
  };

  const handleProcess = async (inv: any, forceMode?: 'xml' | 'vision') => {
    const rut = inv.rutProveedor || '';
    const mode = forceMode || preferences[rut] || 'xml';
    setProcessingId(inv.id);
    try {
      if (mode === 'vision') {
        // Modo Visión: descargar PDF desde Bsale y enviar como base64
        if (!inv.urlPdf) {
          throw new Error('Esta factura no tiene PDF disponible en Bsale para procesar con visión.');
        }

        const resPdf = await fetch(`/api/fetch-xml?id=${encodeURIComponent(inv.urlPdf)}`);
        if (!resPdf.ok) {
          throw new Error('Error al descargar el PDF desde Bsale.');
        }

        const pdfBlob = await resPdf.blob();
        const reader = new FileReader();
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });

        const resProcess = await fetch('/api/process-xml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64,
            fileType: 'application/pdf',
            knownRut: inv.rutProveedor,
            knownName: inv.razonSocial
          })
        });

        const result = await resProcess.json();
        if (result.error) throw new Error(result.error);

        onDataExtracted(result);
        alert('¡Factura procesada con éxito (Visión)!');
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, procesada: true } : i));
      } else {
        // Modo XML: flujo existente
        let xmlContent = '';

        if (inv.urlXml) {
          const resXml = await fetch(`/api/fetch-xml?id=${encodeURIComponent(inv.urlXml)}`);
          if (!resXml.ok) {
            const errData = await resXml.json().catch(() => ({}));
            throw new Error(errData.error || `Error al obtener XML (${resXml.status})`);
          }
          xmlContent = await resXml.text();
        } else {
          const docRes = await fetch(`/api/fetch-xml?id=${inv.id}`);
          if (!docRes.ok) {
            throw new Error('Esta factura no tiene XML disponible en Bsale');
          }
          xmlContent = await docRes.text();
        }

        const resProcess = await fetch('/api/process-xml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            xmlContent,
            knownRut: inv.rutProveedor,
            knownName: inv.razonSocial
          })
        });

        const result = await resProcess.json();
        if (result.error) throw new Error(result.error);

        onDataExtracted(result);
        alert('¡Factura procesada con éxito!');
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, procesada: true } : i));
      }
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
                      ) : preferences[inv.rutProveedor] ? (
                        <>
                          <button
                            onClick={() => handleProcess(inv)}
                            disabled={processingId !== null || ignoringId !== null}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-action hover:bg-orange-600 transition-colors disabled:bg-gray-400"
                            title={`Procesar con ${preferences[inv.rutProveedor] === 'vision' ? 'Visión (PDF)' : 'XML'}`}
                          >
                            {processingId === inv.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : preferences[inv.rutProveedor] === 'vision' ? (
                              <Eye className="h-3 w-3 mr-1" />
                            ) : (
                              <FileText className="h-3 w-3 mr-1" />
                            )}
                            Procesar ({preferences[inv.rutProveedor] === 'vision' ? 'Visión' : 'XML'})
                          </button>
                          <button
                            onClick={() => setPendingPrefRut(inv.rutProveedor)}
                            disabled={processingId !== null || ignoringId !== null}
                            className="text-xs text-gray-400 hover:text-primary underline"
                            title="Cambiar preferencia de fuente"
                          >
                            cambiar
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
                      ) : (
                        <>
                          <span className="text-xs text-gray-400 mr-1">Seleccionar:</span>
                          <button
                            onClick={() => { savePreference(inv.rutProveedor, 'xml').then(() => handleProcess(inv, 'xml')); }}
                            disabled={processingId !== null || ignoringId !== null}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-primary hover:bg-primary/90 transition-colors disabled:bg-gray-400"
                            title="Procesar usando XML"
                          >
                            {processingId === inv.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <FileText className="h-3 w-3 mr-1" />
                            )}
                            XML
                          </button>
                          <button
                            onClick={() => { savePreference(inv.rutProveedor, 'vision').then(() => handleProcess(inv, 'vision')); }}
                            disabled={processingId !== null || ignoringId !== null}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-action hover:bg-orange-600 transition-colors disabled:bg-gray-400"
                            title="Procesar usando Visión (PDF desde Bsale)"
                          >
                            {processingId === inv.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Eye className="h-3 w-3 mr-1" />
                            )}
                            Visión
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

      {/* Modal de cambio de preferencia */}
      {pendingPrefRut && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPendingPrefRut(null)}>
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary mb-2">Cambiar preferencia de fuente</h3>
            <p className="text-sm text-gray-500 mb-4">
              Proveedor RUT: <span className="font-mono font-medium">{pendingPrefRut}</span>
            </p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => {
                  savePreference(pendingPrefRut, 'xml');
                  setPendingPrefRut(null);
                }}
                className={`flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border ${
                  preferences[pendingPrefRut] === 'xml'
                    ? 'text-white bg-primary border-primary'
                    : 'text-primary border-primary/30 hover:bg-primary/5'
                }`}
              >
                <FileText className="h-4 w-4 mr-2" />
                XML
              </button>
              <button
                onClick={() => {
                  savePreference(pendingPrefRut, 'vision');
                  setPendingPrefRut(null);
                }}
                className={`flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border ${
                  preferences[pendingPrefRut] === 'vision'
                    ? 'text-white bg-action border-action'
                    : 'text-action border-action/30 hover:bg-action/5'
                }`}
              >
                <Eye className="h-4 w-4 mr-2" />
                Visión
              </button>
            </div>
            <button
              onClick={() => setPendingPrefRut(null)}
              className="w-full text-sm text-gray-400 hover:text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
