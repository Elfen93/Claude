/* Back office de Catalog Finder: invoices (UK / JP / HK), clientes, entidades e historial.
   Todo se guarda en catalog.db a través del servidor local (python server.py). */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API_H = { 'Content-Type': 'application/json', 'X-Catalog-Finder': '1' };
const store = (() => { // los mismos ajustes que el buscador (catalog.db)
  let srv = {}; const pending = {}; let timer = 0;
  try { const x = new XMLHttpRequest(); x.open('GET', '/api/kv', false); x.setRequestHeader('X-Catalog-Finder', '1'); x.send(); if (x.status === 200) srv = JSON.parse(x.responseText); } catch {}
  const flush = keepalive => { clearTimeout(timer); timer = 0; const items = { ...pending }; for (const k in pending) delete pending[k]; if (!Object.keys(items).length) return Promise.resolve();
    return fetch('/api/kv', { method: 'POST', headers: API_H, body: JSON.stringify({ items }), keepalive }).catch(() => {}); };
  addEventListener('pagehide', () => flush(true));
  const reload = async () => { try { const r = await fetch('/api/kv', { headers: API_H }); if (r.ok) srv = await r.json(); } catch {} };
  return { reload, get: (k, d) => k in srv ? srv[k] : d, set(k, v) { srv[k] = v == null ? v : String(v); pending[k] = srv[k]; if (!timer) timer = setTimeout(flush, 300); }, flush };
})();
let lang = store.get('lang', 'es'); if (!window.LANGS[lang]) lang = 'es';
const tl = (k, v) => { const s = lang === 'es' ? k : (window.I18N[k]?.[lang] ?? k); return v ? s.replace(/\{(\w+)\}/g, (m, x) => x in v ? v[x] : m) : s; };
const _fetch = window.fetch.bind(window); window.fetch = (u, o = {}) => _fetch(u, { ...o, headers: { ...(o.headers || {}), 'X-Lang': lang } });
async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? { headers: API_H } : { method: 'POST', headers: API_H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text()); return r.json();
}
function say(m, ms = 2600) { const e = $('msg'); e.textContent = m; e.style.display = 'block'; clearTimeout(say.t); say.t = setTimeout(() => e.style.display = 'none', ms); }

/* ---------- dinero y monedas ---------- */
let rates = null;
const NODEC = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'HUF', 'TWD'];
const decs = cur => NODEC.includes(cur) ? 0 : 2;
const rnd = (v, cur) => { const f = 10 ** decs(cur); return Math.round((+v || 0) * f) / f; };
const num = v => { if (typeof v === 'number') return v; let s = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!s) return 0; const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.'); s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); return parseFloat(s) || 0; };
const conv = (v, from, to) => { if (!v || from === to) return v; const a = rates?.[from], b = rates?.[to]; return a && b ? v / a * b : NaN; };
const fmtC = (v, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, currencyDisplay: 'symbol', minimumFractionDigits: decs(cur), maximumFractionDigits: decs(cur) }).format(v || 0); } catch { return fmtN(v, cur) + ' ' + cur; } };
const fmtN = (v, cur) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: decs(cur), maximumFractionDigits: decs(cur) });
const CURS = ['USD', 'EUR', 'GBP', 'JPY', 'HKD', 'CNY', 'SGD', 'AUD', 'CAD', 'CHF', 'KRW', 'TWD'];
const curOptions = sel => CURS.map(c => `<option${c === sel ? ' selected' : ''}>${c}</option>`).join('');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + (+n || 0)); return x.toISOString().slice(0, 10); };
const photo = c => (store.get('tpl', 'https://s3.amazonaws.com/storage.j-ports/photographs/{id}/{size}/{n}.jpg')).replace('{id}', encodeURIComponent(c)).replace('{size}', 'medium').replace('{n}', 1);

/* ---------- datos ---------- */
let ents = [], clients = [], invoices = [];
async function loadAll() {
  [ents, clients, invoices] = await Promise.all(['entities', 'clients', 'invoices'].map(k => api(k)));
}
const entOf = id => ents.find(e => e.id === +id) || null;
const cliOf = id => clients.find(c => c.id === +id) || null;
const isHK = e => (e?.template || '') === 'hk';

