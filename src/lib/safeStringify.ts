/**
 * Safely stringify objects, handling circular references
 * This utility is used to prevent errors when stringifying complex objects
 * with circular references, especially in debugging and logging contexts
 */

/**
 * Convert an object to a JSON string safely, handling circular references and limiting depth
 * @param obj The object to stringify
 * @param maxDepth Maximum depth to traverse (default: 2)
 * @returns JSON string representation or error message
 */
export function safeStringify(obj: any, maxDepth: number = 2): string {
  const seen = new WeakSet();
  
  try {
    return JSON.stringify(obj, replacer(seen, maxDepth));
  } catch (err) {
    return `[Error: ${err instanceof Error ? err.message : 'Failed to stringify'}]`;
  }
}

/**
 * Creates a replacer function for JSON.stringify that handles circular references
 * @param seen WeakSet to track already processed objects
 * @param maxDepth Maximum depth to traverse
 * @returns Replacer function for JSON.stringify
 */
function replacer(seen: WeakSet<any>, maxDepth: number) {
  let currentDepth = 0;
  
  return function(key: string, value: any): any {
    // Handle primitive types directly
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    
    // Skip functions
    if (typeof value === 'function') {
      return '[Function]';
    }
    
    // Handle DOM nodes
    if (typeof window !== 'undefined' && value instanceof Node) {
      return `[${value.nodeName}]`;
    }
    
    // Handle circular references
    if (seen.has(value)) {
      return '[Circular]';
    }
    
    // Track object to detect circular references
    seen.add(value);
    
    // Prevent stack overflow for Edge runtime
    currentDepth++;
    if (currentDepth > maxDepth) {
      currentDepth--;
      return Array.isArray(value) ? 
        `[Array(${value.length})]` : 
        '[Object]';
    }
    
    // Handle arrays with limited depth
    if (Array.isArray(value)) {
      const result = value.length > 10 ? 
        value.slice(0, 10).map(process) : 
        value.map(process);
      
      if (value.length > 10) {
        result.push(`... ${value.length - 10} more items`);
      }
      
      currentDepth--;
      return result;
    }
    
    // For normal objects, limit properties
    const simplified: Record<string, any> = {};
    let count = 0;
    const keys = Object.keys(value);
    
    for (let i = 0; i < keys.length && count < 7; i++) {
      const prop = keys[i];
      if (Object.prototype.hasOwnProperty.call(value, prop)) {
        simplified[prop] = process(value[prop]);
        count++;
      }
    }
    
    if (keys.length > 7) {
      simplified._more = `...${keys.length - 7} more properties`;
    }
    
    currentDepth--;
    return simplified;
    
    // Helper function for processing nested values
    function process(val: any): any {
      if (typeof val !== 'object' || val === null) {
        return val;
      }
      
      if (typeof val === 'function') {
        return '[Function]';
      }
      
      if (typeof window !== 'undefined' && val instanceof Node) {
        return `[${val.nodeName}]`;
      }
      
      if (seen.has(val)) {
        return '[Circular]';
      }
      
      if (currentDepth > maxDepth) {
        return Array.isArray(val) ? 
          `[Array(${val.length})]` : 
          '[Object]';
      }
      
      return val;
    }
  };
}