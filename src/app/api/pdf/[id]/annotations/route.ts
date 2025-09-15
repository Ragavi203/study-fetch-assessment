import { NextRequest, NextResponse } from 'next/server';
import { annotationService } from '@/lib/annotationService';
import { verifyAuth } from '@/lib/auth';

// GET endpoint - Retrieve annotations for a PDF
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the PDF ID from the URL
    const pdfId = params.id;
    if (!pdfId) {
      return new NextResponse(
        JSON.stringify({ error: 'PDF ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const pageParam = url.searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : undefined;

    // Get annotations
    let annotations;
    if (page !== undefined) {
      annotations = await annotationService.getByPage(pdfId, page);
    } else {
      annotations = await annotationService.getByPdfId(pdfId);
    }

    // Convert database annotations to client format
    const clientAnnotations = annotations.map(annotation => 
      annotationService.toClientAnnotation(annotation)
    );

    return new NextResponse(
      JSON.stringify({ 
        annotations: clientAnnotations,
        count: clientAnnotations.length,
        pdfId,
        page
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error retrieving annotations:', error);
    
    return new NextResponse(
      JSON.stringify({ error: 'Failed to retrieve annotations', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST endpoint - Create annotations for a PDF
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verify the user is authenticated
    const userId = await verifyAuth(request);
    if (!userId) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the PDF ID from the URL
    const pdfId = params.id;
    if (!pdfId) {
      return new NextResponse(
        JSON.stringify({ error: 'PDF ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse the request body
    const body = await request.json();
    const { annotations, chatMessageId } = body;

    // Validate the annotations
    if (!annotations || !Array.isArray(annotations) || annotations.length === 0) {
      return new NextResponse(
        JSON.stringify({ error: 'At least one annotation is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert client annotations to database format
    const dbAnnotations = annotations.map((annotation, index) => {
      return {
        pdfId,
        page: annotation.page || 1,
        type: annotation.type,
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        radius: annotation.radius,
        color: annotation.color,
        text: annotation.text,
        importance: annotation.importance,
        chatMessageId: chatMessageId || undefined,
        userId: !chatMessageId ? userId : undefined, // If not from AI, set userId
        sequence: index,
      };
    });

    // Create the annotations in a batch
    const count = await annotationService.createMany(dbAnnotations);

    return new NextResponse(
      JSON.stringify({ 
        success: true, 
        message: `Created ${count} annotations`,
        annotationCount: count
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error creating annotations:', error);
    
    return new NextResponse(
      JSON.stringify({ error: 'Failed to create annotations', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}