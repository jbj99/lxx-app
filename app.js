(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortName = b => /Old Greek|Theodotion/.test(b.en) ? b.en : b.en.replace(/\s*\(.*\)\s*/, '');

function greekNum(n) {
  if (n <= 0 || n >= 1000) return String(n);
  const U = ['', 'α', 'β', 'γ', 'δ', 'ε', 'ϛ', 'ζ', 'η', 'θ'];
  const T = ['', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ϟ'];
  const H = ['', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'ϡ'];
  return H[Math.floor(n / 100)] + T[Math.floor(n / 10) % 10] + U[n % 10] + '\u0374';
}

/* ---------- state ---------- */
let BOOKS = [], BY = {};
const settings = Object.assign({ en: true, size: 21, theme: 'classic', layout: 'lines', words: true }, store.get('lxx.settings', {}));
if (!settings.styleV2) { settings.theme = 'classic'; settings.styleV2 = true; }   // Classic is the default style; applied once to existing installs
let cur = null;            // { code, ch, v, data }
let selected = null;       // selected verse element
let navBook = null;        // book shown in the chapter grid inside the nav sheet
const lru = new Map();
let LEX = null;

/* ---------- data loading ---------- */
async function loadBook(code) {
  if (lru.has(code)) { const d = lru.get(code); lru.delete(code); lru.set(code, d); return d; }
  const res = await fetch(`data/${code}.json`);
  if (!res.ok) throw new Error('Could not load ' + code);
  const d = await res.json();
  lru.set(code, d);
  while (lru.size > 4) lru.delete(lru.keys().next().value);
  return d;
}

async function fetchJSON(url) {
  let res;
  try { res = await fetch(url); }
  catch { const e = new Error(`${url}: could not be fetched (offline, or blocked)`); e.file = url; throw e; }
  if (!res.ok) { const e = new Error(`${url}: HTTP ${res.status}`); e.file = url; throw e; }
  try { return await res.json(); }
  catch { const e = new Error(`${url}: the file is damaged or incomplete`); e.file = url; throw e; }
}
let LEMALL = null;
async function loadLem(code) {
  if (!LEMALL) LEMALL = await fetchJSON('data/lem.json');
  if (!LEMALL[code]) { const e = new Error(`data/lem.json: no word data for ${code}`); e.file = 'data/lem.json'; throw e; }
  return { c: LEMALL[code] };
}
async function loadLex() {
  if (LEX) return LEX;
  LEX = await fetchJSON('data/lex.json');
  return LEX;
}

/* ---------- settings ---------- */
function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.setProperty('--size', settings.size + 'px');
  document.body.classList.toggle('en-on', settings.en);
  document.body.classList.toggle('flow', settings.layout === 'flow');
  document.body.classList.toggle('words', settings.words);
  $$('#wordsSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === (settings.words ? 'on' : 'off'))));
  $('#enBtn').setAttribute('aria-checked', String(settings.en));
  $('#sizeRange').value = settings.size;
  $$('#themeSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === settings.theme)));
  $$('#layoutSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === settings.layout)));
  const paper = getComputedStyle(root).getPropertyValue('--wood').trim();
  if (paper) $('meta[name="theme-color"]').setAttribute('content', paper);
  store.set('lxx.settings', settings);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (settings.theme === 'auto') applySettings(); });

/* ---------- routing ---------- */
function parseHash() {
  const m = location.hash.match(/^#([A-Za-z0-9]+)\.(\d+)(?:\.(\d+))?$/);
  return m && BY[m[1]] ? { code: m[1], ch: +m[2], v: m[3] ? +m[3] : null } : null;
}
function navigate(code, ch, v) {
  const h = `#${code}.${ch}${v ? '.' + v : ''}`;
  closeSheets();
  if (location.hash === h) show(code, ch, v); else location.hash = h;
}
window.addEventListener('hashchange', () => { const p = parseHash(); if (p) show(p.code, p.ch, p.v); });

function neighbor(code, ch, dir) {
  const i = BOOKS.findIndex(b => b.code === code), b = BOOKS[i], ci = b.chapters.indexOf(ch);
  if (dir < 0) {
    if (ci > 0) return { code, ch: b.chapters[ci - 1] };
    const p = BOOKS[i - 1]; return p ? { code: p.code, ch: p.chapters[p.chapters.length - 1] } : null;
  }
  if (ci < b.chapters.length - 1) return { code, ch: b.chapters[ci + 1] };
  const n = BOOKS[i + 1]; return n ? { code: n.code, ch: n.chapters[0] } : null;
}

/* ---------- reader ---------- */
let showToken = 0;
async function show(code, ch, v) {
  const token = ++showToken;
  const b = BY[code];
  if (!b.chapters.includes(ch)) ch = b.chapters[0];
  clearSelection(); clearWord();
  $('#refBook').textContent = shortName(b);
  $('#refCh').textContent = ch;
  document.title = `${shortName(b)} ${ch} · Septuagint`;
  let data;
  try { data = await loadBook(code); }
  catch {
    if (token !== showToken) return;
    $('#reader').innerHTML = `<div class="empty">This book isn’t available offline yet and the network can’t be reached.<br><br><button class="chip" id="retry">Try again</button></div>`;
    $('#retry').onclick = () => show(code, ch, v);
    return;
  }
  if (token !== showToken) return;
  const chap = data.chapters.find(c => c.n === ch) || data.chapters[0];
  cur = { code, ch: chap.n, v, data, ci: data.chapters.indexOf(chap) };
  const marks = new Set(store.get('lxx.marks', []).map(m => m.k));
  const notice = b.english ? '' : `<p class="notice">Brenton’s edition has no English for this book, so only the Greek is shown.</p>`;
  let html = `<header class="chap-head"><div class="chap-line"><h1 class="chap-gr" lang="grc">${esc(b.gr)}</h1>
    <span class="chap-num" lang="grc" role="img" aria-label="chapter ${chap.n}">${greekNum(chap.n)}</span></div>
    <p class="chap-en">${esc(shortName(b))} ${chap.n}</p><div class="orn" aria-hidden="true"><i></i></div>${notice}</header>`;
  if (settings.words && !store.get('lxx.hintSeen', false))
    html += `<div class="hint-card" id="wordHint"><span>Tap any Greek word to see what it means.</span><button id="hintOk">Got it</button></div>`;
  html += '<div class="body">';
  chap.v.forEach(([vn, gr, en], vi) => {
    const sv = marks.has(`${code}.${chap.n}.${vn}`) ? ' saved' : '';
    html += `<p class="verse${sv}" data-v="${vn}" data-i="${vi}" id="v${vn}"><span class="vn" role="button" aria-label="Select verse ${vn}">${vn}</span>` +
      `<span class="gr" lang="grc">${esc(gr).split(' ').map(w => `<span class="w">${w}</span>`).join(' ')}</span>` +
      (en ? `<span class="en" lang="en">${esc(en)}</span>` : '') + `</p> `;
  });
  html += '</div>';
  const rd = $('#reader'); rd.innerHTML = html;
  rd.classList.remove('fade'); void rd.offsetWidth; rd.classList.add('fade');
  const hk = $('#hintOk'); if (hk) hk.onclick = dismissHint;
  if (settings.words) { loadLem(code).catch(() => {}); loadLex().catch(() => {}); }

  // pager
  const pv = neighbor(code, chap.n, -1), nx = neighbor(code, chap.n, 1);
  const lbl = n => n ? `${shortName(BY[n.code])} ${n.ch}` : '';
  $('#prevBtn').disabled = !pv; $('#nextBtn').disabled = !nx;
  $('#prevLbl').textContent = lbl(pv); $('#nextLbl').textContent = lbl(nx);

  // position
  store.set('lxx.last', { code, ch: chap.n });
  pushRecent(code, chap.n);
  const el = v && $(`#v${v}`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
  else {
    const sc = store.get('lxx.scroll', null);
    window.scrollTo(0, sc && sc.k === `${code}.${chap.n}` && !show.visited ? sc.y : 0);
  }
  show.visited = true;
}
let scrollTimer;
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { if (cur) store.set('lxx.scroll', { k: `${cur.code}.${cur.ch}`, y: Math.round(window.scrollY) }); }, 250);
}, { passive: true });

function pushRecent(code, ch) {
  let r = store.get('lxx.recent', []).filter(x => !(x.code === code && x.ch === ch));
  r.unshift({ code, ch }); store.set('lxx.recent', r.slice(0, 8));
}

/* ---------- verse selection, copy, bookmarks ---------- */
function clearSelection() { if (selected) selected.classList.remove('sel'); selected = null; $('#verseBar').hidden = true; }
$('#reader').addEventListener('click', e => {
  if (String(window.getSelection())) return;
  const p = e.target.closest('.verse'), w = e.target.closest('.w');
  if (w && p && settings.words) { wordTap(w, p); return; }
  clearWord();
  if (!p) return;
  toggleVerse(p);
});
function toggleVerse(p) {
  if (selected === p) { clearSelection(); return; }
  clearSelection();
  selected = p; p.classList.add('sel');
  const b = BY[cur.code];
  $('#verseBarRef').textContent = `${shortName(b)} ${cur.ch}:${p.dataset.v}`;
  refreshMarkBtn();
  $('#verseBar').hidden = false;
}
function selKey() { return `${cur.code}.${cur.ch}.${selected.dataset.v}`; }
function refreshMarkBtn() { $('#vbMark').textContent = store.get('lxx.marks', []).some(m => m.k === selKey()) ? 'Unsave' : 'Save'; }
$('#vbClose').onclick = clearSelection;
$('#vbMark').onclick = () => {
  let marks = store.get('lxx.marks', []); const k = selKey();
  if (marks.some(m => m.k === k)) { marks = marks.filter(m => m.k !== k); selected.classList.remove('saved'); }
  else { marks.unshift({ k, t: Date.now() }); selected.classList.add('saved'); }
  store.set('lxx.marks', marks); refreshMarkBtn();
};
$('#vbCopy').onclick = async () => {
  const gr = selected.querySelector('.gr').textContent, en = selected.querySelector('.en');
  const text = `${$('#verseBarRef').textContent}\n${gr}` + (settings.en && en ? `\n${en.textContent}` : '');
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  $('#vbCopy').textContent = 'Copied'; setTimeout(() => { $('#vbCopy').textContent = 'Copy'; }, 1200);
};

/* ---------- word meanings ---------- */
let hotEl = null, wordToken = 0;
function dismissHint() { store.set('lxx.hintSeen', true); const h = $('#wordHint'); if (h) h.remove(); }
function clearWord() {
  wordToken++;
  if (hotEl) hotEl.classList.remove('hot'); hotEl = null;
  const c = $('#wordCard'); if (c) c.hidden = true;
}
async function wordTap(w, p) {
  const token = ++wordToken;
  clearSelection(); dismissHint();
  if (hotEl) hotEl.classList.remove('hot');
  hotEl = w; w.classList.add('hot');
  const i = [...p.querySelector('.gr').children].indexOf(w), vi = +p.dataset.i;
  const form = w.textContent.replace(/[^\p{L}\p{M}]/gu, '');
  const card = $('#wordCard');
  let lem, lex;
  try { [lem, lex] = await Promise.all([loadLem(cur.code), loadLex()]); }
  catch (err) {
    window.__wordErr = err;
    if (token !== wordToken) return;
    const why = (window.__wordErr && window.__wordErr.message) || 'unknown problem';
    card.innerHTML = cardShell(`<span class="wc-lemma" lang="grc">${esc(form)}</span>`, '', `<p class="wc-none">The word data couldn’t be loaded.</p><p class="wc-def"><b>${esc(why)}</b></p><p class="wc-def">If this says 404, that file is missing from your site. It should open in your browser at the app’s address followed by that path.</p>`, '');
    card.hidden = false; $('#wcClose').onclick = clearWord; return;
  }
  if (token !== wordToken) return;
  const cell = ((lem.c[cur.ci] || [])[vi] || '').split(' ')[i];
  const id = cell && cell !== '-' ? parseInt(cell, 36) : null, e = id != null ? lex[id] : null;
  if (!e) {
    card.innerHTML = cardShell(`<span class="wc-lemma" lang="grc">${esc(form)}</span>`, '', `<p class="wc-none">No dictionary entry was matched to this word.</p>`, `<button class="btn-ghost" id="wcVerse">Verse…</button>`);
  } else {
    const [lemma, tr, pos, gen, gloss, def, n] = e;
    const meta = [pos, gen].filter(Boolean).join(', ');
    const body = (gloss ? `<p class="wc-gloss">${esc(gloss)}</p>` : '') +
      (def ? `<p class="wc-def">${esc(def)}</p>` : (gloss ? '' : `<p class="wc-none">No definition is bundled for this word.</p>`)) +
      `<p class="wc-form">In the text: <b lang="grc">${esc(form)}</b></p>`;
    card.innerHTML = cardShell(`<span class="wc-lemma" lang="grc">${esc(lemma)}</span><span class="wc-tr">${esc(tr)}</span>`,
      `${esc(meta)}${meta ? ' · ' : ''}${n.toLocaleString()} ${n === 1 ? 'use' : 'uses'} in the LXX`, body,
      `<button class="btn-gold" id="wcFind">Find all uses</button><button class="btn-ghost" id="wcVerse">Verse…</button>`);
    $('#wcFind').onclick = () => { clearWord(); openNav('search'); runLemmaSearch(id); };
  }
  card.hidden = false;
  $('#wcClose').onclick = clearWord;
  const vb = $('#wcVerse'); if (vb) vb.onclick = () => { clearWord(); toggleVerse(p); };
}
function cardShell(head, meta, body, actions) {
  return `<div class="wc-top"><div class="wc-head">${head}${meta ? `<div class="wc-meta">${meta}</div>` : ''}</div><button class="wc-close" id="wcClose" aria-label="Close">✕</button></div>` +
    `<div class="wc-body">${body}</div>` + (actions ? `<div class="wc-actions">${actions}</div>` : '');
}

/* ---------- top bar & pager actions ---------- */
$('#enBtn').onclick = () => { settings.en = !settings.en; applySettings(); };
$('#prevBtn').onclick = () => { const n = cur && neighbor(cur.code, cur.ch, -1); if (n) navigate(n.code, n.ch); };
$('#nextBtn').onclick = () => { const n = cur && neighbor(cur.code, cur.ch, 1); if (n) navigate(n.code, n.ch); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSheets(true); clearSelection(); clearWord(); return; }
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) || !$('#scrim').hidden) return;
  if (e.key === 'ArrowLeft') $('#prevBtn').click();
  if (e.key === 'ArrowRight') $('#nextBtn').click();
});
let tx = 0, ty = 0, tt = 0;
document.addEventListener('touchstart', e => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; tt = Date.now(); }, { passive: true });
document.addEventListener('touchend', e => {
  if (!$('#scrim').hidden || String(window.getSelection())) return;
  const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
  if (tx < 28 || tx > innerWidth - 28) return;          // leave edge gestures to Android
  if (Date.now() - tt < 600 && Math.abs(dx) > 90 && Math.abs(dy) < 45) (dx < 0 ? $('#nextBtn') : $('#prevBtn')).click();
}, { passive: true });

