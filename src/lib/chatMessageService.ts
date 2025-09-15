/**
 * Chat message service with database persistence
 * Handles creation, retrieval, and management of chat messages
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ChatMessage as ChatMessageType } from '@/types/types'; // Client-side type

// Add a type cast to work around TypeScript errors with Prisma client
// This is needed because the model name in Prisma schema (ChatMessage) doesn't match
// the property name in the generated client (chatMessage)
const typedPrisma = prisma as any;

// Define server-side ChatMessage type based on Prisma schema
type ChatMessage = {
  id: string;
  chatId?: string | null;
  pdfId?: string | null;
  userId?: string | null;
  role: string;
  content: string;
  pageContext?: number | null;
  sessionId?: string | null;
  tokenCount?: number | null;
  error: boolean;
  meta?: any | null;
  createdAt: Date;
  annotations?: any[];
};

// Type definitions for the service
type MessageRole = 'user' | 'assistant' | 'system';

interface CreateChatMessageParams {
  chatId?: string;
  pdfId?: string;
  userId: string;
  role: MessageRole;
  content: string;
  pageContext?: number;
  sessionId?: string | null;
  tokenCount?: number;
  error?: boolean;
  meta?: Record<string, any>;
}

interface GetChatMessagesParams {
  chatId?: string;
  pdfId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  role?: MessageRole;
  sessionId?: string | null;
}

interface UpdateChatMessageParams {
  id: string;
  content?: string;
  pageContext?: number;
  tokenCount?: number;
  error?: boolean;
  meta?: Record<string, any>;
}

interface DeleteMessagesParams {
  chatId?: string;
  pdfId?: string;
  userId: string;
  sessionId?: string | null;
}

// The main service export
export const chatMessageService = {
  /**
   * Create a new chat message
   */
  async create(params: CreateChatMessageParams) {
    const { chatId, pdfId, userId, role, content, pageContext, sessionId, tokenCount, error, meta } = params;
    
    // Validate required fields
    if (!chatId && !pdfId) {
      throw new Error('Either chatId or pdfId is required');
    }
    
    return await typedPrisma.chatMessage.create({
      data: {
        chatId,
        pdfId,
        userId,
        role,
        content,
        pageContext,
        sessionId,
        tokenCount,
        error: error || false,
        meta: meta || {},
      },
    }) as ChatMessage;
  },

  /**
   * Get messages for a chat
   */
  async getByChatId({ chatId, limit = 50, offset = 0, role }: GetChatMessagesParams) {
    return await typedPrisma.chatMessage.findMany({
      where: {
        chatId,
        role: role || undefined,
      },
      orderBy: {
        createdAt: 'asc',
      },
      skip: offset,
      take: limit,
      include: {
        annotations: true,
      },
    }) as ChatMessage[];
  },
  
  /**
   * Get messages for a PDF
   */
  async getByPdf({ pdfId, userId, limit = 50, offset = 0, sessionId }: GetChatMessagesParams) {
    return await typedPrisma.chatMessage.findMany({
      where: {
        pdfId,
        userId,
        sessionId: sessionId || null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      skip: offset,
      take: limit,
      include: {
        annotations: true,
      },
    }) as ChatMessage[];
  },

  /**
   * Update a chat message (for streaming tokens)
   */
  async update({ id, ...data }: UpdateChatMessageParams) {
    return await typedPrisma.chatMessage.update({
      where: { id },
      data,
    }) as ChatMessage;
  },

  /**
   * Append content to an existing message (for token streaming)
   */
  async appendContent(id: string, contentToAdd: string) {
    // First get the current content
    const message = await typedPrisma.chatMessage.findUnique({
      where: { id },
      select: { content: true },
    });

    if (!message) {
      throw new Error(`Message with ID ${id} not found`);
    }

    // Update with combined content
    return await typedPrisma.chatMessage.update({
      where: { id },
      data: {
        content: message.content + contentToAdd,
      },
    }) as ChatMessage;
  },

  /**
   * Get the full chat history with all messages and annotations
   */
  async getFullChatHistory(chatId: string) {
    return await typedPrisma.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: {
        annotations: true,
      },
    }) as ChatMessage[];
  },
  
  /**
   * Delete messages by PDF ID
   */
  async deleteByPdf({ pdfId, userId, sessionId }: DeleteMessagesParams) {
    if (!pdfId) {
      throw new Error('PDF ID is required');
    }
    
    const result = await typedPrisma.chatMessage.deleteMany({
      where: {
        pdfId,
        userId,
        sessionId: sessionId || null,
      },
    });
    
    return { count: result.count };
  },

  /**
   * Convert database messages to client-side format
   */
  toClientMessages(dbMessages: any[]): ChatMessageType[] {
    return dbMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      annotations: msg.annotations?.map((a: any) => ({
        type: a.type as any,
        page: a.page,
        x: a.x,
        y: a.y,
        width: a.width || undefined,
        height: a.height || undefined,
        radius: a.radius || undefined,
        color: a.color || undefined,
        text: a.text || undefined,
        importance: a.importance as any || undefined,
      })) || [],
      timestamp: msg.createdAt,
      error: msg.error || false,
    }));
  },
};