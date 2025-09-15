/**
 * PDFPage service for handling PDF text extraction and page metadata
 * Used for improving annotation accuracy and normalization
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

// Add a type cast to work around TypeScript errors with Prisma client
// This is needed because the model name in Prisma schema (PDFPage) doesn't match
// the property name in the generated client (pDFPage)
const typedPrisma = prisma as any;

// Define server-side PDFPage type based on Prisma schema
type PDFPage = {
  id: string;
  pdfId: string;
  pageNumber: number;
  text: string;
  textHash?: string | null;
  lineOffsets?: any | null;
  contentBox?: any | null;
  createdAt: Date;
  updatedAt: Date;
};

interface CreatePDFPageParams {
  pdfId: string;
  pageNumber: number;
  text: string;
}

interface PageMetadata {
  lineOffsets: number[];
  contentBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  lineHeight: number;
  paragraphs: { start: number; end: number }[];
}

export const pdfPageService = {
  /**
   * Create or update a PDF page
   */
  async createOrUpdate({ pdfId, pageNumber, text }: CreatePDFPageParams) {
    // Create a hash of the text for quick comparisons
    const textHash = crypto
      .createHash('md5')
      .update(text || '')
      .digest('hex');
    
    // Try to find an existing page
    const existingPage = await typedPrisma.pDFPage.findUnique({
      where: {
        pdfId_pageNumber: {
          pdfId,
          pageNumber,
        },
      },
    }) as PDFPage | null;
    
    if (existingPage) {
      // Update if text has changed (based on hash)
      if (existingPage.textHash !== textHash) {
        return await typedPrisma.pDFPage.update({
          where: {
            id: existingPage.id,
          },
          data: {
            text,
            textHash,
          },
        }) as PDFPage;
      }
      return existingPage;
    }
    
    // Create new page
    return await typedPrisma.pDFPage.create({
      data: {
        pdfId,
        pageNumber,
        text,
        textHash,
      },
    }) as PDFPage;
  },
  
  /**
   * Get all pages for a PDF
   */
  async getByPdfId(pdfId: string) {
    return await typedPrisma.pDFPage.findMany({
      where: { pdfId },
      orderBy: { pageNumber: 'asc' },
    }) as PDFPage[];
  },
  
  /**
   * Get a specific page
   */
  async getPage(pdfId: string, pageNumber: number) {
    return await typedPrisma.pDFPage.findUnique({
      where: {
        pdfId_pageNumber: {
          pdfId,
          pageNumber,
        },
      },
    }) as PDFPage | null;
  },
  
  /**
   * Extract page metadata for coordinate normalization
   * This helps improve annotation accuracy by understanding the page structure
   */
  extractPageMetadata(text: string): PageMetadata {
    if (!text) {
      return {
        lineOffsets: [],
        contentBounds: { left: 50, right: 550, top: 50, bottom: 750 },
        lineHeight: 22,
        paragraphs: [],
      };
    }
    
    // Split text into lines
    const lines = text.split('\n');
    
    // Calculate line offsets (rough approximation - would need real PDF coordinates)
    const lineHeight = 22; // Default line height in PDF viewers (approximate)
    const topMargin = 50; // Top margin in points
    const lineOffsets = lines.map((_, index) => topMargin + index * lineHeight);
    
    // Estimate content bounds based on line lengths
    let minLeft = 50; // Default left margin
    let maxRight = 550; // Default right (for standard 8.5x11 page, around 600pt wide)
    
    // Find paragraphs (simplistic - consecutive non-empty lines)
    const paragraphs: { start: number; end: number }[] = [];
    let inParagraph = false;
    let paragraphStart = 0;
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      if (trimmedLine.length > 0) {
        if (!inParagraph) {
          inParagraph = true;
          paragraphStart = index;
        }
      } else if (inParagraph) {
        inParagraph = false;
        paragraphs.push({
          start: paragraphStart,
          end: index - 1,
        });
      }
      
      // Estimate left/right bounds based on text
      if (trimmedLine.length > 0) {
        // Estimate character width at about 8pt
        const charWidth = 8;
        const indent = line.length - trimmedLine.length; // Leading spaces
        const lineLeft = minLeft + indent * charWidth;
        const lineRight = lineLeft + trimmedLine.length * charWidth;
        
        // Update bounds
        minLeft = Math.min(minLeft, lineLeft);
        maxRight = Math.max(maxRight, lineRight);
      }
    });
    
    // Add the last paragraph if we ended in one
    if (inParagraph) {
      paragraphs.push({
        start: paragraphStart,
        end: lines.length - 1,
      });
    }
    
    return {
      lineOffsets,
      contentBounds: {
        left: minLeft,
        right: maxRight,
        top: topMargin,
        bottom: topMargin + lines.length * lineHeight,
      },
      lineHeight,
      paragraphs,
    };
  },
  
  /**
   * Normalize coordinates based on page metadata
   * Adjusts annotation coordinates to match the text layer
   */
  normalizeAnnotationCoordinates(
    x: number,
    y: number,
    width: number | undefined,
    height: number | undefined,
    metadata: PageMetadata
  ) {
    // Find closest line to the y coordinate
    const lineIndex = metadata.lineOffsets.findIndex(offset => offset > y) - 1;
    const normalizedY = lineIndex >= 0 ? metadata.lineOffsets[lineIndex] : y;
    
    // Constrain x within content bounds
    const normalizedX = Math.max(
      metadata.contentBounds.left,
      Math.min(x, metadata.contentBounds.right - (width || 10))
    );
    
    // For height, use line height or provided height
    const normalizedHeight = height || metadata.lineHeight;
    
    // For width, constrain to content bounds
    const normalizedWidth = width
      ? Math.min(width, metadata.contentBounds.right - normalizedX)
      : Math.min(200, metadata.contentBounds.right - normalizedX);
    
    return {
      x: normalizedX,
      y: normalizedY,
      width: normalizedWidth,
      height: normalizedHeight,
    };
  },
};