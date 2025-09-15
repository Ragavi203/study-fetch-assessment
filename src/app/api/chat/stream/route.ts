import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { setStreamPayload } from '@/lib/shortTermStore';

// Stream timeout after which we should close the connection (2 minutes)
const STREAM_TIMEOUT = 120000;

export const runtime = 'edge';

// For easier debugging and verification - keep this commented for production
// console.log should show in server-side logs when this route is called
// function debugTokenHandling(token: string | null, streamUrl: string) {
//   console.log('----DEBUG TOKEN HANDLING----');
//   console.log('Token received:', token ? `${token.substring(0, 5)}...` : 'null');
//   console.log('Stream URL created:', streamUrl);
//   console.log('--------------------------');
// }

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse the request
    const body = await req.json();
  const { messages, pdfText, pdfId, streamId, currentPage, pageHints } = body;
    
    if (!messages || !Array.isArray(messages)) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing or invalid messages' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Determine streamId (client-provided or generated)
    const effectiveStreamId = String(streamId || Date.now());

    // Store payload in short term store (omit any huge data trimming for now)
    try {
      setStreamPayload(effectiveStreamId, {
        messages,
        pdfText: pdfText || {},
        pdfId,
        currentPage: currentPage || 1,
        pageHints: Array.isArray(pageHints) ? pageHints.slice(0, 10) : undefined
      });
    } catch (storeErr) {
      console.error('Failed to store stream payload', storeErr);
      return new NextResponse(
        JSON.stringify({ error: 'Failed to prepare stream payload' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Prepare a trimmed payload as a query + base64 fallback (Edge isolates may not share in-memory store)
    let queryPayload = '';
    let queryPayloadB64 = '';
    try {
      const lastMessages = messages.slice(-6).map((m: any) => ({ role: m.role, content: (m.content || '').slice(0, 1200) }));
      const trimmedPdfText = {
        current: (pdfText?.current || pdfText || '').toString().slice(0, 5000),
        previous: (pdfText?.previous || null) ? String(pdfText.previous).slice(0, 600) : null,
        next: (pdfText?.next || null) ? String(pdfText.next).slice(0, 600) : null,
        currentPage: currentPage || 1,
        totalPages: pdfText?.totalPages || pdfText?.total || pdfText?.pages || 1
      };
      const payload = {
        messages: lastMessages,
        pdfText: trimmedPdfText,
        currentPage: currentPage || 1,
        pdfId
      };
      const json = JSON.stringify(payload);
      queryPayload = encodeURIComponent(json);
      try {
        // Base64 for higher reliability (avoid % sequence issues)
        // atob/btoa limited to Latin1 -> use escape/unescape trick
        const b64 = btoa(unescape(encodeURIComponent(json)));
        queryPayloadB64 = encodeURIComponent(b64);
      } catch (b64Err) {
        console.warn('Could not base64 encode stream payload', b64Err);
      }
    } catch (encodeErr) {
      console.warn('Could not encode query fallback payload', encodeErr);
    }

    // Generate stream URL including token and query fallback (messageData) for robustness (prefer b64 if present)
    const streamUrl = `/api/chat/stream/${effectiveStreamId}?token=${token}` +
      (queryPayload ? `&messageData=${queryPayload}` : '') +
      (queryPayloadB64 ? `&messageDataB64=${queryPayloadB64}` : '');
    
    // Uncomment for debugging
    // if (typeof debugTokenHandling === 'function') {
    //   debugTokenHandling(token, streamUrl);
    // }
    
    // Return the stream URL to the client
    return new NextResponse(
      JSON.stringify({ streamUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Stream preparation error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}