/* ---------- pestañas ---------- */
const TABS = ['home', 'inv', 'cli', 'news', 'ent'];
function showTab(t) {
  document.querySelectorAll('#tabs a[data-t]').forEach(a => a.classList.toggle('on', a.dataset.t === t));
  TABS.forEach(k => $('t-' + k).style.display = k === t ? '' : 'none');
  ({ home: renderHome, cli: renderClients, ent: renderEntForm, news: renderNews, inv: renderInvList })[t]?.();
}
function route() { // #home · #inv · #inv=12 · #inv=new:5 · #cli · #cli=5 · #news · #ent · #draft
  const [, t = 'home', arg = ''] = location.hash.match(/^#(\w+)(?:=(.+))?/) || [];
  if (t === 'draft') { showTab('inv'); useDraft(); history.replaceState(null, '', '#inv'); return; }
  const tab = TABS.includes(t) ? t : 'home'; showTab(tab);
  if (tab === 'cli' && arg) showClient(+arg);
  if (tab === 'inv' && arg.startsWith('new')) { if (!dirty || confirm(tl('Hay cambios sin guardar. ¿Empezar otra invoice?'))) { const cid = +arg.split(':')[1] || null, c = cliOf(cid); inv = blank(c?.entity ? +c.entity : inv?.entity_id); if (c) { inv.client_id = c.id; if (c.commissionPct != null && c.commissionPct !== '') inv.comm = +c.commissionPct; } dirty = false; $('iState').textContent = ''; fillForm(); } history.replaceState(null, '', '#inv'); }
  else if (tab === 'inv' && arg) openInvoice(+arg);
}
addEventListener('hashchange', route);

/* ============ invoice en edición ============ */
let inv = null, dirty = false;
function blank(entId) {
  const e = entOf(entId) || ents[0] || {};
  return { entity_id: e.id, client_id: null, currency: e.currency || 'USD', date: today(), due: addDays(today(), e.dueDays || 0),
    shipTxt: e.shipping || '', terms: e.terms || '', lines: [], ship: 0, tax: +e.taxPct || 0, paid: 0, fee1: 0, fee2: 0,
    comm: e.commissionPct ?? 5, srcCur: isHK(e) ? 'HKD' : e.currency || 'USD', rate: null, labels: e.labels || 'ja', notes: '' };
}
const fields = [['iDate', 'date'], ['iDue', 'due'], ['iShipTxt', 'shipTxt'], ['iTerms', 'terms'], ['iNotes', 'notes'], ['iLabels', 'labels']];
const numFields = [['iShip', 'ship'], ['iTax', 'tax'], ['iPaid', 'paid'], ['iFee1', 'fee1'], ['iFee2', 'fee2'], ['iComm', 'comm'], ['iRate', 'rate']];
function fillForm() {
  const e = entOf(inv.entity_id);
  $('iEnt').innerHTML = ents.map(x => `<option value="${x.id}">${esc(x.code)} · ${esc(x.name || '')}</option>`).join(''); $('iEnt').value = inv.entity_id;
  $('iCli').innerHTML = `<option value="">${esc(tl('— elige cliente —'))}</option>` + [...clients].sort((a, b) => cliName(a).localeCompare(cliName(b))).map(c => `<option value="${c.id}">${esc(cliName(c))}</option>`).join('');
  $('iCli').value = inv.client_id || '';
  $('iCur').innerHTML = curOptions(inv.currency); $('iSrcCur').innerHTML = curOptions(inv.srcCur);
  fields.forEach(([id, k]) => $(id).value = inv[k] ?? '');
  numFields.forEach(([id, k]) => $(id).value = inv[k] ?? '');
  if (isHK(e) && !inv.rate) autoRate();
  document.querySelectorAll('.hk').forEach(x => x.style.display = isHK(e) ? '' : 'none');
  document.querySelectorAll('.sale').forEach(x => x.style.display = isHK(e) ? 'none' : '');
  $('invTitle').textContent = inv.id ? tl('Invoice') : tl('Invoice nueva');
  $('iDup').style.display = $('iDel').style.display = inv.id ? '' : 'none';
  $('iSettled').checked = !!inv.settled; $('iSettled').parentElement.style.display = inv.id ? '' : 'none';
  renderLines(); update();
}
const cliName = c => c ? (c.company && c.name && c.company !== c.name ? `${c.company} (${c.name})` : c.company || c.name || '?') : '';
function autoRate() { const r = conv(1, inv.srcCur, inv.currency); inv.rate = isNaN(r) ? 1 : +r.toFixed(4); $('iRate').value = inv.rate; }
$('iEnt').onchange = () => { // cambiar de entidad: moneda, plazos y textos por defecto de esa entidad
  const e = entOf($('iEnt').value), old = inv.currency, wasHK = isHK(entOf(inv.entity_id));
  Object.assign(inv, { entity_id: e.id, shipTxt: e.shipping || '', terms: e.terms || '', due: addDays(inv.date, e.dueDays || 0), tax: +e.taxPct || 0, labels: e.labels || inv.labels });
  if (isHK(e) && !wasHK) inv.lines = inv.lines.map(l => ({ ...l, src: l.src ?? l.price, desc: l.desc || hkDesc(l, e.labels) }));
  inv.comm = cliOf(inv.client_id)?.commissionPct ?? e.commissionPct ?? inv.comm;
  setCurrency(e.currency || old); if (isHK(e)) { inv.srcCur = inv.srcCur || 'HKD'; inv.rate = null; }
  fillForm(); touch();
};
$('iCli').onchange = () => {
  const c = cliOf($('iCli').value); inv.client_id = c ? c.id : null;
  if (c) { if (c.commissionPct != null && c.commissionPct !== '') inv.comm = +c.commissionPct; }
  fillForm(); touch();
};
$('iCur').onchange = () => { setCurrency($('iCur').value); if (isHK(entOf(inv.entity_id))) autoRate(); fillForm(); touch(); };
$('iSrcCur').onchange = () => { inv.srcCur = $('iSrcCur').value; autoRate(); update(); touch(); };
function setCurrency(cur) { // los precios de venta se convierten a la nueva moneda
  const old = inv.currency; if (cur === old) return;
  inv.lines.forEach(l => { if (l.price != null && l.price !== '') { const v = l.usd != null ? conv(l.usd, 'USD', cur) : conv(num(l.price), old, cur); if (!isNaN(v)) l.price = rnd(v, cur); } });
  ['ship', 'paid'].forEach(k => { const v = conv(+inv[k] || 0, old, cur); if (!isNaN(v)) inv[k] = rnd(v, cur); });
  inv.currency = cur;
}
fields.forEach(([id, k]) => $(id).addEventListener('input', () => { inv[k] = $(id).value; if (k === 'labels') inv.lines.forEach(l => { if (l.autoDesc) l.desc = hkDesc(l, inv.labels); }), renderLines(); update(); touch(); }));
$('iDate').addEventListener('change', () => { inv.due = addDays(inv.date, entOf(inv.entity_id)?.dueDays || 0); $('iDue').value = inv.due; update(); });
numFields.forEach(([id, k]) => $(id).addEventListener('input', () => { inv[k] = $(id).value === '' ? (k === 'rate' ? null : 0) : num($(id).value); update(); touch(); }));
function touch() { dirty = true; $('iState').textContent = inv.id ? tl('cambios sin guardar') : ''; }

/* ---------- líneas ---------- */
const HK_TYPES = [[/cross ?body|messenger/i, 'クロスボディバッグ', 'Crossbody Bag'], [/shoulder/i, 'ショルダーバッグ', 'Shoulder Bag'], [/tote/i, 'トートバッグ', 'Tote Bag'],
  [/clutch|pochette|pouch/i, 'クラッチ', 'Clutch Bag'], [/wallet|purse/i, '財布', 'Wallet'], [/card (case|holder)/i, 'カードケース', 'Card Case'], [/back ?pack|rucksack/i, 'リュック', 'Backpack'],
  [/brief ?case|business bag/i, 'ブリーフケース', 'Briefcase'], [/belt bag|waist|bum bag/i, 'ウエストバッグ', 'Belt Bag'], [/hand ?bag|top handle|satchel|boston|speedy|kelly|birkin|flap bag/i, 'ハンドバッグ', 'Handbag'],
  [/scarf|shawl|stole|twilly/i, 'スカーフ', 'Scarf'], [/necklace|pendant/i, 'ネックレス', 'Necklace'], [/bracelet|bangle/i, 'ブレスレット', 'Bracelet'], [/earring/i, 'イヤリング', 'Earrings'],
  [/\bring\b/i, 'リング', 'Ring'], [/watch/i, '時計', 'Watch'], [/\bbelt\b/i, 'ベルト', 'Belt'], [/\bbag\b/i, 'バッグ', 'Bag']];
const HK_MATS = [[/nylon/i, 'ナイロン', 'Nylon'], [/canvas|monogram|damier|coated|pvc|plastic|vinyl|supreme/i, 'プラスチック', 'Plastic'], [/suede/i, 'スエード', 'Suede'],
  [/leather|calf|lamb|caviar|epi|taurillon|togo|epsom|clemence|box/i, '革', 'Leather'], [/cotton|denim|tweed|fabric|textile/i, 'コットン', 'Cotton'], [/silk/i, 'シルク', 'Silk'], [/straw|raffia|wicker/i, 'ストロー', 'Straw']];
function hkDesc(l, labels = 'ja') { // "Louis Vuitton クロスボディバッグ、革" como en las invoices LBA
  const t = l.details || '', i = labels === 'en' ? 2 : 1, ty = HK_TYPES.find(x => x[0].test(t)), ma = HK_MATS.find(x => x[0].test(t));
  if (!ty) return [l.brand, t].filter(Boolean).join(' ');
  return `${l.brand ? l.brand + ' ' : ''}${ty[i]}${ma ? (labels === 'en' ? ', ' : '、') + ma[i] : ''}`;
}
function renderLines() {
  const hk = isHK(entOf(inv.entity_id)), cur = inv.currency;
  const head = hk ? ['#', tl('Lote'), 'CTag', tl('Estado'), tl('Descripción'), tl('Martillo ({c})', { c: inv.srcCur }), '', '']
    : ['#', 'CTag', 'SKU', tl('Marca'), tl('Descripción'), tl('Precio ({c})', { c: cur }), tl('Cant.'), 'Info', '', ''];
  const t = $('lines');
  t.innerHTML = `<tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>` + inv.lines.map((l, i) => hk
    ? `<tr data-i="${i}"><td>${i + 1}</td><td><input data-k="lot" value="${esc(l.lot || '')}" style="width:80px"></td><td><input data-k="code" value="${esc(l.code || '')}" style="width:90px"></td>
       <td><select data-k="status"><option value="">${esc(tl('vendido'))}</option><option${l.status === 'Passed' ? ' selected' : ''}>Passed</option></select></td>
       <td><input data-k="desc" value="${esc(l.desc || '')}" style="min-width:220px"></td><td><input data-k="src" class="num" value="${l.src ?? ''}" style="width:90px"></td>
       <td>${l.code ? `<img class="thumb" src="${esc(photo(l.code))}" onerror="this.style.visibility='hidden'">` : ''}</td><td><button data-del title="${esc(tl('Quitar'))}">✕</button></td></tr>`
    : `<tr data-i="${i}"><td>${i + 1}</td><td><input data-k="code" value="${esc(l.code || '')}" style="width:90px"></td><td><input data-k="sku" value="${esc(l.sku || '')}" style="width:70px"></td>
       <td><input data-k="brand" value="${esc(l.brand || '')}" style="width:110px"></td><td><input data-k="details" value="${esc(l.details || '')}" style="min-width:200px"></td>
       <td><input data-k="price" class="num" value="${l.price ?? ''}" style="width:90px"></td><td><input data-k="qty" class="num" value="${l.qty ?? 1}" style="width:45px"></td>
       <td><input data-k="info" value="${esc(l.info || '')}" style="width:90px"></td>
       <td>${l.code ? `<img class="thumb" src="${esc(photo(l.code))}" onerror="this.style.visibility='hidden'">` : ''}</td><td><button data-del title="${esc(tl('Quitar'))}">✕</button></td></tr>`).join('');
  t.querySelectorAll('tr[data-i]').forEach(tr => {
    const l = inv.lines[+tr.dataset.i];
    tr.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const k = inp.dataset.k; l[k] = ['price', 'qty', 'src'].includes(k) ? (inp.value === '' ? '' : num(inp.value)) : inp.value;
      if (k === 'price') delete l.usd; if (k === 'desc') l.autoDesc = false; if (k === 'src' && l.src !== '' && l.status === 'Passed') l.status = '';
      update(); touch();
    }));
    tr.querySelector('[data-del]').onclick = () => { inv.lines.splice(+tr.dataset.i, 1); renderLines(); update(); touch(); };
  });
  $('lnCount').textContent = tl('({n})', { n: inv.lines.length });
}
$('lnAdd').onclick = () => { inv.lines.push(isHK(entOf(inv.entity_id)) ? { src: '', status: '' } : { qty: 1, price: '' }); renderLines(); update(); touch(); };

/* ---------- cálculo ---------- */
function compute(x = inv) {
  const e = x.entity || entOf(x.entity_id) || {}, cur = x.currency, hk = isHK(e);
  if (hk) {
    const pct = (+x.comm || 0) / 100, rate = +x.rate || 1;
    const lines = x.lines.map(l => {
      const passed = l.status === 'Passed' || l.src === '' || l.src == null;
      const hammer = passed ? 0 : rnd(num(l.src) * rate, cur), comm = rnd(hammer * pct, cur), tax = 0;
      return { ...l, passed, hammer, comm, tax, total: hammer + comm + tax };
    });
    const hammer = lines.reduce((a, l) => a + l.hammer, 0), comm = lines.reduce((a, l) => a + l.comm, 0);
    const sub = hammer + (+x.fee1 || 0) + (+x.fee2 || 0), tax = rnd((sub + comm) * (+x.tax || 0) / 100, cur);
    return { hk, cur, lines, hammer, sub, comm, tax, total: sub + comm + tax, payable: sub + comm + tax, sold: lines.filter(l => !l.passed).length };
  }
  const lines = x.lines.map(l => ({ ...l, amount: rnd(num(l.price) * (l.qty === '' || l.qty == null ? 1 : +l.qty), cur) }));
  const sub = rnd(lines.reduce((a, l) => a + l.amount, 0), cur);
  const net = sub, ship = +x.ship || 0;
  const tax = rnd((net + ship) * (+x.tax || 0) / 100, cur), total = rnd(net + ship + tax, cur), paid = +x.paid || 0;
  return { hk, cur, lines, sub, net, ship, tax, total, paid, payable: rnd(total - paid, cur), qty: lines.reduce((a, l) => a + (l.qty === '' || l.qty == null ? 1 : +l.qty), 0) };
}
let upT = 0;
function update() { clearTimeout(upT); upT = setTimeout(_update, 120); }
function _update() {
  const t = compute(), cur = t.cur, row = (k, v, cls = '') => `<div class="${cls}"><span>${esc(k)}</span><b class="num">${esc(v)}</b></div>`;
  $('totals').innerHTML = t.hk
    ? row(tl('Martillo ({n} vendidos)', { n: t.sold }), fmtC(t.hammer, cur)) + row(tl('Subtotal (con tasas)'), fmtC(t.sub, cur)) + row(tl('Comisión {p}%', { p: inv.comm || 0 }), fmtC(t.comm, cur)) + row(tl('Impuesto'), fmtC(t.tax, cur)) + row(tl('Total'), fmtC(t.total, cur), 'big')
    : row(tl('Subtotal'), fmtC(t.sub, cur))
      + (t.ship ? row(tl('Envío'), fmtC(t.ship, cur)) : '') + row(tl('Impuesto {p}%', { p: +inv.tax || 0 }), fmtC(t.tax, cur)) + row(tl('Total'), fmtC(t.total, cur))
      + (t.paid ? row(tl('Ya pagado'), '−' + fmtC(t.paid, cur)) : '') + row(tl('A pagar'), fmtC(t.payable, cur), 'big');
  $('preview').innerHTML = renderSheet(inv, t); fitPreview();
  numberPreview();
}
function fitPreview() { const sh = $('preview').firstElementChild; if (!sh) return; sh.style.zoom = 1; const z = Math.min(1, ($('preview').parentElement.clientWidth - 4) / sh.offsetWidth); sh.style.zoom = z; }
addEventListener('resize', () => fitPreview());
let npT = 0;
function numberPreview() {
  clearTimeout(npT);
  if (inv.number) { $('invNum').textContent = inv.number; return; }
  npT = setTimeout(async () => { try { const { number } = await api('next-number?inv=' + encodeURIComponent(JSON.stringify({ entity_id: inv.entity_id, client_id: inv.client_id }))); if (!inv.number) $('invNum').textContent = tl('· nº al guardar: {n}', { n: number }); } catch {} }, 250);
}

