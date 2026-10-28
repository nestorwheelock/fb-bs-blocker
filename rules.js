'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBFRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Blocks the person made by hand, or with the button over a post. Two kinds:
  //   source  the exact name of the author, page or group a post opens with
  //   text    a phrase the post contains
  // `lines` here are a post's text lines with the decoy "Facebook" lines already dropped.

  const KINDS = ['source', 'text'];
  const MIN_SOURCE = 2;
  // A short phrase would match half the feed. This is the shortest a text block may be.
  const MIN_TEXT = 8;
  const KEY_LEN = 40;

  function norm(s) {
    return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  const TIME_LINE = /^\d+\s*(s|m|h|d|w|y|sec|min|mins|hr|hrs|hours?|minutes?|days?|weeks?)\b|\bago$|^yesterday\b/i;

  // The first line that reads like the post's own words: long enough, has a space, and is not
  // the "3 hours ago" line. Empty when the post has no text (a photo on its own).
  function textKey(lines) {
    for (const l of lines.slice(1, 14)) {
      if (l.length >= 25 && /\s/.test(l) && !TIME_LINE.test(l)) return norm(l).slice(0, KEY_LEN).trim();
    }
    return '';
  }

  // A short stable hash of a string, for the post's structure signature.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // What is recorded about a post when it is blocked: enough to see later why it matched, and
  // to compare posts, without keeping the whole post.
  function shapeOf(p) {
    const lines = p.lines || [];
    return {
      author: lines[0] || '',
      lines: lines.slice(0, 12),
      text_key: textKey(lines),
      structure: p.structure || '',
      rect: p.rect || null,
      hidden_reason: p.hiddenReason || null,
      page: p.page || '',
    };
  }

  function validate(rule) {
    if (!rule || KINDS.indexOf(rule.kind) < 0) return { ok: false, error: 'Kind must be source or text.' };
    const v = norm(rule.value);
    if (rule.kind === 'source' && v.length < MIN_SOURCE) return { ok: false, error: 'A source name needs at least ' + MIN_SOURCE + ' characters.' };
    if (rule.kind === 'text' && v.length < MIN_TEXT) return { ok: false, error: 'A text block needs at least ' + MIN_TEXT + ' characters, or it would match too much.' };
    return { ok: true, error: '' };
  }

  const clean = v => String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();

  // A new stored block from user input, or an error. `now` is an ISO time string.
  function makeBlock(input, now) {
    const v = validate(input);
    if (!v.ok) return { ok: false, error: v.error };
    return {
      ok: true,
      block: {
        kind: input.kind,
        value: clean(input.value),
        note: String(input.note || '').slice(0, 500),
        enabled: input.enabled !== false,
        created_at: now,
        updated_at: now,
        page: input.page || null,
        shape: input.shape || null,
      },
    };
  }

  // An edit applied to a stored block: only kind, value, note and enabled can change.
  function applyEdit(block, changes, now) {
    const next = Object.assign({}, block);
    for (const f of ['kind', 'value', 'note', 'enabled']) if (changes && f in changes) next[f] = changes[f];
    const v = validate(next);
    if (!v.ok) return { ok: false, error: v.error };
    next.value = clean(next.value);
    next.note = String(next.note || '').slice(0, 500);
    next.enabled = next.enabled !== false;
    next.updated_at = now;
    return { ok: true, block: next };
  }

  // What the page script needs of a block; the shape and note stay in the store.
  function publicRule(b) {
    return { id: b.id, kind: b.kind, value: b.value, enabled: b.enabled !== false };
  }

  // The first enabled rule a post matches, or null.
  function match(lines, text, rules) {
    const t = norm(text);
    const head = lines.slice(0, 8).map(norm);
    for (const r of rules || []) {
      if (!r || r.enabled === false) continue;
      const v = norm(r.value);
      if (!v) continue;
      if (r.kind === 'source' && head.indexOf(v) >= 0) return r;
      if (r.kind === 'text' && v.length >= MIN_TEXT && t.indexOf(v) >= 0) return r;
    }
    return null;
  }

  return { KINDS, MIN_TEXT, MIN_SOURCE, norm, textKey, fnv1a, shapeOf, validate, makeBlock, applyEdit, publicRule, match };
});
