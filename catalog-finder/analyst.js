/* ✨ Pregúntale a la IA: preguntas libres sobre ventas, stock y buyers.
   La IA no recibe el archivo: pide tablas a unas herramientas que se calculan aquí, en tu ordenador, y contesta con esas cifras.
   Las tablas que ha usado se pueden ver en cada paso y bajar a Excel. */
'use strict';
const AI_MODELS = [ // [id, nombre, $ por millón de tokens: entrada, salida, lectura de caché, escritura de caché]
  ['claude-opus-5-5', 'Opus 5.5 · el más listo', 4, 20, 0.2, 5], ['claude-sonnet-5-5', 'Sonnet 5.5 · más barato', 2, 10, 0.2, 2.5], ['claude-haiku-5-5', 'Haiku 5.5 · el más barato', 0.1, 0.5, 0.01, 0.125]];
const AI = { model: store.get('aiModel', 'claude-opus-5-5'), messages: [], conv: [], tables: [], cost: 0, busy: false, step: 0, configured: null };
const CAT_EN = { 'Bolsos': 'Bags', 'Pequeña marroquinería': 'Small leather goods', 'Joyería y relojes': 'Jewelry & watches', 'Accesorios': 'Accessories', 'Ropa y calzado': 'Clothing & shoes', 'Otros': 'Other' };
/* moneda de las herramientas: la elegida arriba al empezar la conversación (o la que pida la IA en cada llamada). Ventas al cambio del día de venta, stock al de hoy. */
let AIC = 'USD';
const aiCurOk = c => c === 'USD' || !!rates?.[c] || SV.fxDates.some(d => SV.fxMap[d]?.[c]);
const aiK = x => { if (AIC === 'USD') return 1; if (x._kc !== AIC) { x._kc = AIC; x._k = x.d ? rateOn(AIC, x.d) : rates?.[AIC] || null; } return x._k; };
const cv = (x, f) => { const v = x[f], k = aiK(x); return v == null || !k ? null : v * k; }; // importe de la pieza en la moneda de las herramientas
const aiBands = () => { const k = AIC === 'USD' ? 1 : rates?.[AIC] || rateOn(AIC, SV.maxDay) || 1, e = [100, 300, 1000, 3000].map(v => AIC === 'USD' ? v : niceNum(v * k)), f = v => v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : String(v);
  return [[0, e[0], '<' + f(e[0])], [e[0], e[1], `${f(e[0])}-${f(e[1])}`], [e[1], e[2], `${f(e[1])}-${f(e[2])}`], [e[2], e[3], `${f(e[2])}-${f(e[3])}`], [e[3], Infinity, '>' + f(e[3])]]; };
const cc = n => `${n}_${AIC.toLowerCase()}`; // nombre de columna con la moneda
const BAND_DAYS = [[0, 30, '<30'], [30, 60, '30-60'], [60, 90, '60-90'], [90, 180, '90-180'], [180, 365, '180-365'], [365, Infinity, '>365']];
const inBand = (B, v) => v == null || v < 0 ? '' : B.find(([a, b]) => v >= a && v < b)[2];
const AI_DIMS = { brand: x => x.brand, product: x => x.prod, model: x => x.bm, model_size: x => x.bms, line: x => x.bl, color: x => x.color, material: x => x.material, size: x => x.size,
  category: x => CAT_EN[x.cat] || x.cat, type: x => x.typeC, channel: x => x.channel, entity: x => x.entity, buyer: x => x.buyer, owner: x => x.owner, grade: x => x.grade,
  month: x => x.m || '', week: x => x.d ? addDaysISO(x.d, -((new Date(x.d + 'T00:00:00Z').getUTCDay() + 6) % 7)) : '', cost_band: x => inBand(aiBands(), cv(x, 'costU')), price_band: x => inBand(aiBands(), cv(x, 'revU')),
  days_band: x => inBand(BAND_DAYS, x.days), age_band: x => inBand(BAND_DAYS, x.age) };
const AI_DIM_KEYS = Object.keys(AI_DIMS);
const nrm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* ---------- herramientas (lo que la IA puede pedir) ---------- */
const strArr = d => ({ type: 'array', items: { type: 'string' }, description: d });
const AI_FILTERS = { type: 'object', description: 'Optional filters: AND between fields, any of the values within a field. Text values match case-insensitively and partially (model "Neverfull", brand "Dior").', properties: {
  brand: strArr('Brands'), product: strArr('Product groups (model, or line + item type)'), model: strArr('Models, e.g. "Neverfull", "GG Marmont", "Lady Dior"'), line: strArr('Canvas or leather lines, e.g. "Monogram", "Damier Ebene", "Saffiano", "Epi"'),
  color: strArr('Black, Brown, Beige, White, Cream, Red, Burgundy, Pink, Orange, Yellow, Green, Navy, Blue, Purple, Grey, Silver, Gold, Multicolor'),
  material: strArr('Leather, Canvas, Nylon, Suede, Patent leather, Exotic, Fabric, Straw, Plastic / PVC, Platinum, Gold 18K, Gold 14K, Silver, Gold-plated, Steel, Metal'), size: strArr('e.g. "PM", "MM", "GM", "Mini", "30"'),
  category: strArr('Bags, Small leather goods, Jewelry & watches, Accessories, Clothing & shoes, Other'), type: strArr('Item types, e.g. "Shoulder bag", "Wallet"'), channel: strArr('Sales channels'), entity: strArr('Entities'),
  buyer: strArr('Buyers (who purchased the piece for the company)'), owner: strArr('Owners'), grade: strArr('SA, S, A, AB, B+, B, B-, BC, C'), text: { type: 'string', description: 'Words that must all appear in the title' },
  exclude_text: { type: 'string', description: 'Words that must not appear in the title' }, min_cost: { type: 'number', description: 'Cost (PAT) from, in the tool currency' }, max_cost: { type: 'number', description: 'Cost (PAT) up to, in the tool currency' },
  min_sold: { type: 'number', description: 'Sales only: sold price from, in the tool currency' }, max_sold: { type: 'number', description: 'Sales only: sold price up to, in the tool currency' }, min_days: { type: 'number', description: 'Sales only: days to sell' }, max_days: { type: 'number', description: 'Sales only' },
  min_age_days: { type: 'number', description: 'Stock only: days in stock' }, max_age_days: { type: 'number', description: 'Stock only' }, loss_only: { type: 'boolean', description: 'Sales only: sold below cost' },
  added_from: { type: 'string', description: 'Added (purchase) date from, YYYY-MM-DD' }, added_to: { type: 'string', description: 'YYYY-MM-DD' } } };
