#!/bin/bash

echo ""
echo " ╔══════════════════════════════════╗"
echo " ║     Ascend - Trading Journal     ║"
echo " ╚══════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo " [ERROR] Node.js is not installed!"
    echo ""
    echo " Download Node.js at: https://nodejs.org"
    echo " Install it and run this file again."
    echo ""
    read -p " Press Enter to close..."
    exit 1
fi

echo " Node.js found."

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo " Installing dependencies (first run only)..."
    npm install
fi
if [ ! -d "client/node_modules" ]; then
    echo " Installing client dependencies..."
    cd client && npm install && cd ..
fi
if [ ! -d "server/node_modules" ]; then
    echo " Installing server dependencies..."
    cd server && npm install && cd ..
fi

echo ""
echo " Starting app..."
echo " Once ready, the browser will open automatically."
echo " Press Ctrl + C to stop."
echo ""

# Open browser after 4 seconds
(sleep 4 && open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null) &

# Start the app
npm run dev
