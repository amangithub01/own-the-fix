import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const directory = () => process.env.OWN_FIX_DATA_DIR
  || path.join(os.homedir(), 'Library', 'Application Support', 'Own the Fix');
export const stages = ['hypothesis', 'explanation', 'prediction', 'choice', 'implementation', 'teachback', 'complete'];
export const issue = {
  title: 'Search results travel back in time',
  description: 'You type “ca”, then “cats”. The “cats” request finishes first, but the slower “ca” request later replaces the screen with cars. The screen must only accept results belonging to the most recently started search.',
  scenario: ['Request A starts for “ca”.', 'Request B starts for “cats”.', 'B finishes with cats.', 'A finishes with cars.'],
  requirements: ['Only the latest started request may update the display.', 'Sequential searches must still work.', 'A failed latest request must not resurrect old results.'],
  notCovered: 'The demo does not implement a production UI, loading indicators, server search, debounce, accessibility, or comprehensive network retry behavior.'
};
export const approaches = [
  { id: 'request-id', title: 'Latest-request guard', mechanism: 'Give each search an increasing number; only the latest number can publish results.', advantage: 'Works even when the underlying operation cannot be cancelled.', tradeoff: 'Older requests still use resources; this only suppresses their display updates.' },
  { id: 'abort-controller', title: 'AbortController + stale-result check', mechanism: 'Abort the previous search, then check its signal before displaying anything.', advantage: 'A cooperating transport can stop work as well as suppress stale results.', tradeoff: 'The transport must support cancellation to save resources. Aborting alone is not a guarantee; the stale-result check still matters.' }
];

