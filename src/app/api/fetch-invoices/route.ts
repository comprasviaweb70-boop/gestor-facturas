import { NextResponse } from 'next/server';
import { getBsaleToken, isBsaleTokenValid, unauthorizedResponse, bsaleFetch, errorResponse } from '@/lib/bsale';

export const maxDuration = 60;

export async function GET() {
  const token = getBsaleToken();

  if (!isBsaleTokenValid(token)) {
    return unauthorizedResponse('Para conectar con Bsale, debes configurar el token real en Vercel.');
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Ventana de consulta: mes actual + 2 meses anteriores (alineado con el plazo
  // de 45 días en que Bsale da de baja documentos sin estado SII).
  const monthsToQuery: { year: number; month: number }[] = [];
  for (let i = 0; i < 3; i++) {
    let month = currentMonth - i;
    let year = currentYear;
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    monthsToQuery.push({ year, month });
  }

  try {
    const allItems: { siiStatus?: unknown[]; id: number; emissionDate: number; number?: string; clientCode?: string; clientActivity?: string; totalAmount?: number; netAmount?: number; ivaAmount?: number; urlXml?: string; urlPdf?: string }[] = [];
    let totalCount = 0;
    const warnings: string[] = [];

    for (const { year, month } of monthsToQuery) {
      const basePath = `/third_party_documents.json?limit=50&year=${year}&month=${month}&codesii=33`;
      let offset = 0;
      let monthFailed = false;

      while (true) {
        const path = `${basePath}&offset=${offset}`;
        const res = await bsaleFetch(path);

        if (!res.ok) {
          const msg = `Error Bsale mes ${month}/${year}: ${res.status}`;
          console.warn(msg);
          warnings.push(msg);
          monthFailed = true;
          break;
        }

        const data = await res.json();
        totalCount += data.count || 0;
        if (data.items) allItems.push(...data.items);
        if (!data.next || (data.items && data.items.length < 50)) break;
        offset += 50;
      }

      if (monthFailed) continue;
    }

    const pendingItems = allItems.filter((doc) =>
      !doc.siiStatus || (doc.siiStatus as unknown[]).length === 0
    );

    const invoices = pendingItems
      .map((doc) => ({
        id: doc.id.toString(),
        fecha: new Date(doc.emissionDate * 1000).toLocaleDateString('es-CL'),
        emissionTimestamp: doc.emissionDate,
        folio: doc.number || 'S/F',
        rutProveedor: doc.clientCode || 'S/R',
        razonSocial: doc.clientActivity || 'S/N',
        montoTotal: doc.totalAmount || 0,
        montoNeto: doc.netAmount || 0,
        iva: doc.ivaAmount || 0,
        urlXml: doc.urlXml || null,
        urlPdf: doc.urlPdf || null,
        procesada: false
      }))
      .sort((a, b) => b.emissionTimestamp - a.emissionTimestamp);

    return NextResponse.json({
      total: totalCount,
      pendientes: invoices.length,
      procesadas: totalCount - pendingItems.length,
      invoices,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error: unknown) {
    console.error(`Error consultando documentos de proveedores:`, error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return errorResponse(message);
  }
}