/* ---------- plantillas (lo que se imprime) ---------- */
const nl = s => esc(s || '').replace(/\n/g, '<br>');
const usDate = d => { const [y, m, dd] = (d || '').split('-'); return y ? `${+m}/${+dd}/${y}` : ''; };
function clientSnap(x) { return x.client || cliOf(x.client_id) || {}; }
function renderSheet(x, t) {
  const e = x.entity || entOf(x.entity_id) || {}, c = clientSnap(x), number = x.number || (tl('(nº al guardar)'));
  if (!x.lines.length && !c.name && !c.company) return `<div class="sheet"><p style="color:#888">${esc(tl('Elige cliente y añade artículos para ver la invoice.'))}</p></div>`;
  return ({ uk: sheetUK, jp: sheetJP, hk: sheetHK }[e.template] || sheetUK)(x, t, e, c, number);
}
const img = (code) => code ? `<img src="${esc(photo(code))}" onerror="this.style.visibility='hidden'">` : '';
const logo = e => e.logo ? `<img class="logo" src="${e.logo}">` : '';
function sheetUK(x, t, e, c, number) {
  const cur = t.cur, who = c.company || c.name || '';
  const cli = [c.address && `Address: ${c.address.replace(/\n/g, ', ')}`, c.companyNo && `Company No: ${c.companyNo}`, c.vatNo && `VAT No: ${c.vatNo}`, c.phone && `Telephone No: ${c.phone}`].filter(Boolean);
  return `<div class="sheet uk">
  <table><tr><td class="blue" style="width:13%">Invoice</td><td style="width:32%"><b>${esc(who.toUpperCase())}</b></td><td class="blue" style="width:8%">Date</td><td style="width:15%">${usDate(x.date)}</td><td class="right">Invoice REF No：${esc(number)}</td></tr></table>
  <div class="rule"></div><div class="center" style="color:#888">${esc(x.shipTxt || '')}</div>
  <table style="margin-top:6px"><tr><td style="width:56%;vertical-align:top;padding-right:16px">
    ${e.notice ? `<div class="notice pre">${nl(e.notice)}</div><br>` : ''}
    <div style="font-size:13px"><b>${esc(who.toUpperCase())}</b></div>
    <div class="small">${cli.map(esc).join('<br>')}</div>
    ${c.company && c.name ? `<div style="margin-top:3px"><b><u>${esc(c.name)}</u></b></div>` : ''}${c.email ? `<div class="small">EMAIL: ${esc(c.email)}</div>` : ''}
    <table style="width:78%;margin-top:8px"><tr class="lgrey"><td style="padding:6px">Invoice Total<br>Outstanding</td><td class="right" style="padding:6px"><b>${fmtN(t.payable, cur)}</b></td><td style="background:#fff;padding-left:6px"><b>${cur}</b></td></tr></table>
  </td><td style="vertical-align:top">
    <div class="right">${logo(e)}</div>${e.ccText ? `<div class="small pre">${nl(e.ccText)}</div>` : ''}
    <div class="small" style="margin-top:8px">${nl(e.address)}${e.phone ? `<br>TEL: ${esc(e.phone)}` : ''}</div>
    <div style="margin-top:6px"><b>${esc(e.name)}</b></div>${e.website ? `<div class="small" style="color:#15c;text-decoration:underline">${esc(e.website)}</div>` : ''}
    <div class="small pre" style="font-weight:700">${nl(e.ids)}</div>
  </td></tr></table>
  <table class="items" style="margin-top:12px"><tr><th>Pur#</th><th>COMPANY SKU</th><th>Details</th><th>J-PSKU</th><th>Price Inc Fees</th><th>Quantity</th><th>Info</th><th class="right">Total Tax Inc</th><th></th></tr>
  ${t.lines.map((l, i) => `<tr><td>${String(i + 1).padStart(3, '0')}</td><td>${esc(l.sku || '')}</td><td><b>${esc([l.brand, l.details].filter(Boolean).join(' '))}</b></td><td>${esc(l.code || '')}</td>
    <td>${fmtC(num(l.price), cur)}</td><td class="center lgrey">${l.qty ?? 1}</td><td>${esc(l.info || '')}</td><td class="right green"><b>${fmtC(l.amount, cur)}</b></td><td>${img(l.code)}</td></tr>`).join('')}
  <tr><td colspan="5"></td><td class="center lgrey">${t.qty}</td><td colspan="3"></td></tr></table>
  <table class="totals" style="width:42%;margin-left:auto;margin-top:6px">
    <tr><td class="right blue" style="font-weight:400">subtotal</td><td class="right lgrey">${fmtC(t.sub, cur)}</td></tr>
    <tr><td class="right blue" style="font-weight:400">Shipping</td><td class="right lgrey">${fmtC(t.ship, cur)}</td></tr>
    <tr><td class="right blue" style="font-weight:400">${esc(e.taxLabel || 'VAT')}</td><td class="right lgrey">${fmtC(t.tax, cur)}</td></tr>
    ${t.paid ? `<tr><td class="right blue" style="font-weight:400">${esc(e.deductionLabel || 'Paid')}</td><td class="right lgrey">-${fmtC(t.paid, cur)}</td></tr>` : ''}
    <tr><td class="right blue" style="font-weight:400">Total Payable</td><td class="right grey"><b>${fmtC(t.payable, cur)}</b></td></tr></table>
  <table style="margin-top:10px"><tr><td style="width:30%"><b>TERMS: ${esc(x.terms || '')}</b></td><td><b>DATE OF ISSUE</b> <span class="orange">${esc(x.date)}</span></td><td><b>DATE DUE</b> <span class="blue">${esc(x.due)}</span></td></tr></table>
  <table style="margin-top:10px"><tr><td style="width:56%;vertical-align:top" class="small pre">${nl(e.bank)}</td><td style="vertical-align:top" class="small pre right">${nl(e.sideNotes)}</td></tr></table>
  ${e.legal ? `<div class="small pre" style="margin-top:12px">${nl(e.legal)}</div>` : ''}
  </div>`;
}
function sheetJP(x, t, e, c, number) {
  const cur = t.cur;
  return `<div class="sheet jp">
  <table><tr><td style="font-size:20px;color:#888">${esc(e.title || '請求書')}</td><td class="right small">発行日/Invoice Date &nbsp; ${esc(x.date)} &nbsp; 請求番号：${esc(number)}</td></tr></table>
  <div class="rule"></div><div class="center" style="color:#999">${esc(x.shipTxt || '')}</div>
  <table style="margin-top:8px"><tr><td style="width:56%;vertical-align:top">
    ${c.country ? `<div style="border-bottom:1px solid #000;width:45%">${esc(c.country)}</div>` : ''}
    <div class="small" style="margin-top:12px">${nl([c.name, c.address].filter(Boolean).join('\n'))}</div>
    <div style="margin-top:8px;font-size:13px"><b><u>${esc(c.company || c.name || '')}</u></b></div>${c.email ? `<div class="small">EMAIL: ${esc(c.email)}</div>` : ''}
    <table style="width:90%;margin-top:8px"><tr class="lgrey"><td style="padding:8px">合計金額</td><td class="right" style="padding:8px;font-size:15px">${fmtN(t.payable, cur)}</td><td style="background:#fff;padding-left:6px;vertical-align:bottom"><b>${cur}</b></td></tr>
      <tr><td class="lgrey small" style="padding:4px 8px">下記の通り請求いたしました。</td><td colspan="2"></td></tr></table>
  </td><td style="vertical-align:top">
    <div class="right">${logo(e)}</div><div class="small" style="font-size:8px">${nl(e.address)}</div>${e.phone ? `<div class="small">TEL: ${esc(e.phone)}</div>` : ''}
    <div style="margin-top:6px;font-size:13px"><b>${esc(e.name)}</b></div>${e.website ? `<div class="small" style="color:#15c;text-decoration:underline">${esc(e.website)}</div>` : ''}
    <div class="small pre" style="font-weight:700;margin-top:4px">${nl(e.ids)}</div>
  </td></tr></table>
  <table class="items" style="margin-top:10px"><tr><th colspan="4">品番•品名</th><th></th><th>数量</th><th>単価</th><th class="right">金額</th><th></th></tr>
  <tr><th>Pur#</th><th>Brand</th><th>Details</th><th>J-PSKU</th><th>Price</th><th>Quantity</th><th></th><th class="right">Total</th><th></th></tr>
  ${t.lines.map((l, i) => `<tr><td><b>###${String(i + 1).padStart(4, '0')}</b></td><td>${esc(l.brand || '')}</td><td>${esc(l.details || '')}</td><td>${esc(l.code || '')}</td><td>${fmtC(num(l.price), cur)}</td>
    <td class="center lgrey">${l.qty ?? 1}</td><td class="right">${fmtN(num(l.price), cur)}</td><td class="right lgrey">${fmtN(l.amount, cur)}</td><td>${img(l.code)}</td></tr>`).join('')}
  <tr><td colspan="5"></td><td class="center lgrey">${t.qty}</td><td colspan="3"></td></tr></table>
  <table class="totals" style="width:46%;margin-left:auto;margin-top:6px">
    <tr><td class="right blue" style="font-weight:400">落札金額合計税抜 (subtotal)</td><td class="right lgrey">${fmtN(t.sub, cur)}</td></tr>
    ${t.ship ? `<tr><td class="right blue" style="font-weight:400">送料 (Shipping)</td><td class="right lgrey">${fmtN(t.ship, cur)}</td></tr>` : ''}
    ${t.tax ? `<tr><td class="right blue" style="font-weight:400">消費税 (Tax)</td><td class="right lgrey">${fmtN(t.tax, cur)}</td></tr>` : ''}
    ${t.paid ? `<tr><td class="right blue" style="font-weight:400">${esc(e.deductionLabel || 'Remaining Balance')}</td><td class="right lgrey">${fmtN(t.paid, cur)}</td></tr>` : ''}
    <tr><td class="right blue" style="font-weight:400">合計金額税込 (Total Payable)</td><td class="right grey"><b>${fmtC(t.payable, cur)}</b></td></tr></table>
  <table style="margin-top:10px"><tr><td style="width:28%" class="center"><b>TERMS:<br>${esc(x.terms || '')}</b></td><td style="font-size:13px"><b>DATE OF ISSUE</b> <span class="orange">${esc(x.date)}</span></td><td style="font-size:13px"><b>DATE DUE</b> <span class="blue">${esc(x.due)}</span></td></tr></table>
  <div class="pre" style="margin-top:14px;line-height:2">${nl(e.bank)}</div>
  ${e.legal ? `<div class="small pre" style="margin-top:6px">${nl(e.legal)}</div>` : ''}<div class="rule"></div>
  </div>`;
}
const HK_L = {
  ja: { title: 'LBA オークション請求書', date: '開催日', shop: '店名', email: 'メール', addr: '住所', phone: '電話', reg: '登録番号', summary: '落札者概要', total0: '合計金額（税抜 )', fee1: '作業補助費', fee2: '参加費',
    sub: '小計（税抜 )', comm: 'オークション手数料', tax: '税金', totalT: '合計金額 (税込)', grand: '総合計', bank: '-- 銀行情報 --', role: '落札者',
    cols: ['番号', '', 'ステータス', '商品名', '落札価格', '商品代金', '落札手数料', '手数料', '参考消費税', '税込参考価格'], dfmt: d => { const [y, m, dd] = d.split('-'); return `${y}年${m}月${dd}日`; } },
  en: { title: 'LBA Auction Invoice', date: 'Auction Date', shop: 'Company Name', email: 'Email', addr: 'Address', phone: 'Phone', reg: 'Registration Number', summary: 'Buyer Summary', total0: 'Total (w/o Tax)', fee1: 'Handling Fee',
    fee2: 'Participation Fee', sub: 'Subtotal (w/o Tax)', comm: 'Auction Commission', tax: 'Consumption Tax', totalT: 'Invoice Total (w/ Tax)', grand: 'Grand Total', bank: '-- Bank Information --', role: 'Buyer',
    cols: ['Number', '', 'Status', 'Item Description', 'Hammer Price', 'Item Price', 'Bid Fee', 'Commission', 'Item Tax', 'Total (w/ Tax)'], dfmt: d => d.replace(/-0?/g, '/') },
};
function sheetHK(x, t, e, c, number) {
  const L = HK_L[x.labels] || HK_L.ja, cur = t.cur, f = v => fmtC(v, cur);
  const kv = (k, v) => `<tr><td class="right" style="width:30%;padding-right:6px">${esc(k)}</td><td>${nl(v)}</td></tr>`;
  return `<div class="sheet land hk">
  <div class="center" style="font-size:20px;font-weight:700;text-decoration:underline;margin:10px 0 14px">${esc(x.labels === 'en' ? L.title : (e.title || L.title))}</div>
  <table><tr><td style="width:50%;vertical-align:top"><table>${kv(L.date, x.date ? L.dfmt(x.date) : '')}${kv(L.shop, c.company || c.name || '')}${kv(L.email, c.email || '')}${kv(L.addr, c.address || '')}${kv(L.phone, c.phone || '')}${kv(L.reg, c.regNo || '')}</table></td>
    <td style="vertical-align:top"><div style="margin-left:28%">${logo(e)}</div><table>${kv('', e.name || '')}${kv(L.addr, e.address || '')}${kv(L.phone, e.phone || '')}${kv(L.reg, e.ids || '')}</table></td></tr></table>
  <table class="box1" style="width:52%;margin:12px 0 0 10%"><tr><th colspan="2">${esc(L.summary)}</th><th>${esc(L.grand)}</th></tr>
    <tr><td class="right">${esc(L.total0)}</td><td class="right">${f(t.hammer)}</td><td rowspan="2" class="center" style="font-size:15px;font-weight:700;vertical-align:top">${f(t.total)}</td></tr>
    <tr><td class="right">${esc(L.fee1)}</td><td class="right">${fmtN(+x.fee1 || 0, cur)}</td></tr>
    <tr><td class="right">${esc(L.fee2)}</td><td class="right">${fmtN(+x.fee2 || 0, cur)}</td><td class="center">${esc(L.bank)}</td></tr>
    <tr><td class="right">${esc(L.sub)}</td><td class="right">${f(t.sub)}</td><td rowspan="4" class="center pre" style="vertical-align:top">${nl(e.bank)}</td></tr>
    <tr><td class="right">${esc(L.comm)}</td><td class="right">${f(t.comm)}</td></tr>
    <tr><td class="right">${esc(L.tax)} (${+x.tax || 0}%)</td><td class="right">${fmtN(t.tax, cur)}</td></tr>
    <tr><td class="right">${esc(L.totalT)}</td><td class="right">${f(t.total)}</td></tr></table>
  <table class="items" style="margin-top:22px"><tr><th></th>${L.cols.map(h => `<th>${esc(h)}</th>`).join('')}<th></th></tr>
  <tr><td colspan="12" style="background:#d9d9d9;text-align:left;border:none;padding:1px 2px">${esc(L.role)}</td></tr>
  ${t.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.lot || '')}</td><td>${esc(l.code || '')}</td><td>${l.passed ? 'Passed' : esc(l.status || '')}</td><td>${esc(l.desc || hkDesc(l, x.labels))}</td>
    <td>${f(l.hammer)}</td><td>${f(l.hammer)}</td><td>${f(0)}</td><td>${f(l.comm)}</td><td>${f(l.tax)}</td><td>${f(l.total)}</td><td style="border:none">${img(l.code)}</td></tr>`).join('')}
  <tr><td colspan="5" style="border:none"></td><td style="border:none">${f(t.hammer)}</td><td style="border:none">${f(t.hammer)}</td><td style="border:none">${f(0)}</td><td style="border:none">${f(t.comm)}</td><td style="border:none">${f(t.tax)}</td><td style="border:none">${f(t.total)}</td><td style="border:none"></td></tr></table>
  ${e.legal ? `<div class="small pre" style="margin-top:12px">${nl(e.legal)}</div>` : ''}
  </div>`;
}

/* ---------- guardar / imprimir ---------- */
function snapshotInv() { // la invoice guardada lleva copia de entidad y cliente: si luego cambian, se reimprime igual
  const t = compute(), e = entOf(inv.entity_id), c = cliOf(inv.client_id);
  return { ...inv, entity: e ? { ...e } : inv.entity, client: c ? { ...c } : inv.client,
    lines: inv.lines.filter(l => l.code || l.details || l.desc || l.price || l.src),
    totals: { sub: t.sub, total: t.total, payable: t.payable, cur: t.cur, n: t.hk ? t.sold : t.qty } };
}
$('iSave').onclick = async () => {
  if (!inv.client_id) return say(tl('Elige un cliente'));
  if (!inv.lines.length) return say(tl('La invoice no tiene artículos'));
  $('iSave').disabled = true;
  try {
    const data = snapshotInv(), r = await api('invoices/save', data);
    Object.assign(inv, data, { id: r.id, number: r.number }); dirty = false;
    invoices = await api('invoices'); fillForm(); renderInvList();
    $('iState').innerHTML = `<span class="ok">${esc(tl('✓ Guardada como {n}. Los artículos quedan marcados como vendidos.', { n: r.number }))}</span>`;
  } catch (e) { say(tl('No se pudo guardar: {e}', { e: e.message })); }
  finally { $('iSave').disabled = false; }
};
$('iPrint').onclick = () => {
  const t = compute(), x = inv.id ? inv : { ...inv }, e = entOf(inv.entity_id) || {};
  $('printArea').innerHTML = `<style>@page { size: A4 ${isHK(e) ? 'landscape' : 'portrait'}; margin: 10mm; }</style>` + renderSheet(x, t);
  const old = document.title; document.title = (inv.number || 'invoice-borrador').replace(/[\\/:*?"<>|]/g, '-');
  if (!inv.number) say(tl('Ojo: aún no está guardada, el PDF sale sin número'));
  setTimeout(() => { window.print(); document.title = old; }, 300);
};
$('iNew').onclick = () => { if (dirty && !confirm(tl('Hay cambios sin guardar. ¿Empezar otra invoice?'))) return; inv = blank(inv?.entity_id); dirty = false; $('iState').textContent = ''; fillForm(); };
$('iDup').onclick = () => { inv = JSON.parse(JSON.stringify({ ...inv, id: null, number: null, date: today() })); inv.due = addDays(inv.date, entOf(inv.entity_id)?.dueDays || 0); delete inv.entity; dirty = true; fillForm(); say(tl('Copia creada: se guardará con un número nuevo')); };
$('iDel').onclick = async () => {
  if (!confirm(tl('¿Eliminar la invoice {n}? Sus artículos dejan de estar marcados como vendidos.', { n: inv.number }))) return;
  await api('invoices/delete', { id: inv.id }); invoices = await api('invoices'); inv = blank(inv.entity_id); dirty = false; fillForm(); renderInvList();
};
$('iSettled').onchange = async () => { if (inv.id) { await setSettled(inv.id, $('iSettled').checked); renderInvList(); say($('iSettled').checked ? tl('Marcada como cobrada') : tl('Marcada como pendiente')); } };
function openInvoice(id) {
  const x = invoices.find(i => i.id === id); if (!x) return;
  if (dirty && !confirm(tl('Hay cambios sin guardar. ¿Abrir otra invoice?'))) return;
  inv = JSON.parse(JSON.stringify(x)); if (!entOf(inv.entity_id) && inv.entity) { /* entidad borrada: se usa la copia */ }
  delete inv.entity; dirty = false; $('iState').textContent = ''; fillForm(); scrollTo({ top: 0, behavior: 'smooth' });
}
function renderInvList() {
  const q = ($('invQ').value || '').toLowerCase();
  const list = [...invoices].reverse().filter(x => !q || JSON.stringify([x.number, x.client?.name, x.client?.company, (x.lines || []).map(l => l.code)]).toLowerCase().includes(q));
  $('invList').innerHTML = `<tr><th>${esc(tl('Número'))}</th><th>${esc(tl('Fecha'))}</th><th>${esc(tl('Entidad'))}</th><th>${esc(tl('Cliente'))}</th><th>${esc(tl('Artículos'))}</th><th class="num">${esc(tl('Total'))}</th><th>${esc(tl('Cobro'))}</th></tr>`
    + (list.length ? list.map(x => `<tr class="clk" data-id="${x.id}"><td><b>${esc(x.number)}</b></td><td>${esc(x.date)}</td><td>${esc(x.entity?.code || entOf(x.entity_id)?.code || '')}</td><td>${esc(cliName(x.client))}</td>
      <td>${x.totals?.n ?? (x.lines || []).length}</td><td class="num">${x.totals ? esc(fmtC(x.totals.payable, x.totals.cur)) : ''}</td>
      <td>${x.settled ? `<span class="badge ok">${esc(tl('cobrada'))}</span>` : isOverdue(x) ? `<span class="badge bad">${esc(tl('vencida'))}</span>` : `<span class="badge">${esc(tl('pendiente'))}</span>`}</td></tr>`).join('') : `<tr><td colspan="6" class="mute">${esc(tl('Aún no hay invoices guardadas.'))}</td></tr>`);
  $('invList').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#inv=' + tr.dataset.id; });
}
$('invQ').oninput = renderInvList;

/* ---------- añadir artículos: pegar, Excel, selección del buscador ---------- */
const CODE_RE = /^(?:[A-Z]{1,3}\d+|\d{5,})$/i, LOT_RE = /^\d+-\d+(-\d+)?$/;
function parseRows(rowsIn) { // [[celdas]] → [{code, lot, price}]
  const out = [];
  for (const cells of rowsIn) {
    const cs = cells.map(x => String(x ?? '').trim()).filter(Boolean); if (!cs.length) continue;
    const code = cs.find(x => CODE_RE.test(x)); if (!code) continue;
    const lot = cs.find(x => LOT_RE.test(x)) || '';
    const nums = cs.filter(x => x !== code && x !== lot && /\d/.test(x) && !/[a-z]{3,}/i.test(x)).map(num).filter(v => !isNaN(v));
    out.push({ code: code.toUpperCase(), lot, price: nums.length ? nums[nums.length - 1] : null });
  }
  return out;
}
async function addParsed(list, srcCur, replace) {
  if (!list.length) return say(tl('No encontré códigos (CTag) en lo pegado'));
  let info = {}; try { info = await api('lookup', { codes: list.map(x => x.code) }); } catch {}
  const e = entOf(inv.entity_id), hk = isHK(e), miss = list.filter(x => !info[x.code]).length;
  if (replace) inv.lines = [];
  for (const x of list) {
    const it = info[x.code] || {}, base = { code: x.code, brand: it.brand || '', details: it.name || '' };
    if (hk) {
      const src = x.price == null ? '' : (srcCur === inv.srcCur ? x.price : rnd(conv(x.price, srcCur, inv.srcCur), inv.srcCur));
      inv.lines.push({ ...base, lot: x.lot, src, status: x.price == null ? 'Passed' : '', desc: hkDesc(base, inv.labels), autoDesc: true });
    } else {
      inv.lines.push({ ...base, qty: 1, price: x.price == null ? '' : rnd(srcCur === inv.currency ? x.price : conv(x.price, srcCur, inv.currency), inv.currency) });
    }
  }
  renderLines(); update(); touch();
  say(tl('{n} artículos añadidos', { n: list.length }) + (miss ? ' · ' + tl('{m} no están en el historial del catálogo (carga la hoja en el buscador para tener marca y descripción)', { m: miss }) : ''), 5000);
}
$('lnPaste').onclick = () => { $('pCur').innerHTML = curOptions(isHK(entOf(inv.entity_id)) ? inv.srcCur : inv.currency); $('pText').value = ''; $('pDlg').style.display = ''; $('pText').focus(); };
$('pCancel').onclick = () => $('pDlg').style.display = 'none';
const splitLine = l => l.includes('\t') ? l.split('\t') : l.includes(';') ? l.split(';') : l.split(/\s+|,(?!\d{3}(?:\D|$))/); // la coma de miles (15,000) no separa
$('pOk').onclick = () => { $('pDlg').style.display = 'none'; addParsed(parseRows($('pText').value.split(/\r?\n/).map(splitLine)), $('pCur').value, $('pReplace').checked); };
$('lnFile').onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    let table;
    if (/\.(csv|tsv)$/i.test(f.name)) table = (await f.text()).split(/\r?\n/).map(splitLine);
    else { const wb = XLSX.read(await f.arrayBuffer()); table = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }); }
    const cur = isHK(entOf(inv.entity_id)) ? inv.srcCur : inv.currency;
    addParsed(parseRows(table), cur, false);
  } catch (e) { say(tl('No se pudo leer el archivo: {e}', { e: e.message })); }
};
function checkDraft() {
  const d = JSON.parse(store.get('invoiceDraft', 'null') || 'null');
  $('lnDraft').style.display = d?.lines?.length ? '' : 'none';
  if (d?.lines?.length) $('lnDraft').textContent = tl('⬇ Usar la selección del buscador ({n})', { n: d.lines.length });
  return d;
}
function useDraft() {
  const d = checkDraft(); if (!d) return;
  const hk = isHK(entOf(inv.entity_id));
  d.lines.forEach(l => {
    const base = { code: l.code, brand: l.brand, details: l.details };
    if (hk) inv.lines.push({ ...base, src: l.priceUSD == null ? '' : rnd(conv(l.priceUSD, 'USD', inv.srcCur), inv.srcCur), status: '', desc: hkDesc(base, inv.labels), autoDesc: true });
    else inv.lines.push({ ...base, qty: 1, usd: l.priceUSD, price: l.priceUSD == null ? '' : rnd(conv(l.priceUSD, 'USD', inv.currency), inv.currency) });
  });
  store.set('invoiceDraft', ''); checkDraft(); renderLines(); update(); touch();
  say(tl('{n} artículos del buscador añadidos (precio con el margen{p})', { n: d.lines.length, p: d.profile ? ' «' + d.profile + '»' : '' }), 4000);
}
$('lnDraft').onclick = useDraft;

/* ============ clientes ============ */
const CF = [['company', 'Empresa / tienda'], ['name', 'Nombre de contacto'], ['ref', 'Referencia para la numeración (ej. ALOPRINT)'], ['email', 'Email'], ['phone', 'Teléfono'],
  ['address', 'Dirección (envío)', 'area'], ['country', 'País'], ['companyNo', 'Company No'], ['vatNo', 'VAT No'], ['regNo', 'Nº de registro'],
  ['entity', 'Entidad habitual', 'ent'], ['commissionPct', 'Comisión % (HK, si no es la de la entidad)'], ['invStart', 'Empezar numeración en (si ya tenía invoices)'],
  ['pct', 'Margen % (buscador y Excel)'], ['fee', '+ tarifa fija'], ['feeCur', 'Moneda de la tarifa', 'cur'], ['outCur', 'Moneda del cliente', 'cur'], ['round', 'Redondear a (0 = no)'],
  ['wishlist', 'Lista de deseos (lo que busca; se usa para las alertas y el catálogo mensual)', 'area'], ['notes', 'Notas', 'area']];
let editingCli = null;
function openClient(c) {
  editingCli = c ? { ...c } : {};
  $('cDlgT').textContent = c ? tl('Cliente') : tl('Cliente nuevo'); $('cDel').style.display = c ? '' : 'none';
  $('cForm').innerHTML = CF.map(([k, lbl, ty]) => `<label class="col" ${ty === 'area' ? 'style="grid-column:1/-1"' : ''}>${esc(tl(lbl))}${
    ty === 'area' ? `<textarea data-k="${k}" rows="${k === 'wishlist' ? 5 : 3}">${esc(editingCli[k] || '')}</textarea>`
    : ty === 'ent' ? `<select data-k="${k}"><option value="">—</option>${ents.map(e => `<option value="${e.id}"${e.id === +editingCli[k] ? ' selected' : ''}>${esc(e.code)}</option>`).join('')}</select>`
    : ty === 'cur' ? `<select data-k="${k}"><option value="">—</option>${curOptions(editingCli[k] || '')}</select>`
    : `<input data-k="${k}" value="${esc(editingCli[k] ?? '')}">`}</label>`).join('');
  $('cDlg').style.display = '';
}
$('cCancel').onclick = () => $('cDlg').style.display = 'none';
$('cSave').onclick = async () => {
  $('cForm').querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k, v = i.value.trim(); editingCli[k] = ['pct', 'fee', 'round', 'commissionPct', 'invStart'].includes(k) && v !== '' ? num(v) : v; });
  if (!editingCli.company && !editingCli.name) return say(tl('Pon al menos el nombre o la empresa'));
  const { id } = await api('clients/save', editingCli); clients = await api('clients'); $('cDlg').style.display = 'none';
  if (inv && (!inv.client_id || inv.client_id === id) && $('t-inv').style.display !== 'none') { inv.client_id = id; const c = cliOf(id); if (!inv.id && c?.entity && +c.entity !== inv.entity_id && !inv.lines.length) { $('iEnt').value = c.entity; $('iEnt').onchange(); } }
  if (inv) fillForm(); renderClients(); if ($('t-cli').style.display !== 'none') showClient(id); say(tl('Cliente guardado'));
};
$('cDel').onclick = async () => { if (!confirm(tl('¿Eliminar este cliente? Sus invoices guardadas se conservan.'))) return; await api('clients/delete', { id: editingCli.id }); clients = await api('clients'); $('cDlg').style.display = 'none'; location.hash = '#cli'; renderClients(); $('cDetail').innerHTML = ''; fillForm(); };
$('cNew').onclick = () => openClient(null); $('iCliNew').onclick = () => openClient(null); $('iCliEdit').onclick = () => openClient(cliOf(inv.client_id));
let catalogs = [], statusAll = { status: {}, offers: {} }, curCli = null;
async function loadCatalogs() { try { [catalogs, statusAll] = await Promise.all([api('catalogs'), api('status')]); } catch {} }
const usdOf = (v, cur) => { const x = conv(v, cur, 'USD'); return isNaN(x) ? 0 : x; };
function renderClients() {
  const q = ($('cQ').value || '').toLowerCase(), list = clients.filter(c => !q || JSON.stringify(c).toLowerCase().includes(q)).sort((a, b) => cliName(a).localeCompare(cliName(b)));
  const nInv = id => invoices.filter(i => i.client_id === id).length;
  $('cList').innerHTML = list.length ? list.map(c => `<div class="cli-item${c.id === curCli ? ' on' : ''}" data-id="${c.id}"><b>${esc(cliName(c))}</b>
      <small>${esc([c.country, nInv(c.id) ? tl('{n} invoices', { n: nInv(c.id) }) : '', c.wishlist ? '⭐ ' + tl('lista de deseos') : '', c.pct != null && c.pct !== '' ? '+' + c.pct + '%' : ''].filter(Boolean).join(' · '))}</small></div>`).join('')
    : `<p class="mute">${esc(tl('Aún no hay clientes. Crea el primero con «＋ Cliente nuevo».'))}</p>`;
  $('cList').querySelectorAll('[data-id]').forEach(d => d.onclick = () => { location.hash = '#cli=' + d.dataset.id; });
}
$('cQ').oninput = renderClients;
const card = (code, top, sub) => `<div class="pcard"><img src="${esc(photo(code))}" loading="lazy" onerror="this.style.visibility='hidden'"><div><b>${esc(top)}</b>${esc(sub)}<br><span class="mute">${esc(code)}</span></div></div>`;
async function showClient(id) {
  const c = cliOf(id); if (!c) return; curCli = c.id; renderClients();
  await loadCatalogs();
  const invs = invoices.filter(i => i.client_id === c.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const bought = invs.flatMap(i => (i.lines || []).filter(l => l.code && l.status !== 'Passed').map(l => ({ ...l, inv: i })));
  const spent = invs.reduce((a, i) => a + usdOf(i.totals?.payable || 0, i.totals?.cur || i.currency), 0);
  const cats = catalogs.filter(k => k.client_id === c.id).sort((a, b) => b.at - a.at);
  const reserved = Object.entries(statusAll.status).filter(([, v]) => v.s === 'reserved' && v.client_id === c.id);
  const margin = c.pct != null && c.pct !== '' ? `+${c.pct}%${+c.fee ? ' + ' + c.fee + ' ' + (c.feeCur || '') : ''}${c.outCur ? ' · ' + c.outCur : ''}` : tl('sin margen definido');
  const lineTotal = l => l.inv.entity?.template === 'hk' ? '' : fmtC(num(l.price), l.inv.currency);
  $('cDetail').innerHTML = `<div class="panel" style="margin:0 0 14px">
      <div class="row"><h2 style="margin:0;font-size:18px">${esc(cliName(c))}</h2><span class="badge">${esc(margin)}</span>
        <span style="margin-left:auto"></span><button id="cdEdit">✎ ${esc(tl('Editar ficha'))}</button></div>
      <div class="mute">${esc([c.email, c.phone, c.country].filter(Boolean).join(' · '))}</div>
      ${c.address ? `<div class="mute" style="white-space:pre-line;margin-top:4px">${esc(c.address)}</div>` : ''}
      <div class="row" style="margin-top:10px">
        <a class="btn primary" href="index.html#catalog=${c.id}">📦 ${esc(tl('Catálogo mensual'))}</a>
        <a class="btn" href="index.html" id="cdSearch">🔎 ${esc(tl('Buscar con su margen'))}</a>
        <a class="btn" href="#inv=new:${c.id}">🧾 ${esc(tl('Nueva invoice'))}</a></div>
      <div class="tiles" style="margin:12px 0 0">
        <div class="tile"><div class="k">${esc(tl('Comprado (USD)'))}</div><div class="v">${esc(fmtC(spent, 'USD'))}</div><div class="s">${esc(tl('{n} invoices · {m} artículos', { n: invs.length, m: bought.length }))}</div></div>
        <div class="tile"><div class="k">${esc(tl('Catálogos enviados'))}</div><div class="v">${cats.length}</div><div class="s">${cats[0] ? esc(tl('último: {d}', { d: new Date(cats[0].at * 1000).toLocaleDateString() })) : ''}</div></div>
        <div class="tile"><div class="k">${esc(tl('Reservados'))}</div><div class="v">${reserved.length}</div></div></div></div>
    <div class="panel"><h2>⭐ ${esc(tl('Lista de deseos'))}</h2>
      <textarea id="cdWish" rows="5" placeholder="${esc(tl('Ej.: Hermès Birkin 25-30 en colores neutros, A o mejor, hasta 15.000 USD; Chanel Classic Flap negro…'))}">${esc(c.wishlist || '')}</textarea>
      <div class="row" style="margin-top:6px"><button class="primary" id="cdWishSave">${esc(tl('Guardar lista de deseos'))}</button><span class="hint">${esc(tl('Con cada carga de la hoja, la app avisa en el Inicio de las novedades que encajan.'))}</span></div></div>
    <div class="panel"><h2>🛍 ${esc(tl('Lo que ha comprado'))}</h2>${bought.length ? `<div class="pgrid">${bought.map(l => card(l.code, l.brand || l.desc || '', ` ${l.details || ''} · ${lineTotal(l)} · ${l.inv.date} · ${l.inv.number}`)).join('')}</div>` : `<p class="mute">${esc(tl('Todavía nada.'))}</p>`}</div>
    <div class="panel"><h2>📦 ${esc(tl('Catálogos enviados'))}</h2>${cats.length ? cats.map(k => `<details style="border-bottom:1px solid var(--line);padding:6px 0"><summary><b>${esc(new Date(k.at * 1000).toLocaleDateString())}</b> · ${esc(tl('{n} artículos', { n: k.n }))}${k.label ? ' · <span class="mute">' + esc(k.label.slice(0, 80)) + '</span>' : ''}
        <button data-delcat="${k.id}" style="float:right" title="${esc(tl('Borrar: esos artículos dejan de contar como enviados'))}">✕</button></summary>
        <div class="pgrid" style="margin-top:8px">${(k.items || []).map(i => card(i.code, i.brand || '', ` ${i.name || ''}${i.price != null ? ' · ' + fmtC(i.price, i.cur || 'USD') : ''}`)).join('')}</div></details>`).join('') : `<p class="mute">${esc(tl('Se registran solos cuando descargas un Excel en el buscador con este cliente elegido.'))}</p>`}</div>
    ${reserved.length ? `<div class="panel"><h2>🔖 ${esc(tl('Reservados'))}</h2><div class="pgrid">${reserved.map(([code, v]) => card(code, v.note || tl('Reservado'), ' ' + new Date(v.at * 1000).toLocaleDateString())).join('')}</div></div>` : ''}`;
  $('cdEdit').onclick = () => openClient(c);
  $('cdSearch').onclick = () => { store.set('profileId', String(c.id)); if (c.outCur) store.set('outCur', c.outCur); store.flush(); };
  $('cdWishSave').onclick = async () => { await api('clients/save', { ...c, wishlist: $('cdWish').value.trim() }); clients = await api('clients'); say(tl('Lista de deseos guardada. Las alertas se recalculan en la próxima carga de la hoja.'), 4000); renderClients(); };
  $('cDetail').querySelectorAll('[data-delcat]').forEach(b => b.onclick = async e => { e.preventDefault(); if (!confirm(tl('¿Borrar este catálogo? Sus artículos dejarán de contar como enviados a este cliente.'))) return; await api('catalogs/delete', { id: +b.dataset.delcat }); showClient(c.id); });
}

/* ============ inicio ============ */
let bgStarted = false;
function startBg() { // actualiza la hoja en segundo plano (historial y alertas) sin salir del Inicio
  if (bgStarted || !store.get('url', '') || store.get('autoLoad', '1') !== '1') return;
  bgStarted = true; $('hUpd').textContent = tl('· actualizando catálogo…'); $('bgLoad').src = 'index.html?bg=1';
}
addEventListener('message', async e => {
  if (e.origin !== location.origin || e.data?.cf !== 'loaded') return;
  await store.reload(); $('hUpd').textContent = tl('· catálogo actualizado'); if ($('t-home').style.display !== 'none') renderHome();
});
const isOverdue = i => !i.settled && i.due && i.due < today();
async function renderHome() {
  startBg(); await loadCatalogs();
  const alertsD = JSON.parse(store.get('alerts', 'null') || 'null'), ln = JSON.parse(store.get('lastNews', 'null') || 'null');
  const pend = invoices.filter(i => !i.settled), over = pend.filter(isOverdue);
  const pendUSD = pend.reduce((a, i) => a + usdOf(i.totals?.payable || 0, i.totals?.cur || i.currency), 0);
  const month = today().slice(0, 7), soldM = invoices.filter(i => (i.date || '').startsWith(month)).reduce((a, i) => a + usdOf(i.totals?.payable || 0, i.totals?.cur || i.currency), 0);
  const withAlerts = (alertsD?.list || []).filter(a => a.codes.length);
  const tile = (k, v, sub, href, bad) => `<a class="tile" href="${href}" style="text-decoration:none;color:inherit"><div class="k">${esc(k)}</div><div class="v${bad ? ' bad' : ''}">${esc(v)}</div><div class="s">${esc(sub)}</div></a>`;
  $('hTiles').innerHTML = tile(tl('Novedades'), ln ? String(ln.new) : '—', ln ? tl('{d} bajan de precio · {g} ya no están', { d: ln.down, g: ln.gone }) : tl('carga la hoja en el buscador'), 'index.html#new')
    + tile(tl('Para tus clientes'), String(withAlerts.reduce((a, x) => a + x.codes.length, 0)), tl('{n} clientes con novedades', { n: withAlerts.length }), '#cli')
    + tile(tl('Pendiente de cobro'), fmtC(pendUSD, 'USD'), over.length ? tl('{n} invoices · {m} vencidas', { n: pend.length, m: over.length }) : tl('{n} invoices', { n: pend.length }), '#inv', over.length)
    + tile(tl('Vendido este mes'), fmtC(soldM, 'USD'), tl('{n} invoices en total', { n: invoices.length }), '#inv');
  // alertas y catálogos mensuales
  const wish = clients.filter(c => (c.wishlist || '').trim()), lastCat = id => catalogs.filter(k => k.client_id === id).sort((a, b) => b.at - a.at)[0];
  $('hAlerts').innerHTML = wish.length ? wish.map(c => {
    const a = (alertsD?.list || []).find(x => +x.id === c.id), lc = lastCat(c.id);
    const info = a?.needsPlan ? `<span class="hint">${esc(tl('Pulsa «Catálogo mensual» una vez para que la IA entienda su lista'))}</span>`
      : a?.codes.length ? `<span class="badge ok">${esc(tl('{n} nuevos', { n: a.codes.length }))}</span><span class="thumbs">${a.codes.slice(0, 6).map(k => `<img class="thumb" src="${esc(photo(k))}" onerror="this.style.visibility='hidden'">`).join('')}</span>`
      : `<span class="mute">${esc(tl('sin novedades'))}</span>`;
    return `<div class="alert"><span class="who"><a href="#cli=${c.id}" style="color:inherit">${esc(cliName(c))}</a><br><small class="mute">${lc ? esc(tl('último envío {d}', { d: new Date(lc.at * 1000).toLocaleDateString() })) : esc(tl('nunca enviado'))}</small></span>${info}
      <span style="margin-left:auto;display:flex;gap:6px">${a?.codes.length ? `<a class="btn" href="index.html#wish=${c.id}">${esc(tl('Ver'))}</a>` : ''}<a class="btn primary" href="index.html#catalog=${c.id}">📦 ${esc(tl('Catálogo mensual'))}</a></span></div>`;
  }).join('') : `<p class="mute">${esc(tl('Escribe la lista de deseos en la ficha de cada cliente y aquí verás qué novedades encajan con cada uno.'))}</p>`;
  // novedades con foto
  if (ln?.load && ln.new) {
    const det = (await api('load?id=' + ln.load)).filter(r => r.kind === 'new').slice(0, 12);
    $('hNew').innerHTML = `<div class="pgrid">${det.map(r => card(r.code, r.brand || '', ` ${(r.name || '').slice(0, 40)}${r.price != null ? ' · ' + fmtN(r.price, r.cur) + ' ' + (r.cur || '') : ''}`)).join('')}</div>
      <div class="row" style="margin-top:8px"><a class="btn" href="index.html#new">${esc(tl('Ver los {n} en el buscador', { n: ln.new }))}</a><span class="hint">${ln.since ? esc(tl('desde la carga del {d}', { d: new Date(ln.since * 1000).toLocaleDateString() })) : ''}</span></div>`;
  } else $('hNew').innerHTML = `<p class="mute">${esc(ln ? tl('Sin novedades en la última carga.') : tl('Carga la hoja en el buscador: desde la segunda carga verás aquí lo nuevo.'))}</p>`;
  // cobros
  $('hDue').innerHTML = pend.length ? `<table class="list">${pend.sort((a, b) => (a.due || '').localeCompare(b.due || '')).map(i => `<tr class="clk" data-id="${i.id}"><td><b>${esc(i.number)}</b><br><small class="mute">${esc(cliName(i.client))}</small></td>
      <td>${isOverdue(i) ? `<span class="badge bad">${esc(tl('vencida {d}', { d: i.due }))}</span>` : `<span class="badge">${esc(tl('vence {d}', { d: i.due || '—' }))}</span>`}</td>
      <td class="num">${esc(fmtC(i.totals?.payable || 0, i.totals?.cur || i.currency))}</td><td><button data-paid="${i.id}" title="${esc(tl('Marcar como cobrada'))}">✓</button></td></tr>`).join('')}</table>`
    : `<p class="mute">${esc(tl('Todo cobrado. 🎉'))}</p>`;
  $('hDue').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = e => { if (!e.target.dataset.paid) location.hash = '#inv=' + tr.dataset.id; });
  $('hDue').querySelectorAll('[data-paid]').forEach(b => b.onclick = async e => { e.stopPropagation(); await setSettled(+b.dataset.paid, true); renderHome(); });
  renderChart();
}
async function setSettled(id, on) {
  const x = invoices.find(i => i.id === id); if (!x) return;
  await api('invoices/save', { ...x, settled: on, settledAt: on ? today() : null }); invoices = await api('invoices');
  if (inv?.id === id) { inv.settled = on; inv.settledAt = on ? today() : null; $('iSettled').checked = on; }
}
function renderChart() { // ventas por mes y entidad, últimos 12 meses, en USD (barras apiladas)
  const months = [...Array(12)].map((_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 11 + i); return d.toISOString().slice(0, 7); });
  const codes = [...new Set(ents.map(e => e.code))].slice(0, 3), col = i => `var(--series-${i + 1})`;
  const data = months.map(m => { const o = { m }; codes.forEach(c => o[c] = 0); invoices.filter(i => (i.date || '').startsWith(m)).forEach(i => { const c = i.entity?.code || entOf(i.entity_id)?.code; if (c in o) o[c] += usdOf(i.totals?.payable || 0, i.totals?.cur || i.currency); }); o.t = codes.reduce((a, c) => a + o[c], 0); return o; });
  const max = Math.max(...data.map(d => d.t)), W = 560, H = 190, P = { l: 46, r: 6, t: 8, b: 22 }, bw = (W - P.l - P.r) / 12, iw = bw - 8;
  if (!max) { $('hChart').innerHTML = `<p class="mute">${esc(tl('Las ventas aparecerán aquí cuando guardes invoices.'))}</p>`; return; }
  const nice = v => { const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }, top = nice(max), y = v => P.t + (H - P.t - P.b) * (1 - v / top);
  const short = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.0', '') + 'k' : String(Math.round(v));
  let svg = [0, .5, 1].map(f => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="var(--grid)" stroke-width="1"/><text x="${P.l - 6}" y="${y(top * f) + 4}" text-anchor="end">$${short(top * f)}</text>`).join('');
  data.forEach((d, i) => {
    const x = P.l + i * bw + 4; let base = 0; const segs = codes.map((c, k) => ({ c, k, v: d[c] })).filter(s => s.v > 0);
    segs.forEach((s, j) => { const y0 = y(base), y1 = y(base + s.v), h = Math.max(1, y0 - y1 - (j ? 2 : 0)), r = j === segs.length - 1 ? 4 : 0;
      svg += `<path d="M${x},${y0 - (j ? 2 : 0)} v${-(h - r)} ${r ? `q0,-${r} ${r},-${r} h${iw - 2 * r} q${r},0 ${r},${r}` : `h${iw}`} v${h - r} z" fill="${col(s.k)}"/>`; base += s.v; });
    svg += `<rect x="${P.l + i * bw}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-i="${i}"/><text x="${x + iw / 2}" y="${H - 6}" text-anchor="middle">${d.m.slice(5)}</text>`;
  });
  $('hChart').innerHTML = `<div class="legend">${codes.map((c, k) => `<span><i style="background:${col(k)}"></i>${esc(c)}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(tl('Ventas por mes (USD)'))}">${svg}</svg>
    <details><summary class="hint">${esc(tl('Ver tabla'))}</summary><table class="list"><tr><th>${esc(tl('Mes'))}</th>${codes.map(c => `<th class="num">${esc(c)}</th>`).join('')}<th class="num">${esc(tl('Total'))}</th></tr>
    ${data.filter(d => d.t).map(d => `<tr><td>${d.m}</td>${codes.map(c => `<td class="num">${esc(fmtC(d[c], 'USD'))}</td>`).join('')}<td class="num"><b>${esc(fmtC(d.t, 'USD'))}</b></td></tr>`).join('')}</table></details>`;
  const tip = $('vtip');
  $('hChart').querySelectorAll('rect[data-i]').forEach(r => { r.onmousemove = e => { const d = data[+r.dataset.i];
      tip.innerHTML = `<b>${d.m}</b><br>` + codes.filter(c => d[c]).map((c, k) => `<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${col(codes.indexOf(c))};margin-right:5px"></i>${esc(c)}: ${esc(fmtC(d[c], 'USD'))}`).join('<br>') + `<br><b>${esc(tl('Total'))}: ${esc(fmtC(d.t, 'USD'))}</b>`;
      tip.style.display = 'block'; tip.style.left = Math.min(e.clientX + 12, innerWidth - 200) + 'px'; tip.style.top = e.clientY + 12 + 'px'; };
    r.onmouseleave = () => tip.style.display = 'none'; });
}

