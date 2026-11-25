'use strict';
/* SATÜRN 28 — KAHİN: ölçülmüş, dürüst, kalibre piyasa tahmin motoru (kripto, hisse/endeks, altın, döviz)
 *
 *  Gerçekçi hedef: hiçbir model fiyatı “kesin” bilemez; piyasalar büyük ölçüde rastgele yürür. En iyi tahminci,
 *  (1) yönde ancak küçük bir avantaj bulabildiğinde bunu söyler ve ÖLÇER, (2) belirsizliği (fiyat aralığını) doğru verir,
 *  (3) avantajı yoksa “yazı-turadan iyi değilim” diyecek kadar dürüsttür. KAHİN bunu yapar:
 *
 *  • Veri: 1000 güne kadar günlük kapanış (Binance; altın = PAXG×USDTTRY; hisse/endeks = Yahoo/jina geçidi)
 *  • 12 gösterge: 1/5/20/60 günlük getiri, oynaklık ve oynaklık oranı, ortalamaya uzaklık (z), RSI, 20 günlük kanal konumu,
 *    200 günlük trend, hacim değişimi, getiri çarpıklığı
 *  • 3 model + dürüst taban: (a) kayan pencereli lojistik regresyon, (b) benzer-geçmiş (analog/k-en yakın komşu),
 *    (c) zaman serisi momentumu, (d) taban oranı (o varlıkta “yükseldi” yüzdesi)
 *  • İLERİYE DÖNÜK TEST (walk-forward): her gün yalnız o güne kadarki veriyle eğitilip ertesi vade için tahmin üretilir —
 *    geleceği görmez. Karışım ağırlıkları ve kalibrasyon ilk yarıda öğrenilir, ikinci yarıda (hiç görülmemiş veri) puanlanır.
 *  • Karne: isabet, Brier beceri puanı (taban orana göre), anlamlılık (p), aralık kapsama doğruluğu.
 *    Beceri anlamlı değilse yön tahmini “yazı-tura” olarak etiketlenir ve olasılık %50'ye büzülür.
 *  • Fiyat aralığı: GARCH(1,1) oynaklığı + filtrelenmiş tarihsel simülasyon (2000 yol) → %50/%80/%95 aralıklar.
 *  • Canlı sicil: her tahmin kaydedilir, vadesi gelince otomatik puanlanır (kahin_karne). ZOİ'ye de yazılır.
 *  Yatırım tavsiyesi değildir. */
