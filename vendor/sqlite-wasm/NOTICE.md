# sqlite-wasm

Vendored, unmodified, to write the blocked-rules export as a real SQLite database file.

- package: `@sqlite.org/sqlite-wasm` 3.54.1-build1
- source: https://github.com/sqlite/sqlite-wasm (https://www.npmjs.com/package/@sqlite.org/sqlite-wasm)
- files: `dist/index.mjs` as `index.mjs`, `dist/sqlite3.wasm` as `sqlite3.wasm`
- license of the package: Apache-2.0, text in `LICENSE-Apache-2.0`
- `index.mjs` carries SQLite's own license notice at its top (SQLite is in the public domain;
  the Emscripten glue code is MIT)

The rest of this repository is BSD 2-Clause (`../../LICENSE`).
