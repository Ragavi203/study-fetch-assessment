import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface PDFStructureMapperProps {
  pdfUrl: string;
  onSectionDetected?: (sections: PDFSection[]) => void;
  onNavigateToSection?: (section: PDFSection) => void;
  currentPage: number;
}

export interface PDFSection {
  title: string;
  pageNumber: number;
  level: number;
  textSnippet?: string;
}

/**
 * This component analyzes the PDF structure to detect sections, headings,
 * and document structure for enhanced navigation.
 */
export function PDFStructureMapper({
  pdfUrl,
  onSectionDetected,
  onNavigateToSection,
  currentPage
}: PDFStructureMapperProps) {
  const [sections, setSections] = useState<PDFSection[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
  // Analyze PDF structure when URL changes
  useEffect(() => {
    if (!pdfUrl) return;
    
    const analyzeStructure = async () => {
      setIsAnalyzing(true);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const numPages = pdf.numPages;
        
        // Helper function to detect if text is likely a heading
        const isLikelyHeading = (text: string, fontSize: number, avgFontSize: number) => {
          // Common heading patterns
          const headingPatterns = [
            /^chapter\s+\d+/i,
            /^section\s+\d+/i,
            /^appendix\s+[a-z]/i,
            /^\d+\.\d+(\.\d+)*/i, // Numbered sections like 1.2 or 1.2.3
            /^[IVXLCDMivxlcdm]+\./i, // Roman numerals with period
            /^[A-Z][A-Za-z\s]{1,50}$/ // Capitalized short text
          ];
          
          // Text should be relatively short for a heading
          if (text.length > 100) return false;
          
          // Check if any heading patterns match
          const matchesPattern = headingPatterns.some(pattern => pattern.test(text));
          
          // Check if font size is larger than average
          const isLargerFont = fontSize > (avgFontSize * 1.2);
          
          return matchesPattern || isLargerFont;
        };
        
        // Detect potential sections based on text analysis
        const detectedSections: PDFSection[] = [];
        let totalFontSize = 0;
        let fontSizeCount = 0;
        
        // First pass: collect font size data
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          
          content.items.forEach((item: any) => {
            if (item.fontSize) {
              totalFontSize += item.fontSize;
              fontSizeCount++;
            }
          });
        }
        
        const avgFontSize = totalFontSize / fontSizeCount;
        
        // Second pass: detect sections based on font size and text patterns
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          
          // Group text items by vertical position (to form lines)
          const lines: any[] = [];
          let currentY: number | null = null;
          let currentLine: any[] = [];
          
          // Sort by vertical position (y) in descending order (top to bottom)
          const sortedItems = [...content.items].sort((a: any, b: any) => {
            return b.transform[5] - a.transform[5];
          });
          
          sortedItems.forEach((item: any) => {
            const y = Math.round(item.transform[5]);
            
            // Start a new line if y position changes significantly
            if (currentY === null || Math.abs(y - currentY) > 5) {
              if (currentLine.length > 0) {
                lines.push(currentLine);
              }
              currentLine = [item];
              currentY = y;
            } else {
              currentLine.push(item);
            }
          });
          
          // Add the last line
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          
          // Process each line
          lines.forEach((line, lineIndex) => {
            // Sort line items by horizontal position (x)
            line.sort((a: any, b: any) => a.transform[4] - b.transform[4]);
            
            // Combine text in the line
            const text = line.map((item: any) => item.str).join(' ').trim();
            if (!text) return;
            
            // Get the most common font size in this line
            const lineFontSizes = line.map((item: any) => item.fontSize).filter(Boolean);
            const avgLineFontSize = lineFontSizes.length > 0 
              ? lineFontSizes.reduce((a: number, b: number) => a + b, 0) / lineFontSizes.length
              : avgFontSize;
            
            // Check if this line looks like a heading
            if (isLikelyHeading(text, avgLineFontSize, avgFontSize)) {
              // Estimate heading level based on font size
              let level = 1;
              if (avgLineFontSize < avgFontSize * 1.5) level = 2;
              if (avgLineFontSize < avgFontSize * 1.2) level = 3;
              
              // Get a snippet of the next line as context
              let textSnippet = '';
              if (lineIndex < lines.length - 1) {
                textSnippet = lines[lineIndex + 1]
                  .map((item: any) => item.str)
                  .join(' ')
                  .trim()
                  .substring(0, 100);
                
                if (textSnippet.length === 100) textSnippet += '...';
              }
              
              detectedSections.push({
                title: text,
                pageNumber: i,
                level,
                textSnippet
              });
            }
          });
        }
        
        setSections(detectedSections);
        
        // Call the callback if provided
        if (onSectionDetected) {
          onSectionDetected(detectedSections);
        }
        
        // Initialize expanded sections state
        const initialExpandedState: Record<string, boolean> = {};
        detectedSections.forEach((section, idx) => {
          // Default: expand level 1 headings, collapse others
          initialExpandedState[`${section.title}-${idx}`] = section.level === 1;
        });
        setExpandedSections(initialExpandedState);
        
      } catch (error) {
        console.error('Error analyzing PDF structure:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };
    
    analyzeStructure();
  }, [pdfUrl, onSectionDetected]);
  
  // Toggle section expansion
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };
  
  // Handle navigation to a section
  const handleNavigateToSection = (section: PDFSection) => {
    if (onNavigateToSection) {
      onNavigateToSection(section);
    }
  };
  
  // Group sections by level and parent-child relationships
  const organizedSections = sections.reduce((acc: any[], section, idx) => {
    const sectionKey = `${section.title}-${idx}`;
    
    if (section.level === 1) {
      // Top-level section
      acc.push({
        ...section,
        key: sectionKey,
        children: sections
          .slice(idx + 1)
          .filter(s => s.level > 1 && (
            // Keep collecting children until we hit another level 1 section
            sections.slice(idx + 1, sections.indexOf(s)).filter(x => x.level === 1).length === 0
          ))
      });
    }
    
    return acc;
  }, []);
  
  if (sections.length === 0) {
    return (
      <div className="p-4 bg-[#2D2654] rounded-xl text-white mb-4">
        {isAnalyzing ? (
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
            <span>Analyzing document structure...</span>
          </div>
        ) : (
          <p className="text-center text-white/70">Document structure not available</p>
        )}
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-[#2D2654] rounded-xl text-white mb-4 max-h-64 overflow-y-auto">
      <h3 className="text-lg font-medium mb-3">Document Sections</h3>
      <ul className="space-y-1">
        {sections.map((section, idx) => {
          const sectionKey = `${section.title}-${idx}`;
          const isCurrentPage = section.pageNumber === currentPage;
          
          return (
            <li 
              key={sectionKey}
              style={{ 
                paddingLeft: `${section.level * 0.75}rem`,
                borderLeft: isCurrentPage ? '2px solid #6A5DB9' : 'none'
              }}
              className={`py-1 hover:bg-[#453A7C] rounded transition-colors cursor-pointer ${
                isCurrentPage ? 'bg-[#453A7C]/70 pl-3' : ''
              }`}
              onClick={() => handleNavigateToSection(section)}
            >
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 flex items-center justify-center rounded bg-[#6A5DB9] text-xs font-mono ${
                  isCurrentPage ? 'animate-pulse' : ''
                }`}>
                  {section.pageNumber}
                </span>
                <span className={`${section.level === 1 ? 'font-semibold' : ''} truncate`}>
                  {section.title}
                </span>
              </div>
              
              {section.textSnippet && expandedSections[sectionKey] && (
                <p className="text-xs text-white/70 mt-1 pl-7 italic">
                  {section.textSnippet}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}