/* ============ entidades ============ */
const EF = [['code', 'Código (UK, JP, HK…)'], ['template', 'Plantilla', 'tpl'], ['name', 'Nombre de la empresa'], ['title', 'Título del documento'], ['address', 'Dirección', 'area'],
  ['phone', 'Teléfono'], ['website', 'Web'], ['ids', 'Registros (Company Number, VAT, EORI, TaxID…)', 'area'], ['currency', 'Moneda por defecto', 'cur'], ['dueDays', 'Días hasta el vencimiento'],
  ['numbering', 'Numeración', 'numb'], ['numPrefix', 'Prefijo del número'], ['numPad', 'Dígitos del número (relleno con ceros)'], ['nextNumber', 'Empezar en el número'],
  ['shipping', 'Texto de envío por defecto'], ['terms', 'Terms por defecto'], ['taxLabel', 'Nombre del impuesto'], ['taxPct', 'Impuesto % por defecto'], ['deductionLabel', 'Texto de «ya pagado»'],
  ['commissionPct', 'Comisión % (HK)'], ['labels', 'Idioma (HK)', 'lab'], ['ccText', 'Texto junto al logo', 'area'], ['notice', 'Aviso arriba a la izquierda', 'area'],
  ['bank', 'Datos bancarios', 'area'], ['sideNotes', 'Notas a la derecha del banco', 'area'], ['legal', 'Texto legal al pie', 'area'], ['logo', 'Logo', 'logo']];
