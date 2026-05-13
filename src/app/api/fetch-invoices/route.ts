import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  // Como en local tienes 'ejemplo_temporal', si detectamos eso o que no hay token,
  // devolvemos un mensaje pidiendo que se pruebe en Vercel.
  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({ 
      error: 'Para ejecutar el test real de endpoints, debes desplegar este cambio en Vercel donde pusiste el Token real.' 
    });
  }
  
  const urls = [
    'https://api.bsale.cl/v1/dtes/received.json',
    'https://api.bsale.cl/v1/purchase_documents.json',
    'https://api.bsale.cl/v1/received_dtes.json?state=1'
  ];
  
  const results = [];
  
  for (const url of urls) {
    console.log(`[TEST Bsale] Consultando URL completa: ${url}`);
    try {
      const res = await fetch(url, {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      console.log(`[TEST Bsale] Respuesta de ${url}: ${res.status}`);
      
      let data = null;
      let itemsCount = 0;
      
      if (res.ok) {
        data = await res.json();
        itemsCount = data.items?.length || 0;
      }
      
      results.push({
        url,
        status: res.status,
        ok: res.ok,
        itemsCount,
        message: res.ok ? '¡Respondió con éxito!' : `Falló con estado ${res.status}`
      });
    } catch (error: any) {
      console.error(`Error consultando ${url}:`, error);
      results.push({
        url,
        ok: false,
        error: error.message
      });
    }
  }
  
  return NextResponse.json({ 
    message: 'Test de endpoints completado. Revisa cuál dio status 200.',
    results 
  });
}
