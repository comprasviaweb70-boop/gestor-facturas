import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id'); // puede ser un ID numérico o la urlXml directa
  const token = process.env.BSALE_ACCESS_TOKEN;
  
  if (!id) {
    return NextResponse.json({ error: 'Se requiere la URL o ID del XML' }, { status: 400 });
  }
  
  try {
    if (!token || token === 'ejemplo_temporal') {
      return NextResponse.json({ error: 'Para conectar con Bsale, debes configurar el token real en Vercel.' }, { status: 401 });
    }

    // Si el ID es directamente la URL del XML (como viene en urlXml de third_party_documents)
    if (id.startsWith('http')) {
      const res = await fetch(id);
      
      if (!res.ok) {
        throw new Error(`Error HTTP al obtener XML desde URL: ${res.status}`);
      }
      
      const xmlText = await res.text();
      
      return new Response(xmlText, {
        headers: { 'Content-Type': 'application/xml' }
      });
    } else {
      // Fallback para ID numérico tradicional (si se siguiera usando)
      const res = await fetch(`https://api.bsale.cl/v1/purchase_invoices/${id}/xml.json`, {
        headers: {
          'access_token': token,
          'Accept': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error en la API de Bsale al obtener XML: ${res.status}`);
      }
      
      const data = await res.json();
      
      const xmlContent = data.xml || data;
      
      return new Response(xmlContent, {
        headers: { 'Content-Type': 'application/xml' }
      });
    }
  } catch (error: any) {
    console.error('Error en fetch-xml:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
