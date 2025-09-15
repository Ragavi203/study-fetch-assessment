"use client";
import React, { useEffect } from 'react';

/**
 * A component that aggressively monitors and ensures text extraction from PDFs
 * and makes it available to AI components through multiple mechanisms
 */
export default function AIForcedTextProvider() {
  useEffect(() => {
    // Setup interval to check and fix text availability
    const interval = setInterval(() => {
      try {
        // Check for various indicators that extraction was successful
        const debugElement = document.getElementById('pdf-text-debug');
        const hasExtracted = debugElement && debugElement.textContent && 
                            debugElement.textContent.includes('PDF text extracted');
        
        if (hasExtracted) {
          // Parse extracted text length if available
          let extractedLength = 0;
          if (debugElement?.textContent) {
            const match = debugElement.textContent.match(/(\d+) chars/);
            if (match && match[1]) {
              extractedLength = parseInt(match[1], 10);
            }
          }

          console.log(`AIForcedTextProvider: Found extraction debug element, chars: ${extractedLength}`);
          
          // Check if the text is already available in global
          if (typeof window !== 'undefined' && 
              (!(window as any).currentPageText || 
              (window as any).currentPageText.length < extractedLength)) {
            
            console.log('AIForcedTextProvider: Text missing or smaller than expected, searching for it');
            
            // Try to find text in DOM attributes
            let domTextContent: string | null = null;
            const elements = document.querySelectorAll('[data-pdf-text]');
            if (elements.length > 0) {
              domTextContent = elements[0].getAttribute('data-pdf-text');
              if (domTextContent) {
                console.log(`AIForcedTextProvider: Found text in DOM attribute (${domTextContent.length} chars)`);
                (window as any).currentPageText = domTextContent;
                
                // Also dispatch an event to notify components
                const event = new CustomEvent('pdf-text-extracted', { 
                  detail: { 
                    text: domTextContent, 
                    page: parseInt(elements[0].getAttribute('data-pdf-page') || '1', 10),
                    source: 'AIForcedTextProvider',
                    timestamp: Date.now()
                  } 
                });
                window.dispatchEvent(event);
              }
            }
            
            // Check if we have the text in localStorage/sessionStorage
            try {
              const storedText = localStorage.getItem('pdf_current_text');
              if (storedText && (!domTextContent || storedText.length > domTextContent.length)) {
                console.log(`AIForcedTextProvider: Found text in localStorage (${storedText.length} chars)`);
                (window as any).currentPageText = storedText;
              }
              
              const sessionText = sessionStorage.getItem('pdf_text_page_1'); // Try first page
              if (sessionText && (!storedText || sessionText.length > (storedText?.length || 0))) {
                console.log(`AIForcedTextProvider: Found text in sessionStorage (${sessionText.length} chars)`);
                (window as any).currentPageText = sessionText;
              }
            } catch (e) {
              console.warn('AIForcedTextProvider: Error accessing storage:', e);
            }
          }
          
          // Also update DOM for any AI components
          if (typeof window !== 'undefined' && (window as any).currentPageText) {
            const chatContainers = document.querySelectorAll('.ai-chat-container, .chat-container');
            if (chatContainers.length > 0) {
              chatContainers.forEach(container => {
                const currentAttr = container.getAttribute('data-pdf-text') || '';
                if (!currentAttr || currentAttr.length < (window as any).currentPageText.length) {
                  console.log('AIForcedTextProvider: Updating chat container with better text');
                  container.setAttribute('data-pdf-text', (window as any).currentPageText.substring(0, 5000));
                }
              });
            }
            
            // Update hidden field for emergency access
            let hiddenField = document.getElementById('pdf-text-emergency');
            if (!hiddenField) {
              const inputField = document.createElement('input');
              inputField.setAttribute('type', 'hidden');
              inputField.id = 'pdf-text-emergency';
              document.body.appendChild(inputField);
              hiddenField = inputField;
            }
            hiddenField.setAttribute('value', (window as any).currentPageText.substring(0, 5000));
          }
        }
      } catch (error) {
        console.error('AIForcedTextProvider error:', error);
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, []);

  return null; // This component doesn't render anything
}