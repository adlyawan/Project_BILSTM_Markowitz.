let LAST_PORTFOLIO_DATA = null;
const DEFAULT_PORTFOLIO_TICKERS = ['BBRI', 'BMRI', 'TLKM', 'ANTM', 'PTBA'];

function buildTickerMultiselect() {
  const wrap = document.getElementById('ticker-multiselect');
  wrap.innerHTML = Object.entries(BUMN20).map(([t, name]) => `
    <label class="ms-item">
      <input type="checkbox" value="${t}" ${DEFAULT_PORTFOLIO_TICKERS.includes(t) ? 'checked' : ''}>
      <span>${t} — ${escapeHtml(name)}</span>
    </label>
  `).join('');
}

function getSelectedTickers() {
  return Array.from(document.querySelectorAll('#ticker-multiselect input:checked')).map(i => i.value);
}

async function optimizePortfolio() {
  const tickers = getSelectedTickers();
  clearAlert('portfolio-alert');

  if (tickers.length < 2) {
    showAlert('portfolio-alert', 'warning', 'Pilih minimal 2 saham untuk optimasi portofolio.');
    return;
  }

  const start = document.getElementById('date-start').value;
  const end = document.getElementById('date-end').value;
  const n_simulations = Number(document.getElementById('n-sims').value);
  const risk_free_rate = Number(document.getElementById('risk-free').value) / 100;
  const modal = Number(document.getElementById('modal').value) || 100000000;

  const btn = document.getElementById('btn-optimize');
  setBtnLoading(btn, true, 'Mengoptimalkan…', '🌟 Optimalkan Portofolio');

  try {
    const body = { tickers, n_simulations, risk_free_rate, modal };
    if (start) body.start = start;
    if (end) body.end = end;

    const data = await Api.optimizePortfolio(body);
    LAST_PORTFOLIO_DATA = data;
    renderPortfolioResults(data);
  } catch (e) {
    showAlert('portfolio-alert', 'error', e.message);
  } finally {
    setBtnLoading(btn, false, '', '🌟 Optimalkan Portofolio');
  }
}

function renderPortfolioResults(data) {
  renderPortfolioCharts(data);
  renderCorrelationTable(data);
  renderPortfolioCards(data);
  renderAllocationTable(data, document.getElementById('alloc-select').value);
}

function renderPortfolioCharts(data) {
  const c = chartColors();

  // ── Normalized price comparison ──
  destroyChart('normPrices');
  setChart('normPrices', new Chart(document.getElementById('chart-norm'), {
    type: 'line',
    data: {
      labels: data.norm_dates,
      datasets: data.tickers.map((t, i) => ({
        label: t, data: data.norm_prices[t], borderColor: paletteColor(i),
        pointRadius: 0, borderWidth: 1.8, tension: .1,
      })),
    },
    options: baseChartOptions(),
  }));
  showCanvas('chart-norm');

  // ── Efficient frontier scatter ──
  const frontierPoints = data.frontier.vol.map((v, i) => ({ x: v, y: data.frontier.ret[i], sharpe: data.frontier.sharpe[i] }));
  const sharpeVals = frontierPoints.map(p => p.sharpe);
  const minS = Math.min(...sharpeVals), maxS = Math.max(...sharpeVals);
  const pointColors = frontierPoints.map(p => sharpeToColor(maxS > minS ? (p.sharpe - minS) / (maxS - minS) : 0.5));

  const portfolioMarker = (port, color, style) => ({
    label: port.label,
    data: [{ x: port.volatility, y: port.return }],
    backgroundColor: color, borderColor: color,
    pointStyle: style, pointRadius: 9, pointHoverRadius: 11,
    showLine: false,
  });

  destroyChart('frontier');
  setChart('frontier', new Chart(document.getElementById('chart-frontier'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Simulasi Portofolio', data: frontierPoints, backgroundColor: pointColors, pointRadius: 2.5, pointHoverRadius: 4, showLine: false },
        portfolioMarker(data.portfolios.max_sharpe, c.gold, 'star'),
        portfolioMarker(data.portfolios.min_vol, c.blue, 'triangle'),
        portfolioMarker(data.portfolios.max_ret, c.purple, 'rectRot'),
      ],
    },
    options: baseChartOptions({
      plugins: { tooltip: { callbacks: { label: (ctx) => `Return ${fmtNum(ctx.parsed.y)}% / Vol ${fmtNum(ctx.parsed.x)}%` } } },
      scales: {
        x: { title: { display: true, text: 'Volatilitas Tahunan (%)', color: c.text } },
        y: { title: { display: true, text: 'Return Tahunan (%)', color: c.text } },
      },
    }),
  }));
  showCanvas('chart-frontier');

  // ── Return & volatility per stock ──
  destroyChart('retVol');
  setChart('retVol', new Chart(document.getElementById('chart-retvol'), {
    type: 'bar',
    data: {
      labels: data.tickers,
      datasets: [
        { label: 'Return Tahunan (%)', data: data.tickers.map(t => data.annual_return[t]), backgroundColor: c.gold },
        { label: 'Volatilitas Tahunan (%)', data: data.tickers.map(t => data.annual_vol[t]), backgroundColor: c.blue },
      ],
    },
    options: baseChartOptions(),
  }));
  showCanvas('chart-retvol');
}

