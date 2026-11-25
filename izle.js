'use strict';
/* SATÜRN 24 — PİYASA BEKÇİSİ: canlı akışı sürekli izler, kendiliğinden haber verir (kotasız)
 *  • Ani hareket: 15 dk ve 60 dk değişim eşikleri (kripto / altın / dolar için ayrı), hassasiyet ayarlı
 *  • 24 saatlik zirve/dip kırılımı (WebSocket miniTicker h/l)
 *  • İzleme listesi: “ETH’yi izle”, “izleme listem”
 *  • Sabah 09:30 ve akşam 18:30 piyasa özeti (BTC, ETH, ons/gram altın, USD/TRY, Korku-Açgözlülük)
 *  • Bildirim: ekranda + sesli (konuşmuyorsa) + telefona (ntfy açıksa); her kural için 60 dk sessizlik
 *  Not: iPhone uygulamayı arka planda uyutur; izleme uygulama açıkken (ya da “mini pencere” açıkken) kesintisizdir.
 */
(() => {
  const MIN = 60000;
  const BG_TOPIC = 'saturn-piyasa-9gtmwv4rx3rvg2'; // GitHub Actions arka plan bekçisinin YALNIZ piyasa için ayrılmış kanalı (bg/config.json)
  const guest = () => !!window.jarvisUltra?.guest?.();
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d });
  const OZ = 31.1034768;
  const L = () => window.jarvisPicks?.live;
  const SENS = { dusuk: 1.6, orta: 1, yuksek: 0.6 };
  const sens = () => SENS[store.get('set.watchSens', 'orta')] || 1;
  // sınıf eşikleri (orta): [15 dk %, 60 dk %]
  const TH = { kripto: [2.5, 4], altin: [0.8, 1.2], doviz: [0.5, 0.8] };
  const cls = s => s === 'PAXGUSDT' ? 'altin' : s === 'USDTTRY' ? 'doviz' : 'kripto';
  const label = s => s === 'PAXGUSDT' ? 'Altın (ons)' : s === 'USDTTRY' ? 'Dolar/TL' : s.replace(/USDT$/, '');
  const fmt = (s, p) => s === 'USDTTRY' ? nf(p, 3) + ' TL' : s === 'PAXGUSDT' ? nf(p, 0) + ' $' : (p < 1 ? nf(p, 5) : p < 100 ? nf(p, 3) : nf(p, 0)) + ' $';
  const watch = () => store.get('watchList', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PAXGUSDT', 'USDTTRY']);
  const hist = {}; // sembol → [{t, p}] son 2 saat (dakikalık örnek)
  const cool = store.get('watchCool', {});
  const sent = (k, ms = 60 * MIN) => { if (cool[k] && Date.now() - cool[k] < ms) return true; cool[k] = Date.now(); store.set('watchCool', Object.fromEntries(Object.entries(cool).filter(([, t]) => Date.now() - t < 26 * 3600000))); return false; };
  const log = []; // son uyarılar (panel)
  function alert(msg, key, ms) {
    if (sent(key, ms)) return false;
    log.unshift({ t: Date.now(), msg }); log.length = Math.min(log.length, 20); paint();
    note('📈 ' + msg);
    try { if (setting('speakOn') === '1' && opt('watchVoice') !== '0' && typeof phase !== 'undefined' && phase === 'idle' && !window.jarvisLive?.active?.()) voiceSession.read(msg.replace(/[^\p{L}\p{N}\s,.%+-]/gu, '').replace(/%/g, 'yüzde ')); } catch {}
    if (opt('ntfyOn') === '1' && opt('bgWatch') !== '1') window.jarvisPushPhone?.(msg, { title: 'SATÜRN piyasa', tags: 'chart_with_upwards_trend', priority: 4 })?.catch?.(() => {}); // arka plan bekçisi açıksa telefona o gönderir (çift bildirim olmaz)
    return true;
  }
  // “mins dakika önceki” fiyat: o kadar (en az %90’ı) eski örneklerin EN YENİSİ — daha eski yoksa hesap yok
  const change = (s, mins) => { const H = hist[s]; if (!H?.length) return null; const now = H.at(-1), old = H.filter(x => x.t <= now.t - mins * MIN * 0.9).at(-1); if (!old) return null; return (now.p / old.p - 1) * 100; };
  function sample(ts = Date.now()) {
    const P = L()?.prices || {};
    for (const s of watch()) { const v = P[s]; if (!v || ts - v.t > 5 * MIN) continue; const H = (hist[s] ||= []); if (!H.length || ts - H.at(-1).t >= 55000) H.push({ t: ts, p: v.p }); while (H.length && ts - H[0].t > 130 * MIN) H.shift(); }
  }
  function check() {
    if (opt('watchOn') === '0' || guest()) return [];
    const P = L()?.prices || {}, fired = [];
    for (const s of watch()) {
      const v = P[s]; if (!v) continue; const [a15, a60] = TH[cls(s)].map(x => x * sens());
      const c15 = change(s, 15), c60 = change(s, 60);
      if (c15 != null && Math.abs(c15) >= a15 && alert(`${label(s)} son 15 dakikada ${c15 > 0 ? 'sert yükseldi' : 'sert düştü'}: %${nf(c15, 1)} → ${fmt(s, v.p)}`, s + ':15:' + Math.sign(c15), 45 * MIN)) fired.push(s + ':15');
      else if (c60 != null && Math.abs(c60) >= a60 && alert(`${label(s)} son 1 saatte %${nf(c60, 1)} ${c60 > 0 ? 'yükseldi' : 'düştü'} → ${fmt(s, v.p)}`, s + ':60:' + Math.sign(c60))) fired.push(s + ':60');
      if (v.h && v.p >= v.h * 0.9995 && Math.abs(v.ch) >= 1 && alert(`${label(s)} 24 saatin ZİRVESİNİ kırdı: ${fmt(s, v.p)} (24s %${nf(v.ch, 1)})`, s + ':hi', 6 * 3600000)) fired.push(s + ':hi');
      if (v.l && v.p <= v.l * 1.0005 && Math.abs(v.ch) >= 1 && alert(`${label(s)} 24 saatin DİBİNE indi: ${fmt(s, v.p)} (24s %${nf(v.ch, 1)})`, s + ':lo', 6 * 3600000)) fired.push(s + ':lo');
    }
    return fired;
  }
  setInterval(() => { sample(); check(); }, 30000);

  /* ---------- sabah / akşam özeti ---------- */
  async function brief() {
    const P = L()?.prices || {}, T = P.USDTTRY?.p, G = P.PAXGUSDT?.p;
    let fng = '';
    try { const r = await withTimeout(fetch('https://api.alternative.me/fng/?limit=1'), 8000, 'zaman aşımı'); const j = await r.json(); fng = ` · Korku-Açgözlülük ${j.data[0].value} (${j.data[0].value_classification})`; } catch {}
    const line = s => P[s] ? `${label(s)} ${fmt(s, P[s].p)} (${P[s].ch >= 0 ? '▲' : '▼'}%${nf(Math.abs(P[s].ch), 1)})` : null;
    const parts = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(line).filter(Boolean);
    if (G && T) parts.push(`Gram altın ${nf(G / OZ * T, 0)} TL (${P.PAXGUSDT.ch >= 0 ? '▲' : '▼'}%${nf(Math.abs(P.PAXGUSDT.ch), 1)})`);
    if (T) parts.push(`Dolar/TL ${nf(T, 3)}`);
    for (const s of watch().filter(x => !['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PAXGUSDT', 'USDTTRY'].includes(x))) { const l = line(s); if (l) parts.push(l); }
    if (!parts.length) return 'Canlı fiyat henüz gelmedi; birkaç saniye sonra tekrar dene.';
    const moves = log.filter(x => Date.now() - x.t < 12 * 3600000).length;
    return `📈 PİYASA ÖZETİ — ${isoLocal(now()).slice(11, 16)}\n${parts.join('\n')}${fng}\n${moves ? `Son 12 saatte ${moves} hareket uyarısı.` : 'Son 12 saatte olağan dışı hareket yok.'}`;
  }
  async function briefAuto() {
    if (opt('watchBrief') === '0' || guest() || document.hidden) return;
    const s = isoLocal(now()), hm = +s.slice(11, 13) * 60 + +s.slice(14, 16), d = s.slice(0, 10), st = store.get('watchBriefDone', {});
    const slot = hm >= 570 && hm < 690 ? 'am' : hm >= 1110 && hm < 1260 ? 'pm' : null; if (!slot || st[slot] === d) return;
    if (!Object.keys(L()?.prices || {}).length) return;
    st[slot] = d; store.set('watchBriefDone', st);
    const t = await brief(); const n = bubble('ai', t); answerTools?.(n.el, t);
    if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(t.split('\n').slice(1, 4).join(' · '), { title: 'SATÜRN piyasa özeti', tags: 'chart_with_upwards_trend' })?.catch?.(() => {});
  }
  setInterval(() => briefAuto().catch(() => {}), 5 * MIN); setTimeout(() => briefAuto().catch(() => {}), 90000);

  /* ---------- izleme listesi ---------- */
  const COINS = new Set('BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT TRX LTC SUI NEAR APT ARB OP INJ PEPE TON SHIB POL MATIC ATOM UNI FIL ETC BCH XLM HBAR ICP RENDER FET WIF BONK SEI TIA JUP AAVE MKR RUNE ALGO VET SAND MANA AXS GALA IMX STX FLOKI ENA ONDO TAO WLD PENDLE JTO PYTH'.split(' '));
  const NAMES = { bitcoin: 'BTC', ethereum: 'ETH', eter: 'ETH', solana: 'SOL', ripple: 'XRP', dogecoin: 'DOGE', avalanche: 'AVAX', cardano: 'ADA', polkadot: 'DOT', litecoin: 'LTC', toncoin: 'TON', shiba: 'SHIB', chainlink: 'LINK', tron: 'TRX' };
  // yalnız tanınan kripto/altın/dolar kabul edilir (“youtube izle”, “film izle” izleme listesine girmez)
  const symOf = q => { const f = fold(q).replace(/['’].*$/, '').replace(/(yi|yı|i|ı|u|ü)$/, '').trim(); if (/^(altin|gram altin|ons|gold|paxg)$/.test(f)) return 'PAXGUSDT'; if (/^(dolar|usd|dolar kuru|usdtry)$/.test(f)) return 'USDTTRY'; const n = NAMES[f] || NAMES[fold(q).trim()]; if (n) return n + 'USDT'; const t = f.toUpperCase().replace(/USDT$/, ''); if (COINS.has(t) || (window.jarvisPicks?.live?.prices?.[t + 'USDT'])) return t + 'USDT'; return null; };
  function watchAdd(q) { const s = symOf(q); if (!s) return null; const W = watch(); if (!W.includes(s)) W.push(s); store.set('watchList', W.slice(0, 20)); window.jarvisPicks?.liveSub?.([s]); return `👁 ${label(s)} izleme listesine eklendi. Ani hareket ve 24s zirve/dip kırılımında haber vereceğim.`; }
  function watchDel(q) { const s = symOf(q); const W = watch().filter(x => x !== s); store.set('watchList', W); return `${label(s || q)} izlemeden çıkarıldı.`; }
  function watchShow() {
    const P = L()?.prices || {};
    return `👁 İZLEME LİSTESİ (hassasiyet: ${store.get('set.watchSens', 'orta')})\n` + watch().map(s => `• ${label(s)}: ${P[s] ? fmt(s, P[s].p) + ` (24s %${nf(P[s].ch, 1)}${change(s, 60) != null ? `, 1s %${nf(change(s, 60), 2)}` : ''})` : 'veri bekleniyor'}`).join('\n') + (log.length ? '\nSon uyarı: ' + log[0].msg : '');
  }

  /* ---------- panel ---------- */
  const box = el('div', { id: 'watchBox' }), logEl = el('ul', { class: 'list', id: 'watchLog' });
  const sel = (id, opts, def) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = store.get('set.' + id, def); s.onchange = () => store.set('set.' + id, s.value); return s; };
  box.append(el('h3', {}, 'PİYASA BEKÇİSİ'), el('p', { class: 'muted' }, 'Canlı fiyatları sürekli izler; ani hareket, 24 saatlik zirve/dip kırılımı olunca kendiliğinden haber verir. Sabah 09:30 ve akşam 18:30 özet.'),
    el('div', { class: 'field' }, el('label', { for: 'watchOn' }, 'Sürekli izleme'), sel('watchOn', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    el('div', { class: 'field' }, el('label', { for: 'watchSens' }, 'Hassasiyet'), sel('watchSens', [['orta', 'Orta (kripto %2,5/15 dk · %4/1 saat)'], ['yuksek', 'Yüksek (daha sık haber)'], ['dusuk', 'Düşük (yalnız büyük hareket)']], 'orta')),
    el('div', { class: 'field' }, el('label', { for: 'watchBrief' }, 'Sabah/akşam piyasa özeti'), sel('watchBrief', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    el('div', { class: 'field' }, el('label', { for: 'watchVoice' }, 'Uyarıyı sesli de söyle'), sel('watchVoice', [['1', 'Evet'], ['0', 'Hayır']], '1')),
    el('details', { id: 'bgWatchSec' }, el('summary', {}, '🌙 Uygulama KAPALIYKEN de haber al (arka plan bekçisi)'),
      el('p', { class: 'muted' }, 'GitHub sunucusunda 10 dakikada bir çalışır (ücretsiz). BTC, ETH, SOL, BNB, XRP, altın ve dolar/TL’de sert hareket ya da 24 saatlik zirve/dip kırılımı olunca; ayrıca 09:30 ve 18:30’da özet gönderir. Yalnız herkese açık piyasa verisi taşır — kişisel bildirim kanalından ayrıdır.'),
      el('ol', { class: 'muted' }, el('li', {}, 'Telefona ücretsiz “ntfy” uygulamasını kur (App Store).'), el('li', {}, 'ntfy’de “+” → konu adı olarak aşağıdakini yaz (ya da kopyala) → Abone ol.'), el('li', {}, 'Bildirim iznini ver. Bitti.')),
      el('div', { class: 'row' }, el('code', { id: 'bgTopic', style: 'user-select:all;word-break:break-all' }, BG_TOPIC), el('button', { type: 'button', class: 'btn ghost', onclick: async e => { try { await navigator.clipboard.writeText(BG_TOPIC); e.target.textContent = '✓ Kopyalandı'; } catch { e.target.textContent = 'Seçip kopyala'; } } }, '📋 Kopyala'), el('a', { class: 'btn ghost', href: 'https://ntfy.sh/' + BG_TOPIC, target: '_blank', rel: 'noopener' }, 'Tarayıcıda aç')),
      el('div', { class: 'field' }, el('label', { for: 'bgWatch' }, 'Abone oldum — piyasa bildirimlerini arka plan bekçisi göndersin (çift bildirim olmasın)'), sel('bgWatch', [['0', 'Hayır'], ['1', 'Evet']], '0'))),
    logEl);
  { const pk = $('pkSec'); if (pk) pk.after(box); else $('p-market')?.append(box); }
  function paint() { logEl.replaceChildren(...(log.length ? log.slice(0, 6).map(x => el('li', { class: 'item' }, el('small', {}, new Date(x.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })), el('p', {}, x.msg))) : [el('li', { class: 'muted' }, 'Henüz uyarı yok — piyasa sakin.')])); }
  paint();

  /* ---------- araçlar + komutlar ---------- */
  Object.assign(TOOLS, {
    piyasa_izle: { d: 'piyasa_izle|ekle/cikar/liste|sembol (BTC, ETH, altın, dolar…) — sürekli izleme listesi; ani hareket ve zirve/dip kırılımında kendiliğinden haber verir', run: ([op, s]) => /ekle/.test(op || '') ? (watchAdd(s) || 'Sembol tanınmadı (kripto kısaltması, altın ya da dolar yaz).') : /cikar|çıkar|sil/.test(op || '') ? watchDel(s) : watchShow() },
    piyasa_ozet: { d: 'piyasa_ozet — anlık piyasa özeti (BTC, ETH, SOL, gram altın, dolar/TL, Korku-Açgözlülük)', run: () => brief() }
  });
  TOOL_GROUPS.push([/izle|takip|piyasa|özet|bitcoin|btc|eth|altın|dolar|kripto/i, /^(piyasa_izle|piyasa_ozet)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nPİYASA BEKÇİSİ: “X’i izle / izleme listem” → piyasa_izle; “piyasa özeti” → piyasa_ozet (ayrıntılı tarama isteğinde piyasa_tara). Bekçi canlı akışı sürekli izler ve ani hareketlerde kendiliğinden haber verir.';
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''); let m;
    if (guest()) return _lc(text0);
    if ((m = t.match(/^(.{2,20}?)(?:['’]?(?:yi|yı|yu|yü|i|ı|u|ü))? (?:izle|takip et|izlemeye al)$/i)) && symOf(m[1])) return watchAdd(m[1]);
    if ((m = t.match(/^(.{2,20}?)(?:['’]?(?:yi|yı|i|ı))? (?:izlemeyi bırak|izlemeden çıkar|takibi bırak)$/i))) return watchDel(m[1]);
    if (/^(izleme listem|izleme listesi|neleri izliyorsun)$/i.test(t)) return watchShow();
    if (/^(arka plan bekçisi|kapalıyken (?:de )?haber ver|uygulama kapalıyken bildirim)$/i.test(t)) { const n = bubble('ai', `🌙 Arka plan bekçisi GitHub’da 10 dakikada bir çalışıyor. Telefona “ntfy” uygulamasını kur → “+” → konu: ${BG_TOPIC} → Abone ol. Sonra PİYASA → Piyasa bekçisi → “Abone oldum: Evet” seç.`); n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: async e => { try { await navigator.clipboard.writeText(BG_TOPIC); e.target.textContent = '✓ Konu kopyalandı'; } catch {} } }, '📋 Konuyu kopyala'))); return 'Arka plan bekçisi kurulum bilgisi.'; }
    if (/^(piyasa özeti|canlı piyasa özeti|anlık piyasa özeti)$/i.test(t)) { brief().then(x => { const n = bubble('ai', x); answerTools?.(n.el, x); }).catch(e => note(e.message)); return 'Piyasa özeti hazırlanıyor…'; }
    return _lc(text0);
  };
  window.jarvisWatch = { BG_TOPIC, sample, check, change, hist, brief, briefAuto, watch, watchAdd, watchDel, watchShow, log, TH };
})();
