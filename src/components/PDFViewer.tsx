"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import * as pdfjs from 'pdfjs-dist';

// Import only necessary modules
import { PDFStructureMapper, PDFSection } from './PDFStructureMapper';
import { PDFReferenceHelper, KeyTerm } from './PDFReferenceHelper';
import { PDFTextExtractor } from './PDFTextExtractor';

// Set the worker source for PDF.js
// This loads once when the component is imported
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  console.log('Setting PDF.js worker source');
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

// Dynamic imports of plugins with error handling
let scrollModePlugin: any, toolbarPlugin: any, pageNavigationPlugin: any, zoomPlugin: any;

try {
  scrollModePlugin = require('@react-pdf-viewer/scroll-mode').scrollModePlugin;
} catch (e) {
  console.warn('Failed to load scroll-mode plugin:', e);
  scrollModePlugin = () => ({ install: () => {} });
}

try {
  toolbarPlugin = require('@react-pdf-viewer/toolbar').toolbarPlugin;
} catch (e) {
  console.warn('Failed to load toolbar plugin:', e);
  toolbarPlugin = () => ({ install: () => {} });
}

try {
  pageNavigationPlugin = require('@react-pdf-viewer/page-navigation').pageNavigationPlugin;
} catch (e) {
  console.warn('Failed to load page-navigation plugin:', e);
  pageNavigationPlugin = () => ({ 
    install: () => {},
    jumpToPage: () => {}
  });
}

try {
  zoomPlugin = require('@react-pdf-viewer/zoom').zoomPlugin;
} catch (e) {
  console.warn('Failed to load zoom plugin:', e);
  zoomPlugin = () => ({ 
    install: () => {},
    zoomTo: () => {}
  });
}

interface PDFViewerProps {
  url: string;
  onDocumentLoad: (numPages: number) => void;
  onPageChange: (pageNum: number) => void;
  onViewerInstanceChange: (instance: any) => void;
  targetPage?: number;
  onTextExtracted?: (text: string, positions: any[], page: number) => void;
  onKeyTermsDetected?: (terms: KeyTerm[]) => void;
  onSectionDetected?: (sections: PDFSection[]) => void;
}

