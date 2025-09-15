/**
 * Annotation service with database persistence
 * Handles creation, retrieval, and management of PDF annotations
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { Annotation as AnnotationType } from '@/types/types'; // Client-side type

// Add a type cast to work around TypeScript errors with Prisma client
// This is needed because the model name in Prisma schema (Annotation) doesn't match
// the property name in the generated client (annotation)
const typedPrisma = prisma as any;

// Define server-side Annotation type based on Prisma schema
type Annotation = {
  id: string;
  chatMessageId?: string | null;
  pdfId: string;
  userId?: string | null;
  page: number;
  type: string;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  radius?: number | null;
  color?: string | null;
  text?: string | null;
  importance?: string | null;
  sequence: number;
  isAutomatic: boolean;
  createdAt: Date;
  deletedAt?: Date | null;
  meta?: any | null;
};

interface CreateAnnotationParams {
  pdfId: string;
  page: number;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color?: string;
  text?: string;
  importance?: 'low' | 'medium' | 'high';
  chatMessageId?: string;
  userId?: string; // Either AI-generated (chatMessageId) or user-created (userId)
  sequence?: number;
}

interface GetAnnotationsParams {
  pdfId: string;
  page?: number;
  chatMessageId?: string;
  userId?: string;
  includeDeleted?: boolean;
}

// Main service export
export const annotationService = {
  /**
   * Create a new annotation in the database
   */
  async create(params: CreateAnnotationParams): Promise<Annotation> {
    return await typedPrisma.annotation.create({
      data: {
        pdfId: params.pdfId,
        page: params.page,
        type: params.type,
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
        radius: params.radius,
        color: params.color,
        text: params.text,
        importance: params.importance,
        chatMessageId: params.chatMessageId,
        userId: params.userId,
        sequence: params.sequence || 0,
      }
    }) as unknown as Annotation;
  },

  /**
   * Create multiple annotations in a single transaction
   */
  async createMany(annotations: CreateAnnotationParams[]): Promise<number> {
    const result = await prisma.$transaction(
      annotations.map((anno) => 
        typedPrisma.annotation.create({
          data: {
            pdfId: anno.pdfId,
            page: anno.page,
            type: anno.type,
            x: anno.x,
            y: anno.y,
            width: anno.width,
            height: anno.height,
            radius: anno.radius,
            color: anno.color,
            text: anno.text,
            importance: anno.importance,
            chatMessageId: anno.chatMessageId,
            userId: anno.userId,
            sequence: anno.sequence || 0,
          }
        })
      )
    );
    
    return result.length;
  },

  /**
   * Retrieve annotations based on filters
   */
  async get(params: GetAnnotationsParams): Promise<Annotation[]> {
    return await typedPrisma.annotation.findMany({
      where: {
        pdfId: params.pdfId,
        page: params.page,
        chatMessageId: params.chatMessageId,
        userId: params.userId,
        deletedAt: params.includeDeleted ? undefined : null,
      },
      orderBy: [
        { sequence: 'asc' },
        { createdAt: 'asc' },
      ],
    }) as unknown as Annotation[];
  },

  /**
   * Get all annotations for a specific PDF
   */
  async getByPdfId(pdfId: string, includeDeleted: boolean = false): Promise<Annotation[]> {
    return await typedPrisma.annotation.findMany({
      where: {
        pdfId,
        deletedAt: includeDeleted ? undefined : null,
      },
      orderBy: [
        { page: 'asc' },
        { sequence: 'asc' },
        { createdAt: 'asc' },
      ],
    }) as unknown as Annotation[];
  },

  /**
   * Get annotations for a specific page of a PDF
   */
  async getByPage(pdfId: string, page: number): Promise<Annotation[]> {
    return await typedPrisma.annotation.findMany({
      where: {
        pdfId,
        page,
        deletedAt: null,
      },
      orderBy: [
        { sequence: 'asc' },
        { createdAt: 'asc' },
      ],
    }) as unknown as Annotation[];
  },

  /**
   * Delete annotation (soft delete)
   */
  async delete(id: string): Promise<Annotation> {
    return await typedPrisma.annotation.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    }) as unknown as Annotation;
  },

  /**
   * Hard delete annotation (permanent)
   */
  async hardDelete(id: string): Promise<Annotation> {
    return await typedPrisma.annotation.delete({
      where: { id },
    }) as unknown as Annotation;
  },

  /**
   * Undo the last N annotations by a user on a PDF
   */
  async undoLastN(userId: string, pdfId: string, n: number = 1): Promise<number> {
    const annotations = await typedPrisma.annotation.findMany({
      where: {
        userId,
        pdfId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: n,
    }) as unknown as Annotation[];

    if (annotations.length === 0) return 0;

    await typedPrisma.annotation.updateMany({
      where: {
        id: {
          in: annotations.map((a: Annotation) => a.id),
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return annotations.length;
  },

  /**
   * Convert database Annotation to client AnnotationType
   */
  toClientAnnotation(dbAnnotation: Annotation): AnnotationType {
    return {
      type: dbAnnotation.type as any,
      page: dbAnnotation.page,
      x: dbAnnotation.x,
      y: dbAnnotation.y,
      width: dbAnnotation.width || undefined,
      height: dbAnnotation.height || undefined,
      radius: dbAnnotation.radius || undefined,
      color: dbAnnotation.color || undefined,
      text: dbAnnotation.text || undefined,
      importance: dbAnnotation.importance as any || undefined,
      isAutomatic: !!dbAnnotation.chatMessageId,
    };
  },

  /**
   * Convert client AnnotationType to database create params
   */
  fromClientAnnotation(clientAnnotation: AnnotationType, pdfId: string, chatMessageId?: string, userId?: string): CreateAnnotationParams {
    return {
      pdfId,
      page: clientAnnotation.page || 1,
      type: clientAnnotation.type,
      x: clientAnnotation.x,
      y: clientAnnotation.y,
      width: clientAnnotation.width,
      height: clientAnnotation.height,
      radius: clientAnnotation.radius,
      color: clientAnnotation.color,
      text: clientAnnotation.text,
      importance: clientAnnotation.importance,
      chatMessageId,
      userId,
    };
  }
};