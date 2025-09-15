"use client";
export const dynamic = 'force-dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { diagnoseTextExtraction, PDFDiagnosticResult } from '@/lib/pdfDebugUtils';

/**
 * PDF Debug Test Page
 * A utility page for testing and diagnosing PDF text extraction issues
 */
function PDFDebugTestInner() {
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pageNum, setPageNum] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<PDFDiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string>('');
  const searchParams = useSearchParams();

  // Check if we have a URL in search params
  useEffect(() => {
    const urlFromParam = searchParams.get('url');
    const pageFromParam = searchParams.get('page');
    
    if (urlFromParam) {
      setPdfUrl(decodeURIComponent(urlFromParam));
      setManualUrl(decodeURIComponent(urlFromParam));
    }
    
    if (pageFromParam) {
      const pageNum = parseInt(pageFromParam, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        setPageNum(pageNum);
      }
    }
  }, [searchParams]);

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      // Validate URL
      const url = new URL(pdfUrl);
      
      // Run the diagnostic
      const diagnosticResult = await diagnoseTextExtraction(pdfUrl, pageNum);
      setResult(diagnosticResult);
    } catch (error) {
      console.error('Error testing PDF:', error);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleManualUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUrl) {
      setPdfUrl(manualUrl);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">PDF Text Extraction Diagnostics</h1>
        
        {/* URL Input Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Test PDF URL</h2>
          
          <form onSubmit={handleManualUrlSubmit} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={manualUrl}
                onChange={e => setManualUrl(e.target.value)}
                placeholder="Enter PDF URL"
                className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
              >
                Set URL
              </button>
            </div>
          </form>
          
          <div className="flex gap-3 items-center mb-4">
            <input
              type="number"
              value={pageNum}
              onChange={e => setPageNum(parseInt(e.target.value, 10) || 1)}
              min="1"
              className="w-20 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-600">Page Number</span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {pdfUrl ? (
                <span>Testing: <span className="font-mono text-xs break-all">{pdfUrl}</span></span>
              ) : (
                <span>No URL set</span>
              )}
            </div>
            
            <button
              onClick={handleTest}
              disabled={!pdfUrl || loading}
              className={`px-4 py-2 rounded-md ${
                !pdfUrl || loading
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {loading ? 'Testing...' : 'Run Diagnostics'}
            </button>
          </div>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h2 className="text-red-800 font-semibold mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {/* Results Display */}
        {result && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Diagnostic Results</h2>
            
            {/* Success/Failure Banner */}
            <div className={`p-4 rounded-md mb-6 ${
              result.success && result.hasText
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}>
              <div className="flex items-center">
                {result.success && result.hasText ? (
                  <>
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-green-700">
                      Success: Text extracted successfully
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v4a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-yellow-700">
                      {result.success ? "Warning: No text found in PDF" : "Error: Failed to extract text"}
                    </span>
                  </>
                )}
              </div>
            </div>
            
            {/* PDF Information */}
            {result.pdfInfo && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-2 text-gray-700">Document Information</h3>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-gray-600">Pages:</div>
                    <div className="font-mono">{result.pdfInfo.numPages}</div>
                    
                    <div className="text-gray-600">Version:</div>
                    <div className="font-mono">{result.pdfInfo.version}</div>
                    
                    <div className="text-gray-600">Fingerprint:</div>
                    <div className="font-mono text-xs break-all">{result.pdfInfo.fingerprint}</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Page Information */}
            {result.pageInfo && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-2 text-gray-700">Page Information</h3>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-gray-600">Dimensions:</div>
                    <div className="font-mono">{result.pageInfo.width} × {result.pageInfo.height} pts</div>
                    
                    <div className="text-gray-600">Rotation:</div>
                    <div className="font-mono">{result.pageInfo.rotation}°</div>
                    
                    <div className="text-gray-600">Page Number:</div>
                    <div className="font-mono">{result.pageInfo.pageNumber}</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Text Extraction Results */}
            <div className="mb-6">
              <h3 className="text-md font-semibold mb-2 text-gray-700">Text Extraction</h3>
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-gray-600">Text Items:</div>
                  <div className="font-mono">{result.textItems}</div>
                  
                  <div className="text-gray-600">Characters:</div>
                  <div className="font-mono">{result.textLength}</div>
                  
                  <div className="text-gray-600">Has Text:</div>
                  <div className={result.hasText ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    {result.hasText ? "Yes" : "No"}
                  </div>
                  
                  <div className="text-gray-600">Execution Time:</div>
                  <div className="font-mono">{result.executionTimeMs.toFixed(2)} ms</div>
                </div>
              </div>
            </div>
            
            {/* Warnings and Recommendations */}
            {result.warnings.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-2 text-yellow-700">Warnings</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {result.warnings.map((warning, index) => (
                    <li key={index} className="text-yellow-700">{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.recommendations.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-2 text-blue-700">Recommendations</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {result.recommendations.map((recommendation, index) => (
                    <li key={index} className="text-blue-700">{recommendation}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Extracted Text */}
            {result.hasText && (
              <div>
                <h3 className="text-md font-semibold mb-2 text-gray-700">Extracted Text Sample</h3>
                <div className="bg-gray-50 p-3 rounded-md overflow-auto max-h-60">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800">
                    {result.textContent.substring(0, 1000)}
                    {result.textContent.length > 1000 && '...'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Error Section */}
        {result && result.errors && result.errors.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-red-600">Errors</h2>
            <div className="bg-red-50 p-3 rounded-md">
              <ul className="list-disc pl-5 space-y-1">
                {result.errors.map((err, index) => (
                  <li key={index} className="text-red-700">{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PDFDebugTest() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-600">Loading PDF test debug...</div>}>
      <PDFDebugTestInner />
    </Suspense>
  );
}