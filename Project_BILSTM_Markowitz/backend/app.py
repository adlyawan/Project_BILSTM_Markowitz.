from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, Bidirectional
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from scipy.optimize import minimize

app = Flask(__name__)
CORS(app)

BUMN20 = {
    'BBRI':'Bank Rakyat Indonesia','BMRI':'Bank Mandiri','BBNI':'Bank Negara Indonesia',
    'BBTN':'Bank Tabungan Negara','BRIS':'Bank Syariah Indonesia','TLKM':'Telkom Indonesia',
    'PTBA':'Bukit Asam','ANTM':'Aneka Tambang','PTPP':'PP (Persero)','WIKA':'Wijaya Karya',
    'ADHI':'Adhi Karya','JSMR':'Jasa Marga','PGAS':'Perusahaan Gas Negara',
    'ELSA':'Elnusa','AKRA':'AKR Corporindo','SMGR':'Semen Indonesia',
    'INAF':'Indofarma','KAEF':'Kimia Farma','GIAA':'Garuda Indonesia',
}
TICKER_MAP = {k: k+'.JK' for k in BUMN20}

def make_sequences(data, lookback):
    X, y = [], []
    for i in range(len(data)-lookback):
        X.append(data[i:i+lookback])
        y.append(data[i+lookback])
    return np.array(X), np.array(y)

def build_bilstm(lookback):
    model = Sequential([
        Bidirectional(LSTM(64, return_sequences=True), input_shape=(lookback, 1)),
        Dropout(0.2),
        Bidirectional(LSTM(32, return_sequences=False)),
        Dropout(0.2),
        Dense(16, activation='relu'),
        Dense(1),
    ])
    model.compile(optimizer='adam', loss='mse')
    return model

def calc_rsi(s, p=14):
    d = s.diff()
    g = d.clip(lower=0).rolling(p).mean()
    l = (-d.clip(upper=0)).rolling(p).mean()
    return 100 - (100 / (1 + g / l))


# ── OVERVIEW ──────────────────────────────────────────────────────────────────
@app.route('/api/stock/overview')
def stock_overview():
    rows = []
    for t, name in BUMN20.items():
        try:
            tmp = yf.download(TICKER_MAP[t], period='5d', progress=False, auto_adjust=True)
            if tmp.empty:
                print(f"[SKIP] {t}: data kosong")
                continue

            # Fix MultiIndex columns (yfinance versi baru)
            if isinstance(tmp.columns, pd.MultiIndex):
                tmp.columns = tmp.columns.get_level_values(0)

            close = tmp['Close'].dropna()
            if len(close) < 1:
                print(f"[SKIP] {t}: Close kosong")
                continue

            lc = float(close.iloc[-1])
            pc = float(close.iloc[-2]) if len(close) >= 2 else lc
            chg = (lc - pc) / pc * 100
            rows.append({
                'ticker': t, 'name': name,
                'price': round(lc, 2), 'change': round(chg, 2)
            })
            print(f"[OK] {t}: {lc}")
        except Exception as e:
            print(f"[ERROR] {t}: {e}")

    print(f"[OVERVIEW] {len(rows)}/{len(BUMN20)} berhasil")
    return jsonify(rows)

# ── STOCK DATA + INDICATORS ───────────────────────────────────────────────────
@app.route('/api/stock/data')
def stock_data():
    ticker  = request.args.get('ticker', 'BBRI')
    start   = request.args.get('start', str((datetime.today() - timedelta(days=365*3)).date()))
    end     = request.args.get('end',   str(datetime.today().date()))
    ticker_jk = TICKER_MAP.get(ticker, ticker + '.JK')

    df = yf.download(ticker_jk, start=start, end=end, progress=False, auto_adjust=True)
    df.dropna(inplace=True)
    if df.empty:
        return jsonify({'error': 'Data tidak ditemukan'}), 404

    cs = df['Close'].squeeze()

    # Moving averages
    ma20  = cs.rolling(20).mean()
    ma50  = cs.rolling(50).mean()
    ma200 = cs.rolling(200).mean()

    # Bollinger Bands
    bm = cs.rolling(20).mean()
    bs = cs.rolling(20).std()
    bu = bm + 2*bs
    bl = bm - 2*bs

    # RSI
    rsi = calc_rsi(cs)

    # MACD
    e12  = cs.ewm(span=12).mean()
    e26  = cs.ewm(span=26).mean()
    macd = e12 - e26
    sig  = macd.ewm(span=9).mean()
    hist = macd - sig

    dates = df.index.strftime('%Y-%m-%d').tolist()

    def s(series):
        return [None if pd.isna(v) else round(float(v), 4) for v in series]

    return jsonify({
        'dates':  dates,
        'open':   s(df['Open'].squeeze()),
        'high':   s(df['High'].squeeze()),
        'low':    s(df['Low'].squeeze()),
        'close':  s(cs),
        'volume': s(df['Volume'].squeeze()),
        'ma20':   s(ma20),
        'ma50':   s(ma50),
        'ma200':  s(ma200),
        'bb_upper': s(bu),
        'bb_mid':   s(bm),
        'bb_lower': s(bl),
        'rsi':    s(rsi),
        'macd':   s(macd),
        'signal': s(sig),
        'macd_hist': s(hist),
        'ticker': ticker,
        'name':   BUMN20.get(ticker, ticker),
        'total_rows': len(df),
    })


