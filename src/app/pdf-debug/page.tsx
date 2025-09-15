"use client";
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import * as pdfjsLib from 'pdfjs-dist';
import { extractPDFText, checkPDFAccessibility, isScannedPDF } from '@/lib/pdfDirectUtils';

// Configure the worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

function PDFDebugPageInner() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState<string>('');
  const [pageNum, setPageNum] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [accessibilityInfo, setAccessibilityInfo] = useState<any>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [textLength, setTextLength] = useState<number>(0);
  
  // Get URL and page from query parameters
  useEffect(() => {
    const pdfUrl = searchParams.get('url');
    const page = searchParams.get('page');
    
    if (pdfUrl) {
      setUrl(pdfUrl);
    }
    
    if (page) {
      const pageNumber = parseInt(page, 10);
      if (!isNaN(pageNumber) && pageNumber > 0) {
        setPageNum(pageNumber);
      }
    }
  }, [searchParams]);
  
  // Additional state for enhanced diagnostics
  const [pdfDetails, setPdfDetails] = useState<any>(null);
  const [scanInfo, setScanInfo] = useState<any>(null);
  
  // Run diagnostics when URL is available
  useEffect(() => {
    if (url) {
      runDiagnostics();
    }
  }, [url, pageNum]);
  
  const runDiagnostics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Check PDF accessibility first
      const accessResult = await checkPDFAccessibility(url);
      setAccessibilityInfo(accessResult);
      
      if (!accessResult.accessible) {
        setError(`PDF is not accessible: ${accessResult.reason}`);
        setIsLoading(false);
        return;
      }
      
      // Get detailed PDF information
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const arrayBuffer = await response.arrayBuffer();
        
        // Load PDF document with explicit options
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true
        });
        
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Basic PDF details
        const details = {
          pageCount: pdf.numPages,
          currentPage: pageNum,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          pageRotation: viewport.rotation,
        };
        
        setPdfDetails(details);
      } catch (pdfError) {
        console.error('Error getting PDF details:', pdfError);
      }
      
      // Check if the PDF is scanned
      try {
        const scanCheck = await isScannedPDF(url, pageNum);
        setScanInfo(scanCheck);
      } catch (scanError) {
        console.error('Error checking if PDF is scanned:', scanError);
      }
      
      // Try text extraction
      const text = await extractPDFText(url, pageNum);
      setExtractedText(text);
      setTextLength(text.length);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">PDF Diagnostics Tool</h1>
      
      <div className="mb-6">
        <div className="flex gap-4 mb-4">
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter PDF URL"
            className="flex-1 p-2 border rounded"
          />
          <input 
            type="number"
            value={pageNum}
            onChange={(e) => setPageNum(parseInt(e.target.value, 10))}
            min={1}
            className="w-20 p-2 border rounded"
          />
          <button 
            onClick={runDiagnostics}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? 'Checking...' : 'Run Diagnostics'}
          </button>
        </div>
        
        {/* Display URL and page info */}
        {url && (
          <div className="text-sm text-gray-600 mb-4">
            Analyzing page {pageNum} of <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{url}</a>
          </div>
        )}
      </div>
      
      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}
      
      {/* Accessibility info */}
      {accessibilityInfo && (
        <div className={`mb-6 p-4 border-l-4 ${accessibilityInfo.accessible ? 'bg-green-100 border-green-500 text-green-700' : 'bg-yellow-100 border-yellow-500 text-yellow-700'}`}>
          <p className="font-bold">PDF Accessibility Check</p>
          <p>Status: {accessibilityInfo.accessible ? 'Accessible ✅' : 'Not Accessible ❌'}</p>
          {accessibilityInfo.reason && <p>Reason: {accessibilityInfo.reason}</p>}
          {accessibilityInfo.errorCode && <p>Error Code: {accessibilityInfo.errorCode}</p>}
        </div>
      )}
      
      {/* PDF Details */}
      {pdfDetails && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-3 text-blue-800">PDF Details</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="font-medium">Total Pages:</div>
            <div>{pdfDetails.pageCount}</div>
            <div className="font-medium">Current Page:</div>
            <div>{pdfDetails.currentPage} of {pdfDetails.pageCount}</div>
            <div className="font-medium">Page Dimensions:</div>
            <div>{pdfDetails.pageWidth} × {pdfDetails.pageHeight} points</div>
            <div className="font-medium">Rotation:</div>
            <div>{pdfDetails.pageRotation}°</div>
          </div>
        </div>
      )}
      
      {/* Scan detection results */}
      {scanInfo && (
        <div className={`mb-6 p-4 border rounded-lg ${
          scanInfo.isScanned 
            ? 'bg-yellow-50 border-yellow-300' 
            : 'bg-green-50 border-green-300'
        }`}>
          <h2 className="text-xl font-semibold mb-3">
            {scanInfo.isScanned 
              ? '🔍 Scan Detection: Likely a Scanned Document'
              : '✅ Scan Detection: Text-based Document'}
          </h2>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="font-medium">Confidence:</div>
            <div>{(scanInfo.confidence * 100).toFixed(0)}%</div>
            
            {scanInfo.textDensity !== undefined && (
              <>
                <div className="font-medium">Text Density:</div>
                <div>{scanInfo.textDensity.toExponential(3)} chars/pt²</div>
              </>
            )}
            
            {scanInfo.textCount !== undefined && (
              <>
                <div className="font-medium">Character Count:</div>
                <div>{scanInfo.textCount}</div>
              </>
            )}
            
            {scanInfo.reason && (
              <>
                <div className="font-medium">Reasoning:</div>
                <div>{scanInfo.reason}</div>
              </>
            )}
          </div>
          
          {scanInfo.isScanned && (
            <div className="mt-4 p-3 bg-yellow-100 text-yellow-800 text-sm rounded">
              <strong>Note:</strong> Scanned documents are displayed as images, which may cause problems in some PDF viewers. 
              Text extraction is limited, and features like AI analysis, highlighting, and annotation may not work properly.
            </div>
          )}
        </div>
      )}
      
      {/* Text extraction results */}
      {extractedText && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Extracted Text</h2>
          <div className="mb-2 text-sm">
            <span className="font-medium">Length:</span> {textLength} characters
            {textLength === 0 && (
              <p className="text-red-600 mt-1">
                No text could be extracted. This may be a scanned or image-based PDF.
              </p>
            )}
          </div>
          
          <div className="border rounded p-4 bg-gray-50 max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {extractedText || "No text content extracted"}
            </pre>
          </div>
        </div>
      )}
      
      {/* PDF Preview */}
      {!error && url && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">PDF Preview</h2>
          <div className="border rounded-lg overflow-hidden bg-gray-100">
            <div className="aspect-w-4 aspect-h-5 w-full" style={{ height: '500px' }}>
              <iframe 
                src={url} 
                className="w-full h-full border-none"
                title="PDF Preview"
              />
            </div>
            <div className="p-3 border-t flex justify-center gap-3">
              <button
                onClick={() => window.open(url, '_blank')}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
              >
                Open in New Tab
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Recommendations */}
      <div className="mt-8 border-t pt-6">
        <h2 className="text-xl font-semibold mb-3">Recommendations</h2>
        <ul className="list-disc pl-5 space-y-2">
          {(textLength === 0 || (scanInfo && scanInfo.isScanned)) && (
            <>
              <li className="text-yellow-700">This appears to be a scanned or image-based PDF without embedded text.</li>
              <li>Consider using OCR (Optical Character Recognition) to extract text from this document.</li>
              <li>Try uploading the document to a service like Adobe Acrobat or Google Drive, which can perform OCR.</li>
              <li>After OCR processing, download and use the new version which will have searchable text.</li>
            </>
          )}
          
          {pdfDetails && pdfDetails.pageCount > 100 && (
            <li className="text-yellow-700">This is a large PDF ({pdfDetails.pageCount} pages) which may cause memory issues in some browsers.</li>
          )}
          
          {error && error.includes('Error code: 5') && (
            <>
              <li className="text-red-700">Error code 5 typically indicates insufficient data in the PDF, which can be caused by corrupted files or partial downloads.</li>
              <li>Try downloading the PDF again or getting a fresh copy from the source.</li>
            </>
          )}
          
          {error && error.includes('404') && (
            <li className="text-red-700">The PDF file could not be found. Check if the URL is correct and the file exists.</li>
          )}
          
          {error && error.includes('403') && (
            <li className="text-red-700">Access to this PDF is forbidden. The file may require authentication or have access restrictions.</li>
          )}
          
          {error && error.includes('password') && (
            <li className="text-red-700">This PDF is password protected. You'll need the password to access the content.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default function PDFDebugPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-600">Loading PDF debug tools...</div>}>
      <PDFDebugPageInner />
    </Suspense>
  );
}