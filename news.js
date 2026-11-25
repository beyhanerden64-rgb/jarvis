'use strict';
/* SATÜRN 14 — GÜNDEM MERKEZİ: anlık haber akışı ve dünya gündemi (tarafsız, kaynaklı).
 *  Kaynak: haber sitelerinin RSS akışları (AA, TRT, BBC Türkçe, DW, BBC, Al Jazeera, Guardian, NYT, Fed, ECB, DSÖ, GDACS…) + GDELT + USGS/EMSC deprem verisi
 *          + DSÖ salgın bildirimleri; hiçbiri ulaşılamazsa Gemini web araması (gecikmeli olabilir, belirtilir).
 *  Başlıklar: SON DAKİKA · Ekonomi · Para & finans · Merkez bankaları · Sağlık · Siyaset & dünya · Hükümet kararları · Doğal afetler
 *             · Bölgeler: ABD, Avrupa, Çin, Rusya, Türkiye
 *  Aynı olayı yazan kaynaklar kümelenir (kaç kaynak = önem); son 1 saatte çok kaynaklı haber = SON DAKİKA.
 *  İngilizce başlıklar Türkçeye çevrilir (tek kısa çağrı); "brifing" tarafsız özet yazar; ilgi alarmları telefona bildirir. */
(() => {
  const GD = 'https://api.gdeltproject.org/api/v2/doc/doc?mode=ArtList&format=json&sort=DateDesc&maxrecords=40';
  const CATS = {
    ekonomi: { ad: 'Ekonomi', q: '(economy OR inflation OR GDP OR recession OR unemployment OR enflasyon OR ekonomi OR büyüme OR işsizlik)' },
    finans: { ad: 'Para & finans', q: '(stocks OR "stock market" OR bonds OR "oil prices" OR gold OR bitcoin OR borsa OR piyasalar OR dolar OR altın)' },
    merkez: { ad: 'Merkez bankaları', q: '("Federal Reserve" OR "European Central Bank" OR "Bank of England" OR "Bank of Japan" OR "Peoples Bank of China" OR "Central Bank of Russia" OR "Merkez Bankası" OR TCMB OR "interest rate decision" OR "faiz kararı")' },
    saglik: { ad: 'Sağlık', q: '("World Health Organization" OR outbreak OR epidemic OR pandemic OR vaccine OR "public health" OR salgın OR aşı OR "Sağlık Bakanlığı" OR hastalık)' },
    siyaset: { ad: 'Siyaset & dünya', q: '(president OR parliament OR election OR summit OR "prime minister" OR war OR ceasefire OR cumhurbaşkanı OR meclis OR seçim OR zirve)' },
    karar: { ad: 'Hükümet kararları', q: '("Resmi Gazete" OR kararname OR "executive order" OR sanctions OR yaptırım OR "new law" OR regulation OR tariff OR gümrük OR "government decision")' },
    afet: { ad: 'Doğal afetler', q: '(earthquake OR tsunami OR flood OR wildfire OR hurricane OR typhoon OR volcano OR deprem OR sel OR "orman yangını" OR kasırga)' },
    abd: { ad: 'ABD', q: '("White House" OR Congress OR Washington OR "U.S. government" OR Pentagon OR "Supreme Court")' },
    avrupa: { ad: 'Avrupa', q: '("European Union" OR "European Commission" OR Brussels OR NATO OR "European Parliament" OR Bundestag OR Elysee)' },
    cin: { ad: 'Çin', q: '(China OR Beijing OR "Xi Jinping" OR Chinese OR Çin OR Pekin)' },
    rusya: { ad: 'Rusya', q: '(Russia OR Kremlin OR Moscow OR Putin OR Rusya OR Kremlin)' },
    turkiye: { ad: 'Türkiye', q: '(Türkiye OR Turkey OR Ankara OR Erdoğan OR TBMM OR Bakanlık)', extra: ' sourcecountry:turkey' }
  };
  const DAY = 86400000;
  let feed = store.get('newsFeed', {}); // kategori → {t, items}
  const saveFeed = () => { try { store.set('newsFeed', feed); } catch { feed = {}; } };
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'şimdi' : m < 60 ? m + ' dk önce' : m < 1440 ? Math.round(m / 60) + ' sa önce' : Math.round(m / 1440) + ' gün önce'; };
  const getJ = async (url, ms = 15000) => {
    try { const r = await withTimeout(fetch(url), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return await r.json(); }
    catch (e) {
      try { return JSON.parse(await window.jarvisViaBridge(url)); } catch {} // GDELT vb. engelliyse kendi köprüsü
      if (typeof pcLocal !== 'undefined' && pcLocal) return JSON.parse((await pcCall('web_al', [url], false)).text); throw e;
    }
  };
  // GDELT istek sınırı: 5 sn'de bir → sıraya al
  let gq = Promise.resolve(), lastG = 0;
  const gdelt = (q, span = '12h') => (gq = gq.then(async () => { const w = (window.__gdeltGap ?? 5200) - (Date.now() - lastG); if (w > 0) await new Promise(r => setTimeout(r, w)); lastG = Date.now(); return getJ(`${GD}&timespan=${span}&query=${encodeURIComponent(q)}`); }).catch(e => { throw e; }));
  const pdate = s => { const m = String(s || '').match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now(); };
  const toks = s => new Set(fold(s).replace(/[^a-z0-9çğıöşü ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  const sim = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, Math.min(a.size, b.size)); };
  function cluster(arts) {
    const cl = [];
    for (const a of arts) {
      const tk = toks(a.title); if (tk.size < 2) continue;
      const c = cl.find(c => sim(c.tk, tk) >= 0.5);
      if (c) { if (!c.domains.includes(a.domain)) c.domains.push(a.domain); c.t = Math.max(c.t, a.t); c.n++; c.img ||= a.img; }
      else cl.push({ title: a.title, url: a.url, img: a.img || '', domain: a.domain, domains: [a.domain], lang: a.lang, t: a.t, n: 1, tk });
    }
    return cl.map(({ tk, ...c }) => ({ ...c, src: c.domains.length, breaking: Date.now() - c.t < 75 * 60000 && c.domains.length >= 3 || /breaking|son dakika|urgent|flaş/i.test(c.title) }))
      .sort((a, b) => (b.breaking - a.breaking) || (b.src - a.src) || (b.t - a.t));
  }
  async function fetchCat(key, { force = false } = {}) {
    const C = CATS[key]; if (!C) throw Error('Kategori: ' + Object.keys(CATS).join(', '));
    if (!force && feed[key] && Date.now() - feed[key].t < 10 * 60000) return feed[key].items;
    let items;
    try {
      items = cluster(await collect(key, C.q + (C.extra || ''), key === 'afet' ? '24h' : '12h')).slice(0, 15);
      if (!items.length) throw Error('boş');
    } catch (e) { items = await viaSearch(key).catch(() => []); if (!items.length) items = feed[key]?.items || []; }
    feed[key] = { t: Date.now(), items }; saveFeed();
    return items;
  }
  async function viaSearch(key) { // GDELT'e ulaşılamazsa: Gemini Google araması
    const t = await window.jarvisResearch.ask('Sen bir haber ajansı editörüsün. Google aramasıyla SON 12 SAATİN en önemli haberlerini bul. Tarafsız ol. YALNIZ JSON dizi: [{"baslik":"Türkçe başlık","kaynak":"site adı","url":"https://…","saat":"ISO zaman veya boş"}] en çok 8 öğe. Uydurma; bulamazsan boş dizi.', 'Konu: ' + CATS[key].ad + ' — ' + CATS[key].q.replace(/[()"]/g, ''), 'quick', true);
    let arr = []; try { arr = JSON.parse((t.match(/\[[\s\S]*\]/) || ['[]'])[0]); } catch {}
    return arr.filter(x => x?.baslik && /^https?:\/\//.test(x.url || '')).map(x => ({ title: x.baslik, tr: x.baslik, url: x.url, domain: x.kaynak || new URL(x.url).hostname, domains: [x.kaynak || ''], src: 1, t: Date.parse(x.saat) || Date.now(), lang: 'tr', web: true, breaking: false }));
  }
  /* ---------- RSS katmanı: haber sitelerinin kendi akışları (GDELT'e ulaşılamasa da çalışır) ----------
   * Tarayıcı doğrudan izin vermezse ücretsiz RSS okuyucu/geçit servisleri denenir; çalışan yol hatırlanır. */
  const G = 1; // genel akış → başlığa göre süz
  const FEEDS = {
    son: [['https://feeds.bbci.co.uk/turkce/rss.xml', 'BBC Türkçe'], ['https://rss.dw.com/rdf/rss-tur-all', 'DW Türkçe'], ['https://www.aa.com.tr/tr/rss/default?cat=guncel', 'AA'], ['https://www.trthaber.com/sondakika.rss', 'TRT Haber'], ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World'], ['https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera'], ['https://www.theguardian.com/world/rss', 'The Guardian']],
    ekonomi: [['https://www.aa.com.tr/tr/rss/default?cat=ekonomi', 'AA Ekonomi'], ['https://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business'], ['https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml', 'NYT Economy'], ['https://www.theguardian.com/business/economics/rss', 'Guardian Economics']],
    finans: [['https://www.aa.com.tr/tr/rss/default?cat=ekonomi', 'AA Ekonomi'], ['https://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business'], ['https://www.cnbc.com/id/10000664/device/rss/rss.html', 'CNBC'], ['https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', 'NYT Business']],
    merkez: [['https://www.federalreserve.gov/feeds/press_all.xml', 'Fed'], ['https://www.ecb.europa.eu/rss/press.html', 'Avrupa Merkez Bankası'], ['https://www.bankofengland.co.uk/rss/news', 'İngiltere Merkez Bankası'], ['https://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business', G], ['https://www.aa.com.tr/tr/rss/default?cat=ekonomi', 'AA Ekonomi', G]],
    saglik: [['https://www.who.int/rss-feeds/news-english.xml', 'DSÖ'], ['https://feeds.bbci.co.uk/news/health/rss.xml', 'BBC Health'], ['https://www.aa.com.tr/tr/rss/default?cat=saglik', 'AA Sağlık'], ['https://rss.nytimes.com/services/xml/rss/nyt/Health.xml', 'NYT Health']],
    siyaset: [['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World'], ['https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera'], ['https://www.aa.com.tr/tr/rss/default?cat=dunya', 'AA Dünya'], ['https://feeds.bbci.co.uk/turkce/rss.xml', 'BBC Türkçe'], ['https://www.theguardian.com/world/rss', 'The Guardian']],
    karar: [['https://www.aa.com.tr/tr/rss/default?cat=politika', 'AA Politika'], ['https://feeds.bbci.co.uk/news/politics/rss.xml', 'BBC Politics'], ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', G], ['https://feeds.bbci.co.uk/turkce/rss.xml', 'BBC Türkçe', G]],
    afet: [['https://www.gdacs.org/xml/rss.xml', 'GDACS (BM afet uyarı)'], ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', G], ['https://www.aa.com.tr/tr/rss/default?cat=guncel', 'AA', G], ['https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera', G]],
    abd: [['https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 'BBC ABD'], ['https://feeds.npr.org/1001/rss.xml', 'NPR'], ['https://rss.nytimes.com/services/xml/rss/nyt/US.xml', 'NYT']],
    avrupa: [['https://feeds.bbci.co.uk/news/world/europe/rss.xml', 'BBC Avrupa'], ['https://www.euronews.com/rss?level=theme&name=news', 'Euronews'], ['https://www.theguardian.com/world/europe-news/rss', 'Guardian Avrupa']],
    cin: [['https://feeds.bbci.co.uk/news/world/asia/rss.xml', 'BBC Asya', G], ['https://www.scmp.com/rss/91/feed', 'SCMP'], ['https://www.theguardian.com/world/china/rss', 'Guardian Çin']],
    rusya: [['https://www.themoscowtimes.com/rss/news', 'Moscow Times'], ['https://www.theguardian.com/world/russia/rss', 'Guardian Rusya'], ['https://feeds.bbci.co.uk/news/world/europe/rss.xml', 'BBC Avrupa', G]],
    turkiye: [['https://www.aa.com.tr/tr/rss/default?cat=guncel', 'AA'], ['https://feeds.bbci.co.uk/turkce/rss.xml', 'BBC Türkçe'], ['https://rss.dw.com/rdf/rss-tur-all', 'DW Türkçe'], ['https://www.trthaber.com/sondakika.rss', 'TRT Haber']]
  };
  const GATES = [
    ['doğrudan', u => u],
    ['rss2json', u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u)],
    ['jina', u => 'https://r.jina.ai/' + u, { headers: { 'X-Return-Format': 'text' } }], // allorigins/codetabs öldü (25.11.2026)
    ['köprü', u => window.jarvisBridge.wrap(u)]
  ];
  const gateRank = () => { const ok = store.get('newsGate', {}); return [...GATES.keys()].sort((a, b) => (ok[GATES[b][0]] || 0) - (ok[GATES[a][0]] || 0)); };
  const markGate = (i, good) => { const ok = store.get('newsGate', {}); const k = GATES[i][0]; ok[k] = Math.max(-5, Math.min(20, (ok[k] || 0) + (good ? 1 : -1))); store.set('newsGate', ok); };
  function parseFeed(body, name) {
    let items = [];
    try { const j = JSON.parse(body); if (Array.isArray(j.items)) items = j.items.map(x => ({ title: x.title, url: x.link, img: x.thumbnail || (/^image\//.test(x.enclosure?.type || '') || /\.(jpe?g|png|webp)/i.test(x.enclosure?.link || '') ? x.enclosure.link : '') || (String(x.description || '').match(/<img[^>]+src=["']([^"']+)/i) || [])[1] || '', t: Date.parse(String(x.pubDate || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(x.pubDate || '') ? '' : 'Z')) })); } catch {
      const d = new DOMParser().parseFromString(body, 'text/xml');
      if (d.querySelector('parsererror')) return [];
      items = [...d.querySelectorAll('item, entry')].map(n => {
        const q = s => n.getElementsByTagName(s)[0]?.textContent?.trim() || '';
        const link = q('link') || n.querySelector('link[href]')?.getAttribute('href') || q('guid');
        const media = [...n.getElementsByTagName('*')].find(e => /^(media:thumbnail|media:content|enclosure)$/i.test(e.tagName) && /^https:/.test(e.getAttribute('url') || '') && !/video|audio/.test(e.getAttribute('type') || '') && !/video|audio/.test(e.getAttribute('medium') || ''));
        const im = media?.getAttribute('url') || (q('description').match(/<img[^>]+src=["'](https:[^"']+)/i) || [])[1] || '';
        return { title: q('title'), url: link, img: im, t: Date.parse(q('pubDate') || q('updated') || q('published') || q('dc:date')) };
      });
    }
    return items.filter(x => x.title && /^https?:\/\//.test(x.url || '')).map(x => ({ title: x.title.replace(/\s+/g, ' ').replace(/<[^>]+>/g, '').trim(), url: x.url, img: /^https:\/\//.test(x.img || '') ? x.img : '', domain: name, t: Number.isFinite(x.t) ? Math.min(x.t, Date.now()) : Date.now() - 3600000 }));
  }
  async function rawFeed(url, name) {
    if (typeof pcLocal !== 'undefined' && pcLocal) { try { const it = parseFeed((await pcCall('web_al', [url], false)).text, name); if (it.length) return it; } catch {} }
    const failed = [];
    // kendi köprüsü kuruluysa en güvenilir yol odur: önce o
    const order = gateRank().filter(i => GATES[i][0] !== 'köprü' || window.jarvisBridge?.on()).sort((a, b) => (GATES[b][0] === 'köprü') - (GATES[a][0] === 'köprü'));
    for (const i of order) {
      try {
        const r = await withTimeout(fetch(GATES[i][1](url), GATES[i][2]), i === 0 ? 5000 : 12000, 'zaman aşımı');
        if (!r.ok) throw Error('HTTP ' + r.status);
        const it = parseFeed(await r.text(), name);
        if (!it.length) throw Error('boş');
        markGate(i, true); for (const f of failed) markGate(f, false); // yalnız başka geçit çalıştıysa önceki geçitler puan kaybeder
        return it;
      } catch { failed.push(i); }
    }
    throw Error(name + ' okunamadı');
  }
  const trish = s => /[çğışöüÇĞİŞÖÜ]/.test(s) || /\b(ve|bir|için|ile|bu|da|de)\b/i.test(s);
  async function rssCat(key) {
    const list = FEEDS[key] || [];
    const res = await Promise.allSettled(list.map(([u, n, g]) => rawFeed(u, n).then(it => g && TERMS[key] ? it.filter(x => TERMS[key].some(w => fold(x.title).includes(w))) : it)));
    return res.flatMap(r => r.status === 'fulfilled' ? r.value : []).filter(x => Date.now() - x.t < 2 * DAY).map(x => ({ ...x, lang: trish(x.title) ? 'tr' : 'en' }));
  }
  async function gdeltArts(q, span) {
    // devre kesici: GDELT bu ağdan çoğu zaman yanıt vermiyor (25.11.2026 testi); düşünce 1 saat hiç denenmez, akış RSS ile sürer
    if (Date.now() < store.get('gdeltDown', 0)) throw Error('GDELT kapalı (devre kesici)');
    let d; try { d = await Promise.race([gdelt(q, span), new Promise((_, j) => setTimeout(() => j(Error('GDELT yavaş')), 8000))]); }
    catch (e) { store.set('gdeltDown', Date.now() + 3600000); throw e; }
    return (d.articles || []).filter(a => /^(turkish|english)$/i.test(a.language || '')).map(a => ({ title: String(a.title || '').trim(), url: a.url, img: /^https:\/\//.test(a.socialimage || '') ? a.socialimage : '', domain: a.domain, lang: /turk/i.test(a.language) ? 'tr' : 'en', t: pdate(a.seendate) }));
  }
  async function collect(key, q, span) { // RSS + GDELT birlikte; hangisi gelirse
    const [a, b] = await Promise.allSettled([rssCat(key), gdeltArts(q, span)]);
    const arts = [...(a.status === 'fulfilled' ? a.value : []), ...(b.status === 'fulfilled' ? b.value : [])];
    return arts.sort((x, y) => y.t - x.t);
  }
  // İngilizce başlıkları Türkçeye çevir (önbellekli, tek çağrı)
  const trCache = store.get('newsTr', {});
  async function translate(items) {
    if (opt('newsTr') === '0') return items;
    const need = items.filter(i => i.lang === 'en' && !trCache[i.title]).slice(0, 30);
    if (need.length) {
      try {
        const t = await window.jarvisResearch.ask('Haber başlıklarını doğal, tarafsız TÜRKÇEYE çevir. Sırayı koru. YALNIZ JSON dizi (aynı sayıda dize).', JSON.stringify(need.map(i => i.title)), 'quick');
        const arr = JSON.parse((t.match(/\[[\s\S]*\]/) || ['[]'])[0]);
        need.forEach((i, k) => { if (typeof arr[k] === 'string' && arr[k].trim()) trCache[i.title] = arr[k].trim(); });
        const keys = Object.keys(trCache); if (keys.length > 600) keys.slice(0, keys.length - 600).forEach(k => delete trCache[k]);
        store.set('newsTr', trCache);
      } catch {}
    }
    return items.map(i => ({ ...i, tr: i.tr || trCache[i.title] || i.title }));
  }

  /* ---------- afet verisi (ölçümlü) ---------- */
  async function quakes() {
    const out = [];
    try { const d = await getJ('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'); for (const f of d.features || []) out.push({ mag: f.properties.mag, place: f.properties.place, t: f.properties.time, url: f.properties.url, tsunami: !!f.properties.tsunami, src: 'USGS' }); } catch {}
    try { const d = await getJ('https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=30&minmag=3&minlat=35&maxlat=43&minlon=25&maxlon=45'); for (const f of d.features || []) out.push({ mag: f.properties.mag, place: (f.properties.flynn_region || '') + ' (Türkiye ve çevresi)', t: Date.parse(f.properties.time), url: 'https://www.seismicportal.eu/', src: 'EMSC', tr: true }); } catch {}
    const seen = new Set();
    return out.filter(q => { const k = Math.round(q.t / 120000) + ':' + Math.round(q.mag * 10); if (seen.has(k)) return false; seen.add(k); return Date.now() - q.t < DAY; }).sort((a, b) => b.t - a.t);
  }
  async function outbreaks() {
    try {
      const d = await getJ("https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDate%20desc&$top=5");
      return (d.value || []).map(x => ({ title: x.Title || x.OverrideTitle, t: Date.parse(x.PublicationDate), url: x.ItemDefaultUrl ? 'https://www.who.int/emergencies/disease-outbreak-news/item' + x.ItemDefaultUrl : 'https://www.who.int/emergencies/disease-outbreak-news', src: 'DSÖ' })).filter(x => x.title);
    } catch { return []; }
  }

  /* ---------- akış ---------- */
  let busy = false;
  // tek istekte tüm gündem: başlıkların ana terimleri birleştirilir (GDELT 5 sn sınırı → 12 istek yerine 1), sonra her habere başlık etiketi verilir
  const SON_Q = '("Federal Reserve" OR "central bank" OR "interest rate" OR inflation OR economy OR recession OR outbreak OR "World Health Organization" OR president OR election OR sanctions OR earthquake OR flood OR Kremlin OR Beijing OR "European Union" OR "White House" OR NATO OR "Merkez Bankası" OR ekonomi OR enflasyon OR deprem OR seçim OR "son dakika")';
  const TERMS = Object.fromEntries(Object.entries(CATS).map(([k, c]) => [k, c.q.replace(/[()]/g, '').split(/\s+OR\s+/).map(x => fold(x.replace(/"/g, '').trim())).filter(x => x.length > 2)]));
  const catOf = title => { const f = fold(title); const c = Object.keys(TERMS).filter(k => TERMS[k].some(w => f.includes(w))); return c.length ? c.slice(0, 3) : ['siyaset']; };
  async function breaking(opts = {}) {
    const { status = () => {} } = opts;
    if (busy) return store.get('newsBreaking', null)?.items || null; busy = true;
    try {
      status('Dünya gündemi taranıyor…');
      let all = [];
      try { all = cluster(await collect('son', SON_Q, '6h')).map(i => ({ ...i, cats: catOf(i.title) })); } catch {}
      // önceden açılmış başlık akışlarını da kat (taze olanlar)
      for (const [k, f] of Object.entries(feed)) if (Date.now() - f.t < 30 * 60000) for (const i of f.items) all.push({ ...i, cats: [k] });
      if (!all.length) all = (await viaSearch('siyaset').catch(() => [])).map(i => ({ ...i, cats: ['siyaset'] }));
      const merged = [];
      for (const i of all.sort((a, b) => b.src - a.src)) { const t = toks(i.title); const m = merged.find(x => sim(toks(x.title), t) >= 0.5); if (m) { m.cats = [...new Set([...m.cats, ...i.cats])]; m.src = Math.max(m.src, i.src); m.breaking ||= i.breaking; } else merged.push({ ...i }); }
      const top = merged.sort((a, b) => (b.breaking - a.breaking) || (b.src - a.src) || (b.t - a.t)).slice(0, 25);
      const tr = opts.translate === false ? top.map(i => ({ ...i, tr: i.tr || trCache[i.title] || i.title })) : await translate(top);
      if (tr.length) store.set('newsBreaking', { t: Date.now(), items: tr.slice(0, 15) });
      alertCheck(tr);
      return tr;
    } finally { busy = false; }
  }
  function fmt(items, n = 10) {
    return items.slice(0, n).map(i => `${i.breaking ? '🔴 SON DAKİKA · ' : '• '}${i.tr || i.title} — ${i.domain}${i.src > 1 ? ` (+${i.src - 1} kaynak)` : ''} · ${ago(i.t)}${i.cats ? ' · ' + i.cats.map(c => CATS[c].ad).join('/') : ''}`).join('\n');
  }
  async function showCat(key, label) {
    bubble('me', '📰 ' + (label || 'Gündem'));
    setPhase('thinking', 'Haber akışı taranıyor…');
    try {
      let items, head;
      if (key === 'son') { items = await breaking({ status: t => setPhase('thinking', t) }); head = '📰 GÜNDEM · SON DAKİKA VE EN ÇOK YAZILANLAR'; }
      else { items = await translate(await fetchCat(key)); head = '📰 ' + CATS[key].ad.toUpperCase(); }
      let extra = '';
      if (key === 'afet') { const q = await quakes(); if (q.length) extra = '\n\nÖLÇÜLEN DEPREMLER (son 24 saat):\n' + q.slice(0, 8).map(x => `• M${x.mag.toFixed(1)} ${x.place} · ${ago(x.t)} · ${x.src}${x.tsunami ? ' · TSUNAMİ UYARISI' : ''}`).join('\n'); }
      if (key === 'saglik') { const o = await outbreaks(); if (o.length) extra = '\n\nDSÖ SALGIN BİLDİRİMLERİ:\n' + o.map(x => `• ${x.title} · ${dateTR(x.t)}`).join('\n'); }
      const text = `${head}\n${items?.length ? fmt(items, 12) : 'Şu an haber alınamadı.'}${extra}${items?.some(i => i.web) ? '\n(Kaynak: web araması — gecikmeli olabilir.)' : ''}`;
      const n = bubble('ai', text);
      addLinks(n.el, (items || []).slice(0, 8).map(i => ({ url: i.url, title: short(i.tr || i.title, 60) + ' · ' + i.domain })));
      n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => brief(key) }, '🧭 Tarafsız brifing'), el('button', { type: 'button', onclick: () => showCat(key, label) }, '↻ Yenile')));
      answerTools(n.el, text); renderPanel();
      window.jarvisStage?.show((items || []).filter(i => i.img).slice(0, 10).map(i => ({ src: i.img, title: i.tr || i.title, text: `${i.domain}${i.src > 1 ? ' +' + (i.src - 1) + ' kaynak' : ''} · ${ago(i.t)}`, source: i.domain, url: i.url })), { slide: true });
      logOp('gündem', [key], 'başarılı', (items || []).length + ' haber');
      return text;
    } catch (e) { note('Haberler alınamadı: ' + e.message); }
    finally { setPhase('idle', 'Hazır.'); }
  }
  async function brief(key = 'son') {
    setPhase('thinking', 'Brifing hazırlanıyor…');
    try {
      const items = key === 'son' ? (store.get('newsBreaking', null)?.items || await breaking()) : await translate(await fetchCat(key));
      const t = await window.jarvisResearch.ask(`Sen tarafsız bir haber editörüsün. Aşağıdaki başlıklardan TÜRKÇE, en çok 180 kelimelik brifing yaz: ${key === 'son' ? 'EKONOMİ · SAĞLIK · SİYASET/DÜNYA başlıkları altında' : CATS[key].ad + ' için'} en önemli gelişmeler; neden önemli (1 cümle); Türkiye'ye olası etkisi (varsa, temkinli). Kurallar: yalnız verilen başlıklara dayan, uydurma; doğrulanmamışı "iddia" diye belirt; siyasi tarafların hiçbirini övme/yerme; kaynak sayısını önem göstergesi olarak kullan.`,
        items.slice(0, 25).map(i => `- ${i.tr || i.title} [${i.domain}, ${i.src} kaynak, ${ago(i.t)}]`).join('\n'), 'default');
      const n = bubble('ai', '🧭 BRİFİNG\n' + t); answerTools(n.el, t); window.jarvisArchive?.('Gündem brifingi', t);
      return t;
    } catch (e) { note('Brifing hazırlanamadı: ' + e.message); }
    finally { setPhase('idle', 'Hazır.'); }
  }

  /* ---------- ilgi alarmları + canlı akış ---------- */
  const interests = () => store.get('newsAlerts', ['faiz kararı', 'deprem', 'Merkez Bankası', 'Cizre', 'Şırnak']);
  async function alertCheck(items) {
    const seen = new Set(store.get('newsSeen', []));
    let hits = items.filter(i => !seen.has(i.url) && (i.breaking || interests().some(k => fold(i.tr || i.title).includes(fold(k)) || fold(i.title).includes(fold(k)))));
    for (const i of items) seen.add(i.url);
    store.set('newsSeen', [...seen].slice(-800));
    if (!hits.length || opt('newsLive') === '0') return;
    hits = await translate(hits.slice(0, 5)).catch(() => hits);
    const n = bubble('ai', '🔴 ANLIK HABER\n' + fmt(hits, 5)); addLinks(n.el, hits.slice(0, 5).map(i => ({ url: i.url, title: short(i.tr || i.title, 60) })));
    if (opt('ntfyOn') === '1' && document.hidden) window.jarvisPushPhone?.(hits.slice(0, 3).map(i => i.tr || i.title).join(' · '), { title: 'SATÜRN son dakika', tags: 'newspaper' }).catch(() => {});
  }
  let first = true;
  async function liveTick() {
    if (document.hidden || opt('newsLive') === '0' || !navigator.onLine || window.jarvisUltra?.guest?.()) return;
    if (first) { first = false; store.set('newsSeen', [...new Set([...store.get('newsSeen', []), ...(store.get('newsBreaking', null)?.items || []).map(i => i.url)])]); }
    await breaking({ translate: false }).catch(() => {}); // arka plan: çeviri yok (kota); yalnız bildirilecekler çevrilir
    renderPanel();
  }
  setTimeout(() => liveTick(), 45000);
  setInterval(() => liveTick(), 15 * 60000);

  /* ---------- araçlar + komutlar ---------- */
  const KEYMAP = [[/son dakika|gündem|haber(ler)?$|dünya gündemi|neler oluyor/i, 'son'], [/merkez bankas|fed\b|ecb|faiz kararı|tcmb/i, 'merkez'], [/ekonomi/i, 'ekonomi'], [/finans|para|borsa haber|piyasa haber/i, 'finans'], [/sağlık|salgın/i, 'saglik'], [/siyaset|politika|dünya/i, 'siyaset'], [/hükümet karar|resmi gazete|kararname|yaptırım/i, 'karar'], [/afet|deprem|sel\b|yangın|kasırga|tsunami|doğal/i, 'afet'], [/abd|amerika|washington|beyaz saray/i, 'abd'], [/avrupa|ab\b|brüksel/i, 'avrupa'], [/çin|pekin/i, 'cin'], [/rusya|kremlin|moskova/i, 'rusya'], [/türkiye/i, 'turkiye']];
  const keyOf = s => KEYMAP.find(([re]) => re.test(s))?.[1] || null;
  Object.assign(TOOLS, {
    haber: { d: 'haber|son veya ekonomi/finans/merkez/saglik/siyaset/karar/afet/abd/avrupa/cin/rusya/turkiye — anlık haber akışı (binlerce kaynak, kümelenmiş, kaynak sayılı, Türkçe)', run: async ([k]) => { const key = CATS[fold(k || '')] ? fold(k) : keyOf(k || '') || 'son'; const items = key === 'son' ? await breaking() : await translate(await fetchCat(key)); return fmt(items || [], 10) + '\n(Tarafsız aktar; kaynak sayısını belirt; doğrulanmamışı iddia olarak söyle.)'; } },
    gundem_brifing: { d: 'gundem_brifing|kategori (boş: tümü) — ekonomi/sağlık/siyaset başlıklarında tarafsız gündem özeti', run: async ([k]) => (await brief(CATS[fold(k || '')] ? fold(k) : 'son')) || 'brifing yok' }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGÜNDEM: haber/son dakika/gelişme sorularında haber aracını (uygun kategoriyle), özet istenirse gundem_brifing kullan. Haberleri tarafsız aktar, kaynak sayısını söyle, siyasi taraf tutma, doğrulanmamış bilgiyi iddia olarak belirt.';
  const _lc = localCommand;
  localCommand = text => {
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|ultron)[,\s]+/i, '');
    if (/^(?:gündem|son dakika|son dakika haberleri|haberler|bugünün haberleri|dünya gündemi|neler oluyor)\??$/i.test(t)) { setTimeout(() => showCat('son', 'Gündem · son dakika'), 30); return 'Dünya gündemini tarıyorum…'; }
    if (/^(?:gündem )?brifing(?:i)?(?: ver)?$|^günün brifingi$/i.test(t)) { setTimeout(() => brief('son'), 30); return 'Tarafsız gündem brifingini hazırlıyorum…'; }
    const m = t.match(/^(.{2,40}?)\s*(?:'?(?:dan|den|tan|ten))?\s*(?:son )?(?:haberler(?:i)?|gelişmeler(?:i)?|son dakika)\??$/i);
    if (m) { const key = CATS[fold(m[1])] ? fold(m[1]) : keyOf(m[1]); if (key) { setTimeout(() => showCat(key, CATS[key]?.ad || 'Gündem'), 30); return `${CATS[key]?.ad || 'Gündem'} akışını getiriyorum…`; } }
    return _lc(text);
  };

  /* ---------- panel ---------- */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-news', 'aria-selected': 'false', 'data-p': 'news' }, 'GÜNDEM');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="market"]') || tabs.querySelector('[data-p="settings"]'));
  const chips = el('div', { class: 'newschips' }, ...[['son', '🔴 Son dakika'], ...Object.entries(CATS).map(([k, c]) => [k, c.ad])].map(([k, l]) => el('button', { type: 'button', class: 'chip', onclick: () => { $('drawer').classList.remove('open'); showCat(k, l); } }, l)));
  const list = el('ul', { class: 'list', id: 'newsList' });
  const aIn = el('input', { id: 'newsAlertIn', placeholder: 'İlgi alarmı: ör. faiz kararı, Cizre, ilaç fiyatları' }), aList = el('ul', { class: 'list', id: 'newsAlerts' });
  const live = el('select', { id: 'newsLive' }); live.append(new Option('Açık — 15 dk’da bir tara, son dakikayı bildir', '1'), new Option('Kapalı', '0')); live.value = store.get('set.newsLive', '1'); live.onchange = () => store.set('set.newsLive', live.value);
  const trs = el('select', { id: 'newsTr' }); trs.append(new Option('İngilizce başlıkları Türkçeye çevir', '1'), new Option('Orijinal dilde bırak', '0')); trs.value = store.get('set.newsTr', '1'); trs.onchange = () => store.set('set.newsTr', trs.value);
  const p = el('div', { class: 'pane', id: 'p-news', role: 'tabpanel' },
    el('h3', {}, 'ANLIK HABER AKIŞI'),
    el('p', { class: 'muted' }, 'Dünyadaki binlerce haber kaynağı (GDELT, 15 dk’da bir güncellenir), USGS/EMSC deprem ölçümleri ve DSÖ salgın bildirimleri. Aynı haberi yazan kaynaklar birleştirilir; kaynak sayısı önemi gösterir.'),
    chips,
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); brief('son'); } }, '🧭 Günün brifingi (ekonomi · sağlık · siyaset)')),
    list,
    el('h3', {}, 'İLGİ ALARMLARI'),
    el('div', { class: 'row' }, aIn, el('button', { type: 'button', class: 'btn', onclick: () => { const v = aIn.value.trim(); if (!v) return; store.set('newsAlerts', [...new Set([...interests(), v])].slice(0, 30)); aIn.value = ''; renderPanel(); } }, 'Ekle')),
    aList,
    el('div', { class: 'field' }, el('label', { for: 'newsLive' }, 'Canlı akış'), live),
    el('div', { class: 'field' }, el('label', { for: 'newsTr' }, 'Çeviri'), trs));
  p.hidden = true; $('p-settings').before(p);
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(x => x.hidden = x.id !== 'p-news'); renderPanel(); };
  function renderPanel() {
    const b = store.get('newsBreaking', null);
    list.replaceChildren(...(b?.items?.length ? b.items.map(i => el('li', { class: 'item' + (i.breaking ? ' breaking' : '') }, el('span', {}, i.breaking ? '🔴' : '•'), el('div', {}, el('p', {}, el('a', { href: /^https?:\/\//.test(i.url || '') ? i.url : '#', target: '_blank', rel: 'noopener' }, i.tr || i.title)), el('small', {}, `${i.domain}${i.src > 1 ? ' +' + (i.src - 1) + ' kaynak' : ''} · ${ago(i.t)}`)))) : [el('li', { class: 'muted' }, 'Henüz akış yok — bir başlığa dokun.')]));
    aList.replaceChildren(...interests().map(k => el('li', { class: 'item' }, el('span', {}, '🔔'), el('div', {}, el('p', {}, k)), el('button', { type: 'button', class: 'btn ghost', 'aria-label': k + ' alarmını sil', onclick: () => { store.set('newsAlerts', interests().filter(x => x !== k)); renderPanel(); } }, '×'))));
  }
  renderPanel();
  // ana ekrandaki "Haberler" kısayolu artık canlı akışı açar
  try { if (typeof SKILLS !== 'undefined' && SKILLS.news) SKILLS.news.ask = 'gündem'; } catch {}
  window.jarvisTickerExtra = (prev => () => { const b = store.get('newsBreaking', null)?.items?.[0]; return [...(prev?.() || []), b ? (b.breaking ? '🔴 ' : '📰 ') + short(b.tr || b.title, 90) : '']; })(window.jarvisTickerExtra);
  window.jarvisNews = { CATS, rawFeed, fetchCat, breaking, brief, showCat, quakes, outbreaks, cluster, translate, fmt, keyOf };
})();
