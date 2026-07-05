import { NextResponse } from 'next/server';
import { getBsaleToken, missingTokenResponse, bsaleFetch } from '@/lib/bsale';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id'); // puede ser un ID numérico o la urlXml directa

  if (!id) {
    return NextResponse.json({ error: 'Se requiere la URL o ID del XML' }, { status: 400 });
  }

  try {
    if (!getBsaleToken()) {
      return missingTokenResponse();
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
      const res = await bsaleFetch(`/purchase_invoices/${id}/xml.json`);

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
