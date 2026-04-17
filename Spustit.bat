@echo off
title Ascend - Trading Journal
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════╗
echo  ║     Ascend - Trading Journal     ║
echo  ╚══════════════════════════════════╝
echo.

:: Check Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Download Node.js at: https://nodejs.org
    echo  Install it and run this file again.
    echo.
    pause
    exit /b 1
)

echo  Node.js found.

:: Install dependencies if missing
if not exist "node_modules" (
    echo  Installing dependencies (first run only)...
    call npm install
)
if not exist "client\node_modules" (
    echo  Installing client dependencies...
    cd client && call npm install && cd ..
)
if not exist "server\node_modules" (
    echo  Installing server dependencies...
    cd server && call npm install && cd ..
)

echo.
echo  Starting app...
echo  Once ready, the browser will open automatically.
echo  Close this window to stop.
echo.

:: Wait 4 seconds then open browser
start "" cmd /c "timeout /t 4 >nul && start http://localhost:5173"

:: Start the app
npm run dev