const AI_PERIOD = { type: 'object', description: 'Sale-date period; omit for the whole history. last_days counts back from the last sale date in the data.', properties: { last_days: { type: 'integer' }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } } };
const AI_GROUP = { type: 'array', items: { type: 'string', enum: AI_DIM_KEYS }, maxItems: 2, description: 'Up to 2 dimensions; omit for one total row. product = model if recognised, else line + item type. month, week, price_band and days_band are for sales; age_band for stock.' };
const ORDER = { type: 'string', enum: ['desc', 'asc'] };
const CUR_P = { type: 'string', description: 'ISO currency for every amount and amount filter in this call (e.g. JPY, USD, EUR); default = the conversation currency from the context' };
const AI_TOOLS = [
  { name: 'query_sales', description: 'Aggregate sold pieces into a table: units, revenue, profit, margin %, markup (sold / cost, median), median sale price and cost, median days to sell, loss % and share of units. Filter, group, sort and limit. compare_previous adds the units of the previous period of equal length and the change %.',
    input_schema: { type: 'object', properties: { currency: CUR_P, period: AI_PERIOD, filters: AI_FILTERS, group_by: AI_GROUP, sort_by: { type: 'string', enum: ['units', 'revenue', 'profit', 'margin', 'markup', 'med_days', 'med_sold', 'loss', 'change'] }, order: ORDER,
      limit: { type: 'integer', description: 'Rows to return, default 25, max 100' }, min_units: { type: 'integer', description: 'Hide groups with fewer sales' }, compare_previous: { type: 'boolean' } } } },
  { name: 'stock_status', description: 'Current stock (last sheet loaded) per group, crossed with sales velocity: pieces, value at cost (today\'s rates), median age, sales in the window, sales per month, months of stock, sell-through %, signal (buy_more / slow / overstock), and the best channel by markup and the fastest channel for that group (whole sales history, 3+ sales per channel).',
    input_schema: { type: 'object', properties: { currency: CUR_P, filters: AI_FILTERS, group_by: AI_GROUP, window_days: { type: 'integer', description: 'Sales window for velocity, ending at the last sale date; default 180' },
      sort_by: { type: 'string', enum: ['stock', 'value', 'age', 'months_of_stock', 'sales_per_month', 'sell_through'] }, order: ORDER, limit: { type: 'integer', description: 'default 25, max 100' }, min_stock: { type: 'integer' } } } },
  { name: 'list_items', description: 'List individual pieces with title and figures: sold pieces (source "sales") or current stock (source "stock"). Use it for concrete examples, exact titles, or to pick codes for view_photos.',
    input_schema: { type: 'object', properties: { currency: CUR_P, source: { type: 'string', enum: ['sales', 'stock'] }, period: AI_PERIOD, filters: AI_FILTERS, sort_by: { type: 'string', enum: ['date', 'profit', 'markup', 'sold', 'cost', 'days', 'age'] }, order: ORDER,
      limit: { type: 'integer', description: 'default 20, max 40' } }, required: ['source'] } },
  { name: 'top_terms', description: 'Most frequent words and two-word phrases in the titles of the matching sold pieces, with how often they appear in current stock (sold share = sold / (sold + stock)). Use it to find models, colours or details that the automatic detection misses.',
    input_schema: { type: 'object', properties: { currency: CUR_P, period: AI_PERIOD, filters: AI_FILTERS, limit: { type: 'integer', description: 'default 40' } } } },
  { name: 'buyer_report', description: 'What happens to what each buyer purchases: pieces bought since a date (sold + still in stock), % sold vs what is normal for the same brand, category and purchase month, days to sell, margin, current stock, stock older than 6 months and stalled pieces. With "buyer": that buyer\'s best-selling and non-selling products.',
    input_schema: { type: 'object', properties: { currency: CUR_P, buyer: { type: 'string' }, since: { type: 'string', description: 'YYYY-MM-DD; default = first sale date in the data (complete history)' }, limit: { type: 'integer' } } } },
  { name: 'purchase_costs', description: 'Purchase prices compared like for like: pieces bought (sold + still in stock) grouped by brand, model, size, line and grade, with the median cost per group and, per buyer, how many they bought and their median cost vs the group median. "overpaid" = sum of what was paid above the group median. Pieces costing over 3x above or below their group are left out (usually a different item). Without "buyer": a summary per buyer plus the groups with the most overpayment. With "buyer": the groups where that buyer pays most above the others.',
    input_schema: { type: 'object', properties: { currency: CUR_P, buyer: { type: 'string' }, since: { type: 'string', description: 'Purchase (added) date from, YYYY-MM-DD; default = 12 months before the last sale date' },
      search: { type: 'string', description: 'Only groups whose name contains this text (e.g. "Keepall 50", "Kelly", "grade B+")' }, min_pieces: { type: 'integer', description: 'Minimum pieces per group, default 4' },
      include_unrecognised: { type: 'boolean', description: 'Also group pieces without a recognised model (by line + item type)' }, limit: { type: 'integer', description: 'default 25, max 80' } } } },
  { name: 'view_photos', description: 'See the main photo of up to 8 pieces (CTag codes) to judge colour, leather, hardware, style or condition. Costs extra: use it only when titles are not enough.',
    input_schema: { type: 'object', properties: { currency: CUR_P, codes: { type: 'array', items: { type: 'string' }, maxItems: 8 } }, required: ['codes'] } }];
const AI_SYSTEM = `You are the sales analyst of a pre-owned luxury goods reseller (bags, small leather goods, jewelry, watches, scarves, clothing). The user is the owner or a manager. They want concrete, practical answers to decide what to buy, at what cost, and on which channel to sell.

Data you can query with the tools (computed locally from their files):
- Sales: one row per sold piece, from the monthly sold snapshot: sale date, channel (the sheet tab where it sold), brand, item type and category, title, entity, owner, buyer (the person who purchased the piece for the company), grade (condition: SA and S best, then A, AB, B+, B, B-, BC, C), PAT = cost price after tax, sold price = what the company receives (on consignment platforms it is the net payout), added date (when it entered stock).
- Stock: the current inventory (last sheet loaded), with the same descriptive fields, age in days and the channel where it is listed now.
- Model, line (canvas or leather line such as Monogram, Damier Ebene, GG Supreme, Saffiano, Epi), colour, material and size are read automatically from the titles with a dictionary; "—" means the title did not name it. "product" = the model if recognised, otherwise line + item type.
- Amounts are in the conversation currency stated in the context (each sale converted at the exchange rate of its sale date, stock at today's rate); every tool has an optional currency parameter. Amount filters use the same currency, so a budget the user gives in that currency goes straight into max_cost. Margin = (sold - cost) / sold. Markup = sold / cost. Days to sell = sale date - added date.

How to work:
- Take every number from the tools. Never invent figures; general market knowledge is allowed only as brief, clearly labelled context.
- Prefer a few well-aimed calls (group_by, filters, sort, limit) over many small ones. Use compare_previous for trends, list_items for concrete examples and exact titles, top_terms to find details the dictionary misses, view_photos only when appearance matters.
- Be careful with small samples: flag groups with fewer than 5 sales and do not base a recommendation on 1-2 sales.
- The latest month in the data may be incomplete (late reporting); say so when it affects a trend.
- For "where to sell", compare channels on markup, margin, days to sell and loss rate for the same product group, and say which is best and why (for example: one channel pays more over cost but takes three times longer).
- For purchase prices ("who pays more for the same thing", "where can we cut cost"), use purchase_costs: it compares the same model, size, line and grade. A higher cost can be justified by a better piece (colour, year, accessories): check sells_vs_median, and look at photos before calling it overpaying.
- Buyer figures are for purchasing decisions, not to judge people: compare each buyer with what is normal for the same brand, category and purchase month, and mention the mix of what they buy.

Answer format: in the language the user message asks for. Start with the direct answer in 2-4 bullets with concrete names and numbers. Then short sections or a compact markdown table if useful. End with 3-5 concrete recommendations under a heading. Keep it under about 350 words unless the user asks for more. No preamble.`;

