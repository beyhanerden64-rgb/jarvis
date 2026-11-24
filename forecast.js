'use strict';
/* SATÜRN 20 — SENARYO TAHMİN MOTORU
 *  Her konuda (kripto, altın, döviz, borsa, ekonomi, spor, hava, gündem…) gerekçeli, olasılıklı tahmin:
 *   • Piyasa varlıklarında nicel çapa: son 90 günün oynaklığından vade sonu için %68 ve %95 fiyat aralığı, 30 günlük eğilim, RSI, ortalamalar
 *   • Güncel bağlam: Google aramalı kısa haber taraması (kaynaklı)
 *   • Sonuç: iyimser / temel / kötümser senaryo (olasılıklar toplamı %100), izlenecek göstergeler, güven düzeyi
 *   • Ölçülebilirlik: temel senaryo ZOİ'ye kaydedilir; piyasa tahminleri vade dolunca OTOMATİK sonuçlanır → isabet oranı (Brier)
 *  Garanti vermez, “kesin al/sat” demez; karar Beyhan'ındır. */
(() => {
  const BN = 'https://data-api.binance.vision/api/v3/';
  const DAY = 86400000;
  const jsonOf = t => { try { return JSON.parse((String(t).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch { return null; } };
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d });
  const ymd = t => new Date(t + 3 * 3600000).toISOString().slice(0, 10);
  function horizon(text) {
    const f = fold(text);
    const m = f.match(/(\d+)\s*(gun|hafta|ay|yil)/);
    if (m) return Math.min(730, +m[1] * { gun: 1, hafta: 7, ay: 30, yil: 365 }[m[2]]);
    return /yarin/.test(f) ? 1 : /bu hafta|haftaya|onumuzdeki hafta|haftalik/.test(f) ? 7 : /yil sonu|yilsonu/.test(f) ? Math.max(7, Math.round((Date.UTC(new Date().getUTCFullYear(), 11, 31) - Date.now()) / DAY)) : /yil|sene/.test(f) ? 365 : /3 ay|ceyrek/.test(f) ? 90 : 30;
  }
  // piyasa istatistiği (Binance günlük mumları)
  async function marketStats(subject) {
    const M = window.jarvisMarkets; if (!M) return null;
    let r; try { r = await M.resolve(subject); } catch { return null; }
    let sym = null, mult = 1, unit = 'USD', label = subject;
    if (r.kind === 'kripto') { sym = r.key + 'USDT'; label = r.key; }
    else if (r.kind === 'altin') { sym = 'PAXGUSDT'; label = { gram: 'Gram altın', ceyrek: 'Çeyrek altın', yarim: 'Yarım altın', tam: 'Tam altın', ons: 'Ons altın' }[r.key] || 'Altın'; if (r.key !== 'ons') { const u = await M.fx().then(f => f.USD).catch(() => null); if (!u) return null; mult = u / 31.1034768 * ({ gram: 1, ceyrek: 1.604, yarim: 3.208, tam: 6.416 }[r.key] || 1); unit = 'TL'; } }
    else if (r.kind === 'fx' && r.key === 'USD') { sym = 'USDTTRY'; unit = 'TL'; label = 'Dolar/TL'; }
    else if (r.kind === 'fx') { return { kind: r.kind, label: r.key + '/TL', quoteOnly: true, q: await M.quote(subject).catch(() => null) }; }
    else return { kind: r.kind, label: subject, quoteOnly: true, q: await M.quote(subject).catch(() => null) };
    const k = await withTimeout(fetch(`${BN}klines?symbol=${sym}&interval=1d&limit=210`).then(x => x.json()), 12000, 'zaman aşımı');
    const c = k.map(x => +x[4] * mult).filter(Number.isFinite); if (c.length < 40) return null;
    const rets = c.slice(-91).map((v, i, a) => i ? Math.log(v / a[i - 1]) : null).filter(v => v !== null);
    const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length - 1));
    const last = c.at(-1), sma = n => c.slice(-n).reduce((a, b) => a + b, 0) / n;
    const rsi = M.rsi ? M.rsi(c) : null;
    return { kind: r.kind, label, unit, last, sd, ch30: (last / c.at(-31) - 1) * 100, ch7: (last / c.at(-8) - 1) * 100, s50: sma(50), s200: c.length >= 200 ? sma(200) : null, rsi, sym };
  }
  const band = (s, days, z) => [s.last * Math.exp(-z * s.sd * Math.sqrt(days)), s.last * Math.exp(z * s.sd * Math.sqrt(days))];

  async function forecast(subject, days = 30) {
    subject = String(subject || '').trim(); if (subject.length < 2) throw Error('Neyi tahmin edeyim?');
    if (window.jarvisUltra?.guest?.()) throw Error('Misafir modunda kapalı.');
    setPhase('thinking', 'Veriyi topluyorum…');
    const until = ymd(Date.now() + days * DAY);
    const [st, ctx] = await Promise.all([
      marketStats(subject).catch(() => null),
      (window.jarvisWebResearch?.askWeb ? window.jarvisWebResearch.askWeb('Kısa ve olgusal TÜRKÇE not (en çok 150 kelime): bu konunun son durumu, son gelişmeler, beklenen önemli tarihler/olaylar ve uzmanların beklentileri. Uydurma yok.', `${subject} — önümüzdeki ${days} gün için gelişmeler`, 'quick', true) : Promise.reject()).catch(() => ({ text: '', sources: [] }))
    ]);
    let quant = '';
    if (st && !st.quoteOnly) {
      const b68 = band(st, days, 1), b95 = band(st, days, 2);
      st.b68 = b68; st.b95 = b95;
      quant = `NİCEL VERİ (${st.label}, birim ${st.unit}): son fiyat ${nf(st.last)}; 7 gün ${nf(st.ch7, 1)}%, 30 gün ${nf(st.ch30, 1)}%; günlük oynaklık %${nf(st.sd * 100, 2)}; RSI ${st.rsi ? nf(st.rsi, 0) : '—'}; 50 günlük ort. ${nf(st.s50)}${st.s200 ? ', 200 günlük ort. ' + nf(st.s200) : ''}.\nOYNAKLIĞA GÖRE ${days} GÜN SONRASI ARALIĞI: %68 olasılıkla ${nf(b68[0])}–${nf(b68[1])}; %95 olasılıkla ${nf(b95[0])}–${nf(b95[1])}.`;
    } else if (st?.q) quant = 'GÜNCEL: ' + st.q.text;
    setPhase('thinking', 'Senaryoları hesaplıyorum…');
    const raw = await window.jarvisResearch.ask(`Sen deneyimli bir tahminci ve analistsin (süper-tahminci yaklaşımı: temel oranlar, güncel veri, belirsizlik). Bugün ${ymd(Date.now())}. Vade: ${days} gün (${until}).
Verilen nicel veriyi ÇAPA olarak kullan; aralıkları bu oynaklıkla tutarlı tut. Haber bağlamını hesaba kat. Olasılıklar toplamı 100 olsun. Kesinlik/garanti ifadesi kullanma; “al/sat” deme.
YALNIZ JSON:
{"ozet":"2 cümle, doğrudan cevap (en olası sonuç ve olasılığı)","senaryolar":[{"ad":"İyimser","olasilik":25,"aralik":"sayısal aralık ya da sonuç","aciklama":"neden, hangi koşulda"},{"ad":"Temel",...},{"ad":"Kötümser",...}],"gostergeler":["tahmini destekleyen/zayıflatan veriler"],"izlenecek":["bu tahmini değiştirecek olaylar/tarihler"],"guven":"düşük|orta|yüksek","olculebilir":{"metin":"vade sonunda doğrulanabilir TEK cümle (temel senaryo)","olasilik":55,"alt":sayı ya da null,"ust":sayı ya da null}}`,
      `KONU: ${subject}\n${quant}\nGÜNCEL BAĞLAM: ${ctx.text || '(alınamadı)'}`, 'complex');
    const j = jsonOf(raw); if (!j?.senaryolar?.length) throw Error('Tahmin üretilemedi, tekrar dener misin?');
    const tot = j.senaryolar.reduce((a, s) => a + (+s.olasilik || 0), 0) || 1;
    j.senaryolar = j.senaryolar.slice(0, 4).map(s => ({ ...s, olasilik: Math.round((+s.olasilik || 0) / tot * 100) }));
    // ZOİ kaydı + otomatik sonuçlandırma
    let zoi = '';
    try {
      const m = j.olculebilir; const pr = Math.max(1, Math.min(99, Math.round(+m?.olasilik || j.senaryolar.find(s => /temel/i.test(s.ad))?.olasilik || 50)));
      if (m?.metin) {
        TOOLS.tahmin.run([`${m.metin} (${until})`, String(pr), until]); zoi = `Temel senaryo ZOİ'ye %${pr} olasılıkla kaydedildi; ${until} tarihinde ${st?.sym && Number.isFinite(+m.alt) && Number.isFinite(+m.ust) ? 'kendiliğinden sonuçlanacak' : 'sonucunu işaretleyebilirsin'}.`;
        if (st?.sym && Number.isFinite(+m.alt) && Number.isFinite(+m.ust)) { const a = store.get('fcAuto', []); a.push({ text: m.metin, subject, lo: +m.alt, hi: +m.ust, due: Date.now() + days * DAY }); store.set('fcAuto', a.slice(-50)); }
      }
    } catch {}
    const rec = { t: Date.now(), subject, days, until, st, j, sources: ctx.sources || [], zoi };
    const h = store.get('fcHist', []); h.unshift({ t: rec.t, subject, days, ozet: j.ozet, senaryolar: j.senaryolar }); store.set('fcHist', h.slice(0, 30));
    logOp('senaryo tahmini', [short(subject, 50)], 'başarılı', `${days} gün · güven ${j.guven || '-'}`);
    setPhase('idle', 'Hazır.');
    return rec;
  }
  function text(r) {
    const { j, st } = r;
    return `🔮 TAHMİN · ${st?.label || r.subject} · ${r.days} gün (${r.until})\n${j.ozet || ''}\n\n` +
      j.senaryolar.map(s => `${/iyimser/i.test(s.ad) ? '🟢' : /kötümser/i.test(s.ad) ? '🔴' : '🟡'} ${s.ad} — %${s.olasilik}${s.aralik ? ' · ' + s.aralik : ''}\n   ${s.aciklama || ''}`).join('\n') +
      (st?.b68 ? `\n\n📐 Oynaklığa göre aralık: %68 → ${nf(st.b68[0])}–${nf(st.b68[1])} ${st.unit} · %95 → ${nf(st.b95[0])}–${nf(st.b95[1])} ${st.unit} (son ${nf(st.last)}; RSI ${st.rsi ? nf(st.rsi, 0) : '—'})` : '') +
      (j.gostergeler?.length ? '\n\nGÖSTERGELER: ' + j.gostergeler.slice(0, 5).join(' · ') : '') +
      (j.izlenecek?.length ? '\nİZLENECEK: ' + j.izlenecek.slice(0, 5).join(' · ') : '') +
      `\nGÜVEN: ${j.guven || '—'}${r.zoi ? '\n' + r.zoi : ''}\nBu bir olasılık tahminidir, garanti değildir; yatırım kararı senindir.`;
  }
  function show(r) {
    const t = text(r); const n = bubble('ai', t);
    if (r.sources?.length) addLinks(n.el, r.sources.slice(0, 6).map(s => ({ url: s.url, title: short(s.title || new URL(s.url).hostname, 60) })));
    answerTools(n.el, t);
    window.jarvisStage?.chart(`${r.st?.label || r.subject} · ${r.days} gün senaryoları (%)`, r.j.senaryolar.map(s => [s.ad, s.olasilik]), 'bar');
  }
  async function run(subject, days) { bubble('me', `🔮 Tahmin: ${subject}`); try { const r = await forecast(subject, days); show(r); return r; } catch (e) { setPhase('idle', 'Hazır.'); note('Tahmin yapılamadı: ' + e.message); } }

  // vadesi dolan piyasa tahminlerini kendiliğinden sonuçlandır
  async function autoResolve() {
    const a = store.get('fcAuto', []), due = a.filter(x => x.due <= Date.now()); if (!due.length) return 0;
    let n = 0;
    for (const x of due) {
      try { const q = await window.jarvisMarkets.quote(x.subject); const hit = q.value >= x.lo && q.value <= x.hi; TOOLS.tahmin_sonuc.run([x.text.slice(0, 40), hit ? 'evet' : 'hayır']); n++; note(`🔮 Tahmin sonuçlandı: “${short(x.text, 80)}” → ${hit ? 'TUTTU ✓' : 'tutmadı ✗'} (gerçek: ${q.text.split(' · ')[0]})`); x.done = true; } catch {}
    }
    store.set('fcAuto', a.filter(x => !x.done));
    return n;
  }
  setTimeout(() => autoResolve().catch(() => {}), 25000);
  setInterval(() => { if (!document.hidden) autoResolve().catch(() => {}); }, 6 * 3600000);

  Object.assign(TOOLS, {
    senaryo_tahmin: { d: 'senaryo_tahmin|konu (ör. gram altın, bitcoin, dolar, BIST 100, enflasyon, maç, seçim, hava)|vade (ör. 1 hafta, 1 ay, yıl sonu) — gerekçeli olasılıklı tahmin: iyimser/temel/kötümser senaryo, oynaklık aralığı, göstergeler; isabet ZOİ ile ölçülür', run: async ([s, v]) => { const r = await forecast(s, horizon(v || s)); setTimeout(() => show(r), 30); return text(r); } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nTAHMİN: Beyhan “ne olur, yükselir mi, düşer mi, tahmin et, kim kazanır” gibi bir gelecek sorusu sorarsa reddetme; senaryo_tahmin ile olasılıklı, gerekçeli tahmin ver. Garanti verme, “kesin al/sat” deme; olasılık ve belirsizliği açıkça söyle.';
  TOOL_GROUPS.push([/tahmin|ne olur|yükselir mi|düşer mi|nereye gider|kim kazanır|olasılık|ihtimal|senaryo|beklenti|öngörü|gelecek/i, /^(senaryo_tahmin|tahmin|tahmin_durum)$/]);
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, '');
    let m;
    if ((m = t.match(/^(.{2,60}?)\s+(?:için\s+)?(?:tahmin(?:in)?|tahmini|senaryo(?:ları)?)\s*(?:ver|yap|nedir|ne|et)?$/i)) || (m = t.match(/^(?:tahmin et|tahmin ver|tahminin ne)\s*[:,-]?\s*(.{2,60})$/i)) || (m = t.match(/^(.{2,40}?)\s+((?:önümüzdeki\s+\S+\s+|bu hafta\s+|yarın\s+|yıl sonu(?:na kadar)?\s+|\d+\s*(?:gün|hafta|ay|yıl)\s+(?:içinde\s+|sonra\s+)?)?(?:yükselir mi|düşer mi|ne olur|nereye gider|ne kadar olur|kaç olur))$/i))) {
      const subj = m[1].replace(/\s+(önümüzdeki|bu|gelecek)\s+(hafta|ay|yıl)$/i, '');
      if (/^(bu|şu|o|hava)$/i.test(subj)) return _lc(text0);
      const days = horizon(t); setTimeout(() => run(subj, days), 30);
      return `🔮 “${subj}” için ${days} günlük senaryoları hesaplıyorum…`;
    }
    if (/^(tahmin isabetim|tahminlerim ne kadar tuttu|isabet oranı)$/i.test(t)) return TOOLS.tahmin_durum.run([]);
    return _lc(text0);
  };
  window.jarvisForecast = { forecast, run, show, text, horizon, marketStats, band, autoResolve };
})();
