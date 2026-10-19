function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));

  const labels = {
    overview: 'Ringkasan Pasar',
    technical: LAST_STOCK_DATA ? `${LAST_STOCK_DATA.name} (${LAST_STOCK_DATA.ticker})` : 'Analisis Teknikal',
    lstm: 'Prediksi BiLSTM',
    portfolio: 'Optimasi Portofolio',
  };
  document.getElementById('topbar-label').textContent = labels[tabName] || 'KimiGold';

  // tampilkan/sembunyikan bagian sidebar yang relevan untuk tab aktif
  document.getElementById('section-lstm').style.display = tabName === 'lstm' ? 'block' : 'none';
  document.getElementById('section-portfolio').style.display = tabName === 'portfolio' ? 'block' : 'none';

  closeSidebarMobile();
}

function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

function initTickerSelect() {
  const select = document.getElementById('ticker-select');
  select.innerHTML = Object.entries(BUMN20).map(([t, name]) => `<option value="${t}">${t} — ${name}</option>`).join('');
  select.value = 'BBRI';
}

function initDateRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3);
  document.getElementById('date-end').value = end.toISOString().slice(0, 10);
  document.getElementById('date-start').value = start.toISOString().slice(0, 10);
}

function initSliderLabels() {
  const bindings = [
    ['lookback', 'val-lookback'],
    ['epochs', 'val-epochs'],
    ['future-days', 'val-future'],
    ['test-pct', 'val-testpct'],
    ['n-sims', 'val-sims'],
    ['risk-free', 'val-rf'],
  ];
  bindings.forEach(([inputId, labelId]) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    label.textContent = input.value;
    input.addEventListener('input', () => { label.textContent = input.value; });
  });
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function initSidebarMobile() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebarMobile);
}

function initButtons() {
  document.getElementById('btn-load-data').addEventListener('click', loadStockData);
  document.getElementById('btn-train-lstm').addEventListener('click', trainLstmModel);
  document.getElementById('btn-optimize').addEventListener('click', optimizePortfolio);
  document.getElementById('alloc-select').addEventListener('change', (e) => {
    if (LAST_PORTFOLIO_DATA) renderAllocationTable(LAST_PORTFOLIO_DATA, e.target.value);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTickerSelect();
  initDateRange();
  initSliderLabels();
  buildTickerMultiselect();
  initTabs();
  initSidebarMobile();
  initButtons();
  switchTab('overview');

  loadOverview();
  loadStockData(); // muat data teknikal default (BBRI) agar tab Teknikal tidak kosong
});
