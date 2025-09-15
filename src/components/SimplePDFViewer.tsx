"use client";
import React, { useEffect, useState } from 'react';

interface SimplePDFViewerProps {
  url: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

/**
 * A simple PDF viewer that uses the browser's built-in PDF viewing capabilities
 * This is a fallback for when the more complex PDF.js viewer fails
 */
export default function SimplePDFViewer({ url, onLoad, onError }: SimplePDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if the URL is accessible
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
  }, [url, onLoad, onError]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8 rounded-lg">
        <div className="text-red-500 text-xl mb-4">Error loading PDF</div>
        <p className="text-gray-700 mb-4">{error.message}</p>
        <button 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );
  }

  const [fallbackMode, setFallbackMode] = useState(false);
  
  // Try to load the PDF directly if the iframe fails
  const loadPdfDirectly = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      const viewerFrame = document.createElement('iframe');
      viewerFrame.src = objectUrl;
      viewerFrame.className = "w-full h-full border-none";
      viewerFrame.title = "PDF Viewer";
      
      const container = document.getElementById('pdf-container');
      if (container) {
        container.innerHTML = '';
        container.appendChild(viewerFrame);
        setIsLoading(false);
        setError(null);
        if (onLoad) onLoad();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load PDF directly');
      setError(error);
      if (onError) onError(error);
    }
  };

  // Try opening in a new tab/window if all else fails
  const openInNewTab = () => {
    window.open(url, '_blank');
  };

  return (
    <div className="w-full h-full flex flex-col" id="pdf-container">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-gray-600">Loading PDF...</p>
          </div>
        </div>
      )}
      
      {fallbackMode ? (
        <div className="w-full h-full p-4 bg-white overflow-auto">
          <h3 className="text-lg font-medium mb-4">PDF Preview (Fallback Mode)</h3>
          <p className="mb-4">The PDF is available but cannot be displayed in the viewer.</p>
          <div className="flex space-x-4">
            <button 
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={openInNewTab}
            >
              Open PDF in New Tab
            </button>
            <button 
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              onClick={loadPdfDirectly}
            >
              Try Direct Loading
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* The iframe uses the browser's built-in PDF viewer */}
          <iframe 
            src={url} 
            className="w-full h-full border-none"
            title="PDF Viewer"
            onLoad={() => {
              setIsLoading(false);
              if (onLoad) onLoad();
            }}
            onError={(e) => {
              console.error("PDF iframe load error - trying fallback mode");
              setFallbackMode(true);
              setIsLoading(false);
            }}
          />
        </>
      )}
    </div>
  );
}