# ── LSTM TRAIN + PREDICT ──────────────────────────────────────────────────────
@app.route('/api/lstm/train', methods=['POST'])
def lstm_train():
    body        = request.json or {}
    ticker      = body.get('ticker', 'BBRI')
    start       = body.get('start', str((datetime.today() - timedelta(days=365*3)).date()))
    end         = body.get('end',   str(datetime.today().date()))
    lookback    = int(body.get('lookback', 60))
    epochs      = int(body.get('epochs', 30))
    batch_size  = int(body.get('batch_size', 32))
    future_days = int(body.get('future_days', 30))
    test_pct    = int(body.get('test_pct', 20))

    ticker_jk = TICKER_MAP.get(ticker, ticker + '.JK')
    df = yf.download(ticker_jk, start=start, end=end, progress=False, auto_adjust=True)
    df.dropna(inplace=True)
    if df.empty:
        return jsonify({'error': 'Data tidak ditemukan'}), 404

    ca     = df['Close'].squeeze().values.reshape(-1, 1)
    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(ca)
    split  = int(len(scaled) * (1 - test_pct / 100))

    Xtr, ytr = make_sequences(scaled[:split], lookback)
    Xte, yte = make_sequences(scaled[split - lookback:], lookback)

    if len(Xtr) == 0 or len(Xte) == 0:
        return jsonify({'error': 'Data terlalu sedikit'}), 400

    Xtr = Xtr.reshape(-1, lookback, 1)
    Xte = Xte.reshape(-1, lookback, 1)

    model = build_bilstm(lookback)
    train_losses, val_losses = [], []

    for ep in range(epochs):
        h = model.fit(Xtr, ytr, epochs=1, batch_size=batch_size,
                      validation_data=(Xte, yte), verbose=0)
        train_losses.append(float(h.history['loss'][0]))
        val_losses.append(float(h.history['val_loss'][0]))

    # Metrics
    pt  = scaler.inverse_transform(model.predict(Xte, verbose=0))
    ac  = scaler.inverse_transform(yte.reshape(-1, 1))
    mae  = float(mean_absolute_error(ac, pt))
    rmse = float(np.sqrt(mean_squared_error(ac, pt)))
    r2   = float(r2_score(ac, pt))
    mape = float(np.mean(np.abs((ac - pt) / ac)) * 100)

    # Test period actual vs predicted
    test_dates = df.index[split:split + len(pt)].strftime('%Y-%m-%d').tolist()

    # Future prediction
    lseq = scaler.transform(ca)[-lookback:].reshape(1, lookback, 1)
    preds, cur = [], lseq.copy()
    for _ in range(future_days):
        p = model.predict(cur, verbose=0)[0, 0]
        preds.append(p)
        cur = np.append(cur[:, 1:, :], [[[p]]], axis=1)

    pp      = scaler.inverse_transform(np.array(preds).reshape(-1, 1)).flatten()
    last_dt = df.index[-1]
    fi      = pd.bdate_range(start=last_dt + timedelta(days=1), periods=future_days)

    future_rows = []
    prev = float(ca[-1][0])
    for i, (d, price) in enumerate(zip(fi, pp)):
        chg = (float(price) - prev) / prev * 100
        future_rows.append({
            'date':   d.strftime('%Y-%m-%d'),
            'price':  round(float(price), 2),
            'change': round(chg, 2),
        })
        prev = float(price)

    return jsonify({
        'train_loss':  train_losses,
        'val_loss':    val_losses,
        'metrics':     {'mae': round(mae,2), 'rmse': round(rmse,2), 'r2': round(r2,4), 'mape': round(mape,2)},
        'test_dates':  test_dates,
        'test_actual': [round(float(v),2) for v in ac.flatten()],
        'test_pred':   [round(float(v),2) for v in pt.flatten()],
        'history_dates': df.index[-120:].strftime('%Y-%m-%d').tolist(),
        'history_close': [round(float(v),2) for v in ca[-120:].flatten()],
        'future':      future_rows,
        'last_price':  round(float(ca[-1][0]),2),
        'final_price': round(float(pp[-1]),2),
    })


