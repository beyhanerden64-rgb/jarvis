'use strict';
/* SATÜRN 26 — 10 YENİ ÜRETKEN ÖZELLİK (hepsi ücretsiz; veri kaynakları 25.11.2026'da canlı ağda denendi)
 *  1) para_cevir      — “250 euro kaç TL”, “3 çeyrek kaç TL”, “5000 TL kaç dolar”, “100 bin dinar kaç TL” (Kapalıçarşı/Truncgil, yedek: piyasa motoru)
 *  2) kapalicarsi     — Kapalıçarşı altın + döviz tablosu: gram/has/çeyrek/yarım/tam/cumhuriyet/22 ayar bilezik/gümüş; USD, EUR, GBP, SAR, IQD, AED…
 *  3) borsa_tara      — BIST ve ABD’de günün en çok yükselen / düşen / işlem gören hisseleri (TradingView, anlık)
 *  4) fiyat_gecmisi   — BTC, ETH, gram altın, dolar, euro, hisse: 30/90/365 gün grafiği, en düşük/en yüksek, dönem değişimi, oynaklık
 *  5) egzersiz_kutuphanesi — yapay zekâ ve internet olmadan anında ev egzersiz programı (bel, boyun, omuz, diz, kalça, ayak bileği, duruş)
 *  6) makbuz          — hastaya yazdırılabilir/paylaşılabilir ödeme makbuzu (numaralı); istenirse kasaya gelir yazar
 *  7) resmi_tatil     — Türkiye resmi tatilleri ve bayramlar, sıradaki tatile kalan gün (Nager.Date; yedek: yerleşik liste)
 *  8) klinik_panosu   — hasta istatistikleri: tanı dağılımı, yaş grupları, ortalama seans, ağrıdaki ortalama düşüş, bu ay yeni hasta
 *  9) deprem_alarm    — Cizre çevresinde (varsayılan 300 km, M4+) deprem olunca sohbete ve telefona uyarı (USGS, 5 dk’da bir)
 * 10) gun_gunlugu     — “bugün ne yaptım”: işlemler, tamamlanan görevler, seanslar, kasa, odak süresi tek raporda */
