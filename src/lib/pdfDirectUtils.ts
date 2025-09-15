"use client";
import { useState, useEffect } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Add this near the top to configure the worker properly
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

/**
 * Force download a PDF file directly to the user's device
 * This bypasses all rendering and just lets the browser handle the file
 */
export function forcePDFDownload(pdfUrl: string, filename?: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      // Create a temporary link element
      const link = document.createElement('a');
      
      // Use the PDF URL directly or fetch it first if cross-origin issues might occur
      link.href = pdfUrl;
      
      // Set download attribute with filename (fallback to extracting from URL if not provided)
      link.download = filename || pdfUrl.split('/').pop() || 'document.pdf';
      
      // Make the link invisible
      link.style.display = 'none';
      
      // Add to DOM, click it, and remove it
      document.body.appendChild(link);
      link.click();
      
      // Small delay before removal and resolution
      setTimeout(() => {
        document.body.removeChild(link);
        resolve();
      }, 100);
      
    } catch (error) {
      console.error('Error forcing PDF download:', error);
      reject(error);
    }
  });
}

/**
 * Opens the PDF in a new browser tab using the browser's built-in PDF viewer
 * This is the most reliable way to view problematic PDFs
 */
export function openPDFInNewTab(pdfUrl: string) {
  try {
    window.open(pdfUrl, '_blank');
    return true;
  } catch (error) {
    console.error('Error opening PDF in new tab:', error);
    return false;
  }
}

/**
 * Function to attempt text extraction from a PDF directly using PDF.js
 * This bypasses React components to directly use PDF.js
 */
export async function extractPDFText(pdfUrl: string, pageNum: number): Promise<string> {
  try {
    // Force use of Fetch for PDF loading to avoid browser cache issues
    const response = await fetch(pdfUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    // Get PDF as ArrayBuffer for more reliable parsing
    const arrayBuffer = await response.arrayBuffer();
    
    // Load PDF document with explicit options
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      disableAutoFetch: false,
      disableStream: false,
      disableFontFace: false,
    });
    
    console.log('Loading PDF document...');
    // Add timeout handling for PDF loading
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF loading timed out')), 15000); // 15 second timeout
    });
    
    const pdf = await Promise.race([loadingTask.promise, timeoutPromise]) as pdfjs.PDFDocumentProxy;
    console.log(`PDF loaded, ${pdf.numPages} pages total`);
    
    if (pageNum < 1 || pageNum > pdf.numPages) {
      throw new Error(`Invalid page number ${pageNum}. PDF has ${pdf.numPages} pages.`);
    }
    
    // Get specific page with timeout handling
    console.log(`Getting page ${pageNum}...`);
    const pageTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Page loading timed out')), 10000); // 10 second timeout
    });
    
    const page = await Promise.race([pdf.getPage(pageNum), pageTimeoutPromise]) as pdfjs.PDFPageProxy;
    
    // Extract text content with timeout handling
    console.log('Extracting text content...');
    const textTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Text extraction timed out')), 10000); // 10 second timeout
    });
    
    const textContent = await Promise.race([page.getTextContent(), textTimeoutPromise]) as any; // Use any to avoid TS errors with PDF.js types
    
    // Try multiple extraction strategies
    
    // 1. Standard extraction
    if (textContent.items && textContent.items.length > 0) {
      // Extract text from all items
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log(`Successfully extracted ${text.length} characters using standard extraction`);
      if (text.length > 0) {
        return text;
      }
    }
    
    // 2. Try structured extraction with spatial information
    console.log('No text found with standard extraction, trying spatial extraction...');
    try {
      const viewport = page.getViewport({ scale: 1 });
      
      // Group text items by approximate line position
      const lineThreshold = 5; // pixels
      const lines: Array<Array<any>> = [];
      const sortedItems = [...textContent.items].sort((a: any, b: any) => {
        // Sort by y position (top to bottom)
        return b.transform[5] - a.transform[5];
      });
      
      let currentLine: Array<any> = [];
      let currentY: number | null = null;
      
      sortedItems.forEach((item: any) => {
        const y = item.transform[5];
        
        if (currentY === null || Math.abs(y - currentY) > lineThreshold) {
          // New line
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [item];
          currentY = y;
        } else {
          // Same line
          currentLine.push(item);
        }
      });
      
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      
      // Sort items within lines by x position (left to right)
      lines.forEach(line => {
        line.sort((a: any, b: any) => a.transform[4] - b.transform[4]);
      });
      
      // Construct text with newlines between lines
      const structuredText = lines
        .map(line => 
          line.map((item: any) => item.str).join(' ')
        )
        .join('\n')
        .trim();
      
      console.log(`Successfully extracted ${structuredText.length} characters using spatial extraction`);
      if (structuredText.length > 0) {
        return structuredText;
      }
    } catch (spatialError) {
      console.warn('Spatial extraction failed:', spatialError);
    }
    
    // 3. Try rendering text layer as fallback
    console.log('Trying text layer rendering as fallback...');
    try {
      const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better text detection
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
      
      if (!context) {
        throw new Error('Failed to get canvas context');
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Render to canvas
      const renderTask = page.render({
        canvasContext: context,
        viewport: viewport,
        // Use standard rendering options without enableWebGL which is not in the type definition
      });
      
      await renderTask.promise;
      
      // Try to extract text from canvas using browser API if available (for debugging)
      console.log('Page rendered to canvas - text layer data would be available in a real implementation');
      
      // Since browser canvas text extraction isn't reliable, fall back to default message
      console.warn('No text items found in PDF after trying all extraction methods');
      
      // Return a helpful message instead of empty string
      return "This appears to be a scanned or image-based PDF. Text extraction may be limited.";
      
    } catch (renderError) {
      console.warn('Render-based extraction failed:', renderError);
    }
    
    // All extraction methods failed
    console.warn('No text items found in PDF after trying all extraction methods');
    return '';
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    
    // Provide a more descriptive error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      throw new Error(`PDF processing timed out. The document may be too large or complex.`);
    } else if (errorMessage.includes('password')) {
      throw new Error(`This PDF is password protected and cannot be processed.`);
    } else if (errorMessage.includes('corrupt') || errorMessage.includes('invalid')) {
      throw new Error(`The PDF file appears to be corrupted or invalid.`);
    } else {
      throw error;
    }
  }
}

