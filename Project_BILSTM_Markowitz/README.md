# KimiGold — Dashboard Saham BUMN

Dashboard saham 20 perusahaan BUMN (BUMN20) dengan analisis teknikal, prediksi harga
BiLSTM, dan optimasi portofolio Markowitz. Backend Flask + frontend HTML/CSS/JS murni
(tanpa build step), siap dijalankan dan diedit langsung di VSCode.

## Struktur Folder

```
kimigold/
├── backend/
│   ├── app.py            # Flask API (yfinance, indikator, LSTM, Markowitz)
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── config.js     # alamat API backend
        ├── constants.js  # daftar 20 ticker BUMN
        ├── utils.js       # formatting, helper Chart.js
        ├── theme.js       # toggle dark/light
        ├── api.js         # pembungkus fetch ke backend
        ├── overview.js    # tab Ringkasan
        ├── technical.js   # tab Analisis Teknikal
        ├── lstm.js        # tab Prediksi LSTM
        ├── portfolio.js   # tab Optimasi Portofolio
        └── app.js         # init, tab switching, sidebar
```

## 1. Jalankan Backend

Disarankan pakai virtual environment supaya dependency tidak bercampur dengan Python sistem.

```bash
cd kimigold/backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt # tensorflow cukup besar, proses ini bisa beberapa menit
python app.py
```

Server akan berjalan di **http://localhost:5000** (mode debug). CORS sudah diaktifkan
lewat `flask-cors`, jadi frontend di port lain bisa langsung memanggil API ini.

Endpoint yang tersedia:
- `GET  /api/stock/overview` — harga & perubahan 20 saham BUMN
- `GET  /api/stock/data?ticker=BBRI&start=...&end=...` — OHLCV + MA/Bollinger/RSI/MACD
- `POST /api/lstm/train` — body `{ticker, start, end, lookback, epochs, batch_size, future_days, test_pct}`
- `POST /api/markowitz/optimize` — body `{tickers, start, end, n_simulations, risk_free_rate, modal}`

## 2. Jalankan Frontend

Frontend memanggil backend lewat `fetch`, jadi paling aman dibuka lewat HTTP server lokal
(bukan langsung dobel klik file), agar tidak kena batasan CORS `file://`.

**Cara termudah** — pakai ekstensi VSCode "Live Server": klik kanan `frontend/index.html` →
*Open with Live Server*.

**Atau** lewat terminal:
```bash
cd kimigold/frontend
python3 -m http.server 8000
```
Lalu buka **http://localhost:8000** di browser.

> Jalankan backend dan frontend di dua terminal terpisah secara bersamaan.

## 3. Konfigurasi

Jika backend dijalankan di host/port berbeda, ubah satu baris di `frontend/js/config.js`:

```js
const API_BASE = 'http://localhost:5000';
```

## Catatan

- `yfinance` butuh koneksi internet untuk mengambil data dari Yahoo Finance (ticker `.JK`).
  Jika ada saham yang gagal dimuat di tab Ringkasan, kemungkinan rate limit Yahoo Finance —
  coba lagi beberapa saat.
- Training LSTM dijalankan langsung di server (blocking) — semakin besar epoch/lookback,
  semakin lama responsnya. Progress bar di tab "Prediksi LSTM" adalah perkiraan visual
  (server tidak mengirim progres per-epoch secara real-time).
- Untuk Optimasi Portofolio, pilih minimal 2 saham di sidebar sebelum klik "Optimalkan Portofolio".
