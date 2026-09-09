import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css' };

createServer(async (req, res) => {
  // Strip the query BEFORE defaulting, so "/?force=base1-4" still serves the page.
  const bare = req.url.split('?')[0];
  const path = bare === '/' ? '/rip.html' : bare;
  try {
    const buf = await readFile(join(ROOT, decodeURIComponent(path)));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    console.log('404', path, e.message);
    res.writeHead(404).end('not found');
  }
}).listen(4178, () => console.log('RIPDEX demo on http://localhost:4178, root=' + ROOT));
