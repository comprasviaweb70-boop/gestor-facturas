import { NextResponse } from 'next/server';

const BSALE_BASE_URL = 'https://api.bsale.cl/v1';

export function getBsaleToken(): string | undefined {
  return process.env.BSALE_ACCESS_TOKEN;
}

export function isBsaleTokenValid(token: string | undefined): token is string {
  return !!token && token !== 'ejemplo_temporal';
}

export function unauthorizedResponse(message?: string): NextResponse {
  return NextResponse.json(
    { error: message || 'Token de Bsale no configurado. Configura BSALE_ACCESS_TOKEN en Vercel.' },
    { status: 401 }
  );
}

export function errorResponse(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

interface BsaleFetchOptions {
  method?: string;
  body?: unknown;
}

export async function bsaleFetch(path: string, options?: BsaleFetchOptions): Promise<Response> {
  const token = getBsaleToken();
  if (!isBsaleTokenValid(token)) {
    throw new Error('Token de Bsale no configurado');
  }

  const url = path.startsWith('http') ? path : `${BSALE_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'access_token': token,
    'Accept': 'application/json',
  };

  const fetchOptions: RequestInit = { headers };

  if (options?.method) {
    fetchOptions.method = options.method;
  }

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  return fetch(url, fetchOptions);
}
