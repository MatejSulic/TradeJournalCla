@echo off
title Ascend - Trading Journal
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════╗
echo  ║     Ascend - Trading Journal     ║
echo  ╚══════════════════════════════════╝
echo.

:: Zkontroluj Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [CHYBA] Node.js neni nainstalovan!
    echo.
    echo  Stahnete Node.js na: https://nodejs.org
    echo  Nainstalujte a spustte tento soubor znovu.
    echo.
    pause
    exit /b 1
)

echo  Node.js nalezen.

:: Nainstaluj zavislosti pokud chybi
if not exist "node_modules" (
    echo  Instalace zavislosti ^(jen prvni spusteni^)...
    call npm install
)
if not exist "client\node_modules" (
    echo  Instalace klientskych zavislosti...
    cd client && call npm install && cd ..
)
if not exist "server\node_modules" (
    echo  Instalace serverovych zavislosti...
    cd server && call npm install && cd ..
)

echo.
echo  Spoustim aplikaci...
echo  Az se nacte, otevre se prohlizec automaticky.
echo  Pro zastaveni zavri toto okno.
echo.

:: Počkej 3 sekundy a otevři prohlížeč
start "" cmd /c "timeout /t 4 >nul && start http://localhost:5173"

:: Spusť aplikaci
npm run dev
