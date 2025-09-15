"use client";
import { useEffect, useState } from 'react';

/**
 * A simplified version of the AnnotationDebugger component
 * to avoid any React hook issues or rendering problems
 */
export default function AnnotationDebugger() {
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  
  useEffect(() => {
    // Create a simpler event handler that won't cause React issues
    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const chunk = customEvent.detail?.text || "No text in event";
      
      // Update the event count
      setEventCount(prev => prev + 1);
      setLastEvent(chunk.substring(0, 50) + (chunk.length > 50 ? "..." : ""));
      
      // Log to console for debugging only
      console.log("AnnotationDebugger: Event received", {
        count: eventCount + 1,
        text: chunk.substring(0, 100)
      });
    };
    
    // Add event listener
    window.addEventListener('ai-response-chunk', handleEvent);
    
    // Test event after a delay
    const timer = setTimeout(() => {
      try {
        const testEvent = new CustomEvent('ai-response-chunk', {
          detail: { text: "Test event from AnnotationDebugger" }
        });
        window.dispatchEvent(testEvent);
      } catch (e) {
        console.error("Failed to dispatch test event:", e);
      }
    }, 2000);
    
    // Cleanup function
    return () => {
      window.removeEventListener('ai-response-chunk', handleEvent);
      clearTimeout(timer);
    };
  }, []); // Empty dependency array to run only once
  
  // Return a minimal UI
  if (process.env.NODE_ENV !== 'production') {
    return (
      <div className="fixed bottom-4 left-4 z-50 bg-gray-900/80 text-white text-xs p-2 rounded-md">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${eventCount > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span>Events: {eventCount}</span>
        </div>
        {lastEvent && <div className="mt-1 text-gray-300">{lastEvent}</div>}
      </div>
    );
  }
  
  // Return null in production
  return null;
}