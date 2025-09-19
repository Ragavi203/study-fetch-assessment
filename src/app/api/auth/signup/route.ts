import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';

// Set Node.js runtime to make bcrypt work in Vercel
export const runtime = 'nodejs';

function corsHeaders() {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  } as Record<string, string>;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required.' },
        { status: 400, headers: corsHeaders() }
      );
    }
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists.' },
        { status: 409, headers: corsHeaders() }
      );
    }
  const hashedPassword = bcrypt.hashSync(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
    });
    return NextResponse.json(
      { message: 'Signup successful', user: { id: user.id, email: user.email } },
      { headers: corsHeaders() }
    );
  } catch (error: any) {
    console.error('Signup error:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Email already registered.' },
        { status: 409, headers: corsHeaders() }
      );
    }
    // Handle common Prisma connection/schema errors
    const code = error?.code as string | undefined;
    const map: Record<string, { status: number; error: string }> = {
      P1000: { status: 500, error: 'Database authentication failed' },
      P1001: { status: 500, error: 'Cannot reach database server' },
      P1003: { status: 500, error: 'Database does not exist' },
      P1017: { status: 500, error: 'Database connection was closed' },
      P2021: { status: 500, error: 'Database table not found' },
      P2022: { status: 500, error: 'Database column not found' },
    };
    const mapped: { status: number; error: string } | undefined = code ? map[code] : undefined;
    const payload: Record<string, any> = {
      error: mapped?.error || 'Server error',
    };
    if (process.env.NODE_ENV !== 'production' && code) {
      payload.prismaCode = code;
      payload.details = error?.message || String(error);
    }
    return NextResponse.json(payload, {
      status: mapped ? mapped.status : 500,
      headers: corsHeaders(),
    });
  }
}