/**
 * Check if a PDF is accessible and properly formatted
 */
export async function checkPDFAccessibility(pdfUrl: string): Promise<{
  accessible: boolean;
  reason?: string;
  errorCode?: number;
}> {
  try {
    const response = await fetch(pdfUrl, {
      method: 'HEAD',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      return {
        accessible: false,
        reason: `PDF not accessible: HTTP ${response.status} ${response.statusText}`,
        errorCode: response.status
      };
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('pdf')) {
      return {
        accessible: false,
        reason: `Not a PDF: Content-Type is ${contentType}`,
        errorCode: 415
      };
    }
    
    return { accessible: true };
  } catch (error) {
    return {
      accessible: false,
      reason: error instanceof Error ? error.message : 'Unknown error checking PDF',
      errorCode: 0
    };
  }
}

/**
 * Checks if a PDF page is likely a scanned image rather than containing text
 * @param pdfUrl URL of the PDF to check
 * @param pageNum Page number to check
 * @returns Object with scan detection results
 */
export async function isScannedPDF(pdfUrl: string, pageNum: number): Promise<{
  isScanned: boolean;
  confidence: number;
  textDensity?: number;
  textCount?: number;
  reason?: string;
}> {
  try {
    // Attempt to extract text from the page
    const text = await extractPDFText(pdfUrl, pageNum);
    
    // If no text was extracted, it's very likely a scanned document
    if (!text || text.length === 0) {
      return {
        isScanned: true,
        confidence: 0.95,
        textCount: 0,
        reason: "No text content could be extracted"
      };
    }
    
    // Check if the extracted text contains the message about scanned documents
    if (text.includes("scanned or image-based PDF")) {
      return {
        isScanned: true,
        confidence: 0.9,
        textCount: text.length,
        reason: "PDF.js indicated this is likely a scanned document"
      };
    }
    
    try {
      // Get more details about the text content using PDF.js
      const response = await fetch(pdfUrl, { cache: 'no-store' });
      const arrayBuffer = await response.arrayBuffer();
      
      const loadingTask = pdfjs.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true
      });
      
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Get page size for density calculation
      const viewport = page.getViewport({ scale: 1 });
      const pageArea = viewport.width * viewport.height;
      
      // Calculate text density (characters per square unit)
      const textCount = textContent.items.reduce((sum: number, item: any) => sum + (item.str?.length || 0), 0);
      const textDensity = textCount / pageArea;
      
      // Check if the text density is very low (suggesting it might be a scanned document with OCR)
      // Typical thresholds vary but 0.001 characters per square point is very low for a text document
      if (textDensity < 0.0005) {
        return {
          isScanned: true,
          confidence: 0.8,
          textDensity,
          textCount,
          reason: "Very low text density suggesting scanned content with minimal OCR"
        };
      }
      
      // Check for OCR artifacts
      // Common OCR artifacts include unusual spacing, garbage characters, etc.
      const hasOcrArtifacts = /[\uFFFD\u2026\u2020-\u2022]{3,}|[^\w\s,.;:!?'\"\-&%$#@()\[\]{}+=/\\|<>^*_~`]{10,}/g.test(text);
      
      if (hasOcrArtifacts) {
        return {
          isScanned: true,
          confidence: 0.7,
          textDensity,
          textCount,
          reason: "Text contains patterns consistent with OCR artifacts"
        };
      }
      
      // Check if there are many items but little text (OCR noise)
      if (textContent.items.length > 100 && textCount < textContent.items.length * 2) {
        return {
          isScanned: true,
          confidence: 0.6,
          textDensity,
          textCount,
          reason: "Many small text fragments suggesting OCR processing"
        };
      }
      
      // Probably a normal text-based PDF
      return {
        isScanned: false,
        confidence: 0.8,
        textDensity,
        textCount,
        reason: "Normal text density and patterns detected"
      };
      
    } catch (detailError) {
      console.warn('Error during detailed scan detection:', detailError);
      
      // Fall back to simple text length analysis
      // Very short text on a page might indicate a scan with minimal text
      if (text.length < 100) {
        return {
          isScanned: true,
          confidence: 0.5,
          textCount: text.length,
          reason: "Very little text content extracted"
        };
      }
      
      return {
        isScanned: false,
        confidence: 0.3,
        textCount: text.length,
        reason: "Could not perform detailed analysis, but text was found"
      };
    }
    
  } catch (error) {
    console.error('Error in isScannedPDF:', error);
    
    // Default to assuming it might be scanned if we can't analyze it
    return {
      isScanned: true,
      confidence: 0.4,
      reason: error instanceof Error ? error.message : "Unknown error during analysis"
    };
  }
}