(() => {
  const DAY = 86400000, BN = 'https://data-api.binance.vision/api/v3/klines';
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: Math.abs(v) < 10 && d > 2 ? 2 : 0 });
  const pctS = v => (v >= 0 ? '+' : '') + nf(v * 100, 1) + '%';
  const getJ = async (u, ms = 15000) => { const r = await withTimeout(fetch(u), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const kl = async (sym, lim = 1000) => (await getJ(`${BN}?symbol=${sym}&interval=1d&limit=${lim}`)).filter(x => x[6] < Date.now() + DAY).map(x => ({ t: x[0], c: +x[4], v: +x[7] }));
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1), sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

  /* ================= VERİ ================= */
  const cache = new Map();
  async function series(subject) {
    const key = fold(String(subject || '')).trim(); const hit = cache.get(key); if (hit && Date.now() - hit.t < 30 * 60000) return hit.v;
    const M = window.jarvisMarkets; let r = null; try { r = await M.resolve(subject); } catch {}
    let rows, label, unit, kind = r?.kind || '';
    const align = (a, b, f) => { const mb = new Map(b.map(x => [x.t, x])); return a.filter(x => mb.has(x.t)).map(x => ({ t: x.t, c: f(x.c, mb.get(x.t).c), v: x.v })); };
    const CT = String(subject).trim().toUpperCase();
    if (kind !== 'kripto' && kind !== 'altin' && kind !== 'fx' && /^[A-Z0-9]{2,10}$/.test(CT) && !/\.IS$/.test(r?.key || '')) { try { const k = await kl(CT + 'USDT'); if (k.length > 300) { kind = 'kripto'; r = { kind, key: CT }; } } catch {} } // çözücü geçici hata verse de kripto kaçmasın
    if (kind === 'kripto') { rows = await kl(r.key + 'USDT'); label = r.key; unit = '$'; }
    else if (kind === 'altin') {
      const g = await kl('PAXGUSDT'); if (r.key === 'ons') { rows = g; label = 'Ons altın'; unit = '$'; }
      else { const u = await kl('USDTTRY'); const mult = { gram: 1, ceyrek: 1.75 * 0.916 * 1.02, yarim: 3.5 * 0.916 * 1.02, tam: 7.016 * 0.916 * 1.02 }[r.key] || 1; rows = align(g, u, (a, b) => a / 31.1034768 * b * mult); label = { gram: 'Gram altın', ceyrek: 'Çeyrek altın', yarim: 'Yarım altın', tam: 'Tam altın' }[r.key] || 'Gram altın'; unit = 'TL'; }
    } else if (kind === 'fx' && r.key === 'USD') { rows = await kl('USDTTRY'); label = 'Dolar/TL'; unit = 'TL'; }
    else if (kind === 'fx' && r.key === 'EUR') { const [e, u] = await Promise.all([kl('EURUSDT'), kl('USDTTRY')]); rows = align(e, u, (a, b) => a * b); label = 'Euro/TL'; unit = 'TL'; }
    else {
      const ysym = kind === 'eq' ? r.key : kind === 'fx' ? r.key + 'TRY=X' : null; if (!ysym) throw Error(`“${subject}” için fiyat geçmişi bulamadım. Örnek: BTC, ETH, gram altın, ons, dolar, euro, BIST 100, THYAO, AAPL, Nasdaq.`);
      const j = await window.jarvisSrc.jinaJ(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=5y&interval=1d`, 20000);
      const R = j.chart?.result?.[0]; const q = R?.indicators?.quote?.[0] || {};
      rows = (R?.timestamp || []).map((t, i) => ({ t: t * 1000, c: q.close?.[i], v: q.volume?.[i] || 0 })).filter(x => x.c > 0).slice(-1000);
      label = R?.meta?.shortName || ysym; unit = R?.meta?.currency || ''; kind = kind || 'eq';
    }
    rows = rows.filter(x => x.c > 0);
    if (rows.length < 320) throw Error(`${label}: model için en az 320 günlük veri gerekiyor (${rows.length} var).`);
    const v = { label, unit, kind, t: rows.map(x => x.t), c: rows.map(x => x.c), v: rows.map(x => x.v || 0) };
    cache.set(key, { t: Date.now(), v }); return v;
  }

  /* ================= GÖSTERGELER (yalnız i. güne kadarki veri) ================= */
  const FEATS = ['getiri 1g', 'getiri 5g', 'getiri 20g', 'getiri 60g', 'oynaklık 20g', 'oynaklık oranı 5/60', 'ortalamaya uzaklık (z)', 'RSI', 'kanal konumu 20g', 'trend 200g', 'hacim değişimi', 'çarpıklık 20g'];
  function features(c, v) {
    const n = c.length, r = c.map((x, i) => i ? Math.log(x / c[i - 1]) : 0), F = new Array(n).fill(null);
    for (let i = 200; i < n; i++) {
      const rw = r.slice(i - 19, i + 1), vol20 = sd(rw) || 1e-6, vol5 = sd(r.slice(i - 4, i + 1)), vol60 = sd(r.slice(i - 59, i + 1)) || 1e-6;
      const sma50 = mean(c.slice(i - 49, i + 1)), sma200 = mean(c.slice(i - 199, i + 1));
      let g = 0, l = 0; for (let k = i - 13; k <= i; k++) { g += Math.max(r[k], 0); l += Math.max(-r[k], 0); }
      const hi = Math.max(...c.slice(i - 19, i + 1)), lo = Math.min(...c.slice(i - 19, i + 1));
      const vNow = mean(v.slice(i - 4, i + 1)), vBase = mean(v.slice(i - 59, i + 1));
      const m = mean(rw), sk = rw.reduce((s, x) => s + ((x - m) / vol20) ** 3, 0) / rw.length;
      F[i] = [r[i] / vol20, Math.log(c[i] / c[i - 5]) / (vol20 * Math.sqrt(5)), Math.log(c[i] / c[i - 20]) / (vol20 * Math.sqrt(20)), Math.log(c[i] / c[i - 60]) / (vol60 * Math.sqrt(60)),
        Math.log(vol20 * Math.sqrt(365)), Math.log((vol5 || 1e-6) / vol60), Math.log(c[i] / sma50) / (vol20 * Math.sqrt(50)), (g + l ? g / (g + l) : 0.5) * 2 - 1,
        hi > lo ? (c[i] - lo) / (hi - lo) * 2 - 1 : 0, Math.log(c[i] / sma200) / (vol60 * Math.sqrt(200)), vBase > 0 ? Math.max(-3, Math.min(3, Math.log((vNow + 1) / (vBase + 1)))) : 0, Math.max(-3, Math.min(3, sk))]
        .map(x => (Number.isFinite(x) ? Math.max(-6, Math.min(6, x)) : 0));
    }
    return { F, r };
  }

  /* ================= MODELLER ================= */
  const sig = z => 1 / (1 + Math.exp(-z));
  function fitLogit(X, y, w0, iters = 120, lam = 0.02, lr = 0.3) {
    const d = X[0].length; let w = w0 ? w0.slice() : new Array(d + 1).fill(0);
    const n = X.length;
    for (let it = 0; it < iters; it++) {
      const g = new Array(d + 1).fill(0);
      for (let k = 0; k < n; k++) { const x = X[k]; let z = w[d]; for (let j = 0; j < d; j++) z += w[j] * x[j]; const e = sig(z) - y[k]; for (let j = 0; j < d; j++) g[j] += e * x[j]; g[d] += e; }
      for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / n + lam * w[j]); w[d] -= lr * g[d] / n;
    }
    return w;
  }
  const predLogit = (w, x) => { const d = x.length; let z = w[d]; for (let j = 0; j < d; j++) z += w[j] * x[j]; return sig(z); };
  function knn(Xpast, ypast, x, k = 50) {
    if (Xpast.length < k * 2) return 0.5;
    const ds = Xpast.map((p, i) => { let s = 0; for (let j = 0; j < x.length; j++) s += (p[j] - x[j]) ** 2; return [s, ypast[i]]; });
    ds.sort((a, b) => a[0] - b[0]); let up = 0; for (let i = 0; i < k; i++) up += ds[i][1];
    return (up + 1) / (k + 2);
  }
  // standardize with stats from training part only
  const zstats = X => { const d = X[0].length, m = [], s = []; for (let j = 0; j < d; j++) { const col = X.map(x => x[j]); m[j] = mean(col); s[j] = sd(col) || 1; } return { m, s }; };
  const zt = (x, st) => x.map((v, j) => (v - st.m[j]) / st.s[j]);

  /* ================= İLERİYE DÖNÜK TEST + TAHMİN ================= */
  function model(S, H) {
    const { c } = S, n = c.length, { F, r } = features(c, S.v);
    const y = c.map((x, i) => (i + H < n ? (c[i + H] > x ? 1 : 0) : null));
    const start = 260, idx = []; for (let i = start; i < n; i++) if (F[i]) idx.push(i);
    const oos = []; let w = null, st = null, lastFit = -1;
    for (const i of idx) {
      const train = []; for (let k = 200; k + H <= i; k++) if (F[k] && y[k] != null) train.push(k);
      if (train.length < 50) continue;
      if (lastFit < 0 || i - lastFit >= 15) { st = zstats(train.map(k => F[k])); w = fitLogit(train.map(k => zt(F[k], st)), train.map(k => y[k]), w, lastFit < 0 ? 250 : 60); lastFit = i; }
      const x = zt(F[i], st);
      const pL = predLogit(w, x);
      const kn = train.slice(-750); const pK = knn(kn.map(k => zt(F[k], st)), kn.map(k => y[k]), x, Math.min(50, Math.floor(kn.length / 4)));
      const mom = Math.log(c[i] / c[Math.max(0, i - Math.max(20, H * 3))]); const pM = 0.5 + 0.08 * Math.tanh(mom / ((sd(r.slice(i - 59, i + 1)) || 1e-3) * Math.sqrt(Math.max(20, H * 3))));
      const base = mean(train.map(k => y[k]));
      oos.push({ i, pL, pK, pM, base, y: y[i] });
    }
    const done = oos.filter(o => o.y != null);
    if (done.length < 120) throw Error('İleriye dönük test için yeterli geçmiş yok.');
    // ilk yarı: karışım ağırlıkları + kalibrasyon; ikinci yarı: dürüst puan
    const half = Math.floor(done.length / 2), A = done.slice(0, half), B = done.slice(half);
    const mix = (o, wt) => wt[0] * o.pL + wt[1] * o.pK + wt[2] * o.pM + wt[3] * o.base;
    const ll = (set, wt, cal) => set.reduce((s, o) => { const p = Math.min(0.99, Math.max(0.01, cal ? calib(mix(o, wt), cal) : mix(o, wt))); return s - (o.y ? Math.log(p) : Math.log(1 - p)); }, 0) / set.length;
    let best = [0, 0, 0, 1], bestL = ll(A, best);
    for (let a = 0; a <= 10; a++) for (let b = 0; a + b <= 10; b++) for (let m = 0; a + b + m <= 10; m++) { const wt = [a / 10, b / 10, m / 10, (10 - a - b - m) / 10], L = ll(A, wt); if (L < bestL - 1e-9) { bestL = L; best = wt; } }
    // Platt kalibrasyonu (logit uzayında a·z+b), ilk yarıda
    const cal = fitLogit(A.map(o => [Math.log(Math.max(1e-4, mix(o, best)) / Math.max(1e-4, 1 - mix(o, best)))]), A.map(o => o.y), [1, 0], 300, 0.001, 0.5);
    function calib(p, k) { const z = Math.log(Math.max(1e-4, p) / Math.max(1e-4, 1 - p)); return sig(k[0] * z + k[1]); }
    // ikinci yarıda puan
    const pB = B.map(o => calib(mix(o, best), cal)), baseB = B.map(o => o.base);
    const brier = pB.reduce((s, p, k) => s + (p - B[k].y) ** 2, 0) / B.length, brierBase = baseB.reduce((s, p, k) => s + (p - B[k].y) ** 2, 0) / B.length;
    const bss = 1 - brier / brierBase;
    const diffs = pB.map((p, k) => (baseB[k] - B[k].y) ** 2 - (p - B[k].y) ** 2), dm = mean(diffs), dsd = sd(diffs);
    // örtüşen vadeler bağımsız değil → etkin örneklem ≈ n/H
    const nEff = Math.max(10, B.length / Math.max(1, H)), zstat = dsd ? dm / (dsd / Math.sqrt(nEff)) : 0, pval = 1 - normCdf(zstat);
    const hits = pB.filter((p, k) => (p >= 0.5 ? 1 : 0) === B[k].y).length / B.length, baseHit = Math.max(mean(B.map(o => o.y)), 1 - mean(B.map(o => o.y)));
    // güncel tahmin: tüm veriyle eğit
    const all = []; for (let k = 200; k + H < n; k++) if (F[k] && y[k] != null) all.push(k);
    const stA = zstats(all.map(k => F[k])), wA = fitLogit(all.map(k => zt(F[k], stA)), all.map(k => y[k]), w, 200);
    const xN = zt(F[n - 1], stA), last = all.slice(-750);
    const now = { pL: predLogit(wA, xN), pK: knn(last.map(k => zt(F[k], stA)), last.map(k => y[k]), xN, 50), pM: 0.5 + 0.08 * Math.tanh(Math.log(c[n - 1] / c[n - 1 - Math.max(20, H * 3)]) / ((sd(r.slice(n - 60)) || 1e-3) * Math.sqrt(Math.max(20, H * 3)))), base: mean(all.map(k => y[k])) };
    let pNow = calib(mix(now, best), cal);
    const skilled = bss > 0.005 && pval < 0.1;
    const shrink = skilled ? 1 : Math.max(0, Math.min(1, bss * 20)); // beceri yoksa %50'ye (taban orana) büz
    pNow = now.base + (pNow - now.base) * shrink;
    const imp = FEATS.map((nm, j) => [nm, wA[j] * xN[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
    return { p: pNow, raw: calib(mix(now, best), cal), weights: best, bss, pval, hits, baseHit, nTest: B.length, skilled, imp, base: now.base, oos: done };
  }
  function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

  /* ================= OYNAKLIK: GARCH(1,1) + filtrelenmiş tarihsel simülasyon ================= */
  function garch(r) {
    const x = r.slice(1), v0 = mean(x.map(a => a * a)); let best = null;
    for (let a = 0.02; a <= 0.2; a += 0.02) for (let b = 0.7; b <= 0.97; b += 0.015) { if (a + b >= 0.995) continue; const om = v0 * (1 - a - b); let v = v0, L = 0; for (const e of x) { L += Math.log(v) + e * e / v; v = om + a * e * e + b * v; } if (!best || L < best.L) best = { a, b, om, L }; }
    let v = v0; const sig = []; for (const e of x) { sig.push(Math.sqrt(v)); v = best.om + best.a * e * e + best.b * v; }
    return { ...best, vNext: v, z: x.map((e, i) => e / sig[i]), sig };
  }
  // H günlük standartlaştırılmış getiriler: u = ln(c[i+H]/c[i]) / (GARCH'ın i. günde öngördüğü H günlük oynaklık)
  // → kalın kuyruk ve oynaklık kümelenmesi gerçek geçmişten gelir (filtrelenmiş tarihsel yöntem)
  function hvol(G, v, H) { const p = G.a + G.b, vLR = G.om / Math.max(1e-9, 1 - p); const vbar = vLR + (v - vLR) * (1 - p ** H) / (H * (1 - p)); return Math.sqrt(Math.max(1e-12, vbar) * H); }
  function stdReturns(c, H) {
    const r = c.map((x, i) => i ? Math.log(x / c[i - 1]) : 0), G = garch(r), n = c.length, u = [];
    for (let i = 260; i + H < n; i++) { const v = G.sig[i] ** 2; u.push(Math.log(c[i + H] / c[i]) / hvol(G, v, H)); }
    return { G, u };
  }
  const qOf = (sorted, p) => { const k = p * (sorted.length - 1), lo = Math.floor(k), hi = Math.ceil(k); return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo); };
  function simulate(c, H, pUp) {
    const { G, u } = stdReturns(c, H), U = u.slice(-900).sort((a, b) => a - b), sNow = hvol(G, G.vNext, H);
    const shift = -qOf(U, 1 - pUp); // P(getiri>0) = pUp olacak biçimde merkez
    const Q = p => c.at(-1) * Math.exp((qOf(U, p) + shift) * sNow);
    return { Q, G, volAnn: Math.sqrt(G.vNext * 365) };
  }
  // aralık doğruluğu: ilk yarının quantile'larıyla ikinci yarıda %80 aralık kaç kez tuttu (dürüst, ileriye dönük)
  function coverage(c, H) {
    const { u } = stdReturns(c, H); if (u.length < 200) return null;
    const half = Math.floor(u.length / 2), A = u.slice(0, half).sort((a, b) => a - b), lo = qOf(A, 0.1), hi = qOf(A, 0.9), B = u.slice(half).filter((_, k) => k % Math.max(1, Math.floor(H / 2)) === 0);
    return B.filter(x => x >= lo && x <= hi).length / B.length;
  }

  /* ================= ANA TAHMİN ================= */
  const horizonOf = h => { const f = fold(String(h || '')); const m = f.match(/(\d+)\s*(gun|g|hafta|ay)?/); if (m) return Math.max(1, Math.min(90, +m[1] * ({ hafta: 7, ay: 30 }[m[2]] || 1))); return /yarin/.test(f) ? 1 : /hafta/.test(f) ? 7 : /ay/.test(f) ? 30 : 7; };
  async function forecast(subject, hRaw, opts = {}) {
    const H = horizonOf(hRaw), S = await series(subject);
    opts.status?.(`${S.label}: ${S.c.length} günlük veri · ileriye dönük test…`);
    await new Promise(r => setTimeout(r, 0));
    const M = model(S, H), sim = simulate(S.c, H, M.p), cov = coverage(S.c, H);
    const last = S.c.at(-1), n = S.c.length, sma200 = mean(S.c.slice(-200)), ch200 = Math.log(sma200 / mean(S.c.slice(-220, -20)));
    const regime = (last > sma200 ? 'YÜKSELİŞ trendi (200 günlük ortalamanın üstünde)' : 'DÜŞÜŞ trendi (200 günlük ortalamanın altında)') + (Math.abs(ch200) < 0.02 ? ', yatay' : '');
    const volPct = (() => { const r = S.c.map((x, i) => i ? Math.log(x / S.c[i - 1]) : 0).slice(1), vs = []; for (let i = 20; i < r.length; i++) vs.push(sd(r.slice(i - 20, i))); const cur = vs.at(-1); return Math.round(vs.filter(x => x <= cur).length / vs.length * 100); })();
    const res = { subject, label: S.label, unit: S.unit, kind: S.kind, H, last, t: Date.now(), due: Date.now() + H * DAY, p: M.p, M, cov, regime, volPct, volAnn: sim.volAnn,
      q: { 2.5: sim.Q(0.025), 10: sim.Q(0.1), 25: sim.Q(0.25), 50: sim.Q(0.5), 75: sim.Q(0.75), 90: sim.Q(0.9), 97.5: sim.Q(0.975) } };
    if (!opts.noLog) logForecast(res);
    return res;
  }
  const verdict = M => M.skilled ? (M.bss > 0.03 ? 'ANLAMLI AVANTAJ' : 'ZAYIF AMA ANLAMLI AVANTAJ') : 'YÖN İÇİN AVANTAJ YOK (yazı-tura düzeyi)';
  function text(R) {
    const u = R.unit, f = v => nf(v, v < 10 ? 4 : 2) + ' ' + u, M = R.M, dir = R.p >= 0.5 ? 'YÜKSELİŞ' : 'DÜŞÜŞ', pp = Math.round(Math.max(R.p, 1 - R.p) * 100);
    const exp50 = Math.log(R.q[50] / R.last);
    return `🔮 KAHİN · ${R.label} · ${R.H} gün (vade ${new Date(R.due).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })})\n` +
      `Şimdi ${f(R.last)} · Medyan beklenti ${f(R.q[50])} (${pctS(exp50)})\n` +
      `YÖN: ${M.skilled ? `%${pp} ${dir}` : `≈ %50 — belirgin yön yok (ham model %${Math.round(M.raw * 100)} yükseliş diyor ama geçmişte bu sinyal tutarlı değildi)`}\n` +
      `ARALIK: %50 → ${f(R.q[25])} – ${f(R.q[75])}\n        %80 → ${f(R.q[10])} – ${f(R.q[90])}\n        %95 → ${f(R.q[2.5])} – ${f(R.q[97.5])}\n` +
      `KARNE (son ${M.nTest} gün, modelin hiç görmediği veri): ${verdict(M)} · isabet %${Math.round(M.hits * 100)} (hep çoğunluğu söyleseydi %${Math.round(M.baseHit * 100)}) · Brier beceri ${pctS(M.bss)} · p=${M.pval.toFixed(3)}${R.cov != null ? ` · %80 aralık geçmişte %${Math.round(R.cov * 100)} tuttu` : ''}\n` +
      `REJİM: ${R.regime} · oynaklık yıllık %${Math.round(R.volAnn * 100)} (son yıllara göre %${R.volPct}. dilim)\n` +
      `Etkili göstergeler: ${M.imp.map(([n, v]) => `${n} ${v >= 0 ? '↑' : '↓'}`).join(', ')} · karışım: lojistik %${Math.round(M.weights[0] * 100)}, analog %${Math.round(M.weights[1] * 100)}, momentum %${Math.round(M.weights[2] * 100)}, taban %${Math.round(M.weights[3] * 100)}\n` +
      `Bu tahmin kaydedildi; vadesinde otomatik puanlanır (“kahin karnesi”). Olasılık bir kesinlik değildir. Bilgi amaçlıdır, yatırım tavsiyesi değildir.`;
  }
  function fanChart(R, S) {
    const W = 640, Hh = 260, cv = el('canvas', { width: W, height: Hh, style: 'width:100%;max-width:640px;border-radius:10px;background:rgba(10,30,45,.6);margin-top:6px' }), x = cv.getContext('2d');
    const hist = S.c.slice(-Math.max(60, R.H * 4)), N = hist.length, tot = N + R.H;
    const ys = [...hist, R.q[2.5], R.q[97.5]], lo = Math.min(...ys) * 0.99, hi = Math.max(...ys) * 1.01;
    const X = i => 40 + i / (tot - 1) * (W - 60), Y = v => Hh - 25 - (v - lo) / (hi - lo) * (Hh - 45);
    x.font = '11px system-ui'; x.fillStyle = '#9cc'; for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; x.fillText(nf(v, v < 10 ? 3 : 0), 2, Y(v) + 4); }
    const band = (a, b, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(X(N - 1), Y(R.last)); x.lineTo(X(tot - 1), Y(R.q[b])); x.lineTo(X(tot - 1), Y(R.q[a])); x.closePath(); x.fill(); };
    band(2.5, 97.5, 'rgba(95,224,234,.12)'); band(10, 90, 'rgba(95,224,234,.22)'); band(25, 75, 'rgba(95,224,234,.35)');
    x.strokeStyle = '#e8f4f8'; x.lineWidth = 2; x.beginPath(); hist.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.stroke();
    x.setLineDash([5, 4]); x.strokeStyle = '#ffe066'; x.beginPath(); x.moveTo(X(N - 1), Y(R.last)); x.lineTo(X(tot - 1), Y(R.q[50])); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#ffe066'; x.fillText(`medyan ${nf(R.q[50], R.q[50] < 10 ? 4 : 2)}`, Math.min(W - 110, X(tot - 1) - 100), Y(R.q[50]) - 6);
    x.fillStyle = '#9cc'; x.fillText(`${N} gün geçmiş`, 42, Hh - 6); x.fillText(`+${R.H} gün`, X(tot - 1) - 40, Hh - 6);
    return cv;
  }
  async function showForecast(subject, h) {
    setPhase('thinking', 'KAHİN veriyi topluyor…');
    try {
      const R = await forecast(subject, h, { status: t => setPhase('thinking', t) }), S = await series(subject);
      setPhase('idle', 'Hazırım.');
      const b = bubble('ai', text(R)); try { answerTools(b.el, text(R)); } catch {} b.el.append(fanChart(R, S));
      return R;
    } catch (e) { setPhase('idle', 'Hazırım.'); throw e; }
  }

  /* ================= CANLI SİCİL ================= */
  const LOG = () => store.get('kahinLog', []);
  function logForecast(R) {
    const L = LOG(); const id = 'k' + Date.now().toString(36);
    L.push({ id, s: R.subject, label: R.label, H: R.H, t: R.t, due: R.due, last: R.last, p: Math.round(R.p * 1000) / 1000, q10: R.q[10], q90: R.q[90], q50: R.q[50], skilled: R.M.skilled });
    store.set('kahinLog', L.slice(-500));
    try { if (R.M.skilled) window.jarvisZoiRecord?.([`KAHİN: ${R.label} ${R.H} gün sonra ${R.p >= 0.5 ? 'şimdiki ' + nf(R.last) + ' üstünde' : 'şimdiki ' + nf(R.last) + ' altında'}`, String(Math.round(Math.max(R.p, 1 - R.p) * 100)), isoLocal(new Date(R.due)).slice(0, 10)]); } catch {}
  }
  async function resolveDue() {
    const L = LOG(); let ch = 0;
    for (const x of L.filter(x => !x.done && x.due < Date.now() - 3600000).slice(0, 8)) {
      try { cache.delete(fold(x.s)); const S = await series(x.s); const i = S.t.findIndex(t => t >= x.due - DAY / 2); const px = i >= 0 ? S.c[i] : null; if (!px) continue; x.done = true; x.actual = px; x.up = px > x.last ? 1 : 0; x.in80 = px >= x.q10 && px <= x.q90 ? 1 : 0; ch++; } catch {}
    }
    if (ch) store.set('kahinLog', L);
    return ch;
  }
  setInterval(() => { if (!document.hidden) resolveDue().catch(() => {}); }, 3 * 3600000); setTimeout(() => resolveDue().catch(() => {}), 40000);
  async function scorecard() {
    await resolveDue().catch(() => {});
    const D = LOG().filter(x => x.done); if (!D.length) return `Henüz vadesi dolmuş KAHİN tahmini yok (${LOG().length} açık tahmin). Vadesi gelenler otomatik puanlanır.`;
    const br = mean(D.map(x => (x.p - x.up) ** 2)), sk = D.filter(x => x.skilled), hit = sk.length ? mean(sk.map(x => ((x.p >= 0.5 ? 1 : 0) === x.up ? 1 : 0))) : null;
    return `📒 KAHİN CANLI KARNESİ · ${D.length} sonuçlanmış tahmin\nBrier: ${br.toFixed(3)} (0,25 = yazı-tura; düşük daha iyi)\n${sk.length ? `Avantajlı denen ${sk.length} tahminde yön isabeti: %${Math.round(hit * 100)}` : 'Avantajlı (anlamlı) tahmin henüz sonuçlanmadı'}\n%80 aralık isabeti: %${Math.round(mean(D.map(x => x.in80)) * 100)} (hedef %80)\nSon 5: ${D.slice(-5).map(x => `${x.label} ${x.H}g: %${Math.round(x.p * 100)}↑ → ${x.up ? 'yükseldi' : 'düştü'}${x.in80 ? ' (aralıkta)' : ' (aralık dışı)'}`).join(' · ')}`;
  }

  /* ================= TOPLU TARAMA ================= */
  const UNIVERSE = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'gram altın', 'ons', 'dolar', 'euro', 'BIST 100', 'THYAO', 'ASELS', 'S&P 500', 'Nasdaq', 'AAPL', 'NVDA'];
  async function scan(hRaw, list = UNIVERSE, status = () => {}) {
    const H = horizonOf(hRaw), out = [];
    for (const [k, s] of list.entries()) { status(`KAHİN tarıyor ${k + 1}/${list.length}: ${s}`); try { const R = await forecast(s, H, { noLog: true }); out.push(R); } catch (e) { out.push({ subject: s, err: e.message }); } await new Promise(r => setTimeout(r, 0)); }
    const ok = out.filter(r => !r.err).sort((a, b) => (b.M.skilled - a.M.skilled) || Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5));
    const row = R => `${R.M.skilled ? '★' : '·'} ${R.label}: ${R.M.skilled ? `%${Math.round(Math.max(R.p, 1 - R.p) * 100)} ${R.p >= 0.5 ? '↑' : '↓'}` : '≈%50 (yön yok)'} · %80 aralık ${nf(Math.log(R.q[10] / R.last) * 100, 1)}%…${pctS(Math.log(R.q[90] / R.last))} · beceri ${pctS(R.M.bss)} (p=${R.M.pval.toFixed(2)})`;
    return `🔮 KAHİN TARAMASI · ${H} gün · ${ok.length} varlık\n★ = geçmişte ölçülmüş anlamlı avantaj; · = yön tahmini güvenilir değil, yalnız aralık\n${ok.map(row).join('\n')}${out.some(r => r.err) ? '\nAlınamayan: ' + out.filter(r => r.err).map(r => r.subject).join(', ') : ''}\nBilgi amaçlıdır, yatırım tavsiyesi değildir.`;
  }

  /* ================= PİYASA sekmesine KAHİN bölümü ================= */
  function panel() {
    const pane = document.getElementById('p-market'); if (!pane || pane.querySelector('#kahinBox')) return;
    const sIn = el('input', { id: 'kahinSym', placeholder: 'BTC, gram altın, dolar, THYAO, BIST 100…' }), hSel = el('select', { id: 'kahinH', 'aria-label': 'Vade' }, new Option('1 gün', '1'), new Option('7 gün', '7'), new Option('30 gün', '30'));
    hSel.value = '7';
    const go = async () => { const s = sIn.value.trim(); if (!s) return; document.getElementById('drawer')?.classList.remove('open'); try { await showForecast(s, hSel.value); } catch (e) { note(e.message); } };
    pane.insertBefore(el('div', { id: 'kahinBox' }, el('h3', {}, '🔮 KAHİN — ÖLÇÜLMÜŞ TAHMİN'), el('p', { class: 'muted' }, 'Her tahmin, modelin hiç görmediği geçmiş veride test edilir; avantaj yoksa bunu açıkça söyler. Aralıklar oynaklık modeliyle hesaplanır.'),
      el('div', { class: 'row' }, sIn, hSel, el('button', { type: 'button', class: 'btn', onclick: go }, 'Tahmin et')),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', onclick: async () => { document.getElementById('drawer')?.classList.remove('open'); try { const t = await scan(hSel.value, UNIVERSE, x => setPhase('thinking', x)); setPhase('idle', 'Hazırım.'); bubble('ai', t); } catch (e) { setPhase('idle', 'Hazırım.'); note(e.message); } } }, '📡 Tümünü tara'),
        el('button', { type: 'button', class: 'btn ghost', onclick: async () => { document.getElementById('drawer')?.classList.remove('open'); bubble('ai', await scorecard()); } }, '📒 Canlı karne'))), pane.children[2] || null);
    sIn.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }
  panel(); setTimeout(panel, 1500);

  /* ================= araçlar + yönlendirme (mevcut senaryo_tahmin korunur) ================= */
  Object.assign(TOOLS, {
    kahin: { d: 'kahin|sembol (BTC, ETH, gram altın, ons, dolar, euro, BIST 100, THYAO, AAPL…)|vade gün (1/7/30) — ÖLÇÜLMÜŞ fiyat tahmini: yükseliş olasılığı (kalibre), %50/%80/%95 fiyat aralığı, modelin örneklem dışı karnesi (beceri, p-değeri), rejim. Kripto/altın/döviz/hisse fiyat tahminlerinde ÖNCE BUNU kullan.', run: async ([s, h]) => text(await forecast(s, h)) },
    kahin_tara: { d: 'kahin_tara|vade gün — 16 varlıkta (kripto, altın, döviz, BIST, ABD) KAHİN taraması; ölçülmüş avantajı olanlar ★', run: async ([h]) => scan(h) },
    kahin_karne: { d: 'kahin_karne — KAHİN’in canlı sicili: vadesi dolan tahminlerin Brier puanı, yön isabeti, aralık isabeti', run: () => scorecard() }
  });
  TOOL_GROUPS.push([/tahmin|kahin|yükselir mi|yukselir mi|düşer mi|duser mi|ne olur|ne kadar olur|nereye gider|olasılık|olasilik|beklenti/i, /^(kahin|kahin_tara|kahin_karne)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nKAHİN: kripto, altın, döviz, hisse/endeks FİYAT tahmini sorulursa önce kahin aracını çağır (ölçülmüş olasılık + aralık + karne). Sonucu yorumlarken: karne “avantaj yok” diyorsa yön iddia etme, aralığı öne çıkar; olasılığı kesinlik gibi sunma; al/sat deme. Haber/olay bağlamı gerekiyorsa ardından senaryo_tahmin ile birleştir.';
  const _lc = localCommand;
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    let m;
    if ((m = f.match(/^(?:kahin\s+)?(.{2,25}?)\s+(\d{1,2})\s*(gun|gunluk|hafta|haftalik|ay|aylik)(?:luk|lik)?\s+(?:tahmin(?:i|in)?|kahin)$/)) || (m = f.match(/^kahin\s+(.{2,25}?)(?:\s+(\d{1,2})\s*(gun|hafta|ay))?$/))) {
      const h = m[2] ? +m[2] * ({ hafta: 7, haftalik: 7, ay: 30, aylik: 30 }[m[3]] || 1) : 7;
      setTimeout(() => showForecast(m[1], h).catch(e => note(e.message)), 10); return '🔮 KAHİN hesaplıyor (ileriye dönük test birkaç saniye sürer)…';
    }
    // serbest söyleyiş: “BTC tahmin ver”, “gram altın ne olur”, “dolar yükselir mi”, “THYAO için 30 günlük tahmin” → yapay zekâ beklemeden KAHİN
    const ASSET = /^(btc|bitcoin|eth|ethereum|eter|sol|solana|xrp|ripple|bnb|doge|dogecoin|ada|avax|link|ltc|ton|trx|dot|pepe|shib|sui|altin|gram altin|gram|ceyrek|ceyrek altin|yarim altin|tam altin|ons|ons altin|gumus|dolar|dolar tl|euro|avro|sterlin|bist|bist 100|bist100|borsa|borsa istanbul|thyao|asels|aselsan|garan|akbnk|kchol|sise|eregl|tuprs|bimas|nasdaq|s&p|s&p 500|sp500|dow|dax|apple|aapl|nvda|nvidia|tesla|tsla|msft|[a-z]{2,6})$/;
    if ((m = f.match(/^(.{2,22}?)(?:\s+(?:icin|için))?\s+(?:(\d{1,3})\s*(gun|gunluk|hafta|haftalik|ay|aylik)\w*\s+)?(?:tahmin(?:i|in|ini)?(?:\s+(?:ver|et|yap|nedir|ne))?|ne olur|ne olacak|nereye gider|yukselir mi|duser mi|artar mi|azalir mi)$/)) && ASSET.test(m[1].trim()) && !/^(hava|mac|secim|enflasyon|faiz|deprem|yarin|bugun|bu|ne|hafta|ay|yil|sene|bu yil|o|sonra|gelecek|durum)$/.test(m[1].trim()) && window.__kahinSkip !== t0) {
      const h = m[2] ? +m[2] * ({ hafta: 7, haftalik: 7, ay: 30, aylik: 30 }[m[3]] || 1) : /hafta/.test(f) ? 7 : /ay\b/.test(f) ? 30 : 7;
      setTimeout(() => showForecast(m[1].trim(), h).catch(e => { if (/bulamadım|en az 320|veri/.test(e.message)) { window.__kahinSkip = t0; typedTurn(t0, false); } else note('KAHİN: ' + e.message); }), 10); /* piyasa sembolü değilse soru normal yapay zekâya gider */ return `🔮 KAHİN ${h} günlük tahmini hesaplıyor (yapay zekâ kotası gerekmez)…`;
    }
    if (/^(tahmin ver|tahmin et|tahmin yap|piyasa tahmini|tahminler|ne olacak piyasa)$/.test(f)) { setTimeout(async () => { try { const s = await scan(7, UNIVERSE, x => setPhase('thinking', x)); setPhase('idle', 'Hazırım.'); bubble('ai', s); } catch (e) { setPhase('idle', 'Hazırım.'); note(e.message); } }, 10); return '📡 KAHİN 16 varlık için 7 günlük tahmin hazırlıyor (1–2 dk, yapay zekâ kotası gerekmez)… Tek varlık için: “BTC tahmin ver”, “gram altın 30 günlük tahmin”.'; }
    if ((m = f.match(/^kahin (?:taramasi|tara)\s*(\d{1,2})?/))) { setTimeout(async () => { try { const s = await scan(m[1] || 7, UNIVERSE, x => setPhase('thinking', x)); setPhase('idle', 'Hazırım.'); bubble('ai', s); } catch (e) { setPhase('idle', 'Hazırım.'); note(e.message); } }, 10); return '📡 KAHİN 16 varlığı tarıyor (1–2 dk)…'; }
    if (/^kahin (?:karnesi|karne|sicili)$/.test(f)) { setTimeout(async () => bubble('ai', await scorecard()), 10); return '📒 Karne hazırlanıyor…'; }
    return _lc(t0);
  };
  window.jarvisKahin = { series, features, model, forecast, simulate, coverage, garch, text, scan, scorecard, resolveDue, showForecast, horizonOf };
})();
