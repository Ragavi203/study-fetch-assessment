"use client";
import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextFromPDF } from '@/lib/pdfDebugUtils';

// Set worker source for PDF.js to avoid errors
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface PDFTextExtractorProps {
  pdfUrl: string;
  currentPage: number;
  onTextExtracted: (text: string, positions: any[], page: number) => void;
  onError?: (error: string) => void;
  enableFallbackMethods?: boolean;
  maxRetries?: number;
  includeAnnotations?: boolean; // Whether to extract annotations as well
}

/**
 * Enhanced PDF text extraction component that uses multiple strategies to extract text
 * 1. Standard PDF.js text extraction
 * 2. Annotation extraction if standard fails
 * 3. Diagnostic to identify why text extraction failed
 * 4. (Optional) OCR integration point for scanned documents
 */
export function PDFTextExtractor({
  pdfUrl,
  currentPage,
  onTextExtracted,
  onError,
  enableFallbackMethods = true,
  maxRetries = 2,
  includeAnnotations = false
}: PDFTextExtractorProps) {
  const [extractionAttempted, setExtractionAttempted] = useState(false);
  const [retries, setRetries] = useState(0);
  
  useEffect(() => {
    if (!pdfUrl || currentPage <= 0) return;
    if (extractionAttempted && retries >= maxRetries) return;
    
    const extractText = async () => {
      setExtractionAttempted(true);
      
      console.log(`Attempting PDF text extraction for page ${currentPage}, attempt ${retries + 1}`);
      
      try {
        // First try our enhanced extraction with diagnostics
        const extractionResult = await extractTextFromPDF(pdfUrl, currentPage, {
          fallbackToOCR: false, // OCR not implemented yet
          includeAnnotations: includeAnnotations || enableFallbackMethods
        });
        
        if (extractionResult.success && extractionResult.text) {
          // Create a mock positions array since we don't have actual position data from diagnostic extraction
          // We'll create a single block representing the whole page
          const mockPositions = [{
            text: extractionResult.text,
            x: 0,
            y: 0,
            width: 612, // Standard PDF width in points
            height: 792, // Standard PDF height in points
            pageWidth: 612,
            pageHeight: 792
          }];
          
          // Call the callback with the extracted text
          onTextExtracted(extractionResult.text, mockPositions, currentPage);
          return;
        }
        
        // If the enhanced extraction failed and we have an error, log it
        if (extractionResult.error) {
          console.warn('Enhanced text extraction failed:', extractionResult.error);
          
          // If we're detecting a scanned document, add a clear warning
          if (extractionResult.isScannedDocument) {
            console.warn('This appears to be a scanned document - text extraction may not work');
            
            // Could integrate with OCR service here
            if (onError) {
              onError('This appears to be a scanned document. Text extraction is limited.');
            }
          } else if (onError) {
            onError(`Text extraction failed: ${extractionResult.error}`);
          }
        }
        
        // If fallback methods are enabled, try standard PDF.js as a last resort
        if (enableFallbackMethods) {
          // Fall back to standard PDF.js extraction as a last resort
          const pdfjsLib = await import('pdfjs-dist');
          const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
          const page = await pdf.getPage(currentPage);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1 });
          
          // Process text positions
          const textItems = textContent.items.map((item: any) => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            width: item.width || 0,
            height: item.height || (item.transform[3] || 12),
            fontSize: item.fontSize || 12,
            pageWidth: viewport.width,
            pageHeight: viewport.height
          }));
          
          // Extract plain text
          const plainText = textItems
            .map((item: any) => item.text)
            .join(' ')
            .replace(/\\s+/g, ' ')
            .trim();
          
          if (plainText.length > 0) {
            onTextExtracted(plainText, textItems, currentPage);
          } else if (onError) {
            onError('No text content found in this PDF page');
          }
        }
      } catch (error) {
        console.error('Error in PDFTextExtractor:', error);
        
        // Try fallback method - direct binary loading
        if (enableFallbackMethods && retries < maxRetries) {
          console.log(`Retrying with alternative method, attempt ${retries + 1}`);
          
          try {
            // Try loading as ArrayBuffer first for more reliable parsing
            const response = await fetch(pdfUrl);
            const arrayBuffer = await response.arrayBuffer();
            
            const loadingTask = pdfjsLib.getDocument({
              data: arrayBuffer,
              cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
              cMapPacked: true,
            });
            
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(currentPage);
            const textContent = await page.getTextContent();
            
            // Process text positions
            const textItems = textContent.items.map((item: any) => ({
              text: item.str,
              x: Math.round(item.transform[4]),
              y: Math.round(item.transform[5]),
              width: item.width || 0,
              height: item.height || (item.transform[3] || 12),
              fontSize: item.fontSize || 12
            }));
            
            // Extract plain text
            const plainText = textItems
              .map((item: any) => item.text)
              .join(' ')
              .replace(/\\s+/g, ' ')
              .trim();
            
            if (plainText.length > 0) {
              onTextExtracted(plainText, textItems, currentPage);
              return;
            }
          } catch (fallbackError) {
            console.error('Fallback extraction also failed:', fallbackError);
            setRetries(prev => prev + 1);
            
            // Try again after a short delay with the next retry method
            setTimeout(() => {
              setExtractionAttempted(false);
            }, 1000);
          }
        }
        
        if (onError) {
          onError(error instanceof Error ? error.message : 'Unknown text extraction error');
        }
      }
    };
    
    extractText();
  }, [pdfUrl, currentPage, onTextExtracted, onError, enableFallbackMethods, retries, maxRetries]);
  
  // Reset the extraction state when the page or URL changes
  useEffect(() => {
    setExtractionAttempted(false);
    setRetries(0);
  }, [pdfUrl, currentPage]);
  
  // This component doesn't render anything visible
  return null;
}