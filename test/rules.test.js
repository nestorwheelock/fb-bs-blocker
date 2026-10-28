'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const R = require('../rules.js');
const { toSql } = require('../export.js');

const post = ['Frank Proctor', '·', 'Follow', '13 minutes ago', 'Obviously something nefarious is happening and I am not being made aware.'];

test('textKey skips the author, the time line and short lines', () => {
  assert.equal(R.textKey(post), 'obviously something nefarious is happeni', 'capped at 40 characters');
  assert.equal(R.textKey(['Page', '3 hours ago', 'short']), '');
  assert.equal(R.textKey(['Page', '21 hours ago', 'A line that reads like the actual words of a post']), 'a line that reads like the actual words');
});

test('shapeOf records author, lines, text key, structure and page', () => {
  const s = R.shapeOf({ lines: post, structure: 'abc123', rect: { w: 530, h: 900 }, hiddenReason: null, page: '/' });
  assert.equal(s.author, 'Frank Proctor');
  assert.equal(s.lines.length, 5);
  assert.equal(s.text_key, 'obviously something nefarious is happeni');
  assert.deepEqual(s.rect, { w: 530, h: 900 });
  assert.equal(s.structure, 'abc123');
});

test('fnv1a is stable and distinguishes inputs', () => {
  assert.equal(R.fnv1a('div|0|3'), R.fnv1a('div|0|3'));
  assert.notEqual(R.fnv1a('div|0|3'), R.fnv1a('div|0|4'));
  assert.match(R.fnv1a('x'), /^[0-9a-f]{8}$/);
});

test('validate refuses a kind it does not know and values too short to be safe', () => {
  assert.equal(R.validate({ kind: 'source', value: 'Frank Proctor' }).ok, true);
  assert.equal(R.validate({ kind: 'source', value: ' a ' }).ok, false);
  assert.equal(R.validate({ kind: 'text', value: 'short' }).ok, false);
  assert.equal(R.validate({ kind: 'text', value: 'a phrase long enough' }).ok, true);
  assert.equal(R.validate({ kind: 'regex', value: 'whatever you like' }).ok, false);
  assert.equal(R.validate(null).ok, false);
});

test('a source rule matches the exact name in the first lines only', () => {
  const rules = [{ id: 1, kind: 'source', value: 'frank proctor', enabled: true }];
  assert.equal(R.match(post, post.join(' '), rules).id, 1);
  assert.equal(R.match(['Sam Lee', 'Frank Proctor commented'], 'x', rules), null, 'a longer line is not the name');
  const far = ['Sam', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'Frank Proctor'];
  assert.equal(R.match(far, far.join(' '), rules), null, 'the ninth line is not authorship');
});

test('a text rule matches a phrase anywhere in the post, ignoring case and spacing', () => {
  const rules = [{ id: 2, kind: 'text', value: 'Something   NEFARIOUS is happening', enabled: true }];
  assert.equal(R.match(post, post.join('\n'), rules).id, 2);
  assert.equal(R.match(['Sam Lee', 'nothing here'], 'nothing here', rules), null);
});

test('disabled rules and too-short text rules never match', () => {
  assert.equal(R.match(post, post.join(' '), [{ id: 3, kind: 'source', value: 'Frank Proctor', enabled: false }]), null);
  assert.equal(R.match(post, post.join(' '), [{ id: 4, kind: 'text', value: 'the', enabled: true }]), null);
  assert.equal(R.match(post, post.join(' '), []), null);
});

test('toSql quotes awkward values and loads into the real sqlite3', (t) => {
  const probe = spawnSync('sqlite3', ['--version']);
  if (probe.error || probe.status !== 0) { t.skip('sqlite3 binary not found'); return; }
  const blocks = [
    { id: 1, kind: 'source', value: "O'Brien", note: 'line one\nline two', enabled: true, created_at: '2026-10-28T10:00:00Z', updated_at: '2026-10-28T10:00:00Z', page: '/', shape: { author: "O'Brien", lines: ['a', "b'c"] } },
    { id: 2, kind: 'text', value: 'a phrase; DROP TABLE blocks; --', note: '', enabled: false, created_at: '2026-10-28T10:01:00Z' },
  ];
  const sql = toSql(blocks) +
    'SELECT count(*), sum(enabled) FROM blocks;\n' +
    "SELECT value || '|' || json_extract(shape_json, '$.lines[1]') FROM blocks WHERE id = 1;\n" +
    'SELECT value FROM blocks WHERE id = 2;\n' +
    "SELECT replace(note, char(10), '~') FROM blocks WHERE id = 1;\n";
  const r = spawnSync('sqlite3', [':memory:'], { input: sql, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), ['2|1', "O'Brien|b'c", 'a phrase; DROP TABLE blocks; --', 'line one~line two']);
});

test('toSql of an empty list is a valid empty table', (t) => {
  const probe = spawnSync('sqlite3', ['--version']);
  if (probe.error || probe.status !== 0) { t.skip('sqlite3 binary not found'); return; }
  const r = spawnSync('sqlite3', [':memory:'], { input: toSql([]) + 'SELECT count(*) FROM blocks;\n', encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '0');
});

test('makeBlock normalizes the value and refuses an invalid one', () => {
  const r = R.makeBlock({ kind: 'source', value: '  Frank   Proctor ', note: 'n' }, '2026-10-28T10:00:00Z');
  assert.equal(r.ok, true);
  assert.equal(r.block.value, 'Frank Proctor');
  assert.equal(r.block.enabled, true);
  assert.equal(r.block.created_at, r.block.updated_at);
  assert.equal(R.makeBlock({ kind: 'text', value: 'tiny' }, 'x').ok, false);
});

test('applyEdit changes only the allowed fields and validates the result', () => {
  const b = { id: 7, kind: 'source', value: 'Frank Proctor', note: '', enabled: true, created_at: 'a', updated_at: 'a', shape: { x: 1 } };
  const r = R.applyEdit(b, { value: 'Someone Else', id: 99, created_at: 'zzz', enabled: false }, 'b');
  assert.equal(r.ok, true);
  assert.equal(r.block.id, 7);
  assert.equal(r.block.created_at, 'a');
  assert.equal(r.block.updated_at, 'b');
  assert.equal(r.block.value, 'Someone Else');
  assert.equal(r.block.enabled, false);
  assert.deepEqual(r.block.shape, { x: 1 });
  assert.equal(R.applyEdit(b, { kind: 'text', value: 'short' }, 'b').ok, false);
});

test('publicRule keeps only what the page script needs', () => {
  assert.deepEqual(R.publicRule({ id: 1, kind: 'text', value: 'v v v v v', note: 'n', shape: {}, enabled: false }),
    { id: 1, kind: 'text', value: 'v v v v v', enabled: false });
});
