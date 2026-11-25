'use strict';
/* SATÜRN 22 — HAFTALIK NİCEL SEÇİM + KESİNTİSİZ CANLI FİYAT
 *  • Evren: Binance'te hacmi en yüksek ~45 kripto (stabil/kaldıraçlı hariç), gram altın (PAXG × USDT/TRY),
 *           BIST 30, ABD büyükleri ve Beyhan'ın eklediği HER BORSADAN sembol (Yahoo biçimi: SAP.DE, 7203.T, SHEL.L…)
 *  • Her varlık için 9 sayısal parametre: 7/30/90 günlük getiri, oynaklık, riske göre düzeltilmiş momentum, trend (3 katman),
 *    RSI, hacim ivmesi, zirveye uzaklık. Kesitsel z-puanı → bileşik skor.
 *  • Ekonomik/piyasa parametreleri: piyasa genişliği (rejim), Korku-Açgözlülük, BTC hakimiyeti, fonlama oranları (kalabalık pozisyon),
 *    VIX, dolar endeksi, ABD 10 yıllık faiz, S&P 500 ve BIST 100 eğilimi; isteğe bağlı güncel haber/makro takvim notu (kaynaklı).
 *  • GERİ TEST: 4 model geçmiş ~40 hafta üzerinde haftalık olarak denenir, en iyisi seçilir. Olasılıklar UYDURULMAZ;
 *    aynı rejimde, aynı skor dilimindeki geçmiş adayların gerçekleşen oranından ölçülür (küçük örneklem büzülmesiyle).
 *  • Gerçek sicil: her haftanın seçimi kaydedilir, 7 gün sonra kendiliğinden sonuçlanır (isabet, getiri, Brier).
 *  • Canlı akış: Binance WebSocket (kotasız), kopunca üstel bekleme ile yeniden bağlanır, 45 sn sessizlikte bekçi yeniden açar.
 *  Bilgi amaçlıdır; “kesin al/sat” demez, garanti vermez, karar Beyhan'ındır. */
