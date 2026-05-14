'use client';

import { useState } from 'react';
import UploadModule from '@/components/UploadModule';
import ValidationTable from '@/components/ValidationTable';
import DocumentViewer from '@/components/DocumentViewer';
import AutoReceptionModule from '@/components/AutoReceptionModule';
import EquivalenceManager from '@/components/EquivalenceManager';
import StockPreview from '@/components/StockPreview';
import { supabase } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import { FileDown, Loader2 } from 'lucide-react';

export default function Home() {
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [margin, setMargin] = useState(50); // Margen por defecto del 50%
  const [refreshKey, setRefreshKey] = useState(0);
  const [fantasyName, setFantasyName] = useState('');
  const [isSavingFantasyName, setIsSavingFantasyName] = useState(false);

  const handleDataExtracted = async (data: any) => {
    setExtractedData(data);
    setRefreshKey(prev => prev + 1);
    
    if (data && data.rutEmisor) {
      try {
        const { data: provData, error } = await supabase
          .from('proveedores')
          .select('nombre')
          .eq('rut', data.rutEmisor);
          
        if (!error && provData && provData.length > 0) {
          setFantasyName(provData[0].nombre || '');
        } else {
          setFantasyName('');
        }
      } catch (e) {
        console.error('Error fetching provider:', e);
      }
    }
  };

  const handleSaveFantasyName = async () => {
    if (!extractedData?.rutEmisor || !fantasyName.trim()) return;
    
    setIsSavingFantasyName(true);
    try {
      const { data: existing } = await supabase
        .from('proveedores')
        .select('rut')
        .eq('rut', extractedData.rutEmisor);
        
      let error;
      if (existing && existing.length > 0) {
        const { error: err } = await supabase
          .from('proveedores')
          .update({ nombre: fantasyName.trim() })
          .eq('rut', extractedData.rutEmisor);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('proveedores')
          .insert({ 
            rut: extractedData.rutEmisor, 
            nombre: fantasyName.trim() 
          });
        error = err;
      }
      
      if (error) throw error;
      alert('Nombre de fantasía guardado correctamente.');
    } catch (error: any) {
      console.error('Error saving fantasy name:', error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setIsSavingFantasyName(false);
    }
  };

  const handleExportExcel = async () => {
    if (!extractedData) return;
    setIsExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Factura');

      const rut = extractedData.rutEmisor || '';
      const displayName = fantasyName || extractedData.razonSocial || 'No especificado';

      // Fila 1: A1: 'Proveedor:', B1: [Nombre de Fantasía]
      worksheet.getCell('A1').value = 'Proveedor:';
      worksheet.getCell('B1').value = displayName;
      worksheet.getCell('A1').font = { bold: true };

      // Fila 2: A2: 'RUT:', B2: [RUT]
      worksheet.getCell('A2').value = 'RUT:';
      worksheet.getCell('B2').value = rut || 'No especificado';
      worksheet.getCell('A2').font = { bold: true };

      // Fila 4: Headers con nueva estructura de columnas
      const headers = ['N° Factura', 'SKU', 'Stock', 'Subtotal Neto', 'Impto. Adic.', 'Flete', 'PCU', 'Total', 'PVU'];
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
      let grandTotal = 0;
      let totalTaxes = 0;
      let totalFlete = 0;

      if (extractedData.items) {
        for (const item of extractedData.items) {
          const row = worksheet.getRow(currentRow);
          
          const sku = item.internal_sku || equivalences[item.codigo] || 'SIN MATCH';
          const subtotalNeto = Number(item.subtotalNeto) || 0;
          const imptoAdic = Number(item.impuestosAdicionales) || 0;
          const flete = Number(item.fleteTotal) || 0;
          const cantidad = Number(item.cantidad) || 1;
          
          // PCU = (Subtotal Neto + Impto. Adic. + Flete) / Cantidad
          const pcu = (subtotalNeto + imptoAdic + flete) / cantidad;
          const totalItem = subtotalNeto + imptoAdic + flete;
          const pvu = pcu * (1 + margin / 100) * 1.19;
          
          grandTotal += totalItem;
          totalTaxes += imptoAdic;
          totalFlete += flete;

          row.values = [
            extractedData.folio || 'S/F',
            sku,
            item.cantidad || 0,
            subtotalNeto,
            imptoAdic,
            flete,
            pcu,
            totalItem,
            pvu
          ];

          // Formato numérico para precios
          row.getCell(4).numFmt = '"$"#,##0';   // Subtotal Neto
          row.getCell(5).numFmt = '"$"#,##0';   // Imp. Adic.
          row.getCell(6).numFmt = '"$"#,##0';   // Flete
          row.getCell(7).numFmt = '0';          // PCU (Número puro)
          row.getCell(8).numFmt = '"$"#,##0';   // Total
          row.getCell(9).numFmt = '"$"#,##0';   // PVU

          currentRow++;
        }
      }

      // Fila de totales
      const totalRow = worksheet.getRow(currentRow);
      totalRow.getCell(3).value = 'TOTALES:';
      totalRow.getCell(3).font = { bold: true };
      totalRow.getCell(3).alignment = { horizontal: 'right' };
      
      // Suma de Subtotales Netos
      totalRow.getCell(4).value = extractedData.items?.reduce((acc: number, i: any) => acc + (Number(i.subtotalNeto) || 0), 0) || 0;
      totalRow.getCell(4).numFmt = '"$"#,##0';
      totalRow.getCell(4).font = { bold: true };
      
      // Suma de Impuestos Adicionales
      totalRow.getCell(5).value = totalTaxes;
      totalRow.getCell(5).numFmt = '"$"#,##0';
      totalRow.getCell(5).font = { bold: true };
      
      // Suma de Fletes
      totalRow.getCell(6).value = totalFlete;
      totalRow.getCell(6).numFmt = '"$"#,##0';
      totalRow.getCell(6).font = { bold: true };
      
      // Total general (Subtotal + Impto + Flete)
      totalRow.getCell(8).value = grandTotal;
      totalRow.getCell(8).numFmt = '"$"#,##0';
      totalRow.getCell(8).font = { bold: true };
      totalRow.getCell(8).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FE' }
      };

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

      // Descargar archivo con nombre de fantasía
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const sanitizedName = displayName.replace(/[\\/:*?"<>|]/g, '').trim();
      const folio = extractedData.folio || 'Sin_Folio';
      a.download = `${sanitizedName}_${folio}.xlsx`;
      
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
        {/* Supplier Info Card */}
        {extractedData && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-semibold text-primary">Información del Proveedor</h3>
                <p className="text-sm text-gray-500">{extractedData.razonSocial || 'No especificado'} | RUT: {extractedData.rutEmisor || 'No especificado'}</p>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Nombre de Fantasía:</label>
                <input
                  type="text"
                  value={fantasyName}
                  onChange={(e) => setFantasyName(e.target.value)}
                  className="border rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary w-full sm:w-64"
                  placeholder="Ej: MAD CHARLIES"
                />
                <button
                  onClick={handleSaveFantasyName}
                  disabled={isSavingFantasyName}
                  className="inline-flex items-center px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:bg-gray-400"
                >
                  {isSavingFantasyName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Module */}
        <UploadModule onDataExtracted={handleDataExtracted} />

        {/* Auto Reception Module */}
        <AutoReceptionModule onDataExtracted={handleDataExtracted} />

        {/* Validation Table */}
        <ValidationTable 
          items={extractedData?.items} 
          onItemsChange={(updatedItems) => setExtractedData({...extractedData, items: updatedItems})}
          rutEmisor={extractedData?.rutEmisor}
        />

        {/* Stock Preview - Marcha Blanca */}
        <StockPreview 
          extractedData={extractedData}
          fantasyName={fantasyName}
          margin={margin}
        />

        {/* Equivalence Manager */}
        <EquivalenceManager />
      </div>
    </main>
  );
}
