"use client";
import { useState, useEffect } from 'react';
import { diagnoseTextExtraction, PDFDiagnosticResult } from '@/lib/pdfDebugUtils';

interface PDFDiagnosticHelperProps {
  pdfUrl: string;
  currentPage: number;
  onDiagnostic?: (result: PDFDiagnosticResult) => void;
}

/**
 * Helper component to automatically diagnose PDF text extraction issues
 * and display solutions when problems are detected
 */
export default function PDFDiagnosticHelper({
  pdfUrl,
  currentPage,
  onDiagnostic
}: PDFDiagnosticHelperProps) {
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<PDFDiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [retries, setRetries] = useState(0);

  // Run a diagnostic when the URL or page changes, or on manual trigger
  const runDiagnostic = async (force = false) => {
    // Skip if already running or we've already run a diagnostic for this URL/page
    if (loading || (!force && diagnosticResult)) return;
    
    if (!pdfUrl) return;
    
    setLoading(true);
    
    try {
      const result = await diagnoseTextExtraction(pdfUrl, currentPage);
      setDiagnosticResult(result);
      
      // If the diagnostic indicates problems, show the diagnostic UI
      if (!result.success || !result.hasText || result.warnings.length > 0) {
        setShowDiagnostic(true);
      }
      
      // Notify parent component
      if (onDiagnostic) {
        onDiagnostic(result);
      }
    } catch (error) {
      console.error('PDF Diagnostic error:', error);
      
      // If we have retries left, try again after a short delay
      if (retries < 2) {
        setTimeout(() => {
          setRetries(prev => prev + 1);
          runDiagnostic(true);
        }, 1500);
      } else {
        // Add a clear recommendation for scanned documents
        const result: PDFDiagnosticResult = {
          success: false,
          hasText: false,
          textLength: 0,
          textItems: 0,
          textContent: '',
          pdfInfo: null,
          pageInfo: null,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: ['Text extraction failed after multiple attempts'],
          recommendations: [
            'This may be a scanned or image-based document without embedded text',
            'Try using a PDF with machine-readable text instead of scanned images',
            'Or process this document with OCR software before uploading'
          ],
          executionTimeMs: 0
        };
        
        setDiagnosticResult(result);
        if (onDiagnostic) {
          onDiagnostic(result);
        }
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Run diagnostic when PDF URL or page changes
  useEffect(() => {
    if (pdfUrl && currentPage > 0) {
      // Reset state for new URL/page
      setDiagnosticResult(null);
      setShowDiagnostic(false);
      setRetries(0);
      
      // Run diagnostic with slight delay to allow PDF to load
      const timer = setTimeout(() => {
        runDiagnostic();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [pdfUrl, currentPage]);

  // If not showing diagnostic, return nothing
  if (!showDiagnostic) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-md bg-white rounded-lg shadow-lg border border-orange-200">
      <div className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-gray-800">PDF Content Issue Detected</h3>
          <button 
            onClick={() => setShowDiagnostic(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {loading ? (
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Analyzing PDF content...</span>
          </div>
        ) : diagnosticResult ? (
          <>
            <div className="mb-3 text-gray-600">
              {!diagnosticResult.hasText ? (
                <p>No text content could be extracted from this PDF page. This could be because:</p>
              ) : !diagnosticResult.success ? (
                <p>There was a problem extracting text from this PDF.</p>
              ) : (
                <p>Some issues were detected with the PDF content.</p>
              )}
            </div>
            
            {/* Issues and recommendations */}
            {diagnosticResult.warnings.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-semibold text-orange-700 mb-1">Issues:</div>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {diagnosticResult.warnings.slice(0, 3).map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {diagnosticResult.recommendations.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-semibold text-blue-700 mb-1">Solutions:</div>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {diagnosticResult.recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => runDiagnostic(true)}
                className="text-blue-600 text-sm hover:text-blue-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry Analysis
              </button>
              
              <a
                href={`/test/pdf-debug?url=${encodeURIComponent(pdfUrl)}&page=${currentPage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 text-sm hover:text-purple-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Advanced Diagnostics
              </a>
            </div>
          </>
        ) : (
          <p className="text-gray-600">Initializing PDF analysis...</p>
        )}
      </div>
    </div>
  );
}