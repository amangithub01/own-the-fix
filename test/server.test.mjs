import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('dashboard state is protected and HTTP actions respect decision gates', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-fix-http-'));
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, OWN_FIX_DATA_DIR: dir } });
  let errorOutput = '';
  child.stderr.on('data', data => { errorOutput += data; });
  const ready = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]));
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error(errorOutput || 'Server exited before ready.')));
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${ready.port}`;
  const headers = { Authorization: `Bearer ${new URL(ready.url).hash.slice(1)}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/context`)).status, 401);
  assert.equal((await fetch(`${base}/api/github`)).status, 401);
  assert.equal((await fetch(`${base}/api/github/sync`, { method: 'POST', body: '{}' })).status, 401);
  const daily = await (await fetch(`${base}/api/github`, { headers })).json();
  assert.equal(daily.config, null);
  assert.match(daily.recap, /Learning is not inferred/);
  const archived = await fetch(`${base}/api/recap?day=${daily.day}`, { headers });
  assert.equal(archived.status, 200);
  assert.match(await archived.text(), /What I did and learned/);
  assert.equal((await fetch(`${base}/api/context`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${base}/api/receipt`, { headers })).status, 409);
  const started = await fetch(`${base}/api/action`, { method: 'POST', headers, body: JSON.stringify({ type: 'start' }) });
  assert.equal(started.status, 200);
  assert.equal((await started.json()).stage, 'hypothesis');
  const premature = await fetch(`${base}/api/action`, { method: 'POST', headers, body: JSON.stringify({ type: 'implement' }) });
  assert.equal(premature.status, 400);
  assert.match((await premature.json()).error, /No steps were skipped/);
  assert.equal((await fetch(`${base}/fixtures/request-id.mjs`)).status, 404);
});
