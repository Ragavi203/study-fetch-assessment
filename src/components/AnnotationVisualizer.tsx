import { useRef, useState, useEffect } from 'react';
import { Annotation } from '@/types/types';

/**
 * AnnotationVisualizer component - helps to visualize annotations for debugging purposes
 */
export default function AnnotationVisualizer({
  annotations = [],
  canvasWidth = 800,
  canvasHeight = 1000,
  onClear
}: {
  annotations: Annotation[];
  canvasWidth?: number;
  canvasHeight?: number;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState<number>(1);
  
  // Draw annotations on canvas whenever they change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all annotations
    annotations.forEach(annotation => {
      // Apply scale factor
      const x = annotation.x * scale;
      const y = annotation.y * scale;
      
      // Set color with fallback
      ctx.strokeStyle = annotation.color || 'rgba(255, 255, 0, 0.5)';
      ctx.fillStyle = annotation.color || 'rgba(255, 255, 0, 0.3)';
      
      if (annotation.type === 'highlight') {
        // Use default values for width/height if undefined
        const width = (annotation.width || 100) * scale;
        const height = (annotation.height || 20) * scale;
        
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        
        // Add text label
        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${annotation.page || 1}:${x},${y}`, x, y - 5);
      } else if (annotation.type === 'circle') {
        // Use default radius if undefined
        const radius = (annotation.radius || 20) * scale;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Add text label
        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${annotation.page || 1}:${x},${y}`, x, y - radius - 5);
      }
    });
  }, [annotations, scale]);
  
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Annotation Preview ({annotations.length})</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Scale:</span>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-white font-mono">{scale.toFixed(1)}x</span>
          </div>
          <button
            onClick={onClear}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded"
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="overflow-auto max-h-[500px] bg-gray-900 rounded border border-gray-700">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="bg-white"
        />
      </div>
      
      <div className="mt-4 space-y-2">
        <h4 className="font-semibold text-gray-300">Debug Information:</h4>
        {annotations.length === 0 ? (
          <p className="text-sm text-gray-400">No annotations to display</p>
        ) : (
          <div className="space-y-1 text-sm">
            {annotations.map((anno, i) => (
              <div key={i} className="bg-gray-700 p-2 rounded flex justify-between">
                <div>
                  <span className="text-blue-300">{anno.type}</span>
                  <span className="text-gray-300"> on page {anno.page}</span>
                  <span className="text-gray-400 ml-2">
                    {anno.type === 'highlight' 
                      ? `(${anno.x}, ${anno.y}, ${anno.width}x${anno.height})`
                      : `(${anno.x}, ${anno.y}, r=${anno.radius})`}
                  </span>
                </div>
                <span className="font-mono text-xs bg-gray-800 px-2 py-0.5 rounded">
                  {anno.color || 'default'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}