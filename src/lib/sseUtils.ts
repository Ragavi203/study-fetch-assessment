import { NextResponse } from 'next/server';

/**
 * Create a Server-Sent Events (SSE) response with proper headers
 * @returns NextResponse configured for SSE
 */
export function createSSEResponse() {
  return new NextResponse(new ReadableStream(), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  });
}

/**
 * Format a message for SSE
 * @param data The data to send
 * @param event The event type
 * @returns Formatted SSE message string
 */
export function formatSSEMessage(data: any, event: string = 'message') {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Send a message through an SSE writer
 * @param writer The writer from the transform stream
 * @param data The data to send
 * @param event The event type
 */
export async function sendSSEMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: any,
  event: string = 'message'
) {
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(formatSSEMessage(data, event)));
}

/**
 * Handle errors safely in Edge runtime
 * @param error The error object
 * @returns A safe string representation of the error
 */
export function handleEdgeError(error: unknown): string {
  try {
    // For standard errors, extract name and message
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    
    // For non-Error objects, do a basic extraction
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      return JSON.stringify({
        name: errorObj.name || 'Unknown',
        message: errorObj.message || 'Unknown error',
        code: errorObj.code || undefined
      });
    }
    
    // Fallback for primitives
    return String(error);
  } catch (formatError) {
    return 'Error details could not be processed';
  }
}

/**
 * Send a heartbeat message to keep the connection alive
 * @param writer The writer from the transform stream
 */
export async function sendHeartbeat(writer: WritableStreamDefaultWriter<Uint8Array>) {
  await sendSSEMessage(writer, { type: 'heartbeat', timestamp: Date.now() }, 'heartbeat');
}

/**
 * Create a heartbeat interval for SSE
 * @param writer The writer from the transform stream
 * @param intervalMs Heartbeat interval in milliseconds
 * @returns Interval ID for cleanup
 */
export function createHeartbeatInterval(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  intervalMs: number = 15000
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await sendHeartbeat(writer);
    } catch (error) {
      console.error('Heartbeat error:', error);
      // The interval will be cleared by the caller
    }
  }, intervalMs);
}

/**
 * Create a timeout for SSE connections
 * @param writer The writer from the transform stream
 * @param timeoutMs Timeout in milliseconds
 * @returns Timeout ID for cleanup
 */
export function createConnectionTimeout(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  timeoutMs: number = 60000
): NodeJS.Timeout {
  return setTimeout(async () => {
    try {
      await sendSSEMessage(writer, {
        type: 'error',
        error: 'Connection timeout',
        details: 'The connection was closed due to inactivity'
      }, 'error');
      
      await writer.close();
    } catch (error) {
      console.error('Timeout handler error:', error);
    }
  }, timeoutMs);
}