/* Petit serveur statique local pour prévisualiser /dist (URLs propres). */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = process.env.PORT || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain' };

async function resolve(p) {
  let fp = join(ROOT, decodeURIComponent(p.split('?')[0]));
  try { const s = await stat(fp); if (s.isDirectory()) fp = join(fp, 'index.html'); return fp; }
  catch { /* try folder index */ }
  try { const fp2 = join(ROOT, decodeURIComponent(p), 'index.html'); await stat(fp2); return fp2; }
  catch { return null; }
}

createServer(async (req, res) => {
  let fp = await resolve(req.url);
  if (!fp) { fp = join(ROOT, '404.html'); res.statusCode = 404; }
  try {
    const data = await readFile(fp);
    res.setHeader('Content-Type', TYPES[extname(fp)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); // aperçu local : jamais de cache
    res.end(data);
  } catch {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404 — page introuvable</h1><p><a href="/">Retour à l\'accueil</a></p>');
  }
}).listen(PORT, () => console.log(`▶ Aperçu Coffre à Dom : http://localhost:${PORT}`));
