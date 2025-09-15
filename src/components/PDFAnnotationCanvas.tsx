"use client";
import { useEffect, useRef, useState } from 'react';
import { Annotation } from '@/types/types';

// Define a dynamic import for fabric
let fabric: any = null;

// Async dynamic loader to avoid SSR issues
const ensureFabric = async () => {
  if (fabric) return fabric;
  if (typeof window === 'undefined') return null;
  try {
  const mod: any = await import('fabric');
  // Common exports: either default (ESM) or direct
  fabric = mod.fabric || mod.default?.fabric || mod.default || mod;
    if (!fabric?.Canvas) {
      console.error('Fabric module loaded but Canvas missing. Module keys:', Object.keys(mod));
      return null;
    }
    return fabric;
  } catch (e) {
    console.error('Failed dynamic import of fabric:', e);
    return null;
  }
};

interface PDFAnnotationCanvasProps {
  pageWidth: number;
  pageHeight: number;
  annotations: Annotation[];
  currentPage: number; // Add current page to filter annotations by page
  onAnnotationAdd?: (annotation: Annotation) => void;
}

export function PDFAnnotationCanvas({
  pageWidth,
  pageHeight,
  annotations,
  currentPage,
  onAnnotationAdd
}: PDFAnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [animating, setAnimating] = useState(false);
  const previousAnnotationsRef = useRef<Annotation[]>([]);
  const contentOffsetRef = useRef<{x:number;y:number}|null>(null);
  const lineHeightRef = useRef<number>(22);

  // Log component props for debugging
  useEffect(() => {
    console.log('PDFAnnotationCanvas rendering:', {
      pageWidth,
      pageHeight, 
      annotationsCount: annotations.length,
      currentPage
    });
  }, [pageWidth, pageHeight, annotations.length, currentPage]);

  // Update canvas size based on container size
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      
      // Calculate scale based on the container size and PDF page size
      const scaleX = rect.width / pageWidth;
      const scaleY = rect.height / pageHeight;
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);

      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.setDimensions({
          width: pageWidth * newScale,
          height: pageHeight * newScale
        });
        fabricCanvasRef.current.setZoom(newScale);
        fabricCanvasRef.current.renderAll();
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [pageWidth, pageHeight]);

  // Initialize fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    (async () => {
      const fab = await ensureFabric();
      if (!fab) {
        console.error('Fabric not available after dynamic import.');
        return;
      }
      try {
        if (fabricCanvasRef.current) {
          fabricCanvasRef.current.dispose();
        }
        const canvas = new fab.Canvas(canvasRef.current, {
          width: pageWidth * scale,
          height: pageHeight * scale,
          selection: false,
          renderOnAddRemove: true,
          backgroundColor: 'transparent'
        });
        fabricCanvasRef.current = canvas;
        console.log('Fabric canvas initialized (dynamic) with dimensions:', { width: pageWidth * scale, height: pageHeight * scale });
      } catch (error) {
        console.error('Error initializing fabric canvas (dynamic):', error);
      }
    })();

    // Cleanup
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
  }, [pageWidth, pageHeight, scale]);

  // Filter and render annotations when they change or the page changes
  useEffect(() => {
    // Make sure fabric is initialized and we have a canvas
    if (!fabric || !fabricCanvasRef.current) return;
    
    // Use a simple rendering approach to avoid complex timing issues
    const canvas = fabricCanvasRef.current;
    
    // Clear existing annotations
    canvas.clear();

    // Filter annotations for the current page only (with limit)
    // Try to detect content offset (first run or if not set)
    if (!contentOffsetRef.current && containerRef.current) {
      try {
        // Heuristic: find underlying page text layer inside sibling elements
        const parentEl = containerRef.current.parentElement?.parentElement; // overlay -> wrapper -> page container
        if (parentEl) {
          const textSpan = parentEl.querySelector('span[role="presentation"], span[aria-label]');
          if (textSpan) {
            const spanRect = (textSpan as HTMLElement).getBoundingClientRect();
            const overlayRect = containerRef.current.getBoundingClientRect();
            const offX = spanRect.left - overlayRect.left;
            const offY = spanRect.top - overlayRect.top;
            if (Math.abs(offX) < 200 && Math.abs(offY) < 400) {
              contentOffsetRef.current = { x: offX, y: offY };
              console.log('[PDFAnnotationCanvas] Detected content offset', contentOffsetRef.current);
            }
          }
        }
      } catch (e) {
        console.warn('Offset detection failed', e);
      }
    }

    let currentPageAnnotations = annotations
      .filter(a => a.page === currentPage || a.page === undefined || a.page === null)
      .slice(0, 30); // Limit to 30 annotations per page to prevent performance issues

    // Normalize coordinates that exceed page bounds (common if model uses full-size PDF coordinates but we scale to fixed dimensions)
  const maxW = pageWidth;
  const maxH = pageHeight;
  const offset = contentOffsetRef.current || { x:0, y:0 };
    const splitHighlights: Annotation[] = [];
    currentPageAnnotations = currentPageAnnotations.map(a => {
      if (a.type === 'highlight' && a.width && a.height) {
        const orig = { ...a };
        let { x, y, width, height } = a as any;
        // Apply content offset compensation (translate AI coordinates relative to PDF content origin)
        x += offset.x;
        y += offset.y;

        // Large coordinate down-scale
        if (width > maxW * 2 || height > maxH * 2 || x > maxW * 2 || y > maxH * 2) {
          const scaleFactorX = maxW / (x + width);
          const scaleFactorY = maxH / (y + height);
          const s = Math.min(scaleFactorX, scaleFactorY, 1);
          x = Math.round(x * s); y = Math.round(y * s);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        // Heuristic: if highlight is extremely tall ( > 120 ) shrink to 60 (single line-ish)
  if (height > 120) height = 60;
        // Heuristic: if highlight is very short (<10) expand to 16 for visibility
        if (height < 10) height = 16;
  // Clamp width to page minus margin and logical content column (e.g., 520)
  const maxContentWidth = Math.min(maxW - 20, 520);
  if (width > maxContentWidth) width = maxContentWidth;
        // Position clamps
        if (x < 0) x = 0; if (y < 0) y = 0;
        if (x + width > maxW) x = Math.max(0, maxW - width);
        if (y + height > maxH) y = Math.max(0, maxH - height);
        const adjusted = { ...a, x, y, width, height };
        if (orig.x !== x || orig.y !== y || orig.width !== width || orig.height !== height) {
          console.log('[PDFAnnotationCanvas] Adjusted highlight heuristics', { orig, adjusted, offsetApplied: offset });
        }
        // Snap Y to line grid (22px) for consistency after sizing heuristics
        const grid = lineHeightRef.current;
        y = Math.round(y / grid) * grid;

        // Split tall blocks (>40) into multiple lines (approx line height 22)
        if (adjusted.height > 40) {
          const lineH = 22;
            const lines = Math.ceil(adjusted.height / lineH);
            for (let i = 0; i < lines; i++) {
              const h = i === lines - 1 ? Math.min(lineH, adjusted.height - i * lineH) : lineH;
              splitHighlights.push({
                ...adjusted,
                y: adjusted.y + i * lineH,
                height: h
              });
            }
            console.log('[PDFAnnotationCanvas] Split highlight', { orig, adjusted, lines: splitHighlights.slice(-lines) });
            return null as any; // filtered later
        }
        return adjusted;
      }
      return a;
    });
    if (splitHighlights.length) {
      currentPageAnnotations = currentPageAnnotations.filter(a => a !== null) as Annotation[];
      currentPageAnnotations.push(...splitHighlights);
    }
    
  console.log(`Rendering ${currentPageAnnotations.length} annotations for page ${currentPage} (after split)`, currentPageAnnotations);
    
    // Check if we have new annotations that weren't in the previous render
    const hasNewAnnotations = currentPageAnnotations.some(anno => 
      !previousAnnotationsRef.current.find(prev => 
        prev.page === anno.page && 
        prev.x === anno.x && 
        prev.y === anno.y && 
        prev.type === anno.type
      )
    );
    
    // Save current annotations for next comparison
    previousAnnotationsRef.current = [...currentPageAnnotations];
    
    // If there are new annotations, trigger animation
    if (hasNewAnnotations && currentPageAnnotations.length > 0) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 2000);
    }

    // Draw new annotations with proper scaling
    currentPageAnnotations.forEach(annotation => {
      try {
        // Default colors based on importance
        const getColorByImportance = (baseColor: string) => {
          switch(annotation.importance) {
            case 'high': 
              return baseColor === 'rgba(255, 255, 0, 0.3)' ? 'rgba(255, 165, 0, 0.4)' : 'rgba(255, 0, 0, 0.8)'; // Orange/Red
            case 'medium': 
              return baseColor === 'rgba(255, 255, 0, 0.3)' ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 165, 0, 0.7)'; // Yellow/Orange
            case 'low':
              return baseColor === 'rgba(255, 255, 0, 0.3)' ? 'rgba(144, 238, 144, 0.4)' : 'rgba(0, 128, 0, 0.7)'; // Light green/Green
            default:
              return baseColor;
          }
        };

        const highlightColor = getColorByImportance(annotation.color || 'rgba(255, 255, 0, 0.3)');
        const circleColor = getColorByImportance(annotation.color || 'red');
  const opacity = annotation.opacity || (annotation.type === 'highlight' ? 0.35 : 0.7);
        const strokeWidth = annotation.strokeWidth ? annotation.strokeWidth * scale : 2 * scale;
        
        // Define animation style based on annotation.animationEffect
        const applyAnimation = (obj: any) => {
          if (!hasNewAnnotations || !annotation.animationEffect) return;
          
          if (typeof window !== 'undefined') {
            switch (annotation.animationEffect) {
              case 'pulse': {
                let opacity = 1;
                const interval = setInterval(() => {
                  opacity = opacity === 1 ? 0.5 : 1;
                  obj.set('opacity', opacity * (annotation.opacity || 1));
                  canvas.renderAll();
                }, 500);
                
                setTimeout(() => clearInterval(interval), 3000);
                break;
              }
              case 'fade': {
                let opacity = 1;
                const interval = setInterval(() => {
                  opacity -= 0.05;
                  obj.set('opacity', opacity);
                  canvas.renderAll();
                  
                  if (opacity <= (annotation.opacity || 0.5)) {
                    clearInterval(interval);
                  }
                }, 50);
                break;
              }
              case 'zoom': {
                let size = 0.5;
                const interval = setInterval(() => {
                  size += 0.05;
                  obj.scale(size);
                  canvas.renderAll();
                  
                  if (size >= 1) {
                    clearInterval(interval);
                  }
                }, 20);
                break;
              }
              case 'shake': {
                const originalLeft = obj.left;
                const interval = setInterval(() => {
                  obj.set('left', originalLeft + (Math.random() * 10 - 5));
                  canvas.renderAll();
                }, 50);
                
                setTimeout(() => {
                  clearInterval(interval);
                  obj.set('left', originalLeft);
                  canvas.renderAll();
                }, 1000);
                break;
              }
              case 'bounce': {
                const originalTop = obj.top;
                let direction = -1;
                let current = 0;
                const interval = setInterval(() => {
                  current += direction;
                  if (current <= -10 || current >= 0) direction *= -1;
                  obj.set('top', originalTop + current);
                  canvas.renderAll();
                }, 50);
                
                setTimeout(() => {
                  clearInterval(interval);
                  obj.set('top', originalTop);
                  canvas.renderAll();
                }, 2000);
                break;
              }
            }
          }
        };
        
        // Add label if specified
        const addLabel = (x: number, y: number, isCircle = false) => {
          if (!annotation.label) return;
          
          const labelText = new fabric.Text(annotation.label, {
            left: (x + (isCircle ? annotation.radius || 30 : (annotation.width || 100) / 2)) * scale,
            top: (y - 20) * scale,
            fontSize: 16 * scale,
            fill: '#FFFFFF',
            backgroundColor: '#000000',
            padding: 5,
            textAlign: 'center',
            fontWeight: 'bold',
            selectable: false,
            evented: false,
          });
          
          canvas.add(labelText);
        };
        
        switch (annotation.type) {
          case 'highlight': {
            if (!annotation.width || !annotation.height) {
              console.warn('Skipping highlight with missing dimensions:', annotation);
              return;
            }
            
            const rect = new fabric.Rect({
              left: annotation.x * scale,
              top: annotation.y * scale,
              width: annotation.width * scale,
              height: annotation.height * scale,
              fill: highlightColor,
              selectable: false,
              evented: false,
              opacity: opacity,
              strokeWidth: 0
            });
            canvas.add(rect);
            
            // Add label if specified
            addLabel(annotation.x, annotation.y);
            
            // Apply animation if specified
            applyAnimation(rect);
            
            // (Removed animated border for cleaner look)
            break;
          }
          case 'circle': {
            if (!annotation.radius) {
              console.warn('Skipping circle with missing radius:', annotation);
              return;
            }
            
            const circle = new fabric.Circle({
              left: annotation.x * scale,
              top: annotation.y * scale,
              radius: annotation.radius * scale,
              stroke: circleColor,
              strokeWidth: strokeWidth,
              fill: annotation.color ? `${annotation.color.split(',').slice(0, 3)}, 0.1)` : 'rgba(255, 0, 0, 0.1)',
              selectable: false,
              evented: false,
              opacity: opacity
            });
            canvas.add(circle);
            
            // Add label if specified
            addLabel(annotation.x, annotation.y, true);
            
            // Apply animation if specified
            applyAnimation(circle);
            
            // Add an animated effect for new circles
            if (hasNewAnnotations) {
              const animatedCircle = new fabric.Circle({
                left: annotation.x * scale,
                top: annotation.y * scale,
                radius: annotation.radius * scale,
                stroke: 'rgba(255, 0, 0, 0.8)',
                strokeWidth: 3 * scale,
                fill: 'transparent',
                selectable: false,
                evented: false,
                opacity: 1
              });
              canvas.add(animatedCircle);
              
              // Animation effect
              if (typeof window !== 'undefined') {
                let size = 1;
                let opacity = 1;
                const pulseInterval = setInterval(() => {
                  size += 0.05;
                  opacity -= 0.05;
                  animatedCircle.set({
                    scaleX: size,
                    scaleY: size,
                    opacity: opacity
                  });
                  canvas.renderAll();
                  
                  if (opacity <= 0) {
                    clearInterval(pulseInterval);
                    canvas.remove(animatedCircle);
                  }
                }, 50);
              }
            }
            break;
          }
          case 'underline': {
            if (!annotation.width) {
              console.warn('Skipping underline with missing width:', annotation);
              return;
            }
            
            const line = new fabric.Line(
              [
                annotation.x * scale, 
                (annotation.y + (annotation.height || 5)) * scale, 
                (annotation.x + annotation.width) * scale, 
                (annotation.y + (annotation.height || 5)) * scale
              ],
              {
                stroke: annotation.color || 'blue',
                strokeWidth: strokeWidth,
                selectable: false,
                evented: false,
                opacity: opacity
              }
            );
            canvas.add(line);
            
            // Apply animation if specified
            applyAnimation(line);
            break;
          }
          case 'arrow': {
            if (!annotation.width) {
              console.warn('Skipping arrow with missing width:', annotation);
              return;
            }
            
            // Calculate endpoints
            const startX = annotation.x * scale;
            const startY = annotation.y * scale;
            const endX = (annotation.x + annotation.width) * scale;
            const endY = (annotation.y + (annotation.height || 0)) * scale;
            
            // Draw the line
            const line = new fabric.Line([startX, startY, endX, endY], {
              stroke: annotation.color || 'red',
              strokeWidth: strokeWidth,
              selectable: false,
              evented: false
            });
            
            // Calculate arrowhead points
            const angle = Math.atan2(endY - startY, endX - startX);
            const headLength = 15 * scale;
            
            const arrowHead = new fabric.Triangle({
              left: endX,
              top: endY,
              pointType: 'arrow_start',
              angle: (angle * 180 / Math.PI) + 90,
              width: 10 * scale,
              height: headLength,
              fill: annotation.color || 'red',
              selectable: false,
              evented: false
            });
            
            // Group the arrow parts
            const arrow = new fabric.Group([line, arrowHead], {
              selectable: false,
              evented: false,
              opacity: opacity
            });
            
            canvas.add(arrow);
            
            // Apply animation if specified
            applyAnimation(arrow);
            break;
          }
          case 'text': {
            if (!annotation.text) {
              console.warn('Skipping text annotation with missing text:', annotation);
              return;
            }
            
            // Background for better readability
            const padding = 8 * scale;
            const fontSize = 16 * scale;
            const textBox = new fabric.Textbox(annotation.text, {
              left: annotation.x * scale,
              top: annotation.y * scale,
              fontSize: fontSize,
              fill: '#FFFFFF',
              backgroundColor: annotation.color || 'rgba(0, 0, 0, 0.7)',
              padding: padding,
              width: (annotation.width || 200) * scale,
              textAlign: 'center',
              selectable: false,
              evented: false,
              opacity: opacity,
              borderColor: '#FFFFFF',
              cornerColor: '#FFFFFF',
              cornerStrokeColor: '#FFFFFF',
              transparentCorners: false
            });
            
            canvas.add(textBox);
            
            // Apply animation if specified
            applyAnimation(textBox);
            break;
          }
          case 'rectangle': {
            if (!annotation.width || !annotation.height) {
              console.warn('Skipping rectangle with missing dimensions:', annotation);
              return;
            }
            
            const rect = new fabric.Rect({
              left: annotation.x * scale,
              top: annotation.y * scale,
              width: annotation.width * scale,
              height: annotation.height * scale,
              fill: 'transparent',
              stroke: annotation.color || 'blue',
              strokeWidth: strokeWidth,
              strokeDashArray: [5, 5], // Dashed outline
              selectable: false,
              evented: false,
              opacity: opacity
            });
            canvas.add(rect);
            
            // Add label if specified
            addLabel(annotation.x, annotation.y);
            
            // Apply animation if specified
            applyAnimation(rect);
            break;
          }
          case 'freeform': {
            if (!annotation.text) {
              console.warn('Skipping freeform with missing path data:', annotation);
              return;
            }
            
            try {
              // The path data should be stored in the text field as a JSON string
              const pathData = JSON.parse(annotation.text);
              
              // Scale the path points
              const scaledPath = pathData.map((point: [number, number]) => [point[0] * scale, point[1] * scale]);
              
              const path = new fabric.Path(scaledPath, {
                stroke: annotation.color || 'purple',
                strokeWidth: strokeWidth,
                fill: 'transparent',
                selectable: false,
                evented: false,
                opacity: opacity
              });
              
              canvas.add(path);
              
              // Apply animation if specified
              applyAnimation(path);
            } catch (e) {
              console.error('Failed to parse freeform path data:', e);
            }
            break;
          }
        }
      } catch (error) {
        console.error('Error rendering annotation:', error);
      }
    });

    // Make sure all annotations are rendered
    canvas.setZoom(scale);
    canvas.renderAll();
  }, [annotations, currentPage, scale]);

  return (
    <div 
      ref={containerRef} 
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      <canvas
        ref={canvasRef}
        style={{ 
          pointerEvents: 'none',
          position: 'absolute'
        }}
        className={animating ? "annotation-pulse" : ""}
      />
      
      {/* Add a style tag for animation */}
      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 255, 0, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(255, 255, 0, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 255, 0, 0); }
        }
        
        .annotation-pulse {
          animation: pulse 2s ease-out;
        }
      `}</style>
    </div>
  );
}
