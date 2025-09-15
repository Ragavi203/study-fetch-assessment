"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Annotation } from '@/types/types';
import * as pdfjsLib from 'pdfjs-dist';
import ChatHistoryManager from './ChatHistoryManager';
import AutoNavigator from './AutoNavigator';
import EnhancedSpeech from './EnhancedSpeech';
import LiveHighlighter from './LiveHighlighter';
import { cleanResponseText } from '@/lib/chatUtils';
import { parseAnnotationCommands, extractNavigationCues, synthesizeFallbackAnnotation, extractHeuristicAnnotations } from '@/lib/annotationUtils';
import { annotationEngine } from '@/lib/annotationEngine';
import { setDebugMode, logAnnotation, logError } from '@/lib/debugUtils';

interface ChatBoxProps {
  pdfUrl: string;
  pdfId?: string;
  onAnnotation: (annotations: Annotation[]) => void;
  token: string | null;
  onPageChange: (pageNum: number) => void;
  currentPage: number;
  totalPages: number;
  initialPdfText?: string; // Optional initial PDF text to use
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  annotations?: Annotation[];
  streaming?: boolean; // Flag for messages that are currently streaming
  error?: boolean; // Flag for messages that failed with an error
}

export default function ChatBox({
  pdfUrl,
  pdfId,
  onAnnotation,
  token,
  onPageChange,
  currentPage,
  totalPages,
  initialPdfText,
}: ChatBoxProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pdfText, setPdfText] = useState<string>(
    initialPdfText && initialPdfText.length > 0 
      ? initialPdfText 
      : "Loading PDF content..."
  );
  
  // DIRECT FIX: If we have a text extraction counter element, grab that text and use it
  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Check if debug element exists which shows text was extracted
      const debugEl = document.getElementById('pdf-text-debug');
      if (debugEl && debugEl.textContent && debugEl.textContent.includes('PDF text extracted:')) {
        console.log("📌 DIRECT FIX: Found text extraction indicator, fetching text from document");
        
        // Get text from all possible sources
        try {
          // Try global variable first
          if (typeof window !== 'undefined' && (window as any).currentPageText) {
            console.log(`📌 Using global text: ${(window as any).currentPageText.length} chars`);
            setPdfText((window as any).currentPageText);
          }
          // Try DOM attributes
          else {
            const containers = document.querySelectorAll('[data-pdf-text]');
            if (containers.length > 0) {
              const textContent = containers[0].getAttribute('data-pdf-text');
              if (textContent) {
                console.log(`📌 Using DOM attribute text: ${textContent.length} chars`);
                setPdfText(textContent);
                // Also restore it to global for API access
                if (typeof window !== 'undefined') {
                  (window as any).currentPageText = textContent;
                }
              }
            }
          }
        } catch (e) {
          console.error("Error in direct fix:", e);
        }
      }
    }
  }, []);
  const [historyStatus, setHistoryStatus] = useState<{
    status: 'loading' | 'success' | 'error' | 'idle';
    message?: string;
  }>({ status: 'idle' });

  // Voice recognition setup
  useEffect(() => {
    let recognition: any = null;
    
    if ('webkitSpeechRecognition' in window) {
      recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map(result => result.transcript)
          .join('');
        
        setInput(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
      };
    }

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, []);

  // Track if speech synthesis is active
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  // Enable debug mode in development
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      setDebugMode(true);
    }
  }, []);
  
  // Update pdfText when initialPdfText changes
  useEffect(() => {
    if (initialPdfText && initialPdfText.length > 0) {
      console.log('ChatBox: Using initialPdfText with', initialPdfText.length, 'characters');
      setPdfText(initialPdfText);
      
      // Also store in all possible places for redundancy
      if (typeof window !== 'undefined') {
        (window as any).currentPageText = initialPdfText;
        try {
          // Store in localStorage for persistence across page refreshes
          localStorage.setItem('pdf_current_text', initialPdfText);
          // Also store in sessionStorage
          sessionStorage.setItem(`pdf_text_page_${currentPage}`, initialPdfText);
          sessionStorage.setItem('pdf_text_last_updated', Date.now().toString());
        } catch (e) {
          console.warn('Could not store PDF text in storage:', e);
        }
        
        // Add to DOM for emergency fallback access
        try {
          const container = document.querySelector('.chat-container, .ai-chat-container');
          if (container) {
            container.setAttribute('data-pdf-text', initialPdfText.substring(0, 5000)); // Limit size for DOM
          }
        } catch (e) {
          console.warn('Could not store PDF text in DOM:', e);
        }
        
        // Also dispatch an event to notify other components
        window.dispatchEvent(new CustomEvent('pdf-text-extracted', { 
          detail: { 
            text: initialPdfText, 
            page: currentPage,
            source: 'initialPdfText'
          } 
        }));
      }
    }
  }, [initialPdfText, currentPage]);
  
  // Listen for PDF text extraction events from CleanPDFViewer
  useEffect(() => {
    const handlePDFTextExtracted = (event: CustomEvent) => {
      if (event.detail && event.detail.text) {
        console.log('📬 ChatBox: Received extracted text from PDF viewer', 
          event.detail.text.length, 'characters for page', event.detail.page);
        setPdfText(event.detail.text);
        
        // Store in a session variable for persistence
        try {
          sessionStorage.setItem(`pdf_text_page_${event.detail.page}`, event.detail.text);
          sessionStorage.setItem('pdf_text_last_updated', Date.now().toString());
        } catch (e) {
          console.warn('Could not store PDF text in session storage:', e);
        }
        
        // Provide visual feedback that text was received
        console.log('🧠 PDF text received - AI should now be able to analyze content');
        
        // Flash a subtle indicator
        const container = document.querySelector('.chat-container');
        if (container) {
          const indicator = document.createElement('div');
          indicator.className = 'pdf-text-indicator';
          indicator.textContent = `PDF text received: ${event.detail.text.length} chars`;
          indicator.style.position = 'absolute';
          indicator.style.bottom = '10px';
          indicator.style.right = '10px';
          indicator.style.backgroundColor = 'rgba(52, 152, 219, 0.8)';
          indicator.style.color = 'white';
          indicator.style.padding = '4px 8px';
          indicator.style.borderRadius = '4px';
          indicator.style.fontSize = '12px';
          indicator.style.opacity = '0';
          indicator.style.transition = 'opacity 0.3s';
          container.appendChild(indicator);
          
          // Fade in
          setTimeout(() => {
            indicator.style.opacity = '1';
          }, 100);
          
          // Fade out and remove
          setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
              try {
                container.removeChild(indicator);
              } catch (e) {}
            }, 300);
          }, 3000);
        }
      }
    };
    
    // Add event listener
    window.addEventListener('pdf-text-extracted', handlePDFTextExtracted as EventListener);
    
    // Multiple checks for text availability through different sources
    const checkForPDFText = () => {
      // First check if we already have the text from cache
      if (typeof window !== 'undefined' && 
          (window as any).pdfTextCache && 
          (window as any).pdfTextCache[`${pdfUrl}_${currentPage}`]) {
        const cachedText = (window as any).pdfTextCache[`${pdfUrl}_${currentPage}`];
        console.log('📦 ChatBox: Found text in pdfTextCache,', 
          cachedText.length, 'characters for page', currentPage);
        setPdfText(cachedText);
        return true;
      }
      
      // Then check the global variable
      if (typeof window !== 'undefined' && (window as any).currentPageText) {
        const globalText = (window as any).currentPageText;
        console.log('🌐 ChatBox: Found text in window.currentPageText,', 
          globalText.length, 'characters');
        setPdfText(globalText);
        return true;
      }
      
      // Finally check session storage
      try {
        const sessionText = sessionStorage.getItem(`pdf_text_page_${currentPage}`);
        if (sessionText) {
          console.log('💾 ChatBox: Found text in sessionStorage,', 
            sessionText.length, 'characters for page', currentPage);
          setPdfText(sessionText);
          return true;
        }
      } catch (e) {
        console.warn('Could not access session storage:', e);
      }
      
      // If we have initialPdfText, use it as a last resort
      if (initialPdfText && initialPdfText.length > 10) {
        console.log('♻️ ChatBox: Using initialPdfText,', 
          initialPdfText.length, 'characters');
        setPdfText(initialPdfText);
        return true;
      }
      
      return false;
    };
    
    // Try to get text immediately
    if (!checkForPDFText()) {
      console.log('⏳ ChatBox: No PDF text found initially, will check again later');
    }
    
    // Check periodically in case the text becomes available later
    const timeoutIds = [
      setTimeout(checkForPDFText, 500),
      setTimeout(checkForPDFText, 2000),
      setTimeout(checkForPDFText, 5000),
    ];
    
    // Cleanup
    return () => {
      window.removeEventListener('pdf-text-extracted', handlePDFTextExtracted as EventListener);
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [pdfUrl, currentPage, initialPdfText]);
  
  // Cancel any ongoing speech when component unmounts
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleVoiceRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      // Use existing instance or create a new one
      if (!recognitionRef.current) {
        recognitionRef.current = new (window as any).webkitSpeechRecognition() || 
                                new (window as any).SpeechRecognition();
        
        // Configure recognition options
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US'; // Can be made configurable later
        
        // Set up event handlers
        recognitionRef.current.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map(result => result.transcript)
            .join(' ');
          
          // Update with visual feedback as words are recognized
          setInput(transcript);
        };
        
        recognitionRef.current.onstart = () => {
          console.log('Speech recognition started');
          setIsListening(true);
          
          // Visual feedback that we're listening
          // Play a subtle sound to indicate start of listening
          const audio = new Audio('/audio/listening-start.mp3');
          audio.volume = 0.3;
          audio.play().catch(err => console.log('Audio play failed:', err));
        };
        
        recognitionRef.current.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
        };
        
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          
          // Handle specific errors with user-friendly messages
          let errorMsg = 'Voice recognition failed. Please try again.';
          if (event.error === 'not-allowed') {
            errorMsg = 'Please allow microphone access to use voice input.';
          } else if (event.error === 'network') {
            errorMsg = 'Network error occurred. Please check your connection.';
          }
          
          // Display error in UI rather than alert
          alert(errorMsg);
        };
      }
      
      if (!isListening) {
        try {
          // Stop speech synthesis when starting to listen
          if ('speechSynthesis' in window && isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
          }
          
          recognitionRef.current.start();
        } catch (error) {
          console.error('Speech recognition error:', error);
          alert('Failed to start voice recognition. Please try again.');
        }
      } else {
        // Manually end recognition and auto-submit if we have content
        recognitionRef.current.stop();
        
        // Optional: auto-submit after short delay if input is not empty
        if (input.trim().length > 0) {
          setTimeout(() => {
            const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
            document.querySelector('form')?.dispatchEvent(submitEvent);
          }, 1000);
        }
      }
    } else {
      alert('Voice recognition is not supported in your browser. Please try Chrome, Edge, or Safari.');
    }
  };
  
  // Speech handling is now done by the EnhancedSpeech component

  // We now use the splitIntoSpeechChunks function from chatUtils

  const extractPageText = async (pageNum: number) => {
    if (!pdfUrl) return '';
    try {
      // First try to use our direct extraction method that's more reliable
      try {
        const { extractPDFText } = await import('@/lib/pdfDirectUtils');
        console.log(`Using direct PDF text extraction for page ${pageNum}`);
        const text = await extractPDFText(pdfUrl, pageNum);
        
        if (text && text.length > 0) {
          console.log(`Successfully extracted ${text.length} characters with direct extractor`);
          return text;
        } else {
          console.warn(`No text extracted directly from page ${pageNum} - trying alternative method`);
        }
      } catch (directError) {
        console.warn('Direct text extraction failed:', directError);
      }
      
      // Fall back to standard PDF.js method
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const textItems = textContent.items.map((item: any) => ({
        text: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
      }));
      
      textItems.sort((a: { x: number; y: number }, b: { x: number; y: number }) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) < 5) {
          return a.x - b.x;
        }
        return yDiff;
      });
      
      const extractedText = textItems
        .map((item: { text: string }) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
        
      if (!extractedText || extractedText.length === 0) {
        // Handle scanned documents by providing a meaningful message
        console.warn('No text content found on page - may be a scanned document');
        return "This appears to be a scanned or image-based PDF. Text cannot be automatically extracted. You can still ask questions about what you can see in the document.";
      }
      
      return extractedText;
    } catch (error) {
      console.error('Error extracting text:', error);
      
      // Return a more helpful message based on the error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('password')) {
        return "This PDF is password protected and cannot be analyzed.";
      } else if (errorMessage.includes('timeout')) {
        return "The PDF processing timed out. This document may be too large or complex.";
      } else {
        return "There was an error extracting text from this PDF. You can still ask questions about what you can see in the document.";
      }
    }
  };

  // Extract text content with position data for accurate annotations
  const extractPageTextWithPositions = async (pageNum: number) => {
    if (!pdfUrl) return { text: '', positions: [] };
    
    try {
      // First check if we have the text already in pdfText state
      if (pdfText && pdfText !== "Loading PDF content..." && pageNum === currentPage) {
        console.log(`Using pdfText from state (${pdfText.length} characters)`);
        
        // Create a simplified position object since we don't have detailed position data
        const mockPositions = [{
          text: pdfText,
          x: 0,
          y: 0,
          width: 612, // Standard PDF width in points
          height: 792, // Standard PDF height in points
          fontSize: 12,
          pageWidth: 612,
          pageHeight: 792
        }];
        
        return { 
          text: pdfText, 
          positions: mockPositions,
          pageWidth: 612,
          pageHeight: 792
        };
      }
      
      // Next check if we already have the text from the window global
      if (typeof window !== 'undefined' && (window as any).currentPageText && pageNum === currentPage) {
        const cachedText = (window as any).currentPageText;
        console.log(`Using cached text from window.currentPageText (${cachedText.length} characters)`);
        
        // Create a simplified position object since we don't have detailed position data
        const mockPositions = [{
          text: cachedText,
          x: 0,
          y: 0,
          width: 612, // Standard PDF width in points
          height: 792, // Standard PDF height in points
          fontSize: 12,
          pageWidth: 612,
          pageHeight: 792
        }];
        
        return { 
          text: cachedText, 
          positions: mockPositions,
          pageWidth: 612,
          pageHeight: 792
        };
      }
      
      // Otherwise try to use our direct extraction method that doesn't rely on components
      try {
        // Import dynamically to avoid server-side issues
        const { extractPDFText } = await import('@/lib/pdfDirectUtils');
        
        console.log(`Using direct PDF text extraction for page ${pageNum}`);
        const text = await extractPDFText(pdfUrl, pageNum);
        
        if (text && text.length > 0) {
          // Create a simplified position object since we don't have detailed position data
          const mockPositions = [{
            text: text,
            x: 0,
            y: 0,
            width: 612, // Standard PDF width in points
            height: 792, // Standard PDF height in points
            fontSize: 12,
            pageWidth: 612,
            pageHeight: 792
          }];
          
          console.log(`Successfully extracted ${text.length} characters from page ${pageNum} with direct extractor`);
          
          return { 
            text: text, 
            positions: mockPositions,
            pageWidth: 612,
            pageHeight: 792
          };
        } else {
          console.warn(`No text extracted from page ${pageNum} - may be a scanned document`);
        }
      } catch (directExtractError) {
        console.warn('Direct extraction failed, falling back to alternative methods:', directExtractError);
        // Continue to other extraction methods
      }
      
      // Try enhanced extraction as a fallback
      try {
        const { extractTextFromPDF } = await import('@/lib/pdfDebugUtils');
        
        console.log(`Using enhanced text extraction for page ${pageNum}`);
        const result = await extractTextFromPDF(pdfUrl, pageNum, { 
          includeAnnotations: true,
          fallbackToOCR: false // OCR not implemented yet
        });
        
        if (result.success && result.text) {
          // Create a simplified position object since we don't have detailed position data
          const mockPositions = [{
            text: result.text,
            x: 0,
            y: 0,
            width: 612, // Standard PDF width in points
            height: 792, // Standard PDF height in points
            fontSize: 12,
            pageWidth: 612,
            pageHeight: 792
          }];
          
          console.log(`Successfully extracted ${result.text.length} characters from page ${pageNum} with enhanced extractor`);
          
          return { 
            text: result.text, 
            positions: mockPositions,
            pageWidth: 612,
            pageHeight: 792
          };
        } else if (result.isScannedDocument) {
          console.warn(`Page ${pageNum} appears to be a scanned document - text extraction may be limited`);
        }
      } catch (enhancedExtractError) {
        console.warn('Enhanced extraction failed, falling back to standard extraction:', enhancedExtractError);
        // Continue to standard extraction
      }
      
      // Standard PDF.js extraction
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      
      // Get text items with position information
      const textItems = textContent.items.map((item: any) => ({
        text: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        width: item.width || 0,
        height: item.height || (item.transform[3] || 12), // Estimate height if not provided
        fontSize: item.fontSize || 12,
        pageWidth: viewport.width,
        pageHeight: viewport.height
      }));
      
      // Check if we actually got any text
      if (textItems.length === 0) {
        console.warn(`No text items found on page ${pageNum} - may be a scanned document`);
        return { 
          text: "This appears to be a scanned or image-based PDF. Text cannot be automatically extracted.",
          positions: [],
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          isScannedDocument: true
        };
      }
      
      // Sort text items by position (top to bottom, then left to right)
      textItems.sort((a: any, b: any) => {
        // Group lines of text
        const lineHeight = Math.max(a.fontSize, b.fontSize);
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) < lineHeight * 0.5) {
          return a.x - b.x; // Same line, sort by x position
        }
        return yDiff; // Different lines, sort by y position
      });
      
      // Generate plain text while preserving position data
      const plainText = textItems
        .map((item: any) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (plainText.length === 0) {
        console.warn(`Extracted text is empty for page ${pageNum} - may be a scanned document`);
        return { 
          text: "This PDF page contains no extractable text content. It may be a scanned or image-based document.",
          positions: textItems,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          isScannedDocument: true
        };
      }
        
      console.log(`Successfully extracted ${plainText.length} characters from page ${pageNum}`);
      return { 
        text: plainText, 
        positions: textItems,
        pageWidth: viewport.width,
        pageHeight: viewport.height
      };
    } catch (error) {
      console.error('Error extracting text with positions:', error);
      
      // Provide a more helpful error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        text: `There was an error extracting text from this PDF page. Error: ${errorMessage}`,
        positions: [], 
        pageWidth: 0, 
        pageHeight: 0,
        error: true
      };
    }
  };

  // Define navigation action types
  type ExactPageNavigation = { type: 'exactPage'; page: number };
  type RelativeNavigation = { type: 'relative'; offset: number };
  type PositionNavigation = { type: 'position'; position: string };
  type SectionNavigation = { type: 'section'; sectionType: string; sectionTitle: string };
  
  // Combined navigation action type
  type NavigationAction = 
    | ExactPageNavigation 
    | RelativeNavigation 
    | PositionNavigation 
    | SectionNavigation;
  
  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || !token || !pdfUrl) return;
    
    // Check if we should use non-streaming mode due to past connection errors or device conditions
    let useNonStreaming = false;
    try {
      // Check error count
      const prevErrors = localStorage.getItem('chat_connection_errors') || '0';
      const errorCount = parseInt(prevErrors, 10);
      const lastErrorTime = parseInt(localStorage.getItem('chat_connection_last_error') || '0', 10);
      
      // Reset error count if more than 1 hour since last error
      if (Date.now() - lastErrorTime > 60 * 60 * 1000) {
        localStorage.setItem('chat_connection_errors', '0');
        localStorage.removeItem('chat_connection_last_error');
        console.log("Chat connection error count reset due to time elapsed");
      } else {
        // Use non-streaming after 2 errors (reduced threshold for better reliability)
        useNonStreaming = errorCount >= 2;
        if (useNonStreaming) {
          console.log(`Switching to non-streaming mode due to previous errors (${errorCount} recent errors)`);
        }
      }
      
      // Check for battery status if available (modern browsers)
      if ('getBattery' in navigator) {
        try {
          const batteryManager = await (navigator as any).getBattery();
          // If battery is below 15% and not charging, use non-streaming to save power
          if (batteryManager.level < 0.15 && !batteryManager.charging) {
            useNonStreaming = true;
            console.log("Switching to non-streaming mode to save battery (low battery)");
          }
        } catch (batteryError) {
          console.log("Battery status check failed:", batteryError);
        }
      }
      
      // Check for reduced data mode (Save-Data header)
      if ('connection' in navigator && (navigator as any).connection) {
        const connection = (navigator as any).connection;
        if (connection.saveData) {
          useNonStreaming = true;
          console.log("Switching to non-streaming mode due to Save-Data preference");
        }
        
        // Also check for slow connections
        if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
          useNonStreaming = true;
          console.log("Switching to non-streaming mode due to slow connection");
        }
      }
      
      // Check for memory limitations - if we can access memory info
      if (window.performance && (performance as any).memory) {
        const memoryInfo = (performance as any).memory;
        if (memoryInfo && memoryInfo.jsHeapSizeLimit) {
          // If using more than 80% of available heap, switch to non-streaming
          const heapUsageRatio = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
          if (heapUsageRatio > 0.8) {
            useNonStreaming = true;
            console.log("Switching to non-streaming mode due to high memory usage");
          }
        }
      }
      
      // Show a notice if we're switching to non-streaming mode
      if (useNonStreaming) {
        console.log("Using non-streaming mode for better stability");
      }
    } catch (e) {
      console.error("Error checking for streaming mode conditions:", e);
    }
    
    // Enhanced page navigation commands with more natural language patterns
    const navigationCommands = [
      // Exact page number navigation
      {
        regex: /(?:go to|show|open|navigate to|jump to|view|display|see|find)\s+page\s+(\d+)/i,
        handler: (match: RegExpMatchArray): NavigationAction => {
          const requestedPage = parseInt(match[1], 10);
          return { type: 'exactPage', page: requestedPage };
        }
      },
      // Relative page navigation (next, previous)
      {
        regex: /(?:go to|show|open|navigate to|jump to|view|display|see)\s+(?:the\s+)?(next|previous|prev)\s+page/i,
        handler: (match: RegExpMatchArray): NavigationAction => {
          const direction = match[1].toLowerCase();
          if (direction === 'next') {
            return { type: 'relative', offset: 1 };
          } else {
            return { type: 'relative', offset: -1 };
          }
        }
      },
      // First or last page navigation
      {
        regex: /(?:go to|show|open|navigate to|jump to|view|display|see)\s+(?:the\s+)?(first|last)\s+page/i,
        handler: (match: RegExpMatchArray): NavigationAction => {
          const position = match[1].toLowerCase();
          return { type: 'position', position };
        }
      },
      // Section or heading navigation
      {
        regex: /(?:find|show|go to|navigate to|jump to)\s+(?:the\s+)?(section|chapter|heading|part)(?:\s+about|\s+on|\s+with|\s+titled)?\s+"?([^"]+)"?/i,
        handler: (match: RegExpMatchArray): NavigationAction => {
          const sectionType = match[1].toLowerCase();
          const sectionTitle = match[2].trim();
          return { type: 'section', sectionType, sectionTitle };
        }
      }
    ];
    
    // Check for navigation commands
    for (const command of navigationCommands) {
      const match = input.match(command.regex);
      
      if (match) {
        const navigationAction = command.handler(match);
        let targetPage = currentPage;
        let navigationMessage = '';
        
        // Process the navigation action
        if (navigationAction.type === 'exactPage') {
          const exactPageAction = navigationAction as ExactPageNavigation;
          if (exactPageAction.page >= 1 && exactPageAction.page <= totalPages) {
            targetPage = exactPageAction.page;
            navigationMessage = `I've navigated to page ${targetPage} for you.`;
          } else {
            navigationMessage = `Sorry, page ${exactPageAction.page} is out of range. The document has ${totalPages} pages.`;
          }
        } 
        else if (navigationAction.type === 'relative') {
          const relativeAction = navigationAction as RelativeNavigation;
          const newPage = currentPage + relativeAction.offset;
          if (newPage >= 1 && newPage <= totalPages) {
            targetPage = newPage;
            navigationMessage = `I've navigated to page ${targetPage} for you.`;
          } else {
            navigationMessage = `Sorry, I can't navigate ${relativeAction.offset > 0 ? 'forward' : 'backward'} from here.`;
          }
        }
        else if (navigationAction.type === 'position') {
          const positionAction = navigationAction as PositionNavigation;
          if (positionAction.position === 'first') {
            targetPage = 1;
            navigationMessage = `I've navigated to the first page for you.`;
          } else if (positionAction.position === 'last') {
            targetPage = totalPages;
            navigationMessage = `I've navigated to the last page (page ${totalPages}) for you.`;
          }
        }
        // Section navigation would require a lookup in available sections
        // This would be implemented when connected to PDFStructureMapper
        
        // Execute navigation if we have a valid target page
        if (targetPage !== currentPage && navigationMessage) {
          onPageChange(targetPage);
          const userMessage: ChatMessage = {
            role: "user",
            content: input,
            timestamp: new Date()
          };
          const assistantMessage: ChatMessage = {
            role: "assistant",
            content: navigationMessage,
            timestamp: new Date()
          };
          setMessages([...messages, userMessage, assistantMessage]);
          setInput("");
          return;
        }
      }
    }
    
    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: new Date()
    };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);
    
    // Add placeholder for assistant's response
    const placeholderMessage: ChatMessage = {
      role: "assistant",
      content: useNonStreaming ? "Loading response..." : "",
      timestamp: new Date(),
      streaming: !useNonStreaming // Mark as streaming only for streaming mode
    };
    
    setMessages([...newMessages, placeholderMessage]);
    
    try {
      if (!pdfUrl) {
        throw new Error('PDF URL is not available');
      }
      
      // Make sure we have the latest PDF text content before sending
    let pdfTextContent = "";
    
    // Check multiple sources to make sure we have PDF text
    if (typeof window !== 'undefined') {
      // Try the window global first (most recent)
      if ((window as any).currentPageText && (window as any).currentPageText.length > 50) {
        console.log(`Using window.currentPageText: ${(window as any).currentPageText.length} chars`);
        pdfTextContent = (window as any).currentPageText;
      }
      // Then check the cache
      else if ((window as any).pdfTextCache && (window as any).pdfTextCache[`${pdfUrl}_${currentPage}`]) {
        console.log(`Using cached text for page ${currentPage}: ${(window as any).pdfTextCache[`${pdfUrl}_${currentPage}`].length} chars`);
        pdfTextContent = (window as any).pdfTextCache[`${pdfUrl}_${currentPage}`];
      }
      // Then check localStorage
      else {
        try {
          const storedText = localStorage.getItem('pdf_current_text');
          if (storedText && storedText.length > 100) {
            console.log(`Using localStorage text: ${storedText.length} chars`);
            pdfTextContent = storedText;
          }
        } catch (e) {}
      }
    }
    
    console.log(`Sending message with ${pdfTextContent.length} chars of PDF text`);
    
    // If we're using non-streaming mode, use a different approach
    if (useNonStreaming) {
      try {
        console.log("Using non-streaming mode for chat request");
        
        // Extract text with position data for annotations
        const [previousPageData, currentPageData, nextPageData] = await Promise.all([
          currentPage > 1 ? extractPageTextWithPositions(currentPage - 1) : Promise.resolve({ text: '', positions: [], pageWidth: 0, pageHeight: 0 }),
          extractPageTextWithPositions(currentPage),
          currentPage < totalPages ? extractPageTextWithPositions(currentPage + 1) : Promise.resolve({ text: '', positions: [], pageWidth: 0, pageHeight: 0 })
        ]);
          
          // Limit text size to reduce token count
          const truncateText = (text: string, maxLength: number) => {
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
          };
          
          const pdfText = {
            current: truncateText(currentPageData.text, 1500),
            previous: currentPage > 1 ? truncateText(previousPageData.text, 300) : null,
            next: currentPage < totalPages ? truncateText(nextPageData.text, 300) : null,
            currentPage,
            totalPages,
            positions: {
              current: currentPageData.positions,
              previous: previousPageData.positions,
              next: nextPageData.positions,
            },
            pageWidth: currentPageData.pageWidth,
            pageHeight: currentPageData.pageHeight
          };
          
          // Make a regular POST request instead of streaming
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              messages: newMessages,
              pdfText,
              pdfId,
              currentPage,
              useStream: false
            }),
          });
          
          if (res.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
          }
          
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          
          const data = await res.json();
          
          // Process and clean up the response using enhanced engine
          let annotations: Annotation[] = [];
          let cleanedText = data.reply || "";
          
          try {
            // Parse annotations from the complete response
            const result = annotationEngine.parseAnnotationCommands(data.reply || "", currentPage);
            annotations = result.annotations || [];
            cleanedText = annotationEngine.cleanText(data.reply || "");
            
            // Dispatch complete response event
            window.dispatchEvent(new CustomEvent('ai-response-complete', {
              detail: { text: data.reply }
            }));
            
            // Apply annotations to the PDF
            if (annotations.length > 0) {
              onAnnotation(annotations.slice(0, 20)); // Limit to 20 annotations
            }
            
            // Handle navigation using enhanced engine
            const navigation = annotationEngine.parseNavigationCommands(data.reply || "", currentPage);
            if (navigation.hasNavigation && navigation.targetPage !== null) {
              const clampedPage = Math.max(1, Math.min(navigation.targetPage, totalPages));
              setTimeout(() => {
                onPageChange(clampedPage);
              }, 500);
            }
          } catch (parseError) {
            console.error("Error parsing non-streaming response:", parseError);
          }
          
          // Update the message with the complete response
          setMessages(prev => {
            const finalMessages = [...prev];
            const lastMessage = finalMessages[finalMessages.length - 1];
            lastMessage.content = cleanedText;
            lastMessage.annotations = annotations.slice(0, 20); // Limit stored annotations
            delete lastMessage.streaming;
            return finalMessages;
          });

          // Auto-save non-streaming response
          if (pdfId) {
            try {
              const assembled = [...newMessages, { role: 'assistant', content: cleanedText, annotations: annotations.slice(0,20) }];
              fetch('/api/chat/history/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
                body: JSON.stringify({ pdfId, messages: assembled })
              }).catch(e => console.warn('Non-stream auto-save failed', e));
            } catch (e) {
              console.warn('Non-stream auto-save exception', e);
            }
          }
          
          // Clear any stored error count on success
          try {
            localStorage.setItem('chat_connection_errors', '0');
          } catch (e) {
            console.error("Error clearing connection error count:", e);
          }
          
        } catch (error) {
          console.error("Error in non-streaming mode:", error);
          
          // Update UI with error state
          setMessages(prev => {
            const errorMessages = [...prev];
            const lastMessage = errorMessages[errorMessages.length - 1];
            lastMessage.content = "Sorry, there was an error processing your request. Please try again.";
            lastMessage.error = true;
            delete lastMessage.streaming;
            return errorMessages;
          });
        } finally {
          setInput("");
          setLoading(false);
        }
        
        // Exit early since we've handled the request
        return;
      }

      // Ensure we have the latest PDF text from all possible sources
      console.log("Getting most recent PDF text for AI processing");
      
      // Check for window global text first (most recent)
      let cachedCurrentPageText = '';
      if (typeof window !== 'undefined') {
        if ((window as any).currentPageText && (window as any).currentPageText.length > 50) {
          console.log(`Using window.currentPageText: ${(window as any).currentPageText.length} chars`);
          cachedCurrentPageText = (window as any).currentPageText;
        }
        // Then check the cache
        else if ((window as any).pdfTextCache && (window as any).pdfTextCache[`${pdfUrl}_${currentPage}`]) {
          console.log(`Using cached text for page ${currentPage}: ${(window as any).pdfTextCache[`${pdfUrl}_${currentPage}`].length} chars`);
          cachedCurrentPageText = (window as any).pdfTextCache[`${pdfUrl}_${currentPage}`];
        }
      }
      
      // Try to get text from ALL possible sources
      const bestTextContent = await (async () => {
        let bestText = cachedCurrentPageText;
        
        // Try all possible sources to get the richest text content
        if (typeof window !== 'undefined') {
          // Global variable (most up to date)
          if ((window as any).currentPageText && 
              (window as any).currentPageText.length > bestText.length) {
            bestText = (window as any).currentPageText;
            console.log(`Found better text in global: ${bestText.length} chars`);
          }
          
          // Try localStorage
          try {
            const stored = localStorage.getItem('pdf_current_text');
            if (stored && stored.length > bestText.length) {
              bestText = stored;
              console.log(`Found better text in localStorage: ${bestText.length} chars`);
            }
          } catch (e) {}
          
          // Try DOM
          try {
            const chatContainer = document.querySelector('.ai-chat-container');
            if (chatContainer && chatContainer.getAttribute('data-pdf-text')) {
              const domText = chatContainer.getAttribute('data-pdf-text') || '';
              if (domText.length > bestText.length) {
                bestText = domText;
                console.log(`Found better text in DOM: ${bestText.length} chars`);
              }
            }
          } catch (e) {}
        }
        
        return bestText;
      })();
      
      // Extract text with position data for accurate annotations (with cached text fallback)
      const [previousPageData, currentPageData, nextPageData] = await Promise.all([
        currentPage > 1 ? extractPageTextWithPositions(currentPage - 1) : Promise.resolve({ text: '', positions: [], pageWidth: 0, pageHeight: 0 }),
        extractPageTextWithPositions(currentPage).then(data => {
          // Use the best text we've found if it's better than what was extracted
          if (bestTextContent.length > 0 && (!data.text || data.text.length < bestTextContent.length)) {
            console.log(`Using best available text (${bestTextContent.length} chars) instead of extracted text (${data.text?.length || 0} chars)`);
            return { ...data, text: bestTextContent };
          }
          return data;
        }),
        currentPage < totalPages ? extractPageTextWithPositions(currentPage + 1) : Promise.resolve({ text: '', positions: [], pageWidth: 0, pageHeight: 0 })
      ]);
      
      // Limit text size to reduce token count
      const truncateText = (text: string, maxLength: number) => {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
      };

      // EMERGENCY FIX: Check for direct text from DOM or debug element
      let emergencyText = '';
      try {
        if (typeof document !== 'undefined') {
          // Check if we have text in the debug element
          const debugEl = document.getElementById('pdf-text-debug');
          if (debugEl && debugEl.textContent && debugEl.textContent.includes('chars for page')) {
            // Try to get text from all sources
            if (typeof window !== 'undefined' && (window as any).currentPageText) {
              emergencyText = (window as any).currentPageText;
              console.log(`🚨 EMERGENCY: Using global text: ${emergencyText.length} chars`);
            } else {
              // Try DOM elements with data attributes
              const containers = document.querySelectorAll('[data-pdf-text]');
              if (containers.length > 0) {
                const textContent = containers[0].getAttribute('data-pdf-text');
                if (textContent) {
                  emergencyText = textContent;
                  console.log(`🚨 EMERGENCY: Using DOM attribute text: ${emergencyText.length} chars`);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Error in emergency text extraction:", e);
      }

      // Use emergency text if available and better than what we have
      if (emergencyText && (!currentPageData.text || emergencyText.length > currentPageData.text.length)) {
        console.log(`🚨 USING EMERGENCY TEXT: ${emergencyText.length} chars instead of ${currentPageData.text?.length || 0} chars`);
        currentPageData.text = emergencyText;
      }
      
      // If we see an essay/reflection in the content, add a special marker
      if (currentPageData.text && (
          currentPageData.text.toLowerCase().includes('reflection') ||
          currentPageData.text.toLowerCase().includes('essay') ||
          currentPageData.text.toLowerCase().includes('six sigma')
        )) {
        console.log("📝 Detected student essay/reflection, adding special handling");
        currentPageData.text = `[DOCUMENT TYPE: Student Essay/Reflection]\n${currentPageData.text}`;
      }

      const pdfText = {
        current: truncateText(currentPageData.text, 5000), // INCREASED SIZE for essay content
        previous: currentPage > 1 ? truncateText(previousPageData.text, 300) : null,
        next: currentPage < totalPages ? truncateText(nextPageData.text, 300) : null,
        currentPage,
        totalPages,
        // Include position data for more accurate annotations
        positions: {
          current: currentPageData.positions,
          previous: previousPageData.positions,
          next: nextPageData.positions,
        },
        pageWidth: currentPageData.pageWidth,
        pageHeight: currentPageData.pageHeight,
        documentType: currentPageData.text.toLowerCase().includes('reflection') ? 'essay' : 'general'
      };

      // Enable streaming for real-time annotations
      const streamingEnabled = true; // Make this configurable later if needed

          if (streamingEnabled) {
            // Setup for streaming response
            // First, create a temporary message ID for this stream
            const streamId = `stream-${Date.now()}`;
            
            // Store collecting annotations for the final message
            // Use a local variable instead of a hook inside a conditional
            const collectedAnnotations: Annotation[] = [];
            let collectedText = '';        try {
          // Create the initial stream request (this will return a stream URL)
          // Diagnostics: log payload size before initiating streaming
          try {
            console.log('[Diagnostics] Preparing streaming request', {
              streamId,
              messagesCount: newMessages.length,
              currentPage,
              pdfTextCurrentLength: (pdfText.current || '').length,
              pdfTextPrevLength: (pdfText.previous || '').length || 0,
              pdfTextNextLength: (pdfText.next || '').length || 0,
              totalPages: pdfText.totalPages,
            });
          } catch (diagErr) {
            console.warn('Diagnostics logging failed', diagErr);
          }

          const streamRes = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              messages: newMessages,
              pdfText,
              pdfId,
              currentPage,
              streamId
            }),
          });
          
          if (streamRes.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
          }
          
          const streamData = await streamRes.json();
          
          if (streamRes.ok && streamData.streamUrl) {
            // Connect to the streaming endpoint with error handling
            let eventSource: EventSource;
            try {
              console.log("ChatBox: Connecting to SSE stream:", streamData.streamUrl);
              
              // Use a timeout to handle connection failures
              const connectionTimeout = setTimeout(() => {
                console.error("ChatBox: SSE connection timed out");
                
                // Update UI with error state
                setMessages(prev => {
                  const errorMessages = [...prev];
                  const lastMessage = errorMessages[errorMessages.length - 1];
                  if (lastMessage && (lastMessage as any).streaming) {
                    lastMessage.content = "Connection timed out. Please try again with a shorter question.";
                    (lastMessage as any).error = true;
                    delete (lastMessage as any).streaming;
                  }
                  return errorMessages;
                });
                
                setLoading(false);
                
                // Clean up any partial connection
                try {
                  if (eventSource) eventSource.close();
                } catch (e) {
                  console.error("Error closing timed out EventSource:", e);
                }
              }, 5000); // 5 second timeout
              
              // Create the event source with simplified error handling
              eventSource = new EventSource(streamData.streamUrl);
              
              // Track connection status for debugging
              eventSource.onopen = () => {
                console.log("ChatBox: SSE connection opened successfully");
                
                // Connection successful, clear the timeout
                clearTimeout(connectionTimeout);
                
                // Dispatch a heartbeat event that ConnectionManager can listen for
                window.dispatchEvent(new Event('sse-heartbeat'));
              };
            } catch (error) {
              console.error("ChatBox: Failed to create EventSource:", error);
              
              // Update UI with error state
              setMessages(prev => {
                const errorMessages = [...prev];
                const lastMessage = errorMessages[errorMessages.length - 1];
                if (lastMessage && (lastMessage as any).streaming) {
                  lastMessage.content = "Failed to establish connection. Please try again later.";
                  (lastMessage as any).error = true;
                  delete (lastMessage as any).streaming;
                }
                return errorMessages;
              });
              
              setLoading(false);
              return;
            }
            
            // Track if we've completed
            let isComplete = false;
            let lastHeartbeat = Date.now();
            
            // Set up periodic heartbeats to detect if connection is still alive
            const heartbeatInterval = setInterval(() => {
              // If we haven't received a message in 10 seconds, the connection may be dead
              if (Date.now() - lastHeartbeat > 10000 && !isComplete) {
                console.warn("ChatBox: No SSE messages received for 10 seconds, connection may be stale");
                
                // Try to close and recreate the connection
                try {
                  eventSource.close();
                  
                  // Notify UI of connection issues
                  setMessages(prev => {
                    const updatedMessages = [...prev];
                    const lastMsg = updatedMessages[updatedMessages.length - 1];
                    if (!lastMsg) return updatedMessages; // safety guard
                    if ((lastMsg as any).streaming) {
                      lastMsg.content += "\n\n[Connection issues detected. Please wait...]";
                    }
                    return updatedMessages;
                  });
                  
                  // We don't auto-reconnect here as it could cause duplicate messages
                } catch (e) {
                  console.error("ChatBox: Error during stale connection cleanup:", e);
                }
              }
            }, 5000);
            
            // Use a more resilient message handling approach
            eventSource.onmessage = (event) => {
              // Update heartbeat timestamp
              lastHeartbeat = Date.now();
              
              // Dispatch a heartbeat event that ConnectionManager can listen for
              window.dispatchEvent(new Event('sse-heartbeat'));
              
              try {
                // Check if we have valid data
                if (!event.data) {
                  console.log("ChatBox: Empty event data received, skipping");
                  return;
                }
                
                // Try to parse the JSON data with error handling
                let data;
                try {
                  data = JSON.parse(event.data);
                } catch (parseError) {
                  console.error("ChatBox: Failed to parse event data:", parseError, "Raw data:", event.data);
                  
                  // Show an error in the UI but don't interrupt the stream
                  setMessages(prev => {
                    const msgs = [...prev];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.streaming) {
                      lastMsg.content += "\n\n[Message parsing error. Continuing...]";
                    }
                    return msgs;
                  });
                  return;
                }
                
                if (!data || !data.type) {
                  console.log("ChatBox: Invalid data format received:", data);
                  return;
                }

                // Store first diagnostic/pdfPreview events for debugging
                try {
                  if (typeof window !== 'undefined') {
                    (window as any).__streamDebug = (window as any).__streamDebug || {};
                    if ((data.type === 'diagnostic' || data.type === 'pdfPreview') && !(window as any).__streamDebug[data.type]) {
                      (window as any).__streamDebug[data.type] = data;
                      console.log(`[StreamDebug] Stored ${data.type} event`, data);
                    }
                  }
                } catch (dbgErr) {
                  console.warn('Failed to store stream debug info', dbgErr);
                }
                
                // Handle error messages from server
                if (data.type === 'error') {
                  console.error("ChatBox: Error from server:", data.error, data.details || '');
                  
                  setMessages(prev => {
                    const msgs = [...prev];
                    const lastMsg = msgs[msgs.length - 1];
                    if (!lastMsg) return msgs;
                    (lastMsg as any).error = true;
                    const append = (msg: string) => {
                      if (lastMsg.content) lastMsg.content += `\n\n${msg}`; else lastMsg.content = msg; };
                    if (data.details && typeof data.details === 'string') append(`[Error: ${data.details}]`);
                    else append(`[Error: ${data.error || 'Unknown error'}]`);
                    delete (lastMsg as any).streaming;
                    return msgs;
                  });
                  
                  setLoading(false);
                  
                  // Close the stream if error isn't recoverable
                  if (!data.recoverable) {
                    try {
                      eventSource.close();
                      clearInterval(heartbeatInterval);
                    } catch (closeError) {
                      console.error("Error closing event source after error:", closeError);
                    }
                  }
                  
                  return;
                }
                
                if (data.type === 'pdfPreview') {
                  // Show a tiny badge in UI for confirmation (non-intrusive)
                  try {
                    const container = document.querySelector('.chat-container');
                    if (container) {
                      const badge = document.createElement('div');
                      badge.textContent = `Server received ${data.length} chars (src:${data.source})`;
                      badge.style.position = 'absolute';
                      badge.style.top = '8px';
                      badge.style.right = '8px';
                      badge.style.fontSize = '10px';
                      badge.style.background = 'rgba(0,150,255,0.25)';
                      badge.style.padding = '2px 6px';
                      badge.style.borderRadius = '4px';
                      badge.style.color = '#9ddcff';
                      badge.style.pointerEvents = 'none';
                      container.appendChild(badge);
                      setTimeout(() => { try { container.removeChild(badge); } catch(e){} }, 4000);
                    }
                  } catch (e) {}
                  return; // Do not treat as content
                } else if (data.type === 'content') {
                  // Handle content with limits to prevent memory issues
                  if (data.content && data.content.length > 10000) {
                    console.warn("ChatBox: Very large content received, truncating");
                    data.content = data.content.substring(0, 10000) + "... [Content truncated for performance]";
                  }
                  
                  // Process chunk for annotations using enhanced engine
                  let annotations: Annotation[] = [];
                  let cleanedText = data.content || "";
                  try {
                    const result = annotationEngine.processStreamChunk(data.content || "", streamId);
                    annotations = result.annotations;
                    cleanedText = annotationEngine.cleanText(data.content || "");
                    
                    // Dispatch event for SmartAnnotationProcessor
                    window.dispatchEvent(new CustomEvent('ai-response-chunk', {
                      detail: { text: data.content, streamId }
                    }));
                  } catch (parseError) {
                    console.error("ChatBox: Error parsing annotations:", parseError);
                  }
                  
                  // Process for navigation commands using enhanced engine
                  let navigation = { targetPage: null as number | null, delayMs: 500, hasNavigation: false };
                  try {
                    const navResult = annotationEngine.parseNavigationCommands(data.content || "", currentPage);
                    if (navResult.hasNavigation && navResult.targetPage !== null) {
                      navigation = {
                        targetPage: navResult.targetPage,
                        delayMs: 500,
                        hasNavigation: true
                      };
                    }
                  } catch (navError) {
                    console.error("ChatBox: Error extracting navigation cues:", navError);
                  }
                  
                  // Handle annotations if any
                  if (annotations.length > 0) {
                    // Limit number of annotations to prevent memory issues
                    const limitedAnnotations = annotations.slice(0, 5);
                    
                    // Update UI with annotations
                    onAnnotation(limitedAnnotations);
                    
                    // Add to collection for final message (limit total stored)
                    collectedAnnotations.push(...limitedAnnotations);
                    
                    // Keep only the last 50 annotations
                    if (collectedAnnotations.length > 50) {
                      collectedAnnotations.splice(0, collectedAnnotations.length - 50);
                    }
                  }
                  
                  // Handle navigation if any
                  if (navigation.hasNavigation && navigation.targetPage !== null) {
                    try {
                      // Debounce: allow only one navigation per stream every 2 seconds
                      const navKey = '__lastNavTs';
                      const now = Date.now();
                      const last = (window as any)[navKey] || 0;
                      if (now - last > 2000) {
                        (window as any)[navKey] = now;
                        setTimeout(() => { onPageChange(navigation.targetPage!); }, navigation.delayMs);
                      } else {
                        console.log('Navigation suppressed (debounce)');
                      }
                    } catch (e) {
                      setTimeout(() => { onPageChange(navigation.targetPage!); }, navigation.delayMs);
                    }
                  }
                  
                  // Clean the text for display
                  const cleanedChunk = cleanedText;
                  
                  // Add to collected text
                  collectedText += cleanedChunk;
                  
                  // Update UI with current text
                  setMessages(prev => {
                    const updatedMessages = [...prev];
                    updatedMessages[updatedMessages.length - 1].content = collectedText;
                    return updatedMessages;
                  });
                  
                  // Dispatch a custom event for the LiveHighlighter component
                  try {
                    console.log("ChatBox: Processing ai-response-chunk with content:", 
                      data.content.substring(0, 50) + (data.content.length > 50 ? "..." : ""));
                    
                    // Add detailed logging for annotation commands
                    if (data.content.includes('[HIGHLIGHT') || 
                        data.content.includes('[CIRCLE') ||
                        data.content.includes('HIGHLIGHT') || 
                        data.content.includes('CIRCLE')) {
                      console.log("ANNOTATION COMMAND DETECTED in stream chunk:", 
                        JSON.stringify(data.content.substring(0, 200)));
                    }
                    
                    // Always dispatch event to ensure partial commands get processed
                    // This ensures that even if "[HIGHLIGHT" and the rest of the command come in different chunks,
                    // the LiveHighlighter component will still be able to process them
                    const streamEvent = new CustomEvent('ai-response-chunk', { 
                      detail: { text: data.content, streamId }
                    });
                    window.dispatchEvent(streamEvent);
                    
                    // Log confirmation that event was dispatched
                    console.log(`ChatBox: Dispatched ai-response-chunk event for streamId ${streamId} with ${data.content.length} chars`);
                    
                    // Also process locally for immediate feedback
                    try {
                      const { annotations: chunkAnnotations } = parseAnnotationCommands(data.content, currentPage);
                      
                      // Limit annotations to prevent memory issues
                      if (chunkAnnotations.length > 0) {
                        const limitedAnnotations = chunkAnnotations.slice(0, 5); // Only process max 5 annotations per chunk
                        
                        // Log annotations for debugging
                        limitedAnnotations.forEach(anno => logAnnotation(anno));
                        
                        // Apply annotations to the PDF
                        onAnnotation(limitedAnnotations);
                        
                        console.log(`ChatBox: Applied ${limitedAnnotations.length} annotations from stream`);
                      }
                    } catch (annotationError) {
                      console.error("Error processing annotations locally:", annotationError);
                    }
                  } catch (error) {
                    console.error("ChatBox: Failed to process chunk:", error);
                  }
                }
                else if (data.type === 'annotation') {
                  // Direct annotation data (alternative to embedding in text)
                  if (data.annotation) {
                    onAnnotation([data.annotation]);
                    
                    // Add to collection for final message (with limit)
                    collectedAnnotations.push(data.annotation);
                    
                    // Keep only the last 50 annotations
                    if (collectedAnnotations.length > 50) {
                      collectedAnnotations.splice(0, collectedAnnotations.length - 50);
                    }
                  }
                }
                else if (data.type === 'end') {
                  // Stream completed
                  isComplete = true;
                  
                  try {
                    // Clean up resources
                    eventSource.close();
                    clearInterval(heartbeatInterval);
                    
                    console.log("ChatBox: Stream completed successfully, processed", 
                      collectedAnnotations.length, "annotations");
                    
                    // Update final message with annotations (keep only 20 most recent for UI)
                    const finalAnnotations = collectedAnnotations.slice(-20);

                    // Fallback: if no annotations were collected, generate smart fallback
                    if (finalAnnotations.length === 0 && collectedText.length > 0) {
                      // Try heuristic extraction first
                      const heuristic = extractHeuristicAnnotations(collectedText, currentPage);
                      if (heuristic.annotations.length > 0) {
                        console.log(`ChatBox: Applying heuristic fallback annotation (${heuristic.reason})`);
                        onAnnotation(heuristic.annotations);
                        finalAnnotations.push(...heuristic.annotations.slice(0,2));
                      } else {
                        // Use enhanced annotation engine for smart fallback
                        const smartFallback = annotationEngine.generateFallbackAnnotation(currentPage, collectedText.substring(0, 100));
                        console.log('ChatBox: Injecting smart fallback highlight');
                        onAnnotation([smartFallback]);
                        finalAnnotations.push(smartFallback);
                        
                        // Also dispatch fallback event
                        window.dispatchEvent(new CustomEvent('ai-annotation-fallback', {
                          detail: { textHint: collectedText.substring(0, 100) }
                        }));
                      }
                    }
                    
                    setMessages(prev => {
                      const finalMessages = [...prev];
                      const finalMessage = finalMessages[finalMessages.length - 1];
                      finalMessage.content = collectedText;
                      finalMessage.annotations = finalAnnotations;
                      delete finalMessage.streaming; // Remove streaming flag
                      return finalMessages;
                    });

                    // Auto-save streaming chat history
                    if (pdfId) {
                      try {
                        const assembled = [...messages, { role: 'user', content: input }, { role: 'assistant', content: collectedText, annotations: finalAnnotations }];
                        fetch('/api/chat/history/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
                          body: JSON.stringify({ pdfId, messages: assembled })
                        }).catch(e => console.warn('Stream auto-save failed', e));
                      } catch (e) {
                        console.warn('Stream auto-save exception', e);
                      }
                    }
                  } catch (error) {
                    console.error("ChatBox: Error during stream completion:", error);
                  } finally {
                    setLoading(false);
                  }
                }
              } catch (error) {
                console.error('Error parsing stream data:', error);
              }
            };
            
            // Handle stream error with more robust error handling
            let errorCount = 0;
            let errorTimeout: NodeJS.Timeout | null = null;
            
            // Use a reset function to clear error state after recovery
            const resetErrorState = () => {
              errorCount = 0;
              if (errorTimeout) {
                clearTimeout(errorTimeout);
                errorTimeout = null;
              }
            };
            
            // More robust error handling for EventSource
            eventSource.onerror = (error) => {
              errorCount++;
              console.error(`Stream error (${errorCount}/2):`, error);
              
              // Check for specific Edge runtime error (Error code: 5)
              const errorText = error instanceof Error ? error.toString() : String(error);
              const isEdgeRuntimeError = errorText.includes('Error code: 5') || 
                                        errorText.includes('Edge runtime');
              
              // Reset error count after successful messages
              if (!errorTimeout) {
                errorTimeout = setTimeout(resetErrorState, 5000);
              }
              
              // If this is the first error and not an Edge runtime error, 
              // show a warning but keep trying
              if (errorCount === 1 && !isComplete && !isEdgeRuntimeError) {
                console.log("ChatBox: First error encountered, continuing...");
                
                // Add a warning to the UI
                setMessages(prev => {
                  const updatedMessages = [...prev];
                  const lastMessage = updatedMessages[updatedMessages.length - 1];
                  if (lastMessage && (lastMessage as any).streaming) {
                    lastMessage.content = (lastMessage.content || '') + "\n\n[Connection issues detected, attempting to recover...]";
                  }
                  return updatedMessages;
                });
                
                // Allow EventSource to attempt auto-reconnection
                return;
              }
              
              // After 2 errors, Edge runtime error, or if stream was already complete,
              // close and show error
              try {
                eventSource.close();
                if (heartbeatInterval) clearInterval(heartbeatInterval);
              } catch (e) {
                console.error("Error closing EventSource:", e);
              }
              
              if (!isComplete) {
                // Track connection errors to potentially disable streaming in the future
                try {
                  const prevErrors = localStorage.getItem('chat_connection_errors') || '0';
                  const errorCount = parseInt(prevErrors, 10);
                  localStorage.setItem('chat_connection_errors', String(errorCount + 1));
                  localStorage.setItem('chat_connection_last_error', String(Date.now()));
                  
                  // Show notification based on error count
                  if (errorCount >= 1) {
                    const notification = document.createElement('div');
                    notification.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fadeIn';
                    notification.innerHTML = `
                      <div class="flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Connection issues detected. Switching to stable mode.</span>
                      </div>
                    `;
                    document.body.appendChild(notification);
                    
                    // Remove after 5 seconds
                    setTimeout(() => {
                      notification.classList.add('animate-fadeOut');
                      setTimeout(() => {
                        document.body.removeChild(notification);
                      }, 500);
                    }, 5000);
                  }
                } catch (e) {
                  console.error("Error updating connection error count:", e);
                }
                
                // Update UI with error state
                setMessages(prev => {
                  const errorMessages = [...prev];
                  const lastMessage = errorMessages[errorMessages.length - 1];
                  
                  if (!lastMessage.content || lastMessage.content.trim() === "") {
                    // Replace empty message with error
                    lastMessage.content = "Sorry, there was an error processing your request. The server might be overloaded. Please try a shorter question.";
                  } else {
                    // Keep partial content but mark as error
                    lastMessage.error = true;
                    lastMessage.content += "\n\n[Connection lost. The answer may be incomplete.]";
                  }
                  
                  delete lastMessage.streaming;
                  return errorMessages;
                });
                
                setLoading(false);
              }
            };
            
            // Activate LiveHighlighter
            // (No direct activation needed as it will listen for ai-response-chunk events)
            
            return; // Exit early as we're handling the response via streaming
          }
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          // Fall back to non-streaming approach
        }
      }
      
      // Non-streaming fallback approach
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: newMessages,
          pdfText,
          pdfId,
          currentPage
        }),
      });
      
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return;
      }
      
      const data = await res.json();
      if (res.ok) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
          annotations: data.annotations
        };

        setMessages([...newMessages, assistantMessage]);
        
        if (data.annotations) {
          onAnnotation(data.annotations);
        }
        
        if (data.pageNumber) {
          onPageChange(data.pageNumber);
        }

        // Auto-play speech for read commands
        if (input.toLowerCase().includes('read this') || 
            input.toLowerCase().includes('read it') ||
            input.toLowerCase().includes('read that') ||
            input.toLowerCase().includes('speak') ||
            input.toLowerCase().includes('tell me') ||
            input.toLowerCase().includes('narrate') ||
            input.toLowerCase().includes('explain')) {
          // Will be handled by EnhancedSpeech component with autoPlay prop
          // We'll set this up when rendering the message
        }
      } else {
        // Update the placeholder message with error
        setMessages(prev => {
          const errorMessages = [...prev];
          errorMessages[errorMessages.length - 1] = {
            role: "assistant",
            content: data.error || 'Failed to send message',
            timestamp: new Date(),
            error: true
          };
          return errorMessages;
        });
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage = error?.message || 'An unexpected error occurred';
      
      // Update the placeholder message with error
      setMessages(prev => {
        const errorMessages = [...prev];
        errorMessages[errorMessages.length - 1] = {
          role: "assistant",
          content: `Error: ${errorMessage}. Please try again.`,
          timestamp: new Date(),
          error: true
        };
        return errorMessages;
      });
      
      if (error?.response) {
        const responseData = await error.response.json();
        console.error('Server response:', responseData);
      }
    } finally {
      setInput("");
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-[80vh] flex flex-col bg-gradient-to-b from-gray-900 to-gray-800 rounded-xl shadow-xl p-6 border border-blue-900/20">
      {/* Chat Header */}
      <div className="flex items-center justify-between mb-5 px-2">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full p-2 shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">AI Study Assistant</h3>
          </div>
        </div>
        {isSpeaking && (
          <div className="flex items-center gap-2 text-sm bg-blue-600 text-white px-3 py-1 rounded-md shadow-md">
            <span className="animate-pulse relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            Speaking...
          </div>
        )}
      </div>
      
      {/* Live Highlighter for real-time annotations */}
      <LiveHighlighter
        onAnnotationAdd={(annotation) => {
          // Handle both single annotation and array of annotations
          if (Array.isArray(annotation)) {
            onAnnotation(annotation);
          } else {
            onAnnotation([annotation]);
          }
        }}
        currentPage={currentPage}
        onPageChange={onPageChange}
        isActive={true}
      />
      
      {/* Chat History Controls */}
      {pdfId && token && (
        <div className="mb-3 px-2">
          <ChatHistoryManager
            pdfId={pdfId}
            token={token}
            onLoadHistory={(loadedMessages) => setMessages(loadedMessages)}
            onLoadAnnotations={(annotations) => onAnnotation(annotations)}
            onStatusChange={(status, message) => setHistoryStatus({ status, message })}
          />
          {historyStatus.status === 'loading' && (
            <p className="text-xs text-purple-300 mt-1">Loading chat history...</p>
          )}
          {historyStatus.status === 'error' && (
            <p className="text-xs text-red-400 mt-1">{historyStatus.message}</p>
          )}
        </div>
      )}
      
      {/* Auto Navigator for PDF page navigation */}
      {messages.length > 0 && 
        messages[messages.length - 1].role === 'assistant' && (
          <AutoNavigator 
            content={messages[messages.length - 1].content}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            isActive={true}
          />
        )
      }
      
      {/* Messages Container with scroll shadows */}
      <div className="relative flex-1 overflow-hidden mb-4">
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#352D63] to-transparent pointer-events-none z-10"></div>
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#352D63] to-transparent pointer-events-none z-10"></div>
        
        <div className="h-full overflow-y-auto px-4 py-2 custom-scrollbar">
          {/* Welcome message when no messages exist */}
          {messages.length === 0 && historyStatus.status !== 'loading' && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="bg-[#6A5DB9]/30 p-5 rounded-full mb-4 animate-pulse">
                <svg className="w-10 h-10 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Ask me anything about your PDF!</h3>
              <p className="text-purple-300 text-sm max-w-xs">
                I can answer questions, explain concepts, highlight important content, and navigate through pages for you.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-[#453A7C] p-3 rounded-lg">
                  <p className="font-medium text-white mb-1">Try asking:</p>
                  <p className="text-purple-200">"Explain the main concept on page 3"</p>
                </div>
                <div className="bg-[#453A7C] p-3 rounded-lg">
                  <p className="font-medium text-white mb-1">Try saying:</p>
                  <p className="text-purple-200">"Highlight the key points in this document"</p>
                </div>
              </div>
            </div>
          )}
          
          {/* PDF content warning if applicable */}
          {pdfText === "Loading PDF content..." ? (
            <div className="mb-4 w-full">
              <div className="bg-gray-800/90 border border-blue-500/30 text-gray-200 p-3 rounded-lg shadow-lg flex items-center gap-3">
                <div className="animate-spin h-4 w-4 text-blue-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <span>Loading PDF content for analysis...</span>
              </div>
            </div>
          ) : (pdfText && (pdfText.includes("scanned or image-based PDF") || pdfText.includes("no extractable text") || pdfText.includes("This appears to be a scanned document"))) ? (
            <div className="mb-4 w-full">
              <div className="bg-yellow-900/90 border border-yellow-500/30 text-yellow-100 p-3 rounded-lg shadow-lg flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    <strong>Limited PDF Analysis:</strong> This appears to be a scanned or image-based document. 
                    Text can't be automatically extracted, which may limit AI analysis capabilities.
                  </span>
                </div>
                <div className="text-sm border-t border-yellow-500/30 pt-2 ml-8">
                  <strong>Solutions:</strong>
                  <ul className="list-disc pl-5 mt-1">
                    <li>Try uploading a machine-readable PDF document instead</li>
                    <li>Process this document with OCR software before uploading</li>
                    <li><a href={`/pdf-debug?url=${encodeURIComponent(window.location.href)}&page=${currentPage}`} target="_blank" rel="noopener noreferrer" className="underline">Open diagnostic tool</a> for more information</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
          
          {/* Actual chat messages */}
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`mb-4 ${msg.role === "user" ? "ml-auto" : "mr-auto"} max-w-[85%] animate-fadeIn`}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className={`rounded-lg p-4 shadow-lg ${
                msg.role === "user" 
                  ? "bg-blue-600 text-white ml-auto border border-blue-500/30" 
                  : msg.streaming 
                    ? "bg-gray-800/90 text-white border border-blue-500/50 backdrop-blur-sm animate-pulse-subtle" 
                    : msg.error
                      ? "bg-gray-800/90 text-white border border-red-500/50 backdrop-blur-sm"
                      : "bg-gray-800/90 text-white border border-gray-700 backdrop-blur-sm"
              }`}>
                <div className="flex items-center gap-2 font-semibold mb-2 text-white/90">
                  {msg.role === "user" ? (
                    <>
                      <span className="bg-white/20 rounded-full p-1 text-xs">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </span>
                      You
                    </>
                  ) : (
                    <>
                      <span className="bg-blue-500/30 rounded-full p-1 text-xs">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </span>
                      Assistant
                    </>
                  )}
                </div>
                
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                  {msg.streaming && (
                    <span className="typing-indicator inline-block ml-1 text-blue-400">
                      {/* Animation handled by CSS */}
                    </span>
                  )}
                </div>
                
                {/* Show annotation indicators if message has annotations */}
                {msg.annotations && msg.annotations.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-700/50">
                    <div className="text-xs text-gray-400 mb-1.5">Annotations:</div>
                    <div className="flex flex-wrap gap-2">
                      {msg.annotations.map((ann, annIdx) => (
                        <span 
                          key={annIdx}
                          className={`text-xs px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors
                            ${ann.type === 'highlight' 
                              ? 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/30 hover:bg-yellow-500/20' 
                              : 'bg-blue-500/15 text-blue-200 border border-blue-500/30 hover:bg-blue-500/20'}`}
                          onClick={() => {
                            onAnnotation([ann]);
                            if (ann.page !== undefined) {
                              onPageChange(ann.page);
                            }
                          }}
                        >
                          {ann.type === 'highlight' ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          )}
                          {ann.type === 'highlight' ? 'Highlight' : 'Circle'} on page {ann.page}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Message footer with actions and timestamp */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                  {msg.timestamp && (
                    <div className="text-xs text-white/70 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  )}
                  
                  {/* Enhanced speech component for assistant messages */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2">
                      <EnhancedSpeech 
                        text={cleanResponseText(msg.content)}
                        onSpeakingChange={setIsSpeaking}
                        autoPlay={
                          // Auto play for the most recent assistant message if triggered by voice command
                          messages.indexOf(msg) === messages.length - 1 &&
                          messages.length > 1 &&
                          messages[messages.length - 2].content.toLowerCase().match(
                            /(read|speak|tell|explain|narrate)/
                          ) !== null
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Annotation indicators for AI messages */}
              {msg.role === "assistant" && msg.annotations && msg.annotations.length > 0 && (
                <div className="flex items-center gap-1 mt-1 ml-2">
                  <span className="bg-yellow-400/80 w-2 h-2 rounded-full"></span>
                  <span className="text-xs text-yellow-400/80">
                    {msg.annotations.length} {msg.annotations.length === 1 ? 'annotation' : 'annotations'} added
                  </span>
                </div>
              )}
            </div>
          ))}
          
          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-3 p-4 bg-[#453A7C]/70 rounded-xl w-fit mb-4">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-purple-300 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-purple-300 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-purple-300 animate-bounce" style={{ animationDelay: '600ms' }}></div>
              </div>
              <span className="text-sm text-purple-200">{isListening ? 'Processing voice...' : 'Analyzing PDF...'}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Input form with improved styling */}
      <form onSubmit={handleSend} className="relative mt-2">
        <div className="flex items-center gap-3 p-3 bg-gray-800/80 rounded-lg border border-gray-700/80 shadow-md backdrop-blur-sm">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 bg-gray-700/90 text-white placeholder-gray-400 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/70 text-base shadow-inner border border-gray-600/50"
            placeholder={isListening ? 'Listening...' : 'Ask any question about your PDF...'}
            disabled={loading}
          />
          
          {/* Voice button with animation */}
          <button
            type="button"
            onClick={toggleVoiceRecognition}
            className={`p-2 rounded-lg transition-all duration-300 ${
              isListening 
                ? 'bg-red-500 text-white pulsate-animation' 
                : 'bg-gray-600 text-white hover:bg-blue-500'
            }`}
            title={isListening ? 'Stop recording' : 'Start voice input'}
            disabled={loading && !isListening}
          >
            {isListening ? (
              <div className="relative">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                {/* Sound wave animation */}
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-0.5 h-1 bg-white animate-soundwave"></div>
                    <div className="w-0.5 h-3 bg-white animate-soundwave" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-0.5 h-2 bg-white animate-soundwave" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-0.5 h-2 bg-white animate-soundwave" style={{ animationDelay: '0.3s' }}></div>
                    <div className="w-0.5 h-1 bg-white animate-soundwave" style={{ animationDelay: '0.15s' }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>
          
          {/* Send button */}
          <button
            type="submit"
            className={`px-6 py-3 rounded-lg font-medium text-base transition-all duration-300 ${
              loading
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
            }`}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Processing...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Send</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            )}
          </button>
        </div>
      </form>
      
      {/* Add custom animations */}
      <style jsx>{`
        .animate-fadeIn {
          opacity: 0;
          animation: fadeIn 0.5s ease-out forwards;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .pulsate-animation {
          animation: pulsate 1.5s ease-out infinite;
        }
        
        @keyframes pulsate {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        
        @keyframes soundwave {
          0% { height: 1px; }
          50% { height: 8px; }
          100% { height: 1px; }
        }
        
        .animate-soundwave {
          animation: soundwave 1s ease-in-out infinite;
        }
        
        .animate-pulse-subtle {
          animation: pulseSoft 2s ease-in-out infinite;
        }
        
        @keyframes pulseSoft {
          0% { border-color: rgba(59, 130, 246, 0.3); }
          50% { border-color: rgba(59, 130, 246, 0.6); }
          100% { border-color: rgba(59, 130, 246, 0.3); }
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(45, 38, 84, 0.3);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(106, 93, 185, 0.8);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(106, 93, 185, 1);
        }
        
        .typing-indicator::after {
          content: '';
          animation: typingDots 1.5s infinite;
        }
        
        @keyframes typingDots {
          0% { content: '.'; }
          33% { content: '..'; }
          66% { content: '...'; }
          100% { content: '.'; }
        }
      `}</style>
    </div>
  );
}
