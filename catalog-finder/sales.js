/* 📊 Ventas: importa el snapshot de vendidos (cada mes), calcula el margen de cada venta (lo que os llega − PAT)
   con el tipo de cambio del día de la venta, lo cruza con el stock del buscador y genera el informe mensual. */
'use strict';

/* ---------- utilidades ---------- */
const SYMS = { '$': 'USD', 'US$': 'USD', 'USD': 'USD', '¥': 'JPY', '円': 'JPY', 'JPY': 'JPY', 'YEN': 'JPY', 'HK$': 'HKD', 'HKD': 'HKD', '元': 'CNY', 'RMB': 'CNY', 'CNY': 'CNY',
  '£': 'GBP', 'GBP': 'GBP', '€': 'EUR', 'EUR': 'EUR', 'S$': 'SGD', 'SGD': 'SGD', 'A$': 'AUD', 'AUD': 'AUD', 'C$': 'CAD', 'CAD': 'CAD', '₩': 'KRW', 'KRW': 'KRW', 'NT$': 'TWD', 'TWD': 'TWD', 'CHF': 'CHF' };
const curCode = v => { const k = String(v ?? '').trim(); return SYMS[k] || SYMS[k.toUpperCase()] || ''; };
const numOrNull = v => { const s = String(v ?? '').trim(); if (!s || !/\d/.test(s)) return null; const n = num(s); return isNaN(n) ? null : n; };
const pad2 = x => String(x).padStart(2, '0');
function isoDT(v) { // fecha (y hora si la hay) en formato ISO; '' si no se entiende
  const s = String(v ?? '').trim(); if (!s) return ''; let m;
  const out = (y, mo, d, h, mi, se) => +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31 ? `${y}-${pad2(mo)}-${pad2(d)}` + (h != null ? ` ${pad2(h)}:${pad2(mi)}:${pad2(se || 0)}` : '') : '';
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return out(m[1], m[2], m[3], m[4], m[5], m[6]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) { const a = +m[1], b = +m[2]; const [d, mo] = a > 12 ? [a, b] : [b, a]; return out(m[3], mo, d, m[4], m[5], m[6]); }
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date((parseFloat(s) - 25569) * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const t = Date.parse(s); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}
const dayMs = d => Date.parse(d.slice(0, 10) + 'T00:00:00Z');
const addDaysISO = (d, n) => new Date(dayMs(d) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 864e5);
const endOfMonth = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
const shiftMonth = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%';
const S_CATS = [['Bolsos', /\bbag|backpack|briefcase|luggage|pouch|tote|clutch|satchel|boston|handbag/i], ['Pequeña marroquinería', /wallet|small leather|coin|key|card|cigarette|purse/i],
  ['Joyería y relojes', /jewel|charm|ring|necklace|bracelet|earring|watch|brooch/i], ['Accesorios', /accessor|scarf|sunglass|strap|textile|belt|hat|glove|\btie\b|stole|shawl/i],
  ['Ropa y calzado', /cloth|footwear|shoe|apparel|dress|coat|jacket/i]];
const cleanType = t => String(t || '').replace(/\s*\((?:used|new|unused)[^)]*\)\s*$/i, '').replace(/\s*\(used, no money inside\)/i, '').trim();
const sCat = t => !t ? '' : (S_CATS.find(([, re]) => re.test(t)) || ['Otros'])[0];
const GR_ALT = '(B\\+|B-|B\\.C\\.?|(?:SA\\s+with\\s+tags|SA|S|AB|A|BC|B|C|N)(?![A-Za-z]))', GR_TXT = new RegExp('GRADING:\\s*' + GR_ALT, 'i'), GR_ONLY = new RegExp('^' + GR_ALT, 'i');
const gradeOf = t => { t = String(t ?? '').trim(); const m = t.match(GR_TXT) || t.match(GR_ONLY); if (!m) return ''; const g = m[1].toUpperCase().replace(/\s+WITH\s+TAGS/, '').replace(/\./g, ''); return g === 'N' ? 'SA' : g; }; // «N (New with Tags)» cuenta como SA, igual que en el buscador
const GRADE_ORDER = ['SA', 'S', 'A', 'AB', 'B+', 'B', 'B-', 'BC', 'C'];
const BANDS = [[0, 100, '< $100'], [100, 300, '$100–300'], [300, 1000, '$300–1k'], [1000, 3000, '$1k–3k'], [3000, Infinity, '> $3k']];
const bandOf = u => u == null ? '' : BANDS.find(([a, b]) => u >= a && u < b)[2];

/* ---------- estado ---------- */
const SV = { loaded: false, sales: [], fxDates: [], fxMap: {}, imports: [], approx: false, stock: null, colors: new Map(), view: 'sum',
  cur: store.get('salesCur', 'USD'), period: store.get('salesPeriod', 'all'), from: '', to: '', cmp: store.get('salesCmp', 'prev'),
  rankDim: 'brand', rankSort: ['rev', -1], rankAll: false, itemsSort: ['d', -1], itemsPage: 0, itemsQ: '', itemsIssue: '',
  stockWin: 180, stockDim: 'brandcat', stockSig: '', stockSmall: false, stallSort: 'over', repMonth: '', metric: 'n' };
const FACETS = [
  { k: 'channel', l: 'Canal', v: s => s.channel }, { k: 'entity', l: 'Entidad', v: s => s.entity }, { k: 'cat', l: 'Categoría', v: s => s.cat, lab: x => tl(x) },
  { k: 'type', l: 'Tipo', v: s => s.typeC }, { k: 'brand', l: 'Marca', v: s => s.brand }, { k: 'owner', l: 'Owner', v: s => s.owner }, { k: 'buyer', l: 'Buyer', v: s => s.buyer },
  { k: 'grade', l: 'Grado', v: s => s.grade }, { k: 'band', l: 'Coste (PAT, USD)', v: s => s.band }];
const SF = Object.fromEntries(FACETS.map(f => [f.k, new Set()]));
const PILLS = [['channel', 'Canal', ['channel']], ['entity', 'Entidad', ['entity']], ['cat', 'Categoría', ['cat', 'type']], ['brand', 'Marca', ['brand'], true],
  ['orig', 'Owner / Buyer', ['owner', 'buyer']], ['grade', 'Grado', ['grade']], ['band', 'Coste', ['band']]];
const okRow = (s, skip) => FACETS.every(f => f.k === skip || !SF[f.k].size || SF[f.k].has(f.v(s)));
const DIMS = { channel: ['Canal', s => s.channel], brand: ['Marca', s => s.brand], cat: ['Categoría', s => s.cat ? tl(s.cat) : ''], type: ['Tipo', s => s.typeC],
  entity: ['Entidad', s => s.entity], owner: ['Owner', s => s.owner], buyer: ['Buyer', s => s.buyer], grade: ['Grado', s => s.grade], month: ['Mes', s => s.m],
  band: ['Coste (PAT, USD)', s => s.band], brandcat: ['Marca · categoría', s => s.brand ? `${s.brand} · ${tl(s.cat || 'Otros')}` : ''] };
const dimFacet = { channel: 'channel', brand: 'brand', type: 'type', entity: 'entity', owner: 'owner', buyer: 'buyer', grade: 'grade', band: 'band' };

