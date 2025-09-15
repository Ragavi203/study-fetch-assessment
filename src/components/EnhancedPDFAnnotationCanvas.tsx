"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { Annotation } from '@/types/types';

// Dynamic fabric import to avoid SSR issues
let fabric: any = null;

const ensureFabric = async () => {
  if (fabric) return fabric;
  if (typeof window === 'undefined') return null;
  
  try {
    const mod: any = await import('fabric');
    fabric = mod.fabric || mod.default?.fabric || mod.default || mod;
    
    if (!fabric?.Canvas) {
      console.error('Fabric Canvas not available');
      return null;
    }
    
    return fabric;
  } catch (e) {
    console.error('Failed to load fabric:', e);
    return null;
  }
};

interface EnhancedPDFAnnotationCanvasProps {
  pageWidth: number;
  pageHeight: number;
  annotations: Annotation[];
  currentPage: number;
  onAnnotationAdd?: (annotation: Annotation) => void;
  scale?: number;
  enableInteraction?: boolean;
}

export function EnhancedPDFAnnotationCanvas({
  pageWidth,
  pageHeight,
  annotations,
  currentPage,
  onAnnotationAdd,
  scale = 1,
  enableInteraction = false
}: EnhancedPDFAnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [animatingAnnotations, setAnimatingAnnotations] = useState<Set<string>>(new Set());

  // Initialize fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    (async () => {
      const fab = await ensureFabric();
      if (!fab) return;

      try {
        // Dispose existing canvas
        if (fabricCanvasRef.current) {
          fabricCanvasRef.current.dispose();
        }

        // Create new canvas
        const canvas = new fab.Canvas(canvasRef.current, {
          width: pageWidth * scale,
          height: pageHeight * scale,
          selection: enableInteraction,
          renderOnAddRemove: true,
          backgroundColor: 'transparent',
          preserveObjectStacking: true
        });

        fabricCanvasRef.current = canvas;
        setIsReady(true);

        console.log('Enhanced PDF annotation canvas initialized');
      } catch (error) {
        console.error('Error initializing fabric canvas:', error);
      }
    })();

    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      setIsReady(false);
    };
  }, [pageWidth, pageHeight, scale, enableInteraction]);

  // Update canvas size when scale changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !isReady) return;

    const canvas = fabricCanvasRef.current;
    canvas.setDimensions({
      width: pageWidth * scale,
      height: pageHeight * scale
    });
    canvas.setZoom(scale);
    canvas.renderAll();
  }, [pageWidth, pageHeight, scale, isReady]);

  // Create annotation object
  const createAnnotationObject = useCallback(async (annotation: Annotation) => {
    if (!fabric || !fabricCanvasRef.current) return null;

    const canvas = fabricCanvasRef.current;
    const scaledX = annotation.x * scale;
    const scaledY = annotation.y * scale;

    // Common properties
    const commonProps = {
      selectable: enableInteraction,
      evented: enableInteraction,
      opacity: annotation.opacity || 0.7,
      strokeWidth: (annotation.strokeWidth || 2) * scale
    };

    try {
      switch (annotation.type) {
        case 'highlight': {
          if (!annotation.width || !annotation.height) return null;

          const rect = new fabric.Rect({
            left: scaledX,
            top: scaledY,
            width: annotation.width * scale,
            height: annotation.height * scale,
            fill: annotation.color || 'rgba(255, 255, 0, 0.3)',
            stroke: 'transparent',
            ...commonProps,
            opacity: annotation.opacity || 0.35
          });

          // Add subtle border for better visibility
          if (annotation.importance === 'high') {
            rect.set({
              stroke: 'rgba(255, 165, 0, 0.8)',
              strokeWidth: 2 * scale
            });
          }

          return rect;
        }

        case 'circle': {
          if (!annotation.radius) return null;

          const circle = new fabric.Circle({
            left: scaledX,
            top: scaledY,
            radius: annotation.radius * scale,
            fill: annotation.color ? 
              annotation.color.replace(/[\d.]+\)$/, '0.1)') : 
              'rgba(255, 0, 0, 0.1)',
            stroke: annotation.color || 'rgba(255, 0, 0, 0.8)',
            ...commonProps
          });

          return circle;
        }

        case 'arrow': {
          if (!annotation.width || !annotation.height) return null;

          const endX = scaledX + (annotation.width * scale);
          const endY = scaledY + (annotation.height * scale);

          // Create arrow line
          const line = new fabric.Line([scaledX, scaledY, endX, endY], {
            stroke: annotation.color || 'rgba(255, 0, 0, 0.8)',
            ...commonProps
          });

          // Create arrowhead
          const angle = Math.atan2(endY - scaledY, endX - scaledX);
          const headLength = 15 * scale;

          const arrowHead = new fabric.Triangle({
            left: endX,
            top: endY,
            width: 10 * scale,
            height: headLength,
            fill: annotation.color || 'rgba(255, 0, 0, 0.8)',
            angle: (angle * 180 / Math.PI) + 90,
            originX: 'center',
            originY: 'center',
            ...commonProps
          });

          // Group arrow parts
          const arrow = new fabric.Group([line, arrowHead], {
            ...commonProps
          });

          return arrow;
        }

        case 'underline': {
          if (!annotation.width) return null;

          const line = new fabric.Line([
            scaledX,
            scaledY + (annotation.height || 5) * scale,
            scaledX + annotation.width * scale,
            scaledY + (annotation.height || 5) * scale
          ], {
            stroke: annotation.color || 'rgba(0, 0, 255, 0.8)',
            ...commonProps
          });

          return line;
        }

        case 'text': {
          if (!annotation.text) return null;

          const text = new fabric.Textbox(annotation.text, {
            left: scaledX,
            top: scaledY,
            fontSize: 16 * scale,
            fill: annotation.color || '#000000',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: 5 * scale,
            width: (annotation.width || 200) * scale,
            textAlign: 'left',
            ...commonProps
          });

          return text;
        }

        case 'rectangle': {
          if (!annotation.width || !annotation.height) return null;

          const rect = new fabric.Rect({
            left: scaledX,
            top: scaledY,
            width: annotation.width * scale,
            height: annotation.height * scale,
            fill: 'transparent',
            stroke: annotation.color || 'rgba(0, 0, 255, 0.8)',
            strokeDashArray: [5 * scale, 5 * scale],
            ...commonProps
          });

          return rect;
        }

        default:
          return null;
      }
    } catch (error) {
      console.error('Error creating annotation object:', error);
      return null;
    }
  }, [fabric, scale, enableInteraction]);

  // Apply animation effects
  const applyAnimation = useCallback((obj: any, animation: string, annotationId: string) => {
    if (!obj || typeof window === 'undefined') return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Mark as animating
    setAnimatingAnnotations(prev => new Set(prev).add(annotationId));

    switch (animation) {
      case 'pulse': {
        let opacity = 1;
        const interval = setInterval(() => {
          opacity = opacity === 1 ? 0.5 : 1;
          obj.set('opacity', opacity * (obj.opacity || 1));
          canvas.renderAll();
        }, 500);

        setTimeout(() => {
          clearInterval(interval);
          setAnimatingAnnotations(prev => {
            const newSet = new Set(prev);
            newSet.delete(annotationId);
            return newSet;
          });
        }, 3000);
        break;
      }

      case 'fade': {
        let opacity = 1;
        const targetOpacity = obj.opacity || 0.7;
        const interval = setInterval(() => {
          opacity -= 0.05;
          obj.set('opacity', Math.max(opacity, targetOpacity));
          canvas.renderAll();

          if (opacity <= targetOpacity) {
            clearInterval(interval);
            setAnimatingAnnotations(prev => {
              const newSet = new Set(prev);
              newSet.delete(annotationId);
              return newSet;
            });
          }
        }, 50);
        break;
      }

      case 'zoom': {
        let scale = 0.5;
        const interval = setInterval(() => {
          scale += 0.05;
          obj.scale(scale);
          canvas.renderAll();

          if (scale >= 1) {
            clearInterval(interval);
            setAnimatingAnnotations(prev => {
              const newSet = new Set(prev);
              newSet.delete(annotationId);
              return newSet;
            });
          }
        }, 20);
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
          setAnimatingAnnotations(prev => {
            const newSet = new Set(prev);
            newSet.delete(annotationId);
            return newSet;
          });
        }, 2000);
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
          setAnimatingAnnotations(prev => {
            const newSet = new Set(prev);
            newSet.delete(annotationId);
            return newSet;
          });
        }, 1000);
        break;
      }
    }
  }, []);

  // Render annotations
  useEffect(() => {
    if (!fabricCanvasRef.current || !isReady) return;

    const canvas = fabricCanvasRef.current;
    
    // Clear existing annotations
    canvas.clear();

    // Filter annotations for current page
    const currentPageAnnotations = annotations
      .filter(a => !a.page || a.page === currentPage)
      .slice(0, 30); // Limit for performance

    console.log(`Rendering ${currentPageAnnotations.length} annotations for page ${currentPage}`);

    // Render each annotation
    currentPageAnnotations.forEach(async (annotation, index) => {
      try {
        const obj = await createAnnotationObject(annotation);
        if (!obj) return;

        // Add label if specified
        if (annotation.label) {
          const label = new fabric.Text(annotation.label, {
            left: (annotation.x + (annotation.width || 50) / 2) * scale,
            top: (annotation.y - 25) * scale,
            fontSize: 12 * scale,
            fill: '#FFFFFF',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 3 * scale,
            textAlign: 'center',
            selectable: enableInteraction,
            evented: enableInteraction
          });
          
          canvas.add(label);
        }

        canvas.add(obj);

        // Apply animation if specified
        if (annotation.animationEffect) {
          const annotationId = `${annotation.type}-${annotation.page}-${index}`;
          setTimeout(() => {
            applyAnimation(obj, annotation.animationEffect!, annotationId);
          }, index * 100); // Stagger animations
        }

      } catch (error) {
        console.error('Error rendering annotation:', error);
      }
    });

    canvas.renderAll();
  }, [annotations, currentPage, isReady, createAnnotationObject, applyAnimation, scale]);

  // Handle canvas interactions
  useEffect(() => {
    if (!fabricCanvasRef.current || !enableInteraction) return;

    const canvas = fabricCanvasRef.current;

    const handleObjectAdded = (e: any) => {
      if (onAnnotationAdd && e.target) {
        // Convert fabric object back to annotation
        const obj = e.target;
        const annotation: Annotation = {
          type: 'highlight', // Default type
          page: currentPage,
          x: obj.left / scale,
          y: obj.top / scale,
          width: obj.width / scale,
          height: obj.height / scale,
          color: obj.fill || 'rgba(255, 255, 0, 0.3)'
        };
        
        onAnnotationAdd(annotation);
      }
    };

    canvas.on('object:added', handleObjectAdded);

    return () => {
      canvas.off('object:added', handleObjectAdded);
    };
  }, [enableInteraction, onAnnotationAdd, currentPage, scale]);

  return (
    <div 
      ref={containerRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}
    >
      <canvas
        ref={canvasRef}
        className={`${enableInteraction ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{ 
          position: 'absolute',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
      
      {/* Animation indicator */}
      {animatingAnnotations.size > 0 && (
        <div className="absolute top-2 right-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded-md">
          Animating {animatingAnnotations.size} annotation{animatingAnnotations.size !== 1 ? 's' : ''}
        </div>
      )}

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs p-2 rounded">
          <div>Canvas: {pageWidth}×{pageHeight} (scale: {scale.toFixed(2)})</div>
          <div>Annotations: {annotations.length} total, {annotations.filter(a => !a.page || a.page === currentPage).length} on page {currentPage}</div>
          <div>Ready: {isReady ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
}

export default EnhancedPDFAnnotationCanvas;