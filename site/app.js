// Auction Ledger website. Reads the JSON written by collector/build-site.mjs.
// State lives in the URL hash: #<region>/<house key>/<item id>.
import { MIN_DAYS, seriesStats } from './window-stats.mjs';

const PAGE = 100;
const QUALITIES = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM'];
const REGION_NAMES = { eu: 'Europe', us: 'Americas', kr: 'Korea', tw: 'Taiwan' };
const MEDIAN = 0;
const LOW = 1;
const QTY = 2;
const MIN = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const state = {
  config: null,
  region: null,
  meta: null,
  items: new Map(),
  visible: [],
  stale: false,
  house: null,
  rows: [],
  filtered: [],
  shown: PAGE,
  sort: { key: 'qty', dir: -1 },
  item: null,
};
let routeToken = 0;
let chartObserver = null;

// ---------- data ----------

const cache = new Map();
function getJson(path) {
  if (!cache.has(path)) {
    const request = fetch(path).then((res) => {
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json();
    });
    request.catch(() => cache.delete(path));
    cache.set(path, request);
  }
  return cache.get(path);
}

// Days older than retentionDays by the viewer's clock are hidden, as in the
// addon, so a site that stopped updating does not show expired data.
function visibleDays(days, retentionDays) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const oldest = cutoff.toISOString().slice(0, 10);
  return days.map((d) => d >= oldest);
}

async function loadRegion(region) {
  const base = `data/${region}`;
  const [meta, items] = await Promise.all([getJson(`${base}/meta.json`), getJson(`${base}/items.json`)]);
  const map = new Map();
  for (const [id, name, local, quality, classId, subclass, icon] of items) {
    map.set(id, { id, name, local, quality, classId, subclass, icon });
  }
  return { meta, items: map };
}

async function loadHouse(region, house) {
  return getJson(`data/${region}/houses/${encodeURIComponent(house)}.json`);
}

function itemSeries(region, itemId) {
  return getJson(`data/${region}/series/${itemId % state.config.buckets}.json`).then((bucket) => bucket[itemId] ?? {});
}

// ---------- routing ----------

function parseHash() {
  const [region, house, item] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
  return { region, house, item: Number(item) || null };
}

function hashFor(region, house, item) {
  return `#${[region, house, item].filter((p) => p != null).map(encodeURIComponent).join('/')}`;
}

function go({ region = state.region, house = state.house, item = state.item }) {
  const hash = hashFor(region, house, item);
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const token = ++routeToken;
  const want = parseHash();
  const prefs = loadPrefs();
  const { regions } = state.config;
  const region = [want.region, prefs.region].find((r) => regions.includes(r)) ?? regions[0];

  try {
    if (region !== state.region) {
      setStatus('Loading…');
      const loaded = await loadRegion(region);
      if (token !== routeToken) return;
      Object.assign(state, { region, meta: loaded.meta, items: loaded.items, house: null });
      state.visible = visibleDays(state.meta.days, state.config.retentionDays);
      state.stale = state.visible.some((v) => !v);
      fillHouses();
      fillFilters();
    }
    const keys = state.meta.houses.map((h) => h.key);
    const house = [want.house, prefs.house].find((k) => keys.includes(k)) ?? keys[0];
    if (house !== state.house) {
      const rows = await loadHouse(region, house);
      if (token !== routeToken) return;
      state.house = house;
      state.rows = rows.map(toRow);
      state.shown = PAGE;
      applyFilters();
    }
    $('region').value = region;
    $('house').value = house;
    savePrefs({ region, house });
    const hash = hashFor(region, house, want.item);
    if (location.hash !== hash) history.replaceState(null, '', hash);

    state.item = want.item;
    markCurrentRow();
    showLayout();
    await renderDetail(token);
  } catch (err) {
    if (token === routeToken) setStatus(`Could not load the price data (${err.message}).`);
  }
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('auction-ledger') ?? '{}');
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem('auction-ledger', JSON.stringify(prefs));
  } catch {
    // Storage blocked: the hash still carries the state.
  }
}

