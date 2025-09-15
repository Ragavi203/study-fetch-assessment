"use client";
import React, { useState, useEffect } from 'react';
import { Annotation } from '@/types/types';
import { deserializeChatMessages, extractAnnotationsFromMessages } from '@/lib/chatUtils';

interface ChatHistoryManagerProps {
  pdfId?: string;
  token: string | null;
  onLoadHistory: (messages: any[]) => void;
  onLoadAnnotations: (annotations: Annotation[]) => void;
  onStatusChange: (status: 'loading' | 'success' | 'error' | 'idle', message?: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  annotations?: Annotation[];
}

export default function ChatHistoryManager({
  pdfId,
  token,
  onLoadHistory,
  onLoadAnnotations,
  onStatusChange
}: ChatHistoryManagerProps): JSX.Element {
  // Track loading state
  const [loading, setLoading] = useState<boolean>(false);
  
  // Function to load chat history
  const loadChatHistory = async () => {
    if (!pdfId || !token) {
      console.warn('ChatHistoryManager: Cannot load chat history without pdfId or token');
      onStatusChange('idle', 'Missing required data');
      return;
    }
    
    try {
      setLoading(true);
      onStatusChange('loading');
      console.log(`ChatHistoryManager: Loading chat history for PDF ${pdfId}`);
      
      // Create a timeout to detect long requests
      const timeoutId = setTimeout(() => {
        console.warn('ChatHistoryManager: Request is taking longer than expected');
      }, 5000); // 5 seconds
      
      const response = await fetch(`/api/chat/history/${pdfId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // Clear the timeout since we got a response
      clearTimeout(timeoutId);
      
      // Handle non-OK responses
      if (!response.ok) {
        // Log more detailed error info
        const errorText = await response.text();
        console.error(`ChatHistoryManager: Failed to load chat history (${response.status}):`, errorText);
        throw new Error(`Failed to load chat history: ${response.status} ${response.statusText}`);
      }
      
      // Parse the JSON response
      let data;
      try {
        data = await response.json();
        console.log('ChatHistoryManager: Received data structure:', 
          Object.keys(data), 
          data.messages ? `Messages: ${Array.isArray(data.messages) ? data.messages.length : 'non-array'}` : 'No messages'
        );
      } catch (parseError) {
        console.error('ChatHistoryManager: Error parsing JSON:', parseError);
        throw new Error('Failed to parse chat history data');
      }
      
      if (data && data.messages) {
        // Process messages with our utility function
        const processedMessages = deserializeChatMessages(data);
        console.log(`ChatHistoryManager: Processed ${processedMessages.length} messages`);
        
        // Extract all annotations
        const allAnnotations = extractAnnotationsFromMessages(processedMessages);
        console.log(`ChatHistoryManager: Found ${allAnnotations.length} annotations`);
        
        // Update state via callbacks
        if (processedMessages.length > 0) {
          onLoadHistory(processedMessages);
          console.log('ChatHistoryManager: History loaded successfully');
        }
        
        if (allAnnotations.length > 0) {
          onLoadAnnotations(allAnnotations);
          console.log('ChatHistoryManager: Annotations applied');
        }
        
        onStatusChange('success', `Loaded ${processedMessages.length} messages with ${allAnnotations.length} annotations`);
      } else {
        console.log('ChatHistoryManager: No chat history found or empty history');
        onLoadHistory([]);
        onStatusChange('success', 'No chat history found');
      }
    } catch (error) {
      console.error('ChatHistoryManager: Error loading chat history:', error);
      onStatusChange('error', error instanceof Error ? error.message : 'Unknown error loading chat history');
    } finally {
      setLoading(false);
    }
  };
  
  // Load chat history on component mount with retry logic
  useEffect(() => {
    // Skip if we don't have required parameters
    if (!pdfId || !token) {
      console.log('ChatHistoryManager: Missing pdfId or token, skipping history load');
      onStatusChange('idle', 'No PDF or user identified');
      return;
    }
    
    console.log(`ChatHistoryManager: Loading history for PDF ${pdfId}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    
    const loadHistoryWithRetry = async () => {
      try {
        console.log(`ChatHistoryManager: Loading chat history, attempt ${retryCount + 1}`);
        await loadChatHistory();
      } catch (error) {
        console.error(`Error loading chat history (attempt ${retryCount + 1}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          retryCount++;
          // Exponential backoff for retries: 1s, 2s, 4s
          const delay = Math.pow(2, retryCount - 1) * 1000;
          console.log(`ChatHistoryManager: Retrying in ${delay}ms...`);
          
          setTimeout(loadHistoryWithRetry, delay);
        } else {
          onStatusChange('error', 'Failed to load chat history after multiple attempts. Please try again later.');
        }
      }
    };
    
    // Start load history process
    loadHistoryWithRetry();
    
    // For debugging
    return () => {
      console.log('ChatHistoryManager: Component unmounted or dependencies changed');
    };
  }, [pdfId, token]);
  
  // Function to clear chat history
  const clearHistory = async () => {
    if (!pdfId || !token) return;
    
    if (!confirm('Are you sure you want to clear your chat history? This cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      onStatusChange('loading');
      
      const response = await fetch(`/api/chat/history/${pdfId}/clear`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to clear chat history: ${response.status}`);
      }
      
      // Clear messages and annotations
      onLoadHistory([]);
      onLoadAnnotations([]);
      
      onStatusChange('success', 'Chat history cleared successfully');
    } catch (error) {
      console.error('Error clearing chat history:', error);
      onStatusChange('error', error instanceof Error ? error.message : 'Unknown error clearing chat history');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to retry loading history
  const retryLoadHistory = () => {
    loadChatHistory();
  };
  
  return (
    <div className="chat-history-controls">
      <button 
        onClick={retryLoadHistory}
        disabled={loading}
        className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-2 rounded mr-2"
        title="Reload chat history"
      >
        {loading ? 'Loading...' : 'Reload History'}
      </button>
      
      <button 
        onClick={clearHistory}
        disabled={loading}
        className="text-sm bg-red-600 hover:bg-red-700 text-white py-1 px-2 rounded"
        title="Delete all chat history for this PDF"
      >
        {loading ? 'Processing...' : 'Clear History'}
      </button>
    </div>
  );
}