import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface PDFReferenceHelperProps {
  pdfUrl: string;
  currentPage: number;
  onTextExtracted?: (text: string, positions: any[]) => void;
  onKeyTermsDetected?: (terms: KeyTerm[]) => void;
}

export interface KeyTerm {
  text: string;
  page: number;
  occurrences: number;
  positions: Array<{ x: number; y: number; width: number; height: number }>;
  importance: 'low' | 'medium' | 'high';
}

/**
 * This component analyzes PDF content to extract text, detect key terms,
 * and provide reference data for the AI to use in responses.
 */
export function PDFReferenceHelper({
  pdfUrl,
  currentPage,
  onTextExtracted,
  onKeyTermsDetected,
}: PDFReferenceHelperProps) {
  const [pageText, setPageText] = useState<string>('');
  const [textPositions, setTextPositions] = useState<any[]>([]);
  const [keyTerms, setKeyTerms] = useState<KeyTerm[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  
  // Extract text from the current page
  useEffect(() => {
    if (!pdfUrl || currentPage <= 0) return;
    
    const extractText = async () => {
      setIsExtracting(true);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const page = await pdf.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        
        // Extract text with position information
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
        
        // Sort text items by position (top to bottom, then left to right)
        textItems.sort((a: any, b: any) => {
          const lineHeight = Math.max(a.fontSize, b.fontSize);
          const yDiff = b.y - a.y;
          if (Math.abs(yDiff) < lineHeight * 0.5) {
            return a.x - b.x; // Same line, sort by x position
          }
          return yDiff; // Different lines, sort by y position
        });
        
        // Extract plain text
        const plainText = textItems
          .map((item: any) => item.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        setPageText(plainText);
        setTextPositions(textItems);
        
        // Provide extracted text to parent component
        if (onTextExtracted) {
          onTextExtracted(plainText, textItems);
        }
        
        // Detect key terms
        detectKeyTerms(plainText, textItems, currentPage);
        
      } catch (error) {
        console.error('Error extracting text:', error);
      } finally {
        setIsExtracting(false);
      }
    };
    
    extractText();
  }, [pdfUrl, currentPage, onTextExtracted]);
  
  // Detect key terms in the extracted text
  const detectKeyTerms = (text: string, positions: any[], page: number) => {
    try {
      // Common academic/professional terms to look for
      const academicTerms = [
        'algorithm', 'analysis', 'approach', 'assessment', 'case study',
        'conclusion', 'data', 'definition', 'discussion', 'equation',
        'evidence', 'example', 'experiment', 'findings', 'framework',
        'hypothesis', 'implementation', 'introduction', 'literature review',
        'methodology', 'model', 'objective', 'problem statement', 'process',
        'recommendation', 'reference', 'research', 'results', 'solution',
        'summary', 'survey', 'table', 'technique', 'theory', 'variable'
      ];
      
      // Named entities pattern (capitalized multi-word phrases)
      const namedEntityPattern = /([A-Z][a-z]+\s)+[A-Z][a-z]+/g;
      const namedEntities = text.match(namedEntityPattern) || [];
      
      // Number patterns (figures, statistics)
      const numberPattern = /\d+(\.\d+)?(\s*%)?/g;
      const numbers = text.match(numberPattern) || [];
      
      // Build potential key terms list
      const potentialKeyTerms = [...academicTerms, ...namedEntities];
      
      // Count occurrences and find positions
      const termCounts: Record<string, { 
        count: number; 
        positions: Array<{ x: number; y: number; width: number; height: number }>;
      }> = {};
      
      potentialKeyTerms.forEach(term => {
        // Case-insensitive regex to find the term
        const termRegex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = text.match(termRegex);
        
        if (matches && matches.length > 0) {
          // Find positions in the text
          const termPositions = positions.filter(pos => 
            pos.text.toLowerCase().includes(term.toLowerCase())
          ).map(pos => ({
            x: pos.x,
            y: pos.y,
            width: pos.width || term.length * 7,
            height: pos.height || 15
          }));
          
          termCounts[term] = {
            count: matches.length,
            positions: termPositions
          };
        }
      });
      
      // Convert to key terms array and sort by occurrence count
      const detectedTerms: KeyTerm[] = Object.entries(termCounts)
        .map(([text, { count, positions }]) => ({
          text,
          page,
          occurrences: count,
          positions,
          // Assign importance based on occurrence frequency
          importance: count > 5 ? 'high' as const : count > 2 ? 'medium' as const : 'low' as const
        }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 15); // Keep only top 15 terms
      
      setKeyTerms(detectedTerms);
      
      // Provide detected terms to parent component
      if (onKeyTermsDetected) {
        onKeyTermsDetected(detectedTerms);
      }
    } catch (error) {
      console.error('Error detecting key terms:', error);
    }
  };
  
  // Visual feedback not shown - this is primarily a data service component
  return null;
}