function renderCorrelationTable(data) {
  const tickers = data.tickers;
  const corr = data.correlation;
  const c = chartColors();

  let html = '<table><thead><tr><th></th>' + tickers.map(t => `<th>${t}</th>`).join('') + '</tr></thead><tbody>';
  for (const rowT of tickers) {
    html += `<tr><th>${rowT}</th>`;
    for (const colT of tickers) {
      const v = corr[rowT][colT];
      const t = (v + 1) / 2; // -1..1 -> 0..1
      const bg = rowT === colT ? c.gold : lerpColor(c.red, c.green, t);
      const alpha = rowT === colT ? '33' : '55';
      html += `<td class="corr-cell" style="background:${bg}${alpha};">${fmtNum(v, 2)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  document.getElementById('corr-table-wrap').innerHTML = html;
}

function renderPortfolioCards(data) {
  const row = document.getElementById('portfolio-cards-row');
  const cards = ['max_sharpe', 'min_vol', 'max_ret'].map(key => {
    const p = data.portfolios[key];
    const weightBars = Object.entries(p.weights)
      .filter(([, w]) => w >= 1)
      .sort((a, b) => b[1] - a[1])
      .map(([t, w]) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;">
          <span style="width:42px;color:var(--text-secondary);">${t}</span>
          <div style="flex:1;background:var(--bg-hover);border-radius:3px;height:6px;overflow:hidden;">
            <div style="width:${w}%;height:100%;background:var(--gold);"></div>
          </div>
          <span style="width:38px;text-align:right;font-family:'JetBrains Mono',monospace;">${fmtNum(w, 1)}%</span>
        </div>`).join('');

    return `
      <div class="port-card">
        <div class="port-card-title">${p.label}</div>
        <div class="port-stats">
          <div><div class="port-stat-label">Return</div><div class="port-stat-value up">${fmtPct(p.return)}</div></div>
          <div><div class="port-stat-label">Volatilitas</div><div class="port-stat-value">${fmtNum(p.volatility)}%</div></div>
          <div><div class="port-stat-label">Sharpe</div><div class="port-stat-value" style="color:var(--gold);">${fmtNum(p.sharpe, 3)}</div></div>
        </div>
        ${weightBars}
      </div>`;
  }).join('');
  row.innerHTML = cards;
}

function renderAllocationTable(data, key) {
  const port = data.portfolios[key];
  const tbody = document.getElementById('alloc-tbody');
  tbody.innerHTML = port.allocation.map(r => `
    <tr>
      <td>${r.ticker}</td>
      <td class="td-name">${escapeHtml(r.name)}</td>
      <td>${fmtNum(r.weight)}%</td>
      <td>${fmtRupiah(r.alloc)}</td>
      <td>${fmtRupiah(r.price)}</td>
      <td>${r.lot}</td>
      <td>${fmtRupiah(r.real)}</td>
    </tr>
  `).join('');
}

document.addEventListener('themechange', () => {
  if (LAST_PORTFOLIO_DATA) {
    renderPortfolioCharts(LAST_PORTFOLIO_DATA);
    renderCorrelationTable(LAST_PORTFOLIO_DATA);
  }
});
