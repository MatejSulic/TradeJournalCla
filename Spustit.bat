@echo off
pushd "%~dp0"
title Ascend - Trading Journal
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════╗
echo  ║     Ascend - Trading Journal     ║
echo  ╚══════════════════════════════════╝
echo.

:: Check Node.js
echo  [1/4] Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js is not installed or not found in PATH.
    echo.
    echo  Fix: Download and install Node.js from https://nodejs.org
    echo       Choose the LTS version. After installing, restart
    echo       your computer and run this file again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo  Node.js %%v found. OK

:: Check npm
echo  [2/4] Checking npm...
npm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm is not available.
    echo.
    echo  Fix: npm is bundled with Node.js. Try reinstalling Node.js
    echo       from https://nodejs.org and restart your computer.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v') do echo  npm v%%v found. OK

:: Install root dependencies
echo  [3/4] Checking dependencies...
if not exist "node_modules" (
    echo  Installing root dependencies (first run only)...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Failed to install root dependencies (exit code: %errorlevel%).
        echo.
        echo  Possible causes:
        echo    - No internet connection
        echo    - npm registry unreachable
        echo    - Insufficient disk space
        echo.
        echo  Try running this command manually in this folder:
        echo    npm install
        echo.
        pause
        exit /b 1
    )
    echo  Root dependencies installed. OK
)

if not exist "client\node_modules" (
    echo  Installing client dependencies (first run only)...
    pushd client
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Failed to install client dependencies (exit code: %errorlevel%).
        echo.
        echo  Possible causes:
        echo    - No internet connection
        echo    - npm registry unreachable
        echo    - Insufficient disk space
        echo.
        echo  Try running this command manually in the "client" folder:
        echo    npm install
        echo.
        popd
        pause
        exit /b 1
    )
    popd
    echo  Client dependencies installed. OK
)

if not exist "server\node_modules" (
    echo  Installing server dependencies (first run only)...
    pushd server
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Failed to install server dependencies (exit code: %errorlevel%).
        echo.
        echo  Possible causes:
        echo    - No internet connection
        echo    - Missing Visual C++ Build Tools (needed for better-sqlite3)
        echo    - Incompatible Node.js version
        echo.
        echo  Fix for "better-sqlite3" build error:
        echo    1. Install Visual Studio Build Tools from:
        echo       https://visualstudio.microsoft.com/visual-cpp-build-tools/
        echo    2. Select "Desktop development with C++" during install
        echo    3. Restart your computer and run this file again.
        echo.
        echo  Try running this command manually in the "server" folder:
        echo    npm install
        echo.
        popd
        pause
        exit /b 1
    )
    popd
    echo  Server dependencies installed. OK
)

echo  All dependencies ready. OK

:: Start the app
echo  [4/4] Starting app...
echo.
echo  The browser will open automatically in a few seconds.
echo  Close this window to stop the app.
echo.

start "" cmd /c "timeout /t 5 >nul && start http://localhost:5173"

npm run dev

echo.
echo  -----------------------------------------------
echo  App stopped (or crashed).
echo  Check the output above for error details.
echo  -----------------------------------------------
echo.
pause
popd