/* ---------- tipos de cambio por día (BCE) ---------- */
function rateOn(cur, day) { // unidades de «cur» por 1 USD el día «day» (o el último día hábil anterior)
  if (!cur || cur === 'USD') return 1;
  const ds = SV.fxDates; let lo = 0, hi = ds.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ds[mid] <= day) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  for (let i = Math.max(best, 0), k = 0; i >= 0 && k < 12; i--, k++) { const r = SV.fxMap[ds[i]]?.[cur]; if (r) return r; }
  if (best < 0) for (let i = 0; i < Math.min(ds.length, 12); i++) { const r = SV.fxMap[ds[i]]?.[cur]; if (r) return r; }
  if (rates?.[cur]) { SV.approx = true; return rates[cur]; }
  return null;
}
const toUSD = (v, cur, day) => { if (v == null || !cur) return null; const r = rateOn(cur, day); return r ? v / r : null; };
const todayUSD = (v, cur) => v == null || !cur ? null : cur === 'USD' ? v : rates?.[cur] ? v / rates[cur] : null;
const fromTodayUSD = v => v == null ? null : v * (SV.cur === 'USD' ? 1 : rates?.[SV.cur] || NaN);
const money = v => v == null || isNaN(v) ? '—' : fmtC(v, SV.cur);
const moneyC = v => { if (v == null || isNaN(v)) return '—'; try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: SV.cur, notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch { return fmtC(v, SV.cur); } };
const intC = v => v == null ? '—' : new Intl.NumberFormat('en-US', { notation: v >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);

/* ---------- importar el snapshot de vendidos ---------- */
function gradingPairs(t) { // pestaña Grading: Ctag (A) y grading (B, texto tipo Public Notes)
  const hi = t.findIndex(r => r.some(c => String(c ?? '').trim())); if (hi < 0) return { pairs: [], total: 0 };
  const H = t[hi].map(x => String(x ?? '').trim().toLowerCase()), body = t.slice(hi + 1);
  let ci = H.findIndex(x => /^(c-?tag|tag number|tag no\.?|tag)$/.test(x)), gi = H.findIndex(x => /grad|public notes|notes/.test(x));
  if (ci < 0) ci = H.findIndex((_, j) => body.filter(r => /^[a-z]{1,3}\d{3,}$/i.test(String(r[j] ?? '').trim())).length > body.length / 2);
  if (ci < 0) return { pairs: [], total: 0, nocode: true };
  if (gi < 0 || gi === ci) gi = ci === 0 ? 1 : 0;
  const rows = body.filter(r => String(r[ci] ?? '').trim()), pairs = rows.map(r => [String(r[ci]).trim().toUpperCase(), gradeOf(r[gi])]).filter(p => p[1]);
  return { pairs, total: rows.length };
}
function parseSold(buf) {
  const wb = XLSX.read(buf, { type: 'array' }), rows = [], issues = [], tabs = []; let grading = null;
  for (const name of wb.SheetNames) {
    const t = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd hh:mm:ss' });
    if (/^\s*grad/i.test(name)) { grading = gradingPairs(t); continue; }
    const hi = t.slice(0, 15).findIndex(r => r.some(c => /^c-?tag$/i.test(String(c ?? '').trim())));
    if (hi < 0) { issues.push({ k: 'noheader', tab: name }); continue; }
    const H = t[hi].map(x => String(x ?? '').trim()), L = H.map(x => x.toLowerCase()), body = t.slice(hi + 1);
    const col = (...names) => L.findIndex(h => names.includes(h));
    const nearCur = j => { for (let k = j - 1; k >= 0; k--) if (/^(cur|currency|moneda)$/.test(L[k])) return k; return -1; };
    const sample = body.slice(0, 400), frac = (j, test) => { const v = sample.map(r => String(r[j] ?? '').trim()).filter(Boolean); return v.length ? v.filter(test).length / v.length : 0; };
    const isNum = v => /^-?[\d.,]+$/.test(v), isCur = v => !!curCode(v), isDate = v => !!isoDT(v) && /\d{4}/.test(v);
    const cCode = L.findIndex(h => /^c-?tag$/.test(h)), cSD = col('sold date', 'fecha de venta', 'sale date', 'date sold');
    if (cSD < 0) { issues.push({ k: 'nosolddate', tab: name }); continue; }
    let cAmt = -1, cCur = -1, cAdd = col('added date', 'fecha de alta', 'date added');
    for (let j = cSD - 1; j >= Math.max(0, cSD - 6); j--) { if (cAmt < 0 && frac(j, isNum) > 0.7) cAmt = j; else if (cCur < 0 && frac(j, isCur) > 0.7) cCur = j; }
    if (cAdd < 0 || frac(cAdd, isDate) < 0.7) { // cabeceras desplazadas (p. ej. Storefront): la fecha de alta está bajo otro título
      let alt = -1; for (let j = cSD - 1; j >= 0; j--) if (j !== cAmt && j !== cCur && frac(j, isDate) > 0.7) { alt = j; break; }
      if (alt >= 0) { issues.push({ k: 'shifted', tab: name, col: H[alt] || XLSX.utils.encode_col(alt) }); cAdd = alt; }
    }
    const cPat = col('pat - current', 'pat current'), cInit = col('pat - initial', 'pat initial'), cGr = [col('ext grading'), col('grading'), col('public notes')].find(j => j >= 0) ?? -1;
    const g = (r, j) => j >= 0 ? String(r[j] ?? '').trim() : '';
    let n = 0;
    for (const r of body) {
      const code = g(r, cCode).toUpperCase(); if (!code) continue;
      const sd = isoDT(g(r, cSD)); if (!sd) { issues.push({ k: 'nosold', tab: name, code }); continue; }
      rows.push({ code, sold_date: sd, channel: name, brand: g(r, col('brand name', 'brand')), type: g(r, col('item type', 'type')), descr: g(r, col('item description', 'description')).slice(0, 200),
        entity: g(r, col('entity')), owner: g(r, col('owner')), buyer: g(r, col('buyer')), grade: cGr >= 0 ? gradeOf(g(r, cGr)) || null : null,
        pat: numOrNull(g(r, cPat)), pat_cur: curCode(g(r, nearCur(cPat))) || null, pat_init: numOrNull(g(r, cInit)), pat_init_cur: curCode(g(r, nearCur(cInit))) || null,
        added: isoDT(g(r, cAdd)).slice(0, 10) || null, sold: cAmt >= 0 ? numOrNull(g(r, cAmt)) : null, sold_cur: cCur >= 0 ? curCode(g(r, cCur)) || null : null });
      n++;
    }
    tabs.push({ name, n });
  }
  if (grading?.pairs.length) { const gm = new Map(grading.pairs); rows.forEach(r => { if (!r.grade && gm.has(r.code)) r.grade = gm.get(r.code); }); }
  return { rows, issues, tabs, grading };
}
async function importSold(file) {
  $('sInfo').textContent = tl('· leyendo {f}…', { f: file.name });
  let parsed; try { parsed = parseSold(await file.arrayBuffer()); } catch (e) { return say(tl('No se pudo leer el archivo: {e}', { e: e.message }), 6000); }
  const { rows, issues, tabs, grading } = parsed;
  if (!rows.length) return say(tl('No encontré ventas en el archivo (hace falta la columna CTag y «Sold Date»).'), 6000);
  const seen = new Set(), uniq = []; let dups = 0;
  for (const r of rows) { const k = r.code + '|' + r.sold_date; if (seen.has(k)) { dups++; continue; } seen.add(k); uniq.push(r); }
  let added = 0, updated = 0;
  for (let i = 0; i < uniq.length; i += 4000) {
    $('sInfo').textContent = tl('· guardando {a} de {b}…', { a: Math.min(i + 4000, uniq.length), b: uniq.length });
    const r = await api('sales/import', { src: file.name, rows: uniq.slice(i, i + 4000) }); added += r.added; updated += r.updated;
  }
  if (grading?.pairs.length) await api('sales/grades', { pairs: grading.pairs });
  const info = { tabs, dups, grading: grading ? { total: grading.total, parsed: grading.pairs.length, nocode: !!grading.nocode } : null,
    shifted: issues.filter(x => x.k === 'shifted'), nosold: issues.filter(x => x.k === 'nosold').length, skipped: issues.filter(x => x.k === 'noheader' || x.k === 'nosolddate').map(x => x.tab) };
  await api('sales/import', { src: file.name, rows: [], last: true, n: uniq.length, added, updated, info });
  const days = uniq.map(r => r.sold_date.slice(0, 10)).sort(), curs = [...new Set(uniq.flatMap(r => [r.sold_cur, r.pat_cur, r.pat_init_cur]).filter(Boolean))];
  $('sInfo').textContent = tl('· descargando tipos de cambio…');
  let fx = { ok: false }; try { fx = await api('fx/ensure', { from: days[0], to: days[days.length - 1], curs }); } catch {}
  const f = v => v.toLocaleString('en-US');
  say(tl('Importadas {n} ventas: {a} nuevas y {u} actualizadas.', { n: f(uniq.length), a: f(added), u: f(updated) })
    + (grading ? ' ' + tl('Grading: {g} de {t} CTags.', { g: f(grading.pairs.length), t: f(grading.total) }) : '')
    + (fx.ok ? '' : ' ' + tl('⚠ No se pudieron descargar los tipos de cambio históricos: se usan los de hoy.')), 7000);
  SV.loaded = false; SV.stock = null; renderSales();
}

/* ---------- carga y preparación ---------- */
async function loadSales() {
  const [d, fx] = await Promise.all([api('sales'), api('fx')]);
  SV.fxMap = fx; SV.fxDates = Object.keys(fx).sort(); SV.imports = d.imports || []; SV.approx = false;
  const C = d.cols;
  SV.sales = d.rows.map(r => { const s = {}; C.forEach((k, i) => s[k] = r[i]); return prepSale(s); });
  SV.days = SV.sales.map(s => s.d).sort(); SV.minDay = SV.days[0]; SV.maxDay = SV.days[SV.days.length - 1];
  const vol = new Map(); SV.sales.forEach(s => vol.set(s.channel, (vol.get(s.channel) || 0) + 1)); // color = canal (orden fijo por volumen total, no cambia con los filtros)
  SV.colors = new Map([...vol].sort((a, b) => b[1] - a[1]).map(([c], i) => [c, i < 8 ? `var(--series-${i + 1})` : 'var(--series-other)']));
  setCurK(); SV.loaded = true;
  if (!SV.repMonth && SV.maxDay) { const mm = SV.maxDay.slice(0, 7); SV.repMonth = SV.maxDay === endOfMonth(mm) ? mm : shiftMonth(mm, -1); if (SV.repMonth < SV.minDay.slice(0, 7)) SV.repMonth = mm; }
}
function prepSale(s) {
  s.d = s.sold_date.slice(0, 10); s.m = s.d.slice(0, 7); s.typeC = cleanType(s.type); s.cat = sCat(s.typeC);
  s.days = s.added ? daysBetween(s.added, s.d) : null;
  s.revU = toUSD(s.sold, s.sold_cur, s.d); s.costU = toUSD(s.pat, s.pat_cur, s.d);
  s.profU = s.revU != null && s.costU != null && s.sold > 0 && s.pat > 0 ? s.revU - s.costU : null;
  s.band = bandOf(s.costU); s.grade = s.grade || '';
  return s;
}
function setCurK() { SV.sales.forEach(s => { s.k = SV.cur === 'USD' ? 1 : rateOn(SV.cur, s.d) || null; }); }
async function loadStock() {
  if (SV.stock) return SV.stock;
  const d = await api('stock'), today = new Date().toISOString().slice(0, 10);
  SV.stock = { source: d.source, at: d.at, rows: d.rows.map(([code, brand, name, price, cur, entity, grade, type, channel, owner, buyer, added]) => {
    const typeC = cleanType(type), costU = price > 0 ? todayUSD(price, cur) : null; // sin precio (o 0) no es «coste 0»
    return { code, brand, name, price, cur, entity, grade: grade || '', type, typeC, cat: sCat(typeC), channel, owner, buyer, added, age: added ? daysBetween(added, today) : null, costU, band: bandOf(costU) };
  }) };
  return SV.stock;
}

/* ---------- periodo ---------- */
const PERIODS = [['all', 'Todo'], ['last30', 'Últimos 30 días'], ['last90', 'Últimos 90 días'], ['last180', 'Últimos 6 meses'], ['last365', 'Últimos 12 meses'],
  ['month', 'Mes en curso'], ['pmonth', 'Mes anterior'], ['ytd', 'Este año'], ['custom', 'Personalizado…']];
function periodRange() {
  const max = SV.maxDay, min = SV.minDay, back = n => addDaysISO(max, -(n - 1));
  switch (SV.period) {
    case 'last30': return [back(30), max]; case 'last90': return [back(90), max]; case 'last180': return [back(182), max]; case 'last365': return [back(365), max];
    case 'month': return [max.slice(0, 7) + '-01', max]; case 'ytd': return [max.slice(0, 4) + '-01-01', max];
    case 'pmonth': { const m = shiftMonth(max.slice(0, 7), -1); return [m + '-01', endOfMonth(m)]; }
    case 'custom': return [SV.from || min, SV.to || max]; default: return [min, max];
  }
}
function cmpRange([a, b]) {
  if (SV.cmp === 'none') return null;
  const yearBack = d => { const y = String(+d.slice(0, 4) - 1) + d.slice(4); return d.slice(5) === '02-29' ? y.slice(0, 8) + '28' : y; };
  if (SV.cmp === 'yoy' || SV.period === 'ytd') return [yearBack(a), yearBack(b)];
  if (SV.period === 'pmonth') { const m = shiftMonth(a.slice(0, 7), -1); return [m + '-01', endOfMonth(m)]; } // mes natural anterior
  if (SV.period === 'month') { const m = shiftMonth(a.slice(0, 7), -1), e = endOfMonth(m); return [m + '-01', (m + b.slice(7)) < e ? m + b.slice(7) : e]; } // mismos días del mes anterior
  const n = daysBetween(a, b) + 1; return [addDaysISO(a, -n), addDaysISO(a, -1)];
}
const inRange = (s, r) => r && s.d >= r[0] && s.d <= r[1];
const cmpName = () => SV.cmp === 'yoy' || SV.period === 'ytd' ? tl('vs mismo periodo del año anterior') : SV.period === 'pmonth' || SV.period === 'month' ? tl('vs mes anterior') : tl('vs periodo anterior');
const LOC = () => lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-GB';
const fmtDay = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const fmtMonth = m => new Date(m + '-01T00:00:00Z').toLocaleDateString(LOC(), { month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ---------- agregados ---------- */
function agg(list) {
  let n = 0, rev = 0, cost = 0, prof = 0, revM = 0, costM = 0, nm = 0, losses = 0, lossAmt = 0; const days = [];
  for (const s of list) {
    n++; const k = s.k; if (!k) continue;
    if (s.revU != null) rev += s.revU * k; if (s.costU != null) cost += s.costU * k;
    if (s.profU != null) { prof += s.profU * k; revM += s.revU * k; costM += s.costU * k; nm++; if (s.profU < 0) { losses++; lossAmt += s.profU * k; } }
    if (s.days != null && s.days >= 0) days.push(s.days);
  }
  return { n, rev, cost, prof, margin: revM ? prof / revM : null, markup: costM ? revM / costM : null, ticket: n ? rev / n : null, days: median(days), losses, lossPct: nm ? losses / nm : null, lossAmt };
}
function groupAgg(list, fn) { const g = new Map(); for (const s of list) { const k = fn(s) || '—'; let a = g.get(k); if (!a) g.set(k, a = []); a.push(s); } return [...g].map(([k, l]) => ({ k, ...agg(l) })); }
const curSales = () => { const r = periodRange(); return SV.sales.filter(s => inRange(s, r) && okRow(s)); };
const cmpSales = () => { const r = cmpRange(periodRange()); return r ? SV.sales.filter(s => inRange(s, r) && okRow(s)) : []; };

/* ---------- pintar ---------- */
let sTipEl = null;
function tipShow(e, title, rows) { // valores primero, nombre después; con una rayita del color de la serie
  const t = $('vtip'); t.innerHTML = ''; const h = document.createElement('b'); h.textContent = title; t.append(h);
  rows.forEach(r => { const d = document.createElement('div'); if (r.color) { const i = document.createElement('i'); i.style.cssText = `display:inline-block;width:10px;height:2px;background:${r.color};margin-right:6px;vertical-align:middle`; d.append(i); }
    const v = document.createElement('b'); v.textContent = r.value; d.append(v); const l = document.createElement('span'); l.className = 'mute'; l.textContent = ' ' + r.label; d.append(l); t.append(d); });
  t.style.display = 'block'; const x = e.clientX ?? (e.target.getBoundingClientRect().left + 10), y = e.clientY ?? e.target.getBoundingClientRect().top;
  t.style.left = Math.min(x + 14, innerWidth - t.offsetWidth - 8) + 'px'; t.style.top = Math.min(y + 14, innerHeight - t.offsetHeight - 8) + 'px';
}
const tipHide = () => { $('vtip').style.display = 'none'; };
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), x = v / p; return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * p; }
const shortN = v => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '') + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0', '') + 'K' : String(Math.round(a))); };
function stackSVG(o) { // columnas apiladas (positivas hacia arriba, negativas hacia abajo); o = { labels, series:[{name,color}], val(i,j), fmt, yfmt }
  const n = o.labels.length, W = 700, H = 240, P = { l: 56, r: 8, t: 12, b: 26 }, slot = (W - P.l - P.r) / Math.max(n, 1), bw = Math.min(24, slot * 0.62);
  let top = 0, bot = 0; for (let i = 0; i < n; i++) { let p = 0, q = 0; o.series.forEach((_, j) => { const v = o.val(i, j) || 0; v > 0 ? p += v : q += v; }); top = Math.max(top, p); bot = Math.min(bot, q); }
  const span = niceMax(Math.max(top, -bot) || 1), hi = top > 0 ? niceMax(top) : 0, lo = bot < 0 ? -niceMax(-bot) : 0, rng = (hi - lo) || 1;
  const y = v => P.t + (H - P.t - P.b) * (hi - v) / rng;
  const ticks = [lo, ...(lo < 0 && hi > 0 ? [0] : []), (lo + hi) / 2, hi].filter((v, i, a) => a.indexOf(v) === i);
  let svg = ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(o.yfmt(v))}</text>`).join('');
  if (lo < 0) svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--text-secondary)" stroke-width="1" opacity=".5"/>`;
  const every = Math.ceil(n / 12);
  for (let i = 0; i < n; i++) {
    const x = P.l + i * slot + (slot - bw) / 2; let pb = 0, nb = 0;
    const segs = o.series.map((s, j) => ({ j, v: o.val(i, j) || 0 })), pos = segs.filter(s => s.v > 0), neg = segs.filter(s => s.v < 0);
    pos.forEach((s, idx) => { const y0 = y(pb) - (idx && y(pb) - y(pb + s.v) > 5 ? 2 : 0), y1 = y(pb + s.v), h = y0 - y1; pb += s.v; if (h <= 0.5) return; const r = idx === pos.length - 1 ? Math.min(4, h, bw / 2) : 0;
      svg += `<path d="M${x},${y0} V${y1 + r} ${r ? `Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r}` : `H${x + bw}`} V${y0} Z" fill="${o.series[s.j].color}"/>`; });
    neg.forEach((s, idx) => { const y0 = y(nb) + (idx && y(nb + s.v) - y(nb) > 5 ? 2 : 0), y1 = y(nb + s.v), h = y1 - y0; nb += s.v; if (h <= 0.5) return; const r = idx === neg.length - 1 ? Math.min(4, h, bw / 2) : 0;
      svg += `<path d="M${x},${y0} V${y1 - r} ${r ? `Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 - r}` : `H${x + bw}`} V${y0} Z" fill="${o.series[s.j].color}"/>`; });
    svg += `<rect class="hit" x="${P.l + i * slot}" y="${P.t}" width="${slot}" height="${H - P.t - P.b}" fill="transparent" data-i="${i}" tabindex="0"/>`;
    if (i % every === 0) svg += `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle">${esc(o.labels[i])}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.title || '')}">${svg}</svg>`;
}
function hookStack(el, o) {
  el.querySelectorAll('rect.hit').forEach(r => { const show = e => { const i = +r.dataset.i; let tot = 0;
      const rows = o.series.map((s, j) => { const v = o.val(i, j) || 0; tot += v; return v ? { color: s.color, value: o.fmt(v), label: s.name } : null; }).filter(Boolean);
      if (o.series.length > 1) rows.push({ value: o.fmt(tot), label: tl('Total') }); tipShow(e, o.tipTitle ? o.tipTitle(i) : o.labels[i], rows); };
    r.onpointermove = show; r.onfocus = show; r.onpointerleave = tipHide; r.onblur = tipHide; });
}
const legendHTML = series => `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
function tableView(head, rows) { return `<details><summary class="hint">${esc(tl('Ver tabla'))}</summary><div style="overflow:auto"><table class="list"><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div></details>`; }
function delta(cur, prev, mode = 'pct', goodUp = true) { // ▲/▼ con el periodo de referencia (nunca solo color)
  if (prev == null || cur == null || !isFinite(prev) || (mode === 'pct' && !prev)) return '';
  const d = mode === 'pct' ? (cur - prev) / Math.abs(prev) : cur - prev; if (!isFinite(d)) return '';
  const up = d > 0, good = d === 0 ? null : up === goodUp, txt = mode === 'pct' ? (Math.abs(d) * 100).toFixed(1) + '%' : mode === 'pp' ? (Math.abs(d) * 100).toFixed(1) + ' pp' : Math.abs(Math.round(d)) + ' ' + tl('días');
  return `<div class="d ${good == null ? '' : good ? 'up' : 'down'}">${d === 0 ? '＝' : up ? '▲' : '▼'} ${esc(txt)} <span class="mute">${esc(cmpName())}</span></div>`;
}

/* ---------- barra de filtros ---------- */
function buildBar() {
  const per = curSales0(), bar = $('sBar');
  bar.innerHTML = PILLS.map(([id, label, keys, search]) => `<span class="fwrap"><button class="pill" data-pop="${id}">${esc(tl(label))}</button><div class="pop" id="spop-${id}">${search ? `<input type="text" data-find="${id}" placeholder="${esc(tl('buscar…'))}" style="width:100%;margin-bottom:8px">` : ''}${keys.map(k => `<div data-sec="${k}">${keys.length > 1 ? `<div class="plbl">${esc(tl(FACETS.find(f => f.k === k).l))}</div>` : ''}<div data-chips="${k}"></div></div>`).join('')}</div></span>`).join('');
  bar.querySelectorAll('.pill').forEach(p => p.onclick = e => { e.stopPropagation(); const pop = $('spop-' + p.dataset.pop), open = pop.classList.contains('open'); document.querySelectorAll('.pop.open').forEach(x => x.classList.remove('open')); if (!open) pop.classList.add('open'); });
  bar.querySelectorAll('.pop').forEach(p => p.onclick = e => e.stopPropagation());
  bar.querySelectorAll('[data-find]').forEach(i => i.oninput = () => fillChips());
  fillChips(per);
}
const curSales0 = () => { const r = periodRange(); return SV.sales.filter(s => inRange(s, r)); };
function fillChips(per) {
  per = per || curSales0();
  for (const f of FACETS) {
    const el = document.querySelector(`#sBar [data-chips="${f.k}"]`); if (!el) continue;
    const cnt = new Map(); for (const s of per) if (okRow(s, f.k)) { const v = f.v(s); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }
    const q = (document.querySelector(`#sBar [data-find]`)?.closest('.pop')?.contains(el) ? strip2(document.querySelector('#sBar [data-find]').value) : '');
    let list = [...cnt].sort((a, b) => f.k === 'grade' ? GRADE_ORDER.indexOf(a[0]) - GRADE_ORDER.indexOf(b[0]) : f.k === 'band' ? BANDS.findIndex(x => x[2] === a[0]) - BANDS.findIndex(x => x[2] === b[0]) : b[1] - a[1]);
    if (q) list = list.filter(([k]) => strip2(k).includes(q));
    const max = q ? 200 : 60; SF[f.k].forEach(v => { if (!list.slice(0, max).some(x => x[0] === v)) list.unshift([v, cnt.get(v) || 0]); });
    el.innerHTML = ''; list.slice(0, max).forEach(([v, n]) => { const b = document.createElement('button'); b.className = 'chip' + (SF[f.k].has(v) ? ' on' : ''); b.innerHTML = `${esc(f.lab ? f.lab(v) : v)} <small>${n}</small>`; b.onclick = () => { SF[f.k].has(v) ? SF[f.k].delete(v) : SF[f.k].add(v); paint(); }; el.append(b); });
    if (list.length > max) { const m = document.createElement('span'); m.className = 'hint'; m.textContent = tl('+{n} más (usa el buscador)', { n: list.length - max }); el.append(m); }
    el.closest('[data-sec]').style.display = cnt.size || SF[f.k].size ? '' : 'none';
  }
  PILLS.forEach(([id, label, keys]) => { const p = document.querySelector(`#sBar .pill[data-pop="${id}"]`), sel = keys.flatMap(k => [...SF[k]].map(v => FACETS.find(f => f.k === k).lab?.(v) ?? v));
    p.classList.toggle('on', sel.length > 0); p.textContent = tl(label) + (sel.length === 1 ? ': ' + sel[0] : sel.length ? ' · ' + sel.length : '');
    p.parentElement.style.display = keys.some(k => per.some(s => FACETS.find(f => f.k === k).v(s))) || sel.length ? '' : 'none'; });
  const tk = $('sTokens'); tk.innerHTML = ''; let nTok = 0;
  FACETS.forEach(f => SF[f.k].forEach(v => { nTok++; const b = document.createElement('button'); b.className = 'tok'; b.textContent = (f.lab ? f.lab(v) : v) + ' ✕'; b.onclick = () => { SF[f.k].delete(v); paint(); }; tk.append(b); }));
  if (nTok > 1) { const b = document.createElement('button'); b.className = 'tok clear'; b.textContent = tl('Quitar todos los filtros'); b.onclick = () => { FACETS.forEach(f => SF[f.k].clear()); paint(); }; tk.append(b); }
}
const strip2 = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
document.addEventListener('click', () => document.querySelectorAll('#sBar .pop.open').forEach(x => x.classList.remove('open')));

