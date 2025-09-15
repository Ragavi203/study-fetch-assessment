/**
 * Mock auth middleware for testing
 * Simulates authentication for development and testing environments
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Skip authentication for development and testing
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // Add test user ID to headers
    const headers = new Headers(request.headers);
    headers.set('Authorization', 'Bearer mock-token');
    
    // Clone the request with new headers
    const modifiedRequest = new NextRequest(request.url, {
      headers,
      method: request.method,
      body: request.body,
      cache: request.cache,
      credentials: request.credentials,
      integrity: request.integrity,
      keepalive: request.keepalive,
      mode: request.mode,
      redirect: request.redirect,
    });
    
    return NextResponse.next({
      request: modifiedRequest,
    });
  }
  
  // For production, continue without modification
  return NextResponse.next();
}

// Apply middleware to specific API routes
export const config = {
  matcher: [
    '/api/pdf/:path*/annotations/:path*',
    '/api/pdf/:path*/chat/:path*',
  ],
};