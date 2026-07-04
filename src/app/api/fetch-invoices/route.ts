import { NextResponse } from 'next/server';
import { getBsaleToken, missingTokenResponse, bsaleFetch } from '@/lib/bsale';

export const maxDuration = 60;

export async function GET() {
  if (!getBsaleToken()) {
    return missingTokenResponse();
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() es 0-indexed

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
    const allItems: any[] = [];
    let totalCount = 0;
    const warnings: string[] = [];

    for (const { year, month } of monthsToQuery) {
      const baseUrl = `https://api.bsale.cl/v1/third_party_documents.json?limit=50&year=${year}&month=${month}&codesii=33`;
      let offset = 0;
      let monthFailed = false;

      while (true) {
        const res = await bsaleFetch(`${baseUrl}&offset=${offset}`);

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

      // Si un mes falló, no intentar seguir paginando ese mes; continuar con el siguiente
      if (monthFailed) continue;
    }

    // Filtrar: solo documentos SIN estado SII (no procesados)
    const pendingItems = allItems.filter((doc: any) =>
      !doc.siiStatus || doc.siiStatus.length === 0
    );

    // Mapear y ordenar por fecha descendente (más recientes primero)
    const invoices = pendingItems
      .map((doc: any) => ({
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
      .sort((a: any, b: any) => b.emissionTimestamp - a.emissionTimestamp);

    return NextResponse.json({
      total: totalCount,
      pendientes: invoices.length,
      procesadas: totalCount - pendingItems.length,
      invoices,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error: any) {
    console.error(`Error consultando documentos de proveedores:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
