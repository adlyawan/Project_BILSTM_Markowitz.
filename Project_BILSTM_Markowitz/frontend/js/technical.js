let LAST_STOCK_DATA = null;

async function loadStockData() {
  const ticker = document.getElementById('ticker-select').value;
  const start = document.getElementById('date-start').value;
  const end = document.getElementById('date-end').value;
  clearAlert('technical-alert');

  const btn = document.getElementById('btn-load-data');
  setBtnLoading(btn, true, 'Memuat…', '📊 Muat Data');

  try {
    const params = { ticker };
    if (start) params.start = start;
    if (end) params.end = end;
    const data = await Api.stockData(params);
    LAST_STOCK_DATA = data;
    renderCards(data);
    renderTechnicalCharts(data);
    document.getElementById('topbar-label').textContent = `${data.name} (${data.ticker})`;
  } catch (e) {
    showAlert('technical-alert', 'error', e.message);
  } finally {
    setBtnLoading(btn, false, '', '📊 Muat Data');
  }
}

function lastValid(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) return arr[i];
  }
  return null;
}

function renderCards(data) {
  const lastClose = lastValid(data.close);
  const prevClose = data.close.length > 1 ? lastValid(data.close.slice(0, -1)) : lastClose;
  const change = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;
  const rsi = lastValid(data.rsi);
  const ma20 = lastValid(data.ma20);
  const ma50 = lastValid(data.ma50);

  document.getElementById('card-price').textContent = fmtRupiah(lastClose);
  document.getElementById('card-ticker-name').textContent = `${data.name} (${data.ticker})`;

  const changeEl = document.getElementById('card-change');
  changeEl.textContent = fmtPct(change);
  changeEl.className = 'card-value ' + pctClass(change);
  document.getElementById('card-change-sub').textContent = `${data.total_rows} baris data`;

  document.getElementById('card-rsi').textContent = rsi !== null ? fmtNum(rsi, 1) : '–';
  const rsiSub = document.getElementById('card-rsi-sub');
  if (rsi === null) rsiSub.textContent = '–';
  else if (rsi > 70) rsiSub.textContent = '🔴 Overbought';
  else if (rsi < 30) rsiSub.textContent = '🟢 Oversold';
  else rsiSub.textContent = '⚪ Normal';

  const sigEl = document.getElementById('card-signal');
  const sigSub = document.getElementById('card-signal-sub');
  if (ma20 !== null && ma50 !== null) {
    const diffPct = ((ma20 - ma50) / ma50) * 100;
    if (Math.abs(diffPct) < 0.5) {
      sigEl.textContent = '➖ Netral'; sigEl.className = 'card-value';
    } else if (ma20 > ma50) {
      sigEl.textContent = '📈 Bullish'; sigEl.className = 'card-value up';
    } else {
      sigEl.textContent = '📉 Bearish'; sigEl.className = 'card-value down';
    }
    sigSub.textContent = `MA20 ${fmtNum(ma20,0)} vs MA50 ${fmtNum(ma50,0)}`;
  } else {
    sigEl.textContent = '–'; sigSub.textContent = 'Data MA belum cukup';
  }
}

function renderTechnicalCharts(data) {
  const c = chartColors();
  document.getElementById('price-panel-title').innerHTML =
    `📈 Harga Penutupan, MA &amp; Bollinger Bands — ${data.name} (${data.ticker})`;

  // ── Price + MA + Bollinger Bands ──
  destroyChart('price');
  setChart('price', new Chart(document.getElementById('chart-price'), {
    type: 'line',
    data: {
      labels: data.dates,
      datasets: [
        { label: 'BB Upper', data: data.bb_upper, borderColor: 'transparent', backgroundColor: c.gold + '22', fill: '+1', pointRadius: 0, borderWidth: 0, order: 5 },
        { label: 'BB Lower', data: data.bb_lower, borderColor: 'transparent', backgroundColor: c.gold + '22', fill: false, pointRadius: 0, borderWidth: 0, order: 5 },
        { label: 'Close', data: data.close, borderColor: c.gold, backgroundColor: c.gold, pointRadius: 0, borderWidth: 2, tension: .1, order: 1 },
        { label: 'MA20', data: data.ma20, borderColor: c.blue, pointRadius: 0, borderWidth: 1.5, tension: .1, order: 2 },
        { label: 'MA50', data: data.ma50, borderColor: c.purple, pointRadius: 0, borderWidth: 1.5, tension: .1, order: 3 },
        { label: 'MA200', data: data.ma200, borderColor: c.orange, pointRadius: 0, borderWidth: 1.5, tension: .1, order: 4 },
      ],
    },
    options: baseChartOptions({ scales: { y: { ticks: { callback: v => fmtNum(v, 0) } } } }),
  }));
  showCanvas('chart-price');

  // ── Volume ──
  const volColors = data.close.map((v, i) => {
    const prev = i > 0 ? data.close[i - 1] : v;
    return v >= prev ? c.green : c.red;
  });
  destroyChart('volume');
  setChart('volume', new Chart(document.getElementById('chart-volume'), {
    type: 'bar',
    data: { labels: data.dates, datasets: [{ label: 'Volume', data: data.volume, backgroundColor: volColors, barPercentage: 1, categoryPercentage: 1 }] },
    options: baseChartOptions({ plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => fmtNum(v / 1e6, 1) + 'M' } } } }),
  }));
  showCanvas('chart-volume');

  // ── RSI ──
  destroyChart('rsi');
  setChart('rsi', new Chart(document.getElementById('chart-rsi'), {
    type: 'line',
    data: {
      labels: data.dates,
      datasets: [
        { label: 'RSI', data: data.rsi, borderColor: c.gold, pointRadius: 0, borderWidth: 1.5, tension: .1 },
        { label: 'Overbought', data: data.dates.map(() => 70), borderColor: c.red, borderDash: [4, 4], pointRadius: 0, borderWidth: 1 },
        { label: 'Oversold', data: data.dates.map(() => 30), borderColor: c.green, borderDash: [4, 4], pointRadius: 0, borderWidth: 1 },
      ],
    },
    options: baseChartOptions({ scales: { y: { min: 0, max: 100 } } }),
  }));
  showCanvas('chart-rsi');

  // ── MACD ──
  const histColors = data.macd_hist.map(v => (v ?? 0) >= 0 ? c.green : c.red);
  destroyChart('macd');
  setChart('macd', new Chart(document.getElementById('chart-macd'), {
    data: {
      labels: data.dates,
      datasets: [
        { type: 'bar', label: 'Histogram', data: data.macd_hist, backgroundColor: histColors, barPercentage: 1, categoryPercentage: 1, order: 2 },
        { type: 'line', label: 'MACD', data: data.macd, borderColor: c.blue, pointRadius: 0, borderWidth: 1.5, tension: .1, order: 1 },
        { type: 'line', label: 'Signal', data: data.signal, borderColor: c.orange, pointRadius: 0, borderWidth: 1.5, tension: .1, order: 1 },
      ],
    },
    options: baseChartOptions(),
  }));
  showCanvas('chart-macd');
}

document.addEventListener('themechange', () => {
  if (LAST_STOCK_DATA) renderTechnicalCharts(LAST_STOCK_DATA);
});
