#!/usr/bin/env node
import fs from 'node:fs';
import { apply, context } from '../lib/workflow.mjs';

try {
  const [command, ...rest] = process.argv.slice(2);
  let result;
  if (command === 'context') result = context();
  else if (command === 'apply') result = apply(JSON.parse(rest.length ? rest.join(' ') : fs.readFileSync(0, 'utf8')), undefined, 'switch-tool');
  else if (command === 'receipt') {
    const state = context();
    if (state.stage !== 'complete') throw new Error('The receipt needs the developer’s final explanation first.');
    process.stdout.write(state.receipt);
  } else throw new Error('Usage: node tools/fix.mjs context | apply <JSON> | receipt\napply also accepts JSON on stdin.');
  if (result) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
