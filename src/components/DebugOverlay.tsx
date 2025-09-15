"use client";
import React, { useState, useEffect } from 'react';
import { safeStringify } from '@/lib/safeStringify';

/**
 * Debug overlay component to help diagnose issues with the application
 * This will display in the bottom-right corner of the screen
 */
export default function DebugOverlay() {
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<{type: string, message: string, timestamp: number}[]>([]);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [streamEvents, setStreamEvents] = useState(0);
  
  // Refs for throttling log updates
  const lastLogUpdateRef = React.useRef<number>(0);
  const pendingLogsRef = React.useRef<{type: string, message: string, timestamp: number}[]>([]);
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Function to flush pending logs (debounced)
  const flushPendingLogs = React.useCallback(() => {
    if (pendingLogsRef.current.length === 0) return;
    
    setLogs(prev => {
      const newLogs = [...prev, ...pendingLogsRef.current];
      pendingLogsRef.current = [];
      // Keep only the last 50 logs
      return newLogs.length > 50 ? newLogs.slice(-50) : newLogs;
    });
    
    lastLogUpdateRef.current = Date.now();
  }, []);
  
  // Add log with throttling
  const addLog = React.useCallback((type: string, message: string) => {
    pendingLogsRef.current.push({
      type,
      message, 
      timestamp: Date.now()
    });
    
    // If we have a lot of pending logs or it's been a while since the last update, flush immediately
    if (pendingLogsRef.current.length >= 5 || Date.now() - lastLogUpdateRef.current > 500) {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      flushPendingLogs();
    } 
    // Otherwise, debounce updates
    else if (!updateTimeoutRef.current) {
      updateTimeoutRef.current = setTimeout(() => {
        updateTimeoutRef.current = null;
        flushPendingLogs();
      }, 200);
    }
  }, [flushPendingLogs]);

  // Capture all console logs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Save original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Override console methods to capture logs
    console.log = function(...args) {
      try {
        const message = args.map(arg => 
          typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)
        ).join(' ');
        
        // Only capture logs related to annotations and streams
        if (
          message.includes('annotation') || 
          message.includes('highlight') || 
          message.includes('stream') ||
          message.includes('chat')
        ) {
          addLog('log', message);
        }
      } catch (err) {
        // Fallback if stringification fails
        addLog('log', '[Log stringification failed]');
      }
      
      // Call original method
      originalLog.apply(console, args);
    };

    console.warn = function(...args) {
      try {
        const message = args.map(arg => 
          typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)
        ).join(' ');
        
        addLog('warn', message);
      } catch (err) {
        addLog('warn', '[Warn stringification failed]');
      }
      
      originalWarn.apply(console, args);
    };

    console.error = function(...args) {
      try {
        const message = args.map(arg => 
          typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)
        ).join(' ');
        
        addLog('error', message);
      } catch (err) {
        addLog('error', '[Error stringification failed]');
      }
      
      originalError.apply(console, args);
    };

    // Listen for stream events
    const handleStreamEvent = () => {
      setStreamEvents(prev => prev + 1);
    };

    window.addEventListener('ai-response-chunk', handleStreamEvent);

    // Listen for annotation events
    const monitorAnnotations = setInterval(() => {
      // Count annotations in DOM
      const annotations = document.querySelectorAll('canvas');
      setAnnotationCount(annotations.length);
    }, 2000);

    // Restore original methods on cleanup
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener('ai-response-chunk', handleStreamEvent);
      clearInterval(monitorAnnotations);
      
      // Clear any pending log updates
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, []);

  // Toggle visibility with keyboard shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Don't render anything if not visible
  if (!visible) {
    return (
      <div className="fixed bottom-2 right-2 bg-gray-800 text-white p-1 text-xs rounded opacity-70 z-50">
        Debug: Press Ctrl+Shift+D
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 bg-gray-800 text-white p-2 max-w-md max-h-96 overflow-auto z-50 opacity-90 rounded-tl-md">
      <div className="flex justify-between items-center border-b border-gray-600 pb-1 mb-2">
        <h3 className="font-bold">Debug Info</h3>
        <button 
          onClick={() => setVisible(false)}
          className="text-xs bg-gray-700 px-2 py-1 rounded"
        >
          Close
        </button>
      </div>
      
      <div className="text-xs mb-2">
        <p>Annotations: {annotationCount}</p>
        <p>Stream Events: {streamEvents}</p>
      </div>
      
      <div className="border-t border-gray-600 pt-1">
        <h4 className="font-bold mb-1">Logs:</h4>
        <div className="text-xs space-y-1">
          {logs.map((log, i) => (
            <div 
              key={i} 
              className={`${
                log.type === 'error' ? 'text-red-400' : 
                log.type === 'warn' ? 'text-yellow-400' : 'text-green-400'
              } break-words`}
            >
              [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}