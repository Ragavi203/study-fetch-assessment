"use client";
import React, { useState, useEffect } from 'react';
import { Annotation } from '@/types/types';

/**
 * AnnotationTester - Component to test the annotation system functionality
 * Simulates the streaming process with annotation commands
 */
export default function AnnotationTester() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');

  // Function to simulate SSE events with annotation commands
  const runAnnotationTest = () => {
    setTestRunning(true);
    setTestStatus('running');
    setTestOutput([]);
    setAnnotations([]);

    const logMessage = (message: string) => {
      setTestOutput(prev => [...prev, message]);
    };

    logMessage('🧪 Starting annotation test...');

    // Test data with annotation commands
    const testCases = [
      { 
        text: 'Here is a simple highlight [HIGHLIGHT 100 100 200 50 1]',
        expectation: 'basic highlight command'
      },
      { 
        text: 'Here is a split comm[HIGHLIGHT ',
        nextChunk: '100 150 200 70 1] across chunks',
        expectation: 'command split across chunks'
      },
      { 
        text: 'Multiple commands [HIGHLIGHT 200 200 100 50 1] in [CIRCLE 300 300 30 1] the same chunk',
        expectation: 'multiple commands in one chunk'
      },
      { 
        text: 'Command [HIGHLIGHT 100 100 200 50 ',
        nextChunk: '1] with numbers split',
        expectation: 'command with split numbers'
      },
      {
        text: 'Alternate format [HIGHLIGHT:',
        nextChunk: '150,200,100,60,1]',
        expectation: 'alternate command format'
      }
    ];

    // Track event listener
    let annotationListener: (event: Event) => void;
    
    // Run the tests in sequence
    const runTests = async () => {
      let passedCount = 0;
      let totalCount = 0;

      // Setup event listener for annotation events
      const capturedAnnotations: Annotation[] = [];
      annotationListener = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        logMessage(`📢 Event received: ${JSON.stringify(detail)}`);
      };

      window.addEventListener('ai-response-chunk', annotationListener);

      // Run each test case with delay between them
      for (const [index, test] of testCases.entries()) {
        totalCount++;
        logMessage(`\n🧪 Test ${index + 1}: ${test.expectation}`);
        
        // Track annotations before the test
        const beforeCount = capturedAnnotations.length;

        // Dispatch first part of the test
        logMessage(`🔤 Sending: "${test.text}"`);
        const event1 = new CustomEvent('ai-response-chunk', { 
          detail: { text: test.text, streamId: 'test-stream' } 
        });
        window.dispatchEvent(event1);
        
        // Wait a bit before next chunk if there is one
        if (test.nextChunk) {
          await new Promise(r => setTimeout(r, 500));
          logMessage(`🔤 Sending: "${test.nextChunk}"`);
          const event2 = new CustomEvent('ai-response-chunk', { 
            detail: { text: test.nextChunk, streamId: 'test-stream' } 
          });
          window.dispatchEvent(event2);
        }
        
        // Wait for processing
        await new Promise(r => setTimeout(r, 1000));
        
        // Check if new annotations were created
        if (capturedAnnotations.length > beforeCount) {
          logMessage(`✅ Test ${index + 1} passed: Found new annotations`);
          passedCount++;
        } else {
          logMessage(`❌ Test ${index + 1} failed: No annotations detected`);
        }
        
        // Wait between tests
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // Clean up
      window.removeEventListener('ai-response-chunk', annotationListener);
      
      // Final results
      logMessage(`\n📝 Test Results: ${passedCount}/${totalCount} tests passed`);
      setTestStatus(passedCount === totalCount ? 'success' : 'failed');
      setTestRunning(false);
    };

    // Start the test sequence
    runTests();
  };

  useEffect(() => {
    return () => {
      // Clean up any event listeners when component unmounts
      const cleanupFunc = (window as any).__annotationTestCleanup;
      if (typeof cleanupFunc === 'function') {
        cleanupFunc();
      }
    };
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Annotation System Test</h1>
      
      <div className="mb-4">
        <button
          onClick={runAnnotationTest}
          disabled={testRunning}
          className={`px-4 py-2 rounded ${
            testRunning 
              ? 'bg-gray-300 cursor-not-allowed' 
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {testRunning ? 'Test Running...' : 'Run Annotation Tests'}
        </button>
      </div>
      
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Test Status:</h2>
        <div className={`p-2 rounded ${
          testStatus === 'idle' ? 'bg-gray-100' :
          testStatus === 'running' ? 'bg-yellow-100' :
          testStatus === 'success' ? 'bg-green-100' :
          'bg-red-100'
        }`}>
          {testStatus === 'idle' && 'Not started'}
          {testStatus === 'running' && 'Tests running...'}
          {testStatus === 'success' && '✅ All tests passed!'}
          {testStatus === 'failed' && '❌ Some tests failed'}
        </div>
      </div>
      
      <div className="border rounded-lg p-4 bg-gray-50">
        <h2 className="text-lg font-semibold mb-2">Test Output:</h2>
        <pre className="bg-gray-800 text-green-400 p-4 rounded h-80 overflow-auto text-sm">
          {testOutput.length > 0 
            ? testOutput.join('\n') 
            : 'Run the test to see output here...'}
        </pre>
      </div>
    </div>
  );
}