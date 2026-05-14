import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({ 
      error: 'Para conectar con Bsale, debes configurar el token real en Vercel.' 
    }, { status: 401 });
  }

  // Calcular año y mes actual dinámicamente
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() es 0-indexed
  
  const baseUrl = `https://api.bsale.cl/v1/third_party_documents.json?limit=50&year=${year}&month=${month}&codesii=33`;
  
  try {
    const allItems: any[] = [];
    let offset = 0;
    let totalCount = 0;

    // Paginar para traer todos los documentos del mes
    while (true) {
      const url = `${baseUrl}&offset=${offset}`;
      const res = await fetch(url, {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error Bsale: ${res.status}`);
      }
      
      const data = await res.json();
      totalCount = data.count || 0;
      if (data.items) allItems.push(...data.items);
      if (!data.next || allItems.length >= totalCount) break;
      offset += 50;
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
      invoices
    });
  } catch (error: any) {
    console.error(`Error consultando documentos de proveedores:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
