'use client';

import { useState } from 'react';
import { Loader2, Search, Zap } from 'lucide-react';

interface AutoReceptionModuleProps {
  onDataExtracted: (data: any) => void;
}

export default function AutoReceptionModule({ onDataExtracted }: AutoReceptionModuleProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fetch-invoices');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInvoices(data);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      alert('Error al buscar facturas: ' + error.message);
    } finally {
      setLoading(false);
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

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
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

      {invoices.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-white uppercase bg-primary">
              <tr>
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Folio</th>
                <th scope="col" className="px-4 py-3">RUT Proveedor</th>
                <th scope="col" className="px-4 py-3">Razón Social</th>
                <th scope="col" className="px-4 py-3 text-right">Monto Total</th>
                <th scope="col" className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{inv.fecha}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.folio}</td>
                  <td className="px-4 py-3">{inv.rutProveedor}</td>
                  <td className="px-4 py-3">{inv.razonSocial}</td>
                  <td className="px-4 py-3 text-right">${inv.montoTotal.toLocaleString('es-CL')}</td>
                  <td className="px-4 py-3 text-center">
                    {inv.procesada ? (
                      <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                        Procesada
                      </span>
                    ) : (
                      <button
                        onClick={() => handleProcess(inv.id)}
                        disabled={processingId !== null}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-action hover:bg-orange-600 transition-colors disabled:bg-gray-400"
                      >
                        {processingId === inv.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3 mr-1" />
                        )}
                        Procesar con Claude
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        loading ? null : <p className="text-center text-gray-500 py-4">Haz clic en "Buscar Facturas Nuevas" para listar los documentos.</p>
      )}
    </div>
  );
}
