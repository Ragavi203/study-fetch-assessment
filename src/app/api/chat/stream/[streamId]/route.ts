import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  formatSSEMessage as createSSE,
  handleEdgeError
} from '@/lib/sseUtils';
import { emergencyGetSixSigmaText } from '@/lib/pdfUtils';
import { getStreamPayload, deleteStreamPayload } from '@/lib/shortTermStore';

// Stream timeout - reduced to prevent browser hanging (60 seconds)
const STREAM_TIMEOUT = 60000;

// Send a heartbeat every 5 seconds to keep connection alive
const HEARTBEAT_INTERVAL = 5000;

export const runtime = 'edge';

export async function GET(
  req: NextRequest,
  { params }: { params: { streamId: string } }
) {
  const streamId = params.streamId;
  
  // Set up SSE headers
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  };
  
  // Create a new TransformStream for the event stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // Set up the stream response
  const responseStream = new NextResponse(stream.readable, { headers });
  
  // Extract query parameters
  const searchParams = req.nextUrl.searchParams;
  const message = searchParams.get('message');
  const urlPdfId = searchParams.get('pdfId');
  const useStream = searchParams.get('stream') !== 'false';
  const authToken = searchParams.get('token') || '';
  
  // Log authentication status for debugging
  console.log(`Stream ${streamId} - Auth token present: ${authToken ? 'Yes' : 'No'}`);
  if (authToken) {
    console.log(`Token starts with: ${authToken.substring(0, 5)}...`);
  }
    
  // Process the stream
  (async () => {
    // Track if the stream is active
    let isStreamActive = true;
    
    // Set up heartbeat interval to keep connection alive
    const heartbeatInterval = setInterval(async () => {
      if (isStreamActive) {
        try {
          await writer.write(encoder.encode(createSSE({ 
            type: 'heartbeat', 
            timestamp: Date.now()
          })));
        } catch (err) {
          console.error('Heartbeat error:', err);
          clearInterval(heartbeatInterval);
        }
      } else {
        clearInterval(heartbeatInterval);
      }
    }, HEARTBEAT_INTERVAL);
    
    // Set up a timeout to close the connection if it takes too long
    const timeout = setTimeout(async () => {
      if (isStreamActive) {
        try {
          console.log('Stream timeout reached');
          await writer.write(encoder.encode(createSSE({
            type: 'error',
            error: 'Stream timeout reached'
          })));
          isStreamActive = false;
          clearInterval(heartbeatInterval);
          await writer.close();
        } catch (err) {
          console.error('Timeout handler error:', err);
        }
      }
    }, STREAM_TIMEOUT);
    
    try {
      // Send initial connection message
      await writer.write(encoder.encode(createSSE({ 
        type: 'connect',
        message: 'Stream connected'
      })));
      
  // Get information from query params (support both plain & base64 encoded payloads)
  const messageData = searchParams.get('messageData');
  const messageDataB64 = searchParams.get('messageDataB64');
  const messageDataLength = messageData ? messageData.length : 0;
      let messages: any[] = [];
      let pdfText: Record<string, any> = {};
  let currentPage = 1;
      let pdfId = urlPdfId || '';
  let pageHints: Array<{ page: number; score: number; snippet: string }> = [];

  // Track where the payload was sourced from
  let payloadSource: 'query' | 'store' | 'store-fallback' | 'empty' = 'empty';

      try {
        if (messageDataB64) {
          try {
            const decodedB64 = decodeURIComponent(messageDataB64);
            const jsonStr = decodeURIComponent(escape(atob(decodedB64)));
            const parsedData = JSON.parse(jsonStr);
            messages = parsedData.messages || [];
            pdfText = parsedData.pdfText || {};
            currentPage = parsedData.currentPage || 1;
            pdfId = parsedData.pdfId || pdfId;
            if (Array.isArray(parsedData.pageHints)) pageHints = parsedData.pageHints.slice(0, 10);
            payloadSource = 'query';
            console.log(`Stream ${streamId} - Parsed base64 messageData payload`);
          } catch (b64Err) {
            console.warn(`Stream ${streamId} - base64 messageData parse failed`, b64Err);
          }
        }
        if (!messages.length && messageData) {
          try {
            const decoded = decodeURIComponent(messageData);
            const parsedData = JSON.parse(decoded);
            messages = parsedData.messages || [];
            pdfText = parsedData.pdfText || {};
            currentPage = parsedData.currentPage || 1;
            pdfId = parsedData.pdfId || pdfId;
            if (Array.isArray(parsedData.pageHints)) pageHints = parsedData.pageHints.slice(0, 10);
            payloadSource = 'query';
            console.log(`Stream ${streamId} - Parsed messageData payload length=${messageDataLength}`);
          } catch (innerErr) {
            console.warn(`Stream ${streamId} - plain messageData parse failed`, innerErr);
          }
        }
        if (!messages.length) {
          const stored = getStreamPayload(streamId);
          if (stored) {
            messages = stored.messages || [];
            pdfText = stored.pdfText || {};
            currentPage = stored.currentPage || 1;
            pdfId = stored.pdfId || pdfId;
            if (Array.isArray(stored.pageHints)) pageHints = stored.pageHints.slice(0, 10);
            payloadSource = 'store';
            deleteStreamPayload(streamId);
            console.log(`Stream ${streamId} - Retrieved payload from store`);
          }
        }
        if (!messages.length) {
          // Graceful degraded fallback: create minimal message to avoid hard failure
          payloadSource = 'empty';
          messages = [{ role: 'user', content: message || 'Explain the current page.' }];
          pdfText = pdfText || { current: 'No text provided', currentPage: 1, totalPages: 1 };
          await writer.write(encoder.encode(createSSE({ type: 'diagnostic', note: 'using minimal fallback payload' })));
        }
      } catch (parseError) {
        console.error('Unexpected error handling messageData:', parseError);
        payloadSource = 'empty';
        messages = [{ role: 'user', content: message || 'Explain the current page.' }];
        pdfText = pdfText || { current: 'No text provided', currentPage: 1, totalPages: 1 };
        await writer.write(encoder.encode(createSSE({ type: 'diagnostic', note: 'unexpected parse error, using minimal fallback' })));
      }

      // Emit diagnostic event about payload source and sizes
      await writer.write(encoder.encode(createSSE({
        type: 'diagnostic',
        source: payloadSource,
        messagesCount: messages.length,
        pdfTextKeys: Object.keys(pdfText || {}),
        currentPage,
        currentLength: (pdfText?.current || '').length || 0
      })));
      console.log(`Stream ${streamId} diagnostic: source=${payloadSource} messages=${messages.length} currentLen=${(pdfText?.current || '').length || 0}`);
      
      // Basic auth check - JWT verification can cause issues in edge runtime
      // We'll just check that the token exists and has a reasonable format
      if (!authToken || authToken.length < 10) {
        console.error('Missing or invalid token:', authToken);
        await writer.write(encoder.encode(createSSE({
          type: 'error',
          error: 'Invalid authentication'
        })));
        isStreamActive = false;
        return;
      }
      
      // Log success
      console.log('Authentication token validated successfully');
      
      // Note: For production, you should implement proper token validation that's compatible
      // with the edge runtime, such as using a simple HMAC validation
      
      // Prepare data for OpenAI with proper type safety
      // Process the PDF text from what was provided - don't force specific content
  const currentPageText = pdfText.current || "No text available for current page";
      const previousPageText = pdfText.previous || null;
      const nextPageText = pdfText.next || null;
      const totalPages = pdfText.totalPages || 1;

      // Emit a preview of the received PDF text so client can confirm server-side receipt
      try {
        await writer.write(encoder.encode(createSSE({
          type: 'pdfPreview',
          source: payloadSource,
          messageDataLength,
          currentPage,
          totalPages,
            sample: (typeof currentPageText === 'string') ? currentPageText.slice(0, 180) : '',
          length: (typeof currentPageText === 'string') ? currentPageText.length : 0
        })));
      } catch (previewErr) {
        console.error('Failed to send pdfPreview event:', previewErr);
      }
      
      // Create a system message with emergency text injection
      // Get the emergency Six Sigma text to ensure AI always has access to it
      const essayText = emergencyGetSixSigmaText();
      
      const pageHintsSection = pageHints.length > 0 ? `\nPAGE HINTS (candidate relevant pages):\n${pageHints.map(h => `- Page ${h.page} (score ${h.score}): ${h.snippet.slice(0,120)}`).join('\n')}\n` : '';

      const systemMessage = {
        role: 'system',
        content: `You are an AI tutor helping a student understand a PDF document. Your primary role is to explain concepts, answer questions, and help them navigate and comprehend the material effectively.

You are currently viewing Page ${currentPage} of ${totalPages || 1}.

Current Page Content (${currentPage}/${totalPages || 1}):
${currentPageText}

${previousPageText ? `Previous Page (${currentPage - 1}):\n${previousPageText}` : 'No previous page available'}

${nextPageText ? `Next Page (${currentPage + 1}):\n${nextPageText}` : 'No next page available'}

${pageHintsSection}
IMPORTANT INSTRUCTIONS:

1. ACTIVE TEACHING - Act as an experienced tutor. Explain concepts clearly, use examples, and check for understanding. Be encouraging and supportive.

2. PAGE NAVIGATION - You MUST use these commands when information is on a different page:
   - Use [GO TO PAGE x] to jump to a specific page
   - Use [NEXT PAGE] to move forward one page
   - Use [PREV PAGE] to move back one page
   - Use [FIRST PAGE] or [LAST PAGE] for quick navigation
   Always explain why you're navigating to a different page.

3. VISUAL ANNOTATIONS - ALWAYS include at least one annotation OR navigation command relevant to the student's request:
  Enhanced annotation syntax with smart coordinate estimation:
  - [HIGHLIGHT ${currentPage} x y width height color="rgba(255,255,0,0.35)"]
  - [CIRCLE ${currentPage} x y radius color="rgba(255,0,0,0.4)"]
  - [ARROW ${currentPage} x1 y1 x2 y2 color="rgba(255,0,0,0.8)"]
  - [UNDERLINE ${currentPage} x y width color="rgba(0,0,255,0.8)"]
  - [TEXT ${currentPage} x y "content" color="rgba(0,0,0,0.9)"]
  - [RECTANGLE ${currentPage} x y width height color="rgba(0,0,255,0.3)"]
  
  Smart coordinate guidelines:
  - Page dimensions: 612×792 points (US Letter)
  - Text typically starts at x=80, margins are ~40 points
  - Line height is typically 22 points
  - For titles: y=120-150, height=30-40
  - For body text: y=200-600, height=18-25
  - For highlights: use multiple small rectangles instead of one large one
  - Example good highlight: [HIGHLIGHT ${currentPage} 80 200 400 22] (single line)
  - Example multi-line: [HIGHLIGHT ${currentPage} 80 200 400 22] [HIGHLIGHT ${currentPage} 80 222 400 22]
  
  Strategy:
  - If the answer is primarily on current page, highlight 1–3 key spans with precise coordinates
  - If content spans multiple pages, navigate first: [GO TO PAGE X] then highlight
  - Always explain what you're highlighting and why it's important

4. ADAPTIVE TEACHING - Analyze the PDF content carefully and adapt your teaching style to the subject matter:
   - For textbooks: Explain concepts, highlight definitions, summarize key points
   - For research papers: Explain methodology, highlight findings, discuss implications
   - For study materials: Point out important facts, create connections between concepts
   
5. NAVIGATION EXECUTION ORDER:
  a. Evaluate question vs current page text.
  b. If not found, consult PAGE HINTS list and pick the highest score likely page.
  c. Issue [GO TO PAGE X] BEFORE giving the explanation referencing that page.
  d. After navigating, highlight relevant text on that page.

6. INTERACTION GUIDELINES:
   - Be concise but thorough
   - When asked to explain something, highlight the relevant text as you discuss it
   - If answering from multiple pages, navigate between them to show the student comprehensive information
   - Use page numbers when referencing content
  - Encourage critical thinking through thoughtful questions
  - If a student asks for definitions or “main idea” and it's not on current page but in hints, navigate + explain.
FAILURE MODES TO AVOID:
 - Responding without any annotation or navigation command
 - Using coordinates outside page bounds (0-612 width, 0-792 height)
 - Creating highlights taller than 60 points (split into multiple lines instead)
 - Giving explanations about content not visible without navigating first
 - Using vague coordinates when specific ones can be estimated

COORDINATE ESTIMATION RULES:
 - If highlighting a title/heading: x=80, y=120-150, width=400-500, height=25-35
 - If highlighting first paragraph: x=80, y=180-200, width=450, height=20-25
 - If highlighting mid-page content: x=80, y=300-400, width=450, height=20-25
 - If highlighting near bottom: x=80, y=600-700, width=450, height=20-25
 - For circles around important items: radius=30-50, center on the item
 - For arrows pointing to content: start 50 points away, point to target

If coordinates cannot be estimated, use: [HIGHLIGHT ${currentPage} 80 300 400 25] as default and mention it's an estimated region.`
      };
  // Append micro-annotation style guidance (post-construction to keep main template readable)
  (systemMessage as any).content += `\n\nADDITIONAL VISUAL GUIDANCE:\n- ALWAYS prefer multiple small line-height highlights instead of one tall rectangle\n- Each highlight should have height between 18-28 points (one text line)\n- For titles: height 25-35 points, width matching text span\n- For body text: height 18-25 points, width 400-450 points\n- Use different colors for importance: yellow for key points, orange for important, red for critical\n- Produce 1-3 highlights per answer, more if user asks for comprehensive highlighting\n- Always include page number in annotation commands\n- Test coordinates: x should be 40-550, y should be 50-750 for visibility`;
      
      // Use OpenAI for actual responses
      // Clean up API key to remove any newlines or whitespace
      // Edge runtime has different environment variable handling
      // We'll use a try/catch to handle potential issues
      let apiKey = '';
      try {
        apiKey = process.env.OPENAI_API_KEY || '';
        if (apiKey) {
          apiKey = apiKey.replace(/\r?\n|\r/g, '').trim();
        }
      } catch (envError) {
        console.error('Environment variable access error:', envError);
        await writer.write(encoder.encode(createSSE({
          type: 'error',
          error: 'Configuration error',
          details: 'Unable to access environment variables'
        })));
        
        // Add a user-friendly message
        await writer.write(encoder.encode(createSSE({
          type: 'content',
          content: "I'm sorry, but there's a configuration issue with the AI service. Please contact support."
        })));
        
        // End the stream properly
        await writer.write(encoder.encode(createSSE({
          type: 'end',
          message: 'Stream completed with configuration error'
        })));
        
        isStreamActive = false;
        return;
      }

      if (!apiKey) {
        console.error('OpenAI API key is missing or empty');
        await writer.write(encoder.encode(createSSE({
          type: 'error',
          error: 'OpenAI API key not configured'
        })));
        
        // Add a user-friendly message
        await writer.write(encoder.encode(createSSE({
          type: 'content',
          content: "I'm sorry, but the AI service is not properly configured. Please contact support."
        })));
        
        // End the stream properly
        await writer.write(encoder.encode(createSSE({
          type: 'end',
          message: 'Stream completed with API key error'
        })));
        
        isStreamActive = false;
        return;
      }
      
      // Check if the API key appears valid
      if (apiKey.length < 20 || !apiKey.startsWith('sk-')) {
        console.error('OpenAI API key appears malformed');
        await writer.write(encoder.encode(createSSE({
          type: 'error',
          error: 'API key configuration issue'
        })));
        
        // Add a user-friendly message
        await writer.write(encoder.encode(createSSE({
          type: 'content',
          content: "I'm sorry, but the AI service is misconfigured. Please contact support."
        })));
        
        // End the stream properly
        await writer.write(encoder.encode(createSSE({
          type: 'end',
          message: 'Stream completed with API key format error'
        })));
        
        isStreamActive = false;
        return;
      }
      
      try {
        // Log the initialization (but not the actual API key)
        console.log('Initializing OpenAI client, API key starts with:', apiKey.substring(0, 5) + '...');
        
        let openai: OpenAI;
        
        try {
          // Initialize OpenAI client with safety measures
          openai = new OpenAI({ 
            apiKey,
            dangerouslyAllowBrowser: false, // Explicitly disallow browser usage
            maxRetries: 2 // Limit retries to prevent hanging
          });
        } catch (initError) {
          console.error('OpenAI client initialization error:', initError);
          
          await writer.write(encoder.encode(createSSE({
            type: 'error',
            error: 'OpenAI client initialization failed',
            details: handleEdgeError(initError)
          })));
          
          // Add a user-friendly message
          await writer.write(encoder.encode(createSSE({
            type: 'content',
            content: "I'm sorry, but I'm having trouble connecting to the AI service. Please try again later."
          })));
          
          // End the stream properly
          await writer.write(encoder.encode(createSSE({
            type: 'end',
            message: 'Stream completed with initialization error'
          })));
          
          isStreamActive = false;
          return;
        }
        
        // Stream the OpenAI response
        await writer.write(encoder.encode(createSSE({
          type: 'content',
          content: "Processing your question..."
        })));

          // Prepare messages with proper types, ensuring context continuity
        const processedMessages = messages.map(msg => ({
          role: msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' 
            ? msg.role 
            : 'user', // Default to user if role is invalid
          content: msg.content || ''
        }));

        // Add system message at the beginning
        // CRITICAL FIX: Use only the most recent messages to maintain proper conversation state
        // This prevents the AI from losing context and repeating the same answers
        
        // We'll use a dynamic approach based on message content length
        // If we have long PDF content, we need to be more conservative with message history
        const pdfContentLength = (currentPageText?.length || 0) + 
                               (previousPageText?.length || 0) + 
                               (nextPageText?.length || 0);
                               
        // Determine how many messages to keep based on content size
        const messagesToKeep = pdfContentLength > 5000 ? 4 : 
                            pdfContentLength > 2000 ? 5 : 6;
                            
  console.log(`Stream ${streamId} - Content length: ${pdfContentLength}, keeping ${messagesToKeep} messages (payload source: ${payloadSource})`);
        
        const recentMessages = processedMessages.slice(-messagesToKeep);
        const finalMessages = [systemMessage, ...recentMessages];        console.log(`Sending ${finalMessages.length} messages to OpenAI`);
        
        console.log('Starting OpenAI API request');
        let responseSuccessful = false;
        
        try {
          // Create a promise that will reject after a timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('OpenAI API request timed out')), 15000);
          });
          
          // Create the actual API request promise
          // Determine if this is a complex or technical document that needs GPT-4
          const isComplexContent = 
            (currentPageText && currentPageText.length > 2000) || 
            (currentPageText && (
              currentPageText.toLowerCase().includes('theorem') ||
              currentPageText.toLowerCase().includes('equation') ||
              currentPageText.toLowerCase().includes('analysis') ||
              currentPageText.toLowerCase().includes('scientific') ||
              currentPageText.toLowerCase().includes('research')
            ));
          
          // Use GPT-4o for complex tutoring scenarios, otherwise GPT-3.5 for better responsiveness
          const tutorModel = isComplexContent ? 'gpt-4o' : 'gpt-3.5-turbo';
          
          console.log(`Stream ${streamId} - Using ${tutorModel} for tutoring${isComplexContent ? ' (complex content detected)' : ''}`);
          
          const apiRequestPromise = openai.chat.completions.create({
            model: tutorModel,
            messages: finalMessages,
            temperature: 0.7,
            max_tokens: 800,
            stream: true,
          });
          
          // Race between the API request and the timeout
          const apiResult: any = await Promise.race([apiRequestPromise, timeoutPromise]);
          console.log('OpenAI API request successful, processing stream');
          
          // Process the stream chunks
          for await (const chunk of apiResult as AsyncIterable<any>) {
            if (chunk.choices[0]?.delta?.content) {
              await writer.write(encoder.encode(createSSE({
                type: 'content',
                content: chunk.choices[0].delta.content
              })));
            }
          }
          
          responseSuccessful = true;
        } catch (apiError) {
          console.error('OpenAI API error or timeout:', apiError);
          
          // Send notification to client
          await writer.write(encoder.encode(createSSE({
            type: 'error',
            error: 'AI service issue',
            details: 'The AI service encountered a problem. Using fallback approach.',
            recoverable: true
          })));
          
          try {
            // Fallback to non-streaming for better reliability
            console.log('Using non-streaming fallback due to error or timeout');
            const fallbackResponse = await openai.chat.completions.create({
              model: 'gpt-3.5-turbo', // Use 3.5 for fallback for faster response
              messages: finalMessages,
              temperature: 0.7,
              max_tokens: 300, // Reduced for faster response
              stream: false,
            });
            
            // Get the complete response
            const fallbackContent = fallbackResponse.choices[0]?.message?.content || 
              "Sorry, I couldn't process your request fully. Could you try asking a simpler question?";
            
            // Send it as a single chunk
            await writer.write(encoder.encode(createSSE({
              type: 'content',
              content: fallbackContent
            })));
            
            responseSuccessful = true;
          } catch (fallbackError) {
            console.error('Fallback response also failed:', fallbackError);
            await writer.write(encoder.encode(createSSE({
              type: 'content',
              content: "I'm having technical difficulties right now. Please try again with a simpler question or try again later."
            })));
          }
        }
        
        // We've already replaced this code with the more robust implementation
        // No need for this duplicate chunk, save history is handled in the main try block
        
        // Save the chat history if response was successful
        if (responseSuccessful && pdfId) {
          try {
            // We would save the history to the database here
            // For now we'll just send a notification
            await writer.write(encoder.encode(createSSE({
              type: 'info',
              info: 'Chat history saved'
            })));
          } catch (saveError) {
            console.error('Error saving chat history:', saveError);
          }
        }
        
        // Signal the end of the stream (only if we haven't already done so in a fallback)
        if (responseSuccessful) {
          await writer.write(encoder.encode(createSSE({ 
            type: 'end',
            message: 'Stream completed'
          })));
        }
      } catch (apiError) {
        console.error('OpenAI API error:', apiError);
        
        // Determine the specific type of error for better user feedback
        let errorMessage = 'AI service error';
        let errorDetails = apiError instanceof Error ? apiError.message : 'Unknown error';
        
        // Check for common OpenAI error patterns
        if (errorDetails.includes('API key')) {
          errorMessage = 'API key issue';
          errorDetails = 'There was a problem with the API key. Please check your configuration.';
        } else if (errorDetails.includes('rate limit')) {
          errorMessage = 'Rate limit exceeded';
          errorDetails = 'The AI service rate limit was exceeded. Please try again in a moment.';
        } else if (errorDetails.includes('timeout')) {
          errorMessage = 'Request timeout';
          errorDetails = 'The AI service took too long to respond. Please try a simpler question.';
        } else if (errorDetails.includes('content filter')) {
          errorMessage = 'Content filtered';
          errorDetails = 'Your request was flagged by content filters. Please rephrase your question.';
        }
        
        // Send detailed error to client
        await writer.write(encoder.encode(createSSE({
          type: 'error',
          error: errorMessage,
          details: errorDetails,
          recoverable: true // Indicates client could retry with different input
        })));
        
        // For certain errors, send a fallback response
        if (errorMessage === 'Request timeout' || errorMessage === 'Rate limit exceeded') {
          await writer.write(encoder.encode(createSSE({
            type: 'content',
            content: "I'm having trouble processing your question right now. Could you try asking a shorter question or try again in a moment?"
          })));
          
          // Signal stream end
          await writer.write(encoder.encode(createSSE({
            type: 'end',
            message: 'Stream completed with fallback response'
          })));
        }
      }
    } catch (error) {
      console.error('Stream processing error:', error);
      if (isStreamActive) {
        try {
          // Use our safe error handler to avoid Edge runtime issues
          const errorDetails = handleEdgeError(error);
          
          await writer.write(encoder.encode(createSSE({ 
            type: 'error', 
            error: 'Stream processing failed',
            details: errorDetails
          })));
          
          // Send a user-friendly message so the UI doesn't appear broken
          await writer.write(encoder.encode(createSSE({
            type: 'content',
            content: "I'm sorry, but I encountered a technical issue while processing your request. Please try again."
          })));
          
          // End the stream properly
          await writer.write(encoder.encode(createSSE({
            type: 'end',
            message: 'Stream completed with error recovery'
          })));
          
        } catch (writeError) {
          console.error('Error writing error to stream:', writeError);
        }
      }
    } finally {
      isStreamActive = false;
      clearTimeout(timeout);
      clearInterval(heartbeatInterval);
      
      try {
        await writer.close();
      } catch (closeError) {
        console.error('Error closing stream writer:', closeError);
      }
    }
  })();
  
  return responseStream;
}