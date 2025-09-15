/**
 * Enhanced PDF Annotation Engine
 * Handles real-time annotation parsing, coordinate mapping, and visual effects
 */

import { Annotation } from '@/types/types';

export interface AnnotationCommand {
  type: 'highlight' | 'circle' | 'arrow' | 'underline' | 'text' | 'rectangle';
  page: number;
  coordinates: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
  };
  style: {
    color?: string;
    opacity?: number;
    strokeWidth?: number;
  };
  animation?: 'pulse' | 'fade' | 'bounce' | 'zoom' | 'shake';
  label?: string;
  importance?: 'low' | 'medium' | 'high';
}

export class AnnotationEngine {
  private commandBuffer: string = '';
  private streamId: string | null = null;
  private pageWidth: number = 612;
  private pageHeight: number = 792;

  constructor(pageWidth = 612, pageHeight = 792) {
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
  }

  /**
   * Process streaming text chunks for annotation commands
   */
  processStreamChunk(chunk: string, currentStreamId?: string): {
    annotations: Annotation[];
    cleanedText: string;
    hasCommands: boolean;
  } {
    // Reset buffer for new streams
    if (currentStreamId && this.streamId !== currentStreamId) {
      this.commandBuffer = '';
      this.streamId = currentStreamId;
    }

    // Add chunk to buffer
    this.commandBuffer += chunk;

    // Extract complete commands
    const result = this.parseAnnotationCommands(this.commandBuffer);
    
    // Update buffer with remaining incomplete commands
    this.commandBuffer = this.extractIncompleteCommands(this.commandBuffer);

    return {
      annotations: result.annotations,
      cleanedText: chunk.replace(/\[(?:HIGHLIGHT|CIRCLE|ARROW|UNDERLINE|TEXT|RECTANGLE)[^\]]*\]/g, ''),
      hasCommands: result.annotations.length > 0
    };
  }

  /**
   * Parse annotation commands from text with enhanced pattern matching
   */
  parseAnnotationCommands(text: string, currentPage = 1): {
    annotations: Annotation[];
    cleanedText: string;
  } {
    const annotations: Annotation[] = [];
    let cleanedText = text;

    // Enhanced regex patterns for different annotation types
    const patterns = {
      highlight: [
        // Standard format: [HIGHLIGHT page x y width height]
        /\[\s*HIGHLIGHT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g,
        // Page-first format: [HIGHLIGHT PAGE 1 x y width height]
        /\[\s*HIGHLIGHT\s+(?:PAGE\s+)?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g,
        // Colon format: [HIGHLIGHT: page, x, y, width, height]
        /\[\s*HIGHLIGHT\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*color="([^"]+)")?\s*\]/g,
        // Key-value format: [HIGHLIGHT page=1 x=100 y=200 width=300 height=50]
        /\[\s*HIGHLIGHT\s+page=(\d+)\s+x=(\d+)\s+y=(\d+)\s+width=(\d+)\s+height=(\d+)(?:\s+color="([^"]+)")?\s*\]/g
      ],
      circle: [
        // Standard format: [CIRCLE page x y radius]
        /\[\s*CIRCLE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g,
        // Page-first format: [CIRCLE PAGE 1 x y radius]
        /\[\s*CIRCLE\s+(?:PAGE\s+)?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g,
        // Colon format: [CIRCLE: page, x, y, radius]
        /\[\s*CIRCLE\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*color="([^"]+)")?\s*\]/g
      ],
      arrow: [
        // [ARROW page x1 y1 x2 y2]
        /\[\s*ARROW\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g
      ],
      underline: [
        // [UNDERLINE page x y width]
        /\[\s*UNDERLINE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g
      ],
      text: [
        // [TEXT page x y "content"]
        /\[\s*TEXT\s+(\d+)\s+(\d+)\s+(\d+)\s+"([^"]+)"(?:\s+color="([^"]+)")?\s*\]/g
      ],
      rectangle: [
        // [RECTANGLE page x y width height]
        /\[\s*RECTANGLE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g
      ]
    };

    // Process each annotation type
    Object.entries(patterns).forEach(([type, regexList]) => {
      regexList.forEach(regex => {
        let match;
        while ((match = regex.exec(text)) !== null) {
          const annotation = this.createAnnotation(type as any, match, currentPage);
          if (annotation) {
            annotations.push(annotation);
            cleanedText = cleanedText.replace(match[0], '');
          }
        }
      });
    });

    // Clean up extra whitespace
    cleanedText = cleanedText.replace(/\s{2,}/g, ' ').trim();

    return { annotations, cleanedText };
  }

  /**
   * Create annotation object from regex match
   */
  private createAnnotation(
    type: string,
    match: RegExpMatchArray,
    currentPage: number
  ): Annotation | null {
    try {
      const page = parseInt(match[1], 10) || currentPage;
      
      switch (type) {
        case 'highlight': {
          const x = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          const width = parseInt(match[4], 10);
          const height = parseInt(match[5], 10);
          const color = match[6] || 'rgba(255, 255, 0, 0.3)';

          return this.optimizeHighlight({
            type: 'highlight',
            page,
            x: this.clampX(x),
            y: this.clampY(y),
            width: this.clampWidth(width, x),
            height: this.clampHeight(height, y),
            color,
            animationEffect: 'pulse',
            opacity: 0.35
          });
        }

        case 'circle': {
          const x = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          const radius = parseInt(match[4], 10);
          const color = match[5] || 'rgba(255, 0, 0, 0.7)';

          return {
            type: 'circle',
            page,
            x: this.clampX(x),
            y: this.clampY(y),
            radius: Math.max(5, Math.min(radius, 100)),
            color,
            animationEffect: 'pulse',
            opacity: 0.7
          };
        }

        case 'arrow': {
          const x1 = parseInt(match[2], 10);
          const y1 = parseInt(match[3], 10);
          const x2 = parseInt(match[4], 10);
          const y2 = parseInt(match[5], 10);
          const color = match[6] || 'rgba(255, 0, 0, 0.8)';

          return {
            type: 'arrow',
            page,
            x: this.clampX(x1),
            y: this.clampY(y1),
            width: x2 - x1,
            height: y2 - y1,
            color,
            strokeWidth: 2
          };
        }

        case 'underline': {
          const x = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          const width = parseInt(match[4], 10);
          const color = match[5] || 'rgba(0, 0, 255, 0.8)';

          return {
            type: 'underline',
            page,
            x: this.clampX(x),
            y: this.clampY(y),
            width: this.clampWidth(width, x),
            height: 3,
            color,
            strokeWidth: 2
          };
        }

        case 'text': {
          const x = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          const content = match[4];
          const color = match[5] || 'rgba(0, 0, 0, 0.9)';

          return {
            type: 'text',
            page,
            x: this.clampX(x),
            y: this.clampY(y),
            text: content,
            color,
            width: Math.min(content.length * 8, this.pageWidth - x - 20),
            height: 20
          };
        }

        case 'rectangle': {
          const x = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          const width = parseInt(match[4], 10);
          const height = parseInt(match[5], 10);
          const color = match[6] || 'rgba(0, 0, 255, 0.3)';

          return {
            type: 'rectangle',
            page,
            x: this.clampX(x),
            y: this.clampY(y),
            width: this.clampWidth(width, x),
            height: this.clampHeight(height, y),
            color,
            strokeWidth: 2
          };
        }

        default:
          return null;
      }
    } catch (error) {
      console.error('Error creating annotation:', error);
      return null;
    }
  }

  /**
   * Optimize highlight annotations for better visual appearance
   */
  private optimizeHighlight(annotation: Annotation): Annotation {
    // Split tall highlights into multiple lines
    if (annotation.height && annotation.height > 40) {
      const lineHeight = 22;
      const lines = Math.ceil(annotation.height / lineHeight);
      
      // Return the first line, additional lines would be handled separately
      return {
        ...annotation,
        height: Math.min(lineHeight, annotation.height),
        label: lines > 1 ? `Line 1 of ${lines}` : undefined
      };
    }

    // Ensure minimum visibility
    if (annotation.height && annotation.height < 12) {
      annotation.height = 16;
    }

    // Snap to text grid for better alignment
    if (annotation.y) {
      const gridSize = 22;
      annotation.y = Math.round(annotation.y / gridSize) * gridSize;
    }

    return annotation;
  }

  /**
   * Extract incomplete commands from buffer
   */
  private extractIncompleteCommands(text: string): string {
    const incompletePattern = /\[(?:HIGHLIGHT|CIRCLE|ARROW|UNDERLINE|TEXT|RECTANGLE)[^\]]*$/;
    const match = text.match(incompletePattern);
    return match ? match[0] : '';
  }

  /**
   * Coordinate clamping functions
   */
  private clampX(x: number): number {
    return Math.max(0, Math.min(x, this.pageWidth - 20));
  }

  private clampY(y: number): number {
    return Math.max(0, Math.min(y, this.pageHeight - 20));
  }

  private clampWidth(width: number, x: number): number {
    return Math.max(10, Math.min(width, this.pageWidth - x - 10));
  }

  private clampHeight(height: number, y: number): number {
    return Math.max(10, Math.min(height, this.pageHeight - y - 10));
  }

  /**
   * Generate fallback annotation when AI doesn't provide specific coordinates
   */
  generateFallbackAnnotation(page: number, textHint?: string): Annotation {
    // Estimate position based on text hint or use default
    const estimatedY = textHint ? 
      (textHint.toLowerCase().includes('title') ? 120 : 200) : 200;
    
    const estimatedWidth = textHint ? 
      Math.min(Math.max(textHint.length * 7, 160), 520) : 400;

    return {
      type: 'highlight',
      page,
      x: 80,
      y: estimatedY,
      width: estimatedWidth,
      height: 24,
      color: 'rgba(255, 255, 0, 0.25)',
      animationEffect: 'pulse',
      label: 'AI Highlight'
    };
  }

  /**
   * Parse navigation commands
   */
  parseNavigationCommands(text: string, currentPage: number): {
    targetPage: number | null;
    hasNavigation: boolean;
    command: string | null;
  } {
    const patterns = [
      { regex: /\[GO TO PAGE (\d+)\]/i, type: 'goto' },
      { regex: /\[NEXT PAGE\]/i, type: 'next' },
      { regex: /\[PREV(?:IOUS)? PAGE\]/i, type: 'prev' },
      { regex: /\[FIRST PAGE\]/i, type: 'first' },
      { regex: /\[LAST PAGE\]/i, type: 'last' }
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        let targetPage = currentPage;
        
        switch (pattern.type) {
          case 'goto':
            targetPage = parseInt(match[1], 10);
            break;
          case 'next':
            targetPage = currentPage + 1;
            break;
          case 'prev':
            targetPage = currentPage - 1;
            break;
          case 'first':
            targetPage = 1;
            break;
          case 'last':
            targetPage = 9999; // Will be clamped by caller
            break;
        }

        return {
          targetPage,
          hasNavigation: true,
          command: match[0]
        };
      }
    }

    return {
      targetPage: null,
      hasNavigation: false,
      command: null
    };
  }

  /**
   * Clean text by removing annotation and navigation commands
   */
  cleanText(text: string): string {
    return text
      .replace(/\[(?:HIGHLIGHT|CIRCLE|ARROW|UNDERLINE|TEXT|RECTANGLE)[^\]]*\]/g, '')
      .replace(/\[(?:GO TO PAGE \d+|NEXT PAGE|PREV(?:IOUS)? PAGE|FIRST PAGE|LAST PAGE)\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

// Export singleton instance
export const annotationEngine = new AnnotationEngine();