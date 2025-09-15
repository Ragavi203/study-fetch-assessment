"use client";
import React, { useEffect, useState, useCallback } from 'react';

interface ConnectionManagerProps {
  children: React.ReactNode;
}

/**
 * Connection Manager Component
 * This component provides robust connection management:
 * 1. Monitors browser online/offline status
 * 2. Implements server heartbeat for backend connectivity
 * 3. Provides auto and manual reconnection options
 * 4. Monitors for EventSource/SSE connection failures
 * 5. Implements progressive backoff for reconnection attempts
 */
export default function ConnectionManager({ children }: ConnectionManagerProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());
  const [sseConnectionStatus, setSseConnectionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  
  // Handle reconnection attempts with exponential backoff
  const handleReconnection = useCallback(() => {
    // Only start reconnection if we're not already trying
    if (!reconnecting) {
      setReconnecting(true);
    }
    
    // Increment reconnect attempts
    setReconnectAttempts(prev => {
      const newAttempts = prev + 1;
      
      // Calculate backoff time: 2^attempts * 1000ms with a 30s max
      const backoffMs = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
      console.log(`🔄 Reconnection attempt ${newAttempts} scheduled in ${backoffMs/1000}s`);
      
      // Try to reload the application after the calculated delay
      setTimeout(() => {
        if (newAttempts >= 3) {
          console.log("🔄 Attempting page reload after multiple failed reconnections");
          window.location.reload();
        } else {
          // Just try another connection check
          console.log("🔄 Checking connection again...");
        }
      }, backoffMs);
      
      return newAttempts;
    });
  }, [reconnecting]);
  
  // Check server connection with timeout
  const checkServerConnection = useCallback(async () => {
    try {
      // Simple ping to check server connection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch('/api/ping', { 
        method: 'HEAD',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log("✅ Server heartbeat successful");
        setIsOnline(true);
        setReconnecting(false);
        setReconnectAttempts(0);
      } else {
        console.log("❌ Server heartbeat failed with status:", response.status);
        handleReconnection();
      }
    } catch (error) {
      console.log("❌ Server heartbeat failed with error:", error);
      if ((error as Error).name === 'AbortError') {
        console.log("⏱️ Server heartbeat timed out");
      }
      handleReconnection();
    }
  }, [handleReconnection]);
  
  // Check SSE connection status
  const checkSseStatus = useCallback(() => {
    if (Date.now() - lastHeartbeat > 30000 && isOnline && sseConnectionStatus === 'connected') {
      console.log("⚠️ SSE connection may be stale, no heartbeat received");
      setSseConnectionStatus('disconnected');
      handleReconnection();
    }
    
    // Also check for any Edge runtime error indicators in the DOM
    const checkEdgeErrors = () => {
      const errorMessages = Array.from(document.querySelectorAll('.text-red-400, .text-red-500'));
      const edgeErrorFound = errorMessages.some(el => 
        el.textContent?.includes('Error code: 5') || 
        el.textContent?.includes('Edge runtime')
      );
      
      if (edgeErrorFound) {
        console.log("⚠️ Edge runtime error detected in UI");
        // Trigger a reconnection if we find Edge errors
        handleReconnection();
      }
    };
    
    // Run the check
    checkEdgeErrors();
  }, [handleReconnection, isOnline, lastHeartbeat, sseConnectionStatus]);
  
  // Monitor online/offline status
  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => {
      console.log("🟢 Browser reports connection restored");
      setIsOnline(true);
      checkServerConnection();
    };
    
    const handleOffline = () => {
      console.log("🔴 Browser reports connection lost");
      setIsOnline(false);
      setSseConnectionStatus('disconnected');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkServerConnection]);
  
  // Monitor SSE heartbeats
  useEffect(() => {
    const handleSseHeartbeat = () => {
      console.log("💓 SSE heartbeat received");
      setSseConnectionStatus('connected');
      setLastHeartbeat(Date.now());
    };
    
    window.addEventListener('sse-heartbeat', handleSseHeartbeat);
    
    return () => {
      window.removeEventListener('sse-heartbeat', handleSseHeartbeat);
    };
  }, []);
  
  // Set up periodic checks
  useEffect(() => {
    // Run initial check
    checkServerConnection();
    
    // Set up intervals with frequencies based on current state
    const sseCheckInterval = setInterval(checkSseStatus, 10000);
    const heartbeatInterval = setInterval(
      checkServerConnection, 
      reconnecting ? 5000 : 15000
    );
    
    return () => {
      clearInterval(sseCheckInterval);
      clearInterval(heartbeatInterval);
    };
  }, [checkServerConnection, checkSseStatus, reconnecting]);
  
  return (
    <>
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white py-2 px-4 text-center z-50">
          {reconnecting ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Connection lost. Reconnecting... ({reconnectAttempts}/3)</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Connection lost. Please </span>
              <button 
                onClick={() => window.location.reload()} 
                className="underline font-medium hover:text-white/80"
              >
                refresh the page
              </button>
            </div>
          )}
        </div>
      )}
      {children}
    </>
  );
}