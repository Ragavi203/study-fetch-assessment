#!/bin/bash

# Safer Prisma Migration Script
# This script helps perform Prisma migrations with safety checks

echo "📊 StudyFetch Migration Assistant"
echo "--------------------------------"
echo 

# Check if prisma CLI is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx not found. Please install Node.js and npm."
    exit 1
fi

# Validate database connection
echo "🔍 Validating database connection..."
if ! npx prisma validate; then
    echo "❌ Database connection failed. Please check your DATABASE_URL in .env file"
    exit 1
fi

# Generate migration
echo "📝 Generating migration files..."
read -p "Enter migration name (e.g., 'add-annotations-and-chatmessages'): " MIGRATION_NAME

if [ -z "$MIGRATION_NAME" ]; then
    MIGRATION_NAME="schema-update"
fi

# Create migration without applying
npx prisma migrate dev --name $MIGRATION_NAME --create-only

echo
echo "✅ Migration files created but NOT applied yet"
echo "Review them in: ./prisma/migrations/"
echo
echo "🚨 IMPORTANT: This will modify your database schema. Make sure you:"
echo "  1. Have a backup of your database"
echo "  2. Have reviewed the migration SQL"
echo "  3. Understand that this could affect existing data"
echo

read -p "Do you want to apply the migration now? (y/N): " CONFIRM

if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    echo "🚀 Applying migration..."
    npx prisma migrate dev
    
    # Generate Prisma client
    echo "🔄 Generating Prisma client..."
    npx prisma generate
    
    echo "✅ Migration complete!"
else
    echo "⏸️ Migration not applied. To apply later, run:"
    echo "    npx prisma migrate dev"
    echo
fi