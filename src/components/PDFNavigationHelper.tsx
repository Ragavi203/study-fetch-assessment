import React, { useState, useEffect, useRef } from 'react';

interface PDFNavigationHelperProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (pageNum: number) => void;
  onZoomChange?: (scale: number) => void;
  initialScale?: number;
  showThumbnails?: boolean;
  pdfUrl: string;
}

/**
 * This component provides enhanced PDF navigation capabilities including:
 * - Page navigation controls
 * - Zoom controls
 * - Page thumbnails (optional)
 * - Jump to section functionality
 */
export function PDFNavigationHelper({
  currentPage,
  totalPages,
  onPageChange,
  onZoomChange,
  initialScale = 1.0,
  showThumbnails = false,
  pdfUrl,
}: PDFNavigationHelperProps) {
  const [scale, setScale] = useState<number>(initialScale);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState<boolean>(false);
  const [jumpToPage, setJumpToPage] = useState<string>('');
  const [showPagePreview, setShowPagePreview] = useState<boolean>(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState<boolean>(false);
  
  // Ref to track active timeouts
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  // Handle page navigation with visual feedback
  const navigateWithFeedback = (newPage: number, reason?: string) => {
    // Validate page number
    if (newPage < 1 || newPage > totalPages) return;
    
    // Clear any existing timeouts
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    // Apply the page change
    onPageChange(newPage);
    
    // Add a visual feedback effect
    const feedbackElement = document.createElement('div');
    feedbackElement.className = 'fixed inset-0 bg-blue-500 bg-opacity-20 z-50 flex items-center justify-center transition-opacity duration-500 pointer-events-none';
    feedbackElement.style.opacity = '0';
    
    // Create inner content
    const innerContent = document.createElement('div');
    innerContent.className = 'bg-blue-800 bg-opacity-80 text-white px-6 py-4 rounded-xl shadow-2xl';
    
    // Page indicator
    const pageIndicator = document.createElement('div');
    pageIndicator.className = 'text-3xl font-bold text-center';
    pageIndicator.textContent = `Page ${newPage}`;
    innerContent.appendChild(pageIndicator);
    
    // Reason (if provided)
    if (reason) {
      const reasonElement = document.createElement('div');
      reasonElement.className = 'text-sm mt-2 text-blue-200';
      reasonElement.textContent = reason;
      innerContent.appendChild(reasonElement);
    }
    
    feedbackElement.appendChild(innerContent);
    document.body.appendChild(feedbackElement);
    
    // Animate in
    setTimeout(() => {
      feedbackElement.style.opacity = '1';
    }, 10);
    
    // Animate out and remove
    navigationTimeoutRef.current = setTimeout(() => {
      feedbackElement.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(feedbackElement);
      }, 500);
    }, 1500);
  };

  // Generate thumbnails when showThumbnails is true
  useEffect(() => {
    if (showThumbnails && pdfUrl && thumbnails.length === 0 && !isGeneratingThumbs) {
      const generateThumbnails = async () => {
        try {
          setIsGeneratingThumbs(true);
          
          // Dynamic import pdfjsLib to reduce initial load time
          const pdfjsLib = await import('pdfjs-dist');
          const pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
          
          // Limit the number of thumbnails for performance
          const maxThumbnails = Math.min(totalPages, 20);
          const thumbsArray: string[] = [];
          
          // Generate thumbnails for first few pages
          for (let i = 1; i <= maxThumbnails; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 0.2 }); // Small scale for thumbnails
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
              canvasContext: context!,
              viewport: viewport
            }).promise;
            
            thumbsArray.push(canvas.toDataURL());
            
            // If we've generated 5 thumbnails, update the state to show progress
            if (i % 5 === 0 || i === maxThumbnails) {
              setThumbnails([...thumbsArray]);
            }
          }
          
          setIsGeneratingThumbs(false);
        } catch (error) {
          console.error('Error generating thumbnails:', error);
          setIsGeneratingThumbs(false);
        }
      };
      
      generateThumbnails();
    }
  }, [showThumbnails, pdfUrl, totalPages, thumbnails.length, isGeneratingThumbs]);
  
  // Scroll active thumbnail into view
  useEffect(() => {
    if (thumbnailContainerRef.current && showThumbnails) {
      const activeThumb = thumbnailContainerRef.current.querySelector(`[data-page="${currentPage}"]`);
      if (activeThumb) {
        activeThumb.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [currentPage, showThumbnails]);

  // Handle zoom in
  const zoomIn = () => {
    const newScale = parseFloat((scale + 0.1).toFixed(1));
    setScale(newScale);
    if (onZoomChange) onZoomChange(newScale);
  };

  // Handle zoom out
  const zoomOut = () => {
    const newScale = Math.max(0.1, parseFloat((scale - 0.1).toFixed(1)));
    setScale(newScale);
    if (onZoomChange) onZoomChange(newScale);
  };

  // Handle jump to page form submission
  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpToPage);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      navigateWithFeedback(pageNum, 'Jumped to page');
      setIsJumpModalOpen(false);
      setJumpToPage('');
    }
  };

  return (
    <div className="pdf-navigation-helper">
      {/* Main navigation controls */}
      <div className="flex items-center justify-between bg-[#352D63] p-4 rounded-xl shadow-lg mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWithFeedback(1, 'First page')}
            disabled={currentPage === 1}
            className="p-2 bg-[#6A5DB9] rounded-lg text-white hover:bg-[#7A6DC9] disabled:bg-[#2D2654] disabled:text-white/50 transition-all"
            aria-label="First page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <button
            onClick={() => navigateWithFeedback(currentPage - 1, 'Previous page')}
            disabled={currentPage === 1}
            className="p-2 bg-[#6A5DB9] rounded-lg text-white hover:bg-[#7A6DC9] disabled:bg-[#2D2654] disabled:text-white/50 transition-all"
            aria-label="Previous page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div 
            className="px-4 py-2 bg-[#2D2654] text-white rounded-lg cursor-pointer hover:bg-[#453A7C]"
            onClick={() => setIsJumpModalOpen(true)}
          >
            <span className="font-medium">Page {currentPage} of {totalPages}</span>
          </div>
          
          <button
            onClick={() => navigateWithFeedback(currentPage + 1, 'Next page')}
            disabled={currentPage === totalPages}
            className="p-2 bg-[#6A5DB9] rounded-lg text-white hover:bg-[#7A6DC9] disabled:bg-[#2D2654] disabled:text-white/50 transition-all"
            aria-label="Next page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => navigateWithFeedback(totalPages, 'Last page')}
            disabled={currentPage === totalPages}
            className="p-2 bg-[#6A5DB9] rounded-lg text-white hover:bg-[#7A6DC9] disabled:bg-[#2D2654] disabled:text-white/50 transition-all"
            aria-label="Last page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="p-2 bg-[#6A5DB9] rounded-lg text-white hover:bg-[#7A6DC9] disabled:bg-[#2D2654] disabled:text-white/50 transition-all"
            aria-label="Zoom out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="px-3 py-1 bg-[#2D2654] text-white rounded-lg min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-2 bg-[#6A5DB9] rounded-lg text-white hover:bg-[#7A6DC9] disabled:bg-[#2D2654] disabled:text-white/50 transition-all"
            aria-label="Zoom in"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          
          <button
            onClick={() => setShowPagePreview(!showPagePreview)}
            className={`p-2 rounded-lg text-white transition-all ${
              showPagePreview ? 'bg-[#6A5DB9]' : 'bg-[#2D2654]'
            } hover:bg-[#7A6DC9]`}
            aria-label="Toggle thumbnails"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Page thumbnails */}
      {showPagePreview && showThumbnails && (
        <div 
          className="h-24 mb-4 bg-[#2D2654] rounded-xl p-2 shadow-inner overflow-x-auto flex gap-2"
          ref={thumbnailContainerRef}
        >
          {isGeneratingThumbs && thumbnails.length === 0 && (
            <div className="flex items-center justify-center w-full">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-purple-300 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-purple-300 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-purple-300 animate-bounce" style={{ animationDelay: '600ms' }}></div>
              </div>
              <span className="ml-3 text-white text-sm">Generating thumbnails...</span>
            </div>
          )}
          
          {thumbnails.map((thumbnail, index) => (
            <div 
              key={`thumb-${index}`}
              data-page={index + 1}
              className={`cursor-pointer min-w-[80px] h-full rounded-lg overflow-hidden border-2 transition-all ${
                currentPage === index + 1 
                  ? 'border-blue-500 shadow-lg shadow-blue-500/30' 
                  : 'border-transparent hover:border-purple-500'
              }`}
              onClick={() => navigateWithFeedback(index + 1)}
            >
              <div className="relative h-full">
                <img 
                  src={thumbnail} 
                  alt={`Page ${index + 1} thumbnail`} 
                  className="h-full object-contain mx-auto"
                />
                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-xs py-0.5">
                  {index + 1}
                </div>
              </div>
            </div>
          ))}
          
          {/* Placeholder thumbnails for pages we haven't generated yet */}
          {thumbnails.length > 0 && thumbnails.length < totalPages && Array.from({length: Math.min(totalPages - thumbnails.length, 5)}).map((_, i) => (
            <div 
              key={`placeholder-${i}`}
              className="min-w-[80px] h-full bg-[#453A7C]/50 rounded-lg flex items-center justify-center"
            >
              <span className="text-white/60 text-xs">Page {thumbnails.length + i + 1}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Jump to page modal */}
      {isJumpModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#352D63] rounded-xl p-6 shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-semibold text-white mb-4">Go to Page</h3>
            <form onSubmit={handleJumpToPage}>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpToPage}
                onChange={(e) => setJumpToPage(e.target.value)}
                placeholder={`Enter page number (1-${totalPages})`}
                className="w-full px-4 py-3 bg-[#2D2654] border border-[#6A5DB9] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                autoFocus
              />
              
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsJumpModalOpen(false)}
                  className="px-4 py-2 bg-[#2D2654] text-white rounded-lg hover:bg-[#453A7C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6A5DB9] text-white rounded-lg hover:bg-[#7A6DC9]"
                >
                  Go
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Keyboard shortcuts */}
      <div className="sr-only">
        <p>Keyboard shortcuts:</p>
        <ul>
          <li>Left arrow: Previous page</li>
          <li>Right arrow: Next page</li>
          <li>Home: First page</li>
          <li>End: Last page</li>
          <li>Ctrl + '+': Zoom in</li>
          <li>Ctrl + '-': Zoom out</li>
        </ul>
      </div>
      
      {/* Add keyboard navigation */}
      <style jsx>{`
        @keyframes navigationHighlight {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0.3); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        
        .page-navigation-highlight {
          animation: navigationHighlight 1s ease-out;
        }
      `}</style>
    </div>
  );
}