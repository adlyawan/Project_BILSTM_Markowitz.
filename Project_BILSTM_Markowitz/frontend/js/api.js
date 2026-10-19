const Api = {
  async overview() {
    const r = await fetch(`${API_BASE}/api/stock/overview`);
    if (!r.ok) throw new Error('Gagal memuat ringkasan saham. Pastikan server Flask berjalan di ' + API_BASE);
    return r.json();
  },

  async stockData(params) {
    const q = new URLSearchParams(params).toString();
    const r = await fetch(`${API_BASE}/api/stock/data?${q}`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat data saham');
    }
    return r.json();
  },

  async trainLstm(body) {
    const r = await fetch(`${API_BASE}/api/lstm/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal melatih model BiLSTM');
    }
    return r.json();
  },

  async optimizePortfolio(body) {
    const r = await fetch(`${API_BASE}/api/markowitz/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengoptimalkan portofolio');
    }
    return r.json();
  },
};
