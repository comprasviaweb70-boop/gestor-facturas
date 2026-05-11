'use client';

import { useState } from 'react';
import UploadModule from '@/components/UploadModule';
import ValidationTable from '@/components/ValidationTable';
import DocumentViewer from '@/components/DocumentViewer';
import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import { FileDown, Loader2 } from 'lucide-react';

export default function Home() {
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [margin, setMargin] = useState(50); // Margen por defecto del 50%
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDataExtracted = (data: any) => {
    setExtractedData(data);
    setRefreshKey(prev => prev + 1);
  };

  const handleExportExcel = async () => {
    if (!extractedData) return;
    setIsExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Factura');

      // Fila 1: A1: 'Proveedor:', B1: [Nombre]
      worksheet.getCell('A1').value = 'Proveedor:';
      worksheet.getCell('B1').value = extractedData.razonSocial || 'No especificado';
      worksheet.getCell('A1').font = { bold: true };

      // Fila 2: A2: 'RUT:', B2: [RUT]
      worksheet.getCell('A2').value = 'RUT:';
      worksheet.getCell('B2').value = extractedData.rutEmisor || 'No especificado';
      worksheet.getCell('A2').font = { bold: true };

      // Fila 4: A4: 'N° Factura', B4: 'SKU', C4: 'Stock', D4: 'PCU', E4: 'PVU'
      const headers = ['N° Factura', 'SKU', 'Stock', 'PCU', 'PVU'];
      const headerRow = worksheet.getRow(4);
      headerRow.values = headers;

      // Estilos Fila 4
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF00427E' } // Azul Rey (#00427E)
        };
        cell.font = {
          color: { argb: 'FFFFFFFF' }, // Blanco
          bold: true
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // Obtener códigos de proveedor para buscar equivalencias
      const supplierCodes = extractedData.items?.map((item: any) => item.codigo).filter(Boolean) || [];
      
      // Consultar equivalencias en Supabase
      let equivalences: { [key: string]: string } = {};
      
      if (supplierCodes.length > 0) {
        const { data: eqData, error } = await supabase
          .from('sku_equivalences')
          .select('supplier_code, internal_sku, rut_provider')
          .in('supplier_code', supplierCodes);
          
        if (!error && eqData) {
          eqData.forEach((eq: any) => {
            // Priorizar coincidencia exacta con el RUT del proveedor
            if (eq.rut_provider === extractedData.rutEmisor) {
              equivalences[eq.supplier_code] = eq.internal_sku;
            } 
            // Fallback: Si no tiene RUT (legado), lo usamos si aún no hay coincidencia con RUT
            else if (!eq.rut_provider && !equivalences[eq.supplier_code]) {
              equivalences[eq.supplier_code] = eq.internal_sku;
            }
          });
        }
      }

      // Datos
      let currentRow = 5;
      if (extractedData.items) {
        for (const item of extractedData.items) {
          const row = worksheet.getRow(currentRow);
          
          const sku = equivalences[item.codigo] || 'SIN MATCH';
          const pcu = item.precioNeto + (item.impuestosAdicionales || 0);
          const pvu = pcu * (1 + margin / 100) * 1.19;

          row.values = [
            extractedData.folio || 'S/F',
            sku,
            item.cantidad || 0,
            pcu,
            pvu
          ];

          // Formato numérico para precios
          row.getCell(4).numFmt = '"$"#,##0';
          row.getCell(5).numFmt = '"$"#,##0';

          currentRow++;
        }
      }

      // Auto-ajustar columnas
      worksheet.columns.forEach((column: any) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell: any) => {
          const columnLength = cell.value ? cell.value.toString().length : 0;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = maxLength < 12 ? 12 : maxLength + 2;
      });

      // Descargar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Factura_${extractedData.folio || 'sin_folio'}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Error al generar el archivo Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-bg-light py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-primary text-white p-6 rounded-xl shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">SIAI - Pantalla de Validación</h1>
            <p className="text-sm text-white/80 mt-1">Emporio Iciz - Gestión de Facturas y Mapeo de SKUs</p>
          </div>
          
          <div className="flex space-x-4 items-center">
            {extractedData && (
              <>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-white">Margen:</label>
                  <div className="flex items-center bg-white rounded-md overflow-hidden">
                    <input
                      type="number"
                      value={margin}
                      onChange={(e) => setMargin(Number(e.target.value))}
                      className="w-14 p-1.5 text-sm text-gray-900 focus:outline-none"
                      min="0"
                    />
                    <span className="text-sm text-gray-500 px-1.5 bg-gray-100 h-full flex items-center border-l">%</span>
                  </div>
                </div>
                <button
                  onClick={handleExportExcel}
                  disabled={isExporting}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-action hover:bg-orange-600 transition-colors shadow-sm disabled:bg-gray-400"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-2" />
                  )}
                  Exportar Excel
                </button>
                <DocumentViewer data={extractedData} />
              </>
            )}
          </div>
        </div>

        {/* Upload Module */}
        <UploadModule onDataExtracted={handleDataExtracted} />

        {/* Validation Table */}
        <ValidationTable refreshKey={refreshKey} />
      </div>
    </main>
  );
}
