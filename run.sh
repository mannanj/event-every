#!/bin/bash

set -e

echo "Setting up Event Every..."

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing..."
    npm install -g pnpm
fi

# Check for vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Install dependencies if node_modules doesn't exist or package.json changed
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Link to Vercel project if not linked
if [ ! -d ".vercel" ]; then
    echo "Linking to Vercel project..."
    vercel link
fi

# Pull env variables if .env.local doesn't exist
if [ ! -f ".env.local" ]; then
    echo "Pulling environment variables from Vercel..."
    vercel env pull
fi

echo "Starting dev server..."
pnpm dev
