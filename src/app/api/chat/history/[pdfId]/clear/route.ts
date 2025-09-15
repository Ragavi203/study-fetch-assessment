import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function DELETE(request: Request, { params }: { params: { pdfId: string } }) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pdfId = params.pdfId;

    // Delete all chat history for this PDF and user
    const result = await prisma.chat.deleteMany({
      where: {
        pdfId,
        userId
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Deleted ${result.count} chat messages`,
      count: result.count 
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return NextResponse.json(
      { error: 'Failed to clear chat history' },
      { status: 500 }
    );
  }
}