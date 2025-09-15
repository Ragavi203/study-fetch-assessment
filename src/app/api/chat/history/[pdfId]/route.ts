import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { deserializeChatMessages } from '@/lib/chatUtils';
import { Annotation } from '@/types/types';

export async function GET(request: Request, { params }: { params: { pdfId: string } }) {
  try {
    const userId = await verifyAuth(request);
    if (!userId) {
      console.log('Unauthorized access attempt to chat history');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pdfId = params.pdfId;
    console.log(`Fetching chat history for PDF ${pdfId} and user ${userId}`);

    // Get all chat entries for this PDF and user
    const chats = await prisma.chat.findMany({
      where: {
        pdfId,
        userId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log(`Found ${chats.length} chat entries in the database`);

    // Process each chat and build messages
    const allMessages: any[] = [];
    const allAnnotations: Annotation[] = [];
    
    for (const chat of chats) {
      try {
        // Parse the messages field with better error handling
        let messagesData;
        try {
          messagesData = typeof chat.messages === 'string'
            ? JSON.parse(chat.messages)
            : chat.messages;
            
          console.log(`Chat ${chat.id} contains data format:`, 
            typeof messagesData, 
            messagesData ? Object.keys(messagesData) : 'null');
        } catch (parseError) {
          console.error('Failed to parse chat messages from database:', parseError);
          console.log('Raw message data:', chat.messages);
          continue; // Skip this problematic chat entry
        }
        
        // Use our utility function to deserialize messages
        const chatMessages = deserializeChatMessages(messagesData);
        
        // Check if we got valid messages
        if (!chatMessages || chatMessages.length === 0) {
          console.warn(`No valid messages in chat ${chat.id}`);
          continue;
        }
        
        console.log(`Processed ${chatMessages.length} messages from chat ${chat.id}`);
        
        // Add timestamp from database
        chatMessages.forEach(msg => {
          msg.timestamp = chat.createdAt;
          
          // Collect annotations
          if (msg.annotations && msg.annotations.length > 0) {
            allAnnotations.push(...msg.annotations);
          }
        });
        
        // Add messages to our collection
        allMessages.push(...chatMessages);
      } catch (error) {
        console.error(`Error processing chat ${chat.id}:`, error);
      }
    }

    // Log the final result
    console.log(`Returning ${allMessages.length} total messages with ${allAnnotations.length} annotations`);
    
    // Return both messages and annotations separately
    return NextResponse.json({ 
      messages: allMessages,
      annotations: allAnnotations,
      count: allMessages.length,
      pdfId: pdfId,
      userId: userId
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch chat history',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
