import * as pdfjsLib from 'pdfjs-dist';

/**
 * Comprehensive PDF diagnostic utility
 * This utility helps identify issues with PDF text extraction
 */

/**
 * Perform comprehensive diagnostics on a PDF file
 * @param pdfUrl URL to the PDF file
 * @param pageNum Page number to check (1-based)
 * @returns Diagnostic results
 */
export async function diagnoseTextExtraction(
  pdfUrl: string,
  pageNum: number
): Promise<PDFDiagnosticResult> {
  console.log(`🔍 Starting PDF diagnostics for page ${pageNum} of ${pdfUrl}`);
  
  const result: PDFDiagnosticResult = {
    success: false,
    hasText: false,
    textLength: 0,
    textItems: 0,
    textContent: '',
    pdfInfo: null,
    pageInfo: null,
    errors: [],
    warnings: [],
    recommendations: [],
    executionTimeMs: 0
  };
  
  const startTime = performance.now();
  
  try {
    // 1. Load the PDF document
    console.log('🔍 Loading PDF document...');
    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });
    
    const pdf = await loadingTask.promise;
    
    // 2. Get document info
    result.pdfInfo = {
      numPages: pdf.numPages,
      fingerprint: pdf.fingerprints?.[0] || '',
      version: `PDF ${pdf._pdfInfo?.version || 'unknown'}`
    };
    
    console.log(`📄 PDF has ${pdf.numPages} pages`);
    
    // Validate page number
    if (pageNum < 1 || pageNum > pdf.numPages) {
      throw new Error(`Invalid page number: ${pageNum}. PDF has ${pdf.numPages} pages.`);
    }
    
    // 3. Get the requested page
    console.log(`🔍 Getting page ${pageNum}...`);
    const page = await pdf.getPage(pageNum);
    
    // 4. Get page info
    const viewport = page.getViewport({ scale: 1.0 });
    result.pageInfo = {
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
      pageNumber: page.pageNumber
    };
    
    // 5. Extract text content
    console.log('🔍 Extracting text content...');
    const textContent = await page.getTextContent();
    
    // 6. Process text items
    const textItems = textContent.items || [];
    result.textItems = textItems.length;
    
    if (textItems.length === 0) {
      result.warnings.push('No text items found on this page');
      result.recommendations.push('This may be a scanned or image-based PDF requiring OCR');
    } else {
      // Check if we have actual content or just empty strings
      const nonEmptyItems = textItems.filter((item: any) => item.str && item.str.trim().length > 0);
      
      if (nonEmptyItems.length === 0) {
        result.warnings.push('All text items are empty strings');
        result.recommendations.push('This may be a scanned or image-based PDF requiring OCR');
      } else {
        result.hasText = true;
        
        // Generate a readable text representation
        const extractedText = textItems
          .map((item: any) => item.str)
          .join(' ')
          .replace(/\\s+/g, ' ')
          .trim();
        
        result.textContent = extractedText;
        result.textLength = extractedText.length;
        
        if (extractedText.length < 50) {
          result.warnings.push('Very little text content extracted');
          result.recommendations.push('Text may be embedded in images or in a non-standard format');
        }
      }
    }
    
    // 7. Check for annotations (might indicate if content is in annotations)
    console.log('🔍 Checking for annotations...');
    const annotations = await page.getAnnotations();
    
    if (annotations.length > 0) {
      // Check if we have text annotations
      const textAnnotations = annotations.filter(a => a.subtype === 'Text' || a.subtype === 'FreeText');
      if (textAnnotations.length > 0) {
        result.warnings.push(`${textAnnotations.length} text annotations found - content might be in annotations`);
        result.recommendations.push('Consider extracting text from annotations as well');
      }
    }
    
    // 8. Check for images (might indicate a scanned document)
    console.log('🔍 Checking for images...');
    const operatorList = await page.getOperatorList();
    let imageCount = 0;
    
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      // 82 is the code for "paintImageXObject" in PDF.js
      if (operatorList.fnArray[i] === 82) {
        imageCount++;
      }
    }
    
    if (imageCount > 0) {
      result.warnings.push(`${imageCount} images found on page - might be a scanned document`);
      if (!result.hasText) {
        result.recommendations.push('This appears to be a scanned document requiring OCR to extract text');
      }
    }
    
    // Mark as successful if we got here without errors
    result.success = true;
    
  } catch (error) {
    console.error('PDF Diagnostic Error:', error);
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
    
    // Add specific recommendations based on errors
    if (error instanceof Error) {
      if (error.message.includes('404')) {
        result.recommendations.push('PDF not found - check the URL');
      } else if (error.message.includes('password')) {
        result.recommendations.push('PDF is password-protected');
      } else if (error.message.includes('corrupt')) {
        result.recommendations.push('PDF file appears to be corrupt');
      } else if (error.message.includes('network')) {
        result.recommendations.push('Network error - check connectivity');
      } else if (error.message.includes('Invalid PDF')) {
        result.recommendations.push('Invalid PDF structure - file may be corrupt or not a PDF');
      }
    }
  }
  
  // Calculate execution time
  result.executionTimeMs = performance.now() - startTime;
  console.log(`✅ PDF diagnostics completed in ${result.executionTimeMs.toFixed(2)}ms`);
  
  return result;
}

/**
 * Interface for PDF diagnostic results
 */
export interface PDFDiagnosticResult {
  success: boolean;
  hasText: boolean;
  textLength: number;
  textItems: number;
  textContent: string;
  pdfInfo: {
    numPages: number;
    fingerprint: string;
    version: string;
  } | null;
  pageInfo: {
    width: number;
    height: number;
    rotation: number;
    pageNumber: number;
  } | null;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  executionTimeMs: number;
}

/**
 * Extract text from a PDF with improved error handling
 */
export async function extractTextFromPDF(
  pdfUrl: string,
  pageNum: number,
  options?: {
    fallbackToOCR?: boolean;
    includeAnnotations?: boolean;
  }
): Promise<{
  text: string;
  success: boolean;
  error?: string;
  isScannedDocument?: boolean;
}> {
  try {
    // First try standard text extraction
    const diagnostic = await diagnoseTextExtraction(pdfUrl, pageNum);
    
    if (diagnostic.success && diagnostic.hasText) {
      return {
        text: diagnostic.textContent,
        success: true,
        isScannedDocument: diagnostic.warnings.some(w => w.includes('scanned document'))
      };
    }
    
    // If we didn't get text but options allow OCR, we would use it here
    if (options?.fallbackToOCR) {
      // OCR implementation would go here
      // For now, just return a placeholder
      return {
        text: "[This appears to be a scanned document. OCR processing would be needed to extract text.]",
        success: false,
        error: "OCR processing required but not implemented",
        isScannedDocument: true
      };
    }
    
    // Return diagnostic info for failed extraction
    return {
      text: "",
      success: false,
      error: diagnostic.errors.length > 0 
        ? diagnostic.errors[0] 
        : "Failed to extract text, but no specific error occurred",
      isScannedDocument: diagnostic.warnings.some(w => w.includes('scanned document'))
    };
    
  } catch (error) {
    return {
      text: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during text extraction"
    };
  }
}