const aiNum = (v, d = 0) => v == null || !isFinite(v) ? null : +(+v).toFixed(d);
const p100 = v => v == null ? null : v * 100;
function aiPeriod(p) {
  p = p || {}; let a = SV.minDay, b = SV.maxDay;
  if (+p.last_days > 0) a = addDaysISO(b, -(Math.round(+p.last_days) - 1));
  if (/^\d{4}-\d{2}-\d{2}/.test(p.from || '')) a = p.from.slice(0, 10); if (/^\d{4}-\d{2}-\d{2}/.test(p.to || '')) b = p.to.slice(0, 10);
  return [a, b];
}
function aiFilter(f, src) { // devuelve una función que dice si una venta / pieza de stock cumple los filtros que pide la IA
  f = f && typeof f === 'object' ? f : {};
  const arr = k => (Array.isArray(f[k]) ? f[k] : f[k] != null && f[k] !== '' ? [f[k]] : []).map(nrm).filter(Boolean);
  const F = AI_DIM_KEYS.map(k => [k, arr(k)]).filter(([, v]) => v.length), words = nrm(f.text).split(/\s+/).filter(Boolean), nots = nrm(f.exclude_text).split(/\s+/).filter(Boolean);
  const n = k => f[k] == null || f[k] === '' || !isFinite(+f[k]) ? null : +f[k];
  const own = k => x => x[k], money = k => x => cv(x, k), usd = k => x => x[k]; // *_usd: nombres antiguos, en USD
  const lim = [[money('costU'), n('min_cost'), n('max_cost')], [usd('costU'), n('min_cost_usd'), n('max_cost_usd')],
    ...(src === 'sales' ? [[money('revU'), n('min_sold'), n('max_sold')], [usd('revU'), n('min_sold_usd'), n('max_sold_usd')], [own('days'), n('min_days'), n('max_days')]] : [[own('age'), n('min_age_days'), n('max_age_days')]])];
  return x => {
    for (const [k, terms] of F) { const v = nrm(k === 'category' ? `${CAT_EN[x.cat] || ''} ${x.cat || ''}` : AI_DIMS[k](x)); if (!terms.some(t => v === t || (v && v.includes(t)))) return false; }
    if (words.length || nots.length) { const t = nrm(`${x.brand} ${src === 'sales' ? x.descr : x.name}`); if (words.some(w => !t.includes(w)) || nots.some(w => t.includes(w))) return false; }
    for (const [g, lo, hi] of lim) { if (lo == null && hi == null) continue; const v = g(x); if (v == null) return false; if (lo != null && !(v >= lo)) return false; if (hi != null && !(v <= hi)) return false; }
    if (src === 'sales' && f.loss_only && !(x.profU < 0)) return false;
    if (f.added_from && !(x.added >= f.added_from)) return false; if (f.added_to && !(x.added && x.added <= f.added_to)) return false;
    return true;
  };
}
const noUIFilters = fn => { // las herramientas de la IA no usan los filtros de la pantalla: cada una lleva los suyos
  const saved = FACETS.map(f => [f.k, [...SF[f.k]]]), sr = { ...SR }; FACETS.forEach(f => SF[f.k].clear()); SR.cost = SR.sold = null;
  try { return fn(); } finally { saved.forEach(([k, v]) => v.forEach(x => SF[k].add(x))); Object.assign(SR, sr); }
};
function aiAgg(list) {
  let rev = 0, prof = 0, revM = 0, nm = 0, loss = 0; const days = [], mk = [], sold = [], cost = [];
  for (const s of list) {
    const r = cv(s, 'revU'), c = cv(s, 'costU'), p = cv(s, 'profU');
    if (r != null) { rev += r; sold.push(r); } if (c != null) cost.push(c);
    if (p != null) { prof += p; revM += r; nm++; if (s.profU < 0) loss++; if (s.costU > 0) mk.push(s.revU / s.costU); }
    if (s.days != null && s.days >= 0) days.push(s.days);
  }
  return { units: list.length, revenue: rev, profit: prof, margin: revM ? prof / revM * 100 : null, markup: median(mk), med_sold: median(sold), med_cost: median(cost), med_days: median(days), loss: nm ? loss / nm * 100 : null };
}
const groupBy = (list, dims) => { const g = new Map(); list.forEach(x => { const k = dims.map(d => AI_DIMS[d](x) || '—').join(' | '); let a = g.get(k); if (!a) g.set(k, a = []); a.push(x); }); return g; };
const okDims = g => (Array.isArray(g) ? g : g ? [g] : []).filter(d => AI_DIMS[d]).slice(0, 2);
const lim = (v, d, max) => Math.max(1, Math.min(max, Math.round(+v || d)));
const descF = f => { const p = Object.entries(f || {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`); return p.length ? p.join(', ') : 'none'; };

function toolQuerySales(i) {
  const [a, b] = aiPeriod(i.period), keep = aiFilter(i.filters, 'sales'), dims = okDims(i.group_by);
  const cur = SV.sales.filter(s => s.d >= a && s.d <= b && keep(s)), g = groupBy(cur, dims), tot = aiAgg(cur);
  let prevG = null, pa, pb;
  if (i.compare_previous) { const n = daysBetween(a, b) + 1; pa = addDaysISO(a, -n); pb = addDaysISO(a, -1); prevG = groupBy(SV.sales.filter(s => s.d >= pa && s.d <= pb && keep(s)), dims); }
  let rows = [...g].map(([k, l]) => { const A = aiAgg(l), pn = prevG ? (prevG.get(k) || []).length : null; return { k, ...A, share: cur.length ? l.length / cur.length * 100 : null, prev: pn, change: pn ? (l.length - pn) / pn * 100 : null }; });
  if (+i.min_units > 0) rows = rows.filter(r => r.units >= +i.min_units);
  const sk = i.sort_by || 'units', dir = i.order === 'asc' ? 1 : -1, key = { units: 'units', revenue: 'revenue', profit: 'profit', margin: 'margin', markup: 'markup', med_days: 'med_days', med_sold: 'med_sold', loss: 'loss', change: 'change' }[sk] || 'units';
  const nil = dir > 0 ? Infinity : -Infinity; rows.sort((x, y) => ((x[key] ?? nil) - (y[key] ?? nil)) * dir || 0); // sin dato, siempre al final
  const n = lim(i.limit, 25, 100), cols = [dims.join(' / ') || 'all', 'units', cc('revenue'), cc('profit'), 'margin_%', 'markup', cc('med_sold'), cc('med_cost'), 'med_days', 'loss_%', 'share_%', ...(prevG ? ['prev_units', 'change_%'] : [])];
  const row = r => [r.k, r.units, aiNum(r.revenue), aiNum(r.profit), aiNum(r.margin, 1), aiNum(r.markup, 2), aiNum(r.med_sold), aiNum(r.med_cost), aiNum(r.med_days), aiNum(r.loss, 1), aiNum(r.share, 1), ...(prevG ? [r.prev, aiNum(r.change, 0)] : [])];
  return { title: `query_sales · sales ${a}..${b}${prevG ? ` vs ${pa}..${pb}` : ''} · filters: ${descF(i.filters)} · ${cur.length} sales, ${rows.length} groups${rows.length > n ? `, top ${n} by ${sk}` : ''}`,
    columns: cols, rows: rows.slice(0, n).map(row), total: dims.length ? row({ k: 'TOTAL', ...tot, share: 100, prev: prevG ? [...prevG.values()].reduce((t, l) => t + l.length, 0) : null, change: null }) : null };
}
function toolStock(i) {
  if (!SV.stock?.rows?.length) return { title: 'stock_status', columns: ['note'], rows: [['No stock sheet loaded in the search page.']] };
  const keepS = aiFilter(i.filters, 'stock'), keepV = aiFilter({ ...(i.filters || {}), min_age_days: null, max_age_days: null }, 'sales'), dims = okDims(i.group_by), win = lim(i.window_days, 180, 3650);
  const start = addDaysISO(SV.maxDay, -(win - 1)), months = win / 30.44, stock = SV.stock.rows.filter(keepS), salesAll = SV.sales.filter(keepV);
  const G = groupBy(stock, dims), W = groupBy(salesAll.filter(s => s.d >= start), dims), H = groupBy(salesAll, dims);
  let rows = [...new Set([...G.keys(), ...W.keys()])].map(k => {
    const st = G.get(k) || [], sold = (W.get(k) || []).length, pm = sold / months, mos = pm ? st.length / pm : null, ch = chanStats(H.get(k) || []), A = aiAgg(W.get(k) || []);
    const sig = sold >= 10 && mos != null && mos < 3 && (A.margin ?? 0) > 0 ? 'buy_more' : st.length >= 10 && (!pm || mos > 12) ? 'overstock' : st.length >= 10 && mos > 6 ? 'slow' : '';
    return { k, stock: st.length, value: st.reduce((t, x) => t + (cv(x, 'costU') || 0), 0), age: median(st.map(x => x.age).filter(v => v != null)), sold, pm, mos, st: sold + st.length ? sold / (sold + st.length) * 100 : null, sig,
      best: ch.best ? `${ch.best.name} x${ch.best.mk.toFixed(2)}` : '', fast: ch.fast ? `${ch.fast.name} ${Math.round(ch.fast.days)}d` : '' };
  });
  if (+i.min_stock > 0) rows = rows.filter(r => r.stock >= +i.min_stock);
  const key = { stock: 'stock', value: 'value', age: 'age', months_of_stock: 'mos', sales_per_month: 'pm', sell_through: 'st' }[i.sort_by] || 'stock', dir = i.order === 'asc' ? 1 : -1;
  const nil = dir > 0 ? Infinity : -Infinity; rows.sort((x, y) => ((x[key] ?? nil) - (y[key] ?? nil)) * dir || 0);
  const n = lim(i.limit, 25, 100);
  return { title: `stock_status · stock ${SV.stock.rows.length} pieces (sheet of ${SV.stock.at ? new Date(SV.stock.at * 1000).toISOString().slice(0, 10) : '?'}) · sales window ${start}..${SV.maxDay} · filters: ${descF(i.filters)} · ${stock.length} pieces, ${rows.length} groups${rows.length > n ? `, top ${n}` : ''}`,
    columns: [dims.join(' / ') || 'all', 'stock', cc('value_at_cost'), 'median_age_days', 'sold_in_window', 'sales_per_month', 'months_of_stock', 'sell_through_%', 'signal', 'best_channel_markup', 'fastest_channel'],
    rows: rows.slice(0, n).map(r => [r.k, r.stock, aiNum(r.value), aiNum(r.age), r.sold, aiNum(r.pm, 1), r.mos == null ? (r.stock ? 'no sales' : null) : aiNum(r.mos, 1), aiNum(r.st, 0), r.sig, r.best, r.fast]) };
}
function toolList(i) {
  const src = i.source === 'stock' ? 'stock' : 'sales', keep = aiFilter(i.filters, src), n = lim(i.limit, 20, 40), dir = i.order === 'asc' ? 1 : -1;
  if (src === 'stock') {
    const l = (SV.stock?.rows || []).filter(keep), V = { age: x => x.age ?? -1, cost: x => x.costU ?? -1, date: x => x.added || '' }[i.sort_by] || (x => x.age ?? -1);
    l.sort((x, y) => { const a = V(x), b = V(y); return (typeof a === 'string' ? a.localeCompare(b) : a - b) * dir; });
    return { title: `list_items · stock · filters: ${descF(i.filters)} · ${l.length} pieces${l.length > n ? `, showing ${n}` : ''}`, columns: ['code', 'brand', 'title', 'product', 'color', 'size', 'grade', 'listed_channel', 'buyer', cc('cost'), 'age_days', 'added'],
      rows: l.slice(0, n).map(x => [x.code, x.brand, (x.name || '').slice(0, 80), x.prod, x.color, x.size, x.grade, x.channel, x.buyer, aiNum(cv(x, 'costU')), x.age, x.added]) };
  }
  const [a, b] = aiPeriod(i.period), l = SV.sales.filter(s => s.d >= a && s.d <= b && keep(s));
  const V = { date: s => s.sold_date, profit: s => s.profU ?? -1e12, markup: s => s.profU != null && s.costU > 0 ? s.revU / s.costU : -1, sold: s => s.revU ?? -1, cost: s => s.costU ?? -1, days: s => s.days ?? -1 }[i.sort_by] || (s => s.sold_date);
  l.sort((x, y) => { const p = V(x), q = V(y); return (typeof p === 'string' ? p.localeCompare(q) : p - q) * dir; });
  return { title: `list_items · sales ${a}..${b} · filters: ${descF(i.filters)} · ${l.length} sales${l.length > n ? `, showing ${n}` : ''}`, columns: ['code', 'date', 'channel', 'brand', 'title', 'product', 'color', 'size', 'grade', 'buyer', cc('cost'), cc('sold'), 'markup', 'days'],
    rows: l.slice(0, n).map(s => [s.code, s.d, s.channel, s.brand, (s.descr || '').slice(0, 80), s.prod, s.color, s.size, s.grade, s.buyer, aiNum(cv(s, 'costU')), aiNum(cv(s, 'revU')), s.profU != null && s.costU > 0 ? aiNum(s.revU / s.costU, 2) : null, s.days]) };
}
const AI_STOP = new Set('the a an and with of in on for by to from w x size used new bag bags leather canvas handbag women men mens womens box dust cover included approx us inch'.split(' '));
function toolTerms(i) {
  const [a, b] = aiPeriod(i.period), keepV = aiFilter(i.filters, 'sales'), keepS = aiFilter(i.filters, 'stock'), n = lim(i.limit, 40, 100);
  const count = (titles, brands) => { const c = new Map(); titles.forEach((t, j) => { const bw = new Set(nrm(brands[j]).split(/\s+/)), w = (nrm(t).match(/[a-z][a-z0-9'+-]+/g) || []).filter(x => x.length > 1 && !AI_STOP.has(x) && !bw.has(x));
    new Set([...w, ...w.slice(1).map((x, k) => w[k] + ' ' + x)]).forEach(x => c.set(x, (c.get(x) || 0) + 1)); }); return c; };
  const sales = SV.sales.filter(s => s.d >= a && s.d <= b && keepV(s)), stock = (SV.stock?.rows || []).filter(keepS);
  const C = count(sales.map(s => s.descr), sales.map(s => s.brand)), K = count(stock.map(x => x.name), stock.map(x => x.brand));
  const rows = [...C].filter(([, v]) => v >= 2).sort((x, y) => y[1] - x[1]).slice(0, n).map(([t, v]) => [t, v, K.get(t) || 0, aiNum(v / (v + (K.get(t) || 0)) * 100, 0)]);
  return { title: `top_terms · sales ${a}..${b} · filters: ${descF(i.filters)} · ${sales.length} sold titles, ${stock.length} stock titles`, columns: ['term', 'sold', 'in_stock', 'sold_share_%'], rows };
}
function toolBuyers(i) {
  if (!SV.stock) return { title: 'buyer_report', columns: ['note'], rows: [['Stock not loaded']] };
  const since = /^\d{4}-\d{2}-\d{2}/.test(i.since || '') ? i.since.slice(0, 10) : SV.minDay, C = buyerCohort(since), n = lim(i.limit, 15, 60);
  const note = since < SV.minDay ? `Sales data starts ${SV.minDay}: pieces bought earlier and sold before that date are missing, so % sold is understated.` : '';
  const b = nrm(i.buyer), g = b ? C.rows.find(r => nrm(r.k) === b) || C.rows.find(r => nrm(r.k).includes(b)) : null;
  if (!g) return { title: `buyer_report · bought since ${since}${b ? ` · buyer "${i.buyer}" not found, showing all` : ''}`, note,
    columns: ['buyer', 'bought', 'sold', 'sold_%', 'normal_%', 'diff_pp', 'med_days_to_sell', 'margin_%', 'loss_%', 'stock_now', 'stock_over_6_months', 'stalled', cc('stalled_value')],
    rows: C.rows.slice(0, 60).map(r => [r.k, r.n, r.nSold, aiNum(p100(r.st), 0), aiNum(p100(r.exp), 0), r.st != null && r.exp != null ? aiNum((r.st - r.exp) * 100, 0) : null, aiNum(r.days), aiNum(p100(r.margin), 1), aiNum(p100(r.lossPct), 0), r.now.length, r.old, r.stalled.length, aiNum(r.stalled.reduce((t, s) => t + (cv(s.x, 'costU') || 0), 0))]) };
  const P = buyerProducts(C, g), good = P.filter(p => p.sold >= 2).sort((x, y) => y.sold - x.sold).slice(0, n), bad = P.filter(p => p.n - p.sold >= 2).sort((x, y) => (x.st - (x.expM ?? x.st)) - (y.st - (y.expM ?? y.st))).slice(0, n);
  return { title: `buyer_report · ${g.k} · bought since ${since}: ${g.n} pieces, ${g.nSold} sold (${aiCell(aiNum(p100(g.st), 0))}% vs normal ${aiCell(aiNum(p100(g.exp), 0))}%), median ${aiCell(aiNum(g.days))} days to sell, margin ${aiCell(aiNum(p100(g.margin), 1))}%, ${g.now.length} in stock now (${g.old} over 6 months), ${g.stalled.length} stalled`, note,
    columns: ['list', 'product', 'bought', 'sold', 'sold_%', 'normal_%', 'med_days', 'markup'],
    rows: [...good.map(p => ['selling', p.k, p.n, p.sold, aiNum(p100(p.st), 0), aiNum(p100(p.expM), 0), aiNum(p.daysM), aiNum(p.mkM, 2)]), ...bad.map(p => ['not selling', p.k, p.n, p.sold, aiNum(p100(p.st), 0), aiNum(p100(p.expM), 0), aiNum(p.daysM), aiNum(p.mkM, 2)])] };
}
function toolCosts(i) {
  const since = /^\d{4}-\d{2}-\d{2}/.test(i.since || '') ? i.since.slice(0, 10) : addDaysISO(SV.maxDay, -364), n = lim(i.limit, 25, 80), q = nrm(i.search || '');
  const keepCur = SV.cur; let R; SV.cur = AIC; try { R = costGroups({ since, size: true, line: true, prod: !!i.include_unrecognised, min: Math.max(2, +i.min_pieces || 4), cat: c => CAT_EN[c] || c, grade: g => 'grade ' + g }); } finally { SV.cur = keepCur; }
  const G = q ? R.groups.filter(g => nrm(g.k).includes(q.trim())) : R.groups, b = nrm(i.buyer || ''), who = b ? (R.buyers.find(x => nrm(x.b) === b) || R.buyers.find(x => nrm(x.b).includes(b))) : null;
  const note = `Costs in ${AIC} at the rate of each purchase day (initial PAT, tax included). ${R.odd} pieces left out as outliers.${SV.stock?.rows?.some(x => x.price_init > 0) ? '' : ' Stock pieces use their current cost (initial cost not loaded yet).'}`;
  const others = g => g.buyers.map(x => `${x.b} ${x.n}×${aiNum(x.cost)} (${premTxt(x.prem)})`).join('; ');
  if (who) { const mine = G.map(g => ({ g, me: g.buyers.find(x => x.b === who.b) })).filter(x => x.me).sort((x, y) => y.me.over - x.me.over).slice(0, n);
    return { title: `purchase_costs · buyer ${who.b} · bought since ${since}: ${who.n} comparable pieces in ${who.groups} groups, pays ${premTxt(who.prem)} vs group medians, ${aiNum(who.abovePct * 100, 0)}% of pieces above the median, overpaid ${aiNum(who.over)} ${AIC}, sells ${premTxt(who.salePrem)} vs median sale`, note,
      columns: ['group', 'pieces', cc('median_cost'), 'buyer_pieces', cc('buyer_median_cost'), 'buyer_vs_median', cc('buyer_overpaid'), 'cheapest_buyer', 'all_buyers (pieces×median cost, vs median)'],
      rows: mine.map(({ g, me }) => [g.k, g.n, aiNum(g.M), me.n, aiNum(me.cost), premTxt(me.prem), aiNum(me.over), `${g.buyers[0].b} ${aiNum(g.buyers[0].cost)}`, others(g)]) }; }
  return { title: `purchase_costs · bought since ${since}${b ? ` · buyer "${i.buyer}" not found` : ''}${q ? ` · search "${i.search}"` : ''}: ${G.reduce((t, g) => t + g.n, 0)} comparable pieces in ${G.length} groups, overpaid vs group medians ${aiNum(G.reduce((t, g) => t + g.save, 0))} ${AIC}`, note,
    columns: ['row', 'name', 'pieces', `${cc('median_cost')} / buyer_vs_median`, 'p10-p90 / %_above_median', `${cc('median_sale')} / sells_vs_median`, cc('overpaid'), 'buyers'],
    rows: [...(q ? [] : R.buyers.map(x => ['buyer', x.b, x.n, premTxt(x.prem), aiNum(x.abovePct * 100, 0) + '%', premTxt(x.salePrem), aiNum(x.over), x.groups + ' groups'])),
      ...G.slice(0, n).map(g => ['group', g.k, g.n, aiNum(g.M), `${aiNum(g.p10)}-${aiNum(g.p90)}`, aiNum(g.MS), aiNum(g.save), others(g)])] };
}
async function toolPhotos(i) {
  const codes = [...new Set((Array.isArray(i.codes) ? i.codes : []).map(c => String(c).trim().toUpperCase()).filter(c => /^[A-Z0-9_-]{1,40}$/.test(c)))].slice(0, 8);
  const tpl = store.get('tpl', 'https://s3.amazonaws.com/storage.j-ports/photographs/{id}/{size}/{n}.jpg');
  let counts = {};
  try { const r = await fetch('/photos?' + new URLSearchParams({ tpl, size: 'medium', maxn: 1, ids: codes.join(',') }), { headers: { 'X-Catalog-Finder': '1' } }); if (r.ok) counts = (await r.json()).counts || {}; } catch {}
  const info = c => { const s = SV.sales.find(x => x.code === c), k = (SV.stock?.rows || []).find(x => x.code === c), x = s || k;
    return x ? `${c} · ${x.brand} · ${(s ? s.descr : k.name) || ''}${x.grade ? ' · grade ' + x.grade : ''}${s ? ` · sold ${s.d} on ${s.channel} for ${aiNum(cv(s, 'revU'))} ${AIC} (cost ${aiNum(cv(s, 'costU'))} ${AIC})` : ` · in stock ${k.age} days`}` : `${c} · not found in the data`; };
  const items = codes.map(c => ({ c, text: info(c), url: counts[c] > 0 ? photo(c) : null }));
  return { title: `view_photos · ${items.filter(x => x.url).length} of ${codes.length} with photo`, columns: ['code', 'piece', 'photo'], rows: items.map(x => [x.c, x.text, x.url ? 'yes' : 'no photo']), images: items };
}
const AI_RUN = { query_sales: toolQuerySales, stock_status: toolStock, list_items: toolList, top_terms: toolTerms, buyer_report: toolBuyers, purchase_costs: toolCosts, view_photos: toolPhotos };
const aiCell = v => v == null || v === '' ? '—' : typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(v)) : String(v).replace(/\|/g, '/');
const aiTableText = t => [t.title, t.note, t.columns.join(' | '), ...t.rows.map(r => r.map(aiCell).join(' | ')), t.total ? t.total.map(aiCell).join(' | ') : ''].filter(Boolean).join('\n');
async function aiRunTool(u) { // ejecuta lo que pide la IA y devuelve el tool_result (texto; imágenes en view_photos)
  const fn = AI_RUN[u.name];
  if (!fn) return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Unknown tool ${u.name}. Available: ${Object.keys(AI_RUN).join(', ')}` };
  const want = String(u.input?.currency || AI.cur || 'USD').toUpperCase().slice(0, 3); AIC = aiCurOk(want) ? want : 'USD';
  let t; try { t = await noUIFilters(() => fn(u.input || {})); if (t?.title) t.title += ` · amounts in ${AIC}${want !== AIC ? ` (${want} not available)` : ''}`; } catch (e) { return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Error: ${e.message}` }; }
  AI.tables.push({ name: u.name, input: u.input, ...t }); AI.conv.push({ kind: 'step', name: u.name, input: u.input, t });
  const content = t.images ? [{ type: 'text', text: aiTableText(t) }, ...t.images.flatMap(x => x.url ? [{ type: 'text', text: x.text }, { type: 'image', source: { type: 'url', url: x.url } }] : [])] : aiTableText(t);
  return { type: 'tool_result', tool_use_id: u.id, content };
}

/* ---------- contexto y bucle ---------- */
function aiContext() {
  const cnt = (list, fn, n) => { const m = new Map(); list.forEach(x => { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', '); };
  const bags = SV.sales.filter(s => s.cat === 'Bolsos'), lastM = SV.maxDay.slice(0, 7), st = SV.stock?.rows || [];
  const L = { es: 'Spanish', en: 'English', fr: 'French' }[lang] || 'Spanish';
  return [`Context (data loaded in the app on ${new Date().toISOString().slice(0, 10)}):`,
    `- Sales: ${SV.sales.length} sold pieces from ${SV.minDay} to ${SV.maxDay}.${SV.maxDay < endOfMonth(lastM) ? ` ${lastM} is incomplete (data until ${SV.maxDay}).` : ''}`,
    `- Channels (units): ${cnt(SV.sales, s => s.channel, 12)}.`, `- Top brands (units): ${cnt(SV.sales, s => s.brand, 15)}.`, `- Buyers (units sold): ${cnt(SV.sales, s => s.buyer, 15)}.`,
    `- Model recognised in ${Math.round(bags.filter(s => s.model).length / (bags.length || 1) * 100)}% of sold bags.`,
    st.length ? `- Stock: ${st.length} pieces in the last sheet loaded; ${Math.round(st.filter(x => x.age >= 365).length / st.length * 100)}% older than 1 year.` : '- Stock: no stock sheet loaded.',
    `- Conversation currency: ${AI.cur}. Every tool returns amounts in ${AI.cur} and amount filters (min_cost, max_cost, min_sold, max_sold) are in ${AI.cur}, already converted at each sale's exchange rate: use the user's ${AI.cur} figures directly, do not convert.${AI.cur !== 'USD' && rates?.[AI.cur] ? ` (For reference only: 1 USD = ${rates[AI.cur]} ${AI.cur} today.)` : ''} Pass currency in a tool call only if the user asks for another currency.`,
    `- Answer in ${L}.`].join('\n');
}
function aiCost(u, model) { const M = AI_MODELS.find(m => model && model.startsWith(m[0])) || AI_MODELS.find(m => m[0] === AI.model) || AI_MODELS[0]; u = u || {};
  return ((u.input_tokens || 0) * M[2] + (u.output_tokens || 0) * M[3] + (u.cache_read_input_tokens || 0) * M[4] + (u.cache_creation_input_tokens || 0) * M[5]) / 1e6; }
async function aiCall() {
  try { return await api('ai-agent', { model: AI.model, system: AI_SYSTEM, tools: AI_TOOLS, messages: AI.messages, effort: 'medium' }); }
  catch (e) { // si una foto no se pudo descargar, se repite el paso sin fotos (el mensaje fallido aún no forma parte de la conversación)
    const last = AI.messages[AI.messages.length - 1];
    if (!/image|url|download|fetch/i.test(e.message) || last?.role !== 'user' || !Array.isArray(last.content) || !JSON.stringify(last.content).includes('"image"')) throw e;
    last.content = last.content.map(b => b.type === 'tool_result' && Array.isArray(b.content) ? { ...b, content: b.content.map(c => c.type === 'image' ? { type: 'text', text: '(photo could not be loaded)' } : c) } : b);
    return api('ai-agent', { model: AI.model, system: AI_SYSTEM, tools: AI_TOOLS, messages: AI.messages, effort: 'medium' });
  }
}
function aiCleanContent(c) {
  const i = (c || []).map(b => b.type).lastIndexOf('fallback'); if (i < 0) return c || [];
  return [...c.slice(0, i).filter(b => b.type === 'text'), ...c.slice(i + 1)];
}
async function aiAsk(q) {
  q = String(q || '').trim(); if (!q || AI.busy) return;
  if (!SV.sales.length) return say(tl('Primero importa el snapshot de vendidos.'));
  AI.busy = true; AI.conv.push({ kind: 'q', text: q });
  if (!SV.stock) { try { await loadStock(); } catch {} }
  const first = !AI.messages.length, qCost = AI.cost; if (first) AI.cur = aiCurOk(SV.cur) ? SV.cur : 'USD';
  AI.messages.push({ role: 'user', content: [{ type: 'text', text: (first ? aiContext() + '\n\n' : '') + 'Question: ' + q }] });
  renderAIConv();
  let answer = '';
  try {
    for (AI.step = 1; AI.step <= 14; AI.step++) {
      renderAIConv();
      const r = await aiCall(), content = aiCleanContent(r.content); AI.cost += aiCost(r.usage, r.model);
      if (r.stop_reason === 'refusal') { AI.messages = []; AI.conv.push({ kind: 'err', text: tl('La IA no ha querido responder a esto ({c}). Prueba a preguntarlo de otra forma.', { c: r.stop_details?.category || '?' }) }); break; }
      const uses = content.filter(b => b.type === 'tool_use'), said = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!uses.length && !said) { AI.messages = []; AI.conv.push({ kind: 'err', text: tl('La IA no ha devuelto respuesta. Prueba otra vez.') }); break; }
      AI.messages.push({ role: 'assistant', content });
      if (uses.length && r.stop_reason === 'tool_use') {
        if (said) AI.conv.push({ kind: 'note', text: said });
        const results = []; for (const u of uses) { results.push(await aiRunTool(u)); renderAIConv(); }
        if (AI.step >= 12) results.push({ type: 'text', text: 'Step limit reached: answer now with the data you already have, without calling more tools.' });
        AI.messages.push({ role: 'user', content: results }); continue;
      }
      answer = said || tl('(sin respuesta)');
      AI.conv.push({ kind: 'a', text: answer, cut: r.stop_reason === 'max_tokens' }); break;
    }
  } catch (e) { AI.conv.push({ kind: 'err', text: e.message }); }
  AI.busy = false;
  if (answer) { const h = JSON.parse(store.get('aiHistory', '[]') || '[]'); h.unshift({ at: Date.now(), model: AI.model, q, a: answer, cost: AI.cost - qCost }); store.set('aiHistory', JSON.stringify(h.slice(0, 20))); }
  renderAIConv(); renderAIHist();
}

/* ---------- pantalla ---------- */
function mdHTML(md) { // markdown sencillo (títulos, listas, negritas, tablas) sobre texto ya escapado
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let list = null, table = null;
  const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const flush = () => {
    if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; }
    if (table) { const R = table.map(cells).filter(r => !r.every(c => /^:?-{2,}:?$/.test(c))); out.push(`<div style="overflow:auto"><table>${R.map((r, i) => `<tr>${r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table></div>`); table = null; }
  };
  for (const l of esc(md).split('\n')) {
    let m;
    if (/^\s*\|.*\|\s*$/.test(l)) { if (list) flush(); (table = table || []).push(l); continue; }
    if (table) flush();
    if ((m = l.match(/^\s*#{1,6}\s+(.*)/))) { flush(); out.push(`<h4>${inline(m[1])}</h4>`); }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list?.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list?.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); }
    else if (!l.trim()) flush();
    else { flush(); out.push(`<p>${inline(l)}</p>`); }
  }
  flush(); return out.join('');
}
const AI_STEP_NAMES = { query_sales: '🔎 Ventas', stock_status: '📦 Stock', list_items: '📄 Piezas', top_terms: '🔤 Palabras de los títulos', buyer_report: '🛒 Buyers', purchase_costs: '💴 Precios de compra', view_photos: '📷 Fotos' };
const AI_DIM_UI = { brand: 'Marca', product: 'Producto', model: 'Modelo', model_size: 'Modelo + talla', line: 'Línea / lona', color: 'Color', material: 'Material', size: 'Talla', category: 'Categoría', type: 'Tipo', channel: 'Canal',
  entity: 'Entidad', buyer: 'Buyer', owner: 'Owner', grade: 'Grado', month: 'Mes', week: 'Semana', cost_band: 'Coste', price_band: 'Precio', days_band: 'Días hasta vender', age_band: 'Antigüedad stock' };
function stepLabel(s) {
  const i = s.input || {}, bits = [tl(AI_STEP_NAMES[s.name] || s.name)];
  if (i.group_by?.length) bits.push(tl('por {d}', { d: [].concat(i.group_by).map(d => tl(AI_DIM_UI[d] || d).toLowerCase()).join(' + ') }));
  if (i.period) { const [a, b] = aiPeriod(i.period); bits.push(`${fmtDay(a)} – ${fmtDay(b)}`); }
  if (i.filters && descF(i.filters) !== 'none') bits.push(descF(i.filters));
  if (i.source) bits.push(i.source); if (i.buyer) bits.push(i.buyer); if (i.search) bits.push(`«${i.search}»`);
  return bits.join(' · ') + ` (${s.t.rows.length})`;
}
function stepTable(t) {
  return `<div style="overflow:auto;max-height:340px"><table class="list"><tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${t.rows.map(r => `<tr>${r.map(v => `<td>${esc(aiCell(v))}</td>`).join('')}</tr>`).join('')}${t.total ? `<tr>${t.total.map(v => `<td><b>${esc(aiCell(v))}</b></td>`).join('')}</tr>` : ''}</table></div>`;
}
function renderAIConv() {
  const box = $('aiConv'); if (!box) return;
  box.style.display = AI.conv.length ? '' : 'none';
  box.innerHTML = AI.conv.map(c => c.kind === 'q' ? `<div class="ai-user">${esc(c.text)}</div>`
    : c.kind === 'step' ? `<details class="ai-step"><summary>${esc(stepLabel(c))}</summary>${c.t.images ? `<div class="ai-photos">${c.t.images.filter(x => x.url).map(x => `<img src="${esc(x.url)}" title="${esc(x.text)}" alt="${esc(x.c)}">`).join('')}</div>` : ''}${stepTable(c.t)}</details>`
    : c.kind === 'note' ? `<div class="ai-step">💬 ${esc(c.text)}</div>`
    : c.kind === 'err' ? `<div class="panel err">${esc(c.text)}</div>`
    : `<div class="ai-ans">${mdHTML(c.text)}${c.cut ? `<p class="hint">${esc(tl('(respuesta cortada: pide «sigue» para continuar)'))}</p>` : ''}</div>`).join('')
    + (AI.busy ? `<div class="ai-step">⏳ ${esc(tl('Analizando… (paso {n})', { n: AI.step }))}</div>` : '');
  const cost = $('aiCost'); if (cost) cost.textContent = AI.cost ? tl('coste de esta conversación: ≈ ${v}', { v: AI.cost < 0.01 ? AI.cost.toFixed(4) : AI.cost.toFixed(3) }) : '';
  if ($('aiGo')) $('aiGo').disabled = AI.busy; if ($('aiX')) $('aiX').style.display = AI.tables.length ? '' : 'none';
  if ($('aiGo')) $('aiGo').textContent = AI.messages.length ? tl('Seguir preguntando') : tl('Analizar');
}
function renderAIHist() {
  const el = $('aiHist'); if (!el) return;
  const h = JSON.parse(store.get('aiHistory', '[]') || '[]');
  el.innerHTML = h.length ? `<b>${esc(tl('Preguntas anteriores'))}</b><ul class="facts">${h.map((x, i) => `<li><a data-h="${i}">${esc(x.q.slice(0, 140))}</a> <span class="mute">· ${esc(new Date(x.at).toLocaleDateString())} · ≈ $${(x.cost || 0).toFixed(3)}</span></li>`).join('')}</ul>` : '';
  el.querySelectorAll('[data-h]').forEach(a => a.onclick = () => { const x = h[+a.dataset.h]; if (AI.busy) return; AI.messages = []; AI.tables = []; AI.cost = 0; AI.conv = [{ kind: 'q', text: x.q }, { kind: 'a', text: x.a }]; renderAIConv(); });
}
const AI_PRESETS = ['¿Qué es lo que mejor se está vendiendo en los últimos 3 meses? Dame modelos concretos (con color y talla si se puede), en qué canal se venden y dónde sería mejor venderlos.',
  '¿Qué tengo en stock que no se vende? Agrúpalo por modelo y dime qué haría con cada grupo y en qué canal lo movería.',
  'Compara los canales: ¿dónde vendo mejor cada categoría, por margen y por rapidez?',
  'Para cada buyer: ¿qué compra que se vende bien y qué compra que no se vende?',
  '¿Qué debería comprar más el mes que viene y qué debería dejar de comprar? Con costes orientativos.',
  'Prepara una guía de compra para un buyer nuevo: piezas baratas que se vendan rápido, con un máximo de 10.000 ¥ por pieza (pon la moneda en JPY). Qué comprar, precio máximo por modelo, grados, qué evitar y una chuleta para el móvil.',
  '¿Dónde podemos bajar costes de compra? Compara a los buyers con el mismo modelo, talla y grado: quién paga más por lo mismo y cuánto nos costaría de más.',
  'Mira las fotos de los 8 bolsos Chanel que más rápido se han vendido y dime qué tienen en común (color, piel, herrajes, estado).'];
async function viewAI() {
  const el = $('sv-ai');
  if (AI.configured == null) { try { AI.configured = !!(await (await fetch('/ai-status')).json()).configured; } catch { AI.configured = false; } }
  el.innerHTML = `<div class="panel"><h2 style="margin-top:0">✨ ${esc(tl('Pregúntale a la IA'))}</h2>
    <p class="hint" style="margin-top:-4px">${esc(tl('Escribe lo que quieres saber como se lo dirías a una persona. La IA no recibe tu archivo: pide tablas que se calculan en tu ordenador (ventas, stock, buyers, títulos y, si hace falta, algunas fotos) y responde con esas cifras. Puedes ver cada tabla que ha usado.'))}</p>
    ${AI.configured ? '' : `<p class="panel err" style="margin:8px 0">${esc(tl('La IA no está activada. Ve al buscador y pulsa «Activar IA…» para poner tu clave de Anthropic; después vuelve aquí.'))} <a href="index.html">${esc(tl('Ir al buscador'))}</a></p>`}
    <div class="chips" style="margin:8px 0">${AI_PRESETS.map((p, i) => `<button class="chip" data-p="${i}" title="${esc(tl(p))}">${esc(tl(p).slice(0, 58))}…</button>`).join('')}</div>
    <textarea id="aiQ" class="ai-q" placeholder="${esc(tl('p. ej. ¿Qué modelos de Gucci se venden mejor en los últimos 3 meses, en qué color y en qué canal?'))}"></textarea>
    <div class="row" style="margin-top:8px"><button class="primary" id="aiGo"></button><button id="aiNew">${esc(tl('Nueva conversación'))}</button>
      <span class="mute">${esc(tl('Importes en {c}', { c: AI.messages.length ? AI.cur : SV.cur }))}</span>
      <label>${esc(tl('Modelo'))} <select id="aiModel">${AI_MODELS.map(m => `<option value="${m[0]}">${esc(tl(m[1]))}</option>`).join('')}</select></label>
      <span id="aiCost" class="mute"></span><button id="aiX" style="margin-left:auto">⬇ ${esc(tl('Excel de los datos usados'))}</button></div>
    <p class="hint" style="margin:6px 0 0">${esc(tl('Cada pregunta cuesta normalmente unos céntimos con Opus 5.5 (la mitad con Sonnet 5.5, casi nada con Haiku 5.5). Las respuestas se basan en tus datos; revisa las tablas si algo te sorprende.'))} ${esc(tl('La IA trabaja en la moneda elegida arriba (con el cambio de cada día): si le das un presupuesto en esa moneda, lo usa tal cual. Si cambias de moneda, pulsa «Nueva conversación».'))}</p></div>
    <div class="panel" id="aiConv" style="display:none"></div><div class="panel ai-hist" id="aiHist"></div>`;
  $('aiModel').value = AI.model; $('aiModel').onchange = () => { AI.model = $('aiModel').value; store.set('aiModel', AI.model); if (AI.messages.length) { AI.messages = []; AI.conv.push({ kind: 'note', text: tl('Modelo cambiado: la siguiente pregunta empieza una conversación nueva.') }); renderAIConv(); } };
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { $('aiQ').value = tl(AI_PRESETS[+b.dataset.p]); $('aiQ').focus(); });
  $('aiGo').onclick = () => { const q = $('aiQ').value; $('aiQ').value = ''; aiAsk(q); };
  $('aiQ').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('aiGo').click(); };
  $('aiNew').onclick = () => { if (AI.busy) return; AI.messages = []; AI.conv = []; AI.tables = []; AI.cost = 0; renderAIConv(); };
  $('aiX').onclick = () => xlsxDownload(AI.tables.map((t, i) => [`${i + 1} ${t.name}`, [[t.title], t.columns, ...t.rows, ...(t.total ? [t.total] : [])]]), 'analisis_ia');
  renderAIConv(); renderAIHist();
}
