'use strict';
/* SATÜRN 22.1 — BEKÇİ: sürekli sistem taraması + kendi kendini onarma (kotasız)
 *  1) VERİ KAYNAKLARI: Satürn'ün kullandığı her dış kaynağı Beyhan'ın cihazından gerçekten dener (Binance REST + WebSocket,
 *     vadeli, Korku-Açgözlülük, CoinGecko, döviz, Kapalıçarşı, Yahoo'ya giden her geçit, haber geçitleri, GDELT, USGS,
 *     Open-Meteo, Pollinations, Europe PMC, Gemini anahtarı). Gecikme ve hata kaydedilir.
 *  2) OTOMATİK ONARIM: çalışan geçitler öne, ölüler sona alınır (hisse + haber); canlı akış koptuysa yeniden açılır;
 *     bozuk önbellek kayıtları karantinaya alınır (hasta/kasa gibi asıl veriler ASLA silinmez); takılı durumlar ULTRON nabzıyla çözülür.
 *  3) İÇ TESTLER: modüllerin yüklenip yüklenmediği ve çekirdek hesapların (RSI, parametreler, niyet yakalama) doğruluğu.
 *  4) ÇALIŞMA HATALARI: yakalanmayan her hata hangi modülden geldiğiyle kaydedilir; rapor tek dokunuşla kopyalanıp
 *     geliştiriciye (Claude) gönderilebilir — kod düzeltmesi güncellemeyle gelir (uygulama kendi kodunu yazmaz: güvenlik).
 *  Zamanlama: açılıştan 3 dk sonra, sonra 6 saatte bir (ekran açıkken) ve internet geri gelince. */
