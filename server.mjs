import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { context, apply, token } from './lib/workflow.mjs';
import { createMonitor, intervalMs } from './lib/github.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const secret = token();
const monitor = createMonitor();
const polling = setInterval(() => monitor.sync().catch(() => {}), intervalMs);
polling.unref();
monitor.sync().catch(() => {});
let port;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};
const authorized = request => {
  const actual = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
const server = http.createServer(async (request, response) => {
  const host = `127.0.0.1:${port}`;
  if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== `http://${host}`)) return json(response, 403, { error: 'Local same-origin access only.' });
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(request.url, `http://${host}`);
  if (url.pathname === '/health') return json(response, 200, { status: 'ok', app: 'Own the Fix' });
  if (url.pathname.startsWith('/api/')) {
    if (!authorized(request)) return json(response, 401, { error: 'Open this dashboard using its private local launch link.' });
    try {
      if (request.method === 'GET' && url.pathname === '/api/context') return json(response, 200, context());
      if (request.method === 'GET' && url.pathname === '/api/github') return json(response, 200, await monitor.status());
      if (request.method === 'GET' && url.pathname === '/api/recap') {
        const markdown = await monitor.archive(url.searchParams.get('day') || (await monitor.status()).day);
        response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="daily-recap.md"', 'Cache-Control': 'no-store' });
        return response.end(markdown);
      }
      if (request.method === 'GET' && url.pathname === '/api/receipt') {
        const state = context();
        if (state.stage !== 'complete') return json(response, 409, { error: 'Record your explanation first.' });
        response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="decision-receipt.md"', 'Cache-Control': 'no-store' });
        return response.end(state.receipt);
      }
      if (request.method === 'POST' && ['/api/action', '/api/github/connect', '/api/github/sync'].includes(url.pathname)) {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 32000) return json(response, 413, { error: 'Request too large.' });
        }
        const operation = JSON.parse(body);
        if (url.pathname === '/api/github/connect') return json(response, 200, await monitor.connect(operation.repository));
        if (url.pathname === '/api/github/sync') return json(response, 200, await monitor.sync());
        const result = apply(operation);
        await monitor.status();
        return json(response, 200, result);
      }
      return json(response, 404, { error: 'Unknown endpoint.' });
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
  try {
    const base = path.join(root, 'web');
    const file = path.resolve(base, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
    if (!file.startsWith(`${base}${path.sep}`) || !mime[path.extname(file)]) return json(response, 404, { error: 'Not found.' });
    const contents = fs.readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-cache' });
    response.end(contents);
  } catch { json(response, 404, { error: 'Not found.' }); }
});
server.listen(0, '127.0.0.1', () => {
  port = server.address().port;
  const url = `http://127.0.0.1:${port}/#${secret}`;
  if (process.argv.includes('--open')) {
    spawn('open', [url], { stdio: 'ignore' });
    console.log(JSON.stringify({ port, app: 'Own the Fix', browserOpened: true }));
  } else console.log(JSON.stringify({ port, url }));
});
const stop = () => { clearInterval(polling); server.close(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
