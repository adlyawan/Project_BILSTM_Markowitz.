// ── FORMATTING ──────────────────────────────────────────────────────────────
function fmtRupiah(v) {
  if (v === null || v === undefined || isNaN(v)) return '–';
  return 'Rp' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '–';
  const sign = v > 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2)}%`;
}

function fmtNum(v, d = 2) {
  if (v === null || v === undefined || isNaN(v)) return '–';
  return Number(v).toLocaleString('id-ID', { maximumFractionDigits: d });
}

function pctClass(v) {
  return v >= 0 ? 'up' : 'down';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ── ALERTS ──────────────────────────────────────────────────────────────────
function showAlert(containerId, type, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : type === 'warning' ? '🔔' : 'ℹ️';
  el.innerHTML = `<div class="alert alert-${type}"><span>${icon}</span><span>${escapeHtml(message)}</span></div>`;
}

function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// ── BUTTON LOADING STATE ─────────────────────────────────────────────────────
function setBtnLoading(btn, loading, labelLoading, labelDefault) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> ${labelLoading}` : labelDefault;
}

// ── CHART.JS THEME ───────────────────────────────────────────────────────────
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartColors() {
  return {
    text: getCSSVar('--text-secondary'),
    textPrimary: getCSSVar('--text-primary'),
    grid: getCSSVar('--border-subtle'),
    border: getCSSVar('--border'),
    gold: getCSSVar('--gold'),
    goldLight: getCSSVar('--gold-light'),
    green: getCSSVar('--green'),
    red: getCSSVar('--red'),
    blue: getCSSVar('--blue'),
    orange: getCSSVar('--orange'),
    purple: getCSSVar('--purple'),
    surface: getCSSVar('--bg-surface'),
  };
}

const PALETTE = ['gold', 'blue', 'green', 'purple', 'orange', 'red', 'goldLight'];
function paletteColor(i) {
  const c = chartColors();
  const key = PALETTE[i % PALETTE.length];
  return c[key];
}

function baseChartOptions(extra = {}) {
  const c = chartColors();
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: c.text, font: { size: 11, family: 'Inter' }, boxWidth: 10 } },
      tooltip: {
        backgroundColor: c.surface, titleColor: c.textPrimary, bodyColor: c.text,
        borderColor: c.border, borderWidth: 1, padding: 10,
      },
    },
    scales: {
      x: { ticks: { color: c.text, font: { size: 10 }, maxRotation: 0, autoSkip: true }, grid: { color: c.grid } },
      y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } },
    },
  };
  return deepMerge(base, extra);
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ── CHART REGISTRY (so we can destroy/recreate on theme change or re-fetch) ─
const ChartRegistry = {};
function destroyChart(key) {
  if (ChartRegistry[key]) {
    ChartRegistry[key].destroy();
    delete ChartRegistry[key];
  }
}
function setChart(key, chart) {
  destroyChart(key);
  ChartRegistry[key] = chart;
  return chart;
}

function showCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ph = document.getElementById(canvasId + '-ph');
  if (canvas) canvas.style.display = 'block';
  if (ph) ph.style.display = 'none';
}

// ── TIMELINE MERGE (align series with different date ranges on one x-axis) ──
function mergeTimeline(seriesMap) {
  const allDates = new Set();
  Object.values(seriesMap).forEach(s => s.dates.forEach(d => allDates.add(d)));
  const labels = Array.from(allDates).sort();
  const idx = new Map(labels.map((d, i) => [d, i]));
  const series = {};
  for (const [key, s] of Object.entries(seriesMap)) {
    const arr = new Array(labels.length).fill(null);
    s.dates.forEach((d, i) => { arr[idx.get(d)] = s.values[i]; });
    series[key] = arr;
  }
  return { labels, series };
}

// ── COLOR INTERPOLATION (for sharpe ratio / correlation heat) ───────────────
function lerpColor(a, b, t) {
  const ah = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const bh = b.match(/\w\w/g).map(x => parseInt(x, 16));
  const rh = ah.map((c, i) => Math.round(c + (bh[i] - c) * t));
  return '#' + rh.map(x => x.toString(16).padStart(2, '0')).join('');
}

function sharpeToColor(t) {
  // t in [0,1]: red -> gold -> green
  const c = chartColors();
  if (t < 0.5) return lerpColor(c.red, c.gold, t / 0.5);
  return lerpColor(c.gold, c.green, (t - 0.5) / 0.5);
}
