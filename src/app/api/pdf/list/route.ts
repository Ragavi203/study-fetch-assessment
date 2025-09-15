import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pdfs = await prisma.pDF.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        chats: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    return NextResponse.json({ pdfs });
  } catch (error: any) {
    console.error('List PDFs error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list PDFs' },
      { status: 500 }
    );
  }
}