// ---------- controls ----------

function fillHouses() {
  const select = $('house');
  select.replaceChildren();
  const groups = state.meta.houses.filter((h) => h.id == null);
  const houses = state.meta.houses.filter((h) => h.id != null);
  const add = (parent, house, label) => {
    const option = new Option(label, house.key);
    option.title = `${house.items} items`;
    parent.append(option);
  };
  if (groups.length > 0) {
    const og = document.createElement('optgroup');
    og.label = 'All houses of a faction';
    for (const g of groups) add(og, g, `${faction(g.name)} (all)`);
    select.append(og);
  }
  const og = document.createElement('optgroup');
  og.label = 'Single house';
  for (const h of houses) add(og, h, `${faction(h.name)} #${h.id}`);
  select.append(og);
  select.disabled = false;
}

function faction(name) {
  return name.replace(/ Auction House$/, '');
}

function fillFilters() {
  const present = new Set();
  const classes = new Set();
  for (const item of state.items.values()) {
    if (item.quality) present.add(item.quality);
    if (item.classId != null) classes.add(item.classId);
  }
  const quality = $('quality');
  const keepQuality = quality.value;
  quality.replaceChildren(new Option('All qualities', ''));
  for (const q of QUALITIES) if (present.has(q)) quality.append(new Option(titleCase(q), q));
  quality.value = present.has(keepQuality) ? keepQuality : '';

  const cls = $('class');
  const keepClass = cls.value;
  cls.replaceChildren(new Option('All types', ''));
  const names = state.meta.classes;
  for (const id of [...classes].sort((a, b) => (names[a] ?? '').localeCompare(names[b] ?? ''))) {
    cls.append(new Option(names[id] ?? `Class ${id}`, String(id)));
  }
  cls.value = classes.has(Number(keepClass)) ? keepClass : '';
}

function wireControls() {
  $('region').addEventListener('change', (e) => go({ region: e.target.value, item: null }));
  $('house').addEventListener('change', (e) => go({ house: e.target.value }));
  let timer = null;
  $('search').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.shown = PAGE;
      applyFilters();
    }, 120);
  });
  for (const id of ['quality', 'class']) {
    $(id).addEventListener('change', () => {
      state.shown = PAGE;
      applyFilters();
    });
  }
  for (const th of document.querySelectorAll('th[data-sort]')) {
    th.querySelector('button').addEventListener('click', () => {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: key === 'name' ? 1 : -1 };
      applyFilters();
    });
  }
  $('more').addEventListener('click', () => {
    state.shown += PAGE;
    renderRows();
  });
  $('rows').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) go({ item: Number(tr.dataset.id) });
  });
}

// ---------- browse table ----------

function toRow([id, latest, low, qty, day, median, days]) {
  const fresh = day != null && state.visible[day];
  const item = state.items.get(id) ?? { id, name: null, local: null, quality: null, classId: null, icon: null };
  const row = {
    id,
    item,
    name: item.name ?? `Item ${id}`,
    latest: fresh ? latest : null,
    low: fresh ? low : null,
    qty: fresh ? qty : null,
    day: fresh ? day : null,
    // The window median and day count include every window day, so they are
    // left out once any day has expired.
    median: state.stale ? null : median,
    days: state.stale ? null : days,
  };
  row.change = row.latest != null && row.median ? row.latest / row.median - 1 : null;
  row.search = `${row.name} ${item.local ?? ''}`.toLowerCase();
  return row;
}

function applyFilters() {
  const terms = $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const quality = $('quality').value;
  const cls = $('class').value;
  const id = terms.length === 1 && /^\d+$/.test(terms[0]) ? Number(terms[0]) : null;
  state.filtered = state.rows.filter((r) => {
    if (quality && r.item.quality !== quality) return false;
    if (cls && String(r.item.classId) !== cls) return false;
    if (id != null) return r.id === id || r.search.includes(terms[0]);
    return terms.every((t) => r.search.includes(t));
  });
  const { key, dir } = state.sort;
  state.filtered.sort((a, b) => {
    if (key === 'name') return dir * a.name.localeCompare(b.name);
    const va = a[key];
    const vb = b[key];
    if (va == null || vb == null) return (va == null) - (vb == null);
    return dir * (va - vb) || a.name.localeCompare(b.name);
  });
  for (const th of document.querySelectorAll('th[data-sort]')) {
    if (th.dataset.sort === key) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  }
  renderRows();
}

