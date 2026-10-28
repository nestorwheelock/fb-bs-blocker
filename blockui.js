(function () {
  'use strict';
  // A button that floats over the post under the pointer. Its menu blocks the post's text or its
  // source; the request goes to the background worker, which keeps the block list.

  const HIDDEN = 'data-fbf-hidden';
  const LEAVE_MS = 400;
  const SOURCE_MAX = 80;
  // Facebook's fixed top bar is about this tall; the button stays below it.
  const TOP_BAR = 56;

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;display:none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    'button{font:13px system-ui,sans-serif;cursor:pointer;border:0;color:#fff;background:#b3261e;' +
    'border-radius:6px;padding:6px 9px;display:flex;align-items:center;gap:6px;box-shadow:0 1px 4px rgba(0,0,0,.45)}' +
    'button:hover{background:#8c1d18}' +
    'svg{width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round}' +
    '.menu{display:none;margin-top:4px;background:#fff;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.4);overflow:hidden}' +
    '.menu button{display:block;width:100%;background:#fff;color:#111;border-radius:0;box-shadow:none;text-align:left;white-space:nowrap}' +
    '.menu button:hover{background:#eee}' +
    '.menu button[disabled]{color:#888;cursor:default}' +
    '.open .menu{display:block}' +
    '</style>' +
    '<div class="wrap"><button class="main" type="button" title="Block with fb-bs-blocker">' +
    '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M3.8 12.2L12.2 3.8"/></svg><span>Block</span></button>' +
    '<div class="menu"><button class="text" type="button">Block this post</button>' +
    '<button class="source" type="button">Block this source</button></div></div>';
  const wrap = root.querySelector('.wrap');
  const mainBtn = root.querySelector('.main');
  const label = mainBtn.querySelector('span');
  const textBtn = root.querySelector('.text');
  const sourceBtn = root.querySelector('.source');

  let current = null;
  let leaveTimer = null;

  function alive() { return !!(chrome.runtime && chrome.runtime.id); }

  function postLines(el) {
    const prev = el.getAttribute(HIDDEN);
    if (prev !== null) el.removeAttribute(HIDDEN);
    const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (prev !== null) el.setAttribute(HIDDEN, prev);
    return FBF.readLines(lines);
  }

  // The kind and nesting of the post's first elements, hashed: lets two posts of one layout be
  // compared later without keeping the markup. Class names are left out; Facebook generates them.
  function structureOf(el) {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
    let n = walker.currentNode;
    for (let i = 0; n && i < 300; i++, n = walker.nextNode()) {
      let depth = 0;
      for (let p = n; p && p !== el; p = p.parentElement) depth++;
      parts.push(n.tagName.toLowerCase() + depth + (n.getAttribute('role') ? ':' + n.getAttribute('role') : ''));
    }
    return FBFRules.fnv1a(parts.join('|'));
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    if (r.bottom < TOP_BAR + 40 || r.top > innerHeight - 40 || r.width < 100) { host.style.display = 'none'; return; }
    host.style.display = 'block';
    host.style.top = Math.max(r.top + 8, TOP_BAR + 8) + 'px';
    host.style.left = Math.max(Math.min(r.right - 90, innerWidth - 110), 8) + 'px';
  }

  function show(el) {
    if (current !== el) {
      current = el;
      wrap.classList.remove('open');
      label.textContent = 'Block';
      const lines = postLines(el);
      const src = lines[0] || '';
      sourceBtn.disabled = !(src.length >= FBFRules.MIN_SOURCE && src.length <= SOURCE_MAX);
      sourceBtn.textContent = sourceBtn.disabled ? 'Block this source' : 'Block source: ' + src.slice(0, 40);
      textBtn.disabled = FBFRules.textKey(lines).length < FBFRules.MIN_TEXT;
    }
    place(el);
  }

  function hideLater() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => { host.style.display = 'none'; wrap.classList.remove('open'); current = null; }, LEAVE_MS);
  }

  function send(kind) {
    if (!current || !alive()) return;
    const el = current;
    const lines = postLines(el);
    const value = kind === 'source' ? lines[0] : FBFRules.textKey(lines);
    const rect = el.getBoundingClientRect();
    const shape = FBFRules.shapeOf({
      lines, structure: structureOf(el), rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
      hiddenReason: el.getAttribute(HIDDEN), page: location.pathname,
    });
    wrap.classList.remove('open');
    chrome.runtime.sendMessage({ type: 'fbf-block-add', kind, value, page: location.pathname, shape }, res => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        label.textContent = 'Failed';
        console.log('[fbf] block failed', (res && res.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message));
        return;
      }
      console.log('[fbf] blocked', kind, '#' + res.block.id, value);
      el.setAttribute(HIDDEN, 'blocked');
      host.style.display = 'none';
      current = null;
    });
  }

  mainBtn.addEventListener('click', () => wrap.classList.toggle('open'));
  textBtn.addEventListener('click', () => send('text'));
  sourceBtn.addEventListener('click', () => send('source'));
  host.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
  host.addEventListener('mouseleave', hideLater);

  document.addEventListener('mouseover', ev => {
    if (!alive()) return;
    if (ev.composedPath().indexOf(host) >= 0) { clearTimeout(leaveTimer); return; }
    const post = ev.target && ev.target.closest ? ev.target.closest('[aria-posinset]') : null;
    if (post && !post.hasAttribute(HIDDEN)) { clearTimeout(leaveTimer); show(post); }
    else hideLater();
  }, true);
  addEventListener('scroll', () => { if (current) place(current); }, true);

  document.documentElement.appendChild(host);
})();
