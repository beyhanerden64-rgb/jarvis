'use strict';
/* SATÜRN 13 — PİYASA MERKEZİ: tüm dijital piyasaları tarar (bilgi amaçlı; işlem yapmaz, yatırım tavsiyesi vermez).
 *  • Kripto: CoinGecko ilk 100 (piyasa değeri, 1s/24s/7g değişim) + Binance canlı fiyat ve günlük mumlar (RSI, SMA50/200, hacim patlaması)
 *  • Altın/gümüş: PAXG (ons altın karşılığı, canlı) × USDT/TRY → gram, çeyrek, yarım, tam (has altın karşılığı); varsa Kapalıçarşı fiyatı (Truncgil)
 *  • Döviz: USD, EUR, GBP / TRY (Binance canlı + ECB)
 *  • Hisse, endeks, emtia: BIST 100, S&P 500, Nasdaq, DAX, Brent, gümüş vadeli, tek tek hisseler (THYAO, AAPL…)
 *      bilgisayar yardımcısı bağlıysa Yahoo verisi (gerçek), değilse Gemini web araması (gecikmeli olabilir; kaynağı belirtilir)
 *  • Fırsat/risk radarı, takip listesi, fiyat alarmları (telefona bildirim), yapay zekâ piyasa yorumu */
(() => {
  const BN = 'https://data-api.binance.vision/api/v3/';
  const NOTE = 'Bilgi amaçlıdır, yatırım tavsiyesi değildir.';
  const OZ = 31.1034768;
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, Number(v) >= 1000 ? 0 : d) });
  const pct = v => (v >= 0 ? '+' : '') + nf(v, 2) + '%';
  const getJ = async (url, ms = 12000) => { const r = await withTimeout(fetch(url), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const cache = new Map();
  const cached = async (k, ms, fn) => { const c = cache.get(k); if (c && Date.now() - c.t < ms) return c.v; const v = await fn(); cache.set(k, { t: Date.now(), v }); return v; };

  /* ---------- kaynaklar ---------- */
  const usdtry = () => cached('usdtry', 60000, async () => {
    try { return +(await getJ(BN + 'ticker/price?symbol=USDTTRY')).price; }
    catch { return +(await getJ('https://api.frankfurter.app/latest?from=USD&to=TRY')).rates.TRY; }
  });
  const fx = () => cached('fx', 300000, async () => {
    const u = await usdtry(); let r = {};
    try { r = (await getJ('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CHF,JPY')).rates; } catch {}
    return { USD: u, EUR: r.EUR ? u / r.EUR : null, GBP: r.GBP ? u / r.GBP : null, CHF: r.CHF ? u / r.CHF : null };
  });
  async function gold() {
    return cached('gold', 60000, async () => {
      const [p, u] = await Promise.all([getJ(BN + 'ticker/24hr?symbol=PAXGUSDT'), usdtry()]);
      const ons = +p.lastPrice, gram = ons / OZ * u;
      const out = { ons, onsCh: +p.priceChangePercent, gram, ceyrek: gram * 1.604, yarim: gram * 3.208, tam: gram * 6.416, kaynak: 'PAXG ons × USDT/TRY (has altın karşılığı)' };
      try { // Kapalıçarşı/kuyumcu fiyatı (varsa)
        const t = await getJ('https://finans.truncgil.com/v4/today.json', 7000);
        const pick = re => { const k = Object.keys(t).find(x => re.test(fold(x))); const v = k && t[k]; const n = v && +(String(v.Selling ?? v.selling ?? v.Satış ?? '').replace(/\./g, '').replace(',', '.')); return n > 0 ? n : null; };
        const piyasa = { gram: pick(/^(gra|gram ?altin|gram-altin)$/), ceyrek: pick(/ceyrek/), yarim: pick(/yarim/), tam: pick(/^tam/), cumhuriyet: pick(/cumhuriyet/), gumus: pick(/gumus/) };
        if (piyasa.gram) out.piyasa = piyasa;
      } catch {}
      return out;
    });
  }
  async function cryptoTop(n = 100) {
    return cached('ctop' + n, 120000, async () => {
      try {
        const d = await getJ(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${n}&page=1&price_change_percentage=1h,24h,7d`);
        return d.map(c => ({ sym: c.symbol.toUpperCase(), name: c.name, price: c.current_price, cap: c.market_cap, rank: c.market_cap_rank, vol: c.total_volume, ch1h: c.price_change_percentage_1h_in_currency, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h, ch7: c.price_change_percentage_7d_in_currency, ath: c.ath_change_percentage, src: 'CoinGecko' }));
      } catch { // yedek: Binance USDT çiftleri (hacme göre)
        const d = await getJ(BN + 'ticker/24hr?type=MINI', 20000);
        return d.filter(x => /USDT$/.test(x.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|USDP|EUR|PAXG)USDT$/.test(x.symbol)).map(x => ({ sym: x.symbol.replace(/USDT$/, ''), name: x.symbol.replace(/USDT$/, ''), price: +x.lastPrice, vol: +x.quoteVolume, ch24: (+x.lastPrice / +x.openPrice - 1) * 100, src: 'Binance' }))
          .sort((a, b) => b.vol - a.vol).slice(0, n).map((x, i) => ({ ...x, rank: i + 1 }));
      }
    });
  }
  // teknik göstergeler (günlük mumlar)
  const rsi = (c, p = 14) => { if (c.length <= p) return null; let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; d > 0 ? g += d : l -= d; } g /= p; l /= p; for (let i = p + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
  const sma = (c, n, end = c.length) => end < n ? null : c.slice(end - n, end).reduce((a, b) => a + b, 0) / n;
  async function tech(sym) {
    return cached('tech' + sym, 600000, async () => {
      const k = await getJ(`${BN}klines?symbol=${sym}USDT&interval=1d&limit=210`);
      const c = k.map(x => +x[4]), v = k.map(x => +x[7]);
      const s50 = sma(c, 50), s200 = sma(c, 200), p50 = sma(c, 50, c.length - 5), p200 = sma(c, 200, c.length - 5);
      const avgV = sma(v, 20, v.length - 1);
      return { rsi: rsi(c), s50, s200, cross: s50 && s200 && p50 && p200 ? (p50 <= p200 && s50 > s200 ? 'altın kesişim' : p50 >= p200 && s50 < s200 ? 'ölüm kesişimi' : '') : '', volX: avgV ? v.at(-1) / avgV : null, last: c.at(-1) };
    });
  }

  // hisse / endeks / emtia
  const BIST = 'THYAO ASELS GARAN AKBNK BIMAS EREGL KCHOL SAHOL SISE TUPRS YKBNK ISCTR FROTO TOASO PGSUS KOZAL SASA HEKTS PETKM TCELL TTKOM ARCLK ENKAI EKGYO KRDMD VESTL ALARK ASTOR GUBRF ODAS MGROS AEFES ULKER DOAS OYAKC CIMSA TAVHL SOKM BRSAN VAKBN HALKB KONTR SMRTG CCOLA ENJSA TTRAK OTKAR'.split(' ');
  const NAMES = { 'turk hava yollari': 'THYAO', thy: 'THYAO', aselsan: 'ASELS', garanti: 'GARAN', akbank: 'AKBNK', bim: 'BIMAS', eregli: 'EREGL', koc: 'KCHOL', 'koc holding': 'KCHOL', sabanci: 'SAHOL', sisecam: 'SISE', tupras: 'TUPRS', 'yapi kredi': 'YKBNK', 'is bankasi': 'ISCTR', ford: 'FROTO', 'ford otosan': 'FROTO', tofas: 'TOASO', pegasus: 'PGSUS', turkcell: 'TCELL', 'turk telekom': 'TTKOM', arcelik: 'ARCLK', vestel: 'VESTL', migros: 'MGROS', ulker: 'ULKER',
    apple: 'AAPL', tesla: 'TSLA', nvidia: 'NVDA', microsoft: 'MSFT', amazon: 'AMZN', google: 'GOOGL', alphabet: 'GOOGL', meta: 'META', netflix: 'NFLX', amd: 'AMD', intel: 'INTC', 'berkshire': 'BRK-B' };
  const INDEX = { bist: 'XU100.IS', bist100: 'XU100.IS', 'bist 100': 'XU100.IS', borsa: 'XU100.IS', 'borsa istanbul': 'XU100.IS', bist30: 'XU030.IS', 'sp500': '^GSPC', 's&p 500': '^GSPC', 's&p': '^GSPC', 'sp 500': '^GSPC', nasdaq: '^IXIC', dow: '^DJI', 'dow jones': '^DJI', dax: '^GDAXI', ftse: '^FTSE', nikkei: '^N225', brent: 'BZ=F', petrol: 'BZ=F', 'ham petrol': 'CL=F', wti: 'CL=F', dogalgaz: 'NG=F', 'dogal gaz': 'NG=F', bakir: 'HG=F', platin: 'PL=F', paladyum: 'PA=F', gumus: 'SI=F', 'gumus ons': 'SI=F', vix: '^VIX' };
  const LABEL = { 'XU100.IS': 'BIST 100', 'XU030.IS': 'BIST 30', '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow Jones', '^GDAXI': 'DAX', '^FTSE': 'FTSE 100', '^N225': 'Nikkei', 'BZ=F': 'Brent petrol', 'CL=F': 'WTI petrol', 'NG=F': 'Doğalgaz', 'HG=F': 'Bakır', 'PL=F': 'Platin', 'PA=F': 'Paladyum', 'SI=F': 'Gümüş (ons)', '^VIX': 'VIX korku endeksi' };
  async function yahoo(sym) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`;
    let j;
    try { j = await getJ(url, 6000); } // tarayıcı izin verirse doğrudan
    catch { if (typeof pcLocal === 'undefined' || !pcLocal) throw Error('yardımcı yok'); j = JSON.parse((await pcCall('web_al', [url], false)).text); }
    const m = j.chart?.result?.[0]?.meta; if (!m?.regularMarketPrice) throw Error('veri yok');
    const prev = m.chartPreviousClose || m.previousClose;
    return { sym, name: LABEL[sym] || m.shortName || sym, price: m.regularMarketPrice, ch: prev ? (m.regularMarketPrice / prev - 1) * 100 : null, cur: m.currency, src: 'Yahoo' };
  }
  async function viaSearch(list) { // bilgisayar yardımcısı yoksa: Gemini Google araması (gecikmeli olabilir)
    const t = await window.jarvisResearch.ask('Sen bir piyasa veri toplayıcısısın. Google aramasıyla BUGÜNÜN en güncel değerlerini bul. YALNIZ JSON: {"SEMBOL":{"fiyat":sayı,"degisim_yuzde":sayı,"para":"TRY|USD|EUR","saat":"veri zamanı"}}. Bulamadığını yazma; uydurma.', 'Semboller: ' + list.map(s => `${s} (${LABEL[s] || s.replace('.IS', ' Borsa İstanbul')})`).join(', '), 'quick', true);
    let j = {}; try { j = JSON.parse((t.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch {}
    return list.map(s => { const v = j[s] || j[s.replace('.IS', '')] || j[LABEL[s]]; return v && +v.fiyat ? { sym: s, name: LABEL[s] || s.replace('.IS', ''), price: +v.fiyat, ch: +v.degisim_yuzde, cur: v.para, src: 'web araması' + (v.saat ? ' · ' + v.saat : ''), web: true } : null; }).filter(Boolean);
  }
  // 10 dk önbellek: web araması (yapay zekâ kotası) her panel açılışında tekrarlanmasın
  const eqCache = new Map();
  async function equities(list) {
    const fresh = s => { const c = eqCache.get(s); return c && Date.now() - c.t < (c.v.web ? 15 : 3) * 60000 ? c.v : null; };
    const need = list.filter(s => !fresh(s));
    const got = await Promise.all(need.map(s => yahoo(s).catch(() => null)));
    const miss = need.filter((s, i) => !got[i]);
    const extra = miss.length ? await viaSearch(miss).catch(() => []) : [];
    for (const v of [...got.filter(Boolean), ...extra]) eqCache.set(v.sym, { t: Date.now(), v });
    return list.map(fresh).filter(Boolean);
  }

  /* ---------- tek fiyat: her şeyi çözen sembol çözücü ---------- */
  async function resolve(qRaw) {
    const q = fold(String(qRaw || '').trim().replace(/\s+(fiyatı|fiyati|kaç|kac|ne kadar|kuru|hissesi|hisse|coin)\b.*$/i, ''));
    if (!q) throw Error('Sembol yaz (ör. BTC, gram altın, dolar, THYAO, AAPL, BIST 100).');
    if (/^(gram ?altin|altin|gram|has altin)$/.test(q)) return { kind: 'altin', key: 'gram' };
    if (/^(ons|ons altin|xau)$/.test(q)) return { kind: 'altin', key: 'ons' };
    if (/^ceyrek/.test(q)) return { kind: 'altin', key: 'ceyrek' };
    if (/^yarim/.test(q)) return { kind: 'altin', key: 'yarim' };
    if (/^tam altin|^ata/.test(q)) return { kind: 'altin', key: 'tam' };
    if (/^(dolar|usd|amerikan dolari)$/.test(q)) return { kind: 'fx', key: 'USD' };
    if (/^(euro|eur|avro)$/.test(q)) return { kind: 'fx', key: 'EUR' };
    if (/^(sterlin|gbp|pound)$/.test(q)) return { kind: 'fx', key: 'GBP' };
    if (/^(frank|chf|isvicre frangi)$/.test(q)) return { kind: 'fx', key: 'CHF' };
    if (INDEX[q]) return { kind: 'eq', key: INDEX[q] };
    if (NAMES[q]) { const t = NAMES[q]; return { kind: 'eq', key: BIST.includes(t) ? t + '.IS' : t }; }
    const T = q.toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '');
    if (BIST.includes(T) || /\.IS$/.test(T)) return { kind: 'eq', key: /\.IS$/.test(T) ? T : T + '.IS' };
    const CN = { bitcoin: 'BTC', ethereum: 'ETH', eter: 'ETH', solana: 'SOL', ripple: 'XRP', dogecoin: 'DOGE', cardano: 'ADA', avalanche: 'AVAX', tron: 'TRX', polkadot: 'DOT', chainlink: 'LINK', litecoin: 'LTC', toncoin: 'TON', shiba: 'SHIB', pepe: 'PEPE', sui: 'SUI' };
    const C = CN[q] || T;
    if (/^[A-Z0-9]{2,10}$/.test(C)) { try { const p = await getJ(`${BN}ticker/24hr?symbol=${C}USDT`, 6000); if (p.lastPrice) return { kind: 'kripto', key: C, data: p }; } catch {} }
    return { kind: 'eq', key: T };
  }
  async function quote(qRaw) {
    const r = await resolve(qRaw);
    if (r.kind === 'altin') { const g = await gold(); if (r.key === 'ons') return { label: 'Ons altın', text: `Ons altın ${nf(g.ons)} $ (${pct(g.onsCh)} 24s)`, value: g.ons, unit: 'USD' }; const v = g.piyasa?.[r.key] || g[r.key]; return { label: { gram: 'Gram altın', ceyrek: 'Çeyrek altın', yarim: 'Yarım altın', tam: 'Tam altın' }[r.key], text: `${{ gram: 'Gram altın', ceyrek: 'Çeyrek altın', yarim: 'Yarım altın', tam: 'Tam altın' }[r.key]} ≈ ${nf(v)} TL (${g.piyasa?.[r.key] ? 'piyasa satış' : 'has altın karşılığı; kuyumcu fiyatı işçilikle farklıdır'}) · ons ${nf(g.ons)} $ ${pct(g.onsCh)}`, value: v, unit: 'TL' }; }
    if (r.kind === 'fx') { const f = await fx(); const v = f[r.key]; if (!v) throw Error('Kur alınamadı'); return { label: r.key + '/TRY', text: `${r.key}/TRY ${nf(v, 4)}`, value: v, unit: 'TL' }; }
    if (r.kind === 'kripto') { const p = r.data, u = await usdtry().catch(() => null); const v = +p.lastPrice; return { label: r.key, text: `${r.key} ${nf(v, v < 1 ? 6 : 2)} $${u ? ' (≈ ' + nf(v * u, v * u < 1 ? 4 : 0) + ' TL)' : ''} · 24s ${pct(+p.priceChangePercent)} · hacim ${nf(+p.quoteVolume / 1e6, 0)} milyon $`, value: v, unit: 'USD' }; }
    const [e] = await equities([r.key]); if (!e) throw Error(`“${qRaw}” için veri bulunamadı (hisse verisi için bilgisayar yardımcısı ya da internet araması gerekir).`);
    return { label: e.name, text: `${e.name} ${nf(e.price)} ${e.cur || ''}${e.ch != null && isFinite(e.ch) ? ' (' + pct(e.ch) + ')' : ''} · kaynak: ${e.src}`, value: e.price, unit: e.cur || '' };
  }

  /* ---------- tüm piyasa taraması ---------- */
  const watch = () => store.get('mktWatch', ['BTC', 'ETH', 'gram altın', 'dolar', 'BIST 100']);
  async function scan({ deep = true } = {}) {
    setPhase('thinking', 'Piyasaları tarıyorum: kripto, altın, döviz, borsa…');
    const EQ = ['XU100.IS', '^GSPC', '^IXIC', '^GDAXI', 'BZ=F', 'SI=F'];
    const [top, g, f, eq] = await Promise.all([cryptoTop(100).catch(() => []), gold().catch(() => null), fx().catch(() => null), equities(EQ).catch(() => [])]);
    const gainers = [...top].filter(c => c.ch24 != null).sort((a, b) => b.ch24 - a.ch24).slice(0, 5), losers = [...top].filter(c => c.ch24 != null).sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
    const breadth = top.length ? top.filter(c => c.ch24 > 0).length / top.length * 100 : null;
    // radar: hacmi en yüksek 12 kripto için teknik tarama
    const radar = [];
    if (deep) {
      const cand = [...top].sort((a, b) => (b.vol || 0) - (a.vol || 0)).filter(c => !/^(USDT|USDC|DAI|FDUSD|TUSD|USDE|PYUSD|WBTC|STETH|WSTETH|WETH|WEETH)$/.test(c.sym)).slice(0, 12);
      const ts = await Promise.all(cand.map(c => tech(c.sym).then(t => ({ c, t })).catch(() => null)));
      for (const x of ts.filter(Boolean)) {
        const { c, t } = x, tags = [];
        if (t.rsi != null && t.rsi < 30) tags.push(`aşırı satım (RSI ${nf(t.rsi, 0)})`);
        if (t.rsi != null && t.rsi > 70) tags.push(`aşırı alım (RSI ${nf(t.rsi, 0)})`);
        if (t.cross) tags.push(t.cross);
        if (t.volX && t.volX > 2) tags.push(`hacim ${nf(t.volX, 1)} kat`);
        if (Math.abs(c.ch24 || 0) > 8) tags.push(`24s ${pct(c.ch24)}`);
        if (t.s200 && t.last) tags.push(t.last > t.s200 ? '200 günlük ortalamanın üstünde' : '200 günlük ortalamanın altında');
        radar.push({ sym: c.sym, tags, rsi: t.rsi, hot: tags.length > 1 });
      }
    }
    const res = { t: Date.now(), top, gainers, losers, breadth, gold: g, fx: f, eq, radar };
    store.set('mktLast', { t: res.t, gold: g && { gram: g.gram, ons: g.ons }, fx: f, breadth });
    logOp('piyasa taraması', [], 'başarılı', `${top.length} kripto · ${eq.length} endeks/emtia`);
    setPhase('idle', 'Hazır.');
    return res;
  }
  function scanText(s) {
    const L = [`📈 PİYASA TARAMASI · ${new Date(s.t).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`];
    if (s.gold) L.push(`ALTIN: gram ≈ ${nf(s.gold.piyasa?.gram || s.gold.gram)} TL · çeyrek ≈ ${nf(s.gold.piyasa?.ceyrek || s.gold.ceyrek, 0)} TL · ons ${nf(s.gold.ons)} $ (${pct(s.gold.onsCh)})${s.gold.piyasa?.gumus ? ` · gümüş gram ${nf(s.gold.piyasa.gumus)} TL` : ''}`);
    if (s.fx) L.push(`DÖVİZ: dolar ${nf(s.fx.USD, 4)} · euro ${s.fx.EUR ? nf(s.fx.EUR, 4) : '-'} · sterlin ${s.fx.GBP ? nf(s.fx.GBP, 4) : '-'} TL`);
    if (s.eq.length) L.push('BORSA/EMTİA: ' + s.eq.map(e => `${e.name} ${nf(e.price)}${e.ch != null && isFinite(e.ch) ? ' (' + pct(e.ch) + ')' : ''}`).join(' · ') + (s.eq.some(e => e.web) ? ' [web araması; gecikmeli olabilir]' : ''));
    if (s.top.length) {
      const btc = s.top.find(c => c.sym === 'BTC'), eth = s.top.find(c => c.sym === 'ETH');
      L.push(`KRİPTO (${s.top.length} varlık, ${s.top[0].src}): ${btc ? `BTC ${nf(btc.price, 0)} $ (${pct(btc.ch24)})` : ''}${eth ? ` · ETH ${nf(eth.price, 0)} $ (${pct(eth.ch24)})` : ''} · yükselen oranı %${nf(s.breadth, 0)}`);
      L.push('  En çok yükselen: ' + s.gainers.map(c => `${c.sym} ${pct(c.ch24)}`).join(', '));
      L.push('  En çok düşen: ' + s.losers.map(c => `${c.sym} ${pct(c.ch24)}`).join(', '));
    }
    const hot = s.radar.filter(r => r.tags.some(t => /aşırı|kesişim|hacim|24s/.test(t)));
    if (hot.length) L.push('RADAR (teknik sinyal): ' + hot.map(r => `${r.sym}: ${r.tags.filter(t => !/ortalamanın/.test(t)).join(', ')}`).join(' · '));
    L.push(NOTE);
    return L.join('\n');
  }
  async function showScan(withAI = false) {
    bubble('me', '📈 Tüm piyasayı tara');
    try {
      const s = await scan(); let t = scanText(s);
      if (withAI) {
        setPhase('thinking', 'Piyasa yorumu hazırlıyorum…');
        const c = await window.jarvisResearch.ask('Sen tarafsız bir piyasa analistisin. TÜRKÇE, en çok 120 kelime: genel risk iştahı, öne çıkan hareketler, dikkat edilmesi gerekenler. Kesin al/sat tavsiyesi verme; gelecek için olasılıklı bir eğilim cümlesi kurabilirsin; teknik sinyallerin kesinlik taşımadığını hatırlat. Sonunda "Yatırım tavsiyesi değildir."', t, 'default').catch(() => '');
        if (c) t += '\n\nYORUM: ' + c;
        setPhase('idle', 'Hazır.');
      }
      const n = bubble('ai', t);
      addLinks(n.el, [{ url: 'https://www.coingecko.com/', title: 'CoinGecko' }, { url: 'https://www.tradingview.com/markets/', title: 'TradingView piyasalar' }]);
      answerTools(n.el, t);
      if (s.gainers.length) window.jarvisUltra?.drawChart?.('Kripto 24 saat: en çok yükselen/düşen (%)', [...s.gainers, ...s.losers].map(c => [c.sym, Math.round(c.ch24 * 10) / 10]), 'bar');
      renderPanel(s);
      return t;
    } catch (e) { setPhase('idle', 'Hazır.'); note('Piyasa taranamadı: ' + e.message); }
  }

  /* ---------- alarmlar ---------- */
  let alarms = store.get('mktAlarms', []);
  const saveA = () => { store.set('mktAlarms', alarms); renderPanel(); };
  function addAlarm(sym, op, val, note2 = '') {
    val = Number(String(val).replace(/\./g, '').replace(',', '.')); if (!sym || !(val > 0) || !/^[<>]$/.test(op)) throw Error('Örnek: “BTC 100000 üstüne çıkarsa haber ver” ya da piyasa_alarm|ekle|gram altın|<|3000');
    alarms.push({ id: uid('ma'), sym: String(sym).trim(), op, val, note: note2, created: Date.now() }); saveA();
    return `Alarm kuruldu: ${sym} ${op === '>' ? 'üstüne çıkınca' : 'altına inince'} ${nf(val)}. Uygulama açıkken 5 dakikada bir bakarım; tetiklenince telefonuna da bildiririm.`;
  }
  async function checkAlarms() {
    if (!alarms.length || !navigator.onLine) return [];
    const fired = [];
    for (const a of alarms) {
      try {
        // hisse/endeks web aramasıyla geliyorsa (bilgisayar yardımcısı yok) en çok saatte bir bak: yapay zekâ kotasını koru
        const r = await resolve(a.sym);
        if (r.kind === 'eq' && !(typeof pcLocal !== 'undefined' && pcLocal) && Date.now() - (a.lastWeb || 0) < 3600000) continue;
        if (r.kind === 'eq') a.lastWeb = Date.now();
        const q = await quote(a.sym);
        if ((a.op === '>' && q.value > a.val) || (a.op === '<' && q.value < a.val)) fired.push({ a, q });
      } catch {}
    }
    if (fired.length) {
      alarms = alarms.filter(a => !fired.some(f => f.a === a)); saveA();
      const t = '🔔 PİYASA ALARMI\n' + fired.map(f => `• ${f.q.text}  →  koşul: ${f.a.op === '>' ? '>' : '<'} ${nf(f.a.val)}`).join('\n');
      const n = bubble('ai', t); answerTools(n.el, t);
      if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(fired.map(f => f.q.text).join(' · '), { title: 'SATÜRN piyasa alarmı', tags: 'chart_with_upwards_trend', priority: 4 }).catch(() => {});
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      logOp('piyasa alarmı', fired.map(f => f.a.sym), 'başarılı');
    }
    return fired;
  }
  setInterval(() => { if (!document.hidden) checkAlarms().catch(() => {}); }, 300000);
  setTimeout(() => checkAlarms().catch(() => {}), 20000);

  /* ---------- araçlar + komutlar ---------- */
  Object.assign(TOOLS, {
    piyasa_tara: { d: 'piyasa_tara|yorum (isteğe bağlı) — TÜM piyasa: kripto ilk 100 (yükselen/düşen, teknik radar), altın (gram/çeyrek/ons), döviz, BIST 100, S&P 500, Nasdaq, DAX, petrol, gümüş', run: async ([y]) => { const s = await scan(); setTimeout(() => { const t = scanText(s); const n = bubble('ai', t); answerTools(n.el, t); renderPanel(s); }, 30); return scanText(s) + (y ? '\n(Yorum istendi: tarafsız özetle, tavsiye verme.)' : ''); } },
    fiyat: { d: 'fiyat|sembol veya ad — anlık fiyat: kripto (BTC, SOL…), altın (gram, çeyrek, ons), döviz (dolar, euro), hisse (THYAO, ASELS, AAPL, NVDA), endeks (BIST 100, Nasdaq, DAX), emtia (brent, gümüş, bakır)', run: async ([q]) => (await quote(q)).text + ' · ' + NOTE },
    piyasa_alarm: { d: 'piyasa_alarm|ekle|sembol|> veya <|değer · piyasa_alarm|liste · piyasa_alarm|sil|sembol — fiyat alarmı (telefona bildirim)', run: async ([op, s, o, v]) => { op = fold(op || 'liste'); if (op === 'ekle') return addAlarm(s, o, v); if (op === 'sil') { const n = alarms.length; alarms = alarms.filter(a => fold(a.sym) !== fold(s)); saveA(); return n - alarms.length + ' alarm silindi'; } return alarms.map(a => `${a.sym} ${a.op} ${nf(a.val)}`).join(', ') || 'alarm yok'; } }
  });
  WRITE_TOOLS.add?.('piyasa_alarm');
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nPİYASA: fiyat sorularında fiyat, genel piyasa/“piyasalar nasıl” sorularında piyasa_tara, fiyat alarmı için piyasa_alarm kullan. Fiyat ya da yön tahmini istenirse senaryo_tahmin ile olasılıklı senaryolar ver; garanti verme, “kesin al/sat” deme; teknik göstergelerin kesinlik taşımadığını ve kararın Beyhan’a ait olduğunu belirt.';
  const known = x => { const f = fold(x.trim()); return /altin|ceyrek|ons\b|dolar|euro|avro|sterlin|frank|bitcoin|ethereum|borsa|bist|nasdaq|dax|petrol|brent|gumus|hisse|coin/.test(f) || !!INDEX[f] || !!NAMES[f] || /^(btc|eth|sol|xrp|bnb|doge|ada|avax|trx|ton|link|dot|ltc|usdt)$/.test(f) || /^[A-Z]{3,6}$/.test(x.trim()); };
  const _lc = localCommand;
  localCommand = text => {
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|ultron)[,\s]+/i, '');
    let m;
    if (/^(?:tüm |bütün )?(?:piyasa|piyasalar)(?:ı|yı|ları|lari|yi)? (?:tara|taraması|nasıl|ne durumda)\??$|^piyasa taraması$/i.test(t)) { setTimeout(() => showScan(/nasıl|durumda/i.test(t)), 30); return 'Tüm piyasayı tarıyorum: kripto, altın, döviz ve borsalar…'; }
    if ((m = t.match(/^(.{2,30}?)\s+(\d[\d.,]*)\s*(?:\$|dolar|tl|lira)?\s*(üstüne|üzerine|altına)\s*(?:çıkarsa|çıkınca|geçerse|geçince|düşerse|inerse|inince|düşünce)?\s*(?:bana\s+)?(?:haber ver|bildir|uyar|alarm kur)$/i))) { try { return addAlarm(m[1], /altına/i.test(m[3]) ? '<' : '>', m[2]); } catch (e) { return e.message; } }
    if ((m = t.match(/^(.{2,30}?)\s+(?:fiyatı|fiyati|kaç|kac|ne kadar|kuru)(?:\s+(?:dolar|tl|lira))?\??$/i)) && known(m[1])) { setTimeout(async () => { try { const q = await quote(m[1]); const n = bubble('ai', q.text + '\n' + NOTE); answerTools(n.el, q.text); } catch (e) { note(e.message); } }, 30); return 'Bakıyorum…'; }
    return _lc(text);
  };

  /* ---------- panel ---------- */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-market', 'aria-selected': 'false', 'data-p': 'market' }, 'PİYASA');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
  const body = el('div', { id: 'mktBody', class: 'muted' }, 'Taramak için düğmeye dokun.');
  const wl = el('ul', { class: 'list', id: 'mktWatch' }), al = el('ul', { class: 'list', id: 'mktAlarms' });
  const wIn = el('input', { id: 'mktWatchIn', placeholder: 'Takibe ekle: BTC, gram altın, THYAO, Nasdaq…' });
  const aSym = el('input', { id: 'mktASym', placeholder: 'Sembol (BTC, dolar…)' }), aOp = el('select', { id: 'mktAOp', 'aria-label': 'Koşul' }), aVal = el('input', { id: 'mktAVal', inputmode: 'decimal', placeholder: 'Değer' });
  aOp.append(new Option('üstüne çıkınca', '>'), new Option('altına inince', '<'));
  const p = el('div', { class: 'pane', id: 'p-market', role: 'tabpanel' },
    el('h3', {}, 'PİYASA TARAMASI'),
    el('p', { class: 'muted' }, 'Kripto (ilk 100), altın, döviz, BIST 100, ABD ve Avrupa endeksleri, petrol, gümüş. ' + NOTE),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); showScan(false); } }, '📈 Tüm piyasayı tara'), el('button', { type: 'button', class: 'btn ghost', onclick: () => { $('drawer').classList.remove('open'); showScan(true); } }, 'Tara + yorum')),
    body,
    el('h3', {}, 'TAKİP LİSTEM'),
    el('div', { class: 'row' }, wIn, el('button', { type: 'button', class: 'btn', onclick: () => { const v = wIn.value.trim(); if (!v) return; store.set('mktWatch', [...new Set([...watch(), v])].slice(0, 20)); wIn.value = ''; renderWatch(); } }, 'Ekle')),
    wl,
    el('h3', {}, 'FİYAT ALARMLARI'),
    el('div', { class: 'row mktalarm' }, aSym, aOp, aVal, el('button', { type: 'button', class: 'btn', onclick: () => { try { note(addAlarm(aSym.value, aOp.value, aVal.value)); aSym.value = aVal.value = ''; } catch (e) { note(e.message); } } }, 'Kur')),
    al);
  p.hidden = true; $('p-settings').before(p);
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(x => x.hidden = x.id !== 'p-market'); renderWatch(); renderPanel(); };
  async function renderWatch() {
    wl.replaceChildren(...watch().map(s => { const v = el('small', {}, '…'); quote(s).then(q => { v.textContent = q.text; }).catch(e => { v.textContent = e.message; }); return el('li', { class: 'item' }, el('span', {}, '◈'), el('div', {}, el('p', {}, el('b', {}, s)), v), el('button', { type: 'button', class: 'btn ghost', 'aria-label': s + ' takipten çıkar', onclick: () => { store.set('mktWatch', watch().filter(x => x !== s)); renderWatch(); } }, '×')); }));
  }
  function renderPanel(s) {
    if (s) body.textContent = scanText(s);
    al.replaceChildren(...(alarms.length ? alarms.map(a => el('li', { class: 'item' }, el('span', {}, '🔔'), el('div', {}, el('p', {}, `${a.sym} ${a.op === '>' ? 'üstüne çıkınca' : 'altına inince'} ${nf(a.val)}`), el('small', {}, dateTR(a.created))), el('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Alarmı sil', onclick: () => { alarms = alarms.filter(x => x !== a); saveA(); } }, '×'))) : [el('li', { class: 'muted' }, 'Alarm yok. Örnek: “BTC 100000 üstüne çıkarsa haber ver”.')]));
  }
  renderPanel();
  window.jarvisTickerExtra = (prev => () => { const l = store.get('mktLast', null); return [...(prev?.() || []), l?.gold?.gram ? `GRAM ALTIN ${nf(l.gold.gram, 0)} TL` : '']; })(window.jarvisTickerExtra);
  window.jarvisMarkets = { scan, scanText, showScan, quote, resolve, gold, fx, cryptoTop, tech, equities, addAlarm, checkAlarms, alarms: () => alarms, rsi };
})();
