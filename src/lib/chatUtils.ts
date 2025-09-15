import { Annotation } from '@/types/types';

interface Message {
  role: string;
  content: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  annotations?: Annotation[];
}

interface ChatMessageStorage {
  messages: Message[];
  annotations?: Annotation[];
}

interface NavigationCommand {
  targetPage: number;
  hasNavigation: boolean;
}

export interface NavigationCue {
  page: number;
  delayMs: number;
}

/**
 * Serializes chat messages for storage
 */
export function serializeChatMessages(messages: ChatMessage[]): ChatMessageStorage {
  const storageObject: ChatMessageStorage = {
    messages: messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    annotations: []
  };
  
  // Collect all annotations
  messages.forEach(msg => {
    if (msg.annotations && msg.annotations.length > 0) {
      if (!storageObject.annotations) {
        storageObject.annotations = [];
      }
      storageObject.annotations.push(...msg.annotations);
    }
  });
  
  return storageObject;
}

/**
 * Deserializes chat messages from storage
 */
export function deserializeChatMessages(data: any): ChatMessage[] {
  if (!data || !data.messages) {
    console.warn('Invalid data format for deserializing chat messages:', data);
    return [];
  }

  // First check if messages is already an array
  const messagesArray = Array.isArray(data.messages) ? 
    data.messages : 
    (typeof data.messages === 'string' ? JSON.parse(data.messages) : []);
  
  if (!Array.isArray(messagesArray)) {
    console.warn('Could not parse messages into an array:', data.messages);
    return [];
  }
  
  try {
    const messages: ChatMessage[] = messagesArray.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
      annotations: msg.annotations || undefined
    }));
    
    // If we have global annotations not attached to specific messages
    if (data.annotations && Array.isArray(data.annotations) && data.annotations.length > 0) {
      // Find all assistant messages in reverse order (most recent first)
      const assistantIndices = messages
        .map((msg, index) => ({ role: msg.role, index }))
        .filter(item => item.role === 'assistant')
        .map(item => item.index)
        .reverse();
      
      if (assistantIndices.length > 0) {
        // Distribute annotations to all assistant messages
        // Prefer the most recent assistant message
        const primaryIndex = assistantIndices[0];
        
        // Create or extend annotations array
        if (!messages[primaryIndex].annotations) {
          messages[primaryIndex].annotations = [];
        }
        
        // Add annotations
        messages[primaryIndex].annotations = [
          ...(messages[primaryIndex].annotations || []),
          ...data.annotations
        ];
      }
    }
    
    return messages;
  } catch (error) {
    console.error('Error deserializing chat messages:', error);
    return [];
  }
}

/**
 * Extracts all annotations from chat messages
 */
export function extractAnnotationsFromMessages(messages: ChatMessage[]): Annotation[] {
  return messages.reduce((annotations: Annotation[], msg) => {
    if (msg.annotations && Array.isArray(msg.annotations)) {
      return [...annotations, ...msg.annotations];
    }
    return annotations;
  }, []);
}

/**
 * Extracts navigation commands from text
 * @param text The text to parse for navigation commands
 * @param currentPage The current page number
 * @param totalPages The total number of pages
 * @returns Object with navigation information
 */
export function extractNavigationCommands(text: string, currentPage: number, totalPages: number): NavigationCommand {
  // Define regex patterns for navigation commands
  const goToPageRegex = /\[GO TO PAGE (\d+)\]/;
  const nextPageRegex = /\[NEXT PAGE\]/;
  const prevPageRegex = /\[PREV PAGE\]/;
  const firstPageRegex = /\[FIRST PAGE\]/;
  const lastPageRegex = /\[LAST PAGE\]/;
  
  // Extract commands
  const goToPageMatch = text.match(goToPageRegex);
  const hasNextPage = nextPageRegex.test(text);
  const hasPrevPage = prevPageRegex.test(text);
  const hasFirstPage = firstPageRegex.test(text);
  const hasLastPage = lastPageRegex.test(text);
  
  // Calculate target page
  let targetPage = currentPage;
  
  if (goToPageMatch) {
    const requestedPage = parseInt(goToPageMatch[1], 10);
    if (requestedPage >= 1 && requestedPage <= totalPages) {
      targetPage = requestedPage;
    }
  } else if (hasNextPage && currentPage < totalPages) {
    targetPage = currentPage + 1;
  } else if (hasPrevPage && currentPage > 1) {
    targetPage = currentPage - 1;
  } else if (hasFirstPage) {
    targetPage = 1;
  } else if (hasLastPage) {
    targetPage = totalPages;
  }
  
  return {
    targetPage,
    hasNavigation: targetPage !== currentPage
  };
}

/**
 * Parses response content for auto-navigation cues
 * @param content The AI response content
 * @returns Array of navigation instructions
 */
export function parseAutoNavigationCues(content: string): NavigationCue[] {
  const navigationCues: NavigationCue[] = [];
  
  // Look for specially formatted auto-navigation cues
  // Format: [AUTO_NAV:page:delay_ms]
  const autoNavRegex = /\[AUTO_NAV:(\d+):(\d+)\]/g;
  
  let match;
  while ((match = autoNavRegex.exec(content)) !== null) {
    navigationCues.push({
      page: parseInt(match[1], 10),
      delayMs: parseInt(match[2], 10)
    });
  }
  
  return navigationCues;
}

/**
 * Clean AI response text by removing all command markers
 * @param text The text to clean
 * @returns Cleaned text
 */
export function cleanResponseText(text: string): string {
  return text
    // Remove navigation commands
    .replace(/\[GO TO PAGE \d+\]/g, '')
    .replace(/\[NEXT PAGE\]/g, '')
    .replace(/\[PREV PAGE\]/g, '')
    .replace(/\[FIRST PAGE\]/g, '')
    .replace(/\[LAST PAGE\]/g, '')
    // Remove auto-navigation cues
    .replace(/\[AUTO_NAV:\d+:\d+\]/g, '')
    // Remove annotation commands
    .replace(/\[HIGHLIGHT \d+ \d+ \d+ \d+ \d+(?:\s+color="[^"]+")?]/g, '')
    .replace(/\[CIRCLE \d+ \d+ \d+ \d+(?:\s+color="[^"]+")?]/g, '')
    .replace(/\[HIGHLIGHT TEXT "[^"]+" ON PAGE \d+]/g, '')
    // Clean up extra whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Enhance text for better speech synthesis
 * @param text The text to enhance
 * @returns Enhanced text for speech
 */
export function enhanceTextForSpeech(text: string): string {
  return text
    // Replace URLs with simplified text
    .replace(/https?:\/\/[^\s]+/g, 'URL link')
    // Remove code blocks
    .replace(/```[^`]+```/g, 'code block')
    // Replace markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Add natural pauses
    .replace(/\./g, '. ')
    .replace(/\!/g, '! ')
    .replace(/\?/g, '? ')
    .replace(/;/g, '; ')
    .replace(/:/g, ': ')
    // Add emphasis to important terms
    .replace(/(important note|key point|critical|essential|remember)/gi, '... $1 ... ')
    // Clean up extra whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Split text into natural chunks for speech synthesis
 * @param text The text to split
 * @param maxChunkLength Maximum chunk length
 * @returns Array of text chunks
 */
export function splitIntoSpeechChunks(text: string, maxChunkLength: number = 200): string[] {
  // Split at natural breaking points
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  sentences.forEach(sentence => {
    // If adding this sentence would make the chunk too long, start a new chunk
    if ((currentChunk + sentence).length > maxChunkLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  });
  
  // Add the last chunk if it's not empty
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}