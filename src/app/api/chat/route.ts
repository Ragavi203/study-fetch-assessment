import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { Annotation } from '@/types/types';
import { serializeChatMessages } from '@/lib/chatUtils';
import { ensurePDFText } from '@/lib/emergencyTextInjector';

export async function POST(request: Request) {
  try {
    // Verify authentication
    const userId = await verifyAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let { messages, pdfText, pdfId, currentPage: requestedPage } = await request.json();
    
    // Ensure the PDF text structure is valid, but don't force specific content
    pdfText = ensurePDFText(pdfText);
    
    // Respect the actual content of whatever PDF is being processed
    console.log(`Processing PDF with ${pdfText.current ? pdfText.current.length : 0} chars of text`);

    const { 
      current: currentPageText, 
      previous: previousPageText, 
      next: nextPageText, 
      currentPage, 
      totalPages,
      positions = {},
      pageWidth = 0,
      pageHeight = 0,
      documentType = 'general'
    } = pdfText;

    // Limit text size to prevent token overflow
    const truncateText = (text: string, maxLength: number) => {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    // Use smaller excerpt sizes to reduce token count
    const currentExcerpt = truncateText(currentPageText, 600);
    const prevExcerpt = previousPageText ? truncateText(previousPageText, 150) : '';
    const nextExcerpt = nextPageText ? truncateText(nextPageText, 150) : '';

    // Only keep recent message history to reduce token count
    const recentMessages = messages.slice(-5); // Only keep the last 5 messages

    // Try to infer document type based on content, but don't force any specific interpretation
    // This allows us to provide better handling for different document types
    const documentKeywords = {
      essay: ['reflection', 'essay', 'personal learning', 'journal'],
      textbook: ['chapter', 'figure', 'table', 'section', 'references'],
      scientific: ['abstract', 'methodology', 'conclusion', 'hypothesis', 'experiment'],
      legal: ['contract', 'agreement', 'clause', 'terms', 'party']
    };
    
    // Detect document type by looking for keywords
    let detectedType = 'unknown';
    if (currentPageText && typeof currentPageText === 'string') {
      const lowerText = currentPageText.toLowerCase();
      for (const [type, keywords] of Object.entries(documentKeywords)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
          detectedType = type;
          break;
        }
      }
    }
    
    // For longer documents, use the full text or a larger excerpt
    const processedText = (currentPageText && currentPageText.length > 0) ? 
      (currentPageText.length > 1000 ? currentExcerpt : currentPageText) : 
      "No text available for this page";
                         
    // Create a system message with adaptive handling based on detected document type
    const systemMessage = {
      role: 'system',
      content: `You are an AI tutor helping a student understand a PDF document. Your primary role is to explain concepts, answer questions, and help them navigate and comprehend the material effectively.

You are currently viewing Page ${currentPage} of ${totalPages}.

${detectedType !== 'unknown' ? `DOCUMENT TYPE: ${detectedType.toUpperCase()}\n\n` : ''}
Current Page Content (${currentPage}/${totalPages}):
${processedText}

${previousPageText ? `Previous Page (${currentPage - 1}):\n${prevExcerpt}` : ''}

${nextPageText ? `Next Page (${currentPage + 1}):\n${nextExcerpt}` : 'Note: You are on the last page.'}

IMPORTANT INSTRUCTIONS:

1. ACTIVE TEACHING - Act as an experienced tutor. Explain concepts clearly, use examples, and check for understanding. Be encouraging and supportive.

2. PAGE NAVIGATION - You MUST use these commands when information is on a different page:
   - Use [GO TO PAGE x] to jump to a specific page
   - Use [NEXT PAGE] to move forward one page
   - Use [PREV PAGE] to move back one page
   - Use [FIRST PAGE] or [LAST PAGE] for quick navigation
   Always explain why you're navigating to a different page.

3. VISUAL ANNOTATIONS - Your most important feature is highlighting content for the student:
   - Highlight text: [HIGHLIGHT ${currentPage} x y width height] (use coordinates)
   - Circle important items: [CIRCLE ${currentPage} x y radius] (use coordinates)
   - Use colors for emphasis: [HIGHLIGHT ${currentPage} x y width height color="rgba(255,0,0,0.5)"]
   ALWAYS include at least one annotation in every response to visually guide the student.
   Explain what you're highlighting and why it's important.

4. ADAPTIVE TEACHING - Adapt your teaching style to the subject matter:
   - For textbooks: Explain concepts, highlight definitions, summarize key points
   - For research papers: Explain methodology, highlight findings, discuss implications
   - For study materials: Point out important facts, create connections between concepts
   
5. INTERACTION GUIDELINES:
   - Be concise but thorough
   - When asked to explain something, highlight the relevant text as you discuss it
   - If answering from multiple pages, navigate between them to show comprehensive information
   - Use page numbers when referencing content
   - Encourage critical thinking through thoughtful questions`
    };

    try {
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY
      });
      
      // Choose the best model based on content complexity and teaching requirements
      // For a tutor experience, we need strong reasoning and instruction capabilities
      const isComplex = currentPageText && currentPageText.length > 2000;
      const detectedComplexSubject = detectedType === 'scientific' || 
                                 processedText.toLowerCase().includes('theorem') ||
                                 processedText.toLowerCase().includes('equation') ||
                                 processedText.toLowerCase().includes('analysis');
                                 
      // Prefer GPT-4o for tutoring complex subjects or longer content
      const model = isComplex || detectedComplexSubject ? 'gpt-4o' : 'gpt-3.5-turbo';
      
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          systemMessage,
          ...recentMessages.map((m: {role: string, content: string}) => ({
            role: m.role,
            content: m.content,
          }))
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      const reply = response.choices[0].message?.content;

      // Parse navigation commands from the reply
      let pageNumber = currentPage;
      const goToPageRegex = /\[GO TO PAGE (\d+)\]/;
      const nextPageRegex = /\[NEXT PAGE\]/;
      const prevPageRegex = /\[PREV PAGE\]/;
      const firstPageRegex = /\[FIRST PAGE\]/;
      const lastPageRegex = /\[LAST PAGE\]/;

      const goToPageMatch = reply?.match(goToPageRegex);
      const hasNextPage = nextPageRegex.test(reply || '');
      const hasPrevPage = prevPageRegex.test(reply || '');
      const hasFirstPage = firstPageRegex.test(reply || '');
      const hasLastPage = lastPageRegex.test(reply || '');

      if (goToPageMatch) {
        const requestedPage = parseInt(goToPageMatch[1], 10);
        if (requestedPage >= 1 && requestedPage <= totalPages) {
          pageNumber = requestedPage;
        }
      } else if (hasNextPage && currentPage < totalPages) {
        pageNumber = currentPage + 1;
      } else if (hasPrevPage && currentPage > 1) {
        pageNumber = currentPage - 1;
      } else if (hasFirstPage) {
        pageNumber = 1;
      } else if (hasLastPage) {
        pageNumber = totalPages;
      }

      // Parse annotations from the reply
      const annotations: Annotation[] = [];
      
      // Standard annotation commands with explicit coordinates
      const highlightRegex = /\[HIGHLIGHT (\d+) (\d+) (\d+) (\d+) (\d+)(?:\s+color="([^"]+)")?\]/g;
      const circleRegex = /\[CIRCLE (\d+) (\d+) (\d+) (\d+)(?:\s+color="([^"]+)")?\]/g;
      const textHighlightRegex = /\[HIGHLIGHT TEXT "([^"]+)" ON PAGE (\d+)\]/g;
      
      // Process highlights
      let match;
      while ((match = highlightRegex.exec(reply || '')) !== null) {
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

      // Process circles
      while ((match = circleRegex.exec(reply || '')) !== null) {
        annotations.push({
          type: 'circle',
          page: parseInt(match[1]),
          x: parseInt(match[2]),
          y: parseInt(match[3]),
          radius: parseInt(match[4]),
          color: match[5] || 'rgba(255, 0, 0, 0.7)'
        });
      }
      
      // Process text-based highlights
      while ((match = textHighlightRegex.exec(reply || '')) !== null) {
        const textToHighlight = match[1].trim();
        const pageNum = parseInt(match[2]);
        
        // Skip if text is too short (likely to cause false positives)
        if (textToHighlight.length < 3) continue;
        
        // Get position data for the specified page
        let pagePositions = [];
        if (pageNum === currentPage) {
          pagePositions = positions.current || [];
        } else if (pageNum === currentPage - 1) {
          pagePositions = positions.previous || [];
        } else if (pageNum === currentPage + 1) {
          pagePositions = positions.next || [];
        }
        
        // Skip if we don't have position data for this page
        if (pagePositions.length === 0) continue;
        
        // Find text positions that contain the text
        const matchingPositions = pagePositions.filter((pos: any) => 
          pos.text.includes(textToHighlight)
        );
        
        // If matches found, create highlight annotations
        matchingPositions.forEach((pos: any) => {
          annotations.push({
            type: 'highlight',
            page: pageNum,
            x: pos.x,
            y: pos.y - (pos.height || 12), // Adjust y position to align with text
            width: pos.width || textToHighlight.length * 7, // Estimate width based on text length
            height: pos.height || 15, // Default height if not available
            color: 'rgba(255, 255, 0, 0.3)',
            text: textToHighlight
          });
        });
      }
      
      // Clean reply text by removing annotation commands for cleaner display
      let cleanReply = reply || '';
      cleanReply = cleanReply
        .replace(highlightRegex, '')
        .replace(circleRegex, '')
        .replace(textHighlightRegex, '')
        .replace(/\[GO TO PAGE \d+\]/g, '')
        .replace(/\[NEXT PAGE\]/g, '')
        .replace(/\[PREV PAGE\]/g, '')
        .replace(/\[FIRST PAGE\]/g, '')
        .replace(/\[LAST PAGE\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Store the chat message and annotations in the database
      if (pdfId) {
        // Use our serialization utility for consistent storage format
        const chatMessages = [
          ...messages, 
          { 
            role: 'assistant', 
            content: reply,
            annotations: annotations 
          }
        ];
        
        const serializedData = serializeChatMessages(chatMessages);
        
        await prisma.chat.create({
          data: {
            pdfId,
            userId,
            messages: serializedData as any,
          },
        });
      }

      return NextResponse.json({ 
        reply: cleanReply,
        annotations,
        pageNumber: pageNumber !== currentPage ? pageNumber : undefined 
      });
    } catch (apiError: any) {
      // Handle token limit errors
      if (apiError.message && apiError.message.includes('maximum context length')) {
        console.warn('Token limit exceeded, retrying with reduced content');
        
        try {
          // Try again with minimal content
          const openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY
          });
          
          // Use only the last user message
          const latestUserMessage = messages
            .filter((m: {role: string, content: string}) => m.role === 'user')
            .pop();
            
          if (!latestUserMessage) {
            throw new Error('No user message found');
          }
          
          const fallbackResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: "You're a PDF study assistant. Be concise."
              },
              latestUserMessage
            ],
            temperature: 0.7,
            max_tokens: 300,
          });
          
          const fallbackReply = fallbackResponse.choices[0].message?.content;
          
          // Store the simplified chat message in the database
          if (pdfId) {
            // Use our serialization utility for fallback mode
            const chatMessages = [
              ...messages,
              { role: 'assistant', content: fallbackReply }
            ];
            
            const serializedData = serializeChatMessages(chatMessages);
            
            await prisma.chat.create({
              data: {
                pdfId,
                userId,
                messages: serializedData as any,
              },
            });
          }
          
          return NextResponse.json({ 
            reply: fallbackReply,
            annotations: [],
            note: 'Response generated with limited context due to token limits'
          });
        } catch (fallbackError) {
          console.error('Fallback error:', fallbackError);
          throw fallbackError;
        }
      }
      
      throw apiError;
    }
  } catch (error: any) {
    console.error('Chat error:', error);
    const errorMessage = error.message || 'Failed to process chat request';
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}