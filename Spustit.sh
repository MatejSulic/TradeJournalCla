#!/bin/bash

echo ""
echo " ╔══════════════════════════════════╗"
echo " ║     Ascend - Trading Journal     ║"
echo " ╚══════════════════════════════════╝"
echo ""

# Zkontroluj Node.js
if ! command -v node &> /dev/null; then
    echo " [CHYBA] Node.js není nainstalovaný!"
    echo ""
    echo " Stáhněte Node.js na: https://nodejs.org"
    echo " Nainstalujte a spusťte tento soubor znovu."
    echo ""
    read -p " Stiskni Enter pro zavření..."
    exit 1
fi

echo " Node.js nalezen."

# Nainstaluj závislosti pokud chybí
if [ ! -d "node_modules" ]; then
    echo " Instalace závislostí (jen první spuštění)..."
    npm install
fi
if [ ! -d "client/node_modules" ]; then
    echo " Instalace klientských závislostí..."
    cd client && npm install && cd ..
fi
if [ ! -d "server/node_modules" ]; then
    echo " Instalace serverových závislostí..."
    cd server && npm install && cd ..
fi

echo ""
echo " Spouštím aplikaci..."
echo " Az se načte, otevře se prohlížeč automaticky."
echo " Pro zastavení stiskni Ctrl + C."
echo ""

# Otevři prohlížeč po 4 sekundách
(sleep 4 && open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null) &

# Spusť aplikaci
npm run dev
