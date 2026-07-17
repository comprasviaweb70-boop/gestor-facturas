'use client';

import { useState, useRef } from 'react';
import { UploadCloud, FileText, Loader2, FileImage, FileSpreadsheet, CheckCircle, XCircle, Trash2, ChevronDown, Building2 } from 'lucide-react';
import { KNOWN_IMAGE_PROVIDERS } from '@/lib/providers';

interface UploadModuleProps {
  onDataExtracted: (data: any) => void;
}

const ALLOWED_EXTENSIONS = ['xml', 'pdf', 'jpg', 'jpeg', 'png'];
const MIME_TYPES: Record<string, string> = {
  'pdf': 'application/pdf',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
};
const MAX_FILE_SIZE_MB = 4;

interface FileStatus {
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  folio?: string;
  razonSocial?: string;
  itemCount?: number;
  invoiceCount?: number;
}

export default function UploadModule({ onDataExtracted }: UploadModuleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const accumulatedDataRef = useRef<any>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFiles(Array.from(files));
    }
    // Reset input para permitir re-seleccionar los mismos archivos
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processSingleFile = async (file: File): Promise<any> => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    let requestBody: any;

    const provider = KNOWN_IMAGE_PROVIDERS.find((p) => p.id === selectedProvider);

    if (extension === 'xml') {
      const text = await file.text();
      requestBody = { xmlContent: text };
    } else {
      const base64 = await fileToBase64(file);
      requestBody = {
        fileBase64: base64,
        fileType: MIME_TYPES[extension],
        knownRut: provider?.rut,
        knownName: provider?.name,
      };
    }

    const response = await fetch('/api/process-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Error del servidor (${response.status})`);
    }

    if (data.error) {
      throw new Error(data.error);
    }

    // Si hay múltiples facturas, devolver el array completo
    if (data.multipleInvoices && data.invoices) {
      return data;
    }

    return data;
  };

  const processFiles = async (files: File[]) => {
    // Para imágenes/PDF se requiere proveedor conocido
    const hasImageOrPdf = files.some((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return ext !== 'xml';
    });
    if (hasImageOrPdf && !selectedProvider) {
      alert('Selecciona el proveedor antes de subir una imagen o PDF.');
      return;
    }

    // Filtrar archivos válidos
    const validFiles: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        rejected.push(`${file.name} (formato no soportado)`);
      } else if (ext !== 'xml' && file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        rejected.push(`${file.name} (excede ${MAX_FILE_SIZE_MB}MB)`);
      } else {
        validFiles.push(file);
      }
    }

    if (rejected.length > 0 && validFiles.length === 0) {
      alert(`Archivos rechazados:\n${rejected.join('\n')}\n\nFormatos soportados: XML, PDF, JPG, PNG (máx ${MAX_FILE_SIZE_MB}MB)`);
      return;
    }

    if (rejected.length > 0) {
      alert(`${rejected.length} archivo(s) rechazado(s):\n${rejected.join('\n')}\n\nSe procesarán los ${validFiles.length} archivo(s) válido(s).`);
    }

    // Inicializar cola
    const statuses: FileStatus[] = validFiles.map(f => ({ file: f, status: 'pending' as const }));
    setFileStatuses(statuses);
    setIsProcessing(true);
    accumulatedDataRef.current = null;

    // Procesar uno por uno
    for (let i = 0; i < validFiles.length; i++) {
      // Marcar como procesando
      setFileStatuses(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: 'processing' } : s
      ));

      try {
        const data = await processSingleFile(validFiles[i]);
        
        // Manejar múltiples facturas de un solo archivo
        const invoices = data.multipleInvoices && data.invoices ? data.invoices : [data];
        
        // Acumular datos de todas las facturas
        for (const invoice of invoices) {
          if (!accumulatedDataRef.current) {
            // Primera factura: usar como base
            accumulatedDataRef.current = { ...invoice };
          } else {
            // Facturas siguientes: agregar ítems y concatenar folios
            const existingFolios = String(accumulatedDataRef.current.folio || '');
            const newFolio = String(invoice.folio || '');
            
            accumulatedDataRef.current = {
              ...accumulatedDataRef.current,
              folio: existingFolios + ', ' + newFolio,
              items: [
                ...(accumulatedDataRef.current.items || []),
                ...(invoice.items || []),
              ],
            };
          }
        }

        // Notificar al padre con datos acumulados (la tabla se actualiza en tiempo real)
        onDataExtracted({ ...accumulatedDataRef.current });

        // Marcar como completado
        setFileStatuses(prev => prev.map((s, idx) => 
          idx === i ? { 
            ...s, 
            status: 'done', 
            folio: invoices.map(inv => inv.folio).join(', '),
            razonSocial: invoices[0]?.razonSocial,
            itemCount: invoices.reduce((acc, inv) => acc + (inv.items?.length || 0), 0),
            invoiceCount: invoices.length,
          } : s
        ));
      } catch (error: any) {
        // Marcar como error pero continuar con el siguiente
        setFileStatuses(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'error', error: error.message } : s
        ));
      }
    }

    setIsProcessing(false);
  };

  const handleClearQueue = () => {
    setFileStatuses([]);
    accumulatedDataRef.current = null;
  };

  const getFileIcon = (fileName: string, size: 'sm' | 'lg' = 'lg') => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const cls = size === 'sm' ? 'h-4 w-4' : 'h-12 w-12';
    if (ext === 'pdf') return <FileSpreadsheet className={`${cls} text-red-500`} />;
    if (['jpg', 'jpeg', 'png'].includes(ext)) return <FileImage className={`${cls} text-green-600`} />;
    return <FileText className={`${cls} text-primary`} />;
  };

  const doneCount = fileStatuses.filter(s => s.status === 'done').length;
  const errorCount = fileStatuses.filter(s => s.status === 'error').length;
  const totalItems = fileStatuses.reduce((acc, s) => acc + (s.itemCount || 0), 0);
  const totalInvoices = fileStatuses.filter(fs => fs.status === 'done').reduce((acc, fs) => acc + (fs.invoiceCount || 1), 0);

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-primary">Carga Manual de Facturas</h2>
        {fileStatuses.length > 0 && !isProcessing && (
          <button
            onClick={handleClearQueue}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Limpiar cola
          </button>
        )}
      </div>
      
      {/* Selector de proveedor (solo para imagen/PDF) */}
      <div className="mb-4">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
          <Building2 className="h-4 w-4 text-primary" />
          Proveedor (requerido para imágenes y PDF)
        </label>
        <div className="relative">
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 pr-10"
          >
            <option value="">Seleccionar proveedor...</option>
            {KNOWN_IMAGE_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Los archivos XML detectan el proveedor automáticamente.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${
          isDragging ? 'border-action bg-orange-50' : 'border-primary bg-bg-light'
        } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
        onClick={() => !isProcessing && document.getElementById('file-upload')?.click()}
      >
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept=".xml,.pdf,.jpg,.jpeg,.png"
          multiple
          onChange={handleFileChange}
        />
        
        <UploadCloud className="h-10 w-10 text-primary mb-3" />
        <p className="text-base font-medium text-gray-700">
          {isProcessing ? 'Procesando...' : 'Arrastra tus facturas aquí o haz clic para buscar'}
        </p>
        <p className="text-xs text-gray-500 mt-1">Puedes seleccionar múltiples archivos a la vez</p>
        <div className="flex gap-3 mt-2">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">XML</span>
          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">PDF</span>
          <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium">JPG / PNG</span>
        </div>
      </div>

      {/* Cola de procesamiento */}
      {fileStatuses.length > 0 && (
        <div className="mt-4 space-y-2">
          {/* Resumen */}
          <div className="flex items-center gap-3 text-xs mb-3">
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
              {fileStatuses.length} archivo{fileStatuses.length > 1 ? 's' : ''}
            </span>
            {doneCount > 0 && (
              <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
                {totalInvoices} factura{totalInvoices > 1 ? 's' : ''} • {totalItems} productos
              </span>
            )}
            {errorCount > 0 && (
              <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full font-medium">
                {errorCount} con error
              </span>
            )}
            {isProcessing && (
              <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Procesando...
              </span>
            )}
          </div>

          {/* Lista de archivos */}
          <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
            {fileStatuses.map((fs, idx) => (
              <div 
                key={idx} 
                className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                  fs.status === 'processing' ? 'bg-amber-50' : 
                  fs.status === 'done' ? 'bg-green-50/50' : 
                  fs.status === 'error' ? 'bg-red-50/50' : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {getFileIcon(fs.file.name, 'sm')}
                  <div className="min-w-0">
                    <p className="text-gray-800 font-medium truncate">{fs.file.name}</p>
                    {fs.status === 'done' && (
                      <p className="text-xs text-green-600">
                        {fs.invoiceCount && fs.invoiceCount > 1 
                          ? `${fs.invoiceCount} facturas • ${fs.itemCount} productos`
                          : `Folio ${fs.folio} • ${fs.itemCount} producto${(fs.itemCount || 0) > 1 ? 's' : ''}`
                        }
                        {fs.razonSocial ? ` • ${fs.razonSocial}` : ''}
                      </p>
                    )}
                    {fs.status === 'error' && (
                      <p className="text-xs text-red-500 truncate" title={fs.error}>
                        {fs.error}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 ml-3">
                  {fs.status === 'pending' && (
                    <span className="text-xs text-gray-400 font-medium">En cola</span>
                  )}
                  {fs.status === 'processing' && (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                  )}
                  {fs.status === 'done' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {fs.status === 'error' && (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
