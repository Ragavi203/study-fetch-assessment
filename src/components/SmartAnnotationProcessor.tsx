"use client";
import { useEffect, useRef, useCallback } from 'react';
import { Annotation } from '@/types/types';
import { annotationEngine } from '@/lib/annotationEngine';

interface SmartAnnotationProcessorProps {
  onAnnotationAdd: (annotations: Annotation[]) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
  totalPages: number;
  isActive?: boolean;
}

export function SmartAnnotationProcessor({
  onAnnotationAdd,
  onPageChange,
  currentPage,
  totalPages,
  isActive = true
}: SmartAnnotationProcessorProps) {
  const streamBufferRef = useRef<string>('');
  const currentStreamIdRef = useRef<string | null>(null);
  const processedCommandsRef = useRef<Set<string>>(new Set());

  // Process streaming AI response chunks
  const processStreamChunk = useCallback((chunk: string, streamId?: string) => {
    if (!isActive) return;

    // Reset for new streams
    if (streamId && currentStreamIdRef.current !== streamId) {
      streamBufferRef.current = '';
      currentStreamIdRef.current = streamId;
      processedCommandsRef.current.clear();
      console.log(`SmartAnnotationProcessor: New stream ${streamId} started`);
    }

    // Process the chunk
    const result = annotationEngine.processStreamChunk(chunk, streamId);
    
    if (result.hasCommands) {
      console.log(`SmartAnnotationProcessor: Found ${result.annotations.length} annotations in chunk`);
      
      // Filter out already processed annotations
      const newAnnotations = result.annotations.filter(annotation => {
        const key = `${annotation.type}-${annotation.page}-${annotation.x}-${annotation.y}`;
        if (processedCommandsRef.current.has(key)) {
          return false;
        }
        processedCommandsRef.current.add(key);
        return true;
      });

      if (newAnnotations.length > 0) {
        onAnnotationAdd(newAnnotations);
      }
    }

    // Check for navigation commands
    const navigation = annotationEngine.parseNavigationCommands(chunk, currentPage);
    if (navigation.hasNavigation && navigation.targetPage !== null) {
      const clampedPage = Math.max(1, Math.min(navigation.targetPage, totalPages));
      if (clampedPage !== currentPage) {
        console.log(`SmartAnnotationProcessor: Navigating to page ${clampedPage}`);
        setTimeout(() => onPageChange(clampedPage), 500);
      }
    }
  }, [isActive, onAnnotationAdd, onPageChange, currentPage, totalPages]);

  // Process complete AI responses (non-streaming)
  const processCompleteResponse = useCallback((text: string) => {
    if (!isActive) return;

    const result = annotationEngine.parseAnnotationCommands(text, currentPage);
    
    if (result.annotations.length > 0) {
      console.log(`SmartAnnotationProcessor: Found ${result.annotations.length} annotations in complete response`);
      onAnnotationAdd(result.annotations);
    }

    // Check for navigation
    const navigation = annotationEngine.parseNavigationCommands(text, currentPage);
    if (navigation.hasNavigation && navigation.targetPage !== null) {
      const clampedPage = Math.max(1, Math.min(navigation.targetPage, totalPages));
      if (clampedPage !== currentPage) {
        console.log(`SmartAnnotationProcessor: Navigating to page ${clampedPage}`);
        setTimeout(() => onPageChange(clampedPage), 500);
      }
    }
  }, [isActive, onAnnotationAdd, onPageChange, currentPage, totalPages]);

  // Generate fallback annotation when AI doesn't provide specific commands
  const generateFallbackAnnotation = useCallback((textHint?: string) => {
    if (!isActive) return;

    const fallback = annotationEngine.generateFallbackAnnotation(currentPage, textHint);
    console.log('SmartAnnotationProcessor: Generated fallback annotation');
    onAnnotationAdd([fallback]);
  }, [isActive, currentPage, onAnnotationAdd]);

  // Listen for AI response events
  useEffect(() => {
    if (!isActive) return;

    // Handle streaming chunks
    const handleStreamChunk = (event: CustomEvent) => {
      const { text, streamId } = event.detail;
      processStreamChunk(text, streamId);
    };

    // Handle complete responses
    const handleCompleteResponse = (event: CustomEvent) => {
      const { text } = event.detail;
      processCompleteResponse(text);
    };

    // Handle fallback requests
    const handleFallbackRequest = (event: CustomEvent) => {
      const { textHint } = event.detail;
      generateFallbackAnnotation(textHint);
    };

    // Add event listeners
    window.addEventListener('ai-response-chunk', handleStreamChunk as EventListener);
    window.addEventListener('ai-response-complete', handleCompleteResponse as EventListener);
    window.addEventListener('ai-annotation-fallback', handleFallbackRequest as EventListener);

    return () => {
      window.removeEventListener('ai-response-chunk', handleStreamChunk as EventListener);
      window.removeEventListener('ai-response-complete', handleCompleteResponse as EventListener);
      window.removeEventListener('ai-annotation-fallback', handleFallbackRequest as EventListener);
    };
  }, [isActive, processStreamChunk, processCompleteResponse, generateFallbackAnnotation]);

  // Expose methods for manual processing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).smartAnnotationProcessor = {
        processChunk: processStreamChunk,
        processComplete: processCompleteResponse,
        generateFallback: generateFallbackAnnotation,
        isActive
      };
    }
  }, [processStreamChunk, processCompleteResponse, generateFallbackAnnotation, isActive]);

  // This component doesn't render anything visible
  return null;
}

export default SmartAnnotationProcessor;