# ── MARKOWITZ ─────────────────────────────────────────────────────────────────
@app.route('/api/markowitz/optimize', methods=['POST'])
def markowitz_optimize():
    body           = request.json or {}
    tickers        = body.get('tickers', ['BBRI','BMRI','TLKM','ANTM','PTBA'])
    start          = body.get('start', str((datetime.today() - timedelta(days=365*3)).date()))
    end            = body.get('end',   str(datetime.today().date()))
    n_simulations  = int(body.get('n_simulations', 3000))
    risk_free_rate = float(body.get('risk_free_rate', 0.06))
    modal          = float(body.get('modal', 100_000_000))

    ticker_jk = [TICKER_MAP[t] for t in tickers]
    raw = yf.download(ticker_jk, start=start, end=end, progress=False, auto_adjust=True)
    close = raw['Close'] if isinstance(raw.columns, pd.MultiIndex) else raw[['Close']]
    close.columns = tickers
    close.dropna(inplace=True)

    if close.empty or len(close) < 60:
        return jsonify({'error': 'Data tidak cukup'}), 400

    ret = close.pct_change().dropna()
    mr  = ret.mean() * 252
    cov = ret.cov() * 252
    na  = len(tickers)

    # Normalized prices
    norm = (close / close.iloc[0] * 100).round(4)
    norm_dates = close.index.strftime('%Y-%m-%d').tolist()

    # Annual return & volatility per stock
    annual_ret = (mr * 100).round(2).to_dict()
    annual_vol = {t: round(float(np.sqrt(cov.loc[t,t]))*100, 2) for t in tickers}
    corr = ret.corr().round(4).to_dict()

    # Monte Carlo simulation
    sr, sv, ss, sw = [], [], [], []
    for _ in range(n_simulations):
        w = np.random.dirichlet(np.ones(na))
        r = float(np.dot(w, mr))
        v = float(np.sqrt(w @ cov.values @ w))
        sr.append(round(r*100, 3))
        sv.append(round(v*100, 3))
        ss.append(round((r - risk_free_rate)/v if v>0 else 0, 4))
        sw.append(w.tolist())

    # Optimization
    bds = tuple((0.01, 1.0) for _ in range(na))
    con = [{'type':'eq','fun': lambda w: np.sum(w)-1}]
    w0  = np.ones(na)/na

    def ps(w):
        r = float(np.dot(w, mr))
        v = float(np.sqrt(w @ cov.values @ w))
        return r, v

    def ns(w): r,v=ps(w); return -(r-risk_free_rate)/v if v>0 else 0
    def pv(w): return ps(w)[1]
    def nr(w): return -ps(w)[0]

    rs = minimize(ns, w0, method='SLSQP', bounds=bds, constraints=con)
    rv = minimize(pv, w0, method='SLSQP', bounds=bds, constraints=con)
    rr = minimize(nr, w0, method='SLSQP', bounds=bds, constraints=con)

    last_prices = {t: round(float(close[t].iloc[-1]), 2) for t in tickers}

    def build_allocation(weights, label):
        r, v = ps(weights)
        sh = (r - risk_free_rate) / v if v > 0 else 0
        rows = []
        for t, w in zip(tickers, weights):
            alloc = modal * w
            h     = last_prices[t]
            lot   = int(alloc / (h * 100))
            real  = lot * h * 100
            rows.append({
                'ticker': t, 'name': BUMN20[t],
                'weight': round(w*100, 2),
                'alloc':  round(alloc, 0),
                'price':  h,
                'lot':    lot,
                'real':   real,
            })
        return {
            'label': label,
            'weights': {t: round(float(w)*100,2) for t,w in zip(tickers, weights)},
            'return': round(r*100, 2),
            'volatility': round(v*100, 2),
            'sharpe': round(sh, 3),
            'allocation': rows,
        }

    return jsonify({
        'tickers': tickers,
        'norm_dates': norm_dates,
        'norm_prices': {t: norm[t].tolist() for t in tickers},
        'annual_return': annual_ret,
        'annual_vol': annual_vol,
        'correlation': corr,
        'frontier': {'ret': sr, 'vol': sv, 'sharpe': ss},
        'portfolios': {
            'max_sharpe': build_allocation(rs.x, '🌟 Max Sharpe Ratio'),
            'min_vol':    build_allocation(rv.x, '🛡️ Min Volatilitas'),
            'max_ret':    build_allocation(rr.x, '🚀 Max Return'),
        },
        'last_prices': last_prices,
        'total_rows': len(close),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
