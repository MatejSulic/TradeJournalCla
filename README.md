# Ascend — Trading Journal

Osobní obchodní deník pro sledování trades, psychologie a výkonu.

---

## Co budeš potřebovat

Před spuštěním si nainstaluj:

- **Node.js** (verze 18 nebo novější) — stáhni na [nodejs.org](https://nodejs.org)
- **Git** — stáhni na [git-scm.com](https://git-scm.com)

---

## Jak spustit

### 1. Stáhni projekt

Otevři terminál (příkazový řádek) a napiš:

```bash
git clone https://github.com/MatejSulic/TradeJournalCla.git
cd TradeJournalCla
```

### 2. Nainstaluj závislosti

```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### 3. Spusť aplikaci

```bash
npm run dev
```

### 4. Otevři v prohlížeči

Přejdi na adresu:

```
http://localhost:5173
```

---

## Jak zastavit aplikaci

V terminálu stiskni **Ctrl + C**.

---

## Časté problémy

**"npm: command not found"**
→ Node.js není nainstalovaný. Stáhni ho na [nodejs.org](https://nodejs.org) a zkus znovu.

**Stránka se nenačte**
→ Ujisti se, že aplikace stále běží v terminálu (krok 3).

**Port je obsazený**
→ Zkus zavřít jiné aplikace nebo restartuj počítač.