(() => {
  const DAY = 86400000;
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, Math.abs(Number(v)) >= 1000 ? 0 : d) });
  const pct = v => (v >= 0 ? '+' : '') + nf(v, 2) + '%';
  const tl = v => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }) + ' TL';
  const num = s => { const t = fold(String(s ?? '')).replace(/\s+/g, ' ').trim(); const m = t.match(/(\d[\d.,]*)\s*(milyon|bin)?/); if (!m) return t.match(/^(bir|yarim)\b/) ? (t.startsWith('yarim') ? 0.5 : 1) : NaN; let v = Number(m[1].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); if (m[2] === 'bin') v *= 1e3; if (m[2] === 'milyon') v *= 1e6; return v; };
  const getJ = async (u, ms = 10000, o = { cache: 'no-store' }) => { const r = await withTimeout(fetch(u, o), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const retry = async (fn, n = 2) => { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; await new Promise(r => setTimeout(r, 900)); } } throw e; };
  const todayKey = () => isoLocal(now()).slice(0, 10);
  const show = (text, links) => { const b = bubble('ai', text); try { answerTools(b.el, text); } catch {} if (links?.length) try { addLinks(b.el, links); } catch {} return b; };
  const NOTE = 'Bilgi amaçlıdır, yatırım tavsiyesi değildir.';

  /* ================= 1-2) KAPALIÇARŞI + PARA ÇEVİRİCİ ================= */
  let kcCache = null;
  async function kc() {
    if (kcCache && Date.now() - kcCache.t < 120000) return kcCache.v;
    const t = await retry(() => getJ('https://finans.truncgil.com/v4/today.json?_=' + Math.floor(Date.now() / 60000), 9000, { cache: 'no-store' }));
    const v = {};
    for (const [k, o] of Object.entries(t)) if (o && typeof o === 'object') { const s = typeof o.Selling === 'number' ? o.Selling : Number(String(o.Selling).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); const b = typeof o.Buying === 'number' ? o.Buying : Number(String(o.Buying).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); if (s > 0) v[k] = { s, b: b > 0 ? b : null, ch: Number(o.Change) || 0, type: o.Type }; }
    v._date = t.Update_Date || '';
    kcCache = { t: Date.now(), v }; return v;
  }
  // ad → Truncgil anahtarı
  const UNITS = [
    [/^(tl|try|lira|turk lirasi)$/, 'TRY', 'TL'], [/^(dolar|usd|\$|amerikan dolari)$/, 'USD', 'dolar'], [/^(euro|eur|avro|€)$/, 'EUR', 'euro'], [/^(sterlin|gbp|pound|ingiliz sterlini)$/, 'GBP', 'sterlin'],
    [/^(frank|chf|isvicre frangi)$/, 'CHF', 'İsviçre frangı'], [/^(riyal|sar|suudi riyali)$/, 'SAR', 'Suudi riyali'], [/^(dinar|irak dinari|iqd)$/, 'IQD', 'Irak dinarı'], [/^(dirhem|aed|bae dirhemi)$/, 'AED', 'BAE dirhemi'],
    [/^(manat|azn)$/, 'AZN', 'Azerbaycan manatı'], [/^(ruble|rub)$/, 'RUB', 'ruble'], [/^(yen|jpy)$/, 'JPY', 'yen'], [/^(yuan|cny)$/, 'CNY', 'yuan'], [/^(kuveyt dinari|kwd)$/, 'KWD', 'Kuveyt dinarı'],
    [/^(gram|gram altin|altin|gr altin)$/, 'GRA', 'gram altın'], [/^(has|has altin|24 ayar)$/, 'HAS', 'has altın'], [/^(ceyrek|ceyrek altin)$/, 'CEYREKALTIN', 'çeyrek altın'], [/^(yarim|yarim altin)$/, 'YARIMALTIN', 'yarım altın'],
    [/^(tam|tam altin|ziynet)$/, 'TAMALTIN', 'tam altın'], [/^(cumhuriyet|cumhuriyet altini|ata|ata altin|resat)$/, 'CUMHURIYETALTINI', 'Cumhuriyet altını'], [/^(bilezik|22 ayar|22 ayar bilezik)$/, 'YIA', '22 ayar bilezik (gram)'],
    [/^(14 ayar)$/, '14AYARALTIN', '14 ayar altın (gram)'], [/^(18 ayar)$/, '18AYARALTIN', '18 ayar altın (gram)'], [/^(gumus|gram gumus)$/, 'GUMUS', 'gram gümüş'], [/^(platin)$/, 'GPL', 'gram platin']
  ];
  const unitOf = s => { const f = fold(String(s || '')).replace(/[.?!]+$/, '').trim(); return UNITS.find(([re]) => re.test(f)) || null; };
  async function convert(q) {
    const f = fold(String(q || '')).replace(/[?!.]+$/, '').trim();
    const m = f.match(/^(\d[\d.,]*\s*(?:bin|milyon)?|bir|yarim)\s+(.+?)\s+(?:kac|ne kadar|=|->|to)\s*(.*)$/) || f.match(/^(\d[\d.,]*\s*(?:bin|milyon)?|bir|yarim)\s+(.+?)$/);
    if (!m) throw Error('Örnek: “250 euro kaç TL”, “3 çeyrek kaç TL”, “5000 TL kaç dolar”, “100 bin dinar kaç TL”.');
    const amount = num(m[1]); const from = unitOf(m[2].replace(/\s*(?:altin)$/, s => s)) || unitOf(m[2]); const to = unitOf((m[3] || 'tl').replace(/\s*(eder|yapar|olur)$/, '')) || UNITS[0];
    if (!(amount > 0) || !from) throw Error('Birimi tanıyamadım. Desteklenen: TL, dolar, euro, sterlin, frank, riyal, dinar, dirhem, manat, gram/has/çeyrek/yarım/tam/Cumhuriyet altın, bilezik, gümüş.');
    const v = await kc();
    const rate = k => (k === 'TRY' ? 1 : v[k]?.s);
    const amt = x => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: 4 }), rt = x => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: x < 1 ? 5 : 2 }) + ' TL';
    const a = rate(from[1]), b = rate(to[1]);
    if (!a || !b) throw Error('Kur alınamadı: ' + (!a ? from[2] : to[2]));
    const res = amount * a / b;
    const unit = to[1] === 'TRY' ? 'TL' : to[2];
    const back = from[1] !== 'TRY' && to[1] === 'TRY' ? ` (1 ${from[2]} = ${rt(a)})` : to[1] !== 'TRY' && from[1] === 'TRY' ? ` (1 ${to[2]} = ${rt(b)})` : '';
    return `💱 ${amt(amount)} ${from[1] === 'TRY' ? 'TL' : from[2]} ≈ ${Number(res).toLocaleString('tr-TR', { maximumFractionDigits: res < 10 ? 4 : 2 })} ${unit}${back}\nKapalıçarşı satış fiyatı · ${v._date ? v._date.slice(11, 16) : 'şimdi'} · ${NOTE}`;
  }
  async function bazaar() {
    const v = await kc();
    const row = (k, n) => v[k] ? `• ${n}: ${tl(v[k].s)}${v[k].b ? ' (alış ' + tl(v[k].b) + ')' : ''}${v[k].ch ? ' ' + pct(v[k].ch) : ''}` : '';
    const gold = [['GRA', 'Gram altın'], ['HAS', 'Has altın'], ['CEYREKALTIN', 'Çeyrek'], ['YARIMALTIN', 'Yarım'], ['TAMALTIN', 'Tam'], ['CUMHURIYETALTINI', 'Cumhuriyet'], ['YIA', '22 ayar bilezik (gr)'], ['18AYARALTIN', '18 ayar (gr)'], ['14AYARALTIN', '14 ayar (gr)'], ['GUMUS', 'Gümüş (gr)']].map(x => row(...x)).filter(Boolean);
    const fx = [['USD', 'Dolar'], ['EUR', 'Euro'], ['GBP', 'Sterlin'], ['CHF', 'İsviçre frangı'], ['SAR', 'Suudi riyali'], ['AED', 'BAE dirhemi'], ['IQD', 'Irak dinarı'], ['AZN', 'Azerbaycan manatı']].map(([k, n]) => v[k] ? `• ${n}: ${nf(v[k].s, v[k].s < 1 ? 4 : 2)} TL${v[k].ch ? ' ' + pct(v[k].ch) : ''}` : '').filter(Boolean);
    if (v.IQD) fx.push(`  (1.000.000 Irak dinarı ≈ ${tl(v.IQD.s * 1e6)})`);
    return `🏛 KAPALIÇARŞI · ${v._date || 'şimdi'}\nALTIN\n${gold.join('\n')}\nDÖVİZ\n${fx.join('\n')}\n${NOTE}`;
  }

  /* ================= 3) BORSA TARAYICI (TradingView) ================= */
  async function movers(market = 'bist', kind = 'yukselen') {
    const mk = /abd|amerika|us|nasdaq/.test(fold(market)) ? 'america' : 'turkey';
    const k = fold(kind);
    const sort = /dus/.test(k) ? { sortBy: 'change', sortOrder: 'asc' } : /hacim|islem|aktif/.test(k) ? { sortBy: 'Value.Traded', sortOrder: 'desc' } : { sortBy: 'change', sortOrder: 'desc' };
    const body = { filter: [{ left: 'type', operation: 'equal', right: 'stock' }, { left: 'Value.Traded', operation: 'greater', right: mk === 'america' ? 2e7 : 5e7 }, ...(mk === 'america' ? [{ left: 'exchange', operation: 'in_range', right: ['NASDAQ', 'NYSE', 'AMEX'] }, { left: 'market_cap_basic', operation: 'greater', right: 2e9 }] : [])], columns: ['name', 'description', 'close', 'change', 'Value.Traded'], sort, range: [0, 10] };
    const r = await retry(() => withTimeout(fetch(`https://scanner.tradingview.com/${mk}/scan`, { method: 'POST', body: JSON.stringify(body) }), 10000, 'zaman aşımı').then(x => { if (!x.ok) throw Error('HTTP ' + x.status); return x.json(); }));
    const rows = (r.data || []).map(x => x.d).filter(d => d?.[2] != null);
    if (!rows.length) throw Error('Liste boş geldi (piyasa kapalı olabilir).');
    const cur = mk === 'america' ? '$' : 'TL';
    const title = `${mk === 'america' ? 'ABD (2 milyar $ üstü)' : 'BIST'} · ${/dus/.test(k) ? 'en çok DÜŞEN' : /hacim|islem|aktif/.test(k) ? 'en çok İŞLEM GÖREN' : 'en çok YÜKSELEN'} 10 hisse`;
    return `📊 ${title}\n` + rows.map((d, i) => `${i + 1}. ${d[0]} — ${short(d[1] || '', 34)} · ${nf(d[2])} ${cur} (${pct(+d[3])}) · işlem ${nf((+d[4] || 0) / (mk === 'america' ? 1e6 : 1e6), 0)} mn ${cur}`).join('\n') + `\nKaynak: TradingView (anlık/15 dk gecikmeli olabilir) · ${NOTE}`;
  }

  /* ================= 4) FİYAT GEÇMİŞİ ================= */
  const BN = 'https://data-api.binance.vision/api/v3/klines';
  const kl = async (sym, days) => (await retry(() => getJ(`${BN}?symbol=${sym}&interval=1d&limit=${Math.min(1000, days + 1)}`, 12000))).map(x => [x[0], +x[4]]);
  async function history(qRaw, daysRaw) {
    const q = fold(String(qRaw || 'btc')).trim(), days = Math.max(7, Math.min(1000, parseInt(daysRaw, 10) || (/yil|365/.test(fold(daysRaw || '')) ? 365 : 30)));
    let series, label, unit;
    if (/^(gram ?altin|altin|gram)$/.test(q)) { const [g, t] = await Promise.all([kl('PAXGUSDT', days), kl('USDTTRY', days)]); const n = Math.min(g.length, t.length); series = g.slice(-n).map((x, i) => [x[0], x[1] / 31.1034768 * t.slice(-n)[i][1]]); label = 'Gram altın (has karşılığı)'; unit = 'TL'; }
    else if (/^(dolar|usd)$/.test(q)) { series = await kl('USDTTRY', days); label = 'Dolar/TL (USDT)'; unit = 'TL'; }
    else if (/^(euro|eur)$/.test(q)) { const [e, t] = await Promise.all([kl('EURUSDT', days), kl('USDTTRY', days)]); const n = Math.min(e.length, t.length); series = e.slice(-n).map((x, i) => [x[0], x[1] * t.slice(-n)[i][1]]); label = 'Euro/TL'; unit = 'TL'; }
    else if (/^[a-z0-9]{2,10}$/.test(q) && !/^(bist|thyao|aselsan)$/.test(q)) {
      const C = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', ripple: 'XRP' }[q] || q.toUpperCase();
      try { series = await kl(C + 'USDT', days); label = C; unit = '$'; } catch { series = null; }
    }
    if (!series) { // hisse/endeks: Yahoo grafik verisi jina geçidiyle
      const r = await window.jarvisMarkets.resolve(qRaw); if (r.kind !== 'eq') throw Error('Bu sembolün geçmişi bulunamadı.');
      const range = days > 370 ? '5y' : days > 185 ? '1y' : days > 95 ? '6mo' : days > 32 ? '3mo' : '1mo';
      const j = await window.jarvisSrc.jinaJ(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(r.key)}?range=${range}&interval=1d`, 16000);
      const R = j.chart?.result?.[0]; const c = R?.indicators?.quote?.[0]?.close || [];
      series = (R?.timestamp || []).map((t, i) => [t * 1000, c[i]]).filter(x => x[1] > 0); label = R?.meta?.shortName || r.key; unit = R?.meta?.currency || '';
    }
    series = series.filter(x => x[1] > 0).slice(-days - 1);
    if (series.length < 5) throw Error('Yeterli veri yok.');
    const v = series.map(x => x[1]), first = v[0], last = v.at(-1), mn = Math.min(...v), mx = Math.max(...v);
    const rets = v.slice(1).map((x, i) => Math.log(x / v[i])); const sd = Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length - (rets.reduce((a, r) => a + r, 0) / rets.length) ** 2);
    const step = Math.max(1, Math.ceil(series.length / 24)), pts = series.filter((_, i) => i % step === 0 || i === series.length - 1);
    const dl = t => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    try { TOOLS.grafik.run([`${label} · ${days} gün`, pts.map(p => `${dl(p[0])}:${Math.round(p[1] * 100) / 100}`).join(', '), 'cizgi']); } catch {}
    const at = x => dl(series[v.indexOf(x)][0]);
    return `📉 ${label} · son ${days} gün\nŞimdi ${nf(last)} ${unit} · dönem değişimi ${pct((last / first - 1) * 100)}\nEn düşük ${nf(mn)} ${unit} (${at(mn)}) · en yüksek ${nf(mx)} ${unit} (${at(mx)})\nGünlük oynaklık ≈ %${nf(sd * 100, 2)} (yıllık ≈ %${nf(sd * Math.sqrt(365) * 100, 0)})\n${NOTE}`;
  }

  /* ================= 5) EGZERSİZ KÜTÜPHANESİ (yerel) ================= */
  // Genel ev programı şablonları; hasta değerlendirmesine göre fizyoterapist uyarlar.
  const EX = {
    bel: { ad: 'Bel (lomber)', alias: /bel|lomber|fitik|siyatik|disk/, b: [
      ['Diz-göğüs germe (sırtüstü)', 'Tek dizi göğse çek, 20–30 sn tut', '3 tekrar/taraf'], ['Pelvik tilt', 'Sırtüstü, dizler bükülü; beli yere bastır, 5 sn tut', '2×10'],
      ['Kedi-deve', 'Dört ayak; sırtı yavaşça yuvarla ve çukurlaştır', '2×10'], ['Köprü', 'Kalçayı kaldır, 3 sn tut, yavaş indir', '2×10'],
      ['Yüzüstü dirsek üstü uzanma (McKenzie)', 'Ağrı kola/bacağa yayılmıyorsa 30–60 sn', '3 tekrar'], ['Yürüyüş', 'Düz zeminde, ağrı sınırında', 'günde 2×15 dk']],
      o: [['Bird-dog', 'Dört ayak; karşı kol ve bacağı uzat, beli sabit tut, 5 sn', '3×8/taraf'], ['Yan köprü (dizler bükülü)', '15–20 sn tut', '3 tekrar/taraf'], ['Ölü böcek (dead bug)', 'Bel yere sabit, karşı kol-bacak indir', '3×8/taraf'], ['Hamstring germe', 'Sırtüstü, havlu ile 30 sn', '3 tekrar/taraf'], ['Tek bacak köprü', '3 sn tut', '3×8/taraf']],
      i: [['Plank', '30–45 sn', '3 tekrar'], ['Tam yan köprü', '30 sn', '3 tekrar/taraf'], ['Kalça menteşe (hip hinge) sopa ile', 'Bel nötr, kalçadan eğil', '3×10'], ['Goblet squat', 'Hafif ağırlıkla', '3×10'], ['Pallof press (bant)', 'Gövde dönmesine direnç', '3×10/taraf']],
      k: 'Bacakta güç kaybı, idrar/dışkı kaçırma, kasık-anüs çevresinde uyuşma, ateş veya gece geçmeyen ağrı → egzersizi bırak, hemen doktora başvur.' },
    boyun: { ad: 'Boyun (servikal)', alias: /boyun|servikal|cervical|duz boyun|tortikolis/, b: [
      ['Çene içe çekme (chin tuck)', 'Başı geri kaydır, 5 sn tut', '2×10'], ['Boyun yana eğme germe', 'Kulağı omza yaklaştır, 20 sn', '3 tekrar/taraf'],
      ['Omuz silkme ve geri yuvarlama', 'Yavaş ve kontrollü', '2×10'], ['Boyun rotasyonu', 'Ağrısız açıda sağa-sola', '2×10'], ['Kürek kemiği sıkıştırma', '5 sn tut', '2×10']],
      o: [['Yüzüstü chin tuck ile baş kaldırma', '5 sn', '3×8'], ['Bantla row (kürek çekme)', 'Dirsekler gövdeye yakın', '3×12'], ['Duvar meleği', 'Sırt ve kollar duvarda', '3×10'], ['Göğüs (pektoral) germe kapı aralığında', '30 sn', '3 tekrar']],
      i: [['Bantla face-pull', '3×12'], ['İzometrik boyun (4 yön)', 'Elle direnç, 10 sn', '3 tekrar/yön'], ['Yüzüstü Y-T-W', 'Hafif ağırlıksız', '2×8']].map(x => x.length === 2 ? [x[0], '', x[1]] : x),
      k: 'Kollarda güç kaybı, ellerde beceriksizlik, yürüme bozukluğu, baş dönmesi/çift görme veya travma sonrası ağrı → egzersizi bırak, doktora başvur.' },
    omuz: { ad: 'Omuz', alias: /omuz|rotator|impingement|sikisma|donuk omuz|frozen|bursit/, b: [
      ['Sarkaç (Codman)', 'Öne eğil, kol serbest; küçük daireler', '2×30 sn'], ['Masa üstü kaydırma (fleksiyon)', 'Havluyla öne kaydır', '2×10'],
      ['Sopa ile dış rotasyon', 'Dirsek gövdede, 5 sn', '2×10'], ['Kürek kemiği sıkıştırma', '5 sn', '2×10'], ['Duvarda parmak yürütme', 'Ağrısız sınıra kadar', '2×10']],
      o: [['Bantla dış rotasyon', 'Dirsek 90°, gövdede', '3×12'], ['Bantla iç rotasyon', '3×12'], ['Bantla row', '3×12'], ['Yan yatarak dış rotasyon (hafif dambıl)', '3×10'], ['Arka kapsül (cross-body) germe', '30 sn', '3 tekrar']],
      i: [['Dambıl ile scaption (30° önde, başparmak yukarı)', 'Omuz hizasına kadar', '3×10'], ['Duvar şınavı → diz şınavı', '3×10'], ['Bantla 90/90 dış rotasyon', '3×10'], ['Yüzüstü Y-T', '3×8']],
      k: 'Düşme/travma sonrası kol kaldırılamıyorsa, gece şiddetli ağrı, kolda uyuşma veya ateş → doktora başvur.' },
    diz: { ad: 'Diz', alias: /diz|menisk|kikirdak|gonartroz|osteoartrit|patell|on capraz|acl|kondromalazi/, b: [
      ['Quadriseps sıkıştırma', 'Diz altına havlu, bastır 5 sn', '3×10'], ['Düz bacak kaldırma', 'Diğer diz bükülü, 3 sn tut', '3×10'],
      ['Topuk kaydırma', 'Sırtüstü dizi bük-aç', '2×15'], ['Oturarak diz açma', 'Sandalyede, 3 sn tut', '3×10'], ['Baldır germe (duvarda)', '30 sn', '3 tekrar/taraf']],
      o: [['Duvar squat (mini)', '45° ye kadar, 10 sn', '3×8'], ['Basamak çıkma (öne)', 'Kontrollü', '3×10'], ['Köprü', '3×12'], ['Yan yatarak bacak kaldırma', '3×12'], ['Tek ayakta denge', '30 sn', '3 tekrar']],
      i: [['Bulgar split squat (destekli)', '3×8/taraf'], ['Basamak inme (eksantrik)', 'Yavaş 3 sn', '3×8'], ['Tek bacak Romen deadlift', '3×8'], ['Sabit bisiklet', '15–20 dk']].map(x => x.length === 2 ? [x[0], '', x[1]] : x),
      k: 'Dizde kilitlenme, belirgin şişlik-kızarıklık-ısı, ateş, yük verememe veya baldırda ağrılı şişlik (pıhtı şüphesi) → doktora başvur.' },
    kalca: { ad: 'Kalça', alias: /kalca|koksartroz|trokanter|piriformis/, b: [
      ['Köprü', '3 sn tut', '2×10'], ['Yan yatarak bacak kaldırma (abdüksiyon)', '2×10/taraf', ''], ['İstiridye (clamshell)', '2×12/taraf', ''], ['Sırtüstü kalça-diz bükme', '2×10', ''], ['Piriformis germe', '30 sn', '3 tekrar/taraf']].map(x => x[2] === '' ? [x[0], '', x[1]] : x),
      o: [['Bantla istiridye', '3×12'], ['Bantla yan yürüyüş', '3×10 adım'], ['Oturup kalkma (sandalye)', '3×10'], ['Kalça fleksör germe (yarım diz)', '30 sn ×3']].map(x => [x[0], '', x[1]]),
      i: [['Tek bacak köprü', '3×10'], ['Step-up', '3×10'], ['Romen deadlift (hafif)', '3×10'], ['Yan köprü', '30 sn ×3']].map(x => [x[0], '', x[1]]),
      k: 'Düşme sonrası kalça ağrısı ve yük verememe (kırık şüphesi), kasıkta açıklanamayan ağrı veya ateş → doktora başvur.' },
    ayak: { ad: 'Ayak bileği / ayak', alias: /ayak|bilek burk|ankle|topuk|plantar|asil/, b: [
      ['Ayak bileği pompası', 'Yukarı-aşağı', '2×20'], ['Alfabe yazma', 'Ayak parmağıyla harfler', '1 tur'], ['Havlu toplama (parmaklar)', '2×10', ''], ['Baldır germe (duvarda, diz düz ve bükülü)', '30 sn', '3 tekrar'], ['Plantar fasya germe', 'Parmakları geri çek, 30 sn', '3 tekrar']].map(x => x[2] === '' ? [x[0], '', x[1]] : x),
      o: [['Bantla 4 yön bilek', '3×12/yön'], ['Çift ayak topuk kaldırma', '3×15'], ['Tek ayak denge', '30 sn ×3'], ['Tek ayak topuk kaldırma', '3×10']].map(x => [x[0], '', x[1]]),
      i: [['Basamakta eksantrik topuk indirme', '3×15'], ['Tek ayak denge (yumuşak zeminde/gözler kapalı)', '30 sn ×3'], ['Hafif sıçrama (ağrısızsa)', '3×10']].map(x => [x[0], '', x[1]]),
      k: 'Yük verememe, kemik üstünde belirgin hassasiyet (kırık şüphesi), baldırda ağrılı şişlik veya ani “tekme yemiş gibi” topuk ağrısı (Aşil yırtığı) → doktora başvur.' },
    durus: { ad: 'Duruş (postür) / masa başı', alias: /durus|postur|masa basi|kambur|sirt agrisi|ofis/, b: [
      ['Çene içe çekme', '5 sn', '2×10'], ['Kürek kemiği sıkıştırma', '5 sn', '2×10'], ['Göğüs germe (kapı aralığı)', '30 sn', '3 tekrar'], ['Oturarak sırt uzatma (sandalye arkasına)', '10 tekrar', ''], ['Her 30–45 dk kalk, 1–2 dk yürü', '', 'gün boyu']].map(x => x[2] === '' ? [x[0], '', x[1]] : x),
      o: [['Bantla row', '3×12'], ['Duvar meleği', '3×10'], ['Köpük rulo ile torakal ekstansiyon', '1–2 dk'], ['Bird-dog', '3×8/taraf']].map(x => [x[0], '', x[1]]),
      i: [['Bantla face-pull', '3×12'], ['Yüzüstü Y-T-W', '2×8'], ['Plank', '3×40 sn']].map(x => [x[0], '', x[1]]),
      k: 'Gece ağrısı, kilo kaybı, ateş veya kollara yayılan uyuşma → doktora başvur.' }
  };
  const lvlOf = s => /ileri|iler/.test(fold(s || '')) ? 'i' : /orta/.test(fold(s || '')) ? 'o' : 'b';
  const LV = { b: 'başlangıç', o: 'orta', i: 'ileri' };
  function program(regionRaw, levelRaw, who) {
    const f = fold(regionRaw || '');
    const R = Object.entries(EX).find(([k, r]) => k === f || r.alias.test(f));
    if (!R) return `Bölgeler: ${Object.values(EX).map(r => r.ad).join(', ')}. Örnek: “egzersiz programı bel orta”.`;
    const [, r] = R, lv = lvlOf(levelRaw), list = lv === 'b' ? r.b : lv === 'o' ? [...r.b.slice(0, 2), ...r.o] : [...r.o.slice(0, 2), ...r.i];
    const lines = list.map(([n, how, doz], i) => `${i + 1}. ${n}${how ? ' — ' + how : ''}${doz ? ' · ' + doz : ''}`);
    return `🏋 EV EGZERSİZ PROGRAMI · ${r.ad} · ${LV[lv]}${who ? ' · ' + who : ''}\n${lines.join('\n')}\nSıklık: haftada 5–6 gün, günde 1 kez (yürüyüş/germe günde 2 kez olabilir).\nKural: egzersiz sırasında ağrı 10 üzerinden 3–4’ü geçmemeli; ertesi gün artmış ağrı varsa tekrar sayısını azalt.\nİlerleme: 1–2 hafta ağrısız yapılınca bir üst seviyeye geç.\n⚠ KIRMIZI BAYRAK: ${r.k}\n(Genel şablondur; fizyoterapist değerlendirmesine göre uyarlanmalıdır.)`;
  }

  /* ================= 6) MAKBUZ ================= */
  function receipt(name, amountRaw, desc, toKasa) {
    const amt = num(amountRaw); if (!name || !(amt > 0)) throw Error('Biçim: makbuz|hasta adı|tutar|açıklama (ör. makbuz|Ayşe Yılmaz|1500|5 seans fizik tedavi)');
    const n = (store.get('makbuzNo', 0) || 0) + 1; store.set('makbuzNo', n);
    const no = `${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
    const brand = store.get('set.brandName', '') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
    const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const words = trWords(Math.round(amt));
    const text = `${brand}\nCizre / Şırnak\n\nÖDEME MAKBUZU   No: ${no}\nTarih: ${date}\n\nSayın ${name},\n${desc || 'Fizik tedavi ve rehabilitasyon hizmeti'} karşılığında\n${tl(amt)} (yalnız ${words} Türk lirası) tahsil edilmiştir.\n\nTeşekkür eder, sağlıklı günler dileriz.\n\nTeslim alan: ${store.get('set.ownerName', '') || 'Fzt. Beyhan Erden'}\nİmza: ____________________\n\n(Bu belge bilgilendirme amaçlı tahsilat makbuzudur; resmi fatura/serbest meslek makbuzu yerine geçmez.)`;
    if (toKasa && TOOLS.kasa) { try { TOOLS.kasa.run(['gelir', String(amt).replace('.', ','), `Makbuz ${no} · ${name}`]); } catch {} }
    show(`🧾 Makbuz hazır (No ${no}) — “Yazdır” ile PDF/kâğıt, “WhatsApp” ile paylaş.${toKasa ? ' Kasaya gelir olarak da yazıldı.' : ''}\n\n${text}`);
    return `Makbuz ${no} hazırlandı: ${name}, ${tl(amt)}${toKasa ? ' (kasaya işlendi)' : ''}. Sohbetteki Yazdır düğmesiyle basılabilir.`;
  }
  function trWords(n) {
    if (!n) return 'sıfır';
    const B = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], O = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    const h = x => { const y = Math.floor(x / 100), r = x % 100; return [y ? (y > 1 ? B[y] + ' ' : '') + 'yüz' : '', O[Math.floor(r / 10)], B[r % 10]].filter(Boolean).join(' '); };
    const parts = [[1e9, 'milyar'], [1e6, 'milyon'], [1e3, 'bin']]; const out = [];
    for (const [v, w] of parts) { const k = Math.floor(n / v); if (k) { out.push((v === 1e3 && k === 1 ? '' : h(k) + ' ') + w); n %= v; } }
    if (n) out.push(h(n));
    return out.join(' ');
  }

  /* ================= 7) RESMİ TATİLLER ================= */
  const FALLBACK = { 2026: [['2026-01-01', 'Yılbaşı'], ['2026-03-20', 'Ramazan Bayramı 1. gün'], ['2026-03-21', 'Ramazan Bayramı 2. gün'], ['2026-03-22', 'Ramazan Bayramı 3. gün'], ['2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['2026-05-01', 'Emek ve Dayanışma Günü'], ['2026-05-19', 'Atatürk’ü Anma, Gençlik ve Spor Bayramı'], ['2026-05-27', 'Kurban Bayramı 1. gün'], ['2026-05-28', 'Kurban Bayramı 2. gün'], ['2026-05-29', 'Kurban Bayramı 3. gün'], ['2026-05-30', 'Kurban Bayramı 4. gün'], ['2026-07-15', 'Demokrasi ve Millî Birlik Günü'], ['2026-08-30', 'Zafer Bayramı'], ['2026-10-29', 'Cumhuriyet Bayramı']] };
  async function holidays(yearRaw) {
    const y0 = Number(isoLocal(now()).slice(0, 4)), y = parseInt(yearRaw, 10) || y0;
    const get = async yr => { const k = 'tatil.' + yr, c = store.get(k, null); if (c?.length) return c; try { const d = await retry(() => getJ(`https://date.nager.at/api/v3/PublicHolidays/${yr}/TR`, 9000)); const L = d.map(x => [x.date, x.localName]); store.set(k, L); return L; } catch { return FALLBACK[yr] || []; } };
    const [a, b] = await Promise.all([get(y), y === y0 ? get(y + 1) : Promise.resolve([])]);
    const all = [...a, ...b], today = todayKey();
    const next = all.find(([d]) => d >= today);
    const left = next ? Math.round((Date.parse(next[0]) - Date.parse(today)) / DAY) : null;
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
    if (!a.length) throw Error(y + ' tatil listesi alınamadı');
    return `📅 RESMİ TATİLLER ${y}\n${a.map(([d, n]) => `${d < today && y === y0 ? '✓' : '•'} ${fmt(d)} — ${n}`).join('\n')}${next ? `\n\nSıradaki: ${next[1]} · ${fmt(next[0])} · ${left === 0 ? 'BUGÜN' : left + ' gün kaldı'}` : ''}\n(Arife günleri yarım gündür; klinik kapanışını “görev” olarak ekleyebilirim.)`;
  }

  /* ================= 8) KLİNİK PANOSU ================= */
  function dashboard() {
    const P = typeof patients !== 'undefined' ? patients : [];
    if (!P.length) return 'Henüz hasta kaydı yok. “Ahmet Yılmaz’ı hasta olarak kaydet, bel fıtığı, 45 yaş” gibi ekleyebilirsin.';
    const m = isoLocal(now()).slice(0, 7), t30 = Date.now() - 30 * DAY;
    const cnt = {}, disp = {}; for (const p of P) { const raw = String(p.tani || 'belirtilmemiş').split(/[,;/]/)[0].trim() || 'belirtilmemiş', k = raw.toLocaleLowerCase('tr-TR'); disp[k] ||= raw; cnt[k] = (cnt[k] || 0) + 1; }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [disp[k], v]);
    const ages = P.map(p => Number(p.yas)).filter(a => a > 0 && a < 110), grp = { '0–17': 0, '18–34': 0, '35–49': 0, '50–64': 0, '65+': 0 };
    for (const a of ages) grp[a < 18 ? '0–17' : a < 35 ? '18–34' : a < 50 ? '35–49' : a < 65 ? '50–64' : '65+']++;
    const ses = P.map(p => (p.seanslar || []).length), totalS = ses.reduce((a, b) => a + b, 0);
    const drops = P.map(p => (p.seanslar || []).filter(s => s.vas != null && isFinite(s.vas))).filter(s => s.length >= 2).map(s => s[0].vas - s.at(-1).vas);
    const newM = P.filter(p => isoLocal(new Date(p.created || 0)).slice(0, 7) === m).length;
    const active = P.filter(p => (p.seanslar || []).some(s => s.t >= t30)).length;
    const sesM = P.reduce((a, p) => a + (p.seanslar || []).filter(s => isoLocal(new Date(s.t)).slice(0, 7) === m).length, 0);
    try { if (top.length >= 2) TOOLS.grafik.run(['Tanı dağılımı', top.map(([k, v]) => `${short(k, 18)}:${v}`).join(', '), 'bar']); } catch {}
    return `🏥 KLİNİK PANOSU · ${m}\nToplam hasta: ${P.length} · son 30 günde aktif: ${active} · bu ay yeni: ${newM}\nBu ay seans: ${sesM} · toplam seans: ${totalS} · hasta başı ortalama: ${nf(totalS / P.length, 1)}\nAğrı (VAS) ortalama düşüş: ${drops.length ? nf(drops.reduce((a, b) => a + b, 0) / drops.length, 1) + ' puan (' + drops.length + ' hasta, ' + drops.filter(d => d >= 2).length + ' tanesinde ≥2 puan = klinik anlamlı)' : 'yeterli ağrı kaydı yok'}\nEn sık tanılar: ${top.map(([k, v]) => `${k} (${v})`).join(', ')}\nYaş grupları: ${ages.length ? Object.entries(grp).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') : 'yaş girilmemiş'}`;
  }

  /* ================= 9) DEPREM ALARMI ================= */
  const dq = () => store.get('depremAlarm', { on: false, mag: 4, km: 300, lat: 37.33, lon: 42.19, yer: 'Cizre' });
  async function quakeCheck(manual = false) {
    const c = dq(); if (!c.on && !manual) return '';
    const since = new Date(Date.now() - (manual ? 2 * DAY : 3 * 3600000)).toISOString().slice(0, 19);
    const d = await retry(() => getJ(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${c.lat}&longitude=${c.lon}&maxradiuskm=${c.km}&minmagnitude=${c.mag}&starttime=${since}&orderby=time`, 12000));
    const seen = new Set(store.get('depremSeen', []));
    const fresh = (d.features || []).filter(f => !seen.has(f.id));
    const line = f => { const p = f.properties, [lo, la, dep] = f.geometry.coordinates; const km = Math.round(haversine(c.lat, c.lon, la, lo)); return `M${nf(p.mag, 1)} · ${p.place} · ${c.yer}’e ~${km} km · ${new Date(p.time).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · derinlik ${Math.round(dep)} km`; };
    if (!manual && fresh.length) {
      const msg = '🌍 DEPREM: ' + fresh.slice(0, 3).map(line).join(' | ');
      show(msg + '\n(Kaynak: USGS · AFAD verisi birkaç dakika farklı olabilir)');
      if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(msg, { title: 'SATÜRN deprem uyarısı', tags: 'warning', priority: 4 }).catch?.(() => {});
      try { navigator.vibrate?.([300, 100, 300]); } catch {}
    }
    store.set('depremSeen', [...seen, ...(d.features || []).map(f => f.id)].slice(-200));
    return (d.features || []).length ? (d.features || []).slice(0, 8).map(line).join('\n') : `Son 48 saatte ${c.yer} çevresinde (${c.km} km) M${c.mag}+ deprem yok.`;
  }
  const haversine = (a, b, c, d) => { const r = x => x * Math.PI / 180, R = 6371; const x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  setInterval(() => { if (dq().on && !document.hidden) quakeCheck().catch(() => {}); }, 5 * 60000);
  setTimeout(() => { if (dq().on) quakeCheck().catch(() => {}); }, 20000);
  async function quakeTool([op, mag, km]) {
    const o = fold(op || 'durum'), c = dq();
    if (/^(ac|baslat|kur|on)/.test(o)) { const n = { ...c, on: true, mag: Number(String(mag || c.mag).replace(',', '.')) || 4, km: parseInt(km, 10) || c.km }; store.set('depremAlarm', n); await quakeCheck(true).catch(() => ''); return `🌍 Deprem alarmı AÇIK: ${n.yer} çevresi ${n.km} km, M${n.mag} ve üstü. Uygulama açıkken 5 dakikada bir bakarım${opt('ntfyOn') === '1' ? ' ve telefonuna bildiririm' : ' (telefona bildirim için Bağlantı → ntfy bildirimini aç)'}.`; }
    if (/^(kapat|durdur|off)/.test(o)) { store.set('depremAlarm', { ...c, on: false }); return 'Deprem alarmı kapatıldı.'; }
    return `Deprem alarmı ${c.on ? 'AÇIK' : 'KAPALI'} (${c.yer}, ${c.km} km, M${c.mag}+).\nSon 48 saat:\n` + await quakeCheck(true);
  }

  /* ================= 10) GÜN GÜNLÜĞÜ ================= */
  function journal(dayRaw) {
    const d = /dun|dün/.test(fold(dayRaw || '')) ? isoLocal(new Date(Date.now() - DAY)).slice(0, 10) : /^\d{4}-\d\d-\d\d$/.test(dayRaw || '') ? dayRaw : todayKey();
    const inDay = t => t && isoLocal(new Date(t)).slice(0, 10) === d;
    const ops = (store.get('oplog', []) || []).filter(o => inDay(o.t));
    const okOps = ops.filter(o => o.status === 'başarılı'), bad = ops.filter(o => o.status === 'başarısız');
    const P = typeof patients !== 'undefined' ? patients : [];
    const ses = P.flatMap(p => (p.seanslar || []).filter(s => inDay(s.t)).map(() => p));
    const led = (store.get('ledger', []) || []).filter(x => x.d === d), g = led.filter(x => x.type === 'gelir').reduce((a, x) => a + x.amt, 0), c = led.filter(x => x.type === 'gider').reduce((a, x) => a + x.amt, 0);
    const its = typeof items !== 'undefined' ? items : [];
    const madeT = its.filter(i => i.kind === 'task' && inDay(i.created)), doneT = its.filter(i => i.kind === 'task' && i.done && inDay(i.doneAt || 0)), notes = its.filter(i => i.kind !== 'task' && inDay(i.created));
    const focus = (store.get('focusLog', {}) || {})[d] || 0;
    const tools = {}; for (const o of okOps) tools[o.tool] = (tools[o.tool] || 0) + 1;
    const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
    return `📓 GÜN GÜNLÜĞÜ · ${new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}\n` +
      `• Seans: ${ses.length}${ses.length ? ' (' + [...new Set(ses.map(nm))].slice(0, 8).join(', ') + ')' : ''}\n` +
      `• Kasa: gelir ${tl(g)} · gider ${tl(c)} · net ${tl(g - c)}\n` +
      `• Görev: ${madeT.length} yeni, ${doneT.length} tamamlandı${doneT.length ? ' (' + doneT.slice(0, 5).map(i => short(i.text || i.title || '', 30)).join('; ') + ')' : ''} · not/hafıza: ${notes.length}\n` +
      `• Odak: ${focus} dk\n` +
      `• SATÜRN işlemleri: ${okOps.length} başarılı${bad.length ? ', ' + bad.length + ' başarısız' : ''}${Object.keys(tools).length ? ' — ' + Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join(', ') : ''}`;
  }

  /* ================= araç kaydı ================= */
  Object.assign(TOOLS, {
    para_cevir: { d: 'para_cevir|miktar ve birim → hedef (ör. “250 euro kaç TL”, “3 çeyrek kaç TL”, “5000 TL kaç dolar”, “100 bin dinar kaç TL”) — Kapalıçarşı kuruyla çeviri', run: async ([q, ...r]) => convert([q, ...r].filter(Boolean).join(' ')) },
    kapalicarsi: { d: 'kapalicarsi — Kapalıçarşı altın (gram, has, çeyrek, yarım, tam, Cumhuriyet, 22 ayar bilezik, gümüş) ve döviz (USD, EUR, GBP, SAR, AED, IQD…) tablosu', run: () => bazaar() },
    borsa_tara: { d: 'borsa_tara|bist veya abd|yukselen/dusen/hacim — günün en çok yükselen, düşen veya işlem gören 10 hissesi (TradingView)', run: ([m, k]) => movers(m || 'bist', k || 'yukselen') },
    fiyat_gecmisi: { d: 'fiyat_gecmisi|sembol (BTC, ETH, gram altın, dolar, euro, THYAO, BIST 100…)|gün (30/90/365) — grafik + en düşük/yüksek, dönem değişimi, oynaklık', run: ([s, g]) => history(s, g) },
    egzersiz_kutuphanesi: { d: 'egzersiz_kutuphanesi|bölge (bel/boyun/omuz/diz/kalça/ayak/duruş)|seviye (başlangıç/orta/ileri)|hasta adı (isteğe bağlı) — yapay zekâsız, anında ev egzersiz programı + kırmızı bayraklar', run: ([b, s, w]) => program(b, s, w) },
    makbuz: { d: 'makbuz|hasta adı|tutar|açıklama|kasa (yazılırsa kasaya da gelir girer) — numaralı, yazdırılabilir ödeme makbuzu', run: ([n, a, dsc, k]) => receipt(n, a, dsc, /kasa|evet|1/.test(fold(k || ''))) },
    resmi_tatil: { d: 'resmi_tatil|yıl (boş: bu yıl) — Türkiye resmi tatilleri, bayramlar ve sıradaki tatile kalan gün', run: ([y]) => holidays(y) },
    klinik_panosu: { d: 'klinik_panosu — hasta istatistikleri: tanı dağılımı (grafik), yaş grupları, ortalama seans, ağrıdaki ortalama düşüş, aktif ve yeni hasta', run: () => dashboard() },
    deprem_alarm: { d: 'deprem_alarm|ac veya kapat veya durum|en küçük büyüklük (4)|yarıçap km (300) — Cizre çevresinde deprem olunca uyarır', run: a => quakeTool(a) },
    gun_gunlugu: { d: 'gun_gunlugu|bugün/dün/YYYY-MM-DD — o gün yapılanların raporu: seans, kasa, görev, odak, SATÜRN işlemleri', run: ([d]) => journal(d) }
  });
  WRITE_TOOLS.add('makbuz');
  TOOL_GROUPS.push([/kaç tl|kac tl|kaç dolar|kac dolar|kaç euro|çevir|cevir|kapalıçarşı|kapalicarsi|çeyrek|bilezik|dinar|riyal|dirhem|manat/i, /^(para_cevir|kapalicarsi)$/]);
  TOOL_GROUPS.push([/borsa|bist|hisse|yükselen|yukselen|düşen|dusen|geçmiş|gecmis|grafiği|grafigi|son \d+ gün|yıllık/i, /^(borsa_tara|fiyat_gecmisi)$/]);
  TOOL_GROUPS.push([/egzersiz|program|makbuz|tahsilat|ödeme|tatil|bayram|pano|istatistik|deprem|bugün ne yaptım|günlüğ|gunlug/i, /^(egzersiz_kutuphanesi|makbuz|resmi_tatil|klinik_panosu|deprem_alarm|gun_gunlugu)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nYENİ (26): para/altın çevirisi → para_cevir; Kapalıçarşı tablosu → kapalicarsi; günün borsa hareketleri → borsa_tara; fiyat geçmişi/grafiği → fiyat_gecmisi; hızlı ev programı (yapay zekâsız) → egzersiz_kutuphanesi; ödeme makbuzu → makbuz; tatiller → resmi_tatil; hasta istatistikleri → klinik_panosu; deprem uyarısı → deprem_alarm; “bugün ne yaptım” → gun_gunlugu.';

  /* ================= doğal dil kısayolları (yapay zekâ beklemeden, internet kotası harcamadan) ================= */
  const later = (fn, msg) => { setTimeout(async () => { try { const t = await fn(); if (t) show(t); } catch (e) { note(e.message); } }, 20); return msg; };
  const _lc = localCommand;
  localCommand = text0 => {
    const t = String(text0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (window.jarvisUltra?.guest?.()) return _lc(text0);
    if (/^(\d[\d.,]*\s*(?:bin|milyon)?|bir|yarim)\s+[a-z ]{2,30}\s+(kac|ne kadar)\s*[a-z]{0,12}( eder| yapar| olur)?$/.test(f) && unitOf(f.replace(/^(\d[\d.,]*\s*(?:bin|milyon)?|bir|yarim)\s+/, '').replace(/\s+(kac|ne kadar).*$/, ''))) return later(() => convert(t), '💱 Hesaplıyorum…');
    if (/^(kapalicarsi|kapali carsi|altin fiyatlari|altin tablosu|doviz tablosu|kapalicarsi fiyatlari)$/.test(f)) return later(bazaar, '🏛 Kapalıçarşı fiyatlarını alıyorum…');
    let m;
    if ((m = f.match(/^(bist|borsa|abd|amerika)(?:'?(?:da|de|ta|te))?\s*(?:bugun\s*)?(?:en cok\s*)?(yukselen|dusen|islem goren|hacim)(?:ler|lar)?(?: hisseler)?$/))) return later(() => movers(/abd|amerika/.test(m[1]) ? 'abd' : 'bist', m[2]), '📊 Borsayı tarıyorum…');
    if ((m = f.match(/^(?:bugun\s*)?en cok (yukselen|dusen)(?:ler)?(?: hisseler)?$/))) return later(() => movers('bist', m[1]), '📊 Borsayı tarıyorum…');
    if ((m = t.match(/^(.{3,40}?)\s+(?:için|icin)\s+(\d[\d.,]*)\s*(?:tl|₺|lira)?\s+makbuz(?:\s+(?:kes|hazırla|hazirla|yaz))?(?:\s*[:,-]\s*(.+))?$/i))) return later(() => { receipt(m[1].trim(), m[2], m[3] || '', false); return ''; }, '🧾 Makbuz hazırlanıyor…');
    if ((m = f.match(/^(.{2,25}?)\s+(?:son\s+)?(\d{1,4})\s*(?:gun|gunluk)\s*(?:grafigi|grafik|gecmisi|gecmis)$/)) || (m = f.match(/^(.{2,25}?)\s+(?:fiyat\s+)?(?:gecmisi|grafigi)$/))) return later(() => history(m[1], m[2] || 30), '📉 Geçmiş verisini alıyorum…');
    if ((m = f.match(/^(bel|boyun|omuz|diz|kalca|ayak|ayak bilegi|durus|postur)\s+(?:icin\s+)?(?:hizli\s+)?(?:ev\s+)?egzersiz(?:\s+programi|leri)?\s*(baslangic|orta|ileri)?$/))) return program(m[1], m[2]);
    if (/^(resmi tatiller|tatiller|bayramlar|siradaki tatil|resmi tatil)$/.test(f)) return later(() => holidays(), '📅 Tatil takvimine bakıyorum…');
    if (/^(klinik panosu|klinik istatistikleri|hasta istatistikleri|klinik paneli)$/.test(f)) return dashboard();
    if ((m = f.match(/^deprem alarmi(?:ni)?\s*(ac|kapat|durum)?$/))) return later(() => quakeTool([m[1] || 'durum']), '🌍 Deprem alarmı…');
    if (/^(bugun ne yaptim|gun gunlugu|bugunun ozeti|gunluk rapor)$/.test(f)) return journal('bugün');
    if (/^(dun ne yaptim)$/.test(f)) return journal('dün');
    if (/^(yeni ozellikler|yeni araclar|surum 26|surum 30|surum 31|surum 32|surum 33|surum 34|surum 35|neler yeni)$/.test(f)) return HELP;
    return _lc(text0);
  };
  const HELP = '🆕 SATÜRN 26 — 10 YENİ ÖZELLİK\n1) “250 euro kaç TL”, “3 çeyrek kaç TL”, “1 milyon dinar kaç TL” — anında çeviri\n2) “Kapalıçarşı” — tüm altın ve döviz tablosu (IQD, SAR dahil)\n3) “BIST’te en çok yükselenler”, “ABD düşenler” — günün hisseleri\n4) “gram altın 90 gün grafiği”, “BTC geçmişi” — fiyat geçmişi ve grafik\n5) “diz egzersiz programı orta” — internetsiz, anında ev programı\n6) “Ayşe Yılmaz için 1500 TL makbuz” — numaralı ödeme makbuzu\n7) “resmi tatiller” — bayramlar ve sıradaki tatil\n8) “klinik panosu” — hasta istatistikleri ve tanı grafiği\n9) “deprem alarmını aç” — Cizre çevresi deprem uyarısı\n10) “bugün ne yaptım” — gün günlüğü\n\n🆕 SATÜRN 27 — 20 YENİ ÖZELLİK\nKLİNİK: 1) “gonyometre” — fotoğraftan eklem açısı · 2) “postür analizi yan” · 3) “2. yatak TENS 20 dk” — çoklu cihaz zamanlayıcısı · 4) “sesli koç diz orta” — tekrar sayan sesli egzersiz koçu · 5) “Ayşe Yılmaz için epikriz” — tedavi sonu raporu · 6) “yarın 14:00 iptal oldu” — bekleme listesinden doldur · 7) “işletme analizi” · 8) Online randevu formu (MERKEZ)\nGÜNLÜK: 9) “toplantıyı kaydet” — döküm + özet + görevler · 10) “belge tara” — PDF · 11) “belge çevir arapça” · 12) “Cizre’den Mardin’e ne kadar” — rota + yakıt · 13) “nakit akışı” · 14) “vergi takvimi” · 15) “trafik sigortası 12 Mart 2027’de bitiyor” · 16) “annem için tansiyon ilacı 09:00 ve 21:00 hatırlat” · 17) “namaz hatırlatıcısını aç” · 18) “hava uyarısını aç” — toz dahil · 19) “youtube stüdyo: diz ağrısına 3 egzersiz” · 20) “indirilenleri analiz et / düzenle”\nMERKEZ sekmesi: WhatsApp gelen kutusu, online randevu, Kripto Radar, akıllı ev, ZOİ — tek panel.\n\n⚡ SATÜRN 30 — HIZ ve ZEKÂ\n1) Ctrl+K veya ⚡ düğmesi — komut paleti: her özellik, hasta, görev anında · 2) Hızlı kayıt: “Ayşe 1500 ödedi”, “Ali seans yapıldı ağrı 3”, “Mehmet 2000 borçlu”, “kira 15000 ödedim” — yapay zekâ beklemeden · 3) “Ali için 10 seans haftada 3 saat 14:00” — çakışmasız seans serisi + hastaya WhatsApp · 4) “gelir hedefim 150000” — tempo ve ay sonu tahmini · 5) “bırakma riski” — hasta risk puanı · 6) Akıllı önbellek — aynı soruya kota harcamadan anında yanıt · 7) 💡 öneri çipi · 8) Kısayollar: / yazı kutusu, Alt+G görev, Alt+K kasa\n🧠 SATÜRN 31 — ZEKİ YAZIM ve GÜVENLİK AĞI\n1) Yazarken öneri — Tab ile tamamla · 2) “geri al” — son kaydı geri çevir · 3) “Ayşe kaç seansta iyileşir” · 4) “kontrol çağrısı” — eski hastalara nazik mesaj · 5) Otomatik günlük yedek — “yedekler”, “yedekten dön 2026-11-24” · 6) ⏰ sıradaki randevu geri sayımı · 7) Seans serisi hastanın her zamanki saatini öğrenir\n\n🎯 SATÜRN 32 — AKIL\n1) Bağlam: “o kaç seansta iyileşir”, “onun için 10 seans haftada 3”, “o 1500 ödedi” — son konuştuğun hastayı anlar · 2) Yazım hatası toleransı: “Aysee 1500 ödedi” · 3) “şimdi ne yapayım” — en önemli 5 iş, tek dokunuş · 4) “gider analizi” — kategoriler, 3 ay kıyas, olağandışı artış uyarısı · 5) En sık komutların ★ ile öneride öne çıkar · 6) “tekrar” — son komutu yinele\n\n🧠 SATÜRN 33 — DEHA\n1) Çok adımlı komut: “Ayşe 1500 ödedi ve seans yapıldı ağrı 4, yarın 15:00 kontrol” · 2) Kendi verine soru (kotasız, anında): “bu ay kaç seans”, “geçen ay ne kadar kazandım”, “Ayşe ne kadar ödedi”, “Ali kaç seans oldu”, “en çok gelen hastalar”, “bugün kimler geldi” · 3) “içgörüler” — yoğun gün/saat, tanıya göre iyileşme, tahsilat oranı · 4) Seans kaydında klinik zekâ: ağrı artışı, plato ve hedefe iniş anında fark edilir\n\n🎨 SATÜRN 34 — TASARIM USTASI\n1) Tasarım eğitimi: tipografi ölçeği, ızgara, 60-30-10 renk, kontrast, hiyerarşi — her tasarımda · 2) Tasarım eleştirmeni: taşma, çakışma, düşük kontrast, küçük yazı otomatik bulunur ve düzeltilir, puan verilir · 3) Hazır şablonlar (kotasız): “şablon bilgi: Başlık | madde | madde”, “hazır tasarım: diz ağrısı için 4 öneri”, kampanya / söz / istatistik / duyuru / egzersiz · 4) Ürün/makine tasarımı: “yatak kenarına takılan pedal aparatı tasarla” → teknik çizim, parça listesi, hesaplar, üretim adımları, maliyet, konsept görsel · “tasarım kontrol”\n\n🔬 SATÜRN 35 — BİLİM ÇEKİRDEĞİ + TASARIM MİMARI (yerel, kotasız, kesin)\nMATEMATİK: “hesapla: sin(30°)+2^10”, “türev: x^3*sin(x)”, “integral: x*e^x”, “integral: exp(-x^2) -inf ile inf”, “limit: sin(x)/x x->0”, “çöz: x^2+2x+5=0”, “çöz: 2x+y=5; x-y=1”, “taylor: sin(x) 7 derece”, “matris ters: [[4,7],[2,6]]”, “çiz: x^3-3x -3 ile 3”\nİSTATİSTİK: “istatistik: 12, 15, 14…”, “t testi: … | …”, “eşleştirilmiş t: önce | sonra”, “mann whitney”, “korelasyon”, “regresyon” (grafikli), “anova”, “ki kare: [[20,30],[30,20]]”, “örneklem büyüklüğü d=0.5”, “klinik istatistik” — hastalarının tedavi sonucu anlamlı mı?\nFİZİK · MÜHENDİSLİK · MİMARLIK · BİYOLOJİ · KİMYA · EKONOMİ: 99 formül (“formüller”), ör. “basit kiriş ortada tekil yük sehim P=1000 L=2 E=2e11 I=8e-6”, “hedef nabız HRmax=180 HRr=60 k=0.7”, “başabaş noktası F=60000 P=1000 V=200” · “mol kütlesi C6H12O6”, “denkleştir: KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2” · “5 km kaç mil”, “37 c kaç f” · “npv 10: -50000, 15000, 20000, 25000”, “kredi: 500000 %3,5 24 ay”\nTASARIM: “14x10 m klinik planı çiz: bekleme 22, tedavi 11, …” veya “120 m² fizik tedavi kliniği planı çiz” — ölçekli kat planı · “palet #0e7c86” · “3 seçenek: …” · “grafik: Ocak 120, Şubat 150 …”, “pasta grafik: …”, “aylık gelir grafiği”, “gider pasta grafiği”\n\n🔧 Düzeltme: yerel bilgisayar yardımcısına bağlantıyı engelleyen güvenlik ayarı hatası giderildi.';
  // yetenek düğmeleri
  for (const [k, label, fn] of [['kc', 'Kapalıçarşı', () => { note('🏛 Kapalıçarşı fiyatlarını alıyorum…'); later(bazaar, ''); }], ['yeni', 'Yeni özellikler', () => show(HELP)]]) {
    SKILLS[k] = { label, run: fn };
    for (const box of ['skills', 'mobileSkills']) $(box)?.append(el('button', { type: 'button', onclick: () => { window.jarvisUnlock?.(); fn(); } }, label));
  }
  window.jarvisYeni = { convert, bazaar, movers, history, program, receipt, holidays, dashboard, quakeCheck, journal, trWords, HELP };
})();
