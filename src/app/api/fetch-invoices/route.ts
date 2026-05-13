import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({ 
      error: 'Para conectar con Bsale, debes configurar el token real en Vercel.' 
    }, { status: 401 });
  }
  
  // Paso 1: Conexión API a Bsale (Listado de Documentos de Proveedores)
  const url = 'https://api.bsale.cl/v1/third_party_documents.json';
  
  try {
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
    
    if (!data.items) {
      return NextResponse.json([]);
    }

    // Mapear los datos para el frontend (AutoReceptionModule)
    const invoices = data.items.map((doc: any) => ({
      // Usaremos urlXml como ID para el siguiente paso
      id: doc.urlXml || doc.id?.toString(),
      urlXml: doc.urlXml,
      fecha: new Date(doc.generationDate * 1000).toLocaleDateString('es-CL') || 'S/F',
      folio: doc.number || 'S/F',
      rutProveedor: doc.code || 'S/R', // 'code' is usually the RUT in Bsale for clients/suppliers
      razonSocial: doc.name || 'S/N', // 'name' might be the name or might need a separate endpoint, but let's assume it's here
      montoTotal: doc.totalAmount || 0,
      procesada: false
    })).filter((doc: any) => doc.urlXml); // Solo mostrar los que tienen XML
    
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error(`Error consultando documentos de proveedores:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

