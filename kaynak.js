'use strict';
/* SATÜRN 26 — ORTAK VERİ KATMANI (canlı ağda tek tek denendi, 25.11.2026):
 *  • TradingView tarayıcı (scanner.tradingview.com): BIST hisse/endeks, ABD hisse, DAX/Nikkei/FTSE, petrol, gümüş, bakır — CORS açık, anahtarsız, anlık.
 *  • r.jina.ai geçidi: tarayıcının doğrudan okuyamadığı (CORS) Yahoo grafik verisi ve RSS akışları ham hâliyle gelir.
 *  Ölü bulunanlar kaldırıldı: allorigins, codetabs, corsproxy (hepsi zaman aşımı), Yahoo doğrudan ve Stooq doğrudan (CORS), GDELT (yanıt yok). */
(() => {
  const TV = 'https://scanner.tradingview.com/';
  const COLS = ['name', 'description', 'close', 'change', 'currency'];
  // Yahoo sembolü → TradingView sembolü
  const MAP = {
    'XU100.IS': 'BIST:XU100', 'XU030.IS': 'BIST:XU030', '^GSPC': 'SP:SPX', '^IXIC': 'NASDAQ:IXIC', '^DJI': 'DJ:DJI', '^GDAXI': 'XETR:DAX',
    '^FTSE': 'TVC:UKX', '^N225': 'TVC:NI225', 'BZ=F': 'ICEEUR:BRN1!', 'CL=F': 'NYMEX:CL1!', 'NG=F': 'NYMEX:NG1!', 'HG=F': 'COMEX:HG1!',
    'SI=F': 'COMEX:SI1!', 'GC=F': 'COMEX:GC1!', 'DX-Y.NYB': 'TVC:DXY', '^VIX': 'CBOE:VIX'
  };
  const LABEL = { 'XU100.IS': 'BIST 100', 'XU030.IS': 'BIST 30', '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow Jones', '^GDAXI': 'DAX', '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', 'BZ=F': 'Brent petrol', 'CL=F': 'WTI petrol', 'NG=F': 'Doğalgaz', 'HG=F': 'Bakır', 'SI=F': 'Gümüş', 'GC=F': 'Altın (ons, vadeli)', 'DX-Y.NYB': 'Dolar endeksi', '^VIX': 'VIX korku endeksi' };
  const scan = async (market, body, ms = 9000) => {
    const r = await withTimeout(fetch(TV + market + '/scan', { method: 'POST', body: JSON.stringify({ ...body, columns: COLS }) }), ms, 'TradingView zaman aşımı');
    if (!r.ok) throw Error('TradingView HTTP ' + r.status);
    return (await r.json()).data || [];
  };
  const row = (ysym, d) => ({ sym: ysym, name: LABEL[ysym] || d[1] || d[0], price: +d[2], ch: d[3] == null ? null : +d[3], cur: d[4] || (/\.IS$/.test(ysym) ? 'TRY' : ''), src: 'TradingView' });
  /** Yahoo sembol listesi → Map(sembol → fiyat kaydı). Bulunamayanlar haritada yoktur. */
  async function tv(list) {
    const out = new Map();
    const fixed = [], us = [];
    for (const s of list) {
      if (MAP[s]) fixed.push([s, MAP[s]]);
      else if (/^[A-Z0-9]+\.IS$/.test(s)) fixed.push([s, 'BIST:' + s.replace(/\.IS$/, '')]);
      else if (/^[A-Z][A-Z0-9]{0,5}(?:-[A-Z])?$/.test(s)) us.push(s);
    }
    const jobs = [];
    if (fixed.length) jobs.push(scan('global', { symbols: { tickers: fixed.map(x => x[1]) } }).then(rows => { for (const x of rows) { const f = fixed.find(y => y[1] === x.s); if (f && x.d?.[2] != null) out.set(f[0], row(f[0], x.d)); } }));
    if (us.length) jobs.push(scan('america', { filter: [{ left: 'name', operation: 'in_range', right: us.map(s => s.replace('-', '.')) }] }).then(rows => { for (const x of rows) { const s = us.find(y => y.replace('-', '.') === x.d?.[0]); if (s && !out.has(s) && x.d?.[2] != null) out.set(s, row(s, x.d)); } }));
    await Promise.allSettled(jobs);
    return out;
  }
  /** r.jina.ai: sayfayı ham metin olarak getirir (CORS engelini aşar). */
  async function jina(url, ms = 15000) {
    const r = await withTimeout(fetch('https://r.jina.ai/' + url, { headers: { 'X-Return-Format': 'text' } }), ms, 'geçit zaman aşımı');
    if (!r.ok) throw Error('geçit HTTP ' + r.status);
    const t = await r.text();
    if (/AbuseAlleviationError|"code":\s*4\d\d/.test(t.slice(0, 200))) throw Error('geçit bu siteyi şu an engelledi');
    return t;
  }
  const jinaJ = async (url, ms) => JSON.parse(await jina(url, ms));
  window.jarvisSrc = { tv, jina, jinaJ, TV_MAP: MAP };
})();
