#!/bin/bash

# Script to check Prisma Client generation status
# and help debug issues with the Prisma schema

echo "🔍 Checking Prisma setup..."

# Check if prisma is installed
if ! command -v npx &> /dev/null; then
    echo "❌ npx command not found. Please install Node.js and npm."
    exit 1
fi

# Check if schema file exists
if [ ! -f "./prisma/schema.prisma" ]; then
    echo "❌ prisma/schema.prisma file not found!"
    exit 1
fi

# Validate the schema
echo "⚙️  Validating schema..."
npx prisma validate
if [ $? -ne 0 ]; then
    echo "❌ Schema validation failed!"
    exit 1
fi

echo "✅ Schema validation successful!"

# Check for duplicate model definitions
echo "⚙️  Checking for duplicate model definitions..."
DUPLICATES=$(grep -n "^model " ./prisma/schema.prisma | sort -k2 | awk '{print $2}' | uniq -d)

if [ ! -z "$DUPLICATES" ]; then
    echo "⚠️  Warning: Found duplicate model definitions:"
    for MODEL in $DUPLICATES; do
        echo "   - $MODEL"
        grep -n "^model $MODEL " ./prisma/schema.prisma
    fi
    echo "You need to fix these duplicate models before continuing!"
    exit 1
fi

echo "✅ No duplicate models found."

# Generate Prisma client for debugging
echo "⚙️  Generating Prisma client for debugging..."
npx prisma generate --no-engine

echo "✅ All checks passed! Your Prisma schema should be valid."
echo "📝 Remember to run 'npx prisma generate' after fixing any issues."