'use strict';
if (typeof importScripts === 'function') importScripts('rules.js', 'store.js');

// The block button in a Facebook tab sends its request here: the content script cannot reach
// the block store, and only this extension's own scripts may ask.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string') return false;
  if (msg.type === 'fbf-block-add') {
    FBFStore.add({ kind: msg.kind, value: msg.value, note: msg.note, page: msg.page, shape: msg.shape })
      .then(reply, e => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === 'fbf-publish') {
    FBFStore.publish().then(() => reply({ ok: true }), e => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => { FBFStore.publish(); });
chrome.runtime.onStartup.addListener(() => { FBFStore.publish(); });
chrome.action.onClicked.addListener(() => { chrome.runtime.openOptionsPage(); });
