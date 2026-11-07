import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearch } from './search.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('a slower old response must not replace results for the latest query', async () => {
  const old = deferred(), latest = deferred(), displayed = [];
  const search = createSearch(query => query === 'ca' ? old.promise : latest.promise, value => displayed.push(value));
  const first = search('ca'), second = search('cats');
  latest.resolve(['cats']);
  await second;
  old.resolve(['cars']);
  await first;
  assert.deepEqual(displayed, [['cats']]);
});

test('sequential searches still display each completed result', async () => {
  const displayed = [];
  const search = createSearch(async query => [query], value => displayed.push(value));
  await search('ca');
  await search('cats');
  assert.deepEqual(displayed, [['ca'], ['cats']]);
});

test('a failed latest request does not make an old response current again', async () => {
  const old = deferred(), latest = deferred(), displayed = [];
  const search = createSearch(query => query === 'ca' ? old.promise : latest.promise, value => displayed.push(value));
  const first = search('ca');
  const second = search('cats');
  const rejection = assert.rejects(second, /offline/);
  latest.reject(new Error('offline'));
  await rejection;
  old.resolve(['cars']);
  await first;
  assert.deepEqual(displayed, []);
});

test('a cancellable transport can abort the old request without failing the new one', async () => {
  const requests = new Map(), displayed = [];
  const search = createSearch((query, options) => {
    const request = deferred();
    options?.signal?.addEventListener('abort', () => request.reject(new DOMException('Cancelled', 'AbortError')));
    requests.set(query, request);
    return request.promise;
  }, value => displayed.push(value));
  const first = search('ca'), second = search('cats');
  requests.get('cats').resolve(['cats']);
  await second;
  requests.get('ca').resolve(['cars']);
  await first;
  assert.deepEqual(displayed, [['cats']]);
});
