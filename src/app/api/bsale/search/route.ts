import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('name');

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  const token = process.env.BSALE_ACCESS_TOKEN;

  // Si el token es el de ejemplo o no está configurado, usamos datos simulados para pruebas
  if (!token || token === 'ejemplo_temporal') {
    console.log(`Modo simulación Bsale (Token temporal). Buscando: ${query}`);
    const mockVariants = [
      { id: 1, name: `${query} - Producto Premium`, code: `SKU-${query.toUpperCase()}-01` },
      { id: 2, name: `${query} - Producto Estándar`, code: `SKU-${query.toUpperCase()}-02` },
      { id: 3, name: `${query} - Producto Económico`, code: `SKU-${query.toUpperCase()}-03` },
    ];
    return NextResponse.json({ items: mockVariants });
  }

  try {
    // URL de la API de Bsale para buscar variantes por nombre
    const url = `https://api.bsale.cl/v1/variants.json?name=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: {
        'access_token': token,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error en la API de Bsale: ${response.status}`);
    }

    const data = await response.json();
    
    // Bsale devuelve un objeto con la propiedad 'items' que es un arreglo de variantes
    const items = data.items?.map((item: any) => ({
      id: item.id,
      name: item.description || item.name, // Bsale suele usar description para el nombre de la variante
      code: item.code || 'S/SKU'
    })) || [];

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching from Bsale API:', error);
    return NextResponse.json({ error: 'Error al consultar la API de Bsale' }, { status: 500 });
  }
}
