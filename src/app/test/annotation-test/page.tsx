"use client";
import React, { useState, useEffect } from 'react';
import AnnotationVisualizer from '@/components/AnnotationVisualizer';
import { Annotation } from '@/types/types';

export default function AnnotationTest() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [testResults, setTestResults] = useState<{passed: number, failed: number}>({ passed: 0, failed: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  
  // Function to log messages
  const log = (message: string) => {
    setLogs(prev => [...prev, message]);
  };
  
  // Test different annotation formats
  const testCases = [
    {
      name: "Standard highlight format",
      input: "This is a test [HIGHLIGHT 1 100 200 300 50] with a standard highlight.",
      expectedCount: 1
    },
    {
      name: "Standard circle format",
      input: "This is a test [CIRCLE 1 100 200 50] with a standard circle.",
      expectedCount: 1
    },
    {
      name: "Highlight with color",
      input: "This is a test [HIGHLIGHT 1 100 200 300 50 color=\"rgba(255,0,0,0.5)\"] with a colored highlight.",
      expectedCount: 1
    },
    {
      name: "Multiple annotations",
      input: "This has [HIGHLIGHT 1 100 200 300 50] multiple [CIRCLE 1 200 300 40] annotations.",
      expectedCount: 2
    },
    {
      name: "Extra whitespace",
      input: "This has [HIGHLIGHT   1  100   200  300   50] extra whitespace.",
      expectedCount: 1
    },
    {
      name: "Split command across chunks",
      input: "This has [HIGH",
      secondChunk: "LIGHT 1 100 200 300 50] split across chunks.",
      expectedCount: 1
    },
    {
      name: "Alternative format with colon",
      input: "This has [HIGHLIGHT: 1, 100, 200, 300, 50] alternative format.",
      expectedCount: 1
    }
  ];
  
  // Simulate annotation parsing
  const parseAnnotations = (text: string): any[] => {
    const annotations: any[] = [];
    
    // Standard highlight format
    const highlightRegex = /\[\s*HIGHLIGHT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g;
    let match;
    
    while ((match = highlightRegex.exec(text)) !== null) {
      annotations.push({
        type: 'highlight',
        page: parseInt(match[1]),
        x: parseInt(match[2]),
        y: parseInt(match[3]),
        width: parseInt(match[4]),
        height: parseInt(match[5]),
        color: match[6] || 'rgba(255, 255, 0, 0.3)'
      });
    }
    
    // Circle format
    const circleRegex = /\[\s*CIRCLE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g;
    
    while ((match = circleRegex.exec(text)) !== null) {
      annotations.push({
        type: 'circle',
        page: parseInt(match[1]),
        x: parseInt(match[2]),
        y: parseInt(match[3]),
        radius: parseInt(match[4]),
        color: match[5] || 'rgba(255, 0, 0, 0.7)'
      });
    }
    
    // Alternative formats
    const highlightAltRegex = /\[\s*HIGHLIGHT\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*color="([^"]+)")?\s*\]/g;
    
    while ((match = highlightAltRegex.exec(text)) !== null) {
      annotations.push({
        type: 'highlight',
        page: parseInt(match[1]),
        x: parseInt(match[2]),
        y: parseInt(match[3]),
        width: parseInt(match[4]),
        height: parseInt(match[5]),
        color: match[6] || 'rgba(255, 255, 0, 0.3)'
      });
    }
    
    return annotations;
  };
  
  // Run tests
  useEffect(() => {
    let passed = 0;
    let failed = 0;
    
    log("Starting annotation format tests...");
    
    testCases.forEach((test, index) => {
      log(`\nTest ${index+1}: ${test.name}`);
      log(`Input: "${test.input}"`);
      
      try {
        // For split chunk test
        if (test.secondChunk) {
          const buffer = test.input + test.secondChunk;
          const results = parseAnnotations(buffer);
          log(`Results: ${JSON.stringify(results)}`);
          
          if (results.length === test.expectedCount) {
            log(`✅ Passed - Found ${results.length} annotations`);
            passed++;
          } else {
            log(`❌ Failed - Expected ${test.expectedCount}, got ${results.length}`);
            failed++;
          }
        } else {
          const results = parseAnnotations(test.input);
          log(`Results: ${JSON.stringify(results)}`);
          
          if (results.length === test.expectedCount) {
            log(`✅ Passed - Found ${results.length} annotations`);
            passed++;
          } else {
            log(`❌ Failed - Expected ${test.expectedCount}, got ${results.length}`);
            failed++;
          }
        }
      } catch (error) {
        log(`❌ Failed - Error: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    });
    
    log(`\nTest summary: ${passed} passed, ${failed} failed`);
    setTestResults({ passed, failed });
  }, []);
  
  // Test event dispatch
  useEffect(() => {
    const simulateStreamEvent = () => {
      log("\nTesting event dispatch...");
      
      // Test regular highlight
      log("Dispatching event with highlight annotation");
      const event1 = new CustomEvent('ai-response-chunk', {
        detail: {
          text: "This is a test [HIGHLIGHT 1 100 200 300 50] with an annotation.",
          streamId: 'test-stream-1'
        }
      });
      window.dispatchEvent(event1);
      
      // Test command split across chunks
      log("Dispatching split command across two events");
      const event2a = new CustomEvent('ai-response-chunk', {
        detail: {
          text: "This has a command [HIGH",
          streamId: 'test-stream-2'
        }
      });
      window.dispatchEvent(event2a);
      
      setTimeout(() => {
        const event2b = new CustomEvent('ai-response-chunk', {
          detail: {
            text: "LIGHT 1 100 200 300 50] split across chunks.",
            streamId: 'test-stream-2'
          }
        });
        window.dispatchEvent(event2b);
        log("Finished dispatching test events");
      }, 500);
    };
    
    // Add event listener to capture dispatched events
    const handleEvent = (event: CustomEvent) => {
      const customEvent = event as any;
      log(`Event received: ${customEvent.detail?.text.substring(0, 30)}...`);
      
      // Parse annotations from the event
      try {
        const newAnnotations = parseAnnotations(customEvent.detail?.text || "");
        if (newAnnotations.length > 0) {
          log(`Event contained ${newAnnotations.length} annotations`);
          setAnnotations(prev => [...prev, ...newAnnotations]);
        }
      } catch (error) {
        log(`Error parsing annotations from event: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    
    window.addEventListener('ai-response-chunk', handleEvent as EventListener);
    
    // Dispatch test events after a delay
    const timerId = setTimeout(simulateStreamEvent, 1000);
    
    return () => {
      window.removeEventListener('ai-response-chunk', handleEvent as EventListener);
      clearTimeout(timerId);
    };
  }, []);
  
  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4">Annotation Test Suite</h1>
      
      <div className="flex space-x-4 mb-6">
        <div className="bg-blue-900/30 rounded-lg p-4 flex-1">
          <h2 className="text-xl font-semibold mb-3">Test Results</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-green-900/30 px-4 py-2 rounded">
              <span className="font-bold text-xl">{testResults.passed}</span> Passed
            </div>
            <div className="bg-red-900/30 px-4 py-2 rounded">
              <span className="font-bold text-xl">{testResults.failed}</span> Failed
            </div>
          </div>
        </div>
        
        <div className="bg-blue-900/30 rounded-lg p-4 flex-1">
          <h2 className="text-xl font-semibold mb-3">Live Events</h2>
          <p>Annotations received: <span className="font-bold text-xl">{annotations.length}</span></p>
          <div className="mt-3 space-y-2">
            {annotations.map((anno, idx) => (
              <div key={idx} className="bg-gray-800 p-2 rounded">
                <span className="text-green-400">{anno.type}</span> at ({anno.x}, {anno.y}) on page {anno.page}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <AnnotationVisualizer 
        annotations={annotations} 
        onClear={() => setAnnotations([])} 
      />
      
      <div className="bg-gray-800 rounded-lg p-4 mt-6">
        <h2 className="text-xl font-semibold mb-3">Debug Log</h2>
        <div className="bg-black rounded p-4 h-[400px] overflow-y-auto font-mono text-sm">
          {logs.map((log, idx) => (
            <div key={idx} className={`mb-1 ${log.includes('Failed') ? 'text-red-400' : log.includes('Passed') ? 'text-green-400' : 'text-gray-300'}`}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}