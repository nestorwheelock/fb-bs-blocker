'use strict';
(function (root) {
  // The block list, in IndexedDB under the extension's own origin. The background worker and
  // the options page share it; content scripts cannot reach it (theirs would be the page's), so
  // publish() copies what they need into chrome.storage.local.

  const DB = 'fbf-blocks';
  const STORE = 'blocks';
  const PUBLISHED = 'fbf-rules';
  let opened = null;

  function open() {
    if (opened) return opened;
    opened = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opened = null; reject(req.error); };
    });
    return opened;
  }

  function run(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let out;
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => reject(tx.error);
      out = fn(tx.objectStore(STORE), v => { out = v; });
    }));
  }

  const asPromise = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

  function list() { return open().then(db => asPromise(db.transaction(STORE).objectStore(STORE).getAll())); }
  function get(id) { return open().then(db => asPromise(db.transaction(STORE).objectStore(STORE).get(id))); }

  // -> { ok, block } or { ok:false, error }. A second block with the same kind and value is
  // not added; the existing one is returned with duplicate:true.
  async function add(input) {
    const made = FBFRules.makeBlock(input, new Date().toISOString());
    if (!made.ok) return made;
    const key = FBFRules.norm(made.block.value);
    const existing = (await list()).find(b => b.kind === made.block.kind && FBFRules.norm(b.value) === key);
    if (existing) return { ok: true, block: existing, duplicate: true };
    await run('readwrite', s => { s.add(made.block).onsuccess = e => { made.block.id = e.target.result; }; });
    await publish();
    return { ok: true, block: made.block };
  }

  async function update(id, changes) {
    const cur = await get(id);
    if (!cur) return { ok: false, error: 'No such block.' };
    const r = FBFRules.applyEdit(cur, changes, new Date().toISOString());
    if (!r.ok) return r;
    await run('readwrite', s => { s.put(r.block); });
    await publish();
    return r;
  }

  async function remove(id) {
    await run('readwrite', s => { s.delete(id); });
    await publish();
    return { ok: true };
  }

  async function clear() {
    await run('readwrite', s => { s.clear(); });
    await publish();
    return { ok: true };
  }

  // Copy the rules content scripts apply into chrome.storage.local, where they can read them.
  async function publish() {
    const rules = (await list()).map(FBFRules.publicRule);
    await chrome.storage.local.set({ [PUBLISHED]: rules });
    return rules;
  }

  root.FBFStore = { list, get, add, update, remove, clear, publish, PUBLISHED };
})(typeof self !== 'undefined' ? self : this);