const ensure = dir => fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
function text(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} needs nonempty text, at most ${max} characters.`);
  return value.trim();
}
export function read(dir = directory()) {
  ensure(dir);
  const file = path.join(dir, 'state.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, revision: 0, stage: 'not_started', history: [] };
}
export function token(dir = directory()) {
  ensure(dir);
  const file = path.join(dir, 'local-token');
  try { fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return fs.readFileSync(file, 'utf8').trim();
}
function lock(dir, callback) {
  ensure(dir);
  const file = path.join(dir, '.write-lock');
  let acquired = false;
  for (let i = 0; i < 300; i++) {
    try { fs.mkdirSync(file); acquired = true; break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  if (!acquired) throw new Error('Another update is in progress. Retry shortly.');
  try { return callback(); } finally { fs.rmdirSync(file); }
}
function runTests(workspace) {
  const testFile = path.join(workspace, 'search.test.mjs');
  const env = { ...process.env };
  // A verification subprocess must not inherit the parent's Node test-worker mode.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
    cwd: workspace, env, encoding: 'utf8', timeout: 15000, maxBuffer: 250000
  });
  if (result.error) throw result.error;
  const output = `${result.stdout}${result.stderr}`.slice(0, 24000);
  const passCount = Number(output.match(/# pass (\d+)/)?.[1] ?? 0);
  const failCount = Number(output.match(/# fail (\d+)/)?.[1] ?? 0);
  if (passCount + failCount === 0) throw new Error('No verification tests executed; a zero exit code is not sufficient evidence.');
  return {
    command: 'node --test --test-reporter=tap search.test.mjs',
    status: result.status, passed: result.status === 0,
    passCount, failCount,
    output, at: new Date().toISOString()
  };
}
function requireStage(state, expected) {
  if (state.stage !== expected) throw new Error(`This action requires stage "${expected}"; current stage is "${state.stage}". No steps were skipped.`);
}
function receipt(state) {
  return [
    '# Own the Fix — decision receipt', '',
    '## Issue', issue.description, '',
    '## My initial hypothesis', state.hypothesis, '',
    '## My prediction', state.prediction, '',
    '## Evidence and explanation', state.explanation.summary, '',
    ...state.explanation.annotations.map(item => `- search.mjs:${item.line}: ${item.meaning}`), '',
    '## My chosen approach', state.choice.approach, state.choice.quote, '',
    '## Alternative considered', approaches.find(item => item.id !== state.choice.approach).title, '',
    '## Executed verification',
    `Before: ${state.baseline.passCount} passed, ${state.baseline.failCount} failed.`,
    `After: ${state.verification.passCount} passed, ${state.verification.failCount} failed.`,
    `Command: \`${state.verification.command}\``, '',
    '## My explanation of the fix', state.teachback.quote, '',
    '## What these tests do not establish', state.teachback.testLimit, '',
    '## Before', '```javascript', state.beforeSource.trimEnd(), '```', '',
    '## After', '```javascript', state.afterSource.trimEnd(), '```', '',
    'This receipt records participation and evidence. It does not certify understanding.',
    'Human quotations are provided through the dashboard or a trusted Switch agent; they are not independently authenticated speech.', ''
  ].join('\n');
}
export function apply(operation, dir = directory(), source = 'desktop') {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('Expected an operation object.');
  return lock(dir, () => {
    const state = read(dir);
    if (operation.revision !== undefined && operation.revision !== state.revision) throw new Error('The case changed. Refresh before submitting this step.');
    if (state.version !== 1) throw new Error('Unsupported case version; no data changed.');
    let event;
    switch (operation.type) {
      case 'start': {
        requireStage(state, 'not_started');
        const caseId = crypto.randomUUID();
        const workspace = path.join(dir, caseId);
        ensure(workspace);
        fs.copyFileSync(path.join(root, 'fixtures', 'buggy.mjs'), path.join(workspace, 'search.mjs'));
        fs.copyFileSync(path.join(root, 'fixtures', 'search.test.mjs'), path.join(workspace, 'search.test.mjs'));
        Object.assign(state, {
          caseId, workspace, beforeSource: fs.readFileSync(path.join(workspace, 'search.mjs'), 'utf8'),
          baseline: runTests(workspace), stage: 'hypothesis'
        });
        event = 'Started the case and executed the baseline tests';
        break;
      }
      case 'hypothesis':
        requireStage(state, 'hypothesis');
        state.hypothesis = text(operation.quote, 'Your hypothesis');
        state.stage = 'explanation';
        event = 'Recorded the developer’s initial hypothesis';
        break;
      case 'explain': {
        requireStage(state, 'explanation');
        if (!Array.isArray(operation.terms) || operation.terms.length < 1 || operation.terms.length > 6) throw new Error('Explain one to six relevant terms.');
        if (!Array.isArray(operation.annotations) || operation.annotations.length < 1 || operation.annotations.length > 6) throw new Error('Provide one to six source annotations.');
        const maxLine = state.beforeSource.trimEnd().split('\n').length;
        state.explanation = {
          summary: text(operation.summary, 'Source-backed explanation'),
          terms: operation.terms.map(term => ({ term: text(term.term, 'Term', 100), meaning: text(term.meaning, 'Meaning', 1000) })),
          annotations: operation.annotations.map(item => {
            if (!Number.isInteger(item.line) || item.line < 1 || item.line > maxLine) throw new Error('Each annotation must point to a real source line.');
            return { line: item.line, meaning: text(item.meaning, 'Line explanation', 1000) };
          })
        };
        state.stage = 'prediction';
        event = 'Added an agent explanation grounded in source lines';
        break;
      }
      case 'prediction':
        requireStage(state, 'prediction');
        state.prediction = text(operation.quote, 'Your predicted outcome');
        state.stage = 'choice';
        event = 'Recorded the developer’s prediction before revealing verification';
        break;
      case 'choose':
        requireStage(state, 'choice');
        if (!approaches.some(item => item.id === operation.approach)) throw new Error('Choose one of the supported approaches.');
        state.choice = { approach: operation.approach, quote: text(operation.quote, 'Your choice and reason') };
        state.stage = 'implementation';
        event = 'Recorded the developer’s selected approach and rationale';
        break;
      case 'implement':
        requireStage(state, 'implementation');
        fs.copyFileSync(path.join(root, 'fixtures', `${state.choice.approach}.mjs`), path.join(state.workspace, 'search.mjs'));
        state.afterSource = fs.readFileSync(path.join(state.workspace, 'search.mjs'), 'utf8');
        state.verification = runTests(state.workspace);
        state.stage = state.verification.passed ? 'teachback' : 'implementation';
        event = state.verification.passed ? 'Applied the selected demo patch and executed passing tests' : 'Verification failed; no completion claimed';
        break;
      case 'teachback':
        requireStage(state, 'teachback');
        state.teachback = {
          quote: text(operation.quote, 'Your explanation of the fix'),
          testLimit: text(operation.testLimit, 'What the checks do not establish')
        };
        state.stage = 'complete';
        state.receipt = receipt(state);
        fs.writeFileSync(path.join(dir, 'decision-receipt.md'), state.receipt, { mode: 0o600 });
        event = 'Recorded the developer’s explanation and exported the decision receipt';
        break;
      default: throw new Error('Unknown operation; no data changed.');
    }
    state.revision++;
    state.updatedAt = new Date().toISOString();
    state.history.push({ at: state.updatedAt, source, type: operation.type, description: event });
    const temporary = path.join(dir, `state.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, path.join(dir, 'state.json'));
    return context(dir);
  });
}
export function context(dir = directory()) {
  const state = read(dir);
  const reveal = stages.indexOf(state.stage) >= stages.indexOf('choice');
  return {
    ...state, issue, stages,
    baseline: reveal ? state.baseline : undefined,
    approaches: reveal ? approaches : [],
    next: {
      not_started: 'Start the demo case.',
      hypothesis: 'Developer: what might cause this? A rough guess or “I don’t know” is welcome.',
      explanation: 'Agent: read the source and record a plain-language explanation with terms and real line references. Do not implement.',
      prediction: 'Developer: predict the display after A starts, B starts, B finishes, A finishes.',
      choice: 'Developer: review the evidence and alternatives; choose an approach and explain why.',
      implementation: 'Agent: apply only the selected demo patch and execute the tests.',
      teachback: 'Developer: explain the change in your words and name something the tests do not prove.',
      complete: 'The decision receipt is ready. Participation is recorded, not graded.'
    }[state.stage]
  };
}
