import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { serializeChatMessages } from '@/lib/chatUtils';

// Save or append chat history for a PDF. Strategy: create a new row per save for append-only log.
// Client can re-hydrate by concatenating all rows (existing GET already does this).
export async function POST(request: Request) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pdfId, messages } = body || {};
    if (!pdfId || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'pdfId and messages array required' }, { status: 400 });
    }

    const serialized = serializeChatMessages(messages);

    const chat = await prisma.chat.create({
      data: {
        pdfId,
        userId,
        messages: serialized as any
      }
    });

    return NextResponse.json({ success: true, id: chat.id, createdAt: chat.createdAt });
  } catch (error: any) {
    console.error('Error saving chat history:', error);
    return NextResponse.json({ error: 'Failed to save chat history' }, { status: 500 });
  }
}