export function PDFViewer({
  url,
  onDocumentLoad,
  onPageChange,
  onViewerInstanceChange,
  targetPage,
  onTextExtracted,
  onKeyTermsDetected,
  onSectionDetected
}: PDFViewerProps) {
  const [currentScale, setCurrentScale] = useState<number>(1.0);
  const [currentPage, setCurrentPage] = useState<number>(targetPage || 1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadingState, setLoadingState] = useState<'loading' | 'success' | 'error'>('loading');
  const [extractedText, setExtractedText] = useState<{text: string, positions: any[]}>({text: '', positions: []});
  const jumpToPageRef = useRef<((pageIndex: number) => void) | null>(null);
  
  // Initialize plugins
  const scrollModePluginInstance = scrollModePlugin();
  const toolbarPluginInstance = toolbarPlugin();
  const pageNavigationPluginInstance = pageNavigationPlugin();
  const { jumpToPage } = pageNavigationPluginInstance;
  const zoomPluginInstance = zoomPlugin();

  // Handle text extraction
  const handleTextExtracted = (text: string, positions: any[]) => {
    setExtractedText({text, positions});
    
    // Log text extraction debug info
    if (!text || text.trim().length === 0) {
      console.warn(`No text extracted from page ${currentPage}`);
    } else {
      console.log(`Successfully extracted ${text.length} characters from page ${currentPage}`);
      // Log first 100 chars to help with debugging
      console.debug(`Text sample: "${text.substring(0, 100)}..."`);
    }
    
    if (onTextExtracted) {
      onTextExtracted(text, positions, currentPage);
    }
  };
  
  // Handle key terms detection
  const handleKeyTermsDetected = (terms: KeyTerm[]) => {
    if (onKeyTermsDetected) {
      onKeyTermsDetected(terms);
    }
  };
  
  // Handle structure detection
  const handleStructureDetected = (sections: PDFSection[]) => {
    if (onSectionDetected) {
      onSectionDetected(sections);
    }
  };

  // Attempt a direct text extraction if the viewer fails
  const attemptDirectExtraction = async () => {
    try {
      setLoadingState('loading');
      // Import direct extraction utilities
      const { extractPDFText } = await import('@/lib/pdfDirectUtils');
      const pageNum = currentPage || 1;
      
      console.log(`Attempting direct text extraction for page ${pageNum}...`);
      const text = await extractPDFText(url, pageNum);
      
      if (text && text.length > 0) {
        console.log(`Successfully extracted ${text.length} characters directly`);
        // Create simple position data
        const positions = [{
          text,
          x: 0, y: 0,
          width: 612, height: 792, // Standard PDF size
          pageWidth: 612, pageHeight: 792
        }];
        
        handleTextExtracted(text, positions);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Direct text extraction failed:', error);
      return false;
    }
  };

  return (
    <Worker workerUrl={`//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`}>
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Reference Helper (invisible component) */}
        <PDFReferenceHelper
          pdfUrl={url}
          currentPage={currentPage}
          onTextExtracted={handleTextExtracted}
          onKeyTermsDetected={handleKeyTermsDetected}
        />
        
        {/* Enhanced Text Extractor (fallback/diagnostic) */}
        <PDFTextExtractor
          pdfUrl={url}
          currentPage={currentPage}
          onTextExtracted={(text, positions, page) => {
            // Only use this if the regular extractor didn't provide text
            if (!extractedText.text && text) {
              console.log('Using enhanced text extractor');
              handleTextExtracted(text, positions);
              
              // Log diagnostic information
              console.info(`Enhanced text extraction successful for page ${page}`);
              console.info(`Extracted ${text.length} characters`);
            }
          }}
          onError={(error) => {
            console.warn('Enhanced text extraction error:', error);
          }}
          enableFallbackMethods={true}
          maxRetries={3}
        />
        
        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto">
          {loadError ? (
            <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8 rounded-lg">
              <div className="text-red-500 text-xl mb-4">Error loading PDF</div>
              <p className="text-gray-700 mb-4">There was an error loading the PDF document. Please try again.</p>
              <p className="text-gray-500 text-sm mb-6">{loadError.message}</p>
              <div className="flex flex-col gap-3">
                <button 
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  onClick={async () => {
                    // Try direct extraction as a fallback
                    const success = await attemptDirectExtraction();
                    if (success) {
                      setLoadError(null);
                    } else {
                      alert("Could not extract text from this PDF. It may be a scanned document or have security restrictions.");
                    }
                  }}
                >
                  Extract Text Directly
                </button>
                
                <a 
                  href={`/pdf-debug?url=${encodeURIComponent(url)}&page=${currentPage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-center"
                >
                  Open PDF Diagnostic Tool
                </a>
              </div>
            </div>
          ) : (
            <Viewer
              fileUrl={url}
              defaultScale={1.0}
              onDocumentLoad={({ doc }) => {
                console.log('PDF loaded successfully:', doc);
                setTotalPages(doc.numPages);
                setLoadingState('success');
                onDocumentLoad(doc.numPages);
              }}
              onPageChange={(e: any) => {
                console.log('Page changed:', e);
                setCurrentPage(e.currentPage + 1);
                onPageChange(e.currentPage + 1);
              }}
              onZoom={({ scale }) => {
                console.log('Zoom changed:', scale);
                setCurrentScale(scale);
              }}
              theme={{
                theme: 'dark',
              }}
              renderLoader={(percentages: number) => (
                <div className="text-center py-5">
                  <div className="text-lg mb-2">Loading PDF... {Math.round(percentages)}%</div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-[#6A5DB9] h-2.5 rounded-full" 
                      style={{ width: `${Math.round(percentages)}%` }}
                    />
                  </div>
                </div>
              )}
              renderError={(error: any) => {
                console.error('PDF rendering error:', error);
                setLoadError(error);
                setLoadingState('error');
                return (
                  <div className="text-center py-5 text-red-600">
                    <p>Error loading PDF: {error.message || 'Unknown error occurred'}</p>
                    <p className="text-sm mt-2">Please try refreshing the page.</p>
                  </div>
                );
              }}
              plugins={[
                scrollModePluginInstance,
                toolbarPluginInstance,
                pageNavigationPluginInstance,
                zoomPluginInstance,
              ]}
              ref={(instance: any) => {
                if (instance) {
                  console.log('Viewer instance created');
                  onViewerInstanceChange(instance);
                }
              }}
            />
          )}
        </div>
      </div>
    </Worker>
  );
}

// Export the component with the original name for backward compatibility
export const PDFViewerComponent = PDFViewer;