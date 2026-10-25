// Blocks cross-origin writes. Removing CORS only stops other sites from READING responses;
// a cross-site <form> POST (urlencoded / multipart) would still reach the server and could
// spend the AI quota or restore a backup. Browsers mark such requests via Sec-Fetch-Site /
// Origin; curl and scripts send neither and are allowed.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isCrossOrigin(req) {
  if (SAFE_METHODS.has(req.method)) return false;
  const site = req.headers['sec-fetch-site'];
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.headers.origin;
  if (!origin) return false;
  if (origin === 'null') return true;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

function sameOriginOnly(req, res, next) {
  if (isCrossOrigin(req)) return res.status(403).json({ error: 'cross-origin request blocked' });
  next();
}

module.exports = { isCrossOrigin, sameOriginOnly };
