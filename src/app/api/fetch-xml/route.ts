import { getBsaleToken, isBsaleTokenValid, unauthorizedResponse, bsaleFetch, errorResponse } from '@/lib/bsale';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const token = getBsaleToken();
  
  if (!id) {
    return errorResponse('Se requiere la URL o ID del XML', 400);
  }
  
  try {
    if (!isBsaleTokenValid(token)) {
      return unauthorizedResponse('Para conectar con Bsale, debes configurar el token real en Vercel.');
    }

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
  } catch (error: unknown) {
    console.error('Error en fetch-xml:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return errorResponse(message);
  }
}
