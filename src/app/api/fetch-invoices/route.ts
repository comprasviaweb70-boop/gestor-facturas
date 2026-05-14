import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({ 
      error: 'Para conectar con Bsale, debes configurar el token real en Vercel.' 
    }, { status: 401 });
  }
  
  // Paso 1: Listado de Documentos de Proveedores (mayo 2026, activos, máx 25)
  const url = 'https://api.bsale.cl/v1/third_party_documents.json?limit=25&state=0&emissiondaterange=[1714521600,1717200000]';
  
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
    
    if (!data.items || data.items.length === 0) {
      return NextResponse.json([]);
    }

    // Mapear con los nombres REALES de campos de la API de Bsale
    const invoices = data.items
      .filter((doc: any) => doc.codeSii === '33') // Solo facturas (tipo 33)
      .map((doc: any) => ({
        id: doc.id.toString(),
        fecha: new Date(doc.emissionDate * 1000).toLocaleDateString('es-CL'),
        folio: doc.number || 'S/F',
        rutProveedor: doc.clientCode || 'S/R',
        razonSocial: doc.clientActivity || 'S/N',
        montoTotal: doc.totalAmount || 0,
        montoNeto: doc.netAmount || 0,
        iva: doc.ivaAmount || 0,
        procesada: false
      }));
    
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error(`Error consultando documentos de proveedores:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
