'use client';

import { useState } from 'react';
import { Eye, X, FileText } from 'lucide-react';

interface DocumentViewerProps {
  data: {
    rutEmisor?: string;
    folio?: string;
    razonSocial?: string;
    items?: Array<{
      nombre: string;
      codigo: string;
      cantidad: number;
      precioUnitario?: number;
      precioNeto?: number;
      subtotalNeto?: number;
    }>;
  } | null;
}

export default function DocumentViewer({ data }: DocumentViewerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!data) return null;

  return (
    <>
      {/* Botón de Vista Previa */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-primary text-sm font-medium rounded-md text-primary bg-white hover:bg-gray-50 transition-colors shadow-sm"
      >
        <Eye className="h-4 w-4 mr-2" />
        Vista Previa Documento
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-primary p-4 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Simulación de Factura</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 bg-[#F9F9F9]">
              {/* Encabezado Factura */}
              <div className="bg-white p-6 rounded-lg shadow-sm mb-6 border border-gray-100">
                <div className="flex justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-500 uppercase">Emisor</h4>
                    <p className="text-lg font-bold text-primary">{data.razonSocial || 'No especificado'}</p>
                    <p className="text-sm text-gray-600">RUT: {data.rutEmisor || 'No especificado'}</p>
                  </div>
                  <div className="text-right">
                    <div className="border-2 border-action p-2 rounded-md inline-block">
                      <p className="text-sm font-bold text-action">R.U.T.: {data.rutEmisor || 'N/A'}</p>
                      <p className="text-lg font-bold text-action">FACTURA ELECTRÓNICA</p>
                      <p className="text-lg font-bold text-action">Nº {data.folio || '000000'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalle Items */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                    <tr>
                      <th scope="col" className="px-6 py-3">Código</th>
                      <th scope="col" className="px-6 py-3">Descripción</th>
                      <th scope="col" className="px-6 py-3 text-right">Cantidad</th>
                      <th scope="col" className="px-6 py-3 text-right">Precio Neto</th>
                      <th scope="col" className="px-6 py-3 text-right">Total Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items && data.items.length > 0 ? (
                      data.items.map((item, index) => {
                        const precioUnit = item.precioUnitario || item.precioNeto || 0;
                        const totalNeto = item.subtotalNeto || (item.cantidad * precioUnit);
                        return (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900">{item.codigo || 'S/C'}</td>
                            <td className="px-6 py-4">{item.nombre}</td>
                            <td className="px-6 py-4 text-right">{item.cantidad}</td>
                            <td className="px-6 py-4 text-right">
                              ${precioUnit.toLocaleString('es-CL')}
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-gray-900">
                              ${totalNeto.toLocaleString('es-CL')}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                          No hay items para mostrar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {data.items && data.items.length > 0 && (
                    <tfoot className="bg-gray-50 font-semibold text-gray-900">
                      <tr>
                        <td colSpan={4} className="px-6 py-3 text-right">Total Neto:</td>
                        <td className="px-6 py-3 text-right">
                          $
                          {data.items
                            .reduce((acc, item) => {
                              const precioUnit = item.precioUnitario || item.precioNeto || 0;
                              const totalNeto = item.subtotalNeto || (item.cantidad * precioUnit);
                              return acc + totalNeto;
                            }, 0)
                            .toLocaleString('es-CL')}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
