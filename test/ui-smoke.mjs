import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-fix-ui-'));
const env = { ...process.env, OWN_FIX_DATA_DIR: dir };
let server, ui;
try {
  server = spawn(process.execPath, ['server.mjs'], { env });
  let stderr = '';
  server.stderr.on('data', data => { stderr += data; });
  const ready = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', data => {
      output += data;
      if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]));
    });
    server.once('error', reject);
    server.once('exit', () => reject(new Error(stderr || 'Server exited')));
  });
  ui = spawn('build/ui-smoke', [], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
  let output = '', actionError;
  ui.stdout.on('data', data => {
    output += data;
    let newline;
    while ((newline = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      if (!line.startsWith('ACTION:')) { console.log(line); continue; }
      const action = line.slice('ACTION:'.length);
      const operation = action === 'explain' ? {
        type: 'explain', summary: 'Each search invocation waits independently and publishes without a freshness check.',
        terms: [{ term: 'await', meaning: 'Pauses this invocation, not all searches.' }],
        annotations: [{ line: 4, meaning: 'The response always updates results, even if a newer search has started.' }]
      } : action === 'implement' ? { type: 'implement' } : null;
      if (!operation) { actionError = new Error('Unknown UI test action'); ui.kill('SIGTERM'); return; }
      const result = spawnSync(process.execPath, ['tools/fix.mjs', 'apply'], { input: JSON.stringify(operation), env, encoding: 'utf8' });
      if (result.status !== 0) { actionError = new Error(result.stderr); ui.kill('SIGTERM'); return; }
    }
  });
  ui.stdin.end(ready.url);
  const [status] = await once(ui, 'exit');
  if (actionError) throw actionError;
  if (status !== 0) throw new Error('Guided UI test failed');
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  if (state.stage !== 'complete' || !state.history.some(event => event.source === 'switch-tool')) throw new Error('The CLI-backed workflow did not persist.');
  console.log('Human checkpoints → external CLI explanation → selected fix → actual tests → receipt: passed.');
} finally {
  if (ui && ui.exitCode === null && ui.signalCode === null) { ui.kill('SIGTERM'); await once(ui, 'exit'); }
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  fs.rmSync(dir, { recursive: true, force: true });
}
