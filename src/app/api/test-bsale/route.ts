import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;

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

  // Petición GET pura, sin filtros ni procesamiento
  const url = 'https://api.bsale.cl/v1/third_party_documents.json?limit=3';

  try {
    const res = await fetch(url, {
      headers: {
        'access_token': token,
        'Accept': 'application/json',
      },
    });

    const rawBody = await res.text(); // texto crudo para inspeccionar

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
