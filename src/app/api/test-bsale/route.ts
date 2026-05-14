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

  // Petición GET pura al listado con filtros documentados (año, mes, tipo)
  const url = 'https://api.bsale.cl/v1/third_party_documents.json?limit=3&year=2026&month=5&codesii=33';

  try {
    const res = await fetch(url, {
      headers: {
        'access_token': token,
        'Accept': 'application/json',
      },
    });

    const rawBody = await res.text();

    let parsedJson = null;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      // Si no es JSON válido, lo dejamos como texto
    }

    return NextResponse.json({
      diagnóstico: {
        url_consultada: url,
        http_status: res.status,
        http_ok: res.ok,
        tokenPreview,
        content_type: res.headers.get('content-type'),
      },
      raw_response: parsedJson || rawBody,
    });
  } catch (error: any) {
    return NextResponse.json({
      diagnóstico: 'ERROR DE RED',
      url_consultada: url,
      tokenPreview,
      error: error.message,
    }, { status: 500 });
  }
}