(() => {
  const BN = 'https://data-api.binance.vision/api/v3/';
  const WS = ['wss://data-stream.binance.vision/stream?streams=', 'wss://stream.binance.com:9443/stream?streams='];
  const DAY = 86400000;
  const NOTE = 'Bilgi amaçlıdır, yatırım tavsiyesi değildir. Olasılıklar geçmiş veriden ölçülür; gelecek garanti edilmez.';
  const STABLE = /^(USDC|FDUSD|TUSD|BUSD|DAI|USDP|USDD|PYUSD|USD1|EUR|EURI|AEUR|XUSD|USDE|BFUSD|RLUSD|PAXG|XAUT|WBTC|WBETH|BETH|STETH|TRY|BRL|GBP)$/;
  const BIST30 = 'THYAO ASELS GARAN AKBNK BIMAS EREGL KCHOL SAHOL SISE TUPRS YKBNK ISCTR FROTO TOASO PGSUS KOZAL SASA HEKTS PETKM TCELL TTKOM ARCLK ENKAI EKGYO KRDMD VESTL ALARK ASTOR GUBRF MGROS'.split(' ').map(s => s + '.IS');
  const US = 'AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO AMD NFLX JPM V MA LLY COST WMT XOM UNH ORCL CRM PLTR'.split(' ');
  const MACRO = [['^VIX', 'VIX korku endeksi'], ['DX-Y.NYB', 'Dolar endeksi (DXY)'], ['^TNX', 'ABD 10 yıllık faiz'], ['^GSPC', 'S&P 500'], ['XU100.IS', 'BIST 100']];
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const pf = v => (v >= 0 ? '+' : '') + nf(v * 100, 1) + '%';
  const px = v => nf(v, v < 1 ? 5 : v < 100 ? 3 : 2);
  const getJ = async (url, ms = 12000) => { const r = await withTimeout(fetch(url), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const std = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } }));
    return out;
  }
  const isoWeek = (t = Date.now()) => { const d = new Date(t + 3 * 3600000); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = d.getUTCFullYear(); return y + '-H' + String(Math.ceil(((d - Date.UTC(y, 0, 1)) / DAY + 1) / 7)).padStart(2, '0'); };

  /* ---------- sayısal parametreler ---------- */
  const LOOK = 100;
  function rsiAt(c, e, p = 14) {
    const s = Math.max(1, e - 70); let g = 0, l = 0;
    for (let i = s; i < s + p; i++) { const d = c[i] - c[i - 1]; d > 0 ? g += d : l -= d; }
    g /= p; l /= p;
    for (let i = s + p; i <= e; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function feat(S, e) {
    const c = S.c; if (e < LOOK || e >= c.length) return null;
    const sm = (n, end = e) => mean(c.slice(end - n + 1, end + 1));
    const lr = []; for (let i = e - 29; i <= e; i++) lr.push(Math.log(c[i] / c[i - 1]));
    const sd = std(lr) || 1e-9;
    const r7 = c[e] / c[e - 7] - 1, r30 = c[e] / c[e - 30] - 1, r90 = c[e] / c[e - 90] - 1;
    const s20 = sm(20), s50 = sm(50), s50p = sm(50, e - 10);
    const rsi = rsiAt(c, e);
    const v = S.v; // son (yarım) gün hariç hacim ivmesi
    const volR = v ? Math.log((mean(v.slice(e - 7, e)) + 1) / (mean(v.slice(e - 30, e)) + 1)) : 0;
    const dd = c[e] / Math.max(...c.slice(e - 89, e + 1)) - 1;
    let atr = null;
    if (S.h && S.l) { const tr = []; for (let i = e - 13; i <= e; i++) tr.push(Math.max(S.h[i] - S.l[i], Math.abs(S.h[i] - c[i - 1]), Math.abs(S.l[i] - c[i - 1]))); atr = mean(tr); }
    return { r7, r30, r90, sd, ram: r30 / (sd * Math.sqrt(30)), trend: (c[e] > s20) + (s20 > s50) + (s50 > s50p), rsi, rsiS: -Math.abs(rsi - 60) / 20 - (rsi > 78 ? 1 : 0), volR, dd, low: -sd, above50: c[e] > s50, atr, last: c[e] };
  }
  const PRESETS = {
    dengeli: { r30: .2, r90: .15, ram: .25, trend: .15, rsiS: .1, volR: .1, dd: .05 },
    momentum: { r7: .1, r30: .3, r90: .3, ram: .2, volR: .1 },
    trend: { trend: .35, ram: .25, dd: .2, rsiS: .1, volR: .1 },
    sakin: { low: .35, ram: .3, trend: .2, rsiS: .15 }
  };
  const PNAME = { dengeli: 'dengeli', momentum: 'momentum', trend: 'trend takibi', sakin: 'düşük oynaklık' };
  function scoreAll(fs, W) {
    const keys = Object.keys(W), z = {};
    for (const k of keys) { const vals = fs.map(f => f[k]); const m = mean(vals), s = std(vals) || 1; z[k] = vals.map(v => Math.max(-3, Math.min(3, (v - m) / s))); }
    return fs.map((_, i) => keys.reduce((a, k) => a + W[k] * z[k][i], 0));
  }
  const shrink = (h, n) => (h + 4) / (n + 8); // küçük örneklemde %50'ye doğru büzülme
  const bucketOf = pr => pr >= 0.9 ? 0 : pr >= 0.75 ? 1 : pr >= 0.5 ? 2 : 3;

  // Geri test: her H adımda (hafta) tüm havuzu skorla, ilk 3'ün ve tüm skor dilimlerinin gerçekleşen getirisini topla
  function backtest(P, H) {
    const L = Math.max(...P.map(a => a.c.length)), weeks = [];
    for (let d = H; d <= L - LOOK - 1; d += H) {
      const live = P.map(a => { const e = a.c.length - 1 - d; const f = feat(a, e); return f && { f, fwd: a.c[e + H] / a.c[e] - 1 }; }).filter(Boolean);
      if (live.length >= 6) weeks.push({ d, live, reg: mean(live.map(x => +x.f.above50)) >= 0.5 ? 1 : 0, med: median(live.map(x => x.fwd)) });
    }
    const res = {};
    for (const [name, W] of Object.entries(PRESETS)) {
      const rows = [], top = [];
      for (const w of weeks) {
        const sc = scoreAll(w.live.map(x => x.f), W);
        const ord = sc.map((_, i) => i).sort((i, j) => sc[j] - sc[i]);
        ord.forEach((i, r) => rows.push({ b: bucketOf(1 - r / Math.max(1, ord.length - 1)), up: w.live[i].fwd > 0, beat: w.live[i].fwd > w.med, reg: w.reg }));
        for (const i of ord.slice(0, 3)) top.push({ fwd: w.live[i].fwd, ex: w.live[i].fwd - w.med });
      }
      res[name] = { rows, top, n: weeks.length, hit: top.length ? top.filter(x => x.fwd > 0).length / top.length : 0, avg: mean(top.map(x => x.fwd)), ex: mean(top.map(x => x.ex)) };
    }
    const best = Object.entries(res).filter(([, r]) => r.top.length >= 15).sort((a, b) => (b[1].ex - a[1].ex) || (b[1].hit - a[1].hit))[0]?.[0] || 'dengeli';
    return { res, best, weeks: weeks.length, univ: mean(weeks.map(w => mean(w.live.map(x => x.fwd)))) };
  }
  function calib(rows, b, reg) {
    let r = rows.filter(x => x.b === b && x.reg === reg), same = true;
    if (r.length < 15) { r = rows.filter(x => x.b === b); same = false; }
    return { up: shrink(r.filter(x => x.up).length, r.length), beat: shrink(r.filter(x => x.beat).length, r.length), n: r.length, same };
  }
  // bir havuzu uçtan uca değerlendir
  function evaluate(P, H, k = 3) {
    P = P.filter(a => a && a.c.length > LOOK + 2);
    if (P.length < 6) return null;
    const bt = backtest(P, H), W = PRESETS[bt.best];
    const now = P.map(a => ({ a, f: feat(a, a.c.length - 1) })).filter(x => x.f);
    const reg = mean(now.map(x => +x.f.above50)) >= 0.5 ? 1 : 0;
    const sc = scoreAll(now.map(x => x.f), W);
    const ord = sc.map((_, i) => i).sort((i, j) => sc[j] - sc[i]);
    const picks = ord.slice(0, k).map((i, r) => {
      const { a, f } = now[i], pr = 1 - r / Math.max(1, ord.length - 1), cb = calib(bt.res[bt.best].rows, bucketOf(pr), reg);
      const days = H === 7 ? 7 : 7; // takvim günü
      const span = f.sd * Math.sqrt(H);
      return { sym: a.sym, name: a.name || a.sym, score: sc[i], f, prob: cb.up, beat: cb.beat, n: cb.n, sameReg: cb.same, lo: f.last * Math.exp(-span), hi: f.last * Math.exp(span), risk: f.atr ? f.last - 2 * f.atr : f.last * Math.exp(-2 * span), days };
    });
    const st = bt.res[bt.best];
    return { picks, reg, breadth: mean(now.map(x => +x.f.above50)), model: bt.best, bt: { weeks: bt.weeks, hit: st.hit, avg: st.avg, ex: st.ex, univ: bt.univ, all: Object.fromEntries(Object.entries(bt.res).map(([n, r]) => [n, { hit: r.hit, ex: r.ex }])) }, size: now.length };
  }
  const why = f => [`30g ${pf(f.r30)}`, `90g ${pf(f.r90)}`, `trend ${f.trend}/3`, `RSI ${nf(f.rsi, 0)}`, `hacim ${nf(Math.exp(f.volR), 1)}×`, f.dd > -0.05 ? 'zirveye yakın' : `zirveden ${pf(f.dd)}`, `günlük oynaklık %${nf(f.sd * 100, 1)}`].join(' · ');

  /* ---------- veri kaynakları ---------- */
  const kl = (sym, n = 400) => getJ(`${BN}klines?symbol=${sym}&interval=1d&limit=${n}`, 15000).then(k => ({ c: k.map(x => +x[4]), h: k.map(x => +x[2]), l: k.map(x => +x[3]), v: k.map(x => +x[7]) }));
  async function cryptoPool(n = 45) {
    const all = await getJ(BN + 'ticker/24hr', 20000);
    const list = all.filter(x => /USDT$/.test(x.symbol)).map(x => ({ s: x.symbol, base: x.symbol.slice(0, -4), vol: +x.quoteVolume }))
      .filter(x => x.vol >= 1e7 && !STABLE.test(x.base) && !/(UP|DOWN|BULL|BEAR)$/.test(x.base)).sort((a, b) => b.vol - a.vol).slice(0, n);
    const got = await pool(list, 6, async x => ({ sym: x.base, pair: x.s, ...(await kl(x.s)) }));
    return got.filter(Boolean);
  }
  async function goldSeries() {
    const [g, t] = await Promise.all([kl('PAXGUSDT'), kl('USDTTRY')]);
    const n = Math.min(g.c.length, t.c.length), G = a => a.slice(-n), T = t.c.slice(-n);
    return { sym: 'GRAM ALTIN', c: G(g.c).map((v, i) => v / 31.1034768 * T[i]), h: G(g.h).map((v, i) => v / 31.1034768 * T[i]), l: G(g.l).map((v, i) => v / 31.1034768 * T[i]), v: null };
  }
  // Yahoo (her borsa): bilgisayar yardımcısı → doğrudan → açık vekil geçitler (en başarılı olan öne alınır)
  const GATES = [['jina', u => 'https://r.jina.ai/' + u, { headers: { 'X-Return-Format': 'text' } }], ['doğrudan', u => u]]; // allorigins/codetabs öldü (25.11.2026 testi)
  const bump = (i, d) => { const r = store.get('pkGate', {}); const k = GATES[i][0]; r[k] = Math.max(-5, Math.min(20, (r[k] || 0) + d)); store.set('pkGate', r); };
  // devre kesici: bir taramada Yahoo'ya hiçbir yoldan ulaşılamıyorsa kalan sembolleri dakikalarca bekletme
  const yh = { ok: 0, dead: 0 };
  async function proxied(url, ms = 9000) {
    if (window.jarvisBridge?.on()) { try { const j = await getJ(window.jarvisBridge.wrap(url), 15000); if (!j?.error) { yh.ok++; return j; } } catch {} }
    if (typeof pcLocal !== 'undefined' && pcLocal) { try { return JSON.parse((await pcCall('web_al', [url], false)).text); } catch {} }
    if (yh.dead >= 2 && !yh.ok) throw Error('hisse kaynağına şu an ulaşılamıyor');
    try { const j = await proxiedRaw(url, ms); yh.ok++; return j; } catch (e) { yh.dead++; throw e; }
  }
  async function proxiedRaw(url, ms) {
    const r = store.get('pkGate', {}), fails = [];
    for (const i of [...GATES.keys()].sort((a, b) => (r[GATES[b][0]] || 0) - (r[GATES[a][0]] || 0))) {
      try { const res = await withTimeout(fetch(GATES[i][1](url), GATES[i][2]), GATES[i][0] === 'doğrudan' ? 5000 : ms + 4000, 'zaman aşımı'); if (!res.ok) throw Error(); const j = await res.json(); bump(i, 1); fails.forEach(f => bump(f, -1)); return j; } catch { fails.push(i); }
    }
    throw Error('ulaşılamadı');
  }
  // Stooq yedeği (CSV, Yahoo'ya ulaşılamazsa): ABD, Almanya, Londra, Tokyo, Hong Kong…
  const STQ = { '': '.us', DE: '.de', L: '.uk', T: '.jp', HK: '.hk', PA: '.fr', AS: '.nl', SW: '.ch', MI: '.it', MC: '.es' };
  async function stooqSeries(sym) {
    const m = sym.match(/^([A-Z0-9\-]+)(?:\.([A-Z]+))?$/); if (!m || STQ[m[2] || ''] == null) throw Error('stooq yok');
    const u = `https://stooq.com/q/d/l/?s=${m[1].toLowerCase()}${STQ[m[2] || '']}&i=d`;
    let t = '';
    if (window.jarvisBridge?.on()) { try { t = await (await withTimeout(fetch(window.jarvisBridge.wrap(u)), 15000, 'zaman aşımı')).text(); } catch {} }
    if (!/^Date,/i.test(t) && typeof pcLocal !== 'undefined' && pcLocal) { try { t = (await pcCall('web_al', [u], false)).text; } catch {} }
    if (!/^Date,/i.test(t)) throw Error('stooq okunamadı');
    const rows = t.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(r => +r[4] > 0).slice(-260);
    if (rows.length < 30) throw Error('stooq kısa');
    return { sym, name: sym, cur: '', c: rows.map(r => +r[4]), h: rows.map(r => +r[2]), l: rows.map(r => +r[3]), v: rows.map(r => +r[5] || 0), price: +rows.at(-1)[4] };
  }
  async function yahooSeries(sym, range = '1y') {
    try { return await yahooOnly(sym, range); } catch (e) { if (range !== '1y') throw e; try { return await stooqSeries(sym); } catch { throw e; } }
  }
  async function yahooOnly(sym, range) {
    const j = await proxied(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`);
    const R = j.chart?.result?.[0], q = R?.indicators?.quote?.[0]; if (!q?.close) throw Error('veri yok');
    const idx = q.close.map((v, i) => i).filter(i => q.close[i] > 0);
    return { sym, name: R.meta?.shortName || sym, cur: R.meta?.currency || '', c: idx.map(i => q.close[i]), h: idx.map(i => q.high?.[i] || q.close[i]), l: idx.map(i => q.low?.[i] || q.close[i]), v: idx.map(i => q.volume?.[i] || 0), price: R.meta?.regularMarketPrice };
  }
  const extraSyms = () => String(store.get('set.picksExtra', '') || '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9.^=\-]{1,15}$/.test(s)).slice(0, 40);
  async function macro() {
    const out = {};
    const [fng, glob, fund] = await Promise.all([
      getJ('https://api.alternative.me/fng/?limit=8', 8000).catch(() => null),
      getJ('https://api.coingecko.com/api/v3/global', 8000).catch(() => null),
      getJ('https://fapi.binance.com/fapi/v1/premiumIndex', 9000).catch(() => null)
    ]);
    if (fng?.data?.length) out.fng = { v: +fng.data[0].value, label: fng.data[0].value_classification, prev: +fng.data.at(-1).value };
    if (glob?.data) out.dom = glob.data.market_cap_percentage?.btc, out.capCh = glob.data.market_cap_change_percentage_24h_usd;
    if (Array.isArray(fund)) out.funding = Object.fromEntries(fund.filter(x => /USDT$/.test(x.symbol)).map(x => [x.symbol.slice(0, -4), +x.lastFundingRate]));
    const m = await pool(MACRO, 3, async ([s, n]) => { const y = await yahooSeries(s, '3mo'); const c = y.c; return { s, n, last: c.at(-1), ch20: c.length > 21 ? c.at(-1) / c.at(-21) - 1 : null }; });
    out.macro = m.filter(Boolean);
    return out;
  }
  function macroText(M, btc) {
    const L = [];
    if (btc) L.push(`BTC ${btc.f.above50 ? '50 günlük ortalamanın ÜSTÜNDE' : '50 günlük ortalamanın ALTINDA'} (30g ${pf(btc.f.r30)})`);
    if (M.fng) L.push(`Korku-Açgözlülük ${M.fng.v} (${M.fng.label}; 7 gün önce ${M.fng.prev})`);
    if (M.dom) L.push(`BTC hakimiyeti %${nf(M.dom, 1)}`);
    if (M.capCh != null) L.push(`toplam kripto değeri 24s ${pf(M.capCh / 100)}`);
    for (const x of M.macro || []) L.push(`${x.n} ${nf(x.last, 2)}${x.ch20 != null ? ` (20 gün ${pf(x.ch20)})` : ''}`);
    return L.join(' · ');
  }

  /* ---------- haftalık seçim ---------- */
  let busy = null;
  async function run({ kinds = ['kripto', 'altin', 'bist', 'abd', 'diger'], ai = opt('picksAI') !== '0' } = {}) {
    if (busy) return busy;
    if (window.jarvisUltra?.guest?.()) throw Error('Misafir modunda kapalı.');
    busy = (async () => {
      yh.ok = 0; yh.dead = 0;
      const R = { t: Date.now(), wk: isoWeek(), kinds, thr: Math.max(50, Math.min(95, +(store.get('set.picksMin', '80')) || 80)) / 100 };
      setPhase('thinking', 'Kripto evrenini indiriyorum (hacmi en yüksek 45 varlık, 400 günlük mum)…');
      const jobs = {};
      if (kinds.includes('kripto')) jobs.kripto = cryptoPool().catch(e => ({ err: e.message }));
      if (kinds.includes('altin')) jobs.altin = goldSeries().catch(e => ({ err: e.message }));
      if (kinds.includes('bist')) jobs.bist = pool(BIST30, 4, s => yahooSeries(s)).catch(() => []);
      if (kinds.includes('abd')) jobs.abd = pool(US, 4, s => yahooSeries(s)).catch(() => []);
      if (kinds.includes('diger') && extraSyms().length) jobs.diger = pool(extraSyms(), 4, s => yahooSeries(s)).catch(() => []);
      jobs.macro = macro().catch(() => ({}));
      const got = Object.fromEntries(await Promise.all(Object.entries(jobs).map(async ([k, p]) => [k, await p])));
      setPhase('thinking', 'Geri test: 4 model × ~40 hafta, olasılık kalibrasyonu…');
      await new Promise(r => setTimeout(r, 20));
      R.macro = got.macro || {};
      if (Array.isArray(got.kripto)) {
        R.kripto = evaluate(got.kripto, 7, 3);
        const btc = got.kripto.find(a => a.sym === 'BTC'); R.btc = btc && { f: feat(btc, btc.c.length - 1) };
        if (R.kripto) for (const p of R.kripto.picks) { const fr = R.macro.funding?.[p.sym]; if (fr != null) p.funding = fr; }
      } else if (got.kripto?.err) R.kriptoErr = got.kripto.err;
      if (got.altin?.c) R.altin = goldView(got.altin);
      for (const k of ['bist', 'abd', 'diger']) if (Array.isArray(got[k])) { const ok = got[k].filter(Boolean); R[k + 'N'] = ok.length; if (ok.length >= 6) R[k] = evaluate(ok, 5, 3); }
      if (ai && window.jarvisWebResearch?.askWeb && (R.kripto || R.bist || R.abd)) {
        setPhase('thinking', 'Güncel haber ve makro takvimi tarıyorum…');
        const tbl = ['kripto', 'bist', 'abd', 'diger'].filter(k => R[k]).map(k => k.toUpperCase() + ': ' + R[k].picks.map(p => `${p.sym} (olasılık %${Math.round(p.prob * 100)}, ${why(p.f)})`).join('; ')).join('\n');
        try {
          const w = await withTimeout(window.jarvisWebResearch.askWeb('Sen nicel bir piyasa analistisin. TÜRKÇE, en çok 140 kelime. 1) Her aday için son 7 günün önemli haberinden tek cümle (yoksa “önemli haber yok”). 2) Bu hafta piyasayı etkileyebilecek takvim: FED/TCMB/ECB kararları, enflasyon/istihdam verisi, token kilit açılımları — tarihleriyle. Verilen olasılık sayılarını DEĞİŞTİRME, yeni sayı uydurma, “al/sat” deme.', tbl, 'quick', true), 45000, 'zaman aşımı');
          if (w?.text) R.news = { text: w.text.trim(), sources: (w.sources || []).slice(0, 6) };
        } catch {}
      }
      saveWeek(R);
      setPhase('idle', 'Hazır.');
      return R;
    })();
    try { return await busy; } finally { busy = null; }
  }
  function goldView(S) {
    const c = S.c, e = c.length - 1, f = feat(S, e); if (!f) return null;
    // kendi geçmişi: aynı trend durumundayken 7 gün sonra yükselme oranı
    let h = 0, n = 0;
    for (let i = LOOK; i < e - 7; i++) { const g = feat(S, i); if (g && g.trend === f.trend) { n++; if (c[i + 7] > c[i]) h++; } }
    const span = f.sd * Math.sqrt(7);
    return { f, prob: shrink(h, n), n, lo: f.last * Math.exp(-span), hi: f.last * Math.exp(span) };
  }

  /* ---------- sicil: seçimleri kaydet, 7 gün sonra sonuçlandır ---------- */
  const hist = () => store.get('pkHist', []);
  function saveWeek(R) {
    const items = [];
    for (const k of ['kripto', 'bist', 'abd', 'diger']) for (const p of R[k]?.picks || []) items.push({ k, sym: p.sym, entry: p.f.last, prob: p.prob });
    if (R.altin) items.push({ k: 'altin', sym: 'GRAM ALTIN', entry: R.altin.f.last, prob: R.altin.prob });
    if (!items.length) return;
    const H = hist().filter(x => x.wk !== R.wk);
    H.push({ wk: R.wk, t: R.t, items });
    store.set('pkHist', H.slice(-60)); store.set('pkLast', slim(R));
    liveSub((R.kripto?.picks || []).map(p => p.sym + 'USDT'));
  }
  const slim = R => JSON.parse(JSON.stringify(R, (k, v) => (k === 'rows' ? undefined : v)));
  async function priceNow(it) {
    if (it.k === 'kripto') { const l = live.prices[it.sym + 'USDT']; if (l && Date.now() - l.t < 120000) return l.p; return +(await getJ(`${BN}ticker/price?symbol=${it.sym}USDT`)).price; }
    if (it.k === 'altin') { const [g, t] = await Promise.all([getJ(BN + 'ticker/price?symbol=PAXGUSDT'), getJ(BN + 'ticker/price?symbol=USDTTRY')]); return +g.price / 31.1034768 * +t.price; }
    const y = await yahooSeries(it.sym, '5d'); return y.price || y.c.at(-1);
  }
  async function resolveDue() {
    const H = hist(); let n = 0;
    for (const w of H) {
      if (w.done || Date.now() - w.t < 7 * DAY) continue;
      for (const it of w.items) if (it.ret == null) { try { const p = await priceNow(it); if (p > 0) { it.ret = p / it.entry - 1; n++; } } catch {} }
      if (w.items.every(it => it.ret != null) || Date.now() - w.t > 14 * DAY) w.done = true;
    }
    if (n) { store.set('pkHist', H); renderPanel(); const r = record(); if (r) note('📊 Geçen haftanın seçimi sonuçlandı — ' + r.split('\n')[0]); }
    return n;
  }
  function record() {
    const all = hist().flatMap(w => w.items).filter(x => x.ret != null); if (!all.length) return '';
    const g = k => all.filter(x => (k === 'hisse' ? /bist|abd|diger/.test(x.k) : x.k === k));
    const line = (lab, a) => a.length ? `${lab}: ${a.filter(x => x.ret > 0).length}/${a.length} yükseldi (%${Math.round(a.filter(x => x.ret > 0).length / a.length * 100)}), ort. ${pf(mean(a.map(x => x.ret)))}` : '';
    const brier = mean(all.map(x => (x.prob - (x.ret > 0 ? 1 : 0)) ** 2));
    return [`GERÇEK SİCİL (${all.length} sonuçlanmış seçim): model ortalama %${Math.round(mean(all.map(x => x.prob)) * 100)} demişti, gerçekleşen %${Math.round(all.filter(x => x.ret > 0).length / all.length * 100)} · Brier ${nf(brier, 3)} (0 = kusursuz, 0,25 = yazı-tura)`,
      line('Kripto', g('kripto')), line('Hisse', g('hisse')), line('Altın', g('altin'))].filter(Boolean).join('\n');
  }

  /* ---------- metin ---------- */
  const KL = { kripto: 'KRİPTO (7 gün)', bist: 'BIST (5 işlem günü)', abd: 'ABD BORSALARI (5 işlem günü)', diger: 'DİĞER BORSALAR (5 işlem günü)' };
  const unitOf = k => k === 'kripto' ? ' $' : k === 'bist' ? ' TL' : '';
  function text(R) {
    const L = [`📊 HAFTANIN NİCEL SEÇİMİ — ${R.wk} (${new Date(R.t).toLocaleDateString('tr-TR')})`];
    const reg = R.kripto ? (R.kripto.reg ? 'RİSK-AÇIK' : 'RİSK-KAPALI') + ` (kriptoların %${Math.round(R.kripto.breadth * 100)}'i 50 günlük ortalamanın üstünde)` : '';
    const mt = macroText(R.macro || {}, R.btc);
    if (reg || mt) L.push('PİYASA REJİMİ: ' + [reg, mt].filter(Boolean).join(' · '));
    let star = 0;
    for (const k of ['kripto', 'bist', 'abd', 'diger']) {
      const E = R[k];
      if (!E) {
        if (k === 'kripto' && R.kinds.includes('kripto')) L.push(`\n${KL[k]}: veri alınamadı${R.kriptoErr ? ' (' + R.kriptoErr + ')' : ''}.`);
        else if (R.kinds.includes(k) && (k !== 'diger' || extraSyms().length)) L.push(`\n${KL[k]}: veri yetersiz (${R[k + 'N'] || 0} sembol okunabildi; hisse verisi için “köprüyü kur” de — telefondan 5 dk, bilgisayar gerekmez).`);
        continue;
      }
      L.push(`\n${KL[k]} — model: ${PNAME[E.model]} · geri test ${E.bt.weeks} hafta: ilk-3 adayların %${Math.round(E.bt.hit * 100)}'i yükseldi, ort. ${pf(E.bt.avg)} (evren ort. ${pf(E.bt.univ)}) · ${E.size} varlık tarandı`);
      E.picks.forEach((p, i) => {
        const s = p.prob >= R.thr; if (s) star++;
        L.push(`${i + 1}. ${s ? '★ ' : ''}${p.sym}${p.name && p.name !== p.sym ? ' (' + short(p.name, 24) + ')' : ''} — ${px(p.f.last)}${unitOf(k)} · yükseliş olasılığı %${Math.round(p.prob * 100)} · ${k === 'kripto' ? "BTC'yi" : 'piyasayı'} geçme %${Math.round(p.beat * 100)} (örneklem ${p.n}${p.sameReg ? ', aynı rejim' : ''})`);
        L.push(`   olası aralık (%68): ${px(p.lo)}–${px(p.hi)} · risk seviyesi ${px(p.risk)}${p.funding != null && p.funding > 0.0003 ? ` · ⚠ fonlama %${nf(p.funding * 100, 3)} (kalabalık uzun pozisyon)` : ''}`);
        L.push(`   neden: ${why(p.f)}`);
      });
    }
    if (R.altin) { const a = R.altin; const s = a.prob >= R.thr; if (s) star++; L.push(`\nGRAM ALTIN (7 gün): ${nf(a.f.last, 0)} TL · ${s ? '★ ' : ''}yükseliş olasılığı %${Math.round(a.prob * 100)} (aynı trend durumundaki ${a.n} gün) · aralık (%68) ${nf(a.lo, 0)}–${nf(a.hi, 0)} TL · ${why(a.f)}`); }
    L.push(`\n%${Math.round(R.thr * 100)} EŞİĞİ: ${star ? star + ' aday eşiği geçti (★).' : 'bu hafta eşiği geçen aday yok — model geçmişte bu kadar yüksek isabet görmediği için uydurmuyor; listedekiler mevcut en iyi adaylar.'}`);
    if (R.news?.text) L.push('\nHABER VE MAKRO TAKVİM:\n' + R.news.text);
    const rec = record(); if (rec) L.push('\n' + rec);
    L.push('\n' + NOTE);
    return L.join('\n');
  }
  const sayOf = R => {
    const parts = [];
    if (R.kripto) parts.push('Kripto adayları: ' + R.kripto.picks.map(p => `${p.sym} yüzde ${Math.round(p.prob * 100)}`).join(', '));
    for (const k of ['bist', 'abd']) if (R[k]) parts.push((k === 'bist' ? 'Borsa İstanbul: ' : 'Amerika: ') + R[k].picks.map(p => p.sym.replace('.IS', '')).join(', '));
    if (R.altin) parts.push(`Gram altın için yükseliş olasılığı yüzde ${Math.round(R.altin.prob * 100)}`);
    return parts.join('. ') + '. Olasılıklar geçmiş veriden ölçüldü, garanti değildir.';
  };
  function show(R) {
    const t = text(R); const n = bubble('ai', t); answerTools?.(n.el, t);
    if (R.news?.sources?.length) addLinks?.(n.el, R.news.sources.map(s => ({ title: s.title || s.uri || s.url, url: s.uri || s.url })).filter(x => /^https?:/.test(x.url || '')));
    const pts = [...(R.kripto?.picks || []), ...(R.bist?.picks || []), ...(R.abd?.picks || [])].map(p => [p.sym.replace('.IS', ''), Math.round(p.prob * 100)]);
    if (R.altin) pts.push(['ALTIN', Math.round(R.altin.prob * 100)]);
    if (pts.length) window.jarvisUltra?.drawChart?.('Haftanın adayları: ölçülen yükseliş olasılığı (%)', pts, 'bar');
    renderPanel();
    return t;
  }

  /* ---------- otomatik: her pazartesi 09:00 sonrası bir kez; sonuçlandırma ---------- */
  async function tick() {
    if (document.hidden || window.jarvisUltra?.guest?.()) return;
    await resolveDue().catch(() => {});
    if (opt('picksAuto') === '0') return;
    const d = new Date(Date.now() + 3 * 3600000);
    if (hist().some(w => w.wk === isoWeek()) || (d.getUTCDay() === 1 && d.getUTCHours() < 9) || store.get('pkTried') === isoWeek() + d.getUTCHours()) return;
    store.set('pkTried', isoWeek() + d.getUTCHours());
    try {
      const R = await run();
      if (!R.kripto && !R.bist && !R.abd) return;
      bubble('me', '📊 Haftalık nicel seçim (otomatik)'); show(R);
      if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(sayOf(R), { title: 'SATÜRN haftanın adayları', tags: 'bar_chart', priority: 3 }).catch(() => {});
    } catch {}
  }
  setTimeout(() => tick().catch(() => {}), 45000);
  setInterval(() => tick().catch(() => {}), 30 * 60000);

  /* ---------- KESİNTİSİZ CANLI FİYAT (Binance WebSocket) ---------- */
  const live = { ws: null, prices: {}, subs: new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PAXGUSDT', 'USDTTRY']), last: 0, tries: 0, gate: 0, state: 'kapalı', fn: new Set() };
  for (const s of store.get('pkLast', null)?.kripto?.picks || []) live.subs.add(s.sym + 'USDT');
  function liveConnect() {
    clearTimeout(live.rt);
    if (window.jarvisUltra?.guest?.() || opt('liveFeed') === '0' || typeof WebSocket === 'undefined') return;
    const old = live.ws; live.ws = null; try { old?.close(); } catch {}
    let ws; try { ws = new WebSocket(WS[live.gate % WS.length] + [...live.subs].map(s => s.toLowerCase() + '@miniTicker').join('/')); } catch { return retry(); }
    live.ws = ws; live.state = 'bağlanıyor'; paintLive();
    ws.onopen = () => { if (live.ws !== ws) return; live.tries = 0; live.state = 'canlı'; live.last = Date.now(); clearInterval(live.poll); live.poll = 0; paintLive(); };
    ws.onmessage = ev => {
      try {
        const d = JSON.parse(ev.data).data; if (!d?.s) return;
        const p = +d.c, o = +d.o; live.prices[d.s] = { p, ch: o ? (p / o - 1) * 100 : 0, t: Date.now(), h: +d.h || 0, l: +d.l || 0, q: +d.q || 0 }; live.last = Date.now();
        for (const f of live.fn) { try { f(d.s, live.prices[d.s]); } catch {} }
        paintLive(d.s);
      } catch {}
    };
    ws.onclose = () => { if (live.ws === ws) { live.ws = null; live.state = 'yeniden bağlanıyor'; paintLive(); retry(); } };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function retry() { clearTimeout(live.rt); live.tries++; if (live.tries % 3 === 0) live.gate++; if (live.tries >= 2) restPoll(); live.rt = setTimeout(liveConnect, Math.min(30000, 1000 * 2 ** Math.min(5, live.tries))); }
  // WebSocket bu ağda/tarayıcıda açılamazsa (25.11.2026: masaüstü tarayıcıda bağlanamadı) fiyatlar 15 sn'de bir REST ile güncellenir
  async function restPollOnce() {
    if (live.ws?.readyState === 1 && Date.now() - live.last < 30000) { clearInterval(live.poll); live.poll = 0; return; }
    if (document.hidden) return;
    try {
      const d = await withTimeout(fetch('https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI&symbols=' + encodeURIComponent(JSON.stringify([...live.subs]))), 10000, 'zaman aşımı').then(r => r.ok ? r.json() : []);
      for (const x of d) { const p = +x.lastPrice, o = +x.openPrice; live.prices[x.symbol] = { p, ch: o ? (p / o - 1) * 100 : 0, t: Date.now(), h: +x.highPrice || 0, l: +x.lowPrice || 0, q: +x.quoteVolume || 0 }; for (const f of live.fn) { try { f(x.symbol, live.prices[x.symbol]); } catch {} } }
      if (d.length) { live.last = Date.now(); live.state = 'yedek akış · 15 sn'; paintLive(); }
    } catch {}
  }
  function restPoll() { if (live.poll) return; restPollOnce(); live.poll = setInterval(restPollOnce, 15000); }
  function liveSub(syms) {
    const add = syms.filter(s => /^[A-Z0-9]{3,20}$/.test(s) && !live.subs.has(s)); if (!add.length) return;
    add.forEach(s => live.subs.add(s));
    if (live.ws?.readyState === 1) { try { live.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: add.map(s => s.toLowerCase() + '@miniTicker'), id: Date.now() % 1e6 })); return; } catch {} }
    if (live.ws) liveConnect();
  }
  // bekçi: 45 sn veri yoksa yeniden bağlan; sekme öne gelince ve internet dönünce kontrol et
  setInterval(() => { if (!document.hidden && live.ws?.readyState === 1 && Date.now() - live.last > 45000) liveConnect(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!live.ws || live.ws.readyState > 1 || Date.now() - live.last > 45000)) liveConnect(); });
  window.addEventListener('online', () => liveConnect());
  setTimeout(liveConnect, 3000);
  // fiyat alarmlarını canlı akışla neredeyse anlık denetle (en çok dakikada bir)
  let lastAlarm = 0;
  live.fn.add(() => { const M = window.jarvisMarkets; if (!M?.alarms?.().length || Date.now() - lastAlarm < 60000) return; lastAlarm = Date.now(); M.checkAlarms().catch(() => {}); });
  window.jarvisTickerExtra = (prev => () => { const b = live.prices.BTCUSDT, g = live.prices.PAXGUSDT, t = live.prices.USDTTRY; return [...(prev?.() || []), b ? `⚡BTC ${nf(b.p, 0)}$ ${b.ch >= 0 ? '▲' : '▼'}${nf(Math.abs(b.ch), 1)}%` : '', g && t ? `⚡ALTIN ${nf(g.p / 31.1034768 * t.p, 0)} TL` : '']; })(window.jarvisTickerExtra);

  /* ---------- panel ---------- */
  const st = document.createElement('style');
  st.textContent = '#pkLive{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}#pkLive .lv{font:12px/1.3 ui-monospace,monospace;padding:4px 8px;border:1px solid rgba(255,255,255,.15);border-radius:8px;transition:background .4s}#pkLive .up{color:#4ade80}#pkLive .dn{color:#f87171}#pkLive .fl{background:rgba(250,204,21,.18)}#pkBody{white-space:pre-wrap;font-size:13px;line-height:1.45;max-width:100%;overflow-wrap:anywhere}#pkSet{display:grid;grid-template-columns:1fr;gap:6px}#pkSet input,#pkSet select{width:100%;box-sizing:border-box}';
  document.head.append(st);
  const liveBox = el('div', { id: 'pkLive', 'aria-live': 'off' }), liveState = el('small', { id: 'pkLiveState', class: 'muted' }, 'canlı akış: kapalı');
  const pkBody = el('div', { id: 'pkBody', class: 'muted' }, 'Henüz seçim yok. Her pazartesi kendiliğinden hesaplanır ya da düğmeye dokun.');
  const recBox = el('small', { id: 'pkRec', class: 'muted' });
  const inThr = el('input', { id: 'picksMin', inputmode: 'numeric', placeholder: '80' }); inThr.value = store.get('set.picksMin', '80'); inThr.onchange = () => store.set('set.picksMin', String(Math.max(50, Math.min(95, +inThr.value || 80))));
  const inExtra = el('input', { id: 'picksExtra', placeholder: 'Diğer borsalar (Yahoo kodu): SAP.DE, 7203.T, SHEL.L, 0700.HK' }); inExtra.value = store.get('set.picksExtra', ''); inExtra.onchange = () => store.set('set.picksExtra', inExtra.value);
  const sel = (id, a, b, def) => { const s = el('select', { id }); s.append(new Option(a, '1'), new Option(b, '0')); s.value = store.get('set.' + id, def); s.onchange = () => { store.set('set.' + id, s.value); if (id === 'liveFeed') s.value === '1' ? liveConnect() : (live.ws?.close(), live.ws = null, live.state = 'kapalı', paintLive()); }; return s; };
  const runBtn = (lab, kinds) => el('button', { type: 'button', class: 'btn' + (kinds ? ' ghost' : ''), onclick: () => { $('drawer')?.classList.remove('open'); ask(kinds); } }, lab);
  const sec = el('div', { id: 'pkSec' },
    el('h3', {}, 'HAFTALIK NİCEL SEÇİM + CANLI'),
    el('p', { class: 'muted' }, 'Kripto (45 varlık), gram altın, BIST 30, ABD büyükleri ve eklediğin her borsa: 9 sayısal parametre + piyasa rejimi, geri testle seçilen model, ölçülmüş olasılık. ' + NOTE),
    liveState, liveBox,
    el('div', { class: 'row' }, runBtn('📊 Haftanın seçimini hesapla'), runBtn('Yalnız kripto', ['kripto', 'altin']), runBtn('Yalnız hisse', ['bist', 'abd', 'diger'])),
    pkBody, recBox,
    el('div', { id: 'pkSet' },
      el('label', { for: 'picksMin' }, 'Yüksek güven eşiği (%) — bu olasılığı geçen aday ★ ile işaretlenir'), inThr,
      el('label', { for: 'picksExtra' }, 'Taranacak diğer borsa sembolleri'), inExtra,
      el('label', { for: 'picksAuto' }, 'Her pazartesi otomatik seçim'), sel('picksAuto', 'Açık', 'Kapalı', '1'),
      el('label', { for: 'picksAI' }, 'Haber/makro takvim notu (internet araması)'), sel('picksAI', 'Açık', 'Kapalı', '1'),
      el('label', { for: 'liveFeed' }, 'Kesintisiz canlı fiyat akışı'), sel('liveFeed', 'Açık', 'Kapalı', '1')));
  // ---------- HİSSE/HABER KÖPRÜSÜ kurulumu (Beyhan'ın kendi Google hesabında, ücretsiz) ----------
  const gasCode = () => `// SATÜRN köprüsü — yalnız bu anahtarı bilen Satürn kullanabilir
var KEY = '${window.jarvisBridge.key()}';
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.k !== KEY) return out({ error: 'yetkisiz' });
  var u = String(p.url || '');
  if (!/^https:\\/\\//.test(u) || /script\\.google/.test(u)) return out({ error: 'gecersiz adres' });
  var cache = CacheService.getScriptCache();
  var ck = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, u));
  var hit = cache.get(ck);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.TEXT);
  var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (SATURN)' } });
  if (r.getResponseCode() !== 200) return out({ error: 'HTTP ' + r.getResponseCode() });
  var t = r.getContentText();
  if (t.length < 90000) { try { cache.put(ck, t, 300); } catch (x) {} }
  return ContentService.createTextOutput(t).setMimeType(ContentService.MimeType.TEXT);
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }`;
  const brIn = el('input', { id: 'bridgeUrl', placeholder: 'https://script.google.com/macros/s/…/exec', inputmode: 'url' }); brIn.value = store.get('set.bridgeUrl', '');
  const brMsg = el('small', { id: 'bridgeMsg', class: 'muted' }, window.jarvisBridge.on() ? 'Köprü kayıtlı.' : 'Köprü kurulmadı.');
  async function bridgeTest(url, msg) {
    store.set('set.bridgeUrl', String(url || '').trim()); brIn.value = store.get('set.bridgeUrl', '');
    const say = t => { msg.textContent = t; if (msg !== brMsg) brMsg.textContent = t; };
    if (!window.jarvisBridge.on()) { say('✗ Adres “https://script.google.com/macros/s/…/exec” biçiminde olmalı (Dağıt penceresindeki “Web uygulaması URL’si”).'); return false; }
    say('Deneniyor…');
    try {
      const j = await getJ(window.jarvisBridge.wrap('https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS?range=5d&interval=1d'), 25000);
      if (j?.error) throw Error(j.error === 'yetkisiz' ? 'anahtar uyuşmuyor — kodu Satürn’den yeniden kopyalayıp yapıştır, sonra “Dağıt → Dağıtımları yönet → yeni sürüm”' : j.error);
      const pr = j?.chart?.result?.[0]?.meta?.regularMarketPrice; if (!pr) throw Error('Yahoo verisi gelmedi');
      say(`✓ Köprü çalışıyor: THYAO ${nf(pr)} TL. Hisse, dünya haberleri ve tıbbi literatür artık bu yoldan gelir.`); return true;
    } catch (e) { say('✗ ' + e.message + ' — Dağıtımda “Erişimi olanlar: Herkes” seçili olmalı.'); return false; }
  }
  const brTest = () => bridgeTest(brIn.value, brMsg);
  const copyCode = async e => { try { await navigator.clipboard.writeText(gasCode()); e.target.textContent = '✓ Kod kopyalandı'; } catch { e.target.textContent = 'Kopyalanamadı — aşağıdaki kutudan seç-kopyala'; e.target.after(el('textarea', { rows: 6, readonly: '', style: 'width:100%' }, gasCode())); } };
  // SOHBETTE KURULUM KARTI: bilgisayar gerekmez, telefonda Safari'den yapılır
  function bridgeCard() {
    const inp = el('input', { placeholder: 'https://script.google.com/macros/s/…/exec', inputmode: 'url', style: 'width:100%;box-sizing:border-box' }); inp.value = store.get('set.bridgeUrl', '');
    const m = el('small', { class: 'muted' }, window.jarvisBridge.on() ? 'Kayıtlı köprü var — “Kaydet ve dene” ile yeniden sınayabilirsin.' : '');
    const n = bubble('ai', '🔌 HİSSE KÖPRÜSÜ — bilgisayar GEREKMEZ, telefondan 5 dakikada kurulur (ücretsiz, yalnız senin Google hesabında):');
    n.el.append(el('div', { class: 'tool', id: 'bridgeCard' },
      el('ol', {},
        el('li', {}, '“📋 Kodu kopyala”ya bas.'),
        el('li', {}, '“script.google.com’u aç”a bas → Google hesabınla gir → “Yeni proje”. (Safari’de düzenleyici sıkışık görünürse adres çubuğundaki “aA” → “Masaüstü web sitesini iste”.)'),
        el('li', {}, 'Sayfadaki kodu tamamen sil, kopyaladığını yapıştır, 💾 kaydet.'),
        el('li', {}, 'Sağ üstte “Dağıt” → “Yeni dağıtım” → ⚙ tür: “Web uygulaması” · Yürütme: “Ben” · Erişimi olanlar: “Herkes” → “Dağıt” → izinleri onayla (“Gelişmiş → güvenli olmayan… git” çıkarsa: kendi kodun olduğu için güvenli).'),
        el('li', {}, '“Web uygulaması URL’si”ni kopyala, aşağıya yapıştır → “Kaydet ve dene”.')),
      el('div', { class: 'row' },
        el('button', { type: 'button', onclick: copyCode }, '📋 Kodu kopyala'),
        el('a', { href: 'https://script.google.com/home/projects/create', target: '_blank', rel: 'noopener', class: 'btn ghost' }, 'script.google.com’u aç')),
      inp, el('div', { class: 'row' }, el('button', { type: 'button', onclick: () => bridgeTest(inp.value, m) }, 'Kaydet ve dene')), m));
    return 'Köprü kurulum kartı açıldı.';
  }
  brIn.onchange = () => brTest();
  const brSec = el('details', { id: 'bridgeSec' }, el('summary', {}, '🔌 Hisse köprüsü (ücretsiz, 5 dk kurulum) — hisse verisi gelmiyorsa'),
    el('ol', { class: 'muted' },
      el('li', {}, 'Telefonda (bilgisayar gerekmez) script.google.com adresini aç → “Yeni proje”.'),
      el('li', {}, 'Aşağıdaki “Kodu kopyala” düğmesine bas, açılan sayfadaki her şeyi silip yapıştır, kaydet (💾).'),
      el('li', {}, '“Dağıt” → “Yeni dağıtım” → tür: Web uygulaması · Yürütme: Ben · Erişimi olanlar: Herkes → Dağıt → izinleri onayla.'),
      el('li', {}, 'Verilen “Web uygulaması URL’si”ni aşağıya yapıştır; Satürn kendiliğinden dener.')),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', onclick: copyCode }, '📋 Kodu kopyala'), el('button', { type: 'button', class: 'btn ghost', onclick: brTest }, 'Köprüyü dene')),
    el('label', { for: 'bridgeUrl' }, 'Web uygulaması URL’si'), brIn, brMsg,
    el('p', { class: 'muted' }, 'Köprü yalnız senin Google hesabında çalışır; içindeki gizli anahtarı bilmeyen kullanamaz. Ücretsizdir (günde 20.000 istek).'));
  sec.append(brSec);
  const mp = $('p-market'); if (mp) mp.prepend(sec);
  let paintT = 0;
  function paintLive(flash) {
    liveState.textContent = `canlı akış: ${live.state}${live.last ? ' · son veri ' + new Date(live.last).toLocaleTimeString('tr-TR') : ''}`;
    if (!mp || mp.hidden) return;
    if (flash && Date.now() - paintT < 300) return; paintT = Date.now();
    const T = live.prices.USDTTRY?.p;
    liveBox.replaceChildren(...[...live.subs].filter(s => live.prices[s]).map(s => {
      const v = live.prices[s], gold = s === 'PAXGUSDT';
      return el('span', { class: 'lv ' + (v.ch >= 0 ? 'up' : 'dn') + (flash === s ? ' fl' : ''), 'data-s': s }, `${gold ? 'ONS ALTIN' : s.replace(/USDT$/, '').replace('USDTTRY', 'USD/TRY')} ${s === 'USDTTRY' ? nf(v.p, 3) : px(v.p)}${gold && T ? ` · gram ${nf(v.p / 31.1034768 * T, 0)} TL` : ''} ${v.ch >= 0 ? '▲' : '▼'}${nf(Math.abs(v.ch), 2)}%`);
    }));
  }
  function renderPanel() { const R = store.get('pkLast', null); if (R) pkBody.textContent = text(R); recBox.textContent = record(); paintLive(); }
  renderPanel();
  $('t-market')?.addEventListener('click', () => setTimeout(renderPanel, 0));
  setInterval(() => { if (!document.hidden && mp && !mp.hidden) paintLive(); }, 5000);

  async function ask(kinds) {
    bubble('me', '📊 Haftanın nicel seçimi' + (kinds ? ' (' + kinds.join(', ') + ')' : ''));
    try { const R = await run(kinds ? { kinds } : {}); show(R); return R; } catch (e) { setPhase('idle', 'Hazır.'); note('Seçim yapılamadı: ' + e.message); }
  }

  /* ---------- araçlar, komutlar, niyet yakalama ---------- */
  const kindsOf = t => { const f = fold(t); const h = /hisse|borsa|bist|nasdaq|s&p|abd|amerika/.test(f), c = /token|coin|kripto|altcoin|bitcoin/.test(f), g = /altin/.test(f); return h && !c ? ['bist', 'abd', 'diger'].concat(g ? ['altin'] : []) : c && !h ? ['kripto', 'altin'] : undefined; };
  Object.assign(TOOLS, {
    haftalik_secim: { d: 'haftalik_secim|kripto / hisse / hepsi — HAFTANIN NİCEL SEÇİMİ: 45 kripto + gram altın + BIST 30 + ABD + eklenen borsalar; 9 sayısal parametre, piyasa rejimi, geri test, ölçülmüş yükseliş olasılığı, %68 aralık, risk seviyesi, gerçek sicil. “Token/coin/hisse öner, haftanın adayları, hangi coin yükselir” isteklerinde kullan.', run: async ([k]) => { const R = await run({ kinds: kindsOf(k || '') }); setTimeout(() => show(R), 30); return text(R); } },
    canli_fiyat: { d: 'canli_fiyat|sembol — kesintisiz canlı kripto/altın fiyatı (WebSocket, saniyelik)', run: async ([s]) => { const S = String(s || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, '') + 'USDT'; liveSub([S]); const v = live.prices[S]; if (v && Date.now() - v.t < 60000) return `${S.replace('USDT', '')} ${px(v.p)} $ (24s ${v.ch >= 0 ? '+' : ''}${nf(v.ch, 2)}%) · canlı, ${Math.round((Date.now() - v.t) / 1000)} sn önce`; return (await window.jarvisMarkets.quote(S.replace('USDT', ''))).text; } }
  });
  TOOLS.kopru_kur = { d: 'kopru_kur — HİSSE/HABER KÖPRÜSÜ kurulum kartını sohbette açar (Google Apps Script, telefondan, bilgisayar GEREKMEZ)', run: async () => { setTimeout(bridgeCard, 30); return 'Kurulum kartı sohbette açıldı: kodu kopyala, script.google.com’da yapıştır, Web uygulaması olarak (Erişim: Herkes) dağıt, adresi karta yapıştır.'; } };
  TOOL_GROUPS.push([/köprü|kopru|bridge/i, /^kopru_kur$/]);
  TOOL_GROUPS.push([/haftal|öner|tavsiye|seçim|aday|token|coin|altcoin|hisse|canlı fiyat|anlık fiyat/i, /^(haftalik_secim|canli_fiyat)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nHAFTALIK SEÇİM: “token/coin/hisse öner, haftanın adayları, hangi coin yükselir” → haftalik_secim. Aracın verdiği olasılık ve sayıları DEĞİŞTİRME; %80 gibi bir isabet garanti edilemez, ölçülen olasılığı ve gerçek sicili söyle. Anlık fiyat → canli_fiyat. HİSSE KÖPRÜSÜ bilgisayar GEREKTİRMEZ (bilgisayar yardımcısıyla karıştırma): “köprü kur/aç” → kopru_kur.';
  const PICK = /(haftanın|haftalık|bu haftaki|bu hafta(?:nın)?)\s+(?:\S+\s+){0,2}(token|coin|kripto|altcoin|hisse|seçim|öneri|aday|sinyal)|\b(\d+\s+)?(token|coin|kripto|altcoin|hisse)(ler)?(ini|ı|i|u|ü)?\s+(öner|tavsiye|seç|bul)|hangi\s+(coin|token|kripto|altcoin|hisse)(ler)?(i|ı|e|a)?\s+(al|alınır|alayım|alsam|yatırım|yükselir|yükselecek|öne çıkıyor|iyi|almalı|mantıklı|girilir)|nicel (tarama|seçim)|haftalık (tarama|seçim|sinyal)/i;
  const isPick = t => { t = String(t || ''); return t.length >= 8 && t.length <= 200 && PICK.test(t) && !/(hasta|seans|randevu|sicil|isabet)/i.test(t); };
  const _think = think;
  think = async (text0, o = {}) => {
    if (o.image || window.jarvisUltra?.guest?.() || !isPick(text0)) return _think(text0, o);
    bubble('me', text0);
    try {
      const R = await run({ kinds: kindsOf(text0) }); show(R);
      const say = sayOf(R);
      if (o.voiceTurn || (setting('speakOn') === '1' && store.get('set.readTyped', true))) { try { voiceSession.read(say); } catch {} }
      remember?.(text0, say);
      return say;
    } catch (e) { setPhase('idle', 'Hazır.'); note('Seçim yapılamadı: ' + e.message); return ''; }
  };
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, '');
    if (/(hisse |piyasa )?köprü(sü|yü|yu|nü)?(nü)?\s*(kur|aç|ayarla|bağla|nasıl|kurulumu|kurulum)|köprü kur/i.test(t) && t.length < 70) return bridgeCard();
    if (/^(seçim sicilim|haftalık sicil|token sicilim|seçimler ne kadar tuttu)$/i.test(t)) return record() || 'Henüz sonuçlanmış seçim yok; ilk sonuç seçimden 7 gün sonra gelir.';
    return _lc(text0);
  };
  window.jarvisPicks = { bridgeCard, bridgeTest, run, show, text, record, evaluate, backtest, feat, goldView, resolveDue, isPick, kindsOf, isoWeek, live, liveConnect, liveSub, yahooSeries, macro };
})();
