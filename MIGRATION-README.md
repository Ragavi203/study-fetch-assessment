# Database Migration Guide

This guide explains how to safely apply the database migrations for the StudyFetch application.

## Background

Our application has been enhanced with new models and relationships:

1. **ChatMessage** - Enhanced to support direct PDF association
2. **Annotation** - For storing PDF annotations with rich metadata
3. **PDFPage** - For caching extracted PDF text and metadata

## Migration Steps

### 1. Backup Your Database (Important!)

Before running any migrations, back up your database:

```bash
# PostgreSQL backup
pg_dump -U your_username -d your_database_name > backup_$(date +%Y%m%d).sql
```

### 2. Run the Migration Script

We've provided a safe migration script that includes verification steps:

```bash
# Make the script executable
chmod +x ./scripts/migrate-safely.sh

# Run the migration
./scripts/migrate-safely.sh enhanced-pdf-messages
```

The script will:
1. Validate your database connection
2. Create migration files for review
3. Ask for confirmation before applying changes
4. Apply the migration and update the Prisma client

### 3. Verify the Migration

After running the migration, verify that everything is working correctly:

```bash
# Check the database schema
npx prisma db pull --print

# Generate fresh TypeScript types (if needed)
npx prisma generate
```

### 4. Troubleshooting

If you encounter issues:

1. **Reset Development Database**: For development environments, you can reset the database:
   ```bash
   ./scripts/migrate-safely.sh reset-dev --reset
   ```
   (This will DELETE all data, so only use in development!)

2. **Restore from Backup**: If something goes wrong in production:
   ```bash
   psql -U your_username -d your_database_name < your_backup_file.sql
   ```

## Schema Changes

The key schema changes include:

1. **ChatMessage Model**:
   - Added direct relationship to PDF and User
   - Added sessionId field for grouping messages
   - Enhanced with metadata fields

2. **Annotation Model**:
   - Enhanced positioning information
   - Added support for different annotation types
   - Improved metadata

3. **PDFPage Model**:
   - Stores extracted text content
   - Caches line positions for better annotation placement

## Data Migration

This migration preserves existing data. However, if you need to migrate data from old schemas:

```typescript
// Example migration script (to be run after schema migration)
async function migrateLegacyData() {
  const chats = await prisma.chat.findMany({
    include: { messages: true }
  });
  
  for (const chat of chats) {
    // Convert legacy message format
    const legacyMessages = chat.messages as any[];
    
    for (const msg of legacyMessages) {
      await prisma.chatMessage.create({
        data: {
          chatId: chat.id,
          pdfId: chat.pdfId,
          userId: chat.userId,
          role: msg.role,
          content: msg.content,
          createdAt: new Date(msg.timestamp)
        }
      });
    }
  }
}
```

## Reverting Changes (Emergency Only)

If you need to revert the migration in production:

1. Restore from your backup
2. Update your Prisma schema to match the previous version
3. Run `npx prisma generate` to update the client