import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

// Set Node.js runtime for JWT verification
export const runtime = 'nodejs';

function corsHeaders() {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  } as Record<string, string>;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    return NextResponse.json({ 
      message: 'Token is valid',
      userId 
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401, headers: corsHeaders() }
    );
  }
}
