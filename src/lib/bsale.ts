import { NextResponse } from 'next/server';

const BSALE_BASE_URL = 'https://api.bsale.cl/v1';

export function getBsaleToken(): string | null {
  const token = process.env.BSALE_ACCESS_TOKEN;
  if (!token || token === 'ejemplo_temporal') return null;
  return token;
}

export function missingTokenResponse(): NextResponse {
  return NextResponse.json({
    error: 'Para conectar con Bsale, debes configurar el token real en Vercel.'
  }, { status: 401 });
}

export async function bsaleFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = getBsaleToken();
  if (!token) {
    throw new Error('BSALE_ACCESS_TOKEN no configurado');
  }

  const url = path.startsWith('http') ? path : `${BSALE_BASE_URL}${path}`;
  const headers = new Headers(init?.headers);
  headers.set('access_token', token);
  headers.set('Accept', 'application/json');

  return fetch(url, { ...init, headers });
}
