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
  document.querySelectorAll('input,textarea').forEach(e => e.addEventListener('change', save));
});
