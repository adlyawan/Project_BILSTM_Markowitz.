let LAST_LSTM_DATA = null;
let lstmProgressTimer = null;

async function trainLstmModel() {
  const ticker = document.getElementById('ticker-select').value;
  const start = document.getElementById('date-start').value;
  const end = document.getElementById('date-end').value;
  const lookback = Number(document.getElementById('lookback').value);
  const epochs = Number(document.getElementById('epochs').value);
  const batch_size = Number(document.getElementById('batch-size').value);
  const future_days = Number(document.getElementById('future-days').value);
  const test_pct = Number(document.getElementById('test-pct').value);

  clearAlert('lstm-alert');
  const btn = document.getElementById('btn-train-lstm');
  setBtnLoading(btn, true, 'Melatih…', '🧠 Latih Model');
  startFakeProgress(epochs);

  try {
    const body = { ticker, lookback, epochs, batch_size, future_days, test_pct };
    if (start) body.start = start;
    if (end) body.end = end;

    const data = await Api.trainLstm(body);
    LAST_LSTM_DATA = data;
    finishFakeProgress(true);
    renderLstmResults(data, ticker, future_days);
  } catch (e) {
    finishFakeProgress(false);
    showAlert('lstm-alert', 'error', e.message);
  } finally {
    setBtnLoading(btn, false, '', '🧠 Latih Model');
  }
}

// Permintaan /api/lstm/train bersifat blocking (server melatih semua epoch
// sebelum mengirim respons), jadi progress bar ini adalah perkiraan visual,
// bukan progres aktual dari server.
function startFakeProgress(epochs) {
  const wrap = document.getElementById('lstm-progress-wrap');
  const fill = document.getElementById('lstm-progress-fill');
  const pct = document.getElementById('lstm-progress-pct');
  const text = document.getElementById('lstm-progress-text');
  wrap.style.display = 'block';
  fill.style.width = '0%';
  pct.textContent = '0%';
  text.textContent = 'Mengunduh data & menyiapkan sequence…';

  const estMsPerEpoch = 350; // perkiraan kasar, bervariasi sesuai mesin
  const totalEst = Math.max(epochs * estMsPerEpoch, 1500);
  const startTime = Date.now();

  lstmProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const ratio = Math.min(elapsed / totalEst, 0.92); // jangan sampai nyentuh 100% sebelum respons asli
    const p = Math.round(ratio * 100);
    fill.style.width = p + '%';
    pct.textContent = p + '%';
    const estEpoch = Math.min(Math.ceil(ratio * epochs), epochs);
    text.textContent = `Melatih epoch ~${estEpoch}/${epochs}…`;
  }, 200);
}

function finishFakeProgress(success) {
  clearInterval(lstmProgressTimer);
  const wrap = document.getElementById('lstm-progress-wrap');
  const fill = document.getElementById('lstm-progress-fill');
  const pct = document.getElementById('lstm-progress-pct');
  const text = document.getElementById('lstm-progress-text');
  if (success) {
    fill.style.width = '100%';
    pct.textContent = '100%';
    text.textContent = 'Selesai ✅';
    setTimeout(() => { wrap.style.display = 'none'; }, 800);
  } else {
    wrap.style.display = 'none';
  }
}

function renderLstmResults(data, ticker, futureDays) {
  // Ringkasan prediksi
  document.getElementById('lstm-pred-summary').style.display = 'flex';
  document.getElementById('pred-price-from').textContent = fmtRupiah(data.last_price);
  document.getElementById('pred-to-label').textContent = `Prediksi (+${futureDays} hari)`;
  document.getElementById('pred-price-to').textContent = fmtRupiah(data.final_price);
  const chg = ((data.final_price - data.last_price) / data.last_price) * 100;
  const chgEl = document.getElementById('pred-chg');
  chgEl.textContent = fmtPct(chg);
  chgEl.className = 'pred-chg ' + pctClass(chg);

  // Metrik
  document.getElementById('lstm-metrics').style.display = 'grid';
  document.getElementById('metric-mae').textContent = fmtNum(data.metrics.mae);
  document.getElementById('metric-rmse').textContent = fmtNum(data.metrics.rmse);
  document.getElementById('metric-r2').textContent = fmtNum(data.metrics.r2, 4);
  document.getElementById('metric-mape').textContent = fmtNum(data.metrics.mape) + '%';

  renderLstmCharts(data);
  renderFutureTable(data.future);
}

function renderLstmCharts(data) {
  const c = chartColors();

  // Sambungkan garis prediksi masa depan dari titik harga terakhir agar menyatu secara visual
  const lastHistDate = data.history_dates[data.history_dates.length - 1];
  const futureDates = [lastHistDate, ...data.future.map(f => f.date)];
  const futureValues = [data.last_price, ...data.future.map(f => f.price)];

  const { labels, series } = mergeTimeline({
    history: { dates: data.history_dates, values: data.history_close },
    testPred: { dates: data.test_dates, values: data.test_pred },
    future: { dates: futureDates, values: futureValues },
  });

  destroyChart('lstmMain');
  setChart('lstmMain', new Chart(document.getElementById('chart-lstm-main'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Harga Aktual', data: series.history, borderColor: c.gold, pointRadius: 0, borderWidth: 2, tension: .1, spanGaps: true },
        { label: 'Prediksi (Data Uji)', data: series.testPred, borderColor: c.blue, borderDash: [5, 3], pointRadius: 0, borderWidth: 2, tension: .1, spanGaps: true },
        { label: 'Prediksi Masa Depan', data: series.future, borderColor: c.purple, borderDash: [5, 3], pointRadius: 0, borderWidth: 2, tension: .1, spanGaps: true },
      ],
    },
    options: baseChartOptions({ scales: { y: { ticks: { callback: v => fmtNum(v, 0) } } } }),
  }));
  showCanvas('chart-lstm-main');

  destroyChart('lstmLoss');
  setChart('lstmLoss', new Chart(document.getElementById('chart-lstm-loss'), {
    type: 'line',
    data: {
      labels: data.train_loss.map((_, i) => i + 1),
      datasets: [
        { label: 'Training Loss', data: data.train_loss, borderColor: c.gold, pointRadius: 0, borderWidth: 2, tension: .2 },
        { label: 'Validation Loss', data: data.val_loss, borderColor: c.blue, pointRadius: 0, borderWidth: 2, tension: .2 },
      ],
    },
    options: baseChartOptions({ scales: { x: { title: { display: true, text: 'Epoch', color: c.text } } } }),
  }));
  showCanvas('chart-lstm-loss');
}

function renderFutureTable(future) {
  const tbody = document.getElementById('future-tbody');
  tbody.innerHTML = future.map(f => `
    <tr>
      <td>${f.date}</td>
      <td>${fmtRupiah(f.price)}</td>
      <td class="${pctClass(f.change)}">${fmtPct(f.change)}</td>
    </tr>
  `).join('');
}

document.addEventListener('themechange', () => {
  if (LAST_LSTM_DATA) renderLstmCharts(LAST_LSTM_DATA);
});
