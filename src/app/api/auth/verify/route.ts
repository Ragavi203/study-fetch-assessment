import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

// Set Node.js runtime for JWT verification
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ 
      message: 'Token is valid',
      userId 
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }
}
