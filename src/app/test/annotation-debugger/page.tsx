"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Annotation } from '@/types/types';
import AnnotationVisualizer from '@/components/AnnotationVisualizer';

/**
 * Tool for debugging and testing the streaming annotation system
 * Allows manual creation and dispatch of stream events
 */
export default function AnnotationDebugger() {
  const [customText, setCustomText] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'manual' | 'predefined'>('manual');
  const [streamId, setStreamId] = useState(`stream-${Date.now()}`);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Function to log messages
  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 99)]);
  };
  
  // Listen for annotation events
  useEffect(() => {
    const handleEvent = (event: CustomEvent) => {
      const customEvent = event as any;
      log(`Received event with ${customEvent.detail?.text.length || 0} chars`);
      
      // Log a snippet of the text
      const text = customEvent.detail?.text || '';
      if (text) {
        log(`Content snippet: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      }
    };
    
    window.addEventListener('ai-response-chunk', handleEvent as EventListener);
    return () => {
      window.removeEventListener('ai-response-chunk', handleEvent as EventListener);
    };
  }, []);
  
  // Parse annotations from text
  const parseAnnotations = (text: string): Annotation[] => {
    const results: Annotation[] = [];
    
    try {
      // Regular highlight format
      const highlightRegex = /\[\s*HIGHLIGHT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g;
      let match;
      
      while ((match = highlightRegex.exec(text)) !== null) {
        results.push({
          type: 'highlight',
          page: parseInt(match[1], 10),
          x: parseInt(match[2], 10),
          y: parseInt(match[3], 10),
          width: parseInt(match[4], 10),
          height: parseInt(match[5], 10),
          color: match[6] || 'rgba(255, 255, 0, 0.3)'
        });
      }
      
      // Circle format
      const circleRegex = /\[\s*CIRCLE\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+color="([^"]+)")?\s*\]/g;
      
      while ((match = circleRegex.exec(text)) !== null) {
        results.push({
          type: 'circle',
          page: parseInt(match[1], 10),
          x: parseInt(match[2], 10),
          y: parseInt(match[3], 10),
          radius: parseInt(match[3], 10),
          color: match[5] || 'rgba(255, 0, 0, 0.7)'
        });
      }
      
      // Alternative format (with colons and commas)
      const altFormatRegex = /\[\s*HIGHLIGHT\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*color="([^"]+)")?\s*\]/g;
      
      while ((match = altFormatRegex.exec(text)) !== null) {
        results.push({
          type: 'highlight',
          page: parseInt(match[1], 10),
          x: parseInt(match[2], 10),
          y: parseInt(match[3], 10),
          width: parseInt(match[4], 10),
          height: parseInt(match[5], 10),
          color: match[6] || 'rgba(255, 255, 0, 0.3)'
        });
      }
      
      if (results.length > 0) {
        log(`Parsed ${results.length} annotations from text`);
      }
    } catch (error) {
      log(`Error parsing annotations: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return results;
  };
  
  // Send a stream event with the given text
  const sendStreamEvent = (text: string) => {
    try {
      log(`Dispatching event with ${text.length} chars`);
      
      const event = new CustomEvent('ai-response-chunk', {
        detail: { text, streamId }
      });
      
      window.dispatchEvent(event);
      log('Event dispatched successfully');
      
      // Parse and display annotations
      const parsedAnnotations = parseAnnotations(text);
      if (parsedAnnotations.length > 0) {
        setAnnotations(prev => [...prev, ...parsedAnnotations]);
      }
    } catch (error) {
      log(`Error dispatching event: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Handle manual text submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    
    sendStreamEvent(customText);
  };
  
  // Predefined test scenarios
  const testScenarios = [
    {
      name: "Basic Highlight",
      text: "Here's a highlight [HIGHLIGHT 1 100 200 300 50] on the page."
    },
    {
      name: "Colored Highlight",
      text: "This is a red highlight [HIGHLIGHT 1 150 300 200 40 color=\"rgba(255,0,0,0.5)\"] on the page."
    },
    {
      name: "Basic Circle",
      text: "Here's a circle [CIRCLE 1 250 350 30] on the page."
    },
    {
      name: "Multiple Annotations",
      text: "This content has multiple annotations:\n[HIGHLIGHT 1 100 100 200 40]\n[CIRCLE 1 300 200 25]\n[HIGHLIGHT 1 150 300 250 45 color=\"rgba(0,255,0,0.4)\"]"
    },
    {
      name: "Split Across Chunks",
      chunks: [
        "This annotation is split across [HIGH",
        "LIGHT 1 200 250 180 35] multiple chunks."
      ]
    },
    {
      name: "Alternative Format",
      text: "This uses an alternative format [HIGHLIGHT: 1, 220, 280, 200, 40, color=\"rgba(0,0,255,0.5)\"]."
    }
  ];
  
  // Run a test scenario
  const runTestScenario = (index: number) => {
    const scenario = testScenarios[index];
    log(`Running test scenario: ${scenario.name}`);
    
    if (scenario.chunks) {
      // For multi-chunk scenarios
      log(`Sending ${scenario.chunks.length} chunks with 500ms delay between each`);
      
      scenario.chunks.forEach((chunk, i) => {
        setTimeout(() => {
          log(`Sending chunk ${i+1}/${scenario.chunks!.length}`);
          sendStreamEvent(chunk);
        }, i * 500);
      });
    } else {
      // For single-chunk scenarios
      sendStreamEvent(scenario.text || '');
    }
  };
  
  // Generate a new stream ID
  const regenerateStreamId = () => {
    const newId = `stream-${Date.now()}`;
    setStreamId(newId);
    log(`Generated new stream ID: ${newId}`);
  };
  
  // Insert template at cursor position
  const insertTemplate = (template: string) => {
    const textArea = textAreaRef.current;
    if (!textArea) return;
    
    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const text = textArea.value;
    
    // Insert template at cursor
    const newText = text.substring(0, start) + template + text.substring(end);
    setCustomText(newText);
    
    // Set cursor position after the inserted template
    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(start + template.length, start + template.length);
    }, 0);
  };
  
  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-2">Annotation Debugger</h1>
      <p className="text-gray-400 mb-6">Tool for testing annotation parsing and event dispatching</p>
      
      <div className="flex gap-4 mb-6">
        <div className="bg-blue-900/30 px-4 py-2 rounded-lg flex items-center gap-3">
          <span className="text-blue-300">Stream ID:</span>
          <code className="bg-gray-800 px-2 py-1 rounded text-sm">{streamId}</code>
          <button 
            onClick={regenerateStreamId}
            className="bg-blue-600 text-xs px-2 py-1 rounded"
          >
            Regenerate
          </button>
        </div>
        
        <div className="bg-green-900/30 px-4 py-2 rounded-lg flex items-center gap-2">
          <span className="text-green-300">Annotations:</span>
          <span className="font-bold">{annotations.length}</span>
          
          {annotations.length > 0 && (
            <button
              onClick={() => setAnnotations([])}
              className="bg-red-600 text-xs px-2 py-1 rounded ml-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      
      <div className="flex gap-4">
        <div className="w-1/2">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="border-b border-gray-700 mb-4">
              <div className="flex">
                <button
                  className={`px-4 py-2 ${activeTab === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'} rounded-t-lg`}
                  onClick={() => setActiveTab('manual')}
                >
                  Manual Input
                </button>
                <button
                  className={`px-4 py-2 ${activeTab === 'predefined' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'} rounded-t-lg ml-2`}
                  onClick={() => setActiveTab('predefined')}
                >
                  Test Scenarios
                </button>
              </div>
            </div>
            
            {activeTab === 'manual' ? (
              <div>
                <form onSubmit={handleSubmit}>
                  <label className="block text-gray-300 mb-2">
                    Enter text with annotation commands:
                  </label>
                  
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => insertTemplate('[HIGHLIGHT 1 100 150 200 40]')}
                      className="bg-gray-700 text-xs px-3 py-1 rounded"
                    >
                      Insert Highlight
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTemplate('[CIRCLE 1 200 250 30]')}
                      className="bg-gray-700 text-xs px-3 py-1 rounded"
                    >
                      Insert Circle
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTemplate(' color="rgba(255,0,0,0.5)"')}
                      className="bg-gray-700 text-xs px-3 py-1 rounded"
                    >
                      Add Color
                    </button>
                  </div>
                  
                  <textarea
                    ref={textAreaRef}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-full h-48 px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded mb-3"
                    placeholder="Example: Here's a highlight [HIGHLIGHT 1 100 150 200 40] on the page."
                  />
                  
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                  >
                    Send Event
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold mb-3">Test Scenarios</h3>
                <div className="space-y-3">
                  {testScenarios.map((scenario, index) => (
                    <div key={index} className="bg-gray-700 p-3 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">{scenario.name}</h4>
                        <button
                          onClick={() => runTestScenario(index)}
                          className="bg-green-600 text-xs px-3 py-1 rounded"
                        >
                          Run
                        </button>
                      </div>
                      <p className="text-xs text-gray-300 truncate">
                        {scenario.chunks ? 
                          `Multi-chunk: ${scenario.chunks.length} parts` : 
                          scenario.text?.substring(0, 40) + (scenario.text?.length > 40 ? '...' : '')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Debug Log</h3>
            <div className="bg-black rounded p-3 h-[300px] overflow-y-auto text-xs font-mono">
              {logs.length === 0 ? (
                <p className="text-gray-500">No logs yet. Send an event to see logs.</p>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="mb-1 text-gray-300">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="w-1/2">
          <AnnotationVisualizer 
            annotations={annotations} 
            onClear={() => setAnnotations([])} 
          />
        </div>
      </div>
    </div>
  );
}