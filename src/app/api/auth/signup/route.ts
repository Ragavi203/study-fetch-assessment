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
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
