import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { chatMessageService } from '@/lib/chatMessageService';
import { verifyAuth } from '@/lib/auth';

/**
 * GET handler to retrieve chat history for a PDF
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }
    
    // Extract PDF ID from params
    const pdfId = params.id;
    if (!pdfId) {
      return NextResponse.json(
        { error: 'PDF ID is required' },
        { status: 400 }
      );
    }

    // Get query parameters for pagination
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const sessionId = url.searchParams.get('sessionId');
    
    // Retrieve chat messages
    const messages = await chatMessageService.getByPdf({
      pdfId,
      userId,
      limit,
      offset,
      sessionId
    });
    
    // Return messages
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error retrieving chat history:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve chat history' },
      { status: 500 }
    );
  }
}

/**
 * POST handler to save a new chat message
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }
    
    // Extract PDF ID from params
    const pdfId = params.id;
    if (!pdfId) {
      return NextResponse.json(
        { error: 'PDF ID is required' },
        { status: 400 }
      );
    }
    
    // Parse request body
    const body = await req.json();
    const { content, role, sessionId } = body;
    
    if (!content || !role) {
      return NextResponse.json(
        { error: 'Content and role are required' },
        { status: 400 }
      );
    }
    
    // Create new chat message
    const message = await chatMessageService.create({
      content,
      role: role as 'user' | 'assistant' | 'system',
      pdfId,
      userId,
      sessionId
    });
    
    // Return created message
    return NextResponse.json({ message });
  } catch (error) {
    console.error('Error saving chat message:', error);
    return NextResponse.json(
      { error: 'Failed to save chat message' },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler to clear chat history
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }
    
    // Extract PDF ID from params
    const pdfId = params.id;
    if (!pdfId) {
      return NextResponse.json(
        { error: 'PDF ID is required' },
        { status: 400 }
      );
    }
    
    // Get query parameters
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    
    // Delete chat messages
    const result = await chatMessageService.deleteByPdf({
      pdfId,
      userId,
      sessionId
    });
    
    // Return deleted count
    return NextResponse.json({ 
      deletedCount: result.count,
      message: 'Chat history cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return NextResponse.json(
      { error: 'Failed to clear chat history' },
      { status: 500 }
    );
  }
}