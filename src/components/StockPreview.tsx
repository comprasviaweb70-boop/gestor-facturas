'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calculatePCU } from '@/lib/costing';
import { Eye, AlertTriangle, CheckCircle, XCircle, Copy, FileDown, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ExcelJS from 'exceljs';

interface StockPreviewProps {
  extractedData: any;
  fantasyName: string;
  margin: number;
}

interface PreviewItem {
  supplierCode: string;
  productName: string;
  internalSku: string | null;
  quantity: number;
  cost: number; // PCU con flete e impuestos
  total: number;
  status: 'ok' | 'missing_sku' | 'zero_qty' | 'inactive_in_bsale';
}

export default function StockPreview({ extractedData, fantasyName, margin }: StockPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [jsonPayload, setJsonPayload] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [officeId, setOfficeId] = useState<number | null>(null);
  const [revalidating, setRevalidating] = useState(false);

  // Cargar officeId al montar
  useEffect(() => {
    const loadOffice = async () => {
      try {
        const res = await fetch('/api/bsale/offices');
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            // Buscar sucursal Valdivia o usar la primera
            const valdivia = data.items.find((o: any) => 
              (o.name || '').toLowerCase().includes('valdivia')
            );
            setOfficeId(valdivia ? valdivia.id : data.items[0].id);
          } else {
            console.warn('No se encontraron sucursales en Bsale, usando ID por defecto');
            setOfficeId(1);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`Error obteniendo sucursales (${res.status}):`, errData.error || res.statusText);
          setOfficeId(1);
        }
      } catch (e) {
        console.error('Error de conexión al cargar sucursales:', e);
        setOfficeId(1); // Fallback
      }
    };
    loadOffice();
  }, []);

  const buildPreview = async () => {
    if (!extractedData?.items) return;
    setLoading(true);

    try {
      // Obtener equivalencias
      const supplierCodes = extractedData.items.map((item: any) => item.codigo?.trim()).filter(Boolean);
      let equivalences: { [key: string]: string } = {};

      if (supplierCodes.length > 0) {
        const { data: eqData } = await supabase
          .from('sku_equivalences')
          .select('supplier_code, internal_sku, rut_provider')
          .in('supplier_code', supplierCodes);

        if (eqData) {
          const normalizedExtractedRut = (extractedData.rutEmisor || '').replace(/[^0-9Kk]/g, '').toUpperCase();
          eqData.forEach((eq: any) => {
            const normalizedEqRut = (eq.rut_provider || '').replace(/[^0-9Kk]/g, '').toUpperCase();
            if (normalizedEqRut === normalizedExtractedRut) {
              equivalences[eq.supplier_code] = eq.internal_sku;
            } else if (!eq.rut_provider && !equivalences[eq.supplier_code]) {
              equivalences[eq.supplier_code] = eq.internal_sku;
            }
          });
          // Fallback final: si aun no hay match, asignar por supplier_code sin importar RUT
          eqData.forEach((eq: any) => {
            if (!equivalences[eq.supplier_code] && eq.internal_sku) {
              equivalences[eq.supplier_code] = eq.internal_sku;
            }
          });
        }
      }

      // Construir items de preview
      const items: PreviewItem[] = extractedData.items.map((item: any) => {
        const code = (item.codigo || '').trim();
        const sku = item.internal_sku || equivalences[code] || null;
        const subtotalNeto = Number(item.subtotalNeto) || 0;
        const imptoAdic = Number(item.impuestosAdicionales) || 0;
        const flete = Number(item.fleteTotal) || 0;
        const qty = Number(item.cantidad);
        
        // El PCU debe excluir el flete según la nueva regla de costeo
        const pcu = calculatePCU(subtotalNeto, imptoAdic, qty);

        let status: 'ok' | 'missing_sku' | 'zero_qty' | 'inactive_in_bsale' = 'ok';
        if (!sku) status = 'missing_sku';
        else if (qty <= 0) status = 'zero_qty';

        return {
          supplierCode: code,
          productName: item.nombre || item.descripcion || 'Sin nombre',
          internalSku: sku,
          quantity: qty,
          cost: Math.round(pcu),
          total: Math.round(qty * pcu),
          status,
        };
      });

      // Validar estado activo en Bsale para cada SKU mapeado
      const skuChecks = items
        .filter(item => item.internalSku && item.status === 'ok')
        .map(async (item) => {
          try {
            const res = await fetch(`/api/bsale/search?code=${encodeURIComponent(item.internalSku!)}`);
            const data = await res.json();
            const variant = data.items?.[0];
            return { internalSku: item.internalSku, state: variant?.state, name: variant?.name || item.productName };
          } catch {
            return { internalSku: item.internalSku, state: null, name: item.productName };
          }
        });
      const skuStates = await Promise.all(skuChecks);
      const stateMap: { [sku: string]: { state: number | null; name: string } } = {};
      skuStates.forEach(s => {
        if (s.internalSku) stateMap[s.internalSku] = { state: s.state, name: s.name };
      });

      const validatedItems = items.map(item => {
        if (item.status !== 'ok') return item;
        const info = item.internalSku ? stateMap[item.internalSku] : undefined;
        if (info && info.state !== undefined && info.state !== 0 && info.state !== null) {
          return { ...item, status: 'inactive_in_bsale' as const, productName: info.name || item.productName };
        }
        return item;
      });

      setPreviewItems(validatedItems);

      // Construir payload JSON para Bsale (solo items realmente válidos)
      const validItems = validatedItems.filter(i => i.status === 'ok');
      const payload = {
        document: "Factura",
        officeId: officeId || 1,
        documentNumber: String(extractedData.folio || ''),
        note: `Recepción automática - ${fantasyName || extractedData.razonSocial || 'Proveedor'}`,
        details: validItems.map(item => ({
          quantity: item.quantity,
          code: item.internalSku,
          cost: Math.round(item.cost), // Asegurar entero para CLP
        })),
      };

      setJsonPayload(payload);
    } catch (error) {
      console.error('Error building preview:', error);
      alert('Error al construir la vista previa: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && extractedData?.items) {
      buildPreview();
    }
  }, [isOpen, extractedData]);

  const totalOk = previewItems.filter(i => i.status === 'ok').length;
  const totalMissing = previewItems.filter(i => i.status === 'missing_sku').length;
  const totalZero = previewItems.filter(i => i.status === 'zero_qty').length;
  const totalInactive = previewItems.filter(i => i.status === 'inactive_in_bsale').length;
  const grandTotal = previewItems.reduce((sum, i) => sum + i.total, 0);
  const allValid = totalMissing === 0 && totalZero === 0 && totalInactive === 0;

  const handleRevalidate = async () => {
    if (revalidating) return;
    setRevalidating(true);
    await buildPreview();
    setRevalidating(false);
  };

  const handleCopyJson = () => {
    if (!jsonPayload) return;
    navigator.clipboard.writeText(JSON.stringify(jsonPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToBsale = async () => {
    if (!jsonPayload || jsonPayload.details.length === 0) {
      alert('No hay productos válidos para enviar.');
      return;
    }

    const displayName = fantasyName || extractedData?.razonSocial || 'Proveedor';
    const totalUnits = jsonPayload.details.reduce((s: number, d: any) => s + d.quantity, 0);

    // Primera confirmación
    const confirm1 = confirm(
      `¿Enviar recepción de stock a Bsale?\n\n` +
      `📋 Proveedor: ${displayName}\n` +
      `📄 Folio: ${jsonPayload.documentNumber}\n` +
      `📦 Productos: ${jsonPayload.details.length}\n` +
      `🔢 Unidades totales: ${totalUnits}\n` +
      `💰 Costo total: $${grandTotal.toLocaleString('es-CL')}\n\n` +
      `Esta acción ingresará stock REAL en Bsale.`
    );
    if (!confirm1) return;

    // Segunda confirmación
    const confirm2 = confirm(
      '⚠️ CONFIRMACIÓN FINAL\n\n' +
      `¿Estás seguro de ingresar ${totalUnits} unidades de ${jsonPayload.details.length} productos al stock de Bsale?\n\n` +
      'Haz clic en "Aceptar" para confirmar el envío.'
    );
    if (!confirm2) return;

    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch('/api/bsale/stock-reception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folio: jsonPayload.documentNumber,
          razonSocial: displayName,
          officeId: jsonPayload.officeId,
          items: jsonPayload.details,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSendResult({
          success: true,
          message: `✅ ${data.message}`,
          details: data,
        });
      } else {
        setSendResult({
          success: false,
          message: `❌ ${data.error || 'Error desconocido'}`,
          details: data,
        });
      }
    } catch (error: any) {
      setSendResult({
        success: false,
        message: `❌ Error de conexión: ${error.message}`,
      });
    } finally {
      setSending(false);
    }
  };

  const handleExportPreviewExcel = async () => {
    if (previewItems.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Preview Bsale');

    const displayName = fantasyName || extractedData?.razonSocial || 'Proveedor';

    // Header
    ws.getCell('A1').value = 'VISTA PREVIA - Recepción de Stock Bsale';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF00427E' } };
    ws.mergeCells('A1:G1');

    ws.getCell('A2').value = `Proveedor: ${displayName}`;
    ws.getCell('A2').font = { bold: true };
    ws.getCell('A3').value = `Folio: ${extractedData?.folio || 'S/F'}`;
    ws.getCell('A3').font = { bold: true };
    ws.getCell('D2').value = `RUT: ${extractedData?.rutEmisor || ''}`;
    ws.getCell('D3').value = `Fecha: ${new Date().toLocaleDateString('es-CL')}`;

    // Table headers
    const headerRow = ws.getRow(5);
    headerRow.values = ['Estado', 'Cód. Proveedor', 'Producto', 'SKU Bsale', 'Cantidad', 'Costo Unit.', 'Total Línea'];
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00427E' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    let row = 6;
    for (const item of previewItems) {
      const r = ws.getRow(row);
      r.values = [
        item.status === 'ok' ? '✅ OK' : item.status === 'missing_sku' ? '❌ SIN SKU' : item.status === 'inactive_in_bsale' ? '⚠️ INACTIVO BSALE' : '⚠️ CANT. 0',
        item.supplierCode,
        item.productName,
        item.internalSku || 'SIN MATCH',
        item.quantity,
        item.cost,
        item.total,
      ];
      
      if (item.status !== 'ok') {
        r.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.status === 'missing_sku' ? 'FFFDE8E8' : 'FFFFFBE8' } };
        });
      }

      r.getCell(6).numFmt = '0'; // PCU como número puro
      r.getCell(7).numFmt = '"$"#,##0';
      row++;
    }

    // Total row
    const totalRow = ws.getRow(row);
    totalRow.getCell(5).value = 'TOTAL:';
    totalRow.getCell(5).font = { bold: true };
    totalRow.getCell(7).value = grandTotal;
    totalRow.getCell(7).numFmt = '"$"#,##0';
    totalRow.getCell(7).font = { bold: true };

    // Summary row
    const summaryRow = ws.getRow(row + 2);
    summaryRow.getCell(1).value = `Resumen: ${totalOk} OK | ${totalMissing} sin SKU | ${totalZero} cant. 0 | ${totalInactive} inactivo(s) Bsale`;
    summaryRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };

    // Auto width
    ws.columns.forEach((col: any) => {
      let maxLen = 0;
      col.eachCell({ includeEmpty: true }, (cell: any) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.max(12, maxLen + 2);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (fantasyName || 'Preview').replace(/[\\/:*?"<>|]/g, '');
    a.download = `PREVIEW_${safeName}_${extractedData?.folio || 'SF'}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!extractedData?.items) return null;

  return (
    <div className="w-full max-w-6xl mx-auto mt-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center px-6 py-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Eye className="h-5 w-5 text-primary" />
          <div className="text-left">
            <h2 className="text-lg font-semibold text-primary">Vista Previa - Ingreso a Bsale</h2>
            <p className="text-xs text-gray-500">Revisa el detalle antes de ingresar al stock</p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
      </button>

      {isOpen && (
        <div className="bg-white mt-2 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-gray-600">Construyendo vista previa...</span>
            </div>
          ) : (
            <>
              {/* Status Bar */}
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-3 items-center bg-gray-50">
                <span className="text-sm font-medium text-gray-700">
                  Folio: <span className="text-primary font-bold">{extractedData?.folio || 'S/F'}</span>
                </span>
                <span className="text-sm text-gray-400">|</span>
                <span className="text-sm text-gray-700">
                  {fantasyName || extractedData?.razonSocial || 'Proveedor'}
                </span>
                <span className="text-sm text-gray-400">|</span>
                <div className="flex gap-2 ml-auto">
                  <span className="inline-flex items-center text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
                    <CheckCircle className="h-3 w-3 mr-1" /> {totalOk} listos
                  </span>
                  {totalMissing > 0 && (
                    <span className="inline-flex items-center text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-medium">
                      <XCircle className="h-3 w-3 mr-1" /> {totalMissing} sin SKU
                    </span>
                  )}
                  {totalZero > 0 && (
                    <span className="inline-flex items-center text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {totalZero} cant. 0
                    </span>
                  )}
                  {totalInactive > 0 && (
                    <span className="inline-flex items-center text-xs bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full font-medium">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {totalInactive} inactivo(s) en Bsale
                    </span>
                  )}
                </div>
              </div>

              {/* Warning Banner */}
              {totalMissing > 0 && (
                <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">
                    <strong>{totalMissing} producto(s)</strong> no tienen SKU de Bsale mapeado.
                    Estos ítems <strong>no se incluirán</strong> en el ingreso de stock.
                    Vuelve a la tabla de validación para parear los productos faltantes.
                  </p>
                </div>
              )}
              {totalInactive > 0 && (
                <div className="mx-4 mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-orange-800">
                    <p className="font-bold">
                      ⚠ No se puede enviar: {totalInactive} producto(s) inactivo(s) en Bsale
                    </p>
                    <ul className="mt-1 list-disc list-inside">
                      {previewItems
                        .filter(i => i.status === 'inactive_in_bsale')
                        .map((item, idx) => (
                          <li key={idx}>
                            {item.productName} — <span className="font-mono text-xs">{item.internalSku}</span>
                          </li>
                        ))}
                    </ul>
                    <p className="mt-1">
                      Reactívalo(s) en Bsale y usa <strong>Revalidar</strong> para reintentar el envío completo.
                    </p>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="overflow-x-auto p-4">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-gray-100 text-gray-600">
                    <tr>
                      <th className="px-3 py-2.5 w-8"></th>
                      <th className="px-3 py-2.5">Cód. Prov.</th>
                      <th className="px-3 py-2.5">Producto</th>
                      <th className="px-3 py-2.5">SKU Bsale</th>
                      <th className="px-3 py-2.5 text-right">Cantidad</th>
                      <th className="px-3 py-2.5 text-right">Costo Unit.</th>
                      <th className="px-3 py-2.5 text-right font-bold text-orange-600">Total Línea</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`border-b transition-colors ${
                          item.status === 'missing_sku'
                            ? 'bg-red-50/50 hover:bg-red-50'
                            : item.status === 'zero_qty'
                            ? 'bg-amber-50/50 hover:bg-amber-50'
                            : item.status === 'inactive_in_bsale'
                            ? 'bg-orange-50/50 hover:bg-orange-50'
                            : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          {item.status === 'ok' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {item.status === 'missing_sku' && <XCircle className="h-4 w-4 text-red-500" />}
                          {item.status === 'zero_qty' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          {item.status === 'inactive_in_bsale' && <AlertTriangle className="h-4 w-4 text-orange-600" />}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{item.supplierCode}</td>
                        <td className="px-3 py-2.5 text-gray-800 font-medium">{item.productName}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {item.internalSku ? (
                            <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded">{item.internalSku}</span>
                          ) : (
                            <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded">SIN MATCH</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right">${item.cost.toLocaleString('es-CL')}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-orange-600">${item.total.toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold">
                      <td colSpan={4} className="px-3 py-3 text-right text-gray-600">
                        Total ({totalOk} productos válidos
                        {totalInactive > 0 && <span className="text-orange-600"> — {totalInactive} excluido(s) por inactivo</span>}
                        ):
                      </td>
                      <td className="px-3 py-3 text-right">
                        {previewItems.filter(i => i.status === 'ok').reduce((s, i) => s + i.quantity, 0)} uds
                      </td>
                      <td className="px-3 py-3"></td>
                      <td className="px-3 py-3 text-right text-primary">
                        ${grandTotal.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="px-4 py-4 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={handleExportPreviewExcel}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Exportar Preview Excel
                  </button>
                  <button
                    onClick={handleCopyJson}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copied ? '¡Copiado!' : 'Copiar JSON'}
                  </button>
                  <button
                    onClick={handleRevalidate}
                    disabled={revalidating || totalInactive === 0}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={totalInactive === 0 ? 'No hay productos inactivos para revalidar' : 'Volver a consultar estado en Bsale tras reactivar el producto'}
                  >
                    {revalidating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 mr-2" />
                    )}
                    {revalidating ? 'Revalidando...' : 'Revalidar'}
                  </button>
                </div>

                <button
                  onClick={handleSendToBsale}
                  disabled={!allValid || sending || sendResult?.success}
                  className={`inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg transition-colors shadow-sm ${
                    sendResult?.success
                      ? 'bg-green-100 text-green-700 cursor-not-allowed'
                      : allValid && !sending
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title={
                    sendResult?.success
                      ? 'Recepción ya enviada exitosamente'
                      : !allValid
                      ? totalInactive > 0
                        ? `${totalInactive} producto(s) inactivo(s) en Bsale — reactiva y revalida`
                        : `Faltan ${totalMissing} SKU(s) por mapear`
                      : 'Enviar recepción de stock a Bsale'
                  }
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : sendResult?.success ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {sending ? 'Enviando...' : sendResult?.success ? 'Enviado a Bsale ✓' : 'Enviar a Bsale'}
                </button>
              </div>

              {/* Send Result */}
              {sendResult && (
                <div className={`mx-4 mt-3 p-4 rounded-lg border ${
                  sendResult.success
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <p className={`text-sm font-medium ${
                    sendResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {sendResult.message}
                  </p>
                  {sendResult.details && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer hover:underline">
                        Ver detalle de respuesta
                      </summary>
                      <pre className="mt-1 text-xs bg-white p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(sendResult.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* JSON Preview (collapsible) */}
              {jsonPayload && (
                <details className="mx-4 mb-4">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 py-2">
                    Ver payload JSON que se enviaría a Bsale
                  </summary>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto max-h-64">
                    {JSON.stringify(jsonPayload, null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
