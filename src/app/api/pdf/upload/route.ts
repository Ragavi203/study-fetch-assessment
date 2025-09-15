import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { verifyAuth } from '@/lib/auth';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: Request) {
  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, content, title } = body || {};
    if (!filename || !content) {
      return NextResponse.json({ error: 'filename and content required' }, { status: 400 });
    }

    // Validate PDF content
    const buffer = Buffer.from(content, 'base64');
    
    try {
      // Load and validate PDF
      const pdfDoc = await PDFDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();

      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', userId);
      await fs.promises.mkdir(uploadsDir, { recursive: true });

      // Create a unique filename
      const uniqueName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = path.join(uploadsDir, uniqueName);
      
      // Save the file
      await fs.promises.writeFile(filePath, buffer);
      const url = `/uploads/${userId}/${uniqueName}`;

      // Create PDF record in database
      const pdf = await prisma.pDF.create({
        data: {
          url,
          title: title || filename,
          userId,
          pageCount,
          updatedAt: new Date(),
        },
        include: {
          user: {
            select: {
              email: true
            }
          }
        }
      });

      return NextResponse.json({
        message: 'Upload successful',
        pdf: {
          ...pdf,
          pageCount
        }
      });

    } catch (pdfError) {
      console.error('PDF validation error:', pdfError);
      return NextResponse.json({
        error: 'Invalid PDF file. Please upload a valid PDF document.'
      }, { status: 400 });
    }

  } catch (err: any) {
    console.error('PDF upload error:', err);
    
    // Handle specific error types
    if (err.code === 'P2002') {
      return NextResponse.json({
        error: 'A PDF with this name already exists'
      }, { status: 409 });
    }
    
    if (err.code === 'P2003') {
      return NextResponse.json({
        error: 'User account not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      error: 'Failed to upload PDF. Please try again.'
    }, { status: 500 });
  }
}
