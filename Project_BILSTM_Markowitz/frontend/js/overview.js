let OVERVIEW_DATA = [];

async function loadOverview() {
  try {
    const data = await Api.overview();
    OVERVIEW_DATA = data;
    renderTickerStrip(data);
    renderOverviewTable(data);
    document.getElementById('overview-updated').textContent =
      'Diperbarui ' + new Date().toLocaleTimeString('id-ID');
  } catch (e) {
    showAlert('overview-alert', 'error', e.message);
    document.getElementById('overview-tbody').innerHTML =
      `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Gagal memuat data</td></tr>`;
  }
}

function renderTickerStrip(data) {
  const el = document.getElementById('strip-inner');
  if (!data.length) return;
  const itemHtml = (row) => `
    <span class="strip-item">
      <span class="strip-ticker">${row.ticker}</span>
      <span class="strip-price">${fmtRupiah(row.price)}</span>
      <span class="strip-chg ${pctClass(row.change)}">${fmtPct(row.change)}</span>
    </span>`;
  // duplikasi list agar animasi scroll terlihat menyambung (lihat keyframes scroll-strip)
  el.innerHTML = data.map(itemHtml).join('') + data.map(itemHtml).join('');
}

function renderOverviewTable(data) {
  const tbody = document.getElementById('overview-tbody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Tidak ada data</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(row => `
    <tr class="overview-row" data-ticker="${row.ticker}" style="cursor:pointer;">
      <td style="width:80px;">${row.ticker}</td>
      <td style="width:40%;font-family:inherit;color:var(--text-secondary);white-space:normal;">${escapeHtml(row.name)}</td>
      <td style="width:150px;text-align:right;">${fmtRupiah(row.price)}</td>
      <td style="width:120px;text-align:right;" class="${pctClass(row.change)}">${fmtPct(row.change)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.overview-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const ticker = tr.dataset.ticker;
      const select = document.getElementById('ticker-select');
      if (select) select.value = ticker;
      switchTab('technical');
      document.getElementById('btn-load-data')?.click();
    });
  });
}