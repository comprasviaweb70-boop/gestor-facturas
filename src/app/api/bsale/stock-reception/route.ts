import { NextResponse } from 'next/server';
import { getBsaleToken, isBsaleTokenValid, unauthorizedResponse, bsaleFetch, errorResponse } from '@/lib/bsale';

export async function POST(request: Request) {
  const token = getBsaleToken();

  if (!isBsaleTokenValid(token)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { folio, razonSocial, officeId, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse('No hay productos para ingresar al stock.', 400);
    }

    if (!officeId) {
      return errorResponse('Falta el ID de la sucursal (officeId).', 400);
    }

    const invalidItems = items.filter((item: { code?: string; quantity?: number }) => !item.code || (item.quantity ?? 0) <= 0);
    if (invalidItems.length > 0) {
      return NextResponse.json({
        error: `${invalidItems.length} producto(s) no tienen SKU o tienen cantidad 0.`,
        invalidItems,
      }, { status: 400 });
    }

    const payload = {
      document: "Factura",
      officeId: Number(officeId),
      documentNumber: String(folio || ''),
      note: `Recepción automática - ${razonSocial || 'Proveedor'}`,
      details: items.map((item: { quantity: number; code: string; cost: number }) => ({
        quantity: Number(item.quantity),
        code: String(item.code),
        cost: Number(item.cost),
      })),
    };

    console.log('=== ENVIANDO RECEPCIÓN DE STOCK A BSALE ===');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const res = await bsaleFetch('/stocks/receptions.json', {
      method: 'POST',
      body: payload,
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

  } catch (error: unknown) {
    console.error('Error en stock-reception:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return errorResponse(message);
  }
}