let editingEnt = null;
function renderEntForm(id) {
  $('eSel').innerHTML = ents.map(e => `<option value="${e.id}">${esc(e.code)} · ${esc(e.name || '')}</option>`).join('');
  editingEnt = { ...(entOf(id ?? $('eSel').value) || ents[0] || {}) }; $('eSel').value = editingEnt.id || '';
  const sel = (k, opts) => `<select data-k="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(editingEnt[k] ?? '') === v ? ' selected' : ''}>${esc(tl(l))}</option>`).join('')}</select>`;
  $('eForm').innerHTML = `<div class="grid2">${EF.map(([k, lbl, ty]) => `<label class="col" ${ty === 'area' ? 'style="grid-column:1/-1"' : ''}>${esc(tl(lbl))}${
    ty === 'area' ? `<textarea data-k="${k}" rows="${['legal', 'bank'].includes(k) ? 7 : 3}">${esc(editingEnt[k] || '')}</textarea>`
    : ty === 'tpl' ? sel(k, [['uk', 'UK (Invoice europea)'], ['jp', 'JP (請求書)'], ['hk', 'HK (subasta LBA)']])
    : ty === 'numb' ? sel(k, [['client', 'Por cliente (CLIENTE 0001)'], ['global', 'Correlativo (1, 2, 3…)'], ['stamp', 'Fecha y hora (invoice-cliente-fecha)']])
    : ty === 'lab' ? sel(k, [['ja', '日本語'], ['en', 'English']])
    : ty === 'cur' ? `<select data-k="${k}">${curOptions(editingEnt[k] || 'USD')}</select>`
    : ty === 'logo' ? `<span class="row" style="margin:0">${editingEnt.logo ? `<img src="${editingEnt.logo}" style="max-height:50px;background:#fff">` : ''}<input type="file" accept="image/*" id="eLogo"><button id="eLogoDel">${esc(tl('Quitar'))}</button></span>`
    : `<input data-k="${k}" value="${esc(editingEnt[k] ?? '')}">`}</label>`).join('')}</div>`;
  $('eLogo').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { editingEnt.logo = r.result; collectEnt(); renderEntForm(editingEnt.id); }; r.readAsDataURL(f); };
  $('eLogoDel').onclick = () => { collectEnt(); editingEnt.logo = ''; renderEntForm(editingEnt.id); };
  $('eState').textContent = '';
}
function collectEnt() { $('eForm').querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k, v = i.value; editingEnt[k] = ['dueDays', 'taxPct', 'commissionPct', 'numPad', 'nextNumber'].includes(k) ? (v === '' ? '' : num(v)) : v; }); }
$('eSel').onchange = () => renderEntForm($('eSel').value);
$('eSave').onclick = async () => {
  const keepLogo = editingEnt.logo; collectEnt(); editingEnt.logo = keepLogo || editingEnt.logo;
  if (!editingEnt.code) return say(tl('Pon un código a la entidad'));
  const { id } = await api('entities/save', editingEnt); ents = await api('entities'); renderEntForm(id); $('eState').innerHTML = `<span class="ok">${esc(tl('✓ Guardado'))}</span>`; if (inv) fillForm();
};
$('eNew').onclick = () => { editingEnt = { code: '', template: 'uk', currency: 'USD', numbering: 'global', dueDays: 4 }; ents.push({ ...editingEnt, id: -1 }); renderEntForm(-1); ents = ents.filter(e => e.id !== -1); delete editingEnt.id; };
$('eExport').onclick = () => { const b = new Blob([JSON.stringify({ entities: ents.map(({ id, ...e }) => e) }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'entidades.json'; a.click(); };
$('eImport').onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try { const d = JSON.parse(await f.text()), list = d.entities || d; const { n } = await api('entities/import', { entities: list }); ents = await api('entities'); renderEntForm(); if (inv) fillForm(); say(tl('{n} entidades importadas', { n })); }
  catch (e) { say(tl('No se pudo leer el archivo: {e}', { e: e.message })); }
};

/* ============ novedades ============ */
async function renderNews() {
  const list = await api('loads');
  const d = s => new Date(s * 1000).toLocaleString();
  $('nList').innerHTML = `<tr><th>${esc(tl('Fecha'))}</th><th>${esc(tl('Hoja'))}</th><th>${esc(tl('Artículos'))}</th><th>${esc(tl('Nuevos'))}</th><th>${esc(tl('Bajan de precio'))}</th><th>${esc(tl('Ya no están'))}</th></tr>`
    + (list.length ? list.map(l => `<tr class="clk" data-id="${l.id}"><td>${esc(d(l.at))}</td><td class="mute">${esc(String(l.source).slice(0, 60))}</td><td>${l.n}</td><td><b>${l.new || 0}</b></td><td>${l.down || 0}</td><td>${l.gone || 0}</td></tr>`).join('')
      : `<tr><td colspan="6" class="mute">${esc(tl('Todavía no hay cargas. Carga tu hoja en el buscador.'))}</td></tr>`);
  $('nList').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => newsDetail(+tr.dataset.id, tr.children[0].textContent));
}
async function newsDetail(id, when) {
  const rows = await api('load?id=' + id), K = { new: tl('🆕 nuevo'), down: tl('📉 baja'), gone: tl('ya no está') };
  $('nDetailBox').style.display = ''; $('nDetailT').textContent = tl('Cambios de la carga del {d}', { d: when });
  $('nDetail').innerHTML = `<tr><th></th><th>CTag</th><th>${esc(tl('Marca'))}</th><th>${esc(tl('Descripción'))}</th><th>${esc(tl('Estado'))}</th><th>${esc(tl('Cambio'))}</th><th class="num">${esc(tl('Precio'))}</th></tr>`
    + rows.map(r => `<tr><td><img class="thumb" src="${esc(photo(r.code))}" onerror="this.style.visibility='hidden'"></td><td>${esc(r.code)}</td><td>${esc(r.brand || '')}</td><td>${esc(r.name || '')}</td><td>${esc(r.grade || '')}</td>
      <td>${esc(K[r.kind] || r.kind)}</td><td class="num">${r.kind === 'down' ? `<s class="mute">${esc(fmtN(r.old, r.cur))}</s> ${esc(fmtN(r.new, r.cur))}` : esc(r.price != null ? fmtN(r.price, r.cur) : '')} ${esc(r.cur || '')}</td></tr>`).join('');
  $('nDetailBox').scrollIntoView({ behavior: 'smooth' });
}

/* ============ idioma ============ */
const _tn = [];
function captureI18n() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => /\S/.test(n.nodeValue) && !['SCRIPT', 'STYLE'].includes(n.parentNode.nodeName) && !n.parentNode.closest('#preview,#printArea,table,#eForm,#cForm') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  while (w.nextNode()) _tn.push({ n: w.currentNode, es: w.currentNode.nodeValue });
  document.querySelectorAll('[placeholder],[title]').forEach(el => ['placeholder', 'title'].forEach(a => { if (el.hasAttribute(a)) _tn.push({ el, a, es: el.getAttribute(a) }); }));
}
function applyI18n() {
  for (const x of _tn) {
    if (x.n) { const m = x.es.match(/^(\s*)([\s\S]*?)(\s*)$/); x.n.nodeValue = m[1] + tl(m[2]) + m[3]; }
    else x.el.setAttribute(x.a, tl(x.es));
  }
  document.documentElement.lang = lang;
}
$('langSel').innerHTML = Object.entries(window.LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); $('langSel').value = lang;
$('langSel').onchange = () => { lang = $('langSel').value; store.set('lang', lang); applyI18n(); fillForm(); renderInvList(); route(); };

/* ============ arranque ============ */
(async () => {
  captureI18n(); applyI18n();
  try { const r = await fetch('/rates'); if (r.ok) rates = (await r.json()).rates; } catch {}
  try { await loadAll(); }
  catch (e) { document.querySelector('.wrap').innerHTML = `<div class="panel err">${esc(tl('El back office necesita la app abierta con python server.py ({e})', { e: e.message }))}</div>`; return; }
  inv = blank(); fillForm(); checkDraft(); route();
  addEventListener('focus', () => { checkDraft(); });
  addEventListener('beforeunload', ev => { if (dirty && !inv.id && inv.lines.length) { ev.preventDefault(); ev.returnValue = ''; } });
})();
