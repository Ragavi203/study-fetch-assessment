/**
 * Debug utilities for the application
 * These can be used to log information about annotations and streams
 */

// Debug modes
let debugMode = false;
let annotationDebug = false;
let streamDebug = false;

// Enable/disable general debug logging
export function enableDebug(enable = true) { 
  debugMode = enable; 
  console.log(`Debug mode: ${enable ? 'enabled' : 'disabled'}`);
}

// Enable/disable annotation-specific debug logging
export function enableAnnotationDebug(enable = true) { 
  annotationDebug = enable; 
  console.log(`Annotation debug: ${enable ? 'enabled' : 'disabled'}`);
}

// Enable/disable stream-specific debug logging
export function enableStreamDebug(enable = true) { 
  streamDebug = enable; 
  console.log(`Stream debug: ${enable ? 'enabled' : 'disabled'}`);
}

// Log only if debug is enabled
export function debugLog(...args: any[]) {
  if (debugMode) {
    console.log('[DEBUG]', ...args);
  }
}

// Log only if annotation debug is enabled
export function annotationLog(...args: any[]) {
  if (annotationDebug) {
    console.log('[ANNOTATION]', ...args);
  }
}

// Log only if stream debug is enabled
export function streamLog(...args: any[]) {
  if (streamDebug) {
    console.log('[STREAM]', ...args);
  }
}

// Analyze a stream chunk for annotation commands
export function analyzeStreamChunk(chunk: string) {
  if (!annotationDebug) return;

  // Check for annotation commands
  const highlightRegex = /\[HIGHLIGHT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\]/g;
  const circleRegex = /\[CIRCLE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\]/g;
  
  let match;
  const commands = [];
  
  // Look for highlight commands
  while ((match = highlightRegex.exec(chunk)) !== null) {
    commands.push({
      type: 'highlight',
      x: match[1],
      y: match[2],
      width: match[3],
      height: match[4],
      page: match[5],
      color: match[6] || 'default'
    });
  }
  
  // Look for circle commands
  while ((match = circleRegex.exec(chunk)) !== null) {
    commands.push({
      type: 'circle',
      x: match[1],
      y: match[2],
      radius: match[3],
      page: match[4],
      color: match[5] || 'default'
    });
  }
  
  if (commands.length > 0) {
    console.log('[ANNOTATION COMMANDS FOUND]', commands);
    console.log('In chunk:', chunk);
  }
}

// For printing raw chunks without any processing
export function printRawChunk(chunk: string) {
  if (streamDebug) {
    console.log('[RAW CHUNK]', JSON.stringify(chunk));
  }
}

// Global accessor for debug state
export function isDebugEnabled() {
  return debugMode;
}

// Global accessor for annotation debug state
export function isAnnotationDebugEnabled() {
  return annotationDebug;
}

// Global accessor for stream debug state
export function isStreamDebugEnabled() {
  return streamDebug;
}

// Initialize debug settings (automatically enable in dev)
if (process.env.NODE_ENV === 'development') {
  enableDebug(true);
  enableAnnotationDebug(true);
  enableStreamDebug(true);
}