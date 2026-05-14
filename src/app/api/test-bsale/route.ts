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

  // Si se pasa docId, buscar detalle de ese documento específico para encontrar urlXml
  if (docId) {
    const urls = [
      `https://api.bsale.cl/v1/third_party_documents/${docId}.json`,
      `https://api.bsale.cl/v1/third_party_documents/${docId}/xml.json`,
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
        results.push({ url, status: res.status, ok: res.ok, response: parsed || body });
      } catch (error: any) {
        results.push({ url, error: error.message });
      }
    }

    return NextResponse.json({ diagnóstico: `Detalle del documento ${docId}`, results });
  }

  // Petición GET pura al listado, sin filtros ni procesamiento
  const url = 'https://api.bsale.cl/v1/third_party_documents.json?limit=3';

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