/* ---------- sheets ---------- */
let lastFocus = null;
function openSheet(el) {
  lastFocus = document.activeElement;
  $('#scrim').hidden = false; el.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheets(restoreFocus) {
  searchToken++;
  $$('.sheet').forEach(s => s.hidden = true);
  $('#scrim').hidden = true; document.body.style.overflow = '';
  if (restoreFocus === true && lastFocus && lastFocus.focus) lastFocus.focus();
}
$('#scrim').onclick = () => closeSheets(true);
$('#navClose').onclick = () => closeSheets(true);
$('#setClose').onclick = () => closeSheets(true);

/* ---------- navigation sheet ---------- */
function setTab(name) {
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $('#tabBooks').hidden = name !== 'books';
  $('#tabSearch').hidden = name !== 'search';
  $('#tabSaved').hidden = name !== 'saved';
  $('#gotoSuggest').hidden = true;
  if (name === 'saved') renderSaved();
  if (name === 'search') setTimeout(() => $('#searchInput').focus(), 50);
}
$$('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

function openNav(tab = 'books') {
  navBook = cur ? cur.code : null;
  $('#gotoInput').value = '';
  renderBooks();
  setTab(tab);
  openSheet($('#navSheet'));
  $('#navBody').scrollTop = 0;
}
$('#refBtn').onclick = () => openNav('books');

function renderBooks() {
  const box = $('#tabBooks');
  if (navBook) {
    const b = BY[navBook];
    let h = `<div class="crumb"><button class="back" id="backBooks">‹ All books</button><h3>${esc(shortName(b))}<small lang="grc">${esc(b.gr)}</small></h3></div><div class="ch-grid">`;
    for (const n of b.chapters) h += `<button class="ch-btn${cur && cur.code === navBook && cur.ch === n ? ' cur' : ''}" data-ch="${n}">${n}</button>`;
    h += '</div>';
    if (cur && cur.code === navBook) {
      const idx = b.chapters.indexOf(cur.ch);
      h += `<div class="vjump"><p>Jump to a verse in ${esc(shortName(b))} ${cur.ch}</p><div class="v-grid">`;
      for (let i = 1; i <= b.counts[idx]; i++) h += `<button class="v-btn" data-v="${i}">${i}</button>`;
      h += '</div></div>';
    }
    box.innerHTML = h;
    $('#backBooks').onclick = () => { navBook = null; renderBooks(); $('#navBody').scrollTop = 0; };
    $$('.ch-btn', box).forEach(x => x.onclick = () => navigate(navBook, +x.dataset.ch));
    $$('.v-btn', box).forEach(x => x.onclick = () => navigate(cur.code, cur.ch, +x.dataset.v));
    const c = $('.ch-btn.cur', box); if (c) c.scrollIntoView({ block: 'center' });
    return;
  }
  let h = '';
  const rec = store.get('lxx.recent', []).filter(r => BY[r.code]);
  if (rec.length) {
    h += `<h3 class="sec-title">Recent</h3><div class="recent">` +
      rec.map(r => `<button class="chip" data-r="${r.code}.${r.ch}">${esc(shortName(BY[r.code]))} ${r.ch}</button>`).join('') + '</div>';
  }
  for (const sec of ['Law', 'History', 'Poetry and Wisdom', 'Prophets']) {
    h += `<h3 class="sec-title">${sec}</h3><div class="book-grid">`;
    for (const b of BOOKS.filter(x => x.sec === sec))
      {
      const alt = (b.en.match(/\(([^)]*)\)/) || [])[1];
      h += `<button class="book-btn${cur && cur.code === b.code ? ' cur' : ''}" data-b="${b.code}"><span class="b-en">${esc(shortName(b))}</span>` +
        (alt && !/^\d\s*Esdras/.test(alt) ? `<span class="b-alt">${esc(alt)}</span>` : '') +
        `<span class="b-gr" lang="grc">${esc(b.gr)}</span></button>`;
    }
    h += '</div>';
  }
  box.innerHTML = h;
  $$('.book-btn', box).forEach(x => x.onclick = () => { navBook = x.dataset.b; renderBooks(); $('#navBody').scrollTop = 0; });
  $$('.chip[data-r]', box).forEach(x => x.onclick = () => { const [c, n] = x.dataset.r.split('.'); navigate(c, +n); });
}

/* ---------- go-to reference ---------- */
const ALIASES = {
  Gen: 'ge gn', Exo: 'ex exod', Lev: 'lv', Num: 'nm nu', Deu: 'dt dtn deut', Jos: 'josh', Jdg: 'judg jg', Rut: 'ru',
  '1Sa': '1sam 1kgdms 1kingdoms 1reigns', '2Sa': '2sam 2kgdms 2kingdoms 2reigns',
  '1Ki': '1kgs 1kings 3kgdms 3kingdoms 3reigns', '2Ki': '2kgs 2kings 4kgdms 4kingdoms 4reigns',
  '1Ch': '1chr 1par 1paralipomenon', '2Ch': '2chr 2par 2paralipomenon', '1Es': '1esd 1esdras',
  Ezr: 'ezra 2esd 2esdras', Neh: 'ne', Est: 'esth', Jdt: 'judith', Tob: 'tobit tb',
  '1Ma': '1macc 1mac', '2Ma': '2macc 2mac', '3Ma': '3macc 3mac', '4Ma': '4macc 4mac',
  Psa: 'ps psalm psalms pss', Ode: 'odes od odae', Pro: 'prov pr proverbs', Ecc: 'eccl eccles qoh qoheleth',
  Sol: 'song sos sg cant canticles songofsongs songofsolomon', Job: 'jb', Wis: 'wisd wisdom wisdomofsolomon',
  Sir: 'sirach ecclesiasticus bensira', Hos: 'ho', Amo: 'am', Mic: 'mi', Joe: 'joel jl', Oba: 'obad ob', Jon: 'jnh',
  Nah: 'na', Hab: 'hb', Zep: 'zeph zp', Hag: 'hg', Zec: 'zech zc', Mal: 'ml', Isa: 'is', Jer: 'jr',
  Bar: 'ba', Lam: 'la', Epj: 'epjer letterofjeremiah letjer', Eze: 'ezek ezk', Dan: 'dn', Dat: 'theodotion dantheodotion',
  Sus: 'susanna', Bel: 'beldragon belandthedragon'
};
let ALIAS_LIST = [];
function buildAliases() {
  ALIAS_LIST = [];
  const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const b of BOOKS) {
    const set = new Set([key(b.code), key(shortName(b))]);
    const paren = b.en.match(/\(([^)]*)\)/);
    if (paren && /^\d?\s*[A-Za-z ]+$/.test(paren[1])) set.add(key(paren[1]));
    (ALIASES[b.code] || '').split(' ').filter(Boolean).forEach(a => set.add(a));
    set.add(key(b.en.replace(/\(.*\)/, '')));
    for (const a of set) ALIAS_LIST.push({ a, code: b.code });
  }
}
function parseRef(text) {
  let s = text.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/^(iv|iii|ii|i)\s+(?=[a-z])/, (m, r) => ({ i: '1', ii: '2', iii: '3', iv: '4' }[r]) + ' ');
  const m = s.match(/^(\d\s*)?([a-z][a-z ]*?)\s*(?:(\d+)(?:\s*[:,]\s*(\d+)|\s+(\d+))?)?$/);
  if (!m) return null;
  const name = ((m[1] || '') + m[2]).replace(/[^a-z0-9]/g, '');
  const ch = m[3] ? +m[3] : null, v = m[4] || m[5] ? +(m[4] || m[5]) : null;
  const exact = ALIAS_LIST.filter(x => x.a === name).map(x => x.code);
  let codes = exact.length ? exact : ALIAS_LIST.filter(x => x.a.startsWith(name)).map(x => x.code);
  codes = [...new Set(codes)].sort((x, y) => BOOKS.findIndex(b => b.code === x) - BOOKS.findIndex(b => b.code === y));
  return { codes, ch, v };
}
function gotoSuggestions() {
  const r = parseRef($('#gotoInput').value), box = $('#gotoSuggest');
  if (!r || !r.codes.length) { box.hidden = true; box.innerHTML = ''; return null; }
  const list = r.codes.slice(0, 6);
  box.innerHTML = list.map((c, i) => {
    const b = BY[c], label = `${shortName(b)}${r.ch ? ' ' + r.ch : ''}${r.v ? ':' + r.v : ''}`;
    return `<button data-c="${c}" class="${i === 0 ? 'on' : ''}"><span>${esc(label)}</span><span class="sg-gr" lang="grc">${esc(b.gr)}</span></button>`;
  }).join('');
  box.hidden = false;
  $$('button', box).forEach(x => x.onclick = () => pick(x.dataset.c, r));
  return { r, first: list[0] };
}
function pick(code, r) {
  const b = BY[code];
  if (r.ch) {
    if (!b.chapters.includes(r.ch)) { $('#gotoSuggest').innerHTML = `<button disabled><span>${esc(shortName(b))} has chapters ${b.chapters[0]}–${b.chapters[b.chapters.length - 1]}</span></button>`; return; }
    navigate(code, r.ch, r.v);
  } else { navBook = code; setTab('books'); renderBooks(); $('#gotoSuggest').hidden = true; $('#navBody').scrollTop = 0; }
}
function submitGoto() { const s = gotoSuggestions(); if (s) pick(s.first, s.r); }
$('#gotoInput').addEventListener('input', gotoSuggestions);
$('#gotoInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitGoto(); } });
$('#gotoBtn').onclick = submitGoto;

/* ---------- saved verses ---------- */
async function renderSaved() {
  const box = $('#tabSaved'), marks = store.get('lxx.marks', []);
  if (!marks.length) { box.innerHTML = `<div class="empty">No saved verses yet.<br>Tap a verse while reading, then choose Save.</div>`; return; }
  let h = '';
  for (const m of marks) {
    const [code, ch, v] = m.k.split('.');
    if (!BY[code]) continue;
    let gr = '', en = '';
    try {
      const d = await loadBook(code), c = d.chapters.find(x => x.n === +ch), row = c && c.v.find(x => x[0] === +v);
      if (row) { gr = row[1]; en = row[2]; }
    } catch {}
    h += `<div class="saved-item"><button class="result" data-k="${m.k}"><span class="r-ref">${esc(shortName(BY[code]))} ${ch}:${v}</span><span class="r-gr" lang="grc">${esc(gr)}</span>${en ? `<span class="r-en">${esc(en)}</span>` : ''}</button><button class="rm" data-rm="${m.k}" aria-label="Remove saved verse">✕</button></div>`;
  }
  box.innerHTML = h;
  $$('.result', box).forEach(x => x.onclick = () => { const [c, n, v] = x.dataset.k.split('.'); navigate(c, +n, +v); });
  $$('.rm', box).forEach(x => x.onclick = () => { store.set('lxx.marks', store.get('lxx.marks', []).filter(m => m.k !== x.dataset.rm)); renderSaved(); });
}

/* ---------- search ---------- */
let searchToken = 0;
function foldMap(s) {
  let out = ''; const map = [];
  for (let i = 0; i < s.length; i++) {
    let f = s[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^\p{L}\p{N}\s]/gu, '');
    for (const c of f) { out += c; map.push(i); }
  }
  return { out, map };
}
function snippet(text, q) {
  const { out, map } = foldMap(text), i = out.indexOf(q);
  if (i < 0) return null;
  const s = map[i], e = map[i + q.length - 1] + 1;
  const a = Math.max(0, s - 70), z = Math.min(text.length, e + 90);
  return (a > 0 ? '…' : '') + esc(text.slice(a, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>' + esc(text.slice(e, z)) + (z < text.length ? '…' : '');
}
async function runSearch() {
  const token = ++searchToken, raw = $('#searchInput').value;
  $('#lemmaPill').hidden = true;
  const q = foldMap(raw).out.replace(/\s+/g, ' ').trim();
  const status = $('#searchStatus'), box = $('#searchResults');
  box.innerHTML = '';
  if (q.length < 2) { status.textContent = 'Type at least two letters.'; return; }
  const MAX = 300; let found = 0;
  for (let i = 0; i < BOOKS.length; i++) {
    if (token !== searchToken) return;
    const b = BOOKS[i];
    status.textContent = `Searching ${shortName(b)}…  (${i + 1} of ${BOOKS.length})   ${found} found`;
    let d; try { d = await loadBook(b.code); } catch { status.textContent = 'Search needs the books to be downloaded. Check your connection or use Settings → Download all books.'; return; }
    let h = '';
    for (const c of d.chapters) for (const [vn, gr, en] of c.v) {
      const sg = snippet(gr, q), se = en ? snippet(en, q) : null;
      if (!sg && !se) continue;
      h += `<button class="result" data-k="${b.code}.${c.n}.${vn}"><span class="r-ref">${esc(shortName(b))} ${c.n}:${vn}</span>` +
        `<span class="r-gr" lang="grc">${sg || esc(gr.slice(0, 140)) + (gr.length > 140 ? '…' : '')}</span>` +
        (se ? `<span class="r-en">${se}</span>` : (settings.en && en ? `<span class="r-en">${esc(en.slice(0, 160))}${en.length > 160 ? '…' : ''}</span>` : '')) + '</button>';
      if (++found >= MAX) break;
    }
    if (h) box.insertAdjacentHTML('beforeend', h);
    if (found >= MAX) break;
  }
  if (token !== searchToken) return;
  status.textContent = found ? `${found >= MAX ? MAX + '+' : found} verse${found === 1 ? '' : 's'} found${found >= MAX ? ' (showing the first ' + MAX + ')' : ''}.` : 'No verses found. Try fewer letters, or a different spelling.';
}
async function runLemmaSearch(id) {
  const token = ++searchToken;
  let lex; try { lex = await loadLex(); } catch { $('#searchStatus').textContent = 'The dictionary isn’t available offline yet.'; return; }
  const e = lex[id], idStr = id.toString(36), re = new RegExp(`(^| )${idStr}( |$)`);
  const status = $('#searchStatus'), box = $('#searchResults'), pill = $('#lemmaPill');
  box.innerHTML = ''; $('#searchInput').value = '';
  pill.className = 'lemma-pill'; pill.hidden = false;
  pill.innerHTML = `<span><span lang="grc">${esc(e[0])}</span> · ${esc(e[4] || 'all uses')}</span><button aria-label="Clear">✕</button>`;
  pill.querySelector('button').onclick = () => { searchToken++; pill.hidden = true; box.innerHTML = ''; status.textContent = ''; };
  const MAX = 300; let found = 0;
  for (let i = 0; i < BOOKS.length; i++) {
    if (token !== searchToken) return;
    const b = BOOKS[i];
    status.textContent = `Searching ${shortName(b)}…  (${i + 1} of ${BOOKS.length})   ${found} found`;
    let lem, d; try { [lem, d] = await Promise.all([loadLem(b.code), loadBook(b.code)]); } catch { status.textContent = 'Search needs the books to be downloaded. Check your connection or use Display → Download everything.'; return; }
    let h = '';
    outer: for (let ci = 0; ci < d.chapters.length; ci++) {
      const c = d.chapters[ci], rows = lem.c[ci] || [];
      for (let vi = 0; vi < c.v.length; vi++) {
        const cells = rows[vi] || ''; if (!re.test(cells)) continue;
        const [vn, gr, en] = c.v[vi], toks = gr.split(' '), cs = cells.split(' ');
        const g = toks.map((t, k) => cs[k] === idStr ? `<mark>${esc(t)}</mark>` : esc(t)).join(' ');
        h += `<button class="result" data-k="${b.code}.${c.n}.${vn}"><span class="r-ref">${esc(shortName(b))} ${c.n}:${vn}</span><span class="r-gr" lang="grc">${g}</span>` +
          (settings.en && en ? `<span class="r-en">${esc(en.slice(0, 170))}${en.length > 170 ? '…' : ''}</span>` : '') + '</button>';
        if (++found >= MAX) break outer;
      }
    }
    if (h) box.insertAdjacentHTML('beforeend', h);
    if (found >= MAX) break;
  }
  if (token !== searchToken) return;
  status.textContent = `${found >= MAX ? MAX + '+' : found} verse${found === 1 ? '' : 's'} use this word${found >= MAX ? ' (showing the first ' + MAX + ')' : ''}.`;
}
$('#searchBtn').onclick = runSearch;
$('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
$('#searchResults').addEventListener('click', e => {
  const r = e.target.closest('.result'); if (!r) return;
  const [c, n, v] = r.dataset.k.split('.'); navigate(c, +n, +v);
});

/* ---------- settings sheet ---------- */
$('#setBtn').onclick = () => { refreshOffline(); openSheet($('#setSheet')); };
$('#sizeRange').oninput = e => { settings.size = +e.target.value; applySettings(); };
$('#sizeDown').onclick = () => { settings.size = Math.max(16, settings.size - 1); applySettings(); };
$('#sizeUp').onclick = () => { settings.size = Math.min(34, settings.size + 1); applySettings(); };
$$('#themeSeg button').forEach(b => b.onclick = () => { settings.theme = b.dataset.v; applySettings(); });
$$('#layoutSeg button').forEach(b => b.onclick = () => { settings.layout = b.dataset.v; applySettings(); });
$$('#wordsSeg button').forEach(b => b.onclick = () => { settings.words = b.dataset.v === 'on'; if (!settings.words) clearWord(); applySettings(); if (settings.words && cur) { loadLem(cur.code).catch(() => {}); loadLex().catch(() => {}); } });

/* ---------- offline library ---------- */
const DATA_CACHE = 'lxx-data-v4';
let downloading = false;
const offlineUrls = () => ['data/lex.json', 'data/lem.json', ...BOOKS.map(b => `data/${b.code}.json`)];
async function cachedCount() {
  if (!('caches' in window)) return -1;
  const c = await caches.open(DATA_CACHE), keys = await c.keys();
  return keys.filter(k => /\/data\/[A-Za-z0-9]+\.json$/.test(k.url) && !/\/books\.json$/.test(k.url)).length;
}
async function refreshOffline() {
  const n = await cachedCount(), total = offlineUrls().length;
  const st = $('#offlineStatus'), btn = $('#offlineBtn');
  if (n < 0) { st.textContent = 'Offline storage isn’t available in this browser.'; btn.hidden = true; return; }
  btn.hidden = false;
  if (n >= total) { st.textContent = 'The whole library, with its dictionary, is saved on this device. The app works without a connection.'; btn.disabled = true; btn.textContent = 'Everything is downloaded'; }
  else { st.textContent = `${n} of ${total} files are saved on this device.`; btn.disabled = downloading; btn.textContent = downloading ? 'Downloading…' : 'Download everything'; }
}
async function downloadAll() {
  if (downloading || !('caches' in window)) return;
  downloading = true;
  const c = await caches.open(DATA_CACHE);
  const queue = offlineUrls(), total = queue.length;
  let done = 0; const failed = [];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try { if (!(await c.match(url))) await c.add(url); } catch { failed.push(url); }
      done++; $('#offlineStatus').textContent = `Downloading… ${done} of ${total}`;
    }
  };
  $('#offlineBtn').disabled = true;
  await Promise.all([worker(), worker(), worker()]);
  downloading = false;
  const n = await cachedCount();
  if (n >= total) store.set('lxx.offline5', true);
  await refreshOffline();
  if (failed.length) $('#offlineStatus').textContent = `${failed.length} file${failed.length === 1 ? '' : 's'} could not be downloaded. They are missing from your site, or the connection dropped: ${failed.slice(0, 4).join(', ')}${failed.length > 4 ? '…' : ''}`;
}
$('#offlineBtn').onclick = downloadAll;

/* ---------- start ---------- */
async function init() {
  applySettings();
  try {
    BOOKS = await (await fetch('data/books.json')).json();
  } catch {
    $('#reader').innerHTML = `<div class="empty">The library couldn’t be loaded. Connect to the internet once so it can be saved to this device.</div>`;
    return;
  }
  BOOKS.forEach(b => BY[b.code] = b);
  buildAliases();
  const p = parseHash();
  if (p) show(p.code, p.ch, p.v);
  else {
    const last = store.get('lxx.last', null);
    const t = last && BY[last.code] ? last : { code: 'Gen', ch: 1 };
    history.replaceState(null, '', `#${t.code}.${t.ch}`);
    show(t.code, t.ch, null);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!store.get('lxx.offline5', false) && navigator.onLine) setTimeout(downloadAll, 4000);
}
init();
})();
