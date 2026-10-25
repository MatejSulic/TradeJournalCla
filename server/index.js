// Load .env (repo root) before anything reads process.env; missing file is fine
const path = require('path');
if (typeof process.loadEnvFile !== 'function') {
  console.warn(`process.loadEnvFile is not available in Node ${process.version} (needs >= 20.12): .env is not loaded`);
} else {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
}

const express = require('express');

const app = express();

// No CORS: the client is same-origin (Docker) or proxied by Vite (dev). Cross-origin
// pages must not be able to call /api/ai/* and spend the user's API quota.
app.use('/api', require('./sameOrigin').sameOriginOnly);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded screenshots
app.use('/uploads', express.static(require('./db').UPLOADS_DIR));

// Routes
app.use('/api/series', require('./routes/series'));
app.use('/api/entry-models', require('./routes/entryModels'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/ai', require('./routes/ai'));

// Serve built client (Docker / production) when present
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (require('fs').existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
