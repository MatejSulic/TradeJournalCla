const path = require('path');

// Pure path resolution (no side effects) so it can be unit-tested without opening a DB.
// DB_PATH set -> scratch mode: uploads live next to that DB (or UPLOADS_DIR if set), never in server/uploads.
function resolvePaths(env = process.env, serverDir = __dirname) {
  if (!env.DB_PATH) {
    return { DB_PATH: path.join(serverDir, 'data', 'journal.db'), UPLOADS_DIR: path.join(serverDir, 'uploads') };
  }
  const DB_PATH = path.resolve(env.DB_PATH);
  const UPLOADS_DIR = env.UPLOADS_DIR ? path.resolve(env.UPLOADS_DIR) : path.join(path.dirname(DB_PATH), 'uploads');
  return { DB_PATH, UPLOADS_DIR };
}

module.exports = { resolvePaths };
