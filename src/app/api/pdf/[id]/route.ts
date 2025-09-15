import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const pdf = await prisma.pDF.findFirst({
      where: {
        id: params.id,
        userId: userId,
        deletedAt: null
      },
    });

    if (!pdf) {
      return new NextResponse(
        JSON.stringify({ error: 'PDF not found' }),
        { status: 404 }
      );
    }

    return new NextResponse(
      JSON.stringify({ 
        pdf: {
          id: pdf.id,
          url: pdf.url,
          title: pdf.title
        }
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error fetching PDF:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    );
  }
}
