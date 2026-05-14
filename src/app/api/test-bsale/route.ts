import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const token = process.env.BSALE_ACCESS_TOKEN;
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId');

  // Diagnóstico: mostrar qué token se está usando (solo primeros/últimos chars)
  const tokenPreview = token
    ? `${token.substring(0, 4)}...${token.substring(token.length - 4)} (${token.length} chars)`
    : 'NO CONFIGURADO';

  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({
      diagnóstico: 'TOKEN NO VÁLIDO',
      tokenPreview,
      mensaje: 'El token es "ejemplo_temporal" o no existe. Configura el token real de producción en Vercel.',
    });
  }

  // Si se pasa docId, probar múltiples endpoints para encontrar detalle/XML
  if (docId) {
    // Obtener datos del documento para usar el folio y RUT en búsquedas cruzadas
    let docNumber = docId;
    let docClientCode = '';
    
    try {
      const docRes = await fetch(`https://api.bsale.cl/v1/third_party_documents/${docId}.json`, {
        headers: { 'access_token': token, 'Accept': 'application/json' },
      });
      if (docRes.ok) {
        const docData = await docRes.json();
        docNumber = docData.number || docId;
        docClientCode = docData.clientCode || '';
      }
    } catch {}

    const urls = [
      // Detalle del third_party_document
      `https://api.bsale.cl/v1/third_party_documents/${docId}.json`,
      // Sub-recursos posibles
      `https://api.bsale.cl/v1/third_party_documents/${docId}/details.json`,
      `https://api.bsale.cl/v1/third_party_documents/${docId}/items.json`,
      `https://api.bsale.cl/v1/third_party_documents/${docId}/xml.json`,
      // Buscar en documents por folio
      `https://api.bsale.cl/v1/documents.json?number=${docNumber}&limit=1`,
      // Buscar en purchase_orders
      `https://api.bsale.cl/v1/purchase_orders.json?limit=1`,
      // Buscar en received_tax_documents (DTEs recibidos)
      `https://api.bsale.cl/v1/received_tax_documents.json?limit=1`,
      // Buscar por dte_received 
      `https://api.bsale.cl/v1/dte/received.json?limit=1`,
    ];

    const results = [];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'access_token': token, 'Accept': 'application/json' },
        });
        const body = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        results.push({ 
          url, 
          status: res.status, 
          ok: res.ok, 
          // Solo mostrar primeros campos para no saturar
          response: parsed || body.substring(0, 500)
        });
      } catch (error: any) {
        results.push({ url, error: error.message });
      }
    }

    return NextResponse.json({ 
      diagnóstico: `Exploración de endpoints para doc ${docId} (folio: ${docNumber}, RUT: ${docClientCode})`, 
      results 
    });
  }

  // Obtener TODOS los documentos de mayo 2026 tipo 33 con paginación
  const baseUrl = 'https://api.bsale.cl/v1/third_party_documents.json?limit=50&year=2026&month=5&codesii=33';
  
  try {
    const allItems: any[] = [];
    let offset = 0;
    let totalCount = 0;

    // Paginar para traer todos
    while (true) {
      const url = `${baseUrl}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { 'access_token': token, 'Accept': 'application/json' },
      });
      const data = await res.json();
      totalCount = data.count || 0;
      if (data.items) allItems.push(...data.items);
      if (!data.next || allItems.length >= totalCount) break;
      offset += 50;
    }

    // Analizar distribución de siiStatus
    const statusDistribution: { [key: string]: number } = {};
    const statusExamples: { [key: string]: any[] } = {};

    allItems.forEach((doc: any) => {
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
  } catch (error: any) {
    return NextResponse.json({
      diagnóstico: 'ERROR DE RED',
      tokenPreview,
      error: error.message,
    }, { status: 500 });
  }
}

