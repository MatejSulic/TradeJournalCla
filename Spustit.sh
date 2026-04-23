#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo " ╔══════════════════════════════════╗"
echo " ║     Ascend - Trading Journal     ║"
echo " ╚══════════════════════════════════╝"
echo ""

# [1/4] Check Node.js
echo " [1/4] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo ""
    echo " [ERROR] Node.js is not installed or not found in PATH."
    echo ""
    echo " Fix: Download and install Node.js from https://nodejs.org"
    echo "      Choose the LTS version. After installing, restart"
    echo "      your terminal and run this file again."
    echo ""
    read -p " Press Enter to close..."
    exit 1
fi

NODE_VER=$(node -v)
echo " Node.js $NODE_VER found. OK"

# [2/4] Check npm
echo " [2/4] Checking npm..."
if ! command -v npm &> /dev/null; then
    echo ""
    echo " [ERROR] npm is not available."
    echo ""
    echo " Fix: npm is bundled with Node.js. Try reinstalling Node.js"
    echo "      from https://nodejs.org"
    echo ""
    read -p " Press Enter to close..."
    exit 1
fi

NPM_VER=$(npm -v)
echo " npm v$NPM_VER found. OK"

# [3/4] Install dependencies
echo " [3/4] Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo " Installing root dependencies (first run only)..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo " [ERROR] Failed to install root dependencies (exit code: $?)."
        echo ""
        echo " Possible causes:"
        echo "   - No internet connection"
        echo "   - npm registry unreachable"
        echo "   - Insufficient disk space"
        echo ""
        echo " Try running this command manually in this folder:"
        echo "   npm install"
        echo ""
        read -p " Press Enter to close..."
        exit 1
    fi
    echo " Root dependencies installed. OK"
fi

if [ ! -d "client/node_modules" ]; then
    echo " Installing client dependencies (first run only)..."
    pushd client > /dev/null
    npm install
    RESULT=$?
    popd > /dev/null
    if [ $RESULT -ne 0 ]; then
        echo ""
        echo " [ERROR] Failed to install client dependencies (exit code: $RESULT)."
        echo ""
        echo " Possible causes:"
        echo "   - No internet connection"
        echo "   - npm registry unreachable"
        echo "   - Insufficient disk space"
        echo ""
        echo " Try running this command manually in the \"client\" folder:"
        echo "   npm install"
        echo ""
        read -p " Press Enter to close..."
        exit 1
    fi
    echo " Client dependencies installed. OK"
fi

if [ ! -d "server/node_modules" ]; then
    echo " Installing server dependencies (first run only)..."
    pushd server > /dev/null
    npm install
    RESULT=$?
    popd > /dev/null
    if [ $RESULT -ne 0 ]; then
        echo ""
        echo " [ERROR] Failed to install server dependencies (exit code: $RESULT)."
        echo ""
        echo " Possible causes:"
        echo "   - No internet connection"
        echo "   - Missing build tools (needed for better-sqlite3)"
        echo "   - Incompatible Node.js version"
        echo ""
        echo " Fix for \"better-sqlite3\" build error:"
        echo "   macOS:  xcode-select --install"
        echo "   Ubuntu: sudo apt install build-essential python3"
        echo "   Fedora: sudo dnf install gcc-c++ make python3"
        echo ""
        echo " Try running this command manually in the \"server\" folder:"
        echo "   npm install"
        echo ""
        read -p " Press Enter to close..."
        exit 1
    fi
    echo " Server dependencies installed. OK"
fi

echo " All dependencies ready. OK"

# [4/4] Start the app
echo " [4/4] Starting app..."
echo ""
echo " The browser will open automatically in a few seconds."
echo " Press Ctrl+C to stop the app."
echo ""

(sleep 5 && (open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null)) &

npm run dev
EXIT_CODE=$?

echo ""
echo " -----------------------------------------------"
echo " App stopped (exit code: $EXIT_CODE)."
if [ $EXIT_CODE -ne 0 ]; then
    echo " Check the output above for error details."
fi
echo " -----------------------------------------------"
echo ""
read -p " Press Enter to close..."
