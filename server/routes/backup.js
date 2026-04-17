const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { db, DB_PATH, reinitDb, UPLOADS_DIR } = require('../db');

const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// Download full backup (DB + uploads) as ZIP
router.get('/', (req, res) => {
  db.pragma('wal_checkpoint(FULL)');

  const zip = new AdmZip();
  zip.addLocalFile(DB_PATH, '', 'journal.db');

  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        zip.addLocalFile(filePath, 'uploads');
      }
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `ascend_backup_${date}.zip`;
  const buffer = zip.toBuffer();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

// Restore from ZIP backup
router.post('/', upload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Žádný soubor nebyl nahrán' });

  const tempPath = req.file.path;

  let zip;
  try {
    zip = new AdmZip(tempPath);
  } catch (e) {
    fs.unlinkSync(tempPath);
    return res.status(400).json({ error: 'Soubor není platný ZIP archiv' });
  }

  const dbEntry = zip.getEntry('journal.db');
  if (!dbEntry) {
    fs.unlinkSync(tempPath);
    return res.status(400).json({ error: 'ZIP neobsahuje journal.db — není to záloha Ascend' });
  }

  // Validate it's a real SQLite file
  const dbBuf = dbEntry.getData();
  if (!dbBuf.slice(0, 15).toString('utf8').startsWith('SQLite format 3')) {
    fs.unlinkSync(tempPath);
    return res.status(400).json({ error: 'journal.db v ZIPu není platná SQLite databáze' });
  }

  try {
    // Write new DB file
    db.close();
    fs.writeFileSync(DB_PATH, dbBuf);
    reinitDb();

    // Restore uploads — clear existing, write from ZIP
    if (fs.existsSync(UPLOADS_DIR)) {
      for (const file of fs.readdirSync(UPLOADS_DIR)) {
        fs.unlinkSync(path.join(UPLOADS_DIR, file));
      }
    }

    const uploadEntries = zip.getEntries().filter(e => e.entryName.startsWith('uploads/') && !e.isDirectory);
    for (const entry of uploadEntries) {
      const filename = path.basename(entry.entryName);
      if (filename) {
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), entry.getData());
      }
    }

    fs.unlinkSync(tempPath);
    res.json({ ok: true });
  } catch (e) {
    try { reinitDb(); } catch (_) {}
    fs.unlinkSync(tempPath);
    res.status(500).json({ error: `Obnova selhala: ${e.message}` });
  }
});

module.exports = router;
