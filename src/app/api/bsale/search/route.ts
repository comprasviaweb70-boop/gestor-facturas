import { NextResponse } from 'next/server';
import { getBsaleToken, isBsaleTokenValid, bsaleFetch } from '@/lib/bsale';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const code = searchParams.get('code');
  const barcode = searchParams.get('barcode');
  const query = code || barcode || name;

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  const token = getBsaleToken();

  if (!isBsaleTokenValid(token)) {
    console.log(`Modo simulación Bsale (Token temporal). Buscando: ${query}`);
    const mockVariants = [
      { id: 1, name: `${query} - Producto Premium`, code: `SKU-${query.toUpperCase()}-01`, state: 0 },
      { id: 2, name: `${query} - Producto Estándar`, code: `SKU-${query.toUpperCase()}-02`, state: 0 },
      { id: 3, name: `${query} - Producto Económico`, code: `SKU-${query.toUpperCase()}-03`, state: 0 },
    ];
    return NextResponse.json({ items: mockVariants });
  }

  try {
    let path = '/variants.json';
    
    if (code) {
      path += `?code=${encodeURIComponent(code)}`;
    } else if (barcode) {
      path += `?barcode=${encodeURIComponent(barcode)}`;
    } else if (name) {
      path += `?name=${encodeURIComponent(name)}`;
    }
    
    const response = await bsaleFetch(path);

    if (!response.ok) {
      throw new Error(`Error en la API de Bsale: ${response.status}`);
    }

    const data = await response.json();
    
    const items = data.items?.map((item: { id: number; description?: string; code?: string; name?: string; product?: { name?: string; brand?: { name?: string } } }) => {
      const productName = item.product?.name || '';
      const variantDesc = item.description || '';
      const brandName = item.product?.brand?.name || '';
      
      const parts: string[] = [];
      if (brandName) parts.push(brandName);
      if (productName) parts.push(productName);
      
      if (variantDesc && variantDesc !== productName && !variantDesc.includes(productName)) {
        parts.push(variantDesc);
      }
      
      const fullName = parts.length > 0 ? parts.join(' - ') : variantDesc || item.name || 'Sin Nombre';
        
      return {
        id: item.id,
        name: fullName,
        code: item.code || 'S/SKU',
        state: item.state ?? null
      };
    }) || [];

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching from Bsale API:', error);
    return NextResponse.json({ error: 'Error al consultar la API de Bsale' }, { status: 500 });
  }
}
