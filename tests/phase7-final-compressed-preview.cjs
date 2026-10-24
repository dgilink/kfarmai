'use strict';
// Local-only compression parity probe for an already-built Pages artifact.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(process.argv[2] || '');
const port = Number(process.argv[3] || 8782);
if (!root || !fs.statSync(root).isDirectory() || !Number.isInteger(port)) {
  throw new Error('artifact directory and port required');
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2' };
http.createServer((request, response) => {
  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('outside artifact');
  } catch (_) { response.writeHead(400).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404).end(); return; }
    const type = types[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding' };
    if (/^(text\/|application\/json|image\/svg)/.test(type) && request.headers['accept-encoding']?.includes('br')) {
      bytes = zlib.brotliCompressSync(bytes);
      headers['Content-Encoding'] = 'br';
    }
    headers['Content-Length'] = bytes.length;
    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end(); else response.end(bytes);
  });
}).listen(port, '127.0.0.1');
