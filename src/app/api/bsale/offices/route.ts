import { NextResponse } from 'next/server';
import { getBsaleToken, isBsaleTokenValid, unauthorizedResponse, bsaleFetch, errorResponse } from '@/lib/bsale';

export async function GET() {
  const token = getBsaleToken();

  if (!isBsaleTokenValid(token)) {
    return unauthorizedResponse('Token no configurado');
  }

  try {
    const res = await bsaleFetch('/offices.json?limit=50');
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return errorResponse(message);
  }
}
