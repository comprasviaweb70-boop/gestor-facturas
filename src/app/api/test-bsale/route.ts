import { NextResponse } from 'next/server';
import { getBsaleToken, isBsaleTokenValid, bsaleFetch } from '@/lib/bsale';

export async function GET(request: Request) {
  const token = getBsaleToken();
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId');

  const tokenPreview = token
    ? `${token.substring(0, 4)}...${token.substring(token.length - 4)} (${token.length} chars)`
    : 'NO CONFIGURADO';

  if (!isBsaleTokenValid(token)) {
    return NextResponse.json({
      diagnóstico: 'TOKEN NO VÁLIDO',
      tokenPreview,
      mensaje: 'El token es "ejemplo_temporal" o no existe. Configura el token real de producción en Vercel.',
    });
  }

  if (docId) {
    let docNumber = docId;
    let docClientCode = '';
    
    try {
      const docRes = await bsaleFetch(`/third_party_documents/${docId}.json`);
      if (docRes.ok) {
        const docData = await docRes.json();
        docNumber = docData.number || docId;
        docClientCode = docData.clientCode || '';
      }
    } catch {}

    const urls = [
      `/third_party_documents/${docId}.json`,
      `/third_party_documents/${docId}/details.json`,
      `/third_party_documents/${docId}/items.json`,
      `/third_party_documents/${docId}/xml.json`,
      `/documents.json?number=${docNumber}&limit=1`,
      `/purchase_orders.json?limit=1`,
      `/received_tax_documents.json?limit=1`,
      `/dte/received.json?limit=1`,
    ];

    const results = [];
    for (const path of urls) {
      try {
        const res = await bsaleFetch(path);
        const body = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        results.push({ 
          url: `https://api.bsale.cl/v1${path}`, 
          status: res.status, 
          ok: res.ok, 
          response: parsed || body.substring(0, 500)
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        results.push({ url: `https://api.bsale.cl/v1${path}`, error: message });
      }
    }

    return NextResponse.json({ 
      diagnóstico: `Exploración de endpoints para doc ${docId} (folio: ${docNumber}, RUT: ${docClientCode})`, 
      results 
    });
  }

  const basePath = '/third_party_documents.json?limit=50&year=2026&month=5&codesii=33';
  
  try {
    const allItems: { id: number; number?: string; clientCode?: string; clientActivity?: string; emissionDate: number; totalAmount?: number; siiStatus?: unknown[] }[] = [];
    let offset = 0;
    let totalCount = 0;

    while (true) {
      const path = `${basePath}&offset=${offset}`;
      const res = await bsaleFetch(path);
      const data = await res.json();
      totalCount = data.count || 0;
      if (data.items) allItems.push(...data.items);
      if (!data.next || allItems.length >= totalCount) break;
      offset += 50;
    }

    const statusDistribution: { [key: string]: number } = {};
    const statusExamples: { [key: string]: { id: number; number?: string; clientCode?: string; clientActivity?: string; emissionDate: string; totalAmount?: number; siiStatus?: unknown[] }[] } = {};

    allItems.forEach((doc) => {
      const statusKey = JSON.stringify(doc.siiStatus || []);
      statusDistribution[statusKey] = (statusDistribution[statusKey] || 0) + 1;
      if (!statusExamples[statusKey] || statusExamples[statusKey].length < 2) {
        if (!statusExamples[statusKey]) statusExamples[statusKey] = [];
        statusExamples[statusKey].push({
          id: doc.id,
          number: doc.number,
          clientCode: doc.clientCode,
          clientActivity: doc.clientActivity,
          emissionDate: new Date(doc.emissionDate * 1000).toLocaleDateString('es-CL'),
          totalAmount: doc.totalAmount,
          siiStatus: doc.siiStatus,
        });
      }
    });

    return NextResponse.json({
      diagnóstico: {
        totalDocumentos: totalCount,
        documentosTraidos: allItems.length,
        tokenPreview,
      },
      distribucionEstados: statusDistribution,
      ejemplosPorEstado: statusExamples,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({
      diagnóstico: 'ERROR DE RED',
      tokenPreview,
      error: message,
    }, { status: 500 });
  }
}
