import { NextResponse } from 'next/server';
import { getBsaleToken, missingTokenResponse, bsaleFetch } from '@/lib/bsale';

export async function GET() {
  if (!getBsaleToken()) {
    return missingTokenResponse();
  }

  try {
    const res = await bsaleFetch('/offices.json?limit=50');
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
