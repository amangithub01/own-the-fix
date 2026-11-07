import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMonitor, dayAt, dayStart, repositoryName } from '../lib/github.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-fix-github-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const instant = '2026-11-07T17:00:00Z';
const pr = {
  number: 12, title: 'Suppress stale search results', html_url: 'https://github.com/demo/fix/pull/12',
  user: { login: 'demo' }, state: 'closed', pull_request: { merged_at: instant },
  created_at: '2026-11-06T10:00:00Z', updated_at: instant
};
function responses(result = { total_count: 1, incomplete_results: false, items: [pr] }) {
  return async args => {
    if (args[0] === 'user') return { login: 'demo' };
    if (args[0] === 'repos/demo/fix') return { full_name: 'demo/fix' };
    assert.equal(args[2], 'search/issues');
    assert.ok(args.includes('q=repo:demo/fix is:pr author:demo updated:>=2026-11-06T18:30:00.000Z'));
    return result;
  };
}
test('IST day boundaries and repository scope are explicit', () => {
  assert.equal(dayAt(new Date('2026-11-06T18:29:59Z')), '2026-11-06');
  assert.equal(dayAt(new Date('2026-11-06T18:30:00Z')), '2026-11-07');
  assert.equal(dayStart('2026-11-07'), '2026-11-06T18:30:00.000Z');
  assert.equal(repositoryName('https://github.com/demo/fix/'), 'demo/fix');
  assert.throws(() => repositoryName('https://github.com/demo'), /owner\/repository/);
  assert.throws(() => repositoryName('demo/fix is:private'), /owner\/repository/);
});
test('PR detection persists metadata but does not invent learning or mix accounts', async t => {
  const dir = fixture(t);
  const monitor = createMonitor({ dir, request: responses(), now: () => new Date(instant) });
  const status = await monitor.connect('demo/fix');
  assert.equal(status.prs[0].state, 'merged');
  assert.equal(status.learning.length, 0);
  assert.match(status.recap, /Learning is not inferred/);
  assert.match(status.prSummary, /Complete the guided case/);
  assert.ok(fs.existsSync(path.join(dir, 'daily-recaps', '2026-11-07.md')));
  const reopened = createMonitor({ dir, request: async () => ({ login: 'someone-else' }), now: () => new Date(instant) });
  await assert.rejects(reopened.sync(), /not demo/);
  assert.equal((await reopened.status()).prs.length, 1);
  assert.match((await reopened.status()).error, /someone-else/);
});
test('incomplete results preserve prior evidence, and multiple pages are read', async t => {
  const dir = fixture(t);
  let fail = false, pages = [];
  const base = responses();
  const monitor = createMonitor({ dir, now: () => new Date(instant), request: async args => {
    if (args.includes('search/issues')) {
      if (fail) return { incomplete_results: true, total_count: 1, items: [] };
      const page = args.find(item => item.startsWith('page='));
      pages.push(page);
      return { total_count: 2, incomplete_results: false, items: [page === 'page=1' ? pr : { ...pr, number: 13, html_url: 'https://github.com/demo/fix/pull/13' }] };
    }
    return base(args);
  } });
  assert.equal((await monitor.connect('demo/fix')).prs.length, 2);
  assert.deepEqual(pages, ['page=1', 'page=2']);
  fail = true;
  await assert.rejects(monitor.sync(), /incomplete/);
  assert.equal((await monitor.status()).prs.length, 2);
});
test('daily rollover preserves reviewed learning once and never assigns it to a PR', async t => {
  const dir = fixture(t);
  const state = {
    version: 1, revision: 7, stage: 'complete', caseId: 'example',
    history: [{ type: 'teachback', at: instant }],
    choice: { approach: 'request-id', quote: 'I accept that old work still runs.' },
    teachback: { quote: 'I learned that finishing last is not the same as starting last.', testLimit: 'Real browser loading behavior is not tested.' },
    baseline: { passCount: 1, failCount: 3 },
    verification: { passed: true, passCount: 4, failCount: 0, command: 'node --test search.test.mjs' }
  };
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
  let clock = new Date(instant);
  const monitor = createMonitor({ dir, request: responses(), now: () => clock });
  const first = await monitor.status();
  assert.equal(first.learning.length, 1);
  assert.equal((await monitor.status()).learning.length, 1);
  assert.match(first.prSummary, /old work still runs/);
  assert.match(first.recap, /not automatically linked to a PR/);
  clock = new Date('2026-11-07T18:30:00Z');
  const next = await monitor.status();
  assert.equal(next.day, '2026-11-08');
  assert.equal(next.learning.length, 0);
  assert.match(await monitor.archive('2026-11-07'), /finishing last/);
  assert.throws(() => repositoryName('../secrets'), /owner\/repository/);
  await assert.rejects(monitor.archive('../state'), /No saved recap/);
});