(() => {
  const BN = 'https://data-api.binance.vision/api/v3/';
  const DAY = 86400000;
  const guest = () => !!window.jarvisUltra?.guest?.();
  const keyOf = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };

  /* ---------- çalışma hataları ---------- */
  const errs = store.get('grdErrs', []);
  let errDirty = false;
  function catchErr(msg, src) {
    msg = String(msg || '').slice(0, 200); if (!msg || /ResizeObserver|Script error\.?$|AbortError|The user aborted/.test(msg)) return;
    const mod = (String(src || '').match(/\/([a-z0-9-]+)\.js/i) || [])[1] || 'bilinmiyor';
    const k = mod + '|' + msg.slice(0, 80); const e = errs.find(x => x.k === k);
    if (e) { e.n++; e.last = Date.now(); } else errs.push({ k, mod, msg, n: 1, first: Date.now(), last: Date.now() });
    errs.sort((a, b) => b.last - a.last); errs.length = Math.min(errs.length, 40); errDirty = true;
  }
  window.addEventListener('error', e => catchErr(e.message, e.filename || e.error?.stack));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; catchErr(r?.message || r, r?.stack); });
  setInterval(() => { if (errDirty) { store.set('grdErrs', errs.filter(x => Date.now() - x.last < 7 * DAY)); errDirty = false; } }, 20000);

  /* ---------- prob araçları ---------- */
  const tFetch = (url, o = {}, ms = 10000) => withTimeout(fetch(url, o), ms, 'zaman aşımı');
  const jOk = (url, test, o, ms) => async () => { let r; try { r = await tFetch(url, o, ms); } catch (e) { if (o || !window.jarvisBridge?.on() || /yahoo|allorigins|codetabs|rss2json|binance|script\.google/.test(url)) throw e; /* geçit denemeleri kendi başına ölçülür */ const t = await window.jarvisViaBridge(url, ms || 20000); if (!test(JSON.parse(t))) throw Error('beklenmeyen yanıt'); return; } if (!r.ok) throw Error('HTTP ' + r.status); const j = await r.json(); if (!test(j)) throw Error('beklenmeyen yanıt'); };
  const tOk = (url, test, ms) => async () => { const r = await tFetch(url, {}, ms); if (!r.ok) throw Error('HTTP ' + r.status); const t = await r.text(); if (!test(t)) throw Error('beklenmeyen yanıt'); };
  const YURL = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d';
  const RSS = 'https://feeds.bbci.co.uk/turkce/rss.xml';
  const YGATES = [['doğrudan', u => u], ['allorigins', u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)], ['codetabs', u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)]];
  const yOk = j => j?.chart?.result?.[0]?.meta?.regularMarketPrice > 0;
  function wsProbe() {
    return new Promise((res, rej) => {
      let ws, done = false; const end = (ok, why) => { if (done) return; done = true; try { ws?.close(); } catch {} ok ? res() : rej(Error(why)); };
      try { ws = new WebSocket('wss://data-stream.binance.vision/stream?streams=btcusdt@miniTicker'); } catch (e) { return rej(e); }
      ws.onmessage = () => end(true); ws.onerror = () => end(false, 'bağlanamadı'); ws.onclose = () => end(false, 'kapandı');
      setTimeout(() => end(false, '8 sn içinde veri gelmedi'), 8000);
    });
  }
  const imgOk = url => () => new Promise((res, rej) => { const i = new Image(); const t = setTimeout(() => rej(Error('zaman aşımı')), 25000); i.onload = () => { clearTimeout(t); res(); }; i.onerror = () => { clearTimeout(t); rej(Error('yüklenmedi')); }; i.src = url; });
  const PROBES = [
    ['kripto', 'Binance fiyat', jOk(BN + 'ticker/price?symbol=BTCUSDT', j => +j.price > 0), 1],
    ['kripto', 'Binance mum verisi', jOk(BN + 'klines?symbol=PAXGUSDT&interval=1d&limit=2', j => Array.isArray(j) && j.length === 2), 1],
    ['kripto', 'Binance canlı akış (WebSocket)', wsProbe, 1],
    ['kripto', 'Binance vadeli (fonlama)', jOk('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', j => 'lastFundingRate' in j)],
    ['kripto', 'Korku-Açgözlülük endeksi', jOk('https://api.alternative.me/fng/?limit=1', j => !!j.data?.[0]?.value)],
    ['kripto', 'CoinGecko', jOk('https://api.coingecko.com/api/v3/global', j => !!j.data)],
    ['doviz', 'Döviz kuru (Frankfurter/ECB)', jOk('https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY', j => j.rates?.TRY > 0)],
    ['doviz', 'Döviz kuru (ExchangeRate-API)', jOk('https://open.er-api.com/v6/latest/USD', j => j.rates?.TRY > 0)],
    ['altin', 'Kapalıçarşı fiyatı (Truncgil)', jOk('https://finans.truncgil.com/v4/today.json', j => !!j && typeof j === 'object')],
    ['hisse', 'Hisse · kendi Google köprün', async () => { if (!window.jarvisBridge?.on()) throw Error('kurulmadı — PİYASA → Hisse köprüsü'); await jOk(window.jarvisBridge.wrap(YURL.replace('AAPL', 'THYAO.IS')), yOk, undefined, 20000)(); }, 0, 'köprü'],
    ...YGATES.map(([n, g]) => ['hisse', 'Yahoo hisse · ' + n, jOk(g(YURL), yOk), 0, n]),
    ['haber', 'Haber geçidi · rss2json', jOk('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(RSS), j => Array.isArray(j.items) && j.items.length > 0), 0, 'rss2json'],
    ['haber', 'Haber geçidi · allorigins', tOk('https://api.allorigins.win/raw?url=' + encodeURIComponent(RSS), t => /<item|<entry/.test(t), 15000), 0, 'allorigins'],
    ['haber', 'Haber geçidi · codetabs', tOk('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(RSS), t => /<item|<entry/.test(t), 15000), 0, 'codetabs'],
    ['haber', 'GDELT dünya haberleri', jOk('https://api.gdeltproject.org/api/v2/doc/doc?query=economy&mode=artlist&format=json&maxrecords=1', j => Array.isArray(j.articles), undefined, 20000)],
    ['afet', 'Deprem (USGS)', jOk('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=1', j => Array.isArray(j.features))],
    ['hava', 'Hava (Open-Meteo)', jOk('https://api.open-meteo.com/v1/forecast?latitude=37.33&longitude=42.19&current=temperature_2m', j => j.current?.temperature_2m != null)],
    ['gorsel', 'Görsel üretimi (Pollinations)', imgOk('https://image.pollinations.ai/prompt/blue%20circle?width=64&height=64&nologo=true&seed=7')],
    ['arastirma', 'Tıbbi literatür (Europe PMC)', jOk('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=physiotherapy&format=json&pageSize=1', j => j.hitCount >= 0, undefined, 20000)],
    ['arastirma', 'PubMed (NCBI)', jOk('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=physiotherapy&retmax=1&retmode=json', j => !!j.esearchresult, undefined, 15000)],
    ['ses', 'CANLI ses modeli (gemini-3.8-live)', () => new Promise((res, rej) => {
      const k = keyOf(); if (!k) return rej(Error('anahtar girilmemiş'));
      let ws, done = false; const end = (ok, why) => { if (done) return; done = true; try { ws?.close(); } catch {} ok ? res() : rej(Error(why)); };
      try { ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(k)); } catch (e) { return rej(e); }
      ws.onopen = () => { try { ws.send(JSON.stringify({ setup: { model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'] } } })); } catch {} };
      ws.onmessage = async ev => { let m = {}; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch {} if (m.setupComplete) end(true); };
      ws.onclose = e => end(false, /quota|RESOURCE_EXHAUSTED/i.test(e.reason) ? 'kota dolu' : /not found|NOT_FOUND/i.test(e.reason) ? 'model bu anahtarda yok' : 'kapandı ' + e.code + (e.reason ? ' · ' + String(e.reason).slice(0, 60) : ''));
      setTimeout(() => end(false, '10 sn içinde cevap yok'), 10000);
    }), 1],
    ['ses', 'Doğal ses (Gemini 3.8 TTS)', async () => {
      const k = keyOf(); if (!k) throw Error('anahtar girilmemiş');
      let last = '';
      for (const m of ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']) {
        const r = await tFetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Tamam.' }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: 'Charon' } } } }) }, 20000);
        if (r.ok) { const d = await r.json(); if (d.candidates?.[0]?.content?.parts?.some(p => p.inlineData?.data)) return; last = m + ': ses gelmedi'; continue; }
        last = m + ': HTTP ' + r.status + (r.status === 429 ? ' (günlük ücretsiz ses kotası doldu — TSİ 11:00 yenilenir; o zamana dek CANLI hat ya da telefon sesi okur)' : '');
      }
      throw Error(last);
    }, 0, undefined, 'manual'],
    ['ses', 'Telefonun Türkçe sesi', async () => {
      const ss = window.speechSynthesis; if (!ss) throw Error('bu tarayıcıda yok');
      let v = ss.getVoices(); if (!v.length) { await new Promise(r => { ss.onvoiceschanged = r; setTimeout(r, 500); }); v = ss.getVoices(); }
      const tr = v.filter(x => /^tr/i.test(x.lang || '')); if (!tr.length) throw Error('Türkçe ses yüklü değil — iPhone: Ayarlar → Erişilebilirlik → Seslendirilen İçerik → Sesler → Türkçe');
      deviceVoiceName = tr.map(x => x.name).slice(0, 3).join(', ');
    }],
    ['yz', 'Gemini anahtarı', async () => { const k = keyOf(); if (!k) throw Error('anahtar girilmemiş'); const r = await tFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': k } }); if (r.status === 400 || r.status === 403) throw Error('anahtar geçersiz/izinsiz (HTTP ' + r.status + ')'); if (r.status === 429) throw Error('kota dolu (TSİ 11:00 yenilenir)'); if (!r.ok) throw Error('HTTP ' + r.status); }, 1]
  ];
  const CAT = { kripto: 'Kripto', doviz: 'Döviz', altin: 'Altın', hisse: 'Hisse', haber: 'Haber', afet: 'Afet', hava: 'Hava', ses: 'Ses', gorsel: 'Görsel', arastirma: 'Araştırma', yz: 'Yapay zekâ' };

  let deviceVoiceName = '';
  /* ---------- iç testler (çevrimdışı, anında) ---------- */
  const MODS = [['jarvisMarkets', 'Piyasa'], ['jarvisNews', 'Haber'], ['jarvisPicks', 'Haftalık seçim'], ['jarvisForecast', 'Tahmin'], ['jarvisResearch', 'Araştırma'], ['jarvisWebResearch', 'Web araştırma'], ['jarvisResearch2', 'Makale/ölçek'], ['jarvisImage', 'Görsel'], ['jarvisStage', 'Sahne/tasarım'], ['jarvisKlinik2', 'Klinik'], ['jarvisExpert', 'Uzman'], ['jarvisUltra', 'Ultra'], ['jarvisLive', 'CANLI ses'], ['jarvisUltron', 'ULTRON görev'], ['jarvisUltronLife', 'ULTRON yaşam']];
  function selfTests() {
    const T = [], t = (name, fn) => { try { T.push([name, !!fn()]); } catch (e) { T.push([name, false, e.message]); } };
    const up = Array.from({ length: 160 }, (_, i) => 100 * Math.exp(0.004 * i + 0.01 * Math.sin(i)));
    t('RSI hesabı (düşen seri < 30)', () => window.jarvisMarkets.rsi(Array.from({ length: 60 }, (_, i) => 200 - i)) < 30);
    t('9 parametre (yükselen seri: trend 3/3, 30g > 0)', () => { const f = window.jarvisPicks.feat({ c: up, v: up.map(() => 1) }, up.length - 1); return f.trend === 3 && f.r30 > 0 && f.sd > 0; });
    t('Haftalık seçim niyeti', () => window.jarvisPicks.isPick('bana haftada 3 token öner') && !window.jarvisPicks.isPick('hasta öner'));
    t('Tahmin niyeti', () => window.jarvisForecast.isForecast('bitcoin ne olacak') === 'bitcoin' && !window.jarvisForecast.isForecast('yarın hava nasıl olacak'));
    t('Vade çözümleme', () => window.jarvisForecast.horizon('1 hafta') === 7 && window.jarvisForecast.horizon('3 ay') === 90);
    t('Araç kayıtları', () => ['haftalik_secim', 'senaryo_tahmin', 'piyasa_tara', 'fiyat', 'web_arastir', 'gorsel_olustur'].every(k => TOOLS[k]?.run));
    return T;
  }
  // depolama bütünlüğü: bozuk JSON → karantina; yalnız ÖNBELLEK anahtarları silinir, asıl veriler korunur
  const CACHE = /^jarvisapp\.(pkLast|mktLast|newsGate|pkGate|news[A-Z]\w*|grdHealth|grdLast|ultronEvoDay|pkTried|lastBrief)$/;
  function storageCheck() {
    const bad = [], healed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!/^jarvisapp\./.test(k)) continue;
      const v = localStorage.getItem(k) || ''; if (!/^\s*[[{"]/.test(v)) continue; // düz metin kayıtlar (ör. model adı) JSON değildir — bozuk sayılmaz
      try { JSON.parse(v); } catch { bad.push(k); }
    }
    for (const k of bad) {
      if (CACHE.test(k)) { try { const q = JSON.parse(localStorage.getItem('jarvisapp.grdQuar') || '{}'); q[k] = String(localStorage.getItem(k)).slice(0, 2000); localStorage.setItem('jarvisapp.grdQuar', JSON.stringify(q)); localStorage.removeItem(k); healed.push(k.replace('jarvisapp.', '')); } catch {} }
    }
    return { bad: bad.map(k => k.replace('jarvisapp.', '')), healed };
  }

  /* ---------- tam tarama ---------- */
  let running = null;
  async function scan({ silent = false, manual = false } = {}) {
    if (running) return running;
    running = (async () => {
      const t0 = Date.now(), res = [];
      let i = 0;
      await Promise.all(Array.from({ length: 5 }, async () => {
        while (i < PROBES.length) {
          const [cat, name, fn, crit, gate, only] = PROBES[i++]; const s = Date.now();
          if (only === 'manual' && !manual) continue; // kotalı deneme yalnız elle taramada
          if (gate === 'köprü' && !window.jarvisBridge?.on()) continue; // kurulmamış köprü arıza sayılmaz
          try { await fn(); res.push({ cat, name, ok: true, ms: Date.now() - s, crit, gate }); } catch (e) { res.push({ cat, name, ok: false, ms: Date.now() - s, why: String(e.message || e).slice(0, 90), crit, gate }); }
        }
      }));
      res.sort((a, b) => PROBES.findIndex(p => p[1] === a.name) - PROBES.findIndex(p => p[1] === b.name));
      const fixes = heal(res);
      const R = { t: t0, dur: Date.now() - t0, res, tests: selfTests(), mods: MODS.map(([g, n]) => [n, !!window[g]]), store: storageCheck(), errs: errs.filter(x => Date.now() - x.last < DAY), fixes };
      R.store.healed.forEach(k => fixes.push(`bozuk önbellek kaydı “${k}” karantinaya alındı`));
      const prev = store.get('grdLast', null);
      store.set('grdLast', { t: R.t, res: R.res.map(({ name, ok, ms, why, cat }) => ({ name, ok, ms, why, cat })), fixes: R.fixes });
      const H = store.get('grdHealth', {}); for (const r of res) { const h = H[r.name] ||= { ok: 0, fail: 0 }; r.ok ? h.ok++ : h.fail++; h.last = r.ok; } store.set('grdHealth', H);
      // yeni çöken kritik kaynak → bir kez haber ver
      const newly = res.filter(r => r.crit && !r.ok && (prev?.res || []).find(p => p.name === r.name)?.ok !== false);
      if (!silent && newly.length) note('🛡 Bekçi: ' + newly.map(r => `${r.name} çalışmıyor (${r.why})`).join(' · '));
      for (const f of fixes) window.jarvisUltronLife?.log?.('onarım', 'Bekçi: ' + f);
      paint(R);
      return R;
    })();
    try { return await running; } finally { running = null; }
  }
  function heal(res) {
    const fixes = [];
    // geçit sıralaması: çalışan öne, ölen sona (Yahoo/hisse ve haber)
    const rank = (key, cat) => {
      const g = res.filter(r => r.cat === cat && r.gate); if (!g.length) return;
      const R = store.get(key, {}), before = JSON.stringify(R);
      for (const r of g) R[r.gate] = r.ok ? Math.max(R[r.gate] || 0, 8) + Math.max(0, 5 - Math.round(r.ms / 1000)) : -5;
      store.set(key, R);
      if (JSON.stringify(R) !== before) { const best = g.filter(r => r.ok).sort((a, b) => a.ms - b.ms)[0]; fixes.push(best ? `${CAT[cat]} geçitleri yeniden sıralandı: en hızlı çalışan “${best.gate}” öne alındı` : `${CAT[cat]} için hiçbir geçit çalışmıyor — “köprüyü kur” de (telefondan, bilgisayar gerekmez)`); }
    };
    rank('pkGate', 'hisse'); rank('newsGate', 'haber');
    // canlı akış: test geçti ama uygulamadaki bağlantı ölü → yeniden aç
    const ws = res.find(r => /WebSocket/.test(r.name)), L = window.jarvisPicks?.live;
    if (ws?.ok && L && opt('liveFeed') !== '0' && (!L.ws || L.ws.readyState > 1 || Date.now() - L.last > 60000)) { window.jarvisPicks.liveConnect(); fixes.push('canlı fiyat akışı kopuktu → yeniden bağlandı'); }
    // ses sistemi + takılı durumlar (ULTRON nabzı)
    try { window.jarvisUltronLife?.pulse?.(true).then(f => f.forEach(x => fixes.push(x))).catch(() => {}); } catch {}
    return fixes;
  }

  /* ---------- rapor ---------- */
  function report(R = null) {
    R ||= lastFull; if (!R) { const l = store.get('grdLast', null); if (!l) return 'Henüz tarama yapılmadı. “sistemi tara” de.'; R = { ...l, tests: selfTests(), mods: MODS.map(([g, n]) => [n, !!window[g]]), store: storageCheck(), errs: errs.filter(x => Date.now() - x.last < DAY) }; }
    const ok = R.res.filter(r => r.ok).length, L = [`🛡 SİSTEM TARAMASI — ${new Date(R.t).toLocaleString('tr-TR')} · sürüm ${document.querySelector('script[src*="app.js?v="]')?.src.split('v=')[1] || '?'}`];
    L.push(`\nVERİ KAYNAKLARI: ${ok}/${R.res.length} çalışıyor`);
    for (const [c, n] of Object.entries(CAT)) { const g = R.res.filter(r => r.cat === c); if (!g.length) continue; L.push(`${n}: ` + g.map(r => `${r.ok ? '✓' : '✗'} ${r.name.replace(/^.*· /, '')}${r.ok ? (r.name === 'Telefonun Türkçe sesi' && deviceVoiceName ? ` (${deviceVoiceName})` : ` ${r.ms} ms`) : ` (${r.why})`}`).join(' · ')); }
    try { const sv = k => store.get('set.' + k, ''); L.push(`SES AYARLARI: sesli yanıt ${setting('speakOn') === '1' || sv('speakOn') === '1' ? 'AÇIK' : 'KAPALI'} · doğal ses düşerse ${({ auto: 'telefon sesi (otomatik)', '1': 'telefon sesi', '0': 'YALNIZ EKRAN (sessiz)' })[sv('deviceFallback') || 'auto'] || sv('deviceFallback')} · mikrofon ${sv('talkMode') === 'klasik' ? 'klasik dinleme' : 'CANLI'} · son doğal ses: ${localStorage.getItem('jarvisapp.ttsModel') || '—'} · CANLI model: ${store.get('liveModel', '') || 'henüz bağlanmadı'}`); } catch {}
    const mOk = R.mods.filter(m => m[1]).length; L.push(`\nMODÜLLER: ${mOk}/${R.mods.length} yüklü${mOk < R.mods.length ? ' — eksik: ' + R.mods.filter(m => !m[1]).map(m => m[0]).join(', ') : ''}`);
    const tOk = R.tests.filter(x => x[1]).length; L.push(`İÇ TESTLER: ${tOk}/${R.tests.length} geçti${tOk < R.tests.length ? ' — başarısız: ' + R.tests.filter(x => !x[1]).map(x => x[0] + (x[2] ? ' (' + x[2] + ')' : '')).join('; ') : ''}`);
    L.push(`DEPOLAMA: ${R.store.bad.length ? 'bozuk kayıt: ' + R.store.bad.join(', ') + (R.store.healed.length ? ' (önbellek olanlar karantinaya alındı)' : ' (asıl veri — silinmedi, yedekten geri yüklenebilir)') : 'sağlam'}`);
    L.push(`ÇALIŞMA HATALARI (24 saat): ${R.errs.length ? R.errs.slice(0, 6).map(e => `${e.mod}: ${short(e.msg, 70)} ×${e.n}`).join(' · ') : 'yok'}`);
    if (R.fixes?.length) L.push(`\nOTOMATİK ONARIM:\n• ` + R.fixes.join('\n• '));
    const dead = R.res.filter(r => !r.ok);
    if (dead.length) L.push('\nNE YAPMALI: ' + [
      dead.some(r => r.cat === 'hisse') && R.res.filter(r => r.cat === 'hisse').every(r => !r.ok) ? 'hisse verisi için Satürn’e “köprüyü kur” de — telefondan 5 dakikada kurulur, bilgisayar GEREKMEZ' : '',
      R.res.filter(r => r.cat === 'doviz').every(r => !r.ok) ? 'döviz: Binance USDT/TRY kuru yedek olarak kullanılıyor' : '',
      dead.some(r => r.name === 'Gemini anahtarı') ? 'Gemini anahtarını kontrol et (Ayarlar)' : '',
      dead.some(r => r.cat === 'kripto' && r.crit) ? 'kripto verisi alınamıyor: internet/VPN ya da Binance erişimini kontrol et' : '',
      'kalan sorunlar geçici olabilir; bekçi 6 saatte bir yeniden dener ve çalışanı öne alır'
    ].filter(Boolean).join(' · '));
    return L.join('\n');
  }
  let lastFull = null;
  async function runAndShow() {
    bubble('me', '🛡 Tüm sistemi tara');
    try { await window.jarvisUltra?.showDoctor?.(); } catch {} // iç teşhis (ayarlar, ses, depolama, bağlantı) + bekçi (dış kaynaklar)
    setPhase('thinking', 'Bekçi: veri kaynaklarını, modülleri ve iç testleri tarıyorum…');
    try {
      lastFull = await scan({ manual: true });
      const t = report(lastFull); const n = bubble('ai', t);
      n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: async e => { try { await navigator.clipboard.writeText(t); e.target.textContent = '✓ Kopyalandı — Claude’a yapıştırabilirsin'; } catch { e.target.textContent = 'Kopyalanamadı; metni seçip kopyala'; } } }, '📋 Raporu kopyala (geliştiriciye gönder)')));
      return t;
    } finally { setPhase('idle', 'Hazır.'); }
  }

  /* ---------- zamanlama ---------- */
  const due = () => Date.now() - (store.get('grdLast', null)?.t || 0) > 6 * 3600000;
  const auto = () => { if (!document.hidden && navigator.onLine && !guest() && opt('guardAuto') !== '0' && due()) scan({ silent: false }).catch(() => {}); };
  setTimeout(auto, 180000);
  setInterval(auto, 30 * 60000);
  window.addEventListener('online', () => setTimeout(() => { if (Date.now() - (store.get('grdLast', null)?.t || 0) > 600000) auto(); }, 5000));

  /* ---------- panel ---------- */
  const box = el('div', { id: 'grdBox' }), list = el('ul', { class: 'list', id: 'grdList' });
  const sel = el('select', { id: 'guardAuto' }); sel.append(new Option('Açık — 6 saatte bir tüm kaynakları dener, onarır', '1'), new Option('Kapalı', '0')); sel.value = store.get('set.guardAuto', '1'); sel.onchange = () => store.set('set.guardAuto', sel.value);
  box.append(el('h3', {}, 'BEKÇİ · SİSTEM TARAMASI'), el('p', { class: 'muted' }, 'Tüm veri kaynaklarını cihazından gerçekten dener, çalışmayan geçitleri sona alır, bozuk önbelleği temizler, hataları kaydeder. Kota harcamaz.'),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer')?.classList.remove('open'); runAndShow().catch(e => note(e.message)); } }, '🛡 Tüm sistemi şimdi tara')),
    list, el('div', { class: 'field' }, el('label', { for: 'guardAuto' }, 'Otomatik tarama'), sel));
  ($('ultronLife') || $('p-settings'))?.append(box);
  function paint(R) {
    const l = R || store.get('grdLast', null);
    list.replaceChildren(...(l ? l.res.map(r => el('li', { class: 'item' }, el('span', {}, r.ok ? '✓' : '✗'), el('div', {}, el('p', {}, r.name), el('small', {}, r.ok ? r.ms + ' ms' : r.why || '')))) : [el('li', { class: 'muted' }, 'Henüz tarama yok.')]));
  }
  paint();

  /* ---------- komut, araç ---------- */
  Object.assign(TOOLS, { sistem_tarama: { d: 'sistem_tarama — BEKÇİ: tüm veri kaynaklarını (kripto, altın, döviz, hisse geçitleri, haber, hava, görsel, literatür, Gemini) gerçekten dener, modülleri ve iç testleri denetler, çalışmayanı onarır/yeniden sıralar; rapor verir', run: async () => { const R = await scan({ manual: true }); lastFull = R; return report(R); } } });
  TOOL_GROUPS.push([/sistem|tara|kontrol|sağlık|çalışmıyor|bozuk|hata|onar/i, /^sistem_tarama$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => { const l = store.get('grdLast', null); const dead = (l?.res || []).filter(r => !r.ok).map(r => r.name); return _tp() + '\nSİSTEM TARAMASI TELEFONDA yapılır, bilgisayar GEREKMEZ: “tam sistem taraması / sistemi tara / kendini kontrol et” → hemen sistem_tarama aracını çalıştır; ASLA “bilgisayarda yapılmalı” deme, bilgisayar aracına yönlendirme.\nBEKÇİ: “sistemi tara / çalışıyor mu / neden çalışmıyor” → sistem_tarama.' + (dead.length ? ` Son taramada çalışmayan kaynaklar: ${dead.join(', ')} — bunlara dayanan işlerde Beyhan’a kısaca söyle, alternatif yol kullan.` : ''); };
  // “tam sistem taraması yap”, “sistemini tara”, “kendini kontrol et”, “bütün sistemleri test et”… — bilgisayar GEREKMEZ, telefonda çalışır
  const isScan = t => t.length <= 80 && !/(bilgisayar|pc|laptop|virüs|antivir|disk|windows|mac)/i.test(t) && (
    /^(sağlık raporu|bekçi raporu|sistem raporu)$/i.test(t) ||
    /\b(sistem|sistemi|sistemini|sistemleri|sistemlerini|kendini|kendi kendini|tüm sistem|bütün sistem|veri kaynaklarını|kaynakları)\b[^.?!]{0,30}\b(tara|taraması|taramasını|taramayı|kontrol et|kontrol|test et|denetle|denetimi|incele)/i.test(t) ||
    /\b(tam|full|genel|komple|detaylı)\s+(sistem\s+)?(tarama|taraması|kontrol|kontrolü|denetim|denetimi)\b/i.test(t));
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn|ultron)[,\s]+/i, '').replace(/[?.!]+$/, '');
    if (!guest() && isScan(t)) { setTimeout(() => runAndShow().catch(e => note(e.message)), 30); return 'Bekçi taramayı başlattı: veri kaynakları, modüller, iç testler (10-30 sn)…'; }
    return _lc(text0);
  };
  window.jarvisGuardian = { scan, report, selfTests, storageCheck, errors: () => errs, runAndShow, PROBES, catchErr };
})();
