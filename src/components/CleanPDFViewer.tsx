"use client";
import React, { useEffect, useState, useRef } from 'react';

interface CleanPDFViewerProps {
  url: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onTextExtracted?: (text: string) => void;
}

/**
 * A super clean PDF viewer that uses the browser's built-in PDF capabilities
 * with completely custom controls and no PDF.js toolbar
 */
export default function CleanPDFViewer({ 
  url, 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  onLoad,
  onError,
  onTextExtracted
}: CleanPDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(currentPage);
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);
  const objectRef = useRef<HTMLObjectElement>(null);

  // Extract text function with improved handling of student essays
  const extractTextFromPDF = async (pdfUrl: string, pageNum: number) => {
    try {
      console.log(`Attempting to extract text from page ${pageNum}`);
      
      // Use a direct approach first for immediate text
      const manualText = await (async () => {
        try {
          // Try to get text by directly accessing the PDF content
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for PDF to render
          
          const pdfObject = document.querySelector('object[type="application/pdf"]');
          if (pdfObject && (pdfObject as HTMLObjectElement).contentDocument) {
            const contentDocument = (pdfObject as HTMLObjectElement).contentDocument;
            if (contentDocument && contentDocument.body) {
              // Get all text content from the PDF document
              const bodyText = contentDocument.body.textContent || '';
              if (bodyText.length > 50) {
                console.log(`Direct access got ${bodyText.length} chars of text`);
                
                // Check if this is a student essay by looking for common elements
                if (bodyText.includes('Reflection') || 
                    bodyText.includes('Introduction') || 
                    bodyText.includes('Learning Experience') ||
                    bodyText.includes('Six Sigma')) {
                  console.log('This appears to be a student essay or reflection');
                  // Add metadata to help the AI understand what it's looking at
                  return `[DOCUMENT TYPE: Student Essay/Reflection]
${bodyText}`;
                }
                return bodyText;
              }
            }
          }
          return null;
        } catch (e) {
          console.warn('Direct text access failed:', e);
          return null;
        }
      })();
      
      if (manualText) {
        return manualText;
      }
      
      // Fall back to the standard extraction method
      const { extractPDFText } = await import('@/lib/pdfDirectUtils');
      const text = await extractPDFText(pdfUrl, pageNum);
      console.log(`Text extracted: ${text ? text.length : 0} characters`);
      
      // If this looks like a student essay, add context
      if (text && (text.includes('Reflection') || 
                   text.includes('Introduction') || 
                   text.includes('Learning Experience') ||
                   text.includes('Six Sigma'))) {
        return `[DOCUMENT TYPE: Student Essay/Reflection]
${text}`;
      }
      
      return text;
    } catch (err) {
      console.error('Error extracting text:', err);
      return "";
    }
  };

  // Handle page changes from props
  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage]);

  // Extract text when page changes or after PDF loads
  useEffect(() => {
    const getAndSendText = async () => {
      try {
        if (!url) return;
        
        console.log(`🔍 Getting text for page ${page}...`);
        
        // Try multiple methods to extract text for better reliability
        let text: string | null = null;
        
        // DIRECT DOM EXTRACTION - Get text directly from the PDF iframe/object
        try {
          console.log("📄 Attempting direct DOM extraction first...");
          // Wait a moment for the PDF to render in the DOM
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Try to get text from the iframe/object element
          const pdfElement = document.querySelector('object[type="application/pdf"]');
          if (pdfElement && (pdfElement as HTMLObjectElement).contentDocument) {
            const contentDoc = (pdfElement as HTMLObjectElement).contentDocument;
            if (contentDoc) {
              // Get all text from the PDF viewer
              const textContent = contentDoc.body.textContent || "";
              if (textContent.length > 100) {  // Reasonable minimum for real content
                text = textContent;
                console.log(`📃 DOM extraction successful! Got ${text.length} characters`);
              } else {
                console.log("📃 DOM extraction found too little text, trying other methods");
              }
            }
          }
        } catch (domError) {
          console.log("📃 DOM extraction failed:", domError);
        }
        
        // Method 1: Direct extraction through our utility
        if (!text || text.length < 100) {
          try {
            const extractedText = await extractTextFromPDF(url, page);
            if (extractedText && extractedText.length > 20) {
              text = extractedText;
              console.log(`📚 Method 1: Got ${text.length} characters`);
            } else {
              console.log(`⚠️ Method 1: Insufficient text, trying alternate method`);
            }
          } catch (extractError) {
            console.error('Initial extraction error:', extractError);
          }
          
          // Method 2: Try using PDF.js directly
          if (!text || text.length < 100) {
            try {
              const { extractPDFText } = await import('@/lib/pdfDirectUtils');
              const directText = await extractPDFText(url, page);
              if (directText && (!text || directText.length > text.length)) {
                text = directText;
                console.log(`📚 Method 2: Got ${text.length} characters`);
              }
            } catch (directError) {
              console.error('Direct extraction error:', directError);
            }
            
            // Method 3: Try using enhanced extraction
            if (!text || text.length < 50) {
              console.log(`⚠️ Methods 1-2 failed, trying enhanced extraction`);
              try {
                const { extractTextFromPDF } = await import('@/lib/pdfDebugUtils');
                const enhancedResult = await extractTextFromPDF(url, page, { 
                  includeAnnotations: true,
                  fallbackToOCR: false
                });
                
                if (enhancedResult.success && enhancedResult.text && 
                    (!text || enhancedResult.text.length > text.length)) {
                  text = enhancedResult.text;
                  console.log(`📚 Method 3: Got ${text.length} characters`);
                }
              } catch (e) {
                console.error('Enhanced extraction failed:', e);
              }
            }
          }
        }
        
        // Use default message if all methods failed
        const finalText = text || "No text could be extracted from this page. It may be a scanned document or contain images rather than text.";
        
        // Store extracted text in multiple locations for redundancy
        if (typeof window !== 'undefined') {
          // Global variable for direct access (most important for AI to find)
          (window as any).currentPageText = finalText;
          console.log(`📝 Set ${finalText.length} characters to window.currentPageText`);
          
          // Initialize cache if needed
          if (!(window as any).pdfTextCache) {
            (window as any).pdfTextCache = {};
          }
          
          // Cache by URL and page
          (window as any).pdfTextCache[`${url}_${page}`] = finalText;
          
          // Store in multiple storage mechanisms for redundancy
          try {
            // LocalStorage for persistence across refreshes
            localStorage.setItem('pdf_current_text', finalText);
            localStorage.setItem('pdf_current_page', page.toString());
            localStorage.setItem('pdf_text_updated', Date.now().toString());
            
            // SessionStorage for tab-specific persistence
            sessionStorage.setItem(`pdf_text_page_${page}`, finalText);
            sessionStorage.setItem('pdf_text_last_updated', Date.now().toString());
            
            // Add a global marker that text is available
            document.documentElement.setAttribute('data-pdf-text-available', 'true');
          } catch (e) {
            console.warn('Could not store in browser storage:', e);
          }
          
          // Store in DOM attributes as well for ultimate fallback
          try {
            // Add to the container for local access
            if (containerRef.current) {
              containerRef.current.setAttribute('data-pdf-text', finalText.substring(0, 5000)); // Limit size
              containerRef.current.setAttribute('data-pdf-page', page.toString());
            }
            
            // Find common containers that might be used for AI chat
            const aiContainers = document.querySelectorAll('.chat-container, .ai-chat-container');
            if (aiContainers.length > 0) {
              aiContainers.forEach(container => {
                container.setAttribute('data-pdf-text', finalText.substring(0, 5000));
                container.setAttribute('data-pdf-page', page.toString());
              });
            }
          } catch (e) {
            console.warn('Could not store PDF text in DOM:', e);
          }
          
          // Also try to set directly on the ChatBox input field if it exists
          try {
            const chatField = document.querySelector('.ai-chat-container');
            if (chatField) {
              // Create a data attribute to hold the text
              chatField.setAttribute('data-pdf-text', finalText.substring(0, 1000)); // Limit size for DOM
              chatField.setAttribute('data-pdf-page', page.toString());
              console.log('✅ Set PDF text directly on chat container');
            }
          } catch (e) {
            console.warn('Could not set text on chat container:', e);
          }
          
          // Also dispatch custom event for components to listen for (dispatch multiple times for reliability)
          const createAndDispatchEvent = () => {
            const event = new CustomEvent('pdf-text-extracted', { 
              detail: { 
                text: finalText, 
                page,
                timestamp: Date.now(),
                source: 'CleanPDFViewer',
                isScanned: !text || text.length < 50,
                documentType: finalText.toLowerCase().includes('reflection') || 
                              finalText.toLowerCase().includes('essay') || 
                              finalText.toLowerCase().includes('personal learning') ? 
                                'student_essay' : 'general'
              } 
            });
            console.log('🔔 Dispatching pdf-text-extracted event');
            window.dispatchEvent(event);
            
            // Also try to dispatch to any parent windows in case we're in an iframe
            try {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                  type: 'pdf-text-extracted',
                  detail: {
                    text: finalText, 
                    page,
                    timestamp: Date.now(),
                    isScanned: !text || text.length < 50
                  }
                }, '*');
              }
            } catch (e) {
              console.warn('Could not send message to parent window:', e);
            }
          };
          
          // Dispatch immediately and then several more times to ensure it's received
          createAndDispatchEvent();
          setTimeout(createAndDispatchEvent, 500);
          setTimeout(createAndDispatchEvent, 2000);
          setTimeout(createAndDispatchEvent, 5000);  // One more delayed dispatch
          
          // Add debug element to page for visibility
          if (document.getElementById('pdf-text-debug')) {
            document.getElementById('pdf-text-debug')!.textContent = 
              `PDF text extracted: ${finalText.length} chars for page ${page}`;
          } else {
            const debugEl = document.createElement('div');
            debugEl.id = 'pdf-text-debug';
            debugEl.style.position = 'fixed';
            debugEl.style.bottom = '10px';
            debugEl.style.right = '10px';
            debugEl.style.padding = '5px';
            debugEl.style.background = 'rgba(0,0,0,0.7)';
            debugEl.style.color = 'white';
            debugEl.style.fontSize = '10px';
            debugEl.style.zIndex = '9999';
            debugEl.style.borderRadius = '3px';
            debugEl.textContent = `PDF text extracted: ${finalText.length} chars for page ${page}`;
            document.body.appendChild(debugEl);
            
            // Remove after 5 seconds
            setTimeout(() => {
              try {
                document.body.removeChild(debugEl);
              } catch (e) {}
            }, 5000);
          }
        }
        
        // Send to parent component
        if (onTextExtracted) {
          console.log(`📤 Sending ${finalText.length} characters to parent component`);
          onTextExtracted(finalText);
        }
        
      } catch (err) {
        console.error('❌ Text extraction process error:', err);
        
        // Even on error, send a message so the AI knows there was an issue
        const errorText = "Error extracting text from this PDF page. Please try again or try with a different document.";
        
        if (onTextExtracted) {
          onTextExtracted(errorText);
        }
        
        if (typeof window !== 'undefined') {
          (window as any).currentPageText = errorText;
          window.dispatchEvent(new CustomEvent('pdf-text-extracted', { 
            detail: { text: errorText, page, error: true } 
          }));
        }
      }
    };
    
    // Immediate extraction
    getAndSendText();
    
    // Try multiple times with increasing delays to ensure PDF is loaded
    const timeoutIds = [
      setTimeout(getAndSendText, 1000),
      setTimeout(getAndSendText, 3000),
      setTimeout(getAndSendText, 6000)
    ];
    
    return () => timeoutIds.forEach(id => clearTimeout(id));
  }, [url, page, onTextExtracted]);

  // Monitor when the PDF loads
  useEffect(() => {
    if (!url) return;
    
    const checkPDF = async () => {
      try {
        // Check if PDF is accessible
        const response = await fetch(url, { method: 'HEAD' });
        
        if (!response.ok) {
          throw new Error(`PDF not accessible (status: ${response.status})`);
        }
        
        // If we get here, PDF is accessible
        setIsLoading(false);
        if (onLoad) onLoad();
        
        // Extract text from the first page when loaded
        const text = await extractTextFromPDF(url, page);
        if (text && onTextExtracted) {
          onTextExtracted(text);
        }
      } catch (err) {
        console.error('PDF access error:', err);
        const error = err instanceof Error ? err : new Error('Unknown PDF access error');
        setError(error);
        if (onError) onError(error);
      }
    };
    
    checkPDF();
  }, [url, onLoad, onError]);

  // Handle page navigation
  const handlePageChange = (newPage: number) => {
    if (newPage < 1) newPage = 1;
    if (totalPages && newPage > totalPages) newPage = totalPages;
    
    setPage(newPage);
    if (onPageChange) onPageChange(newPage);
    
    // Update the PDF object to show the new page
    if (objectRef.current) {
      // Create a new URL with the page parameter
      const newUrl = url.includes('#') 
        ? url.split('#')[0] + `#page=${newPage}`
        : `${url}#page=${newPage}`;
      
      // Load the new URL
      objectRef.current.data = newUrl;
      
      // Extract text from the new page - multiple times to ensure success
      const extractMultipleTimes = async () => {
        console.log(`Extracting text for page ${newPage} (attempt 1)`);
        try {
          const text = await extractTextFromPDF(url, newPage);
          if (text && onTextExtracted) {
            console.log(`Text extracted for page ${newPage}: ${text.length} characters`);
            onTextExtracted(text);
            
            // Also set to window global for direct access
            if (typeof window !== 'undefined') {
              console.log(`Setting currentPageText with ${text.length} characters`);
              (window as any).currentPageText = text;
              
              // Dispatch event for others to listen to
              window.dispatchEvent(new CustomEvent('pdf-text-extracted', {
                detail: { text, page: newPage }
              }));
            }
          } else {
            console.log(`No text extracted on first attempt for page ${newPage}, retrying...`);
            
            // Try again after a delay
            setTimeout(async () => {
              console.log(`Extracting text for page ${newPage} (attempt 2)`);
              const retryText = await extractTextFromPDF(url, newPage);
              if (retryText && onTextExtracted) {
                console.log(`Text extracted on retry for page ${newPage}: ${retryText.length} characters`);
                onTextExtracted(retryText);
                
                // Also set to window global for direct access
                if (typeof window !== 'undefined') {
                  (window as any).currentPageText = retryText;
                  window.dispatchEvent(new CustomEvent('pdf-text-extracted', {
                    detail: { text: retryText, page: newPage }
                  }));
                }
              }
            }, 1500);
          }
        } catch (err) {
          console.error(`Error extracting text for page ${newPage}:`, err);
        }
      };
      
      extractMultipleTimes();
    }
  };

  // Open in new tab if needed
  const openInNewTab = () => {
    window.open(url, '_blank');
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8 rounded-lg">
        <div className="text-red-500 text-xl mb-4">Error loading PDF</div>
        <p className="text-gray-700 mb-4">{error.message}</p>
        <button 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={openInNewTab}
        >
          Open in New Tab
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" ref={containerRef}>
      {/* PDF Controls */}
      <div className="bg-blue-600 text-white p-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className={`p-1 rounded ${page <= 1 ? 'text-blue-300' : 'text-white hover:bg-blue-700'}`}
            aria-label="Previous page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex items-center">
            <input
              type="number"
              min={1}
              max={totalPages || 999}
              value={page}
              onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
              className="w-12 text-center border rounded p-1 text-sm bg-white text-gray-800"
              aria-label="Page number"
            />
            <span className="mx-1 text-sm text-white">/ {totalPages || '?'}</span>
          </div>
          
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={totalPages ? page >= totalPages : false}
            className={`p-1 rounded ${totalPages && page >= totalPages ? 'text-blue-300' : 'text-white hover:bg-blue-700'}`}
            aria-label="Next page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoom(Math.max(zoom - 10, 50))}
            className="p-1 rounded text-white hover:bg-blue-700"
            aria-label="Zoom out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          
          <span className="text-sm">{zoom}%</span>
          
          <button
            onClick={() => setZoom(Math.min(zoom + 10, 200))}
            className="p-1 rounded text-white hover:bg-blue-700"
            aria-label="Zoom in"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          
          <button
            onClick={openInNewTab}
            className="p-1 rounded text-white hover:bg-blue-700 ml-4"
            aria-label="Open in new tab"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-gray-600">Loading PDF...</p>
          </div>
        </div>
      )}
      
      {/* PDF Content */}
      <div className="flex-1 bg-gray-100 overflow-hidden relative">
        <object
          ref={objectRef}
          data={`${url}#page=${page}&toolbar=0&navpanes=0&scrollbar=0`}
          type="application/pdf"
          className="w-full h-full"
          style={{ 
            transform: `scale(${zoom/100})`,
            transformOrigin: 'top left',
            width: `${10000/zoom * 100}%`,
            height: `${10000/zoom * 100}%`
          }}
        >
          <p>Your browser doesn't support PDFs. 
            <a href={url} target="_blank" rel="noreferrer">Download the PDF</a> instead.
          </p>
        </object>
      </div>
    </div>
  );
}