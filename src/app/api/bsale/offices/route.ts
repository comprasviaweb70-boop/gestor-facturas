import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.BSALE_ACCESS_TOKEN;

  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({ error: 'Token no configurado' }, { status: 401 });
  }

  try {
    const res = await fetch('https://api.bsale.cl/v1/offices.json?limit=50', {
      headers: { 'access_token': token, 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Error Bsale offices: ${res.status}`, body);
      return NextResponse.json(
        { error: `Error de Bsale al obtener sucursales (${res.status})` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error en offices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
