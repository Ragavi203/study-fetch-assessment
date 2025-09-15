/**
 * AI Tutor System Prompt Builder
 * Creates optimized prompts for PDF tutoring with annotation capabilities
 */

import { Annotation } from '@/types/types';

interface PDFContext {
  pdfTitle: string;
  currentPage: number;
  totalPages: number;
  currentPageText?: string;
  previousPageText?: string;
  nextPageText?: string;
  visibleAnnotations?: Annotation[];
}

interface PromptOptions {
  enforceBracketedCommands?: boolean;
  includeExamples?: boolean;
  detailedInstructions?: boolean;
  maxResponseTokens?: number;
}

/**
 * Build a system prompt for the AI PDF Tutor
 */
export function buildTutorPrompt(context: PDFContext, options: PromptOptions = {}) {
  // Set defaults
  const opts = {
    enforceBracketedCommands: true,
    includeExamples: true,
    detailedInstructions: true,
    maxResponseTokens: 1000,
    ...options
  };

  // Core role definition
  let systemPrompt = `You are an AI PDF Tutor helping a student understand "${context.pdfTitle}". 
You're viewing page ${context.currentPage} of ${context.totalPages}.

Your goal is to:
1. Answer questions about the document clearly and helpfully
2. Explain concepts from the PDF in an educational manner
3. Highlight, circle, or annotate relevant parts of the PDF to support your explanations`;

  // Add annotation command instructions if enabled
  if (opts.enforceBracketedCommands) {
    systemPrompt += `\n\n## Annotation Commands
You MUST use annotation commands to highlight or point to relevant parts of the PDF. 
These commands will appear at the end of your response on new lines.

Available commands:
- [HIGHLIGHT page x y width height color="rgba(255,255,0,0.3)"] - Highlight rectangular areas
- [CIRCLE page x y radius color="rgba(255,0,0,0.7)"] - Circle important elements
- [UNDERLINE page x y width color="rgba(0,0,255,0.8)"] - Underline text
- [TEXT page x y "Your label here" color="rgba(0,0,0,0.9)"] - Add text labels
- [ARROW page x1 y1 x2 y2 color="rgba(255,0,0,0.8)"] - Draw attention with arrows
- [RECTANGLE page x y width height color="rgba(0,0,255,0.3)"] - Draw rectangles around content

Navigation commands:
- [GO TO PAGE n] - Navigate to a specific page
- [NEXT PAGE] - Go to the next page
- [PREVIOUS PAGE] - Go to the previous page`;
  }

  // Add detailed guidelines if requested
  if (opts.detailedInstructions) {
    systemPrompt += `\n\n## Guidelines for Annotations
- Coordinates use the PDF coordinate system: (0,0) is top-left
- Be precise with coordinates to ensure annotations align with text
- Use multiple annotations to highlight different parts related to your explanation
- For highlighting text, prefer width <= 520px and height <= 22px per line
- Use different colors for different levels of importance
- If you're uncertain about exact coordinates, make your best estimate

## Response Structure
1. First provide your explanation in clear, educational language
2. Place all annotation commands on separate lines AFTER your explanation
3. When you reference specific parts of the document, include annotation commands to highlight them
4. Each annotation should have a clear purpose related to your explanation`;
  }

  // Add examples if requested
  if (opts.includeExamples) {
    systemPrompt += `\n\n## Examples
Example 1: Highlighting a definition
"The theory of relativity is explained on this page. Let me highlight the key definition for you."
[HIGHLIGHT ${context.currentPage} 100 200 400 22 color="rgba(255,255,0,0.3)"]

Example 2: Pointing out a diagram
"This diagram illustrates the water cycle. The evaporation process is shown here."
[CIRCLE ${context.currentPage} 300 400 50 color="rgba(255,0,0,0.7)"]
[TEXT ${context.currentPage} 300 370 "Evaporation process" color="rgba(0,0,0,0.9)"]

Example 3: Navigating to relevant content
"To answer this question, we need to look at the next page where the data is presented."
[NEXT PAGE]
`;
  }

  // Add context awareness information
  systemPrompt += `\n\n## Current Context
You are viewing page ${context.currentPage} of ${context.totalPages}.`;

  // Add information about existing annotations if available
  if (context.visibleAnnotations && context.visibleAnnotations.length > 0) {
    systemPrompt += `\n\nExisting annotations on this page:`;
    context.visibleAnnotations.slice(0, 5).forEach(anno => {
      systemPrompt += `\n- ${anno.type} at (${anno.x}, ${anno.y})`;
    });
    if (context.visibleAnnotations.length > 5) {
      systemPrompt += `\n- ... and ${context.visibleAnnotations.length - 5} more`;
    }
  }

  // Add response length guidance
  systemPrompt += `\n\n## Response Length
Keep your response concise and focused, ideally under ${opts.maxResponseTokens} tokens.`;

  return systemPrompt;
}

/**
 * Post-process AI response to extract and separate annotation commands
 */
export function extractAnnotationCommands(aiResponse: string): {
  cleanedText: string;
  commands: string[];
} {
  // Regular expression to match all annotation and navigation commands
  const commandRegex = /\[(HIGHLIGHT|CIRCLE|UNDERLINE|TEXT|ARROW|RECTANGLE|GO TO PAGE|NEXT PAGE|PREVIOUS PAGE)[^\]]*\]/g;
  
  // Extract all commands
  const commands = aiResponse.match(commandRegex) || [];
  
  // Remove commands from the text
  const cleanedText = aiResponse.replace(commandRegex, '').trim();
  
  return {
    cleanedText,
    commands
  };
}

/**
 * Build a sample prompt for testing the AI's annotation capabilities
 */
export function buildTestPrompt(): string {
  const testContext: PDFContext = {
    pdfTitle: "Introduction to Machine Learning",
    currentPage: 1,
    totalPages: 10,
    currentPageText: "Chapter 1: What is Machine Learning?\n\nMachine learning is a branch of artificial intelligence that focuses on the use of data and algorithms to imitate the way humans learn, gradually improving its accuracy.\n\nKey concepts in machine learning include:\n\n1. Supervised Learning: Training with labeled data\n2. Unsupervised Learning: Finding patterns in unlabeled data\n3. Reinforcement Learning: Learning through trial and error",
  };
  
  return buildTutorPrompt(testContext, {
    enforceBracketedCommands: true,
    includeExamples: true,
    detailedInstructions: true
  });
}