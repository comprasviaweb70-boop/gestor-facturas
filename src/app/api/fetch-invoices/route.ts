import { NextResponse } from 'next/server';
import { getBsaleToken, isBsaleTokenValid, unauthorizedResponse, bsaleFetch, errorResponse } from '@/lib/bsale';

export async function GET() {
  const token = getBsaleToken();
  
  if (!isBsaleTokenValid(token)) {
    return unauthorizedResponse('Para conectar con Bsale, debes configurar el token real en Vercel.');
  }

  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  try {
    const allItems: { siiStatus?: unknown[]; id: number; emissionDate: number; number?: string; clientCode?: string; clientActivity?: string; totalAmount?: number; netAmount?: number; ivaAmount?: number; urlXml?: string; urlPdf?: string }[] = [];
    let totalCount = 0;

    for (let month = 1; month <= currentMonth; month++) {
      const basePath = `/third_party_documents.json?limit=50&year=${year}&month=${month}&codesii=33`;
      let offset = 0;

      while (true) {
        const path = `${basePath}&offset=${offset}`;
        const res = await bsaleFetch(path);

        if (!res.ok) {
          console.warn(`Error Bsale mes ${month}: ${res.status}`);
          break;
        }

        const data = await res.json();
        totalCount += data.count || 0;
        if (data.items) allItems.push(...data.items);
        if (!data.next || (data.items && data.items.length < 50)) break;
        offset += 50;
      }
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
      invoices
    });
  } catch (error: unknown) {
    console.error(`Error consultando documentos de proveedores:`, error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return errorResponse(message);
  }
}
