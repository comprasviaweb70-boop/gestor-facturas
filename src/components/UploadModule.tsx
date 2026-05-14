'use client';

import { useState } from 'react';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';

interface UploadModuleProps {
  onDataExtracted: (data: any) => void;
}

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

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.xml')) {
      alert('Por favor, carga un archivo XML válido.');
      return;
    }

    setFileName(file.name);
    setIsLoading(true);

    try {
      const text = await file.text();
      
      // Llamar a la API para procesar el XML con Gemini
      const response = await fetch('/api/process-xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ xmlContent: text }),
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

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-semibold text-primary mb-4">Carga de Factura XML</h2>
      
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
          accept=".xml"
          onChange={handleFileChange}
        />
        
        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-action" />
            <p className="text-sm font-medium text-gray-600">Claude procesando XML...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            {fileName ? (
              <>
                <FileText className="h-12 w-12 text-primary" />
                <p className="text-sm font-medium text-gray-700">{fileName}</p>
                <p className="text-xs text-gray-500">Haz clic o arrastra otro archivo para cambiarlo</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-12 w-12 text-primary" />
                <p className="text-base font-medium text-gray-700">Arrastra tu archivo XML aquí o haz clic para buscar</p>
                <p className="text-xs text-gray-500">Solo archivos .xml soportados</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
