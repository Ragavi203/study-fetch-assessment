"use client";
import React, { useEffect, useState, useRef } from 'react';

interface EnhancedPDFViewerProps {
  url: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onTextExtracted?: (text: string) => void;
}

/**
 * A clean, simple PDF viewer with minimal UI and controls at the top
 */
export default function EnhancedPDFViewer({ 
  url, 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  onLoad,
  onError,
  onTextExtracted
}: EnhancedPDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(currentPage);
  const [zoom, setZoom] = useState(100);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle page changes from props
  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage]);

  // Extract text from PDF when page changes
  useEffect(() => {
    if (onTextExtracted && !isLoading && !error) {
      const extractText = async () => {
        try {
          console.log(`Extracting text from PDF page ${page}`);
          const { extractPDFText } = await import('@/lib/pdfDirectUtils');
          const text = await extractPDFText(url, page);
          if (text) {
            console.log(`Successfully extracted ${text.length} characters`);
            onTextExtracted(text);
          }
        } catch (err) {
          console.error('Failed to extract text from PDF:', err);
        }
      };
      
      // Use a delay to ensure the PDF is loaded
      const timeoutId = setTimeout(() => {
        extractText();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [url, page, isLoading, error, onTextExtracted]);

  // Check if URL is accessible
  useEffect(() => {
    const checkUrl = async () => {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`Failed to load PDF: HTTP ${response.status}`);
        }
        setIsLoading(false);
        if (onLoad) onLoad();
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error loading PDF');
        setError(error);
        if (onError) onError(error);
      }
    };

    checkUrl();
    
    // Setup message listener for communication from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'pdf-loaded') {
        console.log('PDF loaded in iframe, page:', event.data.page);
        
        // Extract text from the PDF
        import('@/lib/pdfDirectUtils').then(async ({ extractPDFText }) => {
          try {
            const text = await extractPDFText(url, event.data.page || currentPage);
            if (text && onTextExtracted) {
              console.log(`Text extracted from PDF via postMessage: ${text.length} characters`);
              onTextExtracted(text);
            }
          } catch (e) {
            console.error('Failed to extract text after PDF load:', e);
          }
        });
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [url, onLoad, onError, currentPage, onTextExtracted]);

  const handlePageChange = (newPage: number) => {
    // Ensure page is within bounds
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    
    setPage(newPage);
    if (onPageChange) onPageChange(newPage);
    
    // Try to navigate to page in iframe if possible
    if (iframeRef.current) {
      // Some browsers support passing the page in the hash
      const iframe = iframeRef.current;
      try {
        const newSrc = url.includes('#') 
          ? url.split('#')[0] + `#page=${newPage}`
          : `${url}#page=${newPage}`;
        
        iframe.src = newSrc;
      } catch (e) {
        console.error('Error changing page in iframe:', e);
      }
    }
  };

  // Direct PDF loading through blob URL with custom HTML wrapper
  const loadPdfDirectly = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      if (iframeRef.current) {
        // Create a custom HTML page that embeds the PDF without default toolbar
        const customHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>PDF Viewer</title>
            <style>
              body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
              #pdf-container { width: 100%; height: 100%; }
              /* Hide PDF.js toolbar */
              .toolbar { display: none !important; }
            </style>
          </head>
          <body>
            <iframe id="pdf-container" src="${objectUrl}#page=${page}&toolbar=0&navpanes=0" frameborder="0"></iframe>
            <script>
              // Extract text for AI when PDF is loaded
              document.getElementById('pdf-container').onload = function() {
                // Signal that the PDF is ready
                window.parent.postMessage({ type: 'pdf-loaded', page: ${page} }, '*');
              };
            </script>
          </body>
          </html>
        `;
        
        // Create a blob URL for our custom HTML
        const htmlBlob = new Blob([customHtml], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        
        // Load our custom HTML page in the iframe
        iframeRef.current.src = htmlUrl;
        setIsLoading(false);
        setError(null);
        
        // Extract text from PDF for AI
        import('@/lib/pdfDirectUtils').then(async ({ extractPDFText }) => {
          try {
            const text = await extractPDFText(url, page);
            if (text && onTextExtracted) {
              onTextExtracted(text);
            }
          } catch (e) {
            console.error('Failed to extract text after direct PDF load:', e);
          }
        });
        
        if (onLoad) onLoad();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load PDF directly');
      setError(error);
      if (onError) onError(error);
    }
  };

  // Open in new tab if all else fails
  const openInNewTab = () => {
    window.open(url, '_blank');
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8 rounded-lg">
        <div className="text-red-500 text-xl mb-4">Error loading PDF</div>
        <p className="text-gray-700 mb-4">{error.message}</p>
        <div className="flex space-x-4">
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={loadPdfDirectly}
          >
            Try Direct Loading
          </button>
          <button 
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            onClick={openInNewTab}
          >
            Open in New Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" ref={containerRef}>
      {/* PDF Controls */}
      <div className="bg-blue-600 text-white border-b p-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className={`p-1 rounded ${page <= 1 ? 'text-gray-300' : 'text-white hover:bg-blue-700'}`}
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
              max={totalPages}
              value={page}
              onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
              className="w-12 text-center border rounded p-1 text-sm"
              aria-label="Page number"
            />
            <span className="mx-1 text-sm text-gray-600">/ {totalPages}</span>
          </div>
          
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className={`p-1 rounded ${page >= totalPages ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-200'}`}
            aria-label="Next page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoom(Math.max(zoom - 25, 50))}
            className="p-1 rounded text-white hover:bg-blue-700"
            aria-label="Zoom out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          
          <span className="text-sm">{zoom}%</span>
          
          <button
            onClick={() => setZoom(Math.min(zoom + 25, 200))}
            className="p-1 rounded text-gray-700 hover:bg-gray-200"
            aria-label="Zoom in"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          
          <button
            onClick={openInNewTab}
            className="p-1 rounded text-gray-700 hover:bg-gray-200 ml-4"
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
      
      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden relative" style={{ zoom: `${zoom}%` }}>
        {/* Add a simple iframe-based PDF viewer without PDF.js toolbar */}
        <object 
          ref={iframeRef as any}
          data={`${url}#page=${page}&toolbar=0&navpanes=0&scrollbar=0`}
          type="application/pdf" 
          className="w-full h-full border-none"
          style={{ 
            border: "none", 
            width: "100%", 
            height: "100%", 
            background: "white"
          }}
        >
          <p>PDF cannot be displayed. <a href={url} target="_blank" rel="noopener noreferrer">Open PDF directly</a></p>
        </object>
        
        {/* Add a transparent overlay to prevent PDF.js toolbar interactions */}
        <div 
          className="absolute top-0 left-0 right-0 h-[40px] bg-transparent z-10"
          onClick={(e) => {
            // This overlay blocks clicks on the PDF.js toolbar
            e.preventDefault();
            e.stopPropagation();
          }}
        ></div>
        
        {/* Hidden iframe for text extraction */}
        <iframe 
          src="about:blank"
          style={{ display: 'none' }}
          title="PDF Text Extractor"
          onLoad={() => {
            // When component mounts, extract text
            import('@/lib/pdfDirectUtils').then(async ({ extractPDFText }) => {
              try {
                console.log('Extracting text from PDF page', currentPage);
                const text = await extractPDFText(url, currentPage || 1);
                if (text && onTextExtracted) {
                  console.log(`Text extracted directly: ${text.length} characters`);
                  onTextExtracted(text);
                }
              } catch (e) {
                console.error('Failed to extract text:', e);
              }
            });
            
            setIsLoading(false);
            if (onLoad) onLoad();
          }}
        />
      </div>
    </div>
  );
}