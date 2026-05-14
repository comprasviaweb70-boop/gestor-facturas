import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const token = process.env.BSALE_ACCESS_TOKEN;

  if (!token || token === 'ejemplo_temporal') {
    return NextResponse.json({
      error: 'Token de Bsale no configurado. Configura BSALE_ACCESS_TOKEN en Vercel.'
    }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { folio, razonSocial, officeId, items } = body;

    // Validaciones
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No hay productos para ingresar al stock.' }, { status: 400 });
    }

    if (!officeId) {
      return NextResponse.json({ error: 'Falta el ID de la sucursal (officeId).' }, { status: 400 });
    }

    // Verificar que todos los items tengan SKU y cantidad
    const invalidItems = items.filter((item: any) => !item.code || item.quantity <= 0);
    if (invalidItems.length > 0) {
      return NextResponse.json({
        error: `${invalidItems.length} producto(s) no tienen SKU o tienen cantidad 0.`,
        invalidItems,
      }, { status: 400 });
    }

    // Construir payload para Bsale
    const payload = {
      document: "Factura",
      officeId: Number(officeId),
      documentNumber: String(folio || ''),
      note: `Recepción automática - ${razonSocial || 'Proveedor'}`,
      details: items.map((item: any) => ({
        quantity: Number(item.quantity),
        code: String(item.code),
        cost: Number(item.cost),
      })),
    };

    console.log('=== ENVIANDO RECEPCIÓN DE STOCK A BSALE ===');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Enviar a Bsale
    const res = await fetch('https://api.bsale.cl/v1/stocks/receptions.json', {
      method: 'POST',
      headers: {
        'access_token': token,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log('Bsale response status:', res.status);
    console.log('Bsale response:', JSON.stringify(responseData, null, 2));

    if (!res.ok) {
      return NextResponse.json({
        error: `Error de Bsale (${res.status})`,
        bsaleResponse: responseData,
        payloadEnviado: payload,
      }, { status: res.status });
    }

    return NextResponse.json({
      success: true,
      message: `Recepción de stock creada exitosamente (${items.length} productos)`,
      receptionId: responseData.id,
      bsaleResponse: responseData,
      payloadEnviado: payload,
    });

  } catch (error: any) {
    console.error('Error en stock-reception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
