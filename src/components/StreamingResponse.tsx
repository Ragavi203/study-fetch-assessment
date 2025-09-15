"use client";
import { useState, useEffect } from 'react';
import { Annotation } from '@/types/types';
import { processStreamedResponse } from '@/lib/annotationUtils';

interface StreamingResponseProps {
  responseUrl: string;
  onAnnotation: (annotations: Annotation[]) => void;
  onNavigation?: (page: number) => void;
  currentPage: number;
  onComplete?: (fullText: string) => void;
  token: string;
}

export default function StreamingResponse({
  responseUrl,
  onAnnotation,
  onNavigation,
  currentPage,
  onComplete,
  token
}: StreamingResponseProps) {
  const [text, setText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Start streaming when component mounts
  useEffect(() => {
    let fullText = '';
    
    const fetchStream = async () => {
      setIsStreaming(true);
      setError(null);
      
      try {
        const response = await fetch(responseUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        if (!response.body) {
          throw new Error('ReadableStream not supported in this browser.');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // Process the stream
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Streaming complete
            if (onComplete) onComplete(fullText);
            break;
          }
          
          // Decode the chunk and process it
          const chunk = decoder.decode(value, { stream: true });
          
          // Process for annotations and navigation
          const cleanedChunk = processStreamedResponse(
            chunk,
            onAnnotation,
            (page) => {
              if (onNavigation) onNavigation(page);
            },
            currentPage
          );
          
          // Update UI with the cleaned text
          fullText += cleanedChunk;
          setText(fullText);
          
          // Dispatch custom event for components that need to respond to chunks
          const streamEvent = new CustomEvent('ai-response-chunk', { 
            detail: { text: chunk }
          });
          window.dispatchEvent(streamEvent);
        }
      } catch (err) {
        console.error('Error streaming response:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setIsStreaming(false);
      }
    };
    
    fetchStream();
    
    return () => {
      // Cleanup if needed
    };
  }, [responseUrl, onAnnotation, onNavigation, currentPage, onComplete, token]);

  return (
    <div className="streaming-response">
      {isStreaming && (
        <div className="streaming-indicator flex items-center gap-2 text-sm text-blue-400 mb-2">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '600ms' }}></div>
          </div>
          Streaming response...
        </div>
      )}
      
      {error && (
        <div className="error-message text-red-500 bg-red-100 p-3 rounded mb-2">
          Error: {error}
        </div>
      )}
      
      <div className="response-text whitespace-pre-wrap">{text}</div>
    </div>
  );
}