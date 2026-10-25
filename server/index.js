// Load .env (repo root) before anything reads process.env; missing file is fine
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
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
