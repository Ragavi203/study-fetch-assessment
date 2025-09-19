import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Simple connectivity check
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Health check DB error:', error);
    return NextResponse.json(
      { ok: false, error: 'DB not reachable', details: process.env.NODE_ENV !== 'production' ? error?.message : undefined },
      { status: 500 }
    );
  }
}
