'use strict';
const KEY = 'fbf-settings';
const DEFAULTS = { ads: true, suggestions: true, politics: true, extraKeywords: [], allowKeywords: [] };
const $ = id => document.getElementById(id);
const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);

function save() {
  const value = {
    ads: $('ads').checked,
    suggestions: $('suggestions').checked,
    politics: $('politics').checked,
    extraKeywords: lines($('extraKeywords').value),
    allowKeywords: lines($('allowKeywords').value),
  };
  chrome.storage.sync.set({ [KEY]: value }, () => { $('status').textContent = 'Saved'; });
}

chrome.storage.sync.get(KEY, got => {
  const s = Object.assign({}, DEFAULTS, got && got[KEY]);
  for (const id of ['ads', 'suggestions', 'politics']) $(id).checked = s[id];
  $('extraKeywords').value = s.extraKeywords.join('\n');
  $('allowKeywords').value = s.allowKeywords.join('\n');
  document.querySelectorAll('section:first-of-type input,section:first-of-type textarea').forEach(e => e.addEventListener('change', save));
});

// ---- Blocks ----

let blocks = [];
let editing = null; // id of the row being edited
let opened = new Set(); // ids whose details are showing

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const k of kids) e.append(k);
  return e;
}

function say(msg) { $('error').textContent = msg || ''; }

async function reload() {
  blocks = await FBFStore.list();
  blocks.sort((a, b) => b.id - a.id);
  render();
}

function visible() {
  const q = FBFRules.norm($('search').value);
  return blocks.filter(b => !q || FBFRules.norm(b.value).includes(q) || FBFRules.norm(b.note).includes(q) || b.kind.includes(q));
}

function button(text, onclick, cls) { return el('button', { type: 'button', textContent: text, onclick, className: cls || '' }); }

async function act(fn) {
  const r = await fn();
  if (r && r.ok === false) { say(r.error); return; }
  say('');
  await reload();
}

function viewRow(b) {
  const on = el('input', { type: 'checkbox', checked: b.enabled !== false, title: 'Enabled' });
  on.addEventListener('change', () => act(() => FBFStore.update(b.id, { enabled: on.checked })));
  const tr = el('tr', { className: b.enabled === false ? 'off' : '' },
    el('td', { className: 'on' }, on),
    el('td', { textContent: b.kind }),
    el('td', { className: 'value', textContent: b.value }),
    el('td', { textContent: b.note || '' }),
    el('td', { textContent: (b.created_at || '').slice(0, 10), title: b.created_at || '' }),
    el('td', { className: 'actions' },
      button('Details', () => { opened.has(b.id) ? opened.delete(b.id) : opened.add(b.id); render(); }),
      ' ', button('Edit', () => { editing = b.id; say(''); render(); }),
      ' ', button('Delete', () => {
        if (confirm('Delete this block?\n\n' + b.kind + ': ' + b.value)) { opened.delete(b.id); act(() => FBFStore.remove(b.id)); }
      }, 'danger')));
  return tr;
}

function editRow(b) {
  const kind = el('select', {}, el('option', { value: 'source', textContent: 'source' }), el('option', { value: 'text', textContent: 'text' }));
  kind.value = b.kind;
  const value = el('input', { type: 'text', value: b.value });
  const note = el('input', { type: 'text', value: b.note || '' });
  const finish = () => { editing = null; render(); };
  return el('tr', {},
    el('td', { className: 'on' }),
    el('td', {}, kind),
    el('td', { className: 'value' }, value),
    el('td', {}, note),
    el('td', { textContent: (b.created_at || '').slice(0, 10) }),
    el('td', { className: 'actions' },
      button('Save', async () => {
        const r = await FBFStore.update(b.id, { kind: kind.value, value: value.value, note: note.value });
        if (!r.ok) { say(r.error); return; }
        say(''); editing = null; await reload();
      }),
      ' ', button('Cancel', finish)));
}

function detailRow(b) {
  const td = el('td', { colSpan: 6 }, el('pre', { textContent: JSON.stringify({ page: b.page, updated_at: b.updated_at, shape: b.shape }, null, 2) }));
  return el('tr', {}, td);
}

function render() {
  const list = visible();
  const body = $('rows');
  body.replaceChildren();
  for (const b of list) {
    body.append(b.id === editing ? editRow(b) : viewRow(b));
    if (opened.has(b.id)) body.append(detailRow(b));
  }
  $('empty').hidden = blocks.length > 0;
  const noun = blocks.length === 1 ? ' block' : ' blocks';
  $('count').textContent = list.length === blocks.length ? blocks.length + noun : list.length + ' of ' + blocks.length + noun;
}

$('addForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const r = await FBFStore.add({ kind: $('addKind').value, value: $('addValue').value, note: $('addNote').value });
  if (!r.ok) { say(r.error); return; }
  say(r.duplicate ? 'Already blocked.' : '');
  $('addValue').value = '';
  $('addNote').value = '';
  await reload();
});

$('search').addEventListener('input', render);

function download(name, blob) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

$('exportSql').addEventListener('click', () => {
  download('fb-bs-blocker-' + stamp() + '.sql', new Blob([FBFExport.toSql(blocks)], { type: 'text/plain' }));
});

$('exportSqlite').addEventListener('click', async () => {
  const btn = $('exportSqlite');
  btn.disabled = true;
  say('Building the database...');
  try {
    const { default: init } = await import('./vendor/sqlite-wasm/index.mjs');
    const sqlite3 = await init();
    const db = new sqlite3.oo1.DB(':memory:');
    try {
      db.exec(FBFExport.toSql(blocks));
      const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
      download('fb-bs-blocker-' + stamp() + '.sqlite', new Blob([bytes], { type: 'application/vnd.sqlite3' }));
    } finally { db.close(); }
    say('');
  } catch (e) {
    say('Export failed: ' + (e && e.message || e));
  } finally { btn.disabled = false; }
});

// A block added from a Facebook tab arrives while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FBFStore.PUBLISHED] && editing === null) reload();
});

reload().then(() => FBFStore.publish());
