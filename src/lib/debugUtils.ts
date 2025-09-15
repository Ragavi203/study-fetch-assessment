/**
 * Debug utilities for tracking and diagnosing issues in the application
 */

let debugMode = false;

// Enable or disable debug mode globally
export function setDebugMode(enabled: boolean) {
  debugMode = enabled;
  
  if (enabled) {
    console.log("DEBUG MODE ENABLED");
    
    // Add global debug object to window for console access
    if (typeof window !== 'undefined') {
      (window as any).__pdfDebug = {
        logAnnotation,
        toggleDebugMode,
        getDebugStats,
        clearDebugStats
      };
      console.log("Debug utilities added to window.__pdfDebug");
    }
  }
}

// Toggle debug mode
export function toggleDebugMode() {
  setDebugMode(!debugMode);
  return debugMode;
}

// Debug statistics
const stats = {
  annotationsProcessed: 0,
  annotationsDisplayed: 0,
  eventsProcessed: 0,
  errors: [] as string[]
};

// Log annotation for debugging
export function logAnnotation(annotation: any) {
  if (!debugMode) return;
  
  stats.annotationsProcessed++;
  
  console.log(
    `%c Annotation: ${annotation.type} on page ${annotation.page} %c`,
    'background: #3366FF; color: white; padding: 2px 5px; border-radius: 3px;',
    '',
    annotation
  );
}

// Log when an annotation is displayed
export function logAnnotationDisplay(annotation: any) {
  if (!debugMode) return;
  
  stats.annotationsDisplayed++;
  
  console.log(
    `%c Displayed: ${annotation.type} %c`,
    'background: #33CC33; color: white; padding: 2px 5px; border-radius: 3px;',
    '',
    annotation
  );
}

// Log event processing
export function logEventProcessed(eventType: string, details: any = {}) {
  if (!debugMode) return;
  
  stats.eventsProcessed++;
  
  console.log(
    `%c Event: ${eventType} %c`,
    'background: #FF9900; color: white; padding: 2px 5px; border-radius: 3px;',
    '',
    details
  );
}

// Log errors
export function logError(component: string, error: any) {
  if (!debugMode) return;
  
  const errorMessage = `${component}: ${error?.message || error}`;
  stats.errors.push(errorMessage);
  
  console.error(
    `%c ERROR: ${component} %c`,
    'background: #FF3333; color: white; padding: 2px 5px; border-radius: 3px;',
    '',
    error
  );
}

// Get debug statistics
export function getDebugStats() {
  return {
    ...stats,
    debugMode
  };
}

// Clear debug statistics
export function clearDebugStats() {
  stats.annotationsProcessed = 0;
  stats.annotationsDisplayed = 0;
  stats.eventsProcessed = 0;
  stats.errors = [];
  return "Debug stats cleared";
}

// Initialize with debug mode on if in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  setDebugMode(true);
}