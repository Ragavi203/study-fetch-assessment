"use client";

/**
 * This file provides specialized handling for common PDF.js errors,
 * particularly Error Code 5 which is a common issue with the PDF viewer.
 */

import { openPDFInNewTab, extractPDFText, isScannedPDF } from './pdfDirectUtils';

// Error code constants from PDF.js
export const PDF_ERROR_CODES = {
  UNEXPECTED_RESPONSE: 1,
  MISSING_PDF: 2,
  INVALID_PDF: 3,
  PASSWORD_PROTECTED: 4,
  INSUFFICIENT_DATA: 5,
  UNEXPECTED_ERROR: 6,
  RENDERING_ERROR: 7,
  CANCELLED: 8,
  INVALID_PARAMETER: 9,
  MISSING_DATA: 10,
};

/**
 * Handle PDF Error Code 5 - one of the most common PDF.js errors
 * This error occurs when there's insufficient data in the PDF
 */
export async function handleErrorCode5(pdfUrl: string, onRecover?: () => void) {
  console.log("Handling PDF Error Code 5 (Insufficient Data)");
  
  // Show error UI
  const errorElement = document.getElementById('pdf-error-message') || createErrorElement();
  
  // Update the error message
  errorElement.innerHTML = `
    <div class="flex flex-col items-center p-5 bg-white/90 rounded-lg shadow-lg max-w-md mx-auto">
      <svg class="w-12 h-12 text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <h2 class="text-lg font-semibold mb-2 text-gray-900">PDF Display Error</h2>
      <p class="text-gray-700 mb-4 text-center">The PDF viewer encountered Error Code 5 (Insufficient Data). This can happen with complex PDFs or network issues.</p>
      <div class="flex gap-3">
        <button id="pdf-try-alt-viewer" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium text-sm">
          Use Simple Viewer
        </button>
        <button id="pdf-open-in-tab" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-medium text-sm">
          Open in New Tab
        </button>
      </div>
      <div class="text-xs text-gray-500 mt-4">
        The AI can still answer questions even if the PDF display has issues.
      </div>
    </div>
  `;
  
  // Add the error element to the document if it doesn't exist
  if (!document.getElementById('pdf-error-message')) {
    document.body.appendChild(errorElement);
  }
  
  // Add event listeners for the buttons
  const tryAltViewerButton = document.getElementById('pdf-try-alt-viewer');
  if (tryAltViewerButton) {
    tryAltViewerButton.addEventListener('click', () => {
      // First, create a simple iframe viewer
      const container = document.querySelector('.rpv-core__viewer-container') || 
                         document.querySelector('.pdf-container');
      
      if (container) {
        // Clear the container
        container.innerHTML = '';
        
        // Create a simple iframe
        const iframe = document.createElement('iframe');
        iframe.src = pdfUrl;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        
        // Add the iframe to the container
        container.appendChild(iframe);
        
        // Hide the error message
        if (errorElement.parentNode) {
          errorElement.parentNode.removeChild(errorElement);
        }
        
        // Call the recovery callback
        if (onRecover) {
          onRecover();
        }
      } else {
        console.error('Could not find PDF container');
      }
    });
  }
  
  const openInTabButton = document.getElementById('pdf-open-in-tab');
  if (openInTabButton) {
    openInTabButton.addEventListener('click', () => {
      openPDFInNewTab(pdfUrl);
    });
  }
  
  // Try to diagnose the PDF
  try {
    // Check if the PDF is scanned
    const scanCheck = await isScannedPDF(pdfUrl, 1);
    console.log('PDF scan check:', scanCheck);
    
    if (scanCheck.isScanned) {
      console.warn('PDF is likely scanned, which may cause rendering issues');
      // Update the error message to mention it's a scanned PDF
      const errorContent = document.querySelector('#pdf-error-message > div');
      if (errorContent) {
        const infoElement = document.createElement('div');
        infoElement.className = 'mt-3 p-2 bg-yellow-50 text-yellow-800 text-xs rounded';
        infoElement.textContent = 'This appears to be a scanned document, which may explain the viewing difficulties.';
        errorContent.appendChild(infoElement);
      }
    }
  } catch (error) {
    console.error('Error diagnosing PDF:', error);
  }
  
  return {
    tryAlternativeViewer: () => {
      tryAltViewerButton?.click();
    },
    openInNewTab: () => {
      openInTabButton?.click();
    }
  };
}

/**
 * Create an error element to display PDF errors
 */
function createErrorElement() {
  const errorElement = document.createElement('div');
  errorElement.id = 'pdf-error-message';
  errorElement.className = 'fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black/50 z-50';
  return errorElement;
}

/**
 * Global error handler for PDF.js errors
 */
export function setupGlobalPDFErrorHandler(pdfUrl: string) {
  // Listen for specific error messages from PDF.js
  window.addEventListener('error', (event) => {
    // Check if the error is related to PDF.js
    if (event.message && (
        event.message.includes('Error code: 5') ||
        event.message.includes('PDFWorker') ||
        event.message.includes('pdf.js') ||
        event.message.includes('Failed to fetch')
      )) {
      
      console.error('PDF.js error detected:', event.message);
      
      // Handle specific error codes
      if (event.message.includes('Error code: 5')) {
        handleErrorCode5(pdfUrl);
      }
      
      // Prevent the error from showing in the console
      event.preventDefault();
      return false;
    }
  });
  
  // Also listen for unhandled rejections
  window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = event.reason?.message || String(event.reason);
    
    // Check if the rejection is related to PDF.js
    if (errorMessage && (
        errorMessage.includes('Error code: 5') ||
        errorMessage.includes('PDFWorker') ||
        errorMessage.includes('pdf.js') ||
        errorMessage.includes('Failed to fetch')
      )) {
      
      console.error('PDF.js unhandled rejection:', errorMessage);
      
      // Handle specific error codes
      if (errorMessage.includes('Error code: 5')) {
        handleErrorCode5(pdfUrl);
      }
      
      // Prevent the rejection from showing in the console
      event.preventDefault();
      return false;
    }
  });
  
  return {
    handleErrorCode5: () => handleErrorCode5(pdfUrl)
  };
}