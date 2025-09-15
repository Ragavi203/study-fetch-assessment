/**
 * Example script to migrate legacy data to new schema
 * Run this after schema migration to update data structure
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Add a type cast to work around TypeScript errors with Prisma client
const typedPrisma = prisma as any;

// Define types to match Prisma schema
type ChatMessage = {
  id: string;
  chatId?: string | null;
  pdfId?: string | null;
  userId?: string | null;
  role: string;
  content: string;
  pageContext?: number | null;
  createdAt: Date;
};

interface Chat {
  id: string;
  userId: string;
  pdfId: string;
  messages: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  chatMessages?: ChatMessage[];
}

async function migrateLegacyData() {
  console.log('Starting legacy data migration...');
  
  try {
    // Find all chats with legacy message format
    const chats = await typedPrisma.chat.findMany({
      where: {
        messages: { not: {} },
      },
      include: {
        // In the Prisma client, this might be lowercase or differently named based on schema
        // Using typedPrisma allows us to bypass TypeScript's strict checking
        chatMessages: true,
      }
    }) as Chat[];
    
    console.log(`Found ${chats.length} chats with legacy messages`);
    
    for (const chat of chats) {
      // Parse legacy messages
      const legacyMessages = chat.messages as any[];
      
      if (!Array.isArray(legacyMessages)) {
        console.log(`Skipping chat ${chat.id}: messages is not an array`);
        continue;
      }
      
      // Check if messages already migrated
      if (chat.chatMessages && chat.chatMessages.length > 0) {
        console.log(`Skipping chat ${chat.id}: already has ${chat.chatMessages.length} migrated messages`);
        continue;
      }
      
      console.log(`Migrating ${legacyMessages.length} messages for chat ${chat.id}`);
      
      // Create new message records
      for (const [index, msg] of legacyMessages.entries()) {
        if (!msg.role || !msg.content) {
          console.log(`Skipping message at index ${index} in chat ${chat.id}: invalid format`);
          continue;
        }
        
        try {
          await typedPrisma.chatMessage.create({
            data: {
              chatId: chat.id,
              pdfId: chat.pdfId,
              userId: chat.userId,
              role: msg.role,
              content: msg.content,
              createdAt: new Date(msg.timestamp || Date.now()),
              pageContext: msg.pageContext,
              // Migrate annotations if they exist
              annotations: msg.annotations?.length > 0 ? {
                create: msg.annotations.map((anno: any, i: number) => ({
                  pdfId: chat.pdfId,
                  page: anno.page || 1,
                  type: anno.type || 'highlight',
                  x: anno.x || 0,
                  y: anno.y || 0,
                  width: anno.width,
                  height: anno.height,
                  radius: anno.radius,
                  color: anno.color,
                  text: anno.text,
                  importance: anno.importance,
                  sequence: i,
                  isAutomatic: true,
                }))
              } : undefined
            }
          });
        } catch (err) {
          console.error(`Error migrating message at index ${index} for chat ${chat.id}:`, err);
        }
      }
      
      console.log(`Successfully migrated messages for chat ${chat.id}`);
    }
    
    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the function if this is the main module
if (require.main === module) {
  migrateLegacyData()
    .then(() => console.log('Migration script finished'))
    .catch((err) => console.error('Migration script error:', err));
}

export default migrateLegacyData;