'use client';

import { useState } from 'react';
import { UploadCloud, FileText, Loader2, FileImage, FileSpreadsheet } from 'lucide-react';

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
const MAX_FILE_SIZE_MB = 4; // Límite para PDF/imágenes (base64 overhead + Vercel limit)

export default function UploadModule({ onDataExtracted }: UploadModuleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

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
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remover prefijo "data:...;base64,"
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      alert('Formatos soportados: XML, PDF, JPG, PNG');
      return;
    }

    // Límite de tamaño para PDF/imágenes
    if (extension !== 'xml' && file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`El archivo es demasiado grande. Máximo ${MAX_FILE_SIZE_MB}MB para PDF e imágenes.`);
      return;
    }

    setFileName(file.name);
    setIsLoading(true);

    try {
      let requestBody: any;

      if (extension === 'xml') {
        // Flujo XML existente
        const text = await file.text();
        requestBody = { xmlContent: text };
      } else {
        // Flujo PDF/Imagen — convertir a base64
        const base64 = await fileToBase64(file);
        requestBody = {
          fileBase64: base64,
          fileType: MIME_TYPES[extension],
        };
      }

      const response = await fetch('/api/process-xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Error del servidor (${response.status})`);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      onDataExtracted(data);
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Error al procesar el archivo: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileIcon = () => {
    if (!fileName) return null;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return <FileSpreadsheet className="h-12 w-12 text-red-500" />;
    if (['jpg', 'jpeg', 'png'].includes(ext)) return <FileImage className="h-12 w-12 text-green-600" />;
    return <FileText className="h-12 w-12 text-primary" />;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-semibold text-primary mb-4">Carga Manual de Factura</h2>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${
          isDragging ? 'border-action bg-orange-50' : 'border-primary bg-bg-light'
        }`}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept=".xml,.pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
        />
        
        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-action" />
            <p className="text-sm font-medium text-gray-600">Claude procesando documento...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            {fileName ? (
              <>
                {getFileIcon()}
                <p className="text-sm font-medium text-gray-700">{fileName}</p>
                <p className="text-xs text-gray-500">Haz clic o arrastra otro archivo para cambiarlo</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-12 w-12 text-primary" />
                <p className="text-base font-medium text-gray-700">Arrastra tu factura aquí o haz clic para buscar</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">XML</span>
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">PDF</span>
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium">JPG / PNG</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
