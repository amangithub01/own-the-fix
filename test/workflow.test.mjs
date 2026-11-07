import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply, context, read } from '../lib/workflow.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-fix-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const explanation = { type: 'explain', summary: 'Independent requests update the screen on completion.', terms: [{ term: 'await', meaning: 'Pauses one invocation.' }], annotations: [{ line: 4, meaning: 'Updates without checking which query is current.' }] };
function reachChoice(dir) {
  apply({ type: 'start' }, dir);
  apply({ type: 'hypothesis', quote: 'Maybe old requests can finish late.' }, dir);
  apply(explanation, dir, 'switch-tool');
  apply({ type: 'prediction', quote: 'I predict the old result overwrites the newer one.' }, dir);
}

test('implementation and teach-back cannot skip human checkpoints', t => {
  const dir = fixture(t);
  apply({ type: 'start' }, dir);
  assert.throws(() => apply({ type: 'implement' }, dir), /requires stage/);
  assert.throws(() => apply({ type: 'choose', approach: 'request-id', quote: 'Skip ahead' }, dir), /requires stage/);
  assert.throws(() => apply({ type: 'teachback', quote: 'Done', testLimit: 'None' }, dir), /requires stage/);
  assert.equal(context(dir).baseline, undefined);
  assert.equal(context(dir).stage, 'hypothesis');
  assert.equal(read(dir).baseline.passed, false);
});

for (const approach of ['request-id', 'abort-controller']) {
  test(`${approach}: failing-before and passing-after evidence is real and receipt needs human explanation`, t => {
    const dir = fixture(t);
    reachChoice(dir);
    assert.equal(context(dir).baseline.failCount, 3);
    apply({ type: 'choose', approach, quote: `I choose ${approach} and accept its stated tradeoff.` }, dir);
    const verified = apply({ type: 'implement' }, dir, 'switch-tool');
    assert.equal(verified.verification.passed, true);
    assert.equal(verified.verification.passCount, 4);
    assert.equal(verified.stage, 'teachback');
    assert.equal(verified.receipt, undefined);
    const final = apply({ type: 'teachback', quote: 'Only the current search may update the display.', testLimit: 'These tests do not exercise a real network or loading UI.' }, dir);
    assert.equal(final.stage, 'complete');
    assert.match(final.receipt, /real network/);
    assert.match(final.receipt, /does not certify understanding/);
    assert.equal(fs.readFileSync(path.join(dir, 'decision-receipt.md'), 'utf8'), final.receipt);
    assert.throws(() => apply({ type: 'implement' }, dir), /requires stage/);
  });
}

test('invalid line citations and stale submissions do not advance the case', t => {
  const dir = fixture(t);
  apply({ type: 'start' }, dir);
  assert.throws(() => apply({ type: 'hypothesis', quote: 'My guess', revision: 0 }, dir), /case changed/);
  apply({ type: 'hypothesis', quote: 'I don’t know yet.' }, dir);
  assert.throws(() => apply({ ...explanation, annotations: [{ line: 999, meaning: 'Invented citation' }] }, dir), /real source line/);
  assert.equal(context(dir).stage, 'explanation');
  assert.equal(context(dir).explanation, undefined);
});
