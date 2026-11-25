'use strict';
/* SATÜRN 29 — PROAKTİF ÇEKİRDEK: sormadan fark eder, önerir, tek dokunuşla yapar ve neyi sevdiğini öğrenir.
 *  • 10 dakikada bir tüm veriyi tarar (klinik, kasa, alacak, görev, alışkanlık, hedef, piyasa, hava, ilaç, bilgisayar)
 *  • Her öneri bir KART: ne fark ettiğini söyler + tek dokunuşluk eylem düğmeleri (Yap / Sonra / Bir daha önerme)
 *  • ÖĞRENİR: kabul ettiğin öneri türü daha sık, görmezden geldiğin/reddettiğin daha seyrek gelir (Bayes skor)
 *  • Sessiz saatler (22:00–08:00), günlük üst sınır, tekrar etmeme; seviye: kapalı / az / normal / çok
 *  • Sabah ilk açılışta SABAH KARTI (yapay zekâ gerekmez): hava/toz, randevular, ilaçlar, son günler, alacaklar, altın/döviz
 *  • Akşam 19:00 GÜN KAPANIŞI kartı, pazartesi HAFTA AÇILIŞI kartı */
(() => {
  const DAY = 86400000, $id = id => document.getElementById(id);
  const P = () => (typeof patients !== 'undefined' ? patients : []), IT = () => (typeof items !== 'undefined' ? items : []);
  const todayK = () => isoLocal(now()).slice(0, 10), hhmm = () => isoLocal(now()).slice(11, 16), hour = () => +hhmm().slice(0, 2);
  const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
  const tl = v => Math.round(v).toLocaleString('tr-TR') + ' TL';
  const wa = (tel, text) => `https://wa.me/${String(tel || '').replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(text)}`;
  const first = s => String(s || '').split(/\s+/)[0];
  const go = t => { $id('drawer')?.classList.remove('open'); typedTurn(t, false); };
  const run = async (tool, args) => { try { const r = await window.jarvisRunTools([[tool, ...args].join('|')], { voiceTurn: false, say: () => {} }); bubble('ai', r.text.replace(/^[a-z_]+(?:\|[^\n:]*)?: BAŞARILI — /gm, '')); } catch (e) { note(e.message); } };

  /* ---------- ayarlar + öğrenme ---------- */
  const LEVEL = () => store.get('set.proLevel', 'normal'), CAP = { kapali: 0, az: 3, normal: 6, cok: 12 };
  const S = () => store.get('proState', { day: '', shown: 0, seen: {}, mute: {}, score: {} });
  const saveS = s => store.set('proState', s);
  const weight = rule => { const sc = S().score[rule] || { a: 1, r: 1 }; return sc.a / (sc.a + sc.r); }; // kabul oranı (Laplace)
  function feedback(rule, ok) { const s = S(); const sc = s.score[rule] ||= { a: 1, r: 1 }; ok ? sc.a++ : sc.r++; saveS(s); }

  /* ---------- kart ---------- */
  const pending = new Map();
  function card(o) {
    const s = S(); if (s.day !== todayK()) { s.day = todayK(); s.shown = 0; }
    if (s.mute[o.rule] || s.seen[o.key] || pending.has(o.key)) return false;
    if (!o.force && (s.shown >= CAP[LEVEL()] || (hour() >= 22 || hour() < 8))) return false;
    if (!o.force && weight(o.rule) < 0.2 && Math.random() > 0.3) { s.seen[o.key] = Date.now(); saveS(s); return false; } // sık reddedilen tür seyrekleşir
    s.seen[o.key] = Date.now(); s.shown++; saveS(s);
    const b = bubble('ai', `${o.icon || '💡'} ${o.text}`);
    const box = el('div', { class: 'tool' });
    const done = (ok) => { pending.delete(o.key); box.querySelectorAll('button').forEach(x => x.disabled = true); feedback(o.rule, ok); renderList(); };
    for (const a of o.actions || []) box.append(el('button', { type: 'button', class: a.main ? 'yes' : '', onclick: async () => { done(true); try { await a.run(); } catch (e) { note(e.message); } } }, a.label));
    box.append(el('button', { type: 'button', onclick: () => { done(false); const s2 = S(); delete s2.seen[o.key]; s2.later = { ...(s2.later || {}), [o.key]: Date.now() + 3 * 3600000 }; saveS(s2); } }, '⏰ Sonra'),
      el('button', { type: 'button', title: 'Bu tür öneriyi kapat', onclick: () => { done(false); const s2 = S(); s2.mute[o.rule] = true; saveS(s2); note('Tamam, bu tür öneriyi bir daha yapmayacağım (MERKEZ → Öneriler’den açabilirsin).'); } }, '🔕 Bir daha önerme'));
    b.el.append(box);
    pending.set(o.key, o); renderList();
    if (o.speak && opt('speakOn') === '1') { try { (typeof voiceSession !== 'undefined' && voiceSession.read?.(o.speak)); } catch {} }
    if (o.push && opt('ntfyOn') === '1') window.jarvisPushPhone?.(o.text.slice(0, 200), { title: 'SATÜRN önerisi' })?.catch?.(() => {});
    return true;
  }

  /* ---------- KURALLAR ---------- */
  const avgSessionFee = () => { const g = store.get('ledger', []).filter(x => x.type === 'gelir' && /seans|tedavi|fizik|paket/i.test(x.desc || '') && x.amt > 0 && x.amt < 20000).map(x => x.amt); return g.length >= 3 ? g.sort((a, b) => a - b)[Math.floor(g.length / 2)] : 0; };
  const RULES = [
    // 1) bugün seans yapılmış ama kasaya gelir girilmemiş
    { id: 'kasa_eksik', when: () => hour() >= 17, check() {
      const d = todayK(), inDay = t => isoLocal(new Date(t)).slice(0, 10) === d, ses = P().filter(p => (p.seanslar || []).some(s => inDay(s.t)));
      const led = store.get('ledger', []).filter(x => x.d === d && x.type === 'gelir'); if (!ses.length || led.length >= ses.length) return [];
      const fee = avgSessionFee(), miss = ses.length - led.length;
      return [{ key: 'kasa' + d, icon: '🧾', text: `Bugün ${ses.length} seans yapılmış ama kasada ${led.length} gelir kaydı var. ${miss} seansın ödemesi girilmemiş olabilir${fee ? ` (seans başı ortalaman ${tl(fee)})` : ''}.`,
        actions: [...(fee ? [{ label: `＋ ${miss}×${tl(fee)} kasaya ekle`, main: true, run: () => run('kasa', ['gelir', String(fee * miss).replace('.', ','), `${miss} seans (öneriyle)`]) }] : []), { label: 'Kasayı aç', run: () => go('kasa özeti') }] }];
    } },
    // 2) seans yapılmış, ev programı yok
    { id: 'program_yok', check() {
      return P().filter(p => (p.seanslar || []).length >= 2 && !p.program && Date.now() - p.seanslar.at(-1).t < 3 * DAY).slice(0, 2).map(p => ({ key: 'prog' + p.id, icon: '🏋', text: `${nm(p)} ${p.seanslar.length} seanstır geliyor ama kayıtlı ev egzersiz programı yok${p.tani ? ` (${p.tani})` : ''}. Ev programı iyileşmeyi hızlandırır.`,
        actions: [{ label: '⚡ Hızlı program oluştur', main: true, run: () => { const reg = (String(p.tani || '').match(/bel|boyun|omuz|diz|kalça|kalca|ayak|duruş/i) || ['bel'])[0]; const t = window.jarvisYeni?.program(reg, 'başlangıç', nm(p)); if (t) { p.program = t.split('\n').filter(l => /^\d+\./.test(l)).join('\n'); if (typeof savePatients === 'function') savePatients(); bubble('ai', t + '\n\n✓ ' + nm(p) + ' dosyasına kaydedildi.'); } } }, { label: 'Yapay zekâyla kişisel', run: () => go(`${p.ad} için ev egzersiz programı hazırla ve kaydet (tanı: ${p.tani || 'bilinmiyor'})`) }] }));
    } },
    // 3) tedavisi yarım kalan / gelmeyen hasta
    { id: 'kayip_hasta', when: () => hour() >= 10 && hour() < 19, check() {
      const now0 = Date.now();
      return P().filter(p => { const s = p.seanslar || []; if (!s.length) return false; const gap = now0 - s.at(-1).t; const left = p.paket ? p.paket - s.filter(x => x.t >= (p.paketBas || 0)).length : null; return gap > 12 * DAY && gap < 60 * DAY && (left > 0 || s.length < 6); })
        .slice(0, 2).map(p => ({ key: 'kayip' + p.id + todayK().slice(0, 7), icon: '📞', text: `${nm(p)} ${Math.round((now0 - p.seanslar.at(-1).t) / DAY)} gündür gelmiyor${p.paket ? ' (paketi bitmedi)' : ''}. Tedavi yarım kalmasın — kısa bir mesaj geri kazandırır.`,
          actions: p.tel ? [{ label: '💬 Hazır mesajla yaz', main: true, run: () => window.open(wa(p.tel, `Merhaba ${first(p.ad)}, FİZYOVİTA'dan Beyhan. Bir süredir göremedik, nasılsınız? Tedavinizi yarım bırakmamak için uygun bir gün ayarlayalım mı?`), '_blank', 'noopener') }, { label: '📞 Ara', run: () => window.open('tel:' + p.tel) }] : [{ label: 'Dosyayı aç', run: () => go(p.ad + ' hasta dosyası') }] }));
    } },
    // 4) paket bitmek üzere
    { id: 'paket_bitiyor', check() {
      return P().filter(p => p.paket && (p.paket - (p.seanslar || []).filter(x => x.t >= (p.paketBas || 0)).length) === 1).slice(0, 2).map(p => ({ key: 'paket' + p.id + (p.paketBas || 0), icon: '📦', text: `${nm(p)} paketinin SON seansında. Gidişata göre yeni paket ya da kontrol planı konuşma zamanı.`,
        actions: [{ label: '📈 İlerlemesine bak', main: true, run: () => run('ilerleme', [p.ad]) }, { label: '📄 Epikriz hazırla', run: () => run('epikriz', [p.ad]) }] }));
    } },
    // 5) iyileşen hasta → Google yorumu
    { id: 'yorum', when: () => hour() >= 11 && hour() < 20, check() {
      return P().filter(p => { const v = (p.seanslar || []).filter(s => s.vas != null); return v.length >= 4 && v[0].vas - v.at(-1).vas >= 3 && Date.now() - v.at(-1).t < 5 * DAY && !p.yorumIstendi; }).slice(0, 1).map(p => ({ key: 'yorum' + p.id, icon: '⭐', text: `${nm(p)} çok iyi gidiyor (ağrı ${(p.seanslar.filter(s => s.vas != null))[0].vas} → ${p.seanslar.filter(s => s.vas != null).at(-1).vas}). Memnun hastadan Google yorumu istemek için en doğru an.`,
        actions: [{ label: '⭐ Yorum isteği hazırla', main: true, run: async () => { p.yorumIstendi = Date.now(); if (typeof savePatients === 'function') savePatients(); await run('yorum_iste', [p.ad]); } }] }));
    } },
    // 6) geciken alacak
    { id: 'alacak', when: () => hour() >= 10 && hour() < 19, check() {
      const R = store.get('receivables', []).map(r => ({ ...r, kalan: r.tutar - (r.odenen || []).reduce((a, x) => a + x.amt, 0) })).filter(r => r.kalan > 0 && Date.now() - r.t > 10 * DAY);
      if (!R.length) return []; const tot = R.reduce((a, r) => a + r.kalan, 0);
      return [{ key: 'alacak' + todayK().slice(0, 8) + Math.floor(new Date().getDate() / 7), icon: '💰', text: `${R.length} kişiden 10 günü geçmiş toplam ${tl(tot)} alacağın var (en büyük: ${R.sort((a, b) => b.kalan - a.kalan)[0].ad} ${tl(R[0].kalan)}).`,
        actions: [{ label: '📋 Listeyi ve mesajları hazırla', main: true, run: () => run('alacak', ['liste']) }] }];
    } },
    // 7) yarının randevuları — akşam hatırlatma
    { id: 'yarin_hatirlat', when: () => hour() >= 17 && hour() < 21, check() {
      const t = isoLocal(new Date(Date.now() + DAY)).slice(0, 10), list = IT().filter(i => i.kind === 'task' && !i.done && (i.due || '').startsWith(t));
      if (!list.length) return [];
      return [{ key: 'yarin' + t, icon: '📅', text: `Yarın ${list.length} randevu/görev var: ${list.slice(0, 4).map(i => (i.due || '').slice(11, 16) + ' ' + short(i.text, 30)).join(' · ')}. Hastalara hatırlatma mesajı gitsin mi?`,
        actions: [{ label: '💬 Hatırlatmaları hazırla', main: true, run: () => run('hasta_hatirlat', ['yarın']) }] }];
    } },
    // 8) geciken görevler
    { id: 'geciken', when: () => hour() >= 9 && hour() < 18, check() {
      const late = IT().filter(i => i.kind === 'task' && !i.done && i.due && i.due.slice(0, 10) < todayK());
      if (late.length < 2) return [];
      return [{ key: 'gec' + todayK(), icon: '⏳', text: `${late.length} görev gecikmiş (en eskisi: “${short(late.sort((a, b) => a.due.localeCompare(b.due))[0].text, 50)}”). Bugüne mi alayım, yoksa önceliğe göre yeniden planlayayım mı?`,
        actions: [{ label: '📌 Hepsini bugüne al', main: true, run: () => { for (const i of late) saveItem({ ...i, due: todayK() + (i.due.slice(10) || 'T17:00') }); note(late.length + ' görev bugüne alındı.'); } }, { label: '🗓 Günü planla', run: () => run('gunu_planla', ['']) }] }];
    } },
    // 9) odak önerisi
    { id: 'odak', when: () => hour() >= 9 && hour() < 12, check() {
      const open = IT().filter(i => i.kind === 'task' && !i.done && (!i.due || i.due.slice(0, 10) <= todayK())).length, f = (store.get('focusLog', {}) || {})[todayK()] || 0;
      return open >= 4 && !f ? [{ key: 'odak' + todayK(), icon: '🎯', text: `${open} açık işin var ve bugün henüz odak oturumu yok. 25 dakikalık kesintisiz bir blok en zor olanı bitirir.`, actions: [{ label: '▶ 25 dk odak başlat', main: true, run: () => run('odak', ['başlat', '25', '1', 'öneri']) }] }] : [];
    } },
    // 10) alışkanlık serisi bozulmasın
    { id: 'aliskanlik', when: () => hour() >= 19 && hour() < 22, check() {
      const d = todayK(), H = store.get('habits', []).filter(h => !h.days?.[d] && Object.keys(h.days || {}).length >= 2);
      return H.slice(0, 1).map(h => ({ key: 'al' + h.name + d, icon: '🔥', text: `“${h.name}” bugün henüz yapılmadı — serini bozma.`, actions: [{ label: '✓ Yaptım', main: true, run: () => run('aliskanlik', ['yap', h.name]) }] }));
    } },
    // 11) hedef geride
    { id: 'hedef', when: () => new Date().getDay() === 0 || new Date().getDay() === 3, check() {
      return store.get('goals', []).filter(g => { const t0 = Date.parse(g.bas), t1 = Date.parse(g.son), f = (Date.now() - t0) / Math.max(1, t1 - t0); return f > 0.15 && f < 1 && g.ilerleme / g.hedef < f - 0.15; }).slice(0, 1).map(g => ({ key: 'hd' + g.id + todayK(), icon: '🎯', text: `“${g.ad}” hedefinde planın gerisindesin: %${Math.round(g.ilerleme / g.hedef * 100)} tamam, zamanın %${Math.round((Date.now() - Date.parse(g.bas)) / (Date.parse(g.son) - Date.parse(g.bas)) * 100)}'i geçti.`, actions: [{ label: '📊 Hedeflerim', main: true, run: () => run('hedef', ['liste']) }] }));
    } },
    // 12) piyasada sert hareket (izleme listesindeki bekçiyle çakışmasın diye yalnız 3 ana gösterge)
    { id: 'piyasa', check: async () => {
      const last = store.get('proMkt', null), out = [];
      try {
        const [b, u] = await Promise.all([fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT', { cache: 'no-store' }).then(r => r.json()), fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=USDTTRY', { cache: 'no-store' }).then(r => r.json())]);
        const bc = +b.priceChangePercent, uc = +u.priceChangePercent; store.set('proMkt', { t: Date.now(), bc, uc });
        if (Math.abs(bc) >= 6) out.push({ key: 'btc' + todayK() + Math.sign(bc), icon: bc > 0 ? '🚀' : '📉', text: `Bitcoin son 24 saatte ${bc > 0 ? '+' : ''}${bc.toFixed(1)}% (${Math.round(+b.lastPrice).toLocaleString('tr-TR')} $). Sert hareket.`, actions: [{ label: '🔮 KAHİN ne diyor?', main: true, run: () => go('BTC tahmin ver') }] });
        if (Math.abs(uc) >= 1.2) out.push({ key: 'usd' + todayK() + Math.sign(uc), icon: '💵', text: `Dolar/TL 24 saatte ${uc > 0 ? '+' : ''}${uc.toFixed(2)}% (${(+u.lastPrice).toFixed(2)} TL) — olağan dışı.`, actions: [{ label: '🏛 Kapalıçarşı', main: true, run: () => go('kapalıçarşı') }] });
      } catch {} void last; return out;
    } },
    // 13) bilgisayar diski dolu (yalnız yerel yardımcı varsa)
    { id: 'pc_disk', when: () => new Date().getDay() === 1, check: async () => {
      if (typeof pcLocal === 'undefined' || !pcLocal) return [];
      try { const t = (await pcLocalCall('sistem', [], false)).text || ''; const m = t.match(/(\d{2,3})\s*%[^\n]*disk|disk[^\n]*?(\d{2,3})\s*%/i); const pct = m ? +(m[1] || m[2]) : 0;
        return pct >= 88 ? [{ key: 'disk' + todayK(), icon: '💾', text: `Bilgisayarın diski %${pct} dolu. İndirilenler’de kopya ve eski kurulum dosyaları olabilir.`, actions: [{ label: '🗂 İndirilenleri analiz et', main: true, run: () => run('indirilenler_analiz', []) }] }] : []; } catch { return []; }
    } },
    // 14) sosyal medya sessiz
    { id: 'icerik', when: () => [2, 4].includes(new Date().getDay()) && hour() >= 11 && hour() < 16, check() {
      const lastUse = store.get('proLastContent', 0); if (Date.now() - lastUse < 6 * DAY) return [];
      return [{ key: 'icerik' + todayK(), icon: '📱', text: 'Bu hafta FİZYOVİTA için içerik üretmedik. Kısa bir Reels/gönderi haftalık görünürlüğü korur.', actions: [{ label: '🗓 7 günlük plan', main: true, run: () => { store.set('proLastContent', Date.now()); run('sosyal_takvim', ['']); } }, { label: '🎬 YouTube video paketi', run: () => { store.set('proLastContent', Date.now()); go('youtube stüdyo: bel ağrısında sık yapılan 3 hata'); } }] }];
    } }
  ];

  /* ---------- SABAH / AKŞAM / HAFTA kartları ---------- */
  async function morning(force) {
    const d = todayK(); if (!force && (store.get('proMorning', '') === d || hour() < 6 || hour() >= 12 || LEVEL() === 'kapali')) return;
    store.set('proMorning', d);
    const parts = [], say = [];
    const G = window.jarvisGunluk27, Y = window.jarvisYeni;
    const tasks = IT().filter(i => i.kind === 'task' && !i.done && (i.due || '').startsWith(d)).sort((a, b) => a.due.localeCompare(b.due));
    parts.push(`📅 Bugün: ${tasks.length ? tasks.map(t => (t.due.slice(11, 16) || '') + ' ' + short(t.text, 34)).slice(0, 6).join(' · ') : 'kayıtlı randevu/görev yok'}`); say.push(tasks.length ? `Bugün ${tasks.length} randevu ve görevin var.` : 'Bugün kayıtlı randevun yok.');
    try { const w = await G?.weatherCheck(true); if (w) { parts.push(w.split('\n').slice(0, 3).join(' ')); if (/⚠/.test(w)) say.push('Hava için uyarı var, ayrıntısı ekranda.'); } } catch {}
    try { const M = store.get('meds', []); if (M.length) parts.push('💊 İlaçlar: ' + M.map(m => `${m.ad} ${m.times.join('/')}`).join(' · ')); } catch {}
    try { const t = (G?.taxDates?.() || []).filter(x => x.d - Date.now() < 3 * DAY).slice(0, 2); if (t.length) { parts.push('🧾 Yaklaşan son gün: ' + t.map(x => x.t + ' ' + x.d.toLocaleDateString('tr-TR')).join(' · ')); say.push('Yaklaşan bir vergi son günü var.'); } } catch {}
    try { const T = store.get('terms', []).filter(x => { const l = (Date.parse(x.d + 'T12:00:00') - Date.now()) / DAY; return l >= -1 && l <= 7; }); if (T.length) parts.push('📌 Bitiyor: ' + T.map(x => x.ad + ' ' + x.d).join(' · ')); } catch {}
    try { const R = store.get('receivables', []).map(r => r.tutar - (r.odenen || []).reduce((a, x) => a + x.amt, 0)).filter(v => v > 0); if (R.length) parts.push(`💰 Açık alacak: ${tl(R.reduce((a, b) => a + b, 0))} (${R.length} kişi)`); } catch {}
    try { const b = await Y?.bazaar(); const g = b?.match(/Gram altın: ([\d.,]+ TL)/)?.[1], u = b?.match(/Dolar: ([\d.,]+ TL)/)?.[1]; if (g || u) parts.push(`🏛 Gram altın ${g || '-'} · Dolar ${u || '-'}`); } catch {}
    const late = IT().filter(i => i.kind === 'task' && !i.done && i.due && i.due.slice(0, 10) < d).length; if (late) parts.push(`⏳ ${late} geciken görev`);
    const name = (opt('userName') || 'Beyhan').split(' ')[0];
    const hi = hour() < 10 ? 'Günaydın' : 'İyi günler';
    const b = bubble('ai', `☀ ${hi} ${name}! ${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}\n` + parts.join('\n'));
    b.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: () => run('gunu_planla', ['']) }, '🗓 Günü planla'), el('button', { type: 'button', onclick: () => go('oncelik matrisi') }, '🎯 Öncelikler'), el('button', { type: 'button', onclick: () => go('tahmin ver') }, '🔮 Piyasa')));
    if (opt('speakOn') === '1') { try { (typeof voiceSession !== 'undefined' && voiceSession.read?.(`${hi} ${name}. ${say.join(' ')}`)); } catch {} }
  }
  async function evening() {
    const d = todayK(); if (store.get('proEvening', '') === d || hour() < 19 || hour() >= 22 || LEVEL() === 'kapali') return;
    const any = P().some(p => (p.seanslar || []).some(s => isoLocal(new Date(s.t)).slice(0, 10) === d)) || store.get('ledger', []).some(x => x.d === d) || IT().some(i => i.done && isoLocal(new Date(i.doneAt || 0)).slice(0, 10) === d);
    if (!any) return; store.set('proEvening', d);
    try { const j = window.jarvisYeni?.journal('bugün'); if (j) { const b = bubble('ai', '🌙 Gün kapanışı\n' + j); b.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: () => run('gun_sonu', []) }, '📋 Ayrıntılı gün sonu'), el('button', { type: 'button', onclick: () => go('yarın için günü planla') }, '🗓 Yarını planla'))); } } catch {}
  }
  async function weekOpen() {
    const d = todayK(); if (new Date().getDay() !== 1 || store.get('proWeek', '') === d || hour() < 8 || hour() >= 13 || LEVEL() === 'kapali') return;
    store.set('proWeek', d);
    try { const a = window.jarvisKlinik27?.bizAnalysis(); const b = bubble('ai', '📆 Haftaya başlarken\n' + (a || '') ); b.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: () => go('kahin taraması') }, '🔮 Haftalık piyasa'), el('button', { type: 'button', onclick: () => run('haftalik_ozet', []) }, '📊 Geçen hafta'))); } catch {}
  }

  /* ---------- motor ---------- */
  let busy = false;
  async function tick(force) {
    if (busy || LEVEL() === 'kapali' || window.jarvisUltra?.guest?.()) return 0; busy = true; let n = 0;
    try {
      await morning(); await evening(); await weekOpen();
      const s = S(); const later = s.later || {}; for (const k of Object.keys(later)) if (later[k] < Date.now()) delete later[k];
      const rules = RULES.filter(r => !s.mute[r.id] && (!r.when || force || r.when())).sort((a, b) => weight(b.id) - weight(a.id));
      for (const r of rules) {
        let list = []; try { list = await r.check(); } catch {}
        for (const o of list || []) { if (later[o.key]) continue; if (card({ ...o, rule: r.id, force })) n++; if (S().shown >= CAP[LEVEL()] && !force) break; }
        if (!force && n >= 2) break; // kendiliğinden gelen öneriler bir seferde en çok 2 kart: boğmasın, gün içine yayılsın
      }
    } finally { busy = false; }
    return n;
  }
  setTimeout(() => tick().catch(() => {}), 12000);
  setInterval(() => { if (!document.hidden) tick().catch(() => {}); }, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => tick().catch(() => {}), 2500); });

  /* ---------- MERKEZ: öneriler listesi + ayarlar ---------- */
  const list = el('ul', { class: 'list', id: 'proList' });
  const lv = el('select', { id: 'proLevel', 'aria-label': 'Proaktiflik' }, new Option('Kapalı', 'kapali'), new Option('Az (günde 3)', 'az'), new Option('Normal (günde 6)', 'normal'), new Option('Çok (günde 12)', 'cok'));
  lv.value = LEVEL(); lv.onchange = () => { store.set('set.proLevel', lv.value); note('Proaktiflik: ' + lv.selectedOptions[0].text); };
  function renderList() {
    const s = S(), items0 = [...pending.values()];
    list.replaceChildren(...(items0.length ? items0.map(o => el('li', { class: 'item' }, el('span', {}, o.icon || '💡'), el('div', {}, el('small', {}, short(o.text, 140))))) : [el('li', { class: 'muted' }, 'Bekleyen öneri yok.')]));
    const muted = Object.keys(s.mute || {}); if (muted.length) list.append(el('li', { class: 'muted' }, 'Kapatılan türler: ' + muted.join(', ') + ' ', el('button', { type: 'button', class: 'btn ghost', onclick: () => { const s2 = S(); s2.mute = {}; saveS(s2); renderList(); note('Tüm öneri türleri yeniden açık.'); } }, 'Hepsini aç')));
  }
  function mount() {
    const hub = $id('p-hub'); if (!hub || $id('proBox')) return;
    hub.insertBefore(el('div', { id: 'proBox' }, el('h3', {}, '💡 SATÜRN ÖNERİLERİ (proaktif)'), el('p', { class: 'muted' }, 'Satürn verilerini 10 dakikada bir tarar, fark ettiği fırsat ve eksikleri tek dokunuşluk kartlarla önerir; neyi kabul ettiğini öğrenir.'),
      el('div', { class: 'row' }, lv, el('button', { type: 'button', class: 'btn', onclick: async () => { $id('drawer')?.classList.remove('open'); const n = await tick(true); if (!n) note('Şu an yeni öneri yok — her şey yolunda görünüyor.'); } }, '🔎 Şimdi tara'), el('button', { type: 'button', class: 'btn ghost', onclick: () => { $id('drawer')?.classList.remove('open'); morning(true); } }, '☀ Sabah kartı')), list), hub.children[2] || null);
    renderList();
  }
  mount(); setTimeout(mount, 1500);

  /* ---------- araçlar + komutlar ---------- */
  Object.assign(TOOLS, {
    oneriler: { d: 'oneriler — Satürn’ün şu an fark ettiği fırsat/eksikleri tarar ve tek dokunuşluk öneri kartları çıkarır (kasa eksiği, ev programı, gelmeyen hasta, paket, yorum, alacak, gecikmiş iş, piyasa…)', run: async () => { const n = await tick(true); return n ? `${n} öneri kartı gösterildi.` : 'Şu an yeni öneri yok — her şey yolunda.'; } },
    proaktif: { d: 'proaktif|kapali/az/normal/cok — Satürn’ün kendiliğinden öneri yapma sıklığı', run: ([l]) => { const k = fold(l || ''); const v = /kapa/.test(k) ? 'kapali' : /az/.test(k) ? 'az' : /cok|fazla/.test(k) ? 'cok' : 'normal'; store.set('set.proLevel', v); lv.value = v; return 'Proaktiflik: ' + v; } },
    sabah_karti: { d: 'sabah_karti — günaydın kartı: bugünkü randevular, hava/toz, ilaçlar, son günler, alacaklar, altın/döviz', run: async () => { await morning(true); return 'Sabah kartı gösterildi.'; } }
  });
  TOOL_GROUPS.push([/öneri|oneri|ne yapmalıyım|ne yapmaliyim|proaktif|sabah kartı|günaydın|gunaydin|neyi kaçırıyorum|eksik ne/i, /^(oneriler|proaktif|sabah_karti)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nPROAKTİF: “ne yapmalıyım / neyi kaçırıyorum / öneri” → oneriler; “günaydın/sabah özeti” → sabah_karti; Satürn’ün kendiliğinden konuşma sıklığı → proaktif.';
  /* ---------- SÖZ YAKALAYICI: sohbette verdiğin sözü/planı fark edip görev önerir ---------- */
  const DAYS = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
  function commitment(t0) {
    const t = String(t0 || '').trim(), f = fold(t);
    if (t.length < 12 || t.length > 220 || /^(hatirlat|gorev|not al|kaydet|alarm|zamanlayici)/.test(f) || LEVEL() === 'kapali') return;
    if (!/(ecegim|acagim|ecegiz|acagiz|meliyim|malıyım|maliyim|lazim|gerek|unutmayayim|unutmamam)/.test(f) || !/(yarin|bugun|aksam|sabah|haftaya|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar|saat \d|\d{1,2}[:.]\d{2})/.test(f)) return;
    let d = new Date(now()); if (/yarin/.test(f)) d = new Date(d.getTime() + DAY); else if (/haftaya/.test(f)) d = new Date(d.getTime() + 7 * DAY); else { const i = DAYS.findIndex(x => new RegExp('\\b' + x + '\\b').test(f)); if (i >= 0) { let k = (i - d.getDay() + 7) % 7 || 7; d = new Date(d.getTime() + k * DAY); } }
    const tm = f.match(/(\d{1,2})[:.](\d{2})/) || f.match(/saat (\d{1,2})/); const H = tm ? String(+tm[1]).padStart(2, '0') + ':' + (tm[2] || '00') : /aksam/.test(f) ? '19:00' : /sabah/.test(f) ? '09:00' : '10:00';
    const due = isoLocal(d).slice(0, 10) + 'T' + H;
    setTimeout(() => card({ rule: 'soz', key: 'soz' + hash32(t), icon: '📝', force: true, text: `“${short(t, 90)}” — bunu ${new Date(due).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} için görev/hatırlatma olarak ekleyeyim mi?`,
      actions: [{ label: '＋ Görev ekle', main: true, run: () => { saveItem({ kind: 'task', text: t.replace(/\s+/g, ' ').slice(0, 200), due }); note('Görev eklendi: ' + due.replace('T', ' ')); } }] }), 1500);
  }
  const hash32 = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

  const _lc = localCommand;
  localCommand = t0 => {
    const f = fold(String(t0 || '')).replace(/[?!.]+$/, '').trim();
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    try { commitment(t0); } catch {}
    if (/^(oneriler|oneri|ne yapmaliyim|neyi kaciriyorum|bugun ne yapmaliyim|eksik ne var)$/.test(f)) { setTimeout(async () => { const n = await tick(true); if (!n) note('Şu an yeni öneri yok — her şey yolunda görünüyor.'); }, 10); return '🔎 Verilerini tarıyorum…'; }
    if (/^(gunaydin|sabah karti|sabah ozeti|gunun ozeti)$/.test(f)) { setTimeout(() => morning(true), 10); return '☀ Sabah kartı hazırlanıyor…'; }
    if (/^proaktif(?:ligi)?\s+(kapat|az|normal|cok)/.test(f)) return TOOLS.proaktif.run([f.split(/\s+/).pop()]);
    return _lc(t0);
  };
  window.jarvisProaktif = { tick, morning, evening, weekOpen, RULES, card, S };
})();
