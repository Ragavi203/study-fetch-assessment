/**
 * Unit tests for the Annotation Engine
 * Tests parsing of annotation commands, coordinate normalization, and navigation
 */

import { annotationEngine } from './annotationEngine';

describe('AnnotationEngine Parser', () => {
  // Test highlight command parsing
  describe('Highlight command parsing', () => {
    test('should parse standard highlight command format', () => {
      const text = 'Look at this section [HIGHLIGHT 1 100 200 300 50]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'highlight',
        page: 1,
        x: 100,
        y: 200,
        width: 300,
        height: 50
      });
    });
    
    test('should handle highlight command with color', () => {
      const text = 'Check this [HIGHLIGHT 2 150 250 200 30 color="rgba(255,0,0,0.5)"]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'highlight',
        page: 2,
        x: 150,
        y: 250,
        width: 200,
        height: 30,
        color: 'rgba(255,0,0,0.5)'
      });
    });
    
    test('should parse alternate highlight format with PAGE keyword', () => {
      const text = 'Note this definition [HIGHLIGHT PAGE 3 200 300 250 40]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'highlight',
        page: 3,
        x: 200,
        y: 300,
        width: 250,
        height: 40
      });
    });
    
    test('should parse colon format highlight', () => {
      const text = 'Important detail [HIGHLIGHT: 2, 100, 150, 300, 25]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'highlight',
        page: 2,
        x: 100,
        y: 150,
        width: 300,
        height: 25
      });
    });
  });
  
  // Test circle command parsing
  describe('Circle command parsing', () => {
    test('should parse standard circle command', () => {
      const text = 'Focus on this diagram [CIRCLE 1 300 400 50]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'circle',
        page: 1,
        x: 300,
        y: 400,
        radius: 50
      });
    });
    
    test('should handle circle command with color', () => {
      const text = 'Notice this element [CIRCLE 3 250 350 40 color="rgba(0,0,255,0.7)"]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'circle',
        page: 3,
        x: 250,
        y: 350,
        radius: 40,
        color: 'rgba(0,0,255,0.7)'
      });
    });
  });
  
  // Test other annotation types
  describe('Other annotation types', () => {
    test('should parse underline command', () => {
      const text = 'Pay attention to this phrase [UNDERLINE 2 150 300 200]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'underline',
        page: 2,
        x: 150,
        y: 300,
        width: 200
      });
    });
    
    test('should parse text annotation command', () => {
      const text = 'This needs a label [TEXT 1 200 250 "Important concept"]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'text',
        page: 1,
        x: 200,
        y: 250,
        text: 'Important concept'
      });
    });
    
    test('should parse arrow command', () => {
      const text = 'Flow direction is shown here [ARROW 1 100 200 300 250]';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: 'arrow',
        page: 1,
        x: 100,
        y: 200,
        width: 200, // 300 - 100
        height: 50  // 250 - 200
      });
    });
  });
  
  // Test multiple commands
  describe('Multiple annotation commands', () => {
    test('should parse multiple commands in one text', () => {
      const text = `Here's the definition:
      [HIGHLIGHT 1 100 200 300 50]
      
      And here's a related diagram:
      [CIRCLE 1 400 500 60]`;
      
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.annotations).toHaveLength(2);
      expect(result.annotations[0].type).toBe('highlight');
      expect(result.annotations[1].type).toBe('circle');
    });
  });
  
  // Test cleaned text
  describe('Text cleaning', () => {
    test('should return cleaned text with commands removed', () => {
      const text = 'Look at this section [HIGHLIGHT 1 100 200 300 50] for the definition.';
      const result = annotationEngine.parseAnnotationCommands(text);
      
      expect(result.cleanedText).toBe('Look at this section  for the definition.');
    });
  });
  
  // Test streaming chunks
  describe('Streaming chunk processing', () => {
    test('should process complete command in a single chunk', () => {
      const chunk = 'See this part [HIGHLIGHT 1 100 200 300 50]';
      const result = annotationEngine.processStreamChunk(chunk);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.hasCommands).toBe(true);
    });
    
    test('should accumulate partial commands across chunks', () => {
      // First chunk with partial command
      const chunk1 = 'See this part [HIGH';
      const result1 = annotationEngine.processStreamChunk(chunk1, 'test-stream');
      
      expect(result1.annotations).toHaveLength(0);
      expect(result1.hasCommands).toBe(false);
      
      // Second chunk completes the command
      const chunk2 = 'LIGHT 1 100 200 300 50]';
      const result2 = annotationEngine.processStreamChunk(chunk2, 'test-stream');
      
      expect(result2.annotations).toHaveLength(1);
      expect(result2.hasCommands).toBe(true);
      expect(result2.annotations[0].type).toBe('highlight');
    });
    
    test('should reset buffer for new streams', () => {
      // Add partial command to a stream
      const chunk1 = 'First stream [HIGH';
      annotationEngine.processStreamChunk(chunk1, 'stream-1');
      
      // New stream should start with empty buffer
      const chunk2 = 'New stream [CIRCLE 1 300 400 50]';
      const result = annotationEngine.processStreamChunk(chunk2, 'stream-2');
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0].type).toBe('circle');
    });
  });
  
  // Test navigation commands
  describe('Navigation commands', () => {
    test('should parse go to page command', () => {
      const text = 'Let\'s look at page 5 [GO TO PAGE 5]';
      const result = annotationEngine.parseNavigationCommands(text, 1);
      
      expect(result.hasNavigation).toBe(true);
      expect(result.targetPage).toBe(5);
      expect(result.command).toBe('[GO TO PAGE 5]');
    });
    
    test('should parse next page command', () => {
      const text = 'Check the next page [NEXT PAGE]';
      const result = annotationEngine.parseNavigationCommands(text, 3);
      
      expect(result.hasNavigation).toBe(true);
      expect(result.targetPage).toBe(4);
      expect(result.command).toBe('[NEXT PAGE]');
    });
    
    test('should parse previous page command', () => {
      const text = 'Let\'s go back [PREVIOUS PAGE]';
      const result = annotationEngine.parseNavigationCommands(text, 7);
      
      expect(result.hasNavigation).toBe(true);
      expect(result.targetPage).toBe(6);
      expect(result.command).toBe('[PREVIOUS PAGE]');
    });
    
    test('should handle abbreviated prev page command', () => {
      const text = 'Go back [PREV PAGE]';
      const result = annotationEngine.parseNavigationCommands(text, 2);
      
      expect(result.hasNavigation).toBe(true);
      expect(result.targetPage).toBe(1);
    });
  });
  
  // Test fallback generation
  describe('Fallback annotation', () => {
    test('should generate fallback annotation for a page', () => {
      const fallback = annotationEngine.generateFallbackAnnotation(3);
      
      expect(fallback).toMatchObject({
        type: 'highlight',
        page: 3,
        label: 'AI Highlight'
      });
    });
    
    test('should use text hint to improve fallback position', () => {
      const fallback = annotationEngine.generateFallbackAnnotation(2, 'title section');
      
      expect(fallback).toMatchObject({
        type: 'highlight',
        page: 2,
        y: 120 // Should be positioned near top for title hints
      });
    });
  });
});