function renderRows() {
  const tbody = $('rows');
  const last = state.visible.lastIndexOf(true);
  const rows = state.filtered.slice(0, state.shown).map((r) => {
    const tr = el('tr', { 'data-id': r.id });
    if (r.id === state.item) tr.setAttribute('aria-current', 'true');
    const nameCell = el('td', { class: 'name-cell' }, itemLink(r.item, hashFor(state.region, state.house, r.id)));
    const latest = el('td', { class: 'num' }, money(r.latest));
    if (r.day != null && r.day < last) latest.append(el('span', { class: 'ago' }, `${last - r.day + 1}d ago`));
    tr.append(
      nameCell,
      latest,
      el('td', { class: 'num opt-narrow' }, money(r.median)),
      el('td', { class: 'num' }, percent(r.change)),
      el('td', { class: 'num opt' }, money(r.low)),
      el('td', { class: 'num opt' }, count(r.qty)),
      el('td', { class: 'num opt' }, r.days == null ? dash() : String(r.days)),
    );
    return tr;
  });
  tbody.replaceChildren(...rows);
  const total = state.filtered.length;
  const of = total === state.rows.length ? '' : ` of ${state.rows.length.toLocaleString('en-US')}`;
  $('count').textContent = `${total.toLocaleString('en-US')}${of} items listed in the last 29 days`;
  const more = $('more');
  more.hidden = state.shown >= total;
  more.textContent = `Show ${Math.min(PAGE, total - state.shown)} more`;
}

function markCurrentRow() {
  for (const tr of $('rows').children) {
    if (Number(tr.dataset.id) === state.item) tr.setAttribute('aria-current', 'true');
    else tr.removeAttribute('aria-current');
  }
}

function itemLink(item, href) {
  const a = el('a', { class: 'item-link', href });
  a.append(icon(item, 24));
  const name = el('span', { class: `item-name q-${item.quality ?? 'COMMON'}` }, item.name ?? `Item ${item.id}`);
  if (item.local) name.append(el('span', { class: 'local' }, item.local));
  a.append(name);
  return a;
}

function icon(item, size) {
  const img = el('img', { width: size, height: size, alt: '', loading: 'lazy' });
  if (item.icon != null && state.config.iconBase) img.src = `${state.config.iconBase}${item.icon}.jpg`;
  return img;
}

// ---------- detail ----------

async function renderDetail(token) {
  const panel = $('detail');
  chartObserver?.disconnect();
  if (state.item == null) {
    panel.className = 'detail empty';
    panel.replaceChildren(el('p', {}, 'Select an item to see its daily prices, how the latest price compares with the last 29 days, and its prices in the other auction houses.'));
    return;
  }
  const region = state.region;
  const house = state.house;
  const id = state.item;
  const all = await itemSeries(region, id);
  if (token !== routeToken) return;

  const item = state.items.get(id) ?? { id, name: null, local: null, quality: null, icon: null };
  const houseInfo = state.meta.houses.find((h) => h.key === house);
  const series = (all[house] ?? [[], [], [], []]).map((s) => state.meta.days.map((_, i) => (state.visible[i] ? s[i] ?? null : null)));

  panel.className = 'detail';
  const head = el('div', { class: 'detail-head' });
  head.append(icon(item, 40));
  const title = el('div');
  const h2 = el('h2', { class: `q-${item.quality ?? 'COMMON'}` }, item.name ?? `Item ${id}`);
  if (item.local) h2.append(el('span', { class: 'local' }, item.local));
  const kind = [state.meta.classes[item.classId], item.subclass].filter(Boolean);
  if (kind[0] === kind[1]) kind.pop();
  title.append(h2, el('div', { class: 'meta' }, [...kind, `item ${id}`, houseLabel(houseInfo)].join(' · ')));
  const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', () => go({ item: null }));
  head.append(title, close);

  const parts = [head];
  const listed = series[MEDIAN].some((v) => v != null);
  if (!listed) {
    parts.push(el('p', {}, state.stale && all[house]
      ? 'All listings of this item in this house are older than 30 days and are hidden.'
      : 'Not listed in this auction house in the last 29 days.'));
  } else {
    parts.push(statTiles(series));
    const chart = el('div', { class: 'chart' });
    parts.push(legend(), chart);
    parts.push(el('p', { class: 'note' }, 'Daily median: the median of the day\'s two-hourly scan medians, weighted by quantity. Typical lowest listing: the median of the day\'s lowest buyouts.'));
    parts.push(dailyTable(series));
    requestAnimationFrame(() => {
      drawChart(chart, series);
      chartObserver = new ResizeObserver(() => drawChart(chart, series));
      chartObserver.observe(chart);
    });
  }
  parts.push(houseTable(all, id));
  panel.replaceChildren(...parts);
  if (window.matchMedia('(max-width: 1099px)').matches) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function houseLabel(house) {
  if (!house) return '';
  return house.id == null ? `${faction(house.name)}, all houses` : `${faction(house.name)} #${house.id}`;
}

function statTiles(series) {
  const median = series[MEDIAN];
  const last = lastIndex(median);
  const latest = median[last];
  const stats = seriesStats(median);
  const tiles = el('div', { class: 'tiles' });
  const tile = (label, value, hint) => {
    const t = el('div', { class: 'tile' }, el('div', { class: 'label' }, label));
    t.append(el('div', { class: 'value' }, value));
    if (hint) t.append(el('div', { class: 'hint' }, hint));
    tiles.append(t);
  };
  tile('Latest daily median', money(latest), formatDate(state.meta.days[last]));
  if (stats) {
    tile('29-day median', money(Math.round(stats.median)), el('span', {}, 'middle half ', money(Math.round(stats.p25)), ' to ', money(Math.round(stats.p75))));
    const v = verdict(latest, median, stats);
    tile('Verdict', v.label, v.hint);
    const pct = stats.median ? (stats.slope / stats.median) * 100 : 0;
    const direction = Math.abs(pct) < 0.25 ? 'Flat' : pct > 0 ? 'Rising' : 'Falling';
    tile('Trend', direction, `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% per day`);
  } else {
    tile('Verdict', 'Too few days', `needs listings on ${MIN_DAYS} days`);
  }
  tile('Typical lowest listing', money(series[LOW][last]), formatDate(state.meta.days[last]));
  tile('Quantity listed', count(series[QTY][last]), 'daily mean');
  return tiles;
}

// Robust z-score of the latest day against the window, as in docs/ideas.md.
// A MAD of 0 (stable prices) is floored at 1% of the median.
function verdict(latest, median, stats) {
  const spread = 1.4826 * Math.max(stats.mad, stats.median * 0.01, 1);
  const z = (latest - stats.median) / spread;
  const others = median.filter((v) => v != null);
  const above = others.filter((v) => v > latest).length;
  const share = Math.round((above / others.length) * 100);
  const change = stats.median ? latest / stats.median - 1 : 0;
  let label = 'Typical price';
  if (z <= -2) label = 'Unusually cheap';
  else if (z <= -1) label = 'Cheaper than usual';
  else if (z >= 2) label = 'Unusually expensive';
  else if (z >= 1) label = 'Pricier than usual';
  const rel = Math.abs(change) < 0.005 ? 'at the median' : `${Math.round(Math.abs(change) * 100)}% ${change < 0 ? 'below' : 'above'} median`;
  return { label, hint: `${rel}, cheaper than ${share}% of days` };
}

function legend() {
  const box = el('div', { class: 'legend' });
  const key = (cls, color, label) => {
    const span = el('span');
    span.append(el('span', { class: `key ${cls}`, style: `background:${color}` }), label);
    box.append(span);
  };
  key('', 'var(--series-1)', 'Daily median');
  key('', 'var(--series-2)', 'Typical lowest listing');
  key('bar', 'var(--qty)', 'Quantity listed');
  return box;
}

function dailyTable(series) {
  const details = el('details');
  details.append(el('summary', {}, 'Daily values'));
  const table = el('table', { class: 'small' });
  table.append(el('thead', {}, el('tr', {},
    el('th', {}, 'Day'), el('th', { class: 'num' }, 'Median'), el('th', { class: 'num' }, 'Typical lowest'),
    el('th', { class: 'num' }, 'Lowest'), el('th', { class: 'num' }, 'Quantity'))));
  const tbody = el('tbody');
  for (let i = state.meta.days.length - 1; i >= 0; i--) {
    if (!state.visible[i]) continue;
    tbody.append(el('tr', {},
      el('td', {}, formatDate(state.meta.days[i])),
      el('td', { class: 'num' }, money(series[MEDIAN][i])),
      el('td', { class: 'num' }, money(series[LOW][i])),
      el('td', { class: 'num' }, money(series[MIN][i])),
      el('td', { class: 'num' }, count(series[QTY][i]))));
  }
  table.append(tbody);
  details.append(el('div', { class: 'table-wrap' }, table));
  return details;
}

function houseTable(all, id) {
  const wrap = el('div');
  wrap.append(el('h3', {}, 'All auction houses'));
  const table = el('table', { class: 'small' });
  table.append(el('thead', {}, el('tr', {},
    el('th', {}, 'House'), el('th', { class: 'num' }, 'Latest'), el('th', { class: 'num' }, 'Median'), el('th', { class: 'num' }, 'Days'))));
  const tbody = el('tbody');
  for (const house of state.meta.houses) {
    const s = all[house.key];
    if (!s) continue;
    const median = s[MEDIAN].map((v, i) => (state.visible[i] ? v : null));
    const values = median.filter((v) => v != null);
    if (values.length === 0) continue;
    const tr = el('tr', {}, el('td', {}, el('a', { href: hashFor(state.region, house.key, id) }, houseLabel(house))));
    if (house.key === state.house) tr.setAttribute('aria-current', 'true');
    tr.append(
      el('td', { class: 'num' }, money(median[lastIndex(median)])),
      el('td', { class: 'num' }, money(medianOf(values))),
      el('td', { class: 'num' }, String(values.length)));
    tbody.append(tr);
  }
  if (!tbody.children.length) return el('p', { class: 'note' }, 'Not listed in any auction house in the last 29 days.');
  table.append(tbody);
  wrap.append(el('div', { class: 'table-wrap' }, table));
  return wrap;
}

// ---------- chart ----------

// Price lines on top, quantity columns below, sharing one x scale and one
// crosshair. Days without listings break the lines.
function drawChart(container, series) {
  const width = container.clientWidth;
  if (width === 0) return;
  const days = state.meta.days;
  const n = days.length;
  const m = { left: 58, right: 10, top: 8 };
  const priceH = 200;
  const gap = 34;
  const qtyH = 64;
  const axisH = 22;
  const height = m.top + priceH + gap + qtyH + axisH;
  const plotW = width - m.left - m.right;
  const band = plotW / n;
  const x = (i) => m.left + band * (i + 0.5);

  const prices = [...series[MEDIAN], ...series[LOW]].filter((v) => v != null);
  const ticks = niceTicks(Math.min(...prices), Math.max(...prices), 4);
  const lo = ticks[0];
  const hi = ticks.at(-1);
  const y = (v) => m.top + priceH - ((v - lo) / (hi - lo)) * priceH;
  const qtyTop = m.top + priceH + gap;
  const qtyMax = Math.max(1, ...series[QTY].filter((v) => v != null));
  const qy = (v) => qtyTop + qtyH - (v / qtyMax) * qtyH;

  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, tabindex: 0, role: 'img',
    'aria-label': `Daily median and typical lowest listing over ${n} days, with quantity listed. Use the arrow keys to read each day.` });

  for (const t of ticks) {
    svg.append(svgEl('line', { x1: m.left, x2: width - m.right, y1: y(t), y2: y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
    svg.append(svgText(m.left - 6, y(t) + 4, moneyShort(t), 'end'));
  }
  svg.append(svgEl('line', { x1: m.left, x2: width - m.right, y1: qtyTop + qtyH, y2: qtyTop + qtyH, stroke: 'var(--axis)', 'stroke-width': 1 }));
  svg.append(svgText(m.left - 6, qtyTop + 8, compact(qtyMax), 'end'));
  svg.append(svgText(m.left - 6, qtyTop + qtyH, '0', 'end'));
  svg.append(svgText(m.left, qtyTop - 8, 'Quantity listed', 'start'));

  const barW = Math.max(1, Math.min(24, band - 2));
  series[QTY].forEach((v, i) => {
    if (v == null || v <= 0) return;
    svg.append(svgEl('path', { d: topRoundedBar(x(i) - barW / 2, qy(v), barW, qtyTop + qtyH - qy(v), Math.min(4, barW / 2)), fill: 'var(--qty)' }));
  });

  const step = Math.max(1, Math.ceil(56 / band));
  for (let i = n - 1; i >= 0; i -= step) {
    svg.append(svgText(x(i), qtyTop + qtyH + 16, formatDate(days[i], true), 'middle'));
  }

  for (const [s, color] of [[LOW, 'var(--series-2)'], [MEDIAN, 'var(--series-1)']]) {
    const values = series[s];
    svg.append(svgEl('path', { d: linePath(values, x, y), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    values.forEach((v, i) => {
      const isolated = v != null && values[i - 1] == null && values[i + 1] == null;
      if (isolated || (v != null && i === lastIndex(values))) {
        svg.append(svgEl('circle', { cx: x(i), cy: y(v), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }));
      }
    });
  }

  const cross = svgEl('line', { y1: m.top, y2: qtyTop + qtyH, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' });
  const dots = [MEDIAN, LOW].map((s) => svgEl('circle', { r: 4, fill: s === MEDIAN ? 'var(--series-1)' : 'var(--series-2)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const hit = svgEl('rect', { x: m.left, y: m.top, width: plotW, height: qtyTop + qtyH - m.top, fill: 'transparent' });
  svg.append(hit);

  const tooltip = el('div', { class: 'tooltip', hidden: '' });
  let current = null;
  const show = (i) => {
    current = Math.max(0, Math.min(n - 1, i));
    if (!state.visible[current]) {
      hide();
      return;
    }
    cross.setAttribute('x1', x(current));
    cross.setAttribute('x2', x(current));
    cross.setAttribute('visibility', 'visible');
    [MEDIAN, LOW].forEach((s, k) => {
      const v = series[s][current];
      dots[k].setAttribute('visibility', v == null ? 'hidden' : 'visible');
      if (v != null) {
        dots[k].setAttribute('cx', x(current));
        dots[k].setAttribute('cy', y(v));
      }
    });
    tooltip.replaceChildren(el('div', { class: 'date' }, formatDate(days[current])));
    const row = (keyCls, color, value, label) => {
      const r = el('div', { class: 'row' });
      r.append(keyCls == null ? el('span', { class: 'key' }) : el('span', { class: `key ${keyCls}`, style: `background:${color}` }));
      r.append(el('strong', {}, value), el('span', {}, label));
      tooltip.append(r);
    };
    if (series[MEDIAN][current] == null) tooltip.append(el('div', {}, 'No listings'));
    else {
      row('', 'var(--series-1)', money(series[MEDIAN][current]), 'median');
      row('', 'var(--series-2)', money(series[LOW][current]), 'typical lowest');
      row(null, null, money(series[MIN][current]), 'lowest');
      row('bar', 'var(--qty)', count(series[QTY][current]), 'listed');
    }
    tooltip.hidden = false;
    const left = x(current) + 12;
    const tw = tooltip.offsetWidth;
    tooltip.style.left = `${left + tw > width ? x(current) - 12 - tw : left}px`;
  };
  const hide = () => {
    current = null;
    tooltip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    for (const d of dots) d.setAttribute('visibility', 'hidden');
  };
  const fromPointer = (e) => {
    const rect = svg.getBoundingClientRect();
    show(Math.floor((e.clientX - rect.left - m.left) / band));
  };
  hit.addEventListener('pointermove', fromPointer);
  hit.addEventListener('pointerdown', fromPointer);
  hit.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(lastIndex(series[MEDIAN])));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show((current ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Escape') hide();
  });

  container.replaceChildren(svg, tooltip);
}

function linePath(values, x, y) {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v == null) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

function topRoundedBar(x0, y0, w, h, r) {
  const rr = Math.min(r, h);
  return `M${x0},${y0 + h}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + w - rr}Q${x0 + w},${y0} ${x0 + w},${y0 + rr}V${y0 + h}Z`;
}

function niceTicks(min, max, count) {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    min -= pad;
    max += pad;
  }
  min = Math.max(0, min);
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let t = start; t < max + step - 1e-9; t += step) ticks.push(Math.round(t));
  return ticks;
}

// ---------- formatting ----------

function money(copper) {
  if (copper == null) return dash();
  const span = el('span', { class: 'money' });
  const v = Math.round(copper);
  const g = Math.floor(v / 10000);
  const s = Math.floor((v % 10000) / 100);
  const c = v % 100;
  const parts = [];
  if (g > 0) parts.push([g.toLocaleString('en-US'), 'g']);
  if (s > 0 && g < 10000) parts.push([s, 's']);
  if ((c > 0 && g < 100) || parts.length === 0) parts.push([c, 'c']);
  parts.forEach(([n, unit], i) => {
    if (i > 0) span.append(' ');
    span.append(String(n), el('span', { class: unit }, unit));
  });
  return span;
}

function moneyShort(copper) {
  if (copper >= 10000) return `${trim(copper / 10000)}g`;
  if (copper >= 100) return `${trim(copper / 100)}s`;
  return `${copper}c`;
}

function trim(v) {
  return v >= 100 ? Math.round(v).toLocaleString('en-US') : String(Number(v.toPrecision(3)));
}

function compact(v) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

function count(v) {
  return v == null ? dash() : Math.round(v).toLocaleString('en-US');
}

function percent(v) {
  if (v == null) return dash();
  const p = Math.round(v * 100);
  return p === 0 ? '0%' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`;
}

function dash() {
  return el('span', { class: 'muted' }, '–');
}

function formatDate(iso, short = false) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', short
    ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
    : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function titleCase(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function lastIndex(values) {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return i;
  return -1;
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---------- DOM helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function svgText(x, y, text, anchor) {
  const t = svgEl('text', { x, y, 'text-anchor': anchor });
  t.textContent = text;
  return t;
}

function setStatus(text) {
  const status = $('status');
  status.textContent = text;
  status.hidden = false;
}

function showLayout() {
  $('status').hidden = true;
  $('layout').hidden = false;
}

// ---------- start ----------

async function init() {
  wireControls();
  setStatus('Loading…');
  try {
    state.config = await getJson('data/regions.json');
  } catch (err) {
    setStatus(`Could not load the price data (${err.message}).`);
    return;
  }
  const { generated, regions, repository } = state.config;
  $('updated').textContent = `Updated ${new Date(generated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.`;
  if (repository) {
    $('repo-link').href = `https://github.com/${repository}`;
    $('privacy-link').href = `https://github.com/${repository}/blob/main/PRIVACY.md`;
    $('links').hidden = false;
  }
  if (regions.length === 0) {
    setStatus('No price data yet. Prices appear after the first complete UTC day of collection.');
    return;
  }
  const region = $('region');
  for (const r of regions) region.append(new Option(REGION_NAMES[r] ? `${REGION_NAMES[r]} (${r.toUpperCase()})` : r.toUpperCase(), r));
  region.disabled = false;
  window.addEventListener('hashchange', route);
  await route();
}

init();
