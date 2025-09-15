// PDFViewerComponent.tsx
import { useState, useEffect, useRef } from 'react';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { PDFNavigationHelper } from './PDFNavigationHelper';
import { PDFStructureMapper, PDFSection } from './PDFStructureMapper';
import { PDFReferenceHelper, KeyTerm } from './PDFReferenceHelper';
import { PDFTextExtractor } from './PDFTextExtractor';
import AIForcedTextProvider from './AIForcedTextProvider';
import { useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Import only core styles - these are always required
import '@react-pdf-viewer/core/lib/styles/index.css';

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

// Create custom minimal styles for plugins
const pluginStyles = `
  /* Minimal styles for scroll mode plugin */
  .rpv-scroll-mode__pages-container {
    overflow: auto;
    position: relative;
    height: 100%;
  }

  /* Minimal styles for toolbar plugin */
  .rpv-toolbar {
    align-items: center;
    background-color: #eee;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    display: flex;
    padding: 4px;
  }
  
  /* Minimal styles for page navigation */
  .rpv-page-navigation__label {
    font-size: 14px;
    margin: 0 8px;
  }
  
  /* Minimal styles for zoom plugin */
  .rpv-zoom__popover {
    background-color: #fff;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 8px;
    position: absolute;
    z-index: 1;
  }
`;

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

export function PDFViewerComponent({ 
  url, 
  onDocumentLoad, 
  onPageChange,
  onViewerInstanceChange,
  targetPage,
  onTextExtracted,
  onKeyTermsDetected,
  onSectionDetected
}: PDFViewerProps) {
  // Set PDF worker source for more reliable loading
  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }
  const [currentScale, setCurrentScale] = useState<number>(1.0);
  const [currentPage, setCurrentPage] = useState<number>(targetPage || 1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [showStructurePanel, setShowStructurePanel] = useState<boolean>(false);
  const [detectedSections, setDetectedSections] = useState<PDFSection[]>([]);
  const [extractedText, setExtractedText] = useState<{text: string, positions: any[]}>({text: '', positions: []});
  const jumpToPageRef = useRef<((pageIndex: number) => void) | null>(null);
  
  // Initialize plugins
  const scrollModePluginInstance = scrollModePlugin();
  const toolbarPluginInstance = toolbarPlugin();
  const pageNavigationPluginInstance = pageNavigationPlugin();
  const { jumpToPage } = pageNavigationPluginInstance;
  
  const zoomPluginInstance = zoomPlugin();
  
  // Track loading errors
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadingState, setLoadingState] = useState<'loading' | 'success' | 'error'>('loading');
  
  // Handle page navigation when targetPage changes
  useEffect(() => {
    if (targetPage !== undefined && jumpToPageRef.current) {
      console.log(`Navigating to page ${targetPage}`);
      setCurrentPage(targetPage);
      jumpToPageRef.current(targetPage - 1);
      
      // Add a highlight effect to show the navigation
      const highlightNavigation = () => {
        const pdfContainer = document.querySelector('.rpv-core__viewer');
        if (pdfContainer) {
          pdfContainer.classList.add('page-navigation-highlight');
          setTimeout(() => {
            pdfContainer.classList.remove('page-navigation-highlight');
          }, 1000);
        }
      };
      
      setTimeout(highlightNavigation, 300);
    }
  }, [targetPage]);
  
  // Store the jumpToPage function when available
  useEffect(() => {
    jumpToPageRef.current = jumpToPage;
  }, [jumpToPage]);
  
  // Handle text extraction with enhanced reliability
  const handleTextExtracted = (text: string, positions: any[]) => {
    setExtractedText({text, positions});
    
    // Log text extraction debug info
    if (!text || text.trim().length === 0) {
      console.warn(`No text extracted from page ${currentPage}`);
      
      // Attempt manual extraction as a fallback
      setTimeout(async () => {
        try {
          console.log("Attempting emergency fallback text extraction...");
          
          // Try using both our utilities for maximum success chance
          const { extractPDFText } = await import('@/lib/pdfDirectUtils');
          const directText = await extractPDFText(url, currentPage);
          
          if (directText && directText.length > 0) {
            console.log(`Emergency extraction successful: ${directText.length} chars`);
            
            // Store in multiple places for redundancy
            if (typeof window !== 'undefined') {
              (window as any).currentPageText = directText;
              (window as any).pdfTextCache = (window as any).pdfTextCache || {};
              (window as any).pdfTextCache[`${url}_${currentPage}`] = directText;
              
              // Dispatch event so ChatBox can pick it up
              window.dispatchEvent(new CustomEvent('pdf-text-extracted', { 
                detail: { text: directText, page: currentPage } 
              }));
              
              // Also try direct DOM-based access for ChatBox
              const chatContainer = document.querySelector('.chat-container');
              if (chatContainer) {
                chatContainer.setAttribute('data-pdf-text', directText);
                console.log('Set PDF text directly on chat container');
              }
            }
            
            if (onTextExtracted) {
              onTextExtracted(directText, positions, currentPage);
            }
          }
        } catch (err) {
          console.error('Emergency text extraction failed:', err);
        }
      }, 1000);
      
    } else {
      console.log(`Successfully extracted ${text.length} characters from page ${currentPage}`);
      // Log first 100 chars to help with debugging
      console.debug(`Text sample: "${text.substring(0, 100)}..."`);
      
      // Store in global for direct access (most important for AI)
      if (typeof window !== 'undefined') {
        (window as any).currentPageText = text;
        console.log(`Set ${text.length} characters to window.currentPageText`);
        
        // Initialize cache if needed
        if (!(window as any).pdfTextCache) {
          (window as any).pdfTextCache = {};
        }
        
        // Cache by URL and page
        (window as any).pdfTextCache[`${url}_${currentPage}`] = text;
        
        // Dispatch event for components to listen for
        const event = new CustomEvent('pdf-text-extracted', { 
          detail: { 
            text, 
            page: currentPage,
            timestamp: Date.now()
          } 
        });
        console.log('Dispatching pdf-text-extracted event');
        window.dispatchEvent(event);
      }
    }
    
    // Always pass text to parent component
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
  
  // Handle sections detection
  const handleSectionsDetected = (sections: PDFSection[]) => {
    setDetectedSections(sections);
    
    if (onSectionDetected) {
      onSectionDetected(sections);
    }
  };
  
  // Handle navigation to section
  const handleNavigateToSection = (section: PDFSection) => {
    if (jumpToPageRef.current) {
      jumpToPageRef.current(section.pageNumber - 1);
      setCurrentPage(section.pageNumber);
      onPageChange(section.pageNumber);
    }
  };
  
  // Handle page navigation with custom component
  const handleCustomPageChange = (pageNum: number) => {
    if (jumpToPageRef.current) {
      jumpToPageRef.current(pageNum - 1);
      setCurrentPage(pageNum);
      onPageChange(pageNum);
    }
  };
  
  // Handle zoom change from custom component
  const handleZoomChange = (scale: number) => {
    zoomPluginInstance.zoomTo(scale);
  };
  
  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
      {/* Add emergency text provider to ensure AI can access text */}
      <AIForcedTextProvider />
      <style dangerouslySetInnerHTML={{ __html: pluginStyles }} />
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Enhanced Navigation Controls */}
        <PDFNavigationHelper
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handleCustomPageChange}
          onZoomChange={handleZoomChange}
          initialScale={currentScale}
          showThumbnails={true}
          pdfUrl={url}
        />
        
        {/* Toggle Structure Panel */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowStructurePanel(!showStructurePanel)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              showStructurePanel ? 'bg-[#6A5DB9] text-white' : 'bg-[#453A7C] text-white/80'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span>{showStructurePanel ? 'Hide Document Structure' : 'Show Document Structure'}</span>
          </button>
          
          {detectedSections.length > 0 && (
            <div className="text-sm text-white/70">
              <span>{detectedSections.length} sections detected</span>
            </div>
          )}
        </div>
        
        {/* Structure Panel (conditional) */}
        {showStructurePanel && (
          <PDFStructureMapper
            pdfUrl={url}
            onSectionDetected={handleSectionsDetected}
            onNavigateToSection={handleNavigateToSection}
            currentPage={currentPage}
          />
        )}
        
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
            // Always use the extracted text, even if we already have some
            if (text) {
              console.log('Using enhanced text extractor');
              handleTextExtracted(text, positions);
              
              // Log diagnostic information
              console.info(`Enhanced text extraction successful for page ${page}`);
              console.info(`Extracted ${text.length} characters`);
              
              // Also store directly in window for immediate access
              if (typeof window !== 'undefined') {
                (window as any).currentPageText = text;
                
                // Add helpful metadata
                if (text.toLowerCase().includes('reflection') || 
                    text.toLowerCase().includes('six sigma') ||
                    text.toLowerCase().includes('personal learning')) {
                  const enhancedText = `[DOCUMENT TYPE: Student Essay/Reflection]\n${text}`;
                  (window as any).currentPageText = enhancedText;
                  
                  // Dispatch special event for AI to pick up
                  window.dispatchEvent(new CustomEvent('pdf-text-extracted', { 
                    detail: { 
                      text: enhancedText, 
                      page: currentPage,
                      documentType: 'essay'
                    } 
                  }));
                }
              }
            }
          }}
          onError={(error) => {
            console.warn('Enhanced text extraction error:', error);
          }}
          enableFallbackMethods={true}
          maxRetries={3}  // Try up to 3 times
          includeAnnotations={true}  // Get annotations too
        />
        
        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto">
          {loadError ? (
            <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8 rounded-lg">
              <div className="text-red-500 text-xl mb-4">Error loading PDF</div>
              <p className="text-gray-700 mb-4">There was an error loading the PDF document. Please try again.</p>
              <p className="text-gray-500 text-sm mb-6">{loadError.message}</p>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                onClick={async () => {
                  try {
                    // Attempt direct access check first to diagnose the issue
                    const { extractPDFText, checkPDFAccessibility } = await import('@/lib/pdfDirectUtils');
                    const checkResult = await checkPDFAccessibility(url);
                    
                    if (!checkResult.accessible) {
                      console.error('PDF access issue:', checkResult.reason);
                      alert(`Cannot load PDF: ${checkResult.reason}`);
                      return;
                    }
                    
                    // PDF seems accessible, try direct text extraction
                    const pageNum = currentPage || 1;
                    const text = await extractPDFText(url, pageNum);
                    
                    if (text) {
                      console.log(`Successfully extracted ${text.length} chars directly`);
                      if (onTextExtracted) {
                        onTextExtracted(text, [], pageNum);
                      }
                    }
                    
                    // Reset errors and try loading in the viewer again
                    setLoadError(null);
                    setLoadingState('loading');
                  } catch (error) {
                    console.error('Error in direct PDF check:', error);
                    alert('PDF couldn\'t be loaded. Try downloading it first.');
                  }
                }}
              >
                Retry Loading
              </button>
            </div>
          ) : (
            <Worker workerUrl={`//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`}>
              <Viewer
                fileUrl={url}
                withCredentials={true}
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
            renderPage={(props: any) => (
              <>
                {props.canvasLayer.children}
                {props.textLayer.children}
                {/* We don't render annotations here because we use our custom annotation layer */}
              </>
            )}
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
            renderError={(error: any) => (
              <div className="text-center py-5 text-red-600">
                <p>Error loading PDF: {error.message || 'Unknown error occurred'}</p>
                <p className="text-sm mt-2">Please try refreshing the page.</p>
              </div>
            )}
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
            </Worker>
          )}
        </div>
      </div>
      
      {/* Add styles for navigation highlighting */}
      <style jsx global>{`
        @keyframes navigationHighlight {
          0% { box-shadow: 0 0 0 0 rgba(106, 93, 185, 0.5); }
          50% { box-shadow: 0 0 0 10px rgba(106, 93, 185, 0.3); }
          100% { box-shadow: 0 0 0 0 rgba(106, 93, 185, 0); }
        }
        
        .page-navigation-highlight {
          animation: navigationHighlight 1s ease-out;
        }
      `}</style>
    </Worker>
  );
}