/* ---------- entrada ---------- */
async function renderSales() {
  if (!SV.loaded) { try { await loadSales(); } catch (e) { $('sInfo').textContent = ''; return say(tl('No se pudieron cargar las ventas: {e}', { e: e.message }), 6000); } }
  const has = SV.sales.length > 0; $('sEmpty').style.display = has ? 'none' : ''; $('sMain').style.display = has ? '' : 'none'; $('sXlsx').style.display = $('sClear').style.display = has ? '' : 'none';
  const imp = SV.imports[0];
  $('sInfo').textContent = has ? tl('· {n} ventas del {a} al {b}', { n: SV.sales.length.toLocaleString('en-US'), a: fmtDay(SV.minDay), b: fmtDay(SV.maxDay) }) + (imp ? tl(' · última importación: {f} ({d})', { f: imp.src, d: new Date(imp.at * 1000).toLocaleDateString(LOC()) }) : '') : '';
  if (!has) return;
  $('sPeriod').innerHTML = PERIODS.map(([k, l]) => `<option value="${k}">${esc(tl(l))}</option>`).join(''); $('sPeriod').value = SV.period;
  $('sCur').innerHTML = curOptions(SV.cur); $('sCmp').value = SV.cmp;
  $('sCustom').style.display = SV.period === 'custom' ? '' : 'none'; $('sFrom').value = SV.from || SV.minDay; $('sTo').value = SV.to || SV.maxDay;
  buildBar(); paint();
}
function paint() {
  const per = curSales0(); fillChips(per);
  const r = periodRange(), c = cmpRange(r);
  $('sFx').textContent = [SV.period !== 'all' ? tl('{a} – {b}', { a: fmtDay(r[0]), b: fmtDay(r[1]) }) : '', c && SV.period !== 'all' ? tl('comparado con {a} – {b}', { a: fmtDay(c[0]), b: fmtDay(c[1]) }) : '',
    !SV.fxDates.length ? tl('⚠ sin tipos de cambio históricos: se usan los de hoy') : SV.approx ? tl('⚠ algunas monedas con el tipo de cambio de hoy') : ''].filter(Boolean).join(' · ');
  document.querySelectorAll('#sTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === SV.view));
  ['sum', 'rank', 'stock', 'items', 'report'].forEach(v => $('sv-' + v).style.display = v === SV.view ? '' : 'none');
  ({ sum: viewSum, rank: viewRank, stock: viewStock, items: viewItems, report: viewReport })[SV.view]();
}
$('sTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; SV.view = b.dataset.v; paint(); };
$('sPeriod').onchange = () => { SV.period = $('sPeriod').value; store.set('salesPeriod', SV.period); $('sCustom').style.display = SV.period === 'custom' ? '' : 'none'; paint(); };
$('sFrom').onchange = $('sTo').onchange = () => { SV.from = $('sFrom').value; SV.to = $('sTo').value; paint(); };
$('sCmp').onchange = () => { SV.cmp = $('sCmp').value; store.set('salesCmp', SV.cmp); paint(); };
$('sCur').onchange = () => { SV.cur = $('sCur').value; store.set('salesCur', SV.cur); setCurK(); paint(); };
$('sFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importSold(f); };
$('sClear').onclick = async () => { if (!confirm(tl('¿Borrar todas las ventas importadas? Podrás volver a importarlas desde los archivos.'))) return; await api('sales/clear', {}); SV.loaded = false; renderSales(); };

/* ---------- Resumen ---------- */
function viewSum() {
  const cur = curSales(), prev = cmpSales(), A = agg(cur), B = prev.length ? agg(prev) : null;
  const tile = (k, v, sub, d) => `<div class="tile" style="cursor:default"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}${d || ''}</div>`;
  let html = `<div class="tiles">`
    + tile(tl('Unidades vendidas'), A.n.toLocaleString('en-US'), '', B && delta(A.n, B.n))
    + tile(tl('Ingresos (lo que os llega)'), moneyC(A.rev), money(A.rev), B && delta(A.rev, B.rev))
    + tile(tl('Beneficio (ingresos − PAT)'), moneyC(A.prof), A.markup ? tl('×{m} sobre coste', { m: A.markup.toFixed(2) }) : '', B && delta(A.prof, B.prof))
    + tile(tl('Margen sobre ventas'), pct(A.margin), '', B && delta(A.margin, B.margin, 'pp'))
    + tile(tl('Ticket medio'), money(A.ticket), '', B && delta(A.ticket, B.ticket))
    + tile(tl('Días hasta vender (mediana)'), A.days == null ? '—' : tl('{n} días', { n: Math.round(A.days) }), '', B && delta(A.days, B.days, 'days', false))
    + tile(tl('Vendidas con pérdida'), `${A.losses.toLocaleString('en-US')} (${pct(A.lossPct)})`, tl('pérdida total {v}', { v: money(-A.lossAmt) }), B && delta(A.lossPct, B.lossPct, 'pp', false))
    + `</div>`;
  // evolución por canal
  const r = periodRange(), weekly = daysBetween(r[0], r[1]) <= 92, bucket = s => weekly ? addDaysISO(s.d, -((new Date(s.d + 'T00:00:00Z').getUTCDay() + 6) % 7)) : s.m;
  const keys = [...new Set(cur.map(bucket))].sort(), chans = [...SV.colors.keys()].filter(c => cur.some(s => s.channel === c));
  const cell = new Map(); cur.forEach(s => { const k = bucket(s) + '|' + s.channel; let a = cell.get(k); if (!a) cell.set(k, a = []); a.push(s); });
  const mval = (a) => !a ? 0 : SV.metric === 'n' ? a.length : SV.metric === 'rev' ? agg(a).rev : agg(a).prof;
  const series = chans.map(c => ({ name: c, color: SV.colors.get(c) }));
  const lo = r[0] > SV.minDay ? r[0] : SV.minDay, hi = r[1] < SV.maxDay ? r[1] : SV.maxDay; // un mes/semana a medias no es una caída: se marca con *
  const partial = k => (weekly ? k : k + '-01') < lo || (weekly ? addDaysISO(k, 6) : endOfMonth(k)) > hi, anyPartial = keys.some(partial);
  const lab = k => (weekly ? new Date(k + 'T00:00:00Z').toLocaleDateString(LOC(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) : new Date(k + '-01T00:00:00Z').toLocaleDateString(LOC(), { month: 'short', year: '2-digit', timeZone: 'UTC' })) + (partial(k) ? '*' : '');
  const vals = keys.map(k => chans.map(c => mval(cell.get(k + '|' + c))));
  const fmt = v => SV.metric === 'n' ? Math.round(v).toLocaleString('en-US') : money(v);
  const o = { labels: keys.map(lab), series, val: (i, j) => vals[i][j], fmt, yfmt: v => SV.metric === 'n' ? shortN(v) : shortN(v), title: tl('Ventas por canal'), tipTitle: i => (weekly ? tl('Semana del {d}', { d: fmtDay(keys[i]) }) : fmtMonth(keys[i])) + (partial(keys[i]) ? ' · ' + tl('incompleto') : '') };
  html += `<div class="dash"><div class="panel"><div class="row" style="margin:0 0 6px"><h2 style="margin:0">${esc(weekly ? tl('Ventas por semana y canal') : tl('Ventas por mes y canal'))}</h2>
      <select id="sMetric" style="margin-left:auto"><option value="n">${esc(tl('Unidades'))}</option><option value="rev">${esc(tl('Ingresos'))}</option><option value="prof">${esc(tl('Beneficio'))}</option></select></div>
      ${legendHTML(series)}<div id="sChart1">${stackSVG(o)}</div>
      ${anyPartial ? `<p class="hint" style="margin:2px 0 0">${esc(tl('* Incompleto: solo hay ventas del {a} al {b}.', { a: fmtDay(lo), b: fmtDay(hi) }))}</p>` : ''}
      ${tableView([weekly ? tl('Semana') : tl('Mes'), ...chans, tl('Total')], keys.map((k, i) => [lab(k), ...vals[i].map(fmt), fmt(vals[i].reduce((a, b) => a + b, 0))]))}</div>`;
  // días hasta vender
  const BINS = [[0, 30, '< 30'], [30, 60, '30–60'], [60, 90, '60–90'], [90, 180, '90–180'], [180, 365, '180–365'], [365, 1e9, '> 365']];
  const dd = cur.map(s => s.days).filter(d => d != null && d >= 0), hist = BINS.map(([a, b]) => dd.filter(d => d >= a && d < b).length), hmax = Math.max(...hist, 1);
  const ho = { labels: BINS.map(b => b[2]), series: [{ name: tl('Ventas'), color: 'var(--series-1)' }], val: (i) => hist[i], fmt: v => `${v.toLocaleString('en-US')} (${pct(v / (dd.length || 1), 0)})`, yfmt: shortN, title: tl('Días hasta vender'), tipTitle: i => tl('{b} días', { b: BINS[i][2] }) };
  const imax = hist.indexOf(hmax);
  html += `<div class="panel"><h2>${esc(tl('Días hasta vender'))}</h2><p class="hint" style="margin:-4px 0 6px">${esc(tl('Desde la fecha de alta hasta la venta. Mediana: {n} días · el pico es «{b}» ({p}).', { n: A.days == null ? '—' : Math.round(A.days), b: BINS[imax][2], p: pct(hmax / (dd.length || 1), 0) }))}</p>
      <div id="sChart2">${stackSVG(ho)}</div>${tableView([tl('Días'), tl('Ventas'), '%'], BINS.map((b, i) => [b[2], hist[i].toLocaleString('en-US'), pct(hist[i] / (dd.length || 1))]))}</div></div>`;
  // por canal
  const prevBy = new Map(groupAgg(prev, s => s.channel).map(x => [x.k, x]));
  const byCh = groupAgg(cur, s => s.channel).sort((a, b) => b.rev - a.rev), maxRev = Math.max(...byCh.map(x => x.rev), 1);
  html += `<div class="panel"><h2>${esc(tl('Por canal'))}</h2><div style="overflow:auto"><table class="list"><tr><th>${esc(tl('Canal'))}</th><th class="num">${esc(tl('Unidades'))}</th><th class="num">${esc(tl('Ingresos'))}</th><th class="num">${esc(tl('Beneficio'))}</th><th class="num">${esc(tl('Margen'))}</th><th class="num">${esc(tl('Ticket medio'))}</th><th class="num">${esc(tl('Días (mediana)'))}</th><th class="num">${esc(tl('Con pérdida'))}</th>${prev.length ? `<th class="num">${esc(tl('Δ unidades'))}</th>` : ''}</tr>`
    + byCh.map(x => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${SV.colors.get(x.k) || 'var(--series-other)'};margin-right:6px"></i>${esc(x.k)}</td><td class="num">${x.n.toLocaleString('en-US')}</td><td class="num">${esc(money(x.rev))}<div class="dbar" style="width:${(x.rev / maxRev * 100).toFixed(1)}%"></div></td><td class="num">${esc(money(x.prof))}</td><td class="num">${pct(x.margin)}</td><td class="num">${esc(money(x.ticket))}</td><td class="num">${x.days == null ? '—' : Math.round(x.days)}</td><td class="num">${pct(x.lossPct)}</td>${prev.length ? `<td class="num">${prevBy.get(x.k) ? esc(((x.n - prevBy.get(x.k).n) / prevBy.get(x.k).n * 100).toFixed(0) + '%') : '—'}</td>` : ''}</tr>`).join('') + `</table></div></div>`;
  html += qualityHTML(cur);
  $('sv-sum').innerHTML = html;
  $('sMetric').value = SV.metric; $('sMetric').onchange = () => { SV.metric = $('sMetric').value; viewSum(); };
  hookStack($('sChart1'), o); hookStack($('sChart2'), ho);
  $('sv-sum').querySelectorAll('[data-issue]').forEach(a => a.onclick = () => { SV.itemsIssue = a.dataset.issue; SV.itemsPage = 0; SV.view = 'items'; paint(); });
}
function issueOf(s) { return { noprice: !(s.sold > 0), nocur: s.sold > 0 && !s.sold_cur, nocost: !(s.pat > 0) || !s.pat_cur, baddates: s.days != null && s.days < 0, loss: s.profU != null && s.profU < 0 }; }
function qualityHTML(cur) {
  const c = { noprice: 0, nocur: 0, nocost: 0, baddates: 0 }; cur.forEach(s => { const i = issueOf(s); for (const k in c) if (i[k]) c[k]++; });
  const imp = SV.imports[0]?.info || {}, rows = [];
  const L = { noprice: tl('ventas sin precio de venta (no cuentan en ingresos)'), nocur: tl('ventas sin moneda (no se pueden convertir)'), nocost: tl('ventas sin PAT (no cuentan en el margen)'), baddates: tl('ventas con fecha de venta anterior a la de alta (no cuentan en «días hasta vender»)') };
  for (const k in c) if (c[k]) rows.push(`<div class="qrow"><b>${c[k].toLocaleString('en-US')}</b> ${esc(L[k])} <a href="javascript:void 0" data-issue="${k}">${esc(tl('ver'))}</a></div>`);
  (imp.shifted || []).forEach(x => rows.push(`<div class="qrow">${esc(tl('Pestaña «{t}»: la fecha de alta estaba bajo el título «{c}» (cabeceras desplazadas). La app lo ha corregido sola; conviene arreglarlo en la exportación.', { t: x.tab, c: x.col }))}</div>`));
  if (imp.dups) rows.push(`<div class="qrow">${esc(tl('{n} filas repetidas en el archivo (se contaron una vez).', { n: imp.dups }))}</div>`);
  if (imp.grading?.nocode) rows.push(`<div class="qrow">${esc(tl('La pestaña Grading no tiene columna Ctag: no se pudo usar.'))}</div>`);
  if (imp.skipped?.length) rows.push(`<div class="qrow">${esc(tl('Pestañas sin CTag o sin «Sold Date» (ignoradas): {t}', { t: imp.skipped.join(', ') }))}</div>`);
  if (!rows.length) return '';
  return `<details class="panel"><summary><b>⚠ ${esc(tl('Calidad de datos'))}</b> <span class="mute">(${rows.length})</span></summary><div style="margin-top:8px">${rows.join('')}</div></details>`;
}

/* ---------- Rankings ---------- */
function viewRank() {
  const cur = curSales(), prev = cmpSales(), [lbl, fn] = DIMS[SV.rankDim];
  const prevBy = new Map(groupAgg(prev, fn).map(x => [x.k, x])), rowsA = groupAgg(cur, fn);
  const [sk, sd] = SV.rankSort, val = (x, k) => k === 'k' ? x.k : k === 'dn' ? (prevBy.get(x.k) ? x.n - prevBy.get(x.k).n : -1e12) : x[k] ?? -1e12;
  rowsA.sort((a, b) => { const va = val(a, sk), vb = val(b, sk); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sd; });
  const show = SV.rankAll ? rowsA : rowsA.slice(0, 25), maxRev = Math.max(...rowsA.map(x => x.rev), 1), fac = dimFacet[SV.rankDim];
  const th = (k, t) => `<th class="sort${k === 'k' ? '' : ' num'}" data-k="${k}">${esc(t)}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  $('sv-rank').innerHTML = `<div class="panel"><div class="row"><label>${esc(tl('Agrupar por'))} <select id="sRankDim">${Object.entries(DIMS).map(([k, [l]]) => `<option value="${k}">${esc(tl(l))}</option>`).join('')}</select></label>
      <span class="hint">${esc(tl('Pulsa una fila para filtrar por ella · pulsa un título para ordenar'))}</span></div>
    <div style="overflow:auto"><table class="list"><tr>${th('k', tl(lbl))}${th('n', tl('Unidades'))}${th('rev', tl('Ingresos'))}${th('prof', tl('Beneficio'))}${th('margin', tl('Margen'))}${th('ticket', tl('Ticket medio'))}${th('days', tl('Días (mediana)'))}${th('lossPct', tl('Con pérdida'))}${prev.length ? th('dn', tl('Δ unidades')) : ''}</tr>
    ${show.map(x => { const p = prevBy.get(x.k); return `<tr><td class="${fac ? 'lbl' : ''}" data-v="${esc(x.k)}">${esc(x.k)}</td><td class="num">${x.n.toLocaleString('en-US')}</td><td class="num">${esc(money(x.rev))}<div class="dbar" style="width:${(x.rev / maxRev * 100).toFixed(1)}%"></div></td><td class="num">${esc(money(x.prof))}</td><td class="num">${pct(x.margin)}</td><td class="num">${esc(money(x.ticket))}</td><td class="num">${x.days == null ? '—' : Math.round(x.days)}</td><td class="num">${pct(x.lossPct)}</td>${prev.length ? `<td class="num">${p ? (x.n - p.n > 0 ? '+' : '') + (x.n - p.n) : '—'}</td>` : ''}</tr>`; }).join('')}</table></div>
    ${rowsA.length > 25 ? `<button id="sRankAll" style="margin-top:8px">${esc(SV.rankAll ? tl('Ver solo los 25 primeros') : tl('Ver todos ({n})', { n: rowsA.length }))}</button>` : ''}
    ${SV.rankDim === 'buyer' ? `<p class="hint">${esc(tl('Por buyer: útil para orientar las compras (qué tipo de pieza rota y deja margen). Refleja también la categoría y el canal de lo que compra cada uno, no solo a la persona.'))}</p>` : ''}</div>`;
  $('sRankDim').value = SV.rankDim; $('sRankDim').onchange = () => { SV.rankDim = $('sRankDim').value; SV.rankAll = false; viewRank(); };
  $('sv-rank').querySelectorAll('th.sort').forEach(h => h.onclick = () => { const k = h.dataset.k; SV.rankSort = [k, SV.rankSort[0] === k ? -SV.rankSort[1] : (k === 'k' || k === 'days' || k === 'lossPct' ? 1 : -1)]; viewRank(); });
  if ($('sRankAll')) $('sRankAll').onclick = () => { SV.rankAll = !SV.rankAll; viewRank(); };
  if (fac) $('sv-rank').querySelectorAll('td.lbl').forEach(td => td.onclick = () => { const v = td.dataset.v; if (v === '—') return; const real = SV.rankDim === 'cat' ? S_CATS.map(c => c[0]).concat('Otros').find(c => tl(c) === v) || v : v; SF[fac].add(real); paint(); });
}

/* ---------- Piezas vendidas ---------- */
function viewItems() {
  const q = strip2(SV.itemsQ), iss = SV.itemsIssue;
  let list = curSales().filter(s => (!q || strip2(`${s.code} ${s.brand} ${s.descr} ${s.typeC}`).includes(q)) && (!iss || issueOf(s)[iss]));
  const [sk, sd] = SV.itemsSort, V = { d: s => s.sold_date, days: s => s.days ?? -1, cost: s => s.costU ?? -1, rev: s => s.revU ?? -1, prof: s => s.profU ?? -1e12, mg: s => s.profU != null && s.revU ? s.profU / s.revU : -1e12, brand: s => s.brand || '', channel: s => s.channel || '' };
  list.sort((a, b) => { const va = V[sk](a), vb = V[sk](b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sd; });
  const page = 50, pages = Math.max(1, Math.ceil(list.length / page)); SV.itemsPage = Math.min(SV.itemsPage, pages - 1);
  const th = (k, t, n) => `<th class="sort${n ? ' num' : ''}" data-k="${k}">${esc(t)}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const ISS = [['', 'Todas'], ['loss', 'Con pérdida'], ['noprice', 'Sin precio de venta'], ['nocur', 'Sin moneda'], ['nocost', 'Sin PAT'], ['baddates', 'Vendidas antes del alta']];
  $('sv-items').innerHTML = `<div class="panel"><div class="row"><input id="sItQ" type="text" placeholder="${esc(tl('buscar CTag, marca, descripción…'))}" style="flex:1;min-width:220px" value="${esc(SV.itemsQ)}">
      <select id="sItIss">${ISS.map(([k, l]) => `<option value="${k}">${esc(tl(l))}</option>`).join('')}</select><span class="mute">${esc(tl('{n} ventas', { n: list.length.toLocaleString('en-US') }))}</span></div>
    <div style="overflow:auto"><table class="list"><tr><th></th><th>CTag</th>${th('brand', tl('Marca'))}<th>${esc(tl('Descripción'))}</th>${th('channel', tl('Canal'))}${th('d', tl('Fecha de venta'))}${th('days', tl('Días'), 1)}${th('cost', tl('Coste (PAT)'), 1)}${th('rev', tl('Venta'), 1)}${th('prof', tl('Beneficio'), 1)}${th('mg', tl('Margen'), 1)}</tr>
    ${list.slice(SV.itemsPage * page, SV.itemsPage * page + page).map(s => `<tr><td><img class="thumb" src="${esc(photo(s.code))}" loading="lazy" onerror="this.style.visibility='hidden'"></td><td>${esc(s.code)}</td><td>${esc(s.brand || '')}</td><td>${esc((s.descr || '').slice(0, 60))}<br><small class="mute">${esc([s.typeC, s.grade, s.buyer].filter(Boolean).join(' · '))}</small></td><td>${esc(s.channel)}</td><td>${esc(fmtDay(s.d))}</td>
      <td class="num">${s.days ?? '—'}</td><td class="num">${esc(s.costU != null && s.k ? money(s.costU * s.k) : '—')}<br><small class="mute">${esc(s.pat != null ? fmtN(s.pat, s.pat_cur || 'USD') + ' ' + (s.pat_cur || '?') : '')}</small></td>
      <td class="num">${esc(s.revU != null && s.k ? money(s.revU * s.k) : '—')}<br><small class="mute">${esc(s.sold != null ? fmtN(s.sold, s.sold_cur || 'USD') + ' ' + (s.sold_cur || '?') : '')}</small></td>
      <td class="num" style="${s.profU < 0 ? 'color:var(--warn)' : ''}">${esc(s.profU != null && s.k ? money(s.profU * s.k) : '—')}</td><td class="num">${s.profU != null && s.revU ? pct(s.profU / s.revU) : '—'}</td></tr>`).join('')}</table></div>
    <div class="row" style="margin-top:8px"><button id="sItPrev" ${SV.itemsPage ? '' : 'disabled'}>◀</button><span class="mute">${esc(tl('página {a} de {b}', { a: SV.itemsPage + 1, b: pages }))}</span><button id="sItNext" ${SV.itemsPage < pages - 1 ? '' : 'disabled'}>▶</button>
      <button id="sItX" style="margin-left:auto">⬇ ${esc(tl('Excel de estas ventas'))}</button></div></div>`;
  $('sItIss').value = iss;
  $('sItQ').oninput = debounce2(() => { SV.itemsQ = $('sItQ').value; SV.itemsPage = 0; viewItems(); $('sItQ').focus(); $('sItQ').setSelectionRange(SV.itemsQ.length, SV.itemsQ.length); }, 300);
  $('sItIss').onchange = () => { SV.itemsIssue = $('sItIss').value; SV.itemsPage = 0; viewItems(); };
  $('sv-items').querySelectorAll('th.sort').forEach(h => h.onclick = () => { const k = h.dataset.k; SV.itemsSort = [k, SV.itemsSort[0] === k ? -SV.itemsSort[1] : -1]; viewItems(); });
  $('sItPrev').onclick = () => { SV.itemsPage--; viewItems(); }; $('sItNext').onclick = () => { SV.itemsPage++; viewItems(); };
  $('sItX').onclick = () => xlsxDownload([['Ventas', salesSheet(list)]], 'ventas');
}
const debounce2 = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

/* ---------- Stock y rotación ---------- */
function rotation(win = SV.stockWin, dim = SV.stockDim) {
  const st = SV.stock?.rows || [], end = SV.maxDay, start = addDaysISO(end, -(win - 1)), months = win / 30.44, fn = DIMS[dim][1];
  const sales = SV.sales.filter(s => s.d >= start && s.d <= end && okRow(s)), stock = st.filter(x => okRow(x));
  const G = new Map(), g = k => { let a = G.get(k); if (!a) G.set(k, a = { k, sales: [], stock: [] }); return a; };
  sales.forEach(s => g(fn(s) || '—').sales.push(s)); stock.forEach(x => g(fn(x) || '—').stock.push(x));
  const k = SV.cur === 'USD' ? 1 : rates?.[SV.cur] || NaN;
  return { start, end, months, sales, stock, rows: [...G.values()].map(a => {
    const A = agg(a.sales), sold = a.sales.length, n = a.stock.length, perMonth = sold / months, mos = perMonth ? n / perMonth : (n ? Infinity : 0);
    const ages = a.stock.map(x => x.age).filter(v => v != null), old = ages.filter(v => v >= 365).length, value = a.stock.reduce((t, x) => t + (x.costU || 0), 0) * k;
    const sig = sold >= 10 && mos < 3 && (A.margin ?? 0) > 0 ? 'buy' : n >= 10 && (!perMonth || mos > 12) ? 'over' : n >= 10 && mos > 6 ? 'slow' : '';
    return { k: a.k, sold, perMonth, n, mos, st: sold + n ? sold / (sold + n) : null, days: A.days, margin: A.margin, age: median(ages), old, value, sig };
  }) };
}
const SIG = { buy: ['var(--good)', '▲', 'Compra más'], slow: ['var(--warning)', '◆', 'Lento'], over: ['var(--critical)', '▼', 'Sobrestock'] };
const sigHTML = s => s ? `<span class="sig"><i style="background:${SIG[s][0]}"></i>${SIG[s][1]} ${esc(tl(SIG[s][2]))}</span>` : '';
function segStats() { // cuánto tarda en venderse, a qué precio sobre coste y en qué canal, por marca·categoría (o categoría, o todo)
  const by = new Map(), push = (key, s) => { let g = by.get(key); if (!g) by.set(key, g = { days: [], mk: [], ch: new Map() }); if (s.days != null && s.days >= 0) g.days.push(s.days); if (s.profU != null && s.costU > 0) g.mk.push(s.revU / s.costU);
    let c = g.ch.get(s.channel); if (!c) g.ch.set(s.channel, c = { n: 0, days: [], mk: [] }); c.n++; if (s.days != null && s.days >= 0) c.days.push(s.days); if (s.profU != null && s.costU > 0) c.mk.push(s.revU / s.costU); };
  SV.sales.forEach(s => { if (!okRow(s)) return; push('bc|' + s.brand + '|' + s.cat, s); push('c|' + s.cat, s); push('*', s); });
  for (const g of by.values()) {
    g.p50 = median(g.days); g.p90 = quant(g.days, 0.9); g.mk50 = median(g.mk);
    const chs = [...g.ch].filter(([, c]) => c.n >= 5).map(([name, c]) => ({ name, mk: median(c.mk), days: median(c.days) }));
    g.best = chs.filter(c => c.mk != null).sort((a, b) => b.mk - a.mk)[0]; g.fast = chs.filter(c => c.days != null).sort((a, b) => a.days - b.days)[0];
  }
  return by;
}
function stalled(by) {
  const k = SV.cur === 'USD' ? 1 : rates?.[SV.cur] || NaN, out = [];
  for (const x of (SV.stock?.rows || [])) {
    if (!okRow(x) || x.age == null) continue;
    const g1 = by.get('bc|' + x.brand + '|' + x.cat), g2 = by.get('c|' + x.cat), seg = g1?.days.length >= 15 ? g1 : g2?.days.length >= 15 ? g2 : by.get('*');
    if (!seg?.p90) continue; const thr = Math.max(90, seg.p90);
    if (x.age >= thr) out.push({ x, seg, segName: seg === g1 ? `${x.brand} · ${tl(x.cat)}` : seg === g2 ? tl(x.cat) : tl('todo'), over: x.age - seg.p50, cost: x.costU != null ? x.costU * k : null, typical: x.costU != null && seg.mk50 ? x.costU * seg.mk50 * k : null });
  }
  return out;
}
async function viewStock() {
  const el = $('sv-stock'); el.innerHTML = `<p class="mute">${esc(tl('Cargando el stock…'))}</p>`;
  try { await loadStock(); } catch (e) { el.innerHTML = `<div class="panel err">${esc(e.message)}</div>`; return; }
  if (!SV.stock.rows.length) { el.innerHTML = `<div class="panel">${esc(tl('Carga la hoja de stock en el buscador para cruzarla con las ventas.'))}</div>`; return; }
  const R = rotation(), totN = R.stock.length, totSold = R.sales.length, totMos = totSold ? totN / (totSold / R.months) : null;
  const value = R.stock.reduce((t, x) => t + (x.costU || 0), 0), old = R.stock.filter(x => x.age >= 365), oldV = old.reduce((t, x) => t + (x.costU || 0), 0);
  let rows = R.rows.filter(r => (SV.stockSmall || r.sold + r.n >= 5) && (!SV.stockSig || r.sig === SV.stockSig));
  const cnt = s => R.rows.filter(r => r.sig === s).length;
  const [sk, sd] = SV.stockSort || ['n', -1]; rows.sort((a, b) => { const va = sk === 'k' ? a.k : a[sk] ?? -1, vb = sk === 'k' ? b.k : b[sk] ?? -1; return (typeof va === 'string' ? va.localeCompare(vb) : (va === Infinity ? 1e12 : va) - (vb === Infinity ? 1e12 : vb)) * sd; });
  const th = (k, t, n = 1) => `<th class="sort${n ? ' num' : ''}" data-k="${k}">${esc(t)}${sk === k ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const tile = (k, v, s) => `<div class="tile" style="cursor:default"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s || '')}</div></div>`;
  const by = segStats(), stl = stalled(by), stSort = { over: (a, b) => b.over - a.over, value: (a, b) => (b.cost || 0) - (a.cost || 0), age: (a, b) => b.x.age - a.x.age }[SV.stallSort];
  stl.sort(stSort); const stlV = stl.reduce((t, s) => t + (s.cost || 0), 0);
  el.innerHTML = `<p class="hint">${esc(tl('Stock de la última carga del buscador ({n} artículos, {d}). Ventas de la ventana elegida, terminando en la última venta ({e}). Los filtros de arriba se aplican a los dos; el periodo, no.', { n: SV.stock.rows.length.toLocaleString('en-US'), d: SV.stock.at ? new Date(SV.stock.at * 1000).toLocaleDateString(LOC()) : '', e: fmtDay(R.end) }))}</p>
    <div class="tiles">${tile(tl('Stock'), totN.toLocaleString('en-US'), tl('a coste: {v}', { v: moneyC(fromTodayUSD(value)) }))}${tile(tl('Meses de stock'), totMos == null ? '—' : totMos.toFixed(1), tl('al ritmo de los últimos {d} días', { d: SV.stockWin }))}
      ${tile(tl('Stock de más de 1 año'), `${old.length.toLocaleString('en-US')} (${pct(old.length / (totN || 1), 0)})`, tl('a coste: {v}', { v: moneyC(fromTodayUSD(oldV)) }))}${tile(tl('Piezas estancadas'), stl.length.toLocaleString('en-US'), tl('a coste: {v}', { v: moneyC(stlV) }))}
      ${tile(tl('Señales'), `▲ ${cnt('buy')} · ▼ ${cnt('over')}`, tl('compra más · sobrestock'))}</div>
    <div class="panel"><div class="row"><label>${esc(tl('Agrupar por'))} <select id="stDim">${['brandcat', 'brand', 'cat', 'type', 'channel', 'entity', 'owner', 'buyer', 'grade', 'band'].map(k => `<option value="${k}">${esc(tl(DIMS[k][0]))}</option>`).join('')}</select></label>
      <label>${esc(tl('Ventana de ventas'))} <select id="stWin"><option value="90">90 ${esc(tl('días'))}</option><option value="180">180 ${esc(tl('días'))}</option><option value="365">365 ${esc(tl('días'))}</option></select></label>
      <select id="stSig"><option value="">${esc(tl('Todas las señales'))}</option><option value="buy">▲ ${esc(tl('Compra más'))} (${cnt('buy')})</option><option value="slow">◆ ${esc(tl('Lento'))} (${cnt('slow')})</option><option value="over">▼ ${esc(tl('Sobrestock'))} (${cnt('over')})</option></select>
      <label><input type="checkbox" id="stSmall"${SV.stockSmall ? ' checked' : ''}> ${esc(tl('incluir grupos pequeños'))}</label></div>
      <p class="hint" style="margin:0 0 6px">${esc(tl('Meses de stock = stock ÷ ventas al mes. ▲ Compra más: se vende rápido (menos de 3 meses de stock, 10+ ventas) y con margen. ▼ Sobrestock: 10+ en stock y más de 12 meses de stock (o sin ventas). ◆ Lento: entre 6 y 12.'))}</p>
      <div style="overflow:auto"><table class="list"><tr>${th('k', tl(DIMS[SV.stockDim][0]), 0)}${th('sold', tl('Vendidos'))}${th('perMonth', tl('Ventas / mes'))}${th('n', tl('Stock'))}${th('mos', tl('Meses de stock'))}${th('st', tl('Sell-through'))}${th('days', tl('Días hasta vender'))}${th('margin', tl('Margen'))}${th('age', tl('Antigüedad stock (mediana)'))}${th('old', tl('Stock > 1 año'))}${th('value', tl('Valor stock (coste)'))}<th>${esc(tl('Señal'))}</th></tr>
      ${rows.slice(0, SV.stockAll ? 500 : 25).map(r => `<tr><td>${esc(r.k)}</td><td class="num">${r.sold.toLocaleString('en-US')}</td><td class="num">${r.perMonth.toFixed(1)}</td><td class="num">${r.n.toLocaleString('en-US')}</td><td class="num">${r.mos === Infinity ? '∞' : r.mos.toFixed(1)}</td><td class="num">${pct(r.st, 0)}</td><td class="num">${r.days == null ? '—' : Math.round(r.days)}</td><td class="num">${pct(r.margin)}</td><td class="num">${r.age == null ? '—' : Math.round(r.age) + ' ' + esc(tl('días'))}</td><td class="num">${r.old || ''}</td><td class="num">${esc(moneyC(r.value))}</td><td>${sigHTML(r.sig)}</td></tr>`).join('')}</table></div>
      ${rows.length > 25 ? `<button id="stAll" style="margin-top:8px">${esc(SV.stockAll ? tl('Ver solo los 25 primeros') : tl('Ver todos ({n})', { n: rows.length }))}</button>` : ''}
      ${SV.stockAll && rows.length > 500 ? `<p class="hint">${esc(tl('Mostrando 500 de {n}. Usa los filtros o el Excel para ver todo.', { n: rows.length }))}</p>` : ''}</div>
    <div class="panel"><div class="row"><h2 style="margin:0">${esc(tl('Piezas estancadas'))}</h2><span class="mute">${esc(tl('{n} piezas llevan en stock más de lo que tarda en venderse el 90% de lo suyo (y al menos 90 días)', { n: stl.length.toLocaleString('en-US') }))}</span>
      <select id="stlSort" style="margin-left:auto"><option value="over">${esc(tl('más días de más'))}</option><option value="value">${esc(tl('más valor'))}</option><option value="age">${esc(tl('más antiguas'))}</option></select>
      <button id="stlSearch">🔎 ${esc(tl('Ver en el buscador'))}</button><button id="stlX">⬇ Excel</button></div>
      <div style="overflow:auto"><table class="list"><tr><th></th><th>CTag</th><th>${esc(tl('Marca'))}</th><th>${esc(tl('Descripción'))}</th><th>${esc(tl('Canal'))}</th><th class="num">${esc(tl('En stock'))}</th><th class="num">${esc(tl('Lo normal en su grupo'))}</th><th class="num">${esc(tl('Coste'))}</th><th class="num">${esc(tl('Venta típica'))}</th><th>${esc(tl('Mejor canal (margen)'))}</th><th>${esc(tl('Más rápido'))}</th></tr>
      ${stl.slice(0, SV.stallAll ? 300 : 25).map(s => `<tr><td><img class="thumb" src="${esc(photo(s.x.code))}" loading="lazy" onerror="this.style.visibility='hidden'"></td><td>${esc(s.x.code)}</td><td>${esc(s.x.brand || '')}</td><td>${esc((s.x.name || '').slice(0, 50))}<br><small class="mute">${esc([s.x.typeC, s.x.grade].filter(Boolean).join(' · '))}</small></td><td>${esc(s.x.channel || '')}</td>
        <td class="num">${s.x.age} ${esc(tl('días'))}</td><td class="num">${Math.round(s.seg.p50)} ${esc(tl('días'))}<br><small class="mute">${esc(s.segName)}</small></td><td class="num">${esc(money(s.cost))}</td><td class="num">${esc(money(s.typical))}<br><small class="mute">${s.seg.mk50 ? '×' + s.seg.mk50.toFixed(2) : ''}</small></td>
        <td>${esc(s.seg.best ? `${s.seg.best.name} (×${s.seg.best.mk.toFixed(2)})` : '—')}</td><td>${esc(s.seg.fast ? `${s.seg.fast.name} (${Math.round(s.seg.fast.days)} ${tl('días')})` : '—')}</td></tr>`).join('')}</table></div>
      ${stl.length > 25 ? `<button id="stlAll" style="margin-top:8px">${esc(SV.stallAll ? tl('Ver solo las 25 primeras') : tl('Ver más ({n})', { n: stl.length }))}</button>` : ''}
      ${SV.stallAll && stl.length > 300 ? `<p class="hint">${esc(tl('Mostrando 300 de {n}. «Ver en el buscador» y el Excel llevan todas.', { n: stl.length }))}</p>` : ''}
      <p class="hint">${esc(tl('Venta típica = coste × lo que suele multiplicarse el coste al venderse en su grupo. «Lo normal» = mediana de días hasta vender.'))}</p></div>`;
  $('stDim').value = SV.stockDim; $('stWin').value = String(SV.stockWin); $('stSig').value = SV.stockSig; $('stlSort').value = SV.stallSort;
  $('stDim').onchange = () => { SV.stockDim = $('stDim').value; viewStock(); }; $('stWin').onchange = () => { SV.stockWin = +$('stWin').value; viewStock(); };
  $('stSig').onchange = () => { SV.stockSig = $('stSig').value; viewStock(); }; $('stSmall').onchange = () => { SV.stockSmall = $('stSmall').checked; viewStock(); };
  $('stlSort').onchange = () => { SV.stallSort = $('stlSort').value; viewStock(); };
  if ($('stAll')) $('stAll').onclick = () => { SV.stockAll = !SV.stockAll; viewStock(); }; if ($('stlAll')) $('stlAll').onclick = () => { SV.stallAll = !SV.stallAll; viewStock(); };
  el.querySelectorAll('th.sort').forEach(h => h.onclick = () => { const k = h.dataset.k, cur = SV.stockSort || ['n', -1]; SV.stockSort = [k, cur[0] === k ? -cur[1] : (k === 'k' ? 1 : -1)]; viewStock(); });
  $('stlSearch').onclick = async () => { store.set('pendingCodes', JSON.stringify(stl.map(s => s.x.code))); await store.flush(); location.href = 'index.html#codes'; };
  $('stlX').onclick = () => xlsxDownload([[tl('Estancadas'), stalledSheet(stl)], [tl('Rotación'), rotationSheet(R.rows)]], 'stock_estancado');
}

/* ---------- Informe mensual (PDF y Excel) ---------- */
function reportData(month) {
  const a = month + '-01', b = endOfMonth(month), pm = shiftMonth(month, -1), ym = shiftMonth(month, -12);
  const inM = m => SV.sales.filter(s => s.m === m && okRow(s)), cur = inM(month), prev = inM(pm), yoy = inM(ym);
  const months12 = [...Array(12)].map((_, i) => shiftMonth(month, i - 11)).filter(m => m >= SV.minDay.slice(0, 7));
  const top = (list, fn, key, n = 10) => groupAgg(list, fn).filter(x => x.k !== '—').sort((x, y) => y[key] - x[key]).slice(0, n);
  const R = SV.stock?.rows?.length ? rotation(180, 'brandcat') : null, stl = R ? stalled(segStats()) : [];
  return { month, a, b, pm, ym, cur, prev, yoy, A: agg(cur), P: prev.length ? agg(prev) : null, Y: yoy.length ? agg(yoy) : null, months12,
    byCh: groupAgg(cur, s => s.channel).sort((x, y) => y.rev - x.rev), prevCh: new Map(groupAgg(prev, s => s.channel).map(x => [x.k, x])),
    byEnt: groupAgg(cur, s => s.entity).sort((x, y) => y.rev - x.rev), prevEnt: new Map(groupAgg(prev, s => s.entity).map(x => [x.k, x])),
    brandsProf: top(cur, s => s.brand, 'prof'), brandsRev: top(cur, s => s.brand, 'rev'), types: top(cur, s => s.typeC, 'rev'), cats: groupAgg(cur, s => s.cat ? tl(s.cat) : '').sort((x, y) => y.rev - x.rev),
    buyers: groupAgg(cur, s => s.buyer).sort((x, y) => y.n - x.n), topSales: [...cur].filter(s => s.revU != null).sort((x, y) => y.revU - x.revU).slice(0, 10),
    losses: [...cur].filter(s => s.profU != null && s.profU < 0).sort((x, y) => x.profU - y.profU), R, stl };
}
function reportHTML(D) {
  const filt = FACETS.flatMap(f => [...SF[f.k]].map(v => `${tl(f.l)}: ${f.lab ? f.lab(v) : v}`));
  const dP = (c, p, mode = 'pct', goodUp = true) => { if (p == null || c == null) return '—'; const d = mode === 'pct' ? (p ? (c - p) / Math.abs(p) : null) : c - p; if (d == null || !isFinite(d)) return '—'; return `${d > 0 ? '▲' : d < 0 ? '▼' : '＝'} ${mode === 'pct' ? (Math.abs(d) * 100).toFixed(1) + '%' : mode === 'pp' ? (Math.abs(d) * 100).toFixed(1) + ' pp' : Math.abs(Math.round(d))}`; };
  const K = [[tl('Unidades vendidas'), x => x.n, v => v.toLocaleString('en-US'), 'pct', true], [tl('Ingresos (lo que os llega)'), x => x.rev, money, 'pct', true], [tl('Coste (PAT)'), x => x.cost, money, 'pct', true],
    [tl('Beneficio'), x => x.prof, money, 'pct', true], [tl('Margen sobre ventas'), x => x.margin, v => pct(v), 'pp', true], [tl('Ticket medio'), x => x.ticket, money, 'pct', true],
    [tl('Días hasta vender (mediana)'), x => x.days, v => v == null ? '—' : Math.round(v), 'days', false], [tl('Vendidas con pérdida'), x => x.losses, v => v.toLocaleString('en-US'), 'pct', false]];
  const val = (X, f, fmt) => X ? fmt(f(X)) : '—';
  const tbl = (head, rows, numFrom = 1) => `<table><tr>${head.map((h, i) => `<th${i >= numFrom ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${i >= numFrom ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  const g = (list, prevMap) => list.map(x => [x.k, x.n.toLocaleString('en-US'), money(x.rev), money(x.prof), pct(x.margin), x.days == null ? '—' : Math.round(x.days), prevMap ? dP(x.n, prevMap.get(x.k)?.n) : '']);
  const chans = [...SV.colors.keys()], series = chans.map(c => ({ name: c, color: SV.colors.get(c) }));
  const cell = new Map(); SV.sales.forEach(s => { if (okRow(s) && D.months12.includes(s.m)) { const k = s.m + '|' + s.channel; cell.set(k, (cell.get(k) || 0) + 1); } });
  const part = m => m + '-01' < SV.minDay || endOfMonth(m) > SV.maxDay, anyPart = D.months12.some(part);
  const o = { labels: D.months12.map(m => new Date(m + '-01T00:00:00Z').toLocaleDateString(LOC(), { month: 'short', year: '2-digit', timeZone: 'UTC' }) + (part(m) ? '*' : '')), series, val: (i, j) => cell.get(D.months12[i] + '|' + chans[j]) || 0, fmt: v => v, yfmt: shortN, title: '' };
  const A = D.A;
  let h = `<div class="rep"><h1>${esc(tl('Informe de ventas · {m}', { m: fmtMonth(D.month) }))}</h1>
    <div class="mute">${esc(tl('Del {a} al {b} · importes en {c} al tipo de cambio de cada venta · generado el {g}', { a: fmtDay(D.a), b: fmtDay(D.b), c: SV.cur, g: fmtDay(new Date().toISOString().slice(0, 10)) }))}${filt.length ? ' · ' + esc(tl('Filtros: {f}', { f: filt.join(', ') })) : ''}</div>
    <p style="font-size:13px;margin:10px 0 0">${esc(tl('{n} ventas, {r} de ingresos y {p} de beneficio (margen {m}). Mediana de {d} días hasta vender; {l} ventas con pérdida.', { n: A.n.toLocaleString('en-US'), r: money(A.rev), p: money(A.prof), m: pct(A.margin), d: A.days == null ? '—' : Math.round(A.days), l: A.losses }))}
    ${D.P ? esc(' ' + tl('Frente a {pm}: unidades {du}, beneficio {dp}.', { pm: fmtMonth(D.pm), du: dP(A.n, D.P.n), dp: dP(A.prof, D.P.prof) })) : ''}</p>
    ${D.a < SV.minDay || D.b > SV.maxDay ? `<div class="note">⚠ ${esc(tl('Mes incompleto: el archivo solo tiene ventas del {a} al {b}.', { a: fmtDay(SV.minDay), b: fmtDay(SV.maxDay) }))}</div>` : ''}
    <h3>${esc(tl('Resumen'))}</h3>${tbl([tl('Indicador'), fmtMonth(D.month), fmtMonth(D.pm), 'Δ', fmtMonth(D.ym), 'Δ'], K.map(([l, f, fmt, mode, up]) => [l, val(A, f, fmt), val(D.P, f, fmt), D.P ? dP(f(A), f(D.P), mode, up) : '—', val(D.Y, f, fmt), D.Y ? dP(f(A), f(D.Y), mode, up) : '—']))}
    ${!D.Y ? `<div class="note">${esc(tl('Aún no hay datos del mismo mes del año anterior: aparecerán cuando el histórico lo cubra.'))}</div>` : ''}
    <h3>${esc(tl('Unidades por mes y canal (últimos 12 meses)'))}</h3><div class="viz-root">${legendHTML(series)}${stackSVG(o)}</div>
    ${anyPart ? `<div class="note">${esc(tl('* Incompleto: solo hay ventas del {a} al {b}.', { a: fmtDay(SV.minDay), b: fmtDay(SV.maxDay) }))}</div>` : ''}
    <h3>${esc(tl('Por canal'))}</h3>${tbl([tl('Canal'), tl('Unidades'), tl('Ingresos'), tl('Beneficio'), tl('Margen'), tl('Días'), tl('Δ unidades')], g(D.byCh, D.prevCh))}
    <h3>${esc(tl('Por entidad'))}</h3>${tbl([tl('Entidad'), tl('Unidades'), tl('Ingresos'), tl('Beneficio'), tl('Margen'), tl('Días'), tl('Δ unidades')], g(D.byEnt, D.prevEnt))}
    <div class="cols2"><div><h3>${esc(tl('Top 10 marcas por beneficio'))}</h3>${tbl([tl('Marca'), tl('Unid.'), tl('Beneficio'), tl('Margen')], D.brandsProf.map(x => [x.k, x.n, money(x.prof), pct(x.margin)]))}</div>
      <div><h3>${esc(tl('Top 10 tipos por ingresos'))}</h3>${tbl([tl('Tipo'), tl('Unid.'), tl('Ingresos'), tl('Margen')], D.types.map(x => [x.k, x.n, money(x.rev), pct(x.margin)]))}</div></div>
    <h3>${esc(tl('Por categoría'))}</h3>${tbl([tl('Categoría'), tl('Unidades'), tl('Ingresos'), tl('Beneficio'), tl('Margen'), tl('Días'), ''], g(D.cats))}
    <h3>${esc(tl('Las 10 ventas más grandes'))}</h3>${tbl(['CTag', tl('Marca'), tl('Descripción'), tl('Canal'), tl('Venta'), tl('Margen')], D.topSales.map(s => [s.code, s.brand || '', (s.descr || '').slice(0, 40), s.channel, money(s.revU * s.k), s.profU != null ? pct(s.profU / s.revU) : '—']), 4)}
    <h3>${esc(tl('Ventas con pérdida ({n}, total {v})', { n: D.losses.length, v: money(D.losses.reduce((t, s) => t + s.profU * s.k, 0)) }))}</h3>
    ${D.losses.length ? tbl(['CTag', tl('Marca'), tl('Canal'), tl('Coste'), tl('Venta'), tl('Pérdida')], D.losses.slice(0, 10).map(s => [s.code, s.brand || '', s.channel, money(s.costU * s.k), money(s.revU * s.k), money(s.profU * s.k)]), 3) : `<div class="note">${esc(tl('Ninguna.'))}</div>`}`;
  if (D.R) {
    const buy = D.R.rows.filter(r => r.sig === 'buy').sort((x, y) => y.perMonth - x.perMonth).slice(0, 10), over = D.R.rows.filter(r => r.sig === 'over').sort((x, y) => y.n - x.n).slice(0, 10);
    h += `<h3>${esc(tl('Stock: qué comprar y qué sobra (ventas de los últimos 180 días)'))}</h3><div class="cols2"><div><b>▲ ${esc(tl('Compra más'))}</b>${tbl([tl('Marca · categoría'), tl('Ventas/mes'), tl('Stock'), tl('Meses')], buy.map(r => [r.k, r.perMonth.toFixed(1), r.n, r.mos.toFixed(1)]))}</div>
      <div><b>▼ ${esc(tl('Sobrestock'))}</b>${tbl([tl('Marca · categoría'), tl('Ventas/mes'), tl('Stock'), tl('Meses')], over.map(r => [r.k, r.perMonth.toFixed(1), r.n, r.mos === Infinity ? '∞' : r.mos.toFixed(0)]))}</div></div>
      <div class="note">${esc(tl('Piezas estancadas: {n} (coste {v}). Lista completa en Ventas → Stock y rotación.', { n: D.stl.length, v: money(D.stl.reduce((t, s) => t + (s.cost || 0), 0)) }))}</div>`;
  }
  h += `<h3>${esc(tl('Por buyer (orientación de compras)'))}</h3>${tbl([tl('Buyer'), tl('Unidades'), tl('Ingresos'), tl('Beneficio'), tl('Margen'), tl('Días'), tl('Con pérdida')], D.buyers.map(x => [x.k, x.n.toLocaleString('en-US'), money(x.rev), money(x.prof), pct(x.margin), x.days == null ? '—' : Math.round(x.days), pct(x.lossPct)]))}
    <div class="note">${esc(tl('Sirve para decidir qué comprar. Los números dependen mucho del tipo de pieza y del canal de cada uno, así que no son una medida del trabajo de nadie.'))}</div></div>`;
  return h;
}
function viewReport() {
  const months = [...new Set(SV.sales.map(s => s.m))].sort().reverse();
  if (!months.includes(SV.repMonth)) SV.repMonth = months[0];
  const D = reportData(SV.repMonth);
  $('sv-report').innerHTML = `<div class="row" style="margin:10px 0"><label>${esc(tl('Mes'))} <select id="repM">${months.map(m => `<option value="${m}">${esc(fmtMonth(m))}</option>`).join('')}</select></label>
    <button class="primary" id="repPdf">🖨 PDF</button><button id="repX">⬇ Excel</button><span class="hint">${esc(tl('El informe usa el mes elegido (no el periodo de arriba) y respeta los filtros.'))}</span></div>
    ${SV.stock && !SV.stock.rows.length ? `<p class="hint">${esc(tl('Carga la hoja de stock en el buscador para incluir en el informe qué comprar y qué sobra.'))}</p>` : ''}<div id="repBox">${reportHTML(D)}</div>`;
  $('repM').value = SV.repMonth; $('repM').onchange = () => { SV.repMonth = $('repM').value; viewReport(); };
  $('repPdf').onclick = () => { $('printArea').innerHTML = `<style>@page { size: A4 portrait; margin: 12mm; } .rep { border:none; padding:0; } .rep h3 { break-after:avoid; } .rep table { break-inside:auto; } .rep tr { break-inside:avoid; }</style>` + reportHTML(D);
    const old = document.title; document.title = tl('informe_ventas_{m}', { m: D.month }); setTimeout(() => { window.print(); document.title = old; }, 300); };
  $('repX').onclick = () => xlsxDownload(reportSheets(D), tl('informe_ventas_{m}', { m: D.month }));
  if (!SV.stock) loadStock().then(() => { if (SV.view === 'report') viewReport(); }).catch(() => {});
}

/* ---------- Excel ---------- */
const XH = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'E3EFE8' } } };
function sheetOf(aoa, widths) { const ws = XLSX.utils.aoa_to_sheet(aoa); (aoa[0] || []).forEach((_, c) => { const a = XLSX.utils.encode_cell({ r: 0, c }); if (ws[a]) ws[a].s = XH; }); ws['!cols'] = (widths || aoa[0].map(() => 16)).map(w => ({ wch: w })); return ws; }
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const grpRows = (list, label) => [[label, tl('Unidades'), tl('Ingresos') + ` (${SV.cur})`, tl('Beneficio') + ` (${SV.cur})`, tl('Margen'), tl('Ticket medio'), tl('Días (mediana)'), tl('Con pérdida')],
  ...list.map(x => [x.k, x.n, r2(x.rev), r2(x.prof), r2(x.margin), r2(x.ticket), x.days == null ? null : Math.round(x.days), r2(x.lossPct)])];
function salesSheet(list) {
  return [['CTag', tl('Fecha de venta'), tl('Canal'), tl('Marca'), tl('Tipo'), tl('Categoría'), tl('Descripción'), tl('Entidad'), 'Owner', 'Buyer', tl('Grado'), tl('Fecha de alta'), tl('Días'),
    'PAT', tl('Moneda PAT'), tl('Venta'), tl('Moneda venta'), tl('Coste') + ` (${SV.cur})`, tl('Venta') + ` (${SV.cur})`, tl('Beneficio') + ` (${SV.cur})`, tl('Margen')],
  ...list.map(s => [s.code, s.sold_date, s.channel, s.brand, s.typeC, s.cat ? tl(s.cat) : '', s.descr, s.entity, s.owner, s.buyer, s.grade, s.added, s.days, s.pat, s.pat_cur, s.sold, s.sold_cur,
    r2(s.costU != null && s.k ? s.costU * s.k : null), r2(s.revU != null && s.k ? s.revU * s.k : null), r2(s.profU != null && s.k ? s.profU * s.k : null), s.profU != null && s.revU ? r2(s.profU / s.revU) : null])];
}
const rotationSheet = rows => [[tl('Grupo'), tl('Vendidos'), tl('Ventas / mes'), tl('Stock'), tl('Meses de stock'), tl('Sell-through'), tl('Días hasta vender'), tl('Margen'), tl('Antigüedad stock (mediana)'), tl('Stock > 1 año'), tl('Valor stock (coste)') + ` (${SV.cur})`, tl('Señal')],
  ...rows.map(r => [r.k, r.sold, r2(r.perMonth), r.n, r.mos === Infinity ? null : r2(r.mos), r2(r.st), r.days == null ? null : Math.round(r.days), r2(r.margin), r.age == null ? null : Math.round(r.age), r.old, r2(r.value), r.sig ? tl(SIG[r.sig][2]) : ''])];
const stalledSheet = list => [['CTag', tl('Marca'), tl('Descripción'), tl('Tipo'), tl('Grado'), tl('Canal'), tl('Días en stock'), tl('Lo normal en su grupo (días)'), tl('Grupo'), tl('Coste') + ` (${SV.cur})`, tl('Venta típica') + ` (${SV.cur})`, tl('Mejor canal (margen)'), tl('Más rápido')],
  ...list.map(s => [s.x.code, s.x.brand, s.x.name, s.x.typeC, s.x.grade, s.x.channel, s.x.age, Math.round(s.seg.p50), s.segName, r2(s.cost), r2(s.typical), s.seg.best?.name || '', s.seg.fast?.name || ''])];
function reportSheets(D) {
  const K = [[tl('Indicador'), fmtMonth(D.month), fmtMonth(D.pm), fmtMonth(D.ym)], ...[[tl('Unidades vendidas'), 'n'], [tl('Ingresos'), 'rev'], [tl('Coste (PAT)'), 'cost'], [tl('Beneficio'), 'prof'], [tl('Margen sobre ventas'), 'margin'], [tl('Ticket medio'), 'ticket'], [tl('Días hasta vender (mediana)'), 'days'], [tl('Vendidas con pérdida'), 'losses']]
    .map(([l, k]) => [l, r2(D.A[k]), D.P ? r2(D.P[k]) : null, D.Y ? r2(D.Y[k]) : null])];
  const out = [[tl('Resumen'), K], [tl('Canales'), grpRows(D.byCh, tl('Canal'))], [tl('Entidades'), grpRows(D.byEnt, tl('Entidad'))], [tl('Marcas'), grpRows(groupAgg(D.cur, s => s.brand).sort((a, b) => b.prof - a.prof), tl('Marca'))],
    [tl('Tipos'), grpRows(groupAgg(D.cur, s => s.typeC).sort((a, b) => b.rev - a.rev), tl('Tipo'))], ['Buyers', grpRows(D.buyers, 'Buyer')], [tl('Pérdidas'), salesSheet(D.losses)], [tl('Ventas del mes'), salesSheet(D.cur)]];
  if (D.R) out.push([tl('Rotación'), rotationSheet(D.R.rows)], [tl('Estancadas'), stalledSheet(D.stl)]);
  return out;
}
$('sXlsx').onclick = () => { // lo que se ve: periodo + filtros
  const cur = curSales();
  xlsxDownload([[tl('Resumen'), [[tl('Indicador'), tl('Valor')], ...Object.entries(agg(cur)).map(([k, v]) => [k, r2(v)])]], [tl('Canales'), grpRows(groupAgg(cur, s => s.channel), tl('Canal'))],
    [tl('Marcas'), grpRows(groupAgg(cur, s => s.brand).sort((a, b) => b.rev - a.rev), tl('Marca'))], [tl('Tipos'), grpRows(groupAgg(cur, s => s.typeC).sort((a, b) => b.rev - a.rev), tl('Tipo'))],
    [tl('Meses'), grpRows(groupAgg(cur, s => s.m).sort((a, b) => a.k.localeCompare(b.k)), tl('Mes'))], ['Buyers', grpRows(groupAgg(cur, s => s.buyer).sort((a, b) => b.n - a.n), 'Buyer')], [tl('Ventas'), salesSheet(cur)]], 'ventas_' + periodRange().join('_'));
};
function xlsxDownload(sheets, name) {
  if (typeof XLSX === 'undefined') return say(tl('No se cargó la librería xlsx (falta vendor/xlsx.bundle.js). Usa el botón CSV.'));
  const wb = XLSX.utils.book_new(), used = new Set();
  sheets.forEach(([n, aoa]) => { let nm = String(n).replace(/[:\\/?*[\]]/g, '-').slice(0, 30) || 'Hoja', i = 1; while (used.has(nm)) nm = nm.slice(0, 27) + '_' + (++i); used.add(nm); XLSX.utils.book_append_sheet(wb, sheetOf(aoa), nm); });
  XLSX.writeFile(wb, `${name}.xlsx`);
}
