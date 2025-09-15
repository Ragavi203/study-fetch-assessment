"use client";
// Force dynamic rendering to avoid prerender errors with useSearchParams
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DocumentLoadEvent,
  LoadError,
  RenderPageProps,
  SpecialZoomLevel,
  Worker,
  Viewer,
  PageChangeEvent
} from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import EnhancedPDFAnnotationCanvas from '@/components/EnhancedPDFAnnotationCanvas';
import SmartAnnotationProcessor from '@/components/SmartAnnotationProcessor';
import { KeyTerm } from '@/components/PDFReferenceHelper';
import { PDFSection } from '@/components/PDFStructureMapper';
import ChatBox from '@/components/ChatBox';
import { Annotation } from '@/types/types';
import PDFDiagnosticHelper from '@/components/PDFDiagnosticHelper';
import CleanPDFViewer from '@/components/CleanPDFViewer';
import EmergencyTextInjector from '@/components/EmergencyTextInjector';
import * as pdfjsLib from 'pdfjs-dist';

interface RenderPageLayerProps {
  canvasLayer: {
    children: React.ReactNode;
  };
  textLayer: {
    children: React.ReactNode;
  };
  annotationLayer: {
    children: React.ReactNode;
  };
}

interface RenderPageLayerProps {
  canvasLayer: {
    children: React.ReactNode;
  };
  textLayer: {
    children: React.ReactNode;
  };
  annotationLayer: {
    children: React.ReactNode;
  };
}



function PDFPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pdfId = searchParams.get('id');
  
  // Add custom styles for PDF viewer
  useEffect(() => {
    // Add custom styles to fix PDF viewer layout
    const style = document.createElement('style');
    style.textContent = `
      .rpv-core__viewer {
        width: 100% !important;
        height: 100% !important;
      }
      .rpv-core__page-layer {
        padding: 1rem !important;
      }
      .rpv-core__page {
        box-shadow: 0 0 10px rgba(0,0,0,0.1) !important;
        margin: 1rem auto !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [currentPdfId, setCurrentPdfId] = useState<string>("");
  const [pdfs, setPdfs] = useState<Array<{ id: string; url: string; title: string }>>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentScale, setCurrentScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cleanup annotations when navigating pages to prevent memory issues
  useEffect(() => {
    // Keep only annotations for current page and 5 nearby pages for better memory usage
    setAnnotations(prev => 
      prev.filter(a => 
        !a.page || 
        a.page === currentPage || 
        a.page === currentPage - 1 || 
        a.page === currentPage + 1 ||
        a.page === currentPage - 2 ||
        a.page === currentPage + 2
      ).slice(0, 150) // Hard limit on total annotations
    );
  }, [currentPage]);

  // Add keyboard navigation with debounce to prevent excessive rendering
  useEffect(() => {
    let isHandlingKeyPress = false;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      if (isHandlingKeyPress) return; // Prevent multiple rapid key presses
      
      isHandlingKeyPress = true;
      setTimeout(() => { isHandlingKeyPress = false; }, 300); // Debounce

      if (e.key === 'ArrowRight' && currentPage < totalPages) {
        setCurrentPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft' && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPage, totalPages]);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        router.push('/');
        return;
      }

      if (!pdfId) {
        router.push('/dashboard');
        return;
      }

      try {
        console.log('Fetching PDF with ID:', pdfId);
        const res = await fetch(`/api/pdf/${pdfId}`, {
          headers: {
            'Authorization': `Bearer ${storedToken}`
          }
        });

        console.log('PDF API response status:', res.status);
        const data = await res.json();
        console.log('PDF API response data:', data);

        if (res.ok) {
          console.group('PDF Loading Process');
          if (data.pdf && data.pdf.url) {
            const pdfUrl = data.pdf.url;
            console.log('🔍 Original PDF URL:', pdfUrl);
            console.log('📄 PDF ID:', data.pdf.id);
            
            // Add timestamp to force reload
            const urlWithTimestamp = `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
            console.log('🔗 Modified URL with timestamp:', urlWithTimestamp);
            setPdfUrl(urlWithTimestamp);
            setCurrentPdfId(data.pdf.id);
            
            // Pre-fetch the PDF to ensure it's accessible
            console.log('🔄 Pre-fetching PDF...');
            const response = await fetch(urlWithTimestamp);
            console.log('📥 PDF Response status:', response.status);
            console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
              console.error('❌ PDF fetch failed:', response.status, response.statusText);
              throw new Error(`PDF file not accessible (${response.status})`);
            }
            
            const blob = await response.blob();
            console.log('📦 PDF Blob type:', blob.type);
            console.log('📊 PDF Size:', (blob.size / 1024).toFixed(2), 'KB');
            
            if (blob.size === 0) {
              console.error('❌ PDF file is empty');
              throw new Error('PDF file is empty');
            }
            console.log('✅ PDF pre-fetch successful');
            console.groupEnd();
            
            // Set up PDF error handler after pdfUrl is available
            import('@/lib/pdfErrorHandler').then(({ setupGlobalPDFErrorHandler }) => {
              const errorHandler = setupGlobalPDFErrorHandler(urlWithTimestamp);
              console.log('PDF error handler set up for URL:', urlWithTimestamp);
            });
          } else {
            console.error('Invalid PDF data:', data);
            throw new Error('Invalid PDF data received');
          }
        } else if (res.status === 404) {
          setError('PDF not found');
          console.error('PDF not found:', pdfId);
          setTimeout(() => router.push('/dashboard'), 2000);
        } else {
          setError('Failed to load PDF');
          console.error('Failed to load PDF:', res.status, data);
          setTimeout(() => router.push('/dashboard'), 2000);
        }

        const response = await fetch('/api/auth/verify', {
          headers: {
            'Authorization': `Bearer ${storedToken}`
          }
        });

        if (response.ok) {
          setToken(storedToken);
        } else {
          throw new Error('Invalid token');
        }
      } catch (err) {
        console.error('Error:', err);
        setError('Failed to verify authentication. Please try logging in again.');
        localStorage.removeItem('token');
        setTimeout(() => window.location.href = '/', 2000);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
    
    // Clean up any error handlers when unmounting
    return () => {
      const errorElement = document.getElementById('pdf-error-message');
      if (errorElement && errorElement.parentNode) {
        errorElement.parentNode.removeChild(errorElement);
      }
    };
  }, [pdfId, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#2D2654]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4"></div>
          <p className="text-white">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#2D2654]">
        <div className="text-center p-8 max-w-md bg-red-50 rounded-lg">
          <h2 className="text-2xl font-bold mb-4 text-red-700">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#2D2654]">
      {/* Emergency text injector */}
      <EmergencyTextInjector />
      
      {/* Header */}
      <header className="bg-[#352D63] shadow-lg px-8 py-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 text-white hover:text-white/90 transition-colors"
            title="Back to Dashboard"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-white tracking-wide">Study Fetch Assessment</h1>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 p-2">
        <div className="flex gap-3 h-[calc(100vh-7rem)]">
          {/* Left Side - PDF Viewer */}
          <div className="w-1/2">
            <div className="h-full bg-[#352D63] rounded-xl shadow-xl p-1">
              {pdfUrl ? (
                <div className="h-full bg-white rounded-lg shadow-inner overflow-hidden relative">
                  {/* Add diagnostic helper */}
                  <PDFDiagnosticHelper 
                    pdfUrl={pdfUrl}
                    currentPage={currentPage}
                    onDiagnostic={(result) => {
                      console.log('PDF Diagnostic result:', result);
                      // Log specific issues for troubleshooting
                      if (!result.hasText) {
                        console.warn('No text content detected in PDF!');
                      }
                    }}
                  />
                  
                  {/* Add diagnostic tools button */}
                  <div className="absolute top-2 right-2 z-10">
                    <a 
                      href={`/pdf-debug?url=${encodeURIComponent(pdfUrl)}&page=${currentPage}`} 
                      target="_blank"
                      rel="noopener noreferrer" 
                      className="flex items-center bg-gray-700/80 hover:bg-gray-700/90 text-white text-xs px-3 py-1.5 rounded-md shadow transition-colors"
                      title="Open PDF diagnostic tools"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
                      </svg>
                      Diagnostics
                    </a>
                  </div>
                  
                  {/* Use Clean PDF Viewer for a cleaner interface */}
                  <CleanPDFViewer
                    url={pdfUrl}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={(page: number) => {
                      setCurrentPage(page);
                    }}
                    onLoad={() => {
                      console.log('PDF loaded successfully in enhanced viewer');
                      
                      // Try to get the number of pages for better navigation
                      import('@/lib/pdfDirectUtils').then(async ({ extractPDFText, isScannedPDF }) => {
                        try {
                          // First check if document is accessible
                          console.log('Checking PDF accessibility...');
                          
                          // Try to extract text from the first page as a test
                          console.log('Extracting text from first page...');
                          const text = await extractPDFText(pdfUrl, 1);
                          console.log(`Text extracted directly: ${text.substring(0, 100)}...`);
                          
                          // Check if this is a scanned PDF
                          console.log('Checking if PDF is scanned...');
                          const scanCheck = await isScannedPDF(pdfUrl, 1);
                          if (scanCheck.isScanned) {
                            console.warn(`PDF appears to be scanned (${scanCheck.confidence.toFixed(2)} confidence): ${scanCheck.reason}`);
                            
                            // Show a simple warning for scanned documents
                            const warningDiv = document.createElement('div');
                            warningDiv.className = 'absolute top-12 left-0 right-0 bg-yellow-100 text-yellow-800 px-4 py-2 text-sm border-b border-yellow-300 z-10';
                            warningDiv.innerHTML = `
                              <div class="flex items-center">
                                <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                                This appears to be a scanned document. Text analysis may be limited.
                              </div>
                            `;
                            document.body.appendChild(warningDiv);
                            setTimeout(() => {
                              try {
                                document.body.removeChild(warningDiv);
                              } catch (e) {
                                console.error('Error removing warning:', e);
                              }
                            }, 5000);
                          }
                          
                          // Try to get the total page count for better navigation
                          try {
                            const response = await fetch(pdfUrl, { cache: 'no-store' });
                            const arrayBuffer = await response.arrayBuffer();
                            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                            const pdf = await loadingTask.promise;
                            console.log(`PDF has ${pdf.numPages} pages`);
                            setTotalPages(pdf.numPages);
                          } catch (e) {
                            console.error('Error determining page count:', e);
                            setTotalPages(1); // Default to 1 if we can't determine the count
                          }
                          
                        } catch (err) {
                          console.error('PDF analysis error:', err);
                          setTotalPages(1); // Default to 1 if we can't determine the count
                        }
                      });
                    }}
                    onTextExtracted={(text: string) => {
                      // This is crucial for the AI to access the PDF text
                      console.log('Text extracted from PDF, length:', text.length);
                      // Store this text in a global variable for the AI to access
                      if (typeof window !== 'undefined') {
                        (window as any).currentPageText = text;
                        
                        // Also dispatch an event that the ChatBox can listen for
                        const event = new CustomEvent('pdf-text-extracted', { 
                          detail: { text, page: currentPage } 
                        });
                        window.dispatchEvent(event);
                      }
                    }}
                    onError={(error: Error) => {
                      console.error('Enhanced PDF viewer error:', error);
                      
                      // Try fallback options
                      import('@/lib/pdfDirectUtils').then(({ openPDFInNewTab }) => {
                        // Try to open in new tab as fallback
                        if (confirm(`Error loading PDF: ${error.message}\n\nWould you like to open it in a new tab?`)) {
                          openPDFInNewTab(pdfUrl);
                        }
                      });
                    }}
                  />

                  {/* Enhanced Annotation Canvas */}
                  <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <EnhancedPDFAnnotationCanvas 
                      pageWidth={612} // US Letter width in points for more accurate coordinate mapping
                      pageHeight={792} // US Letter height in points
                      annotations={annotations.filter(a => !a.page || a.page === currentPage).slice(0, 50)} // Limit annotations to prevent memory issues
                      currentPage={currentPage}
                      scale={1.0}
                      enableInteraction={false}
                      onAnnotationAdd={(annotation: Annotation) => {
                        // Limit the number of annotations to prevent memory issues
                        setAnnotations(prev => {
                          const newAnnotations = [...prev, annotation].slice(-100); // Keep only the last 100 annotations
                          return newAnnotations;
                        });
                      }}
                    />
                  </div>
                  
                  {/* Smart Annotation Processor */}
                  <SmartAnnotationProcessor
                    onAnnotationAdd={(newAnnotations) => {
                      // Only take the first 20 annotations from any batch to prevent performance issues
                      const limitedAnnotations = newAnnotations.slice(0, 20);
                      setAnnotations(prev => {
                        // Combine with existing annotations but keep total under control
                        const combined = [...prev, ...limitedAnnotations];
                        // Only keep the most recent 150 annotations
                        return combined.slice(-150);
                      });
                    }}
                    onPageChange={setCurrentPage}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    isActive={true}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center bg-white/10 rounded-xl">
                  <div className="text-center text-white/70">
                    <p className="text-xl mb-2">Loading PDF...</p>
                    <p className="text-sm mb-4">{pdfUrl ? 'Preparing document...' : 'Fetching document...'}</p>
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/30 border-t-white mx-auto"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Side - Chat Section */}
          <div className="w-1/2">
            <ChatBox 
              pdfUrl={pdfUrl}
              pdfId={currentPdfId}
              onAnnotation={(newAnnotations) => {
                // The SmartAnnotationProcessor now handles this, but keep for backward compatibility
                const limitedAnnotations = newAnnotations.slice(0, 20);
                setAnnotations(prev => {
                  const combined = [...prev, ...limitedAnnotations];
                  return combined.slice(-150);
                });
              }}
              token={token}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              // Pass the text directly from the parent when available
              initialPdfText={(window as any).currentPageText || ""}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PDFPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading PDF page...</div>}>
      <PDFPageInner />
    </Suspense>
  );
}
