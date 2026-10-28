'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBFExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // The block list as SQL text. The same text is loaded into sqlite-wasm to make a .sqlite
  // file, or saved as it is for `sqlite3 blocks.sqlite < blocks.sql`.

  const SCHEMA =
    'CREATE TABLE blocks (\n' +
    '  id         INTEGER PRIMARY KEY,\n' +
    "  kind       TEXT    NOT NULL CHECK (kind IN ('source', 'text')),\n" +
    '  value      TEXT    NOT NULL,\n' +
    "  note       TEXT    NOT NULL DEFAULT '',\n" +
    '  enabled    INTEGER NOT NULL DEFAULT 1,\n' +
    '  created_at TEXT    NOT NULL,\n' +
    '  updated_at TEXT    NOT NULL,\n' +
    '  page       TEXT,\n' +
    '  shape_json TEXT\n' +
    ');\n';

  function q(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') return String(Math.trunc(v));
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  function toSql(blocks) {
    let sql = 'BEGIN;\n' + SCHEMA;
    for (const b of blocks || []) {
      const cols = [b.id, b.kind, b.value, b.note || '', b.enabled === false ? 0 : 1,
        b.created_at || '', b.updated_at || b.created_at || '', b.page || null,
        b.shape ? JSON.stringify(b.shape) : null];
      sql += 'INSERT INTO blocks (id, kind, value, note, enabled, created_at, updated_at, page, shape_json) VALUES (' +
        cols.map(q).join(', ') + ');\n';
    }
    return sql + 'COMMIT;\n';
  }

  return { toSql, SCHEMA };
});
