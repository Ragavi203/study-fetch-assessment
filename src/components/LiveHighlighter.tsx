"use client";
import { useState, useRef, useEffect } from 'react';
import { Annotation } from '@/types/types';
import { parseAnnotationCommands, extractNavigationCues } from '@/lib/annotationUtils';
import { logAnnotation, logEventProcessed, logError } from '@/lib/debugUtils';

interface LiveHighlighterProps {
  onAnnotationAdd: (annotation: Annotation | Annotation[]) => void;
  onPageChange?: (pageNum: number) => void;
  currentPage: number;
  isActive: boolean;
}

/**
 * LiveHighlighter component - listens for text chunks and extracts annotations
 * Memory-optimized version to prevent browser crashes
 */
export default function LiveHighlighter({
  onAnnotationAdd,
  onPageChange,
  currentPage,
  isActive
}: LiveHighlighterProps) {
  // Use refs for data that doesn't need to trigger re-renders
  const pendingAnnotationsRef = useRef<Annotation[]>([]);
  const [pendingNavigation, setPendingNavigation] = useState<{
    page: number;
    timeoutId: NodeJS.Timeout;
  } | null>(null);
  const [eventCount, setEventCount] = useState(0);
  
  // Track event processing metrics for optimization
  const metricsRef = useRef({
    totalEvents: 0,
    processedEvents: 0,
    skippedEvents: 0,
    lastProcessTime: 0,
    annotationsFound: 0
  });
  
  // Buffer to collect partial commands across chunks
  const commandBufferRef = useRef<string>('');
  const textBufferRef = useRef<string>('');
  const streamIdRef = useRef<string | null>(null);

  // Debug utility to log the current buffer contents
  const logBufferState = () => {
    console.log(`LiveHighlighter: Buffer state - length: ${commandBufferRef.current.length}, contains command: ${
      commandBufferRef.current.includes('[HIGHLIGHT') || commandBufferRef.current.includes('[CIRCLE')
    }`);

    // Log a snippet of the buffer
    if (commandBufferRef.current.length > 0) {
      console.log(`Buffer snippet: "${commandBufferRef.current.slice(0, 50)}${commandBufferRef.current.length > 50 ? '...' : ''}"`);
    }
  };
  
  // Listen for annotation commands in AI output stream - optimized for memory
  useEffect(() => {
    if (!isActive) return;
    
    console.log("LiveHighlighter: Setting up event listener");
    
    // Event handler function - with throttling to prevent excessive processing
    const handleAiResponse = (event: Event) => {
      const metrics = metricsRef.current;
      metrics.totalEvents++;
      
      // Only process every other event or if sufficient time has passed (50ms)
      // Reduced throttling further to ensure we catch more annotation commands
      const now = Date.now();
      if (metrics.totalEvents % 2 !== 0 && now - metrics.lastProcessTime < 50) {
        metrics.skippedEvents++;
        return;
      }
      
      // Update last process time
      metrics.lastProcessTime = now;
      metrics.processedEvents++;
      
      try {
        // Get the text chunk from the event
        const customEvent = event as CustomEvent;
        const chunk = customEvent.detail?.text || "";
        const currentStreamId = customEvent.detail?.streamId;
        
        // If this is a new stream, clear the buffer
        if (currentStreamId && streamIdRef.current !== currentStreamId) {
          console.log(`LiveHighlighter: New stream detected. Clearing buffer.`);
          commandBufferRef.current = '';
          textBufferRef.current = '';
          streamIdRef.current = currentStreamId;
        }
        
        if (!chunk) return;
        
        // Log raw chunk for debugging (only first 100 chars)
        console.log(`LiveHighlighter: Raw chunk received (${chunk.length} chars): "${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}"`);
        
        // Append this chunk to our buffer to handle commands that might be split across chunks
        textBufferRef.current += chunk;
        commandBufferRef.current += chunk;
        
        // Keep the buffers at reasonable sizes
        if (textBufferRef.current.length > 5000) {
          textBufferRef.current = textBufferRef.current.slice(-5000);
        }
        
        if (commandBufferRef.current.length > 3000) {
          commandBufferRef.current = commandBufferRef.current.slice(-3000);
        }
        
        // Now process the combined buffer
        const combinedText = commandBufferRef.current;
        
        // Log buffer state periodically
        if (metrics.totalEvents % 10 === 0) {
          logBufferState();
        }
        
        // More flexible check - look for any part of highlight or circle commands
        if (!combinedText.includes('[HIGH') && 
            !combinedText.includes('HIGHLIGHT') && 
            !combinedText.includes('[CIRC') &&
            !combinedText.includes('CIRCLE')) {
          return;
        }
        
        // Track event count (limit to avoid memory leak from state updates)
        if (metrics.processedEvents % 5 === 0) {
          setEventCount(prev => Math.min(prev + 1, 100));
        }
        
        // Look for annotation commands with limit - use the combined buffer
        const { annotations } = parseAnnotationCommands(combinedText, currentPage);
        
        // Add any found annotations (with limits)
        if (annotations && annotations.length > 0) {
          metrics.annotationsFound += annotations.length;
          console.log(`LiveHighlighter: Found ${annotations.length} annotations in chunk`);
          
          // Limit to 5 annotations per chunk to prevent overload (increased from 3)
          const limitedAnnotations = annotations.slice(0, 5);
          
          // For current page annotations, batch them together
          const currentPageAnnotations: Annotation[] = [];
          
          // Process each annotation
          for (let i = 0; i < limitedAnnotations.length; i++) {
            const annotation = limitedAnnotations[i];
            if (annotation.page === currentPage) {
              // Collect current page annotations for batch processing
              currentPageAnnotations.push(annotation);
            } else {
              // For other pages, store for later (with limit)
              if (pendingAnnotationsRef.current.length < 30) {
                pendingAnnotationsRef.current.push(annotation);
              } else {
                // Replace oldest annotation if we're at the limit
                pendingAnnotationsRef.current.shift();
                pendingAnnotationsRef.current.push(annotation);
              }
            }
          }
          
          // Process current page annotations as a batch if we have any
          if (currentPageAnnotations.length > 0) {
            console.log(`LiveHighlighter: Adding ${currentPageAnnotations.length} annotations for current page`);
            
            // Log each annotation for debugging
            currentPageAnnotations.forEach(annotation => {
              logAnnotation(annotation);
            });
            
            // Add the annotations to the PDF
            onAnnotationAdd(currentPageAnnotations);
          }
          
          // Clear processed commands from the buffer if we found annotations
          // but keep any partial commands at the end
          if (combinedText.includes(']')) {
            const lastBracketIndex = combinedText.lastIndexOf(']');
            commandBufferRef.current = combinedText.substring(lastBracketIndex + 1);
          }
        }
        
        // Only check for navigation every few events to reduce overhead
        if (metrics.processedEvents % 2 === 0) {
          // Check for navigation commands
          const navigation = extractNavigationCues(chunk, currentPage);
          if (navigation.hasNavigation && navigation.targetPage !== null && 
              onPageChange && navigation.targetPage !== currentPage) {
            
            // Clear any previous pending navigation
            if (pendingNavigation?.timeoutId) {
              clearTimeout(pendingNavigation.timeoutId);
            }
            
            // Set up navigation with delay
            const timeoutId = setTimeout(() => {
              if (navigation.targetPage !== null) {
                onPageChange(navigation.targetPage);
                setPendingNavigation(null);
              }
            }, navigation.delayMs);
            
            setPendingNavigation({
              page: navigation.targetPage,
              timeoutId
            });
          }
        }
      } catch (error) {
        console.error("LiveHighlighter: Error processing event", error);
      }
    };
    
    // Register the event listener
    window.addEventListener('ai-response-chunk', handleAiResponse);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('ai-response-chunk', handleAiResponse);
      
      if (pendingNavigation?.timeoutId) {
        clearTimeout(pendingNavigation.timeoutId);
      }
      
      // Log metrics for debugging
      console.log("LiveHighlighter metrics:", metricsRef.current);
    };
  }, [isActive, currentPage, onAnnotationAdd, onPageChange, pendingNavigation]);
  
  // Process pending annotations when the page changes - with limits
  useEffect(() => {
    // Only process annotations for the current page - without creating additional arrays
    const applicableAnnotations: Annotation[] = [];
    const pendingAnnotations = pendingAnnotationsRef.current;
    
    if (pendingAnnotations.length === 0) return;
    
    // Find annotations for current page (limit to 10 max)
    for (let i = 0; i < pendingAnnotations.length; i++) {
      const anno = pendingAnnotations[i];
      if (anno.page === currentPage) {
        applicableAnnotations.push(anno);
        if (applicableAnnotations.length >= 10) break;
      }
    }
    
    if (applicableAnnotations.length > 0) {
      // Process in batches to prevent UI freezes
      setTimeout(() => {
        onAnnotationAdd(applicableAnnotations);
      }, 100);
      
      // Remove processed annotations
      pendingAnnotationsRef.current = pendingAnnotations.filter(
        anno => anno.page !== currentPage
      );
      
      // Limit total stored annotations
      if (pendingAnnotationsRef.current.length > 30) {
        pendingAnnotationsRef.current = pendingAnnotationsRef.current.slice(-30);
      }
    }
  }, [currentPage, onAnnotationAdd]);
  
  // Minimal UI - just show navigation indicator
  return pendingNavigation ? (
    <div className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white px-3 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm animate-pulse">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      Navigating to page {pendingNavigation.page}...
    </div>
  ) : null;
}