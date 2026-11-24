'use strict';
/* SATÜRN 18 — KLİNİK II (mevcut düzen korunarak eklenen 13 özellik)
 *  1 Seans notu dikte  2 İlerleme grafiği + gelişmeyen hasta uyarısı  3 Akşam randevu hatırlatma önerisi
 *  4 Resimli ev egzersiz kartı (paylaşılabilir)  5 Memnuniyet anketi  6 Aylık işletme raporu  7 Stok uyarısı
 *  8 Sosyal medya takvimi  9 Sabah brifingi (yerel, kotasız)  10 Belge okuma → hasta dosyası  11 Canlı sesli tercüman
 *  12 Yedek bekçisi (kasa/stok dahil)  13 Kilit önerisi
 * Gizlilik: yapay zekâya hasta adı gitmez (baş harf / “HASTA”); ad yalnız telefonda eklenir. */
(() => {
  const DAY = 86400000, OFF = 3 * 3600000;
  const ask = (s, u, tier = 'default', search = false, image) => window.jarvisResearch.ask(s, u, tier, search, image);
  const dayStr = (t = Date.now()) => new Date(t + OFF).toISOString().slice(0, 10);
  const hourNow = () => new Date(Date.now() + OFF).getUTCHours();
  const tl = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' TL';
  const pct = (a, b) => (b ? ((a - b) / Math.abs(b) * 100).toFixed(0) + '%' : '—');
  const num = v => { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  const jsonOf = t => { try { return JSON.parse((String(t).match(/[[{][\s\S]*[\]}]/) || ['null'])[0]); } catch { return null; } };
  const hitap = p => { const first = p.ad.split(/\s+/)[0]; return p.cinsiyet === 'k' ? first + ' Hanım' : p.cinsiyet === 'e' ? first + ' Bey' : first; };
  const waNum = tel => { let d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '9' + d; else if (d.length === 10 && d.startsWith('5')) d = '90' + d; return d; };
  const wa = (tel, text) => { const n = waNum(tel); return `https://wa.me/${n}?text=${encodeURIComponent(text)}`; };
  const clinic = () => opt('clinicName') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
  const scrub = (text, p) => { let t = String(text || ''); if (p) for (const w of p.ad.split(/\s+/).filter(x => x.length > 1)) t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'HASTA'); return t; };
  const needP = q => { const p = findPatient(String(q || '')); if (!p) throw Error('Hasta bulunamadı: ' + q); return p; };
  const once = (key, fn) => { const k = 'k2.' + key, d = dayStr(); if (store.get(k, '') === d) return false; store.set(k, d); fn(); return true; };
  const push = (msg, title) => { if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(msg, { title: title || 'SATÜRN', tags: 'hospital' }).catch(() => {}); };
  const guest = () => !!window.jarvisUltra?.guest?.();
  const chatting = () => !!document.querySelector('#feed .msg.me') && Date.now() - (window.__lastUserMsg || 0) < 10 * 60000; // konuşma sürerken araya girme

  /* ===== 1) SEANS NOTU DİKTE ===== */
  async function sessionNote(q, dictation) {
    const p = q ? needP(q) : patients.find(x => fold(dictation).includes(fold(x.ad.split(/\s+/)[0])) && fold(dictation).includes(fold(x.ad.split(/\s+/).at(-1))));
    if (!p) throw Error('Hangi hasta? Ör: “Ayşe Yılmaz seans notu: …”');
    const txt = scrub(dictation, p).trim(); if (txt.length < 8) throw Error('Not çok kısa.');
    setPhase('thinking', 'Seans notunu düzenliyorum…');
    const raw = await ask(`Fizyoterapi seans notu düzenleyicisisin. Fizyoterapistin hızlı dikte ettiği metni yapılandır. Uydurma yok; söylenmeyeni boş bırak. YALNIZ JSON:
{"vas":0-10 sayı ya da null,"rom":"eklem hareket açıklığı (ör. diz fleksiyon 110°)","mmt":"kas gücü","olcek":"ölçek adı ve puanı (ör. Oswestry 32)","uygulama":"yapılan tedaviler/modaliteler/manuel terapi","egzersiz":"yapılan egzersizler","uyum":"ev programı uyumu: iyi/orta/kötü ya da boş","S":"hastanın ifadesi","O":"bulgular","A":"değerlendirme","P":"plan/sonraki seans"}`, txt, 'quick');
    const j = jsonOf(raw); if (!j) throw Error('Not anlaşılamadı, tekrar dener misin?');
    const soap = ['S', 'O', 'A', 'P'].filter(k => j[k]).map(k => `${k}: ${j[k]}`).join('\n');
    const s = { t: Date.now(), vas: Number.isFinite(+j.vas) && j.vas !== null && j.vas !== '' ? Math.max(0, Math.min(10, +j.vas)) : null, rom: j.rom || '', mmt: j.mmt || '', egz: [j.uygulama, j.egzersiz].filter(Boolean).join(' · '), olcek: j.olcek || '', uyum: j.uyum || '', not: soap || txt, dikte: true };
    (p.seanslar ||= []).push(s); savePatients();
    logOp('seans notu', [aiName(p)], 'başarılı', 'dikte');
    setPhase('idle', 'Hazır.');
    return { p, s, text: `📝 ${p.ad} · seans ${p.seanslar.length} kaydedildi\n${s.vas != null ? 'Ağrı (VAS): ' + s.vas + '/10\n' : ''}${s.rom ? 'EHA: ' + s.rom + '\n' : ''}${s.olcek ? 'Ölçek: ' + s.olcek + '\n' : ''}${s.egz ? 'Uygulama: ' + s.egz + '\n' : ''}${soap}` };
  }

  /* ===== 2) İLERLEME + GELİŞMEYEN HASTA ===== */
  const slope = ys => { const n = ys.length; if (n < 2) return 0; const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n; let a = 0, b = 0; ys.forEach((y, i) => { a += (i - mx) * (y - my); b += (i - mx) ** 2; }); return b ? a / b : 0; };
  function series(p) { const ss = p.seanslar || []; return { vas: ss.map(s => s.vas).filter(v => v !== null && v !== undefined && v !== ''), rom: ss.map(s => num(s.rom)).filter(v => v !== null), olcek: ss.map(s => num(s.olcek)).filter(v => v !== null) }; }
  function progress(q) {
    const p = needP(q), sr = series(p), n = (p.seanslar || []).length;
    if (!n) return `${p.ad}: henüz seans yok.`;
    const L = [`📈 ${p.ad} · ${n} seans`];
    if (sr.vas.length) { const d = sr.vas.at(-1) - sr.vas[0]; L.push(`Ağrı (VAS): ${sr.vas[0]} → ${sr.vas.at(-1)} (${d <= 0 ? '' : '+'}${d}; ${sr.vas[0] ? Math.round(-d / sr.vas[0] * 100) + '% iyileşme' : ''}) · eğilim ${slope(sr.vas.slice(-4)) < -0.2 ? 'düşüyor ✓' : slope(sr.vas.slice(-4)) > 0.2 ? 'ARTIYOR ⚠' : 'yerinde sayıyor'}`); }
    if (sr.rom.length > 1) L.push(`Eklem hareket açıklığı: ${sr.rom[0]} → ${sr.rom.at(-1)}`);
    if (sr.olcek.length > 1) L.push(`Ölçek puanı: ${sr.olcek[0]} → ${sr.olcek.at(-1)}`);
    if (sr.vas.length > 1) window.jarvisStage?.chart(`${p.ad} · ağrı seyri (VAS)`, sr.vas.map((v, i) => ['S' + (i + 1), v]), 'cizgi');
    return L.join('\n');
  }
  function stalled() {
    return patients.filter(p => (p.seanslar || []).length >= 4 && Date.now() - (p.seanslar.at(-1)?.t || 0) < 30 * DAY).map(p => {
      const v = series(p).vas.slice(-4), o = series(p).olcek.slice(-3);
      const why = [];
      if (v.length >= 3 && slope(v) >= -0.1 && v.at(-1) >= 4) why.push(`ağrı ${v.join('→')} (düşmüyor)`);
      if (o.length >= 2 && o.at(-1) >= o[0] && o[0] > 0) why.push(`ölçek ${o.join('→')} (iyileşme yok)`);
      return why.length ? { p, why } : null;
    }).filter(Boolean);
  }
  const stalledText = () => { const s = stalled(); return s.length ? '⚠ Gelişme göstermeyen hastalar:\n' + s.map(x => `• ${x.p.ad}: ${x.why.join('; ')}`).join('\n') + '\nÖneri: değerlendirmeyi yenile, programı değiştir ya da hekime yönlendir.' : 'Gelişme göstermeyen hasta yok ✓'; };

  /* ===== 3) AKŞAM RANDEVU HATIRLATMA ÖNERİSİ ===== */
  function eveningRemind() {
    if (hourNow() < 17 || guest()) return;
    const tom = dayStr(Date.now() + DAY);
    const list = items.filter(i => i.kind === 'task' && !i.done && i.due?.slice(0, 10) === tom && patients.some(p => fold(i.text).includes(fold(p.ad.split(/\s+/)[0]))));
    if (!list.length) return;
    once('remind', () => { const n = bubble('ai', `📲 Yarın ${list.length} hastanın randevusu var. Hatırlatma mesajlarını hazırlayayım mı?`); n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: async () => { const r = await TOOLS.hasta_hatirlat.run(['yarın']); const m = bubble('ai', typeof r === 'string' ? r : r.text); try { addLinks(m.el, pendingLinks.splice(0)); } catch {} } }, 'Mesajları hazırla'))); });
  }

  /* ===== 4) RESİMLİ EV EGZERSİZ KARTI ===== */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function svgPng(svg) {
    const vb = (svg.match(/viewBox="0 0 (\d+) (\d+)"/) || [0, 1080, 1350]);
    const im = new Image(); await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const c = document.createElement('canvas'); c.width = +vb[1]; c.height = +vb[2]; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  }
  async function exerciseCard(q) {
    const p = needP(q); if (!p.program) throw Error(`${p.ad} için kayıtlı ev programı yok (önce “program kaydet”).`);
    if (!window.jarvisStage?.design) throw Error('Tasarım modülü yok');
    const d = await window.jarvisStage.design(`Hasta için EV EGZERSİZ KARTI. Üstte büyük başlık: “Ev Egzersiz Programım”, altında hasta adı yerine tam olarak {{HASTA}} yaz. Her egzersiz için numaralı kart: sade vektör çizgi-insan ikonu, egzersiz adı, set×tekrar/süre, 1 satır nasıl yapılır. Altta: “Ağrı 2 puandan fazla artarsa durun ve bize haber verin.” ve ${clinic()}. Program:\n${scrub(p.program, p).slice(0, 2500)}`, { format: 'kart' });
    d.svg = d.svg.split('{{HASTA}}').join(esc(hitap(p))); d.request = 'Egzersiz kartı · ' + p.ad; window.jarvisStage.designs()[0] && (window.jarvisStage.designs()[0].svg = d.svg);
    window.jarvisStage.showDesign(d);
    const n = bubble('ai', `🏋 ${p.ad} için egzersiz kartı hazır.`);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: async () => {
      try { const b = await svgPng(d.svg); const f = new File([b], 'egzersiz-karti.png', { type: 'image/png' }); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: `${hitap(p)}, ev egzersiz programınız.` }); else { const a = el('a', { href: URL.createObjectURL(b), download: 'egzersiz-karti.png' }); document.body.append(a); a.click(); a.remove(); note('Kart indirildi; WhatsApp’tan hastaya gönderebilirsin.'); } } catch { note('Paylaşılamadı; PNG’yi indirip gönder.'); }
    } }, '📤 Hastaya gönder (WhatsApp)')));
    logOp('egzersiz kartı', [aiName(p)], 'başarılı');
    return '';
  }

  /* ===== 5) MEMNUNİYET ANKETİ ===== */
  function surveySend(q) {
    const p = needP(q);
    const msg = `Merhaba ${hitap(p)}, ${clinic()} olarak tedavinizin nasıl geçtiğini merak ediyoruz. 3 kısa soru (sadece rakamla yanıtlamanız yeterli):\n1) Tedaviden memnuniyetiniz (1-5)?\n2) Ağrınızdaki iyileşme (1-5)?\n3) Bizi bir yakınınıza tavsiye eder misiniz (0-10)?\nVarsa yorumunuzu da yazabilirsiniz. Teşekkür ederiz 🙏`;
    p.anketGonderildi = Date.now(); savePatients();
    return { text: `${p.ad} için anket mesajı hazır. Cevap gelince: “anket ${p.ad.split(' ')[0]} 5 4 9 çok memnunum” de.`, links: [{ url: wa(p.tel, msg), title: `💬 ${p.ad} — anketi WhatsApp’tan gönder` }] };
  }
  function surveySave(q, a, b, c, yorum = '') {
    const p = needP(q); const v = [a, b, c].map(num);
    if (v.some(x => x === null)) throw Error('Üç puan gerekli: memnuniyet (1-5), iyileşme (1-5), tavsiye (0-10)');
    p.anket = { t: Date.now(), memnun: v[0], iyilesme: v[1], tavsiye: v[2], yorum: String(yorum || '').slice(0, 500) }; savePatients();
    return `${p.ad} anketi kaydedildi: memnuniyet ${v[0]}/5, iyileşme ${v[1]}/5, tavsiye ${v[2]}/10.`;
  }
  function surveySummary() {
    const a = patients.filter(p => p.anket).map(p => p.anket);
    const done = patients.filter(p => !p.anket && (p.seanslar || []).length >= 5 && Date.now() - (p.seanslar.at(-1)?.t || 0) > 14 * DAY);
    if (!a.length) return 'Henüz anket sonucu yok.' + (done.length ? `\nAnket gönderilebilecek (tedavisi bitmiş görünen) hastalar: ${done.map(p => p.ad).join(', ')}` : '');
    const avg = k => (a.reduce((s, x) => s + x[k], 0) / a.length).toFixed(1);
    const nps = Math.round((a.filter(x => x.tavsiye >= 9).length - a.filter(x => x.tavsiye <= 6).length) / a.length * 100);
    return `⭐ MEMNUNİYET (${a.length} yanıt)\nMemnuniyet ${avg('memnun')}/5 · İyileşme ${avg('iyilesme')}/5 · Tavsiye ${avg('tavsiye')}/10 · NPS ${nps}\n${a.filter(x => x.yorum).slice(-5).map(x => '“' + x.yorum + '”').join('\n')}${done.length ? `\nAnket gönderilmemiş, tedavisi bitmiş görünen: ${done.map(p => p.ad).join(', ')}` : ''}`;
  }

  /* ===== 6) AYLIK İŞLETME RAPORU ===== */
  function monthReport(m) {
    const cur = /^\d{4}-\d{2}$/.test(m || '') ? m : dayStr().slice(0, 7);
    const [y, mo] = cur.split('-').map(Number), prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
    const led = store.get('ledger', []);
    const sum = mm => { const e = led.filter(x => (x.d || '').startsWith(mm)); const g = e.filter(x => x.type === 'gelir').reduce((s, x) => s + x.amt, 0), c = e.filter(x => x.type === 'gider').reduce((s, x) => s + x.amt, 0); return { g, c, net: g - c }; };
    const inM = (t, mm) => dayStr(t).startsWith(mm);
    const ses = mm => patients.reduce((s, p) => s + (p.seanslar || []).filter(x => inM(x.t, mm)).length, 0);
    const yeni = mm => patients.filter(p => p.created && inM(p.created, mm)).length;
    const aktif = mm => patients.filter(p => (p.seanslar || []).some(x => inM(x.t, mm)));
    const tani = {}; for (const p of aktif(cur)) { const k = fold(p.tani || 'belirtilmemiş').split(/[,.;/]/)[0].trim().split(/\s+/).slice(0, 3).join(' ') || 'belirtilmemiş'; tani[k] = (tani[k] || 0) + 1; }
    const A = sum(cur), B = sum(prev), sa = ses(cur), sb = ses(prev);
    const top = Object.entries(tani).sort((a, b) => b[1] - a[1]).slice(0, 5);
    window.jarvisStage?.chart(`${cur} · bu ay / geçen ay`, [['Gelir', Math.round(A.g)], ['Geçen', Math.round(B.g)], ['Net', Math.round(A.net)], ['Geçen', Math.round(B.net)], ['Seans', sa], ['Geçen', sb]], 'bar');
    return `📊 AYLIK RAPOR · ${cur} (geçen ayla)\nGelir: ${tl(A.g)} (${pct(A.g, B.g)})\nGider: ${tl(A.c)} (${pct(A.c, B.c)})\nNet: ${tl(A.net)} (${pct(A.net, B.net)})\nSeans: ${sa} (${pct(sa, sb)}) · seans başı gelir: ${sa ? tl(A.g / sa) : '—'}\nYeni hasta: ${yeni(cur)} (geçen ay ${yeni(prev)}) · tedavi gören: ${aktif(cur).length}\nEn sık tanılar: ${top.length ? top.map(([k, n]) => `${k} (${n})`).join(', ') : '—'}`;
  }

  /* ===== 7) STOK UYARISI ===== */
  function stockCheck(force = false) {
    const low = store.get('stock', []).filter(s => s.min && s.q <= s.min);
    if (!low.length) return force ? 'Stoklar yeterli ✓' : '';
    const t = '📦 Azalan malzemeler: ' + low.map(s => `${s.n} (${s.q}/${s.min})`).join(', ');
    if (!force) once('stock', () => { note(t); push(t, 'SATÜRN stok uyarısı'); });
    return t;
  }

  /* ===== 8) SOSYAL MEDYA TAKVİMİ ===== */
  let plan = store.get('socialPlan', []);
  async function socialPlan(theme = '') {
    setPhase('thinking', 'Haftalık Instagram planını hazırlıyorum…');
    const raw = await ask(`Sen ${clinic()} için çalışan sağlık iletişimi uzmanısın. 7 günlük Instagram içerik planı yap: eğitici, güven veren, abartısız, etik (garanti/kesin tedavi vaadi yok, hasta adı/fotoğrafı yok). Türleri karıştır (egzersiz, bilgi, mit-gerçek, ofis/ekip, soru-cevap, hikâye). YALNIZ JSON dizi:
[{"gun":"Pazartesi","format":"gonderi|hikaye","konu":"…","baslik":"görseldeki kısa başlık","metin":"gönderi açıklaması (3-5 cümle, sonunda harekete geçirici cümle)","etiketler":"#fizyoterapi #cizre …"}]`, theme ? 'Bu haftanın teması: ' + theme : 'Mevsime uygun genel tema seç.', 'default');
    const arr = jsonOf(raw); if (!Array.isArray(arr) || !arr.length) { setPhase('idle', 'Hazır.'); throw Error('Plan oluşturulamadı'); }
    plan = arr.slice(0, 7).map((x, i) => ({ id: uid('sp'), i, gun: String(x.gun || ''), format: /hikaye/.test(fold(x.format || '')) ? 'hikaye' : 'gonderi', konu: String(x.konu || ''), baslik: String(x.baslik || ''), metin: String(x.metin || ''), etiketler: String(x.etiketler || '') }));
    store.set('socialPlan', plan); setPhase('idle', 'Hazır.'); logOp('sosyal takvim', [theme], 'başarılı');
    return plan;
  }
  function showPlan() {
    if (!plan.length) return note('Henüz plan yok: “instagram planı yap”.');
    const n = bubble('ai', '📅 HAFTALIK INSTAGRAM PLANI\n' + plan.map(x => `${x.gun} · ${x.format === 'hikaye' ? 'Hikâye' : 'Gönderi'} · ${x.konu}\n   “${x.baslik}”\n   ${x.metin}\n   ${x.etiketler}`).join('\n\n'));
    n.el.append(el('div', { class: 'tool' }, ...plan.map(x => el('button', { type: 'button', onclick: () => window.jarvisStage?.runDesign(`${x.baslik} — ${x.konu}. Kısa destek metni: ${short(x.metin, 160)}`, { format: x.format }) }, '✦ ' + x.gun)),
      el('button', { type: 'button', onclick: e => { const base = Date.now(); plan.forEach((x, i) => saveItem({ kind: 'task', text: `Instagram: ${x.baslik} (${x.gun})`, due: dayStr(base + (i + 1) * DAY) + 'T19:00' })); e.target.disabled = true; e.target.textContent = '✓ Takvime eklendi'; } }, '🗓 Her gün 19:00 hatırlat')));
    answerTools(n.el, n.el.textContent);
  }

  /* ===== 9) SABAH BRİFİNGİ (yerel, kotasız) ===== */
  async function morning() {
    const L = [], now = new Date();
    L.push(`Günaydın Beyhan. Bugün ${now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' })}.`);
    const wx = ($('wx')?.textContent || '').trim(); if (wx && !/yükleniyor/i.test(wx)) L.push('Hava: ' + wx + '.');
    const today = dayStr(), ap = items.filter(i => i.kind === 'task' && !i.done && i.due?.slice(0, 10) === today).sort((a, b) => a.due.localeCompare(b.due));
    L.push(ap.length ? `Bugün ${ap.length} randevu ve görev var: ${ap.slice(0, 6).map(i => (i.due.includes('T') ? i.due.slice(11, 16) + ' ' : '') + i.text).join('; ')}.` : 'Bugün kayıtlı randevu yok.');
    const late = items.filter(i => typeof isLate === 'function' && isLate(i)).length; if (late) L.push(`${late} gecikmiş görev var.`);
    const st = stalled(); if (st.length) L.push(`${st.length} hastada gelişme görünmüyor: ${st.map(x => x.p.ad).join(', ')}.`);
    const sk = stockCheck(true); if (!/yeterli/.test(sk)) L.push(sk.replace('📦 ', '') + '.');
    try { const f = await window.jarvisMarkets?.fx?.(); const g = await window.jarvisMarkets?.gold?.(); if (f?.USD) L.push(`Dolar ${f.USD.toFixed(2)}, euro ${f.EUR ? f.EUR.toFixed(2) : '—'} lira${g?.gram ? ', gram altın yaklaşık ' + Math.round(g.gram) + ' lira' : ''}.`); } catch {}
    try { const b = await window.jarvisNews?.breaking?.({ translate: false }); const tr = (b || []).filter(x => x.lang === 'tr').slice(0, 3); if (tr.length) L.push('Gündemden: ' + tr.map(x => x.title).join('. ') + '.'); } catch {}
    return L.join(' ');
  }
  async function showMorning(speak = false) {
    const t = await morning(); const n = bubble('ai', '☀ SABAH BRİFİNGİ\n' + t);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { try { voiceSession.read(t); } catch { note('Seslendirilemedi.'); } } }, '🔊 Dinle')));
    if (speak) try { voiceSession.read(t); } catch {}
    return t;
  }
  function morningAuto() { if (guest() || opt('morningAuto') === '0') return; const h = hourNow(); if (h >= 5 && h < 12) once('morning', () => showMorning(false)); }

  /* ===== 10) BELGE OKUMA → HASTA DOSYASI ===== */
  async function readDoc(file, p) {
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    setPhase('thinking', 'Belgeyi okuyorum…');
    const raw = await ask(`Tıbbi belge okuyucususun (rapor, reçete, epikriz, MR/röntgen raporu, tahlil). Fotoğraftaki belgeyi oku. Kişi adı, TC, telefon, adres YAZMA. YALNIZ JSON:
{"tur":"belge türü","tarih":"YYYY-AA-GG ya da boş","kurum":"hastane/hekim branşı","tani":"tanı(lar)","bulgular":"önemli bulgular","oneriler":"hekim önerileri/kısıtlamalar","ilaclar":"ilaçlar ve doz","ozet":"fizyoterapist için 2-3 cümle özet ve dikkat edilecekler","metin":"belgedeki tıbbi metnin temiz dökümü (kişisel bilgiler hariç)"}`, 'Belgeyi oku.', 'complex', false, { mediaType: file.type || 'image/jpeg', data });
    const j = jsonOf(raw); if (!j) throw Error('Belge okunamadı; daha net bir fotoğraf dene.');
    const doc = { t: Date.now(), tur: j.tur || 'belge', tarih: j.tarih || '', kurum: j.kurum || '', tani: j.tani || '', bulgular: j.bulgular || '', oneriler: j.oneriler || '', ilaclar: j.ilaclar || '', ozet: j.ozet || '', metin: String(j.metin || '').slice(0, 4000) };
    if (p) { (p.belgeler ||= []).unshift(doc); p.belgeler = p.belgeler.slice(0, 20); if (doc.tani && !p.tani) p.tani = doc.tani; savePatients(); }
    logOp('belge okuma', [p ? aiName(p) : '-'], 'başarılı', doc.tur);
    setPhase('idle', 'Hazır.');
    return { doc, text: `📄 ${doc.tur}${doc.tarih ? ' · ' + doc.tarih : ''}${doc.kurum ? ' · ' + doc.kurum : ''}${p ? ' → ' + p.ad + ' dosyasına eklendi' : ''}\n${doc.tani ? 'Tanı: ' + doc.tani + '\n' : ''}${doc.bulgular ? 'Bulgular: ' + doc.bulgular + '\n' : ''}${doc.oneriler ? 'Öneriler: ' + doc.oneriler + '\n' : ''}${doc.ilaclar ? 'İlaçlar: ' + doc.ilaclar + '\n' : ''}${doc.ozet ? 'ÖZET: ' + doc.ozet : ''}` };
  }

  /* ===== 11) CANLI SESLİ TERCÜMAN ===== */
  const LANGS = { arapca: 'Arapça', kurtce: 'Kürtçe (Kurmancî)', ingilizce: 'İngilizce', farsca: 'Farsça', rusca: 'Rusça', almanca: 'Almanca', fransizca: 'Fransızca', suryanice: 'Süryanice' };
  let interp = '';
  const _ins = instructions;
  instructions = v => interp ? `SEN ŞU AN SÖZLÜ TERCÜMANSIN (diğer tüm görevler askıda). Fizyoterapist Beyhan ile ${interp} konuşan hasta arasında çeviri yapıyorsun.
- Türkçe duyarsan aynısını ${interp} söyle; ${interp} duyarsan aynısını Türkçe söyle.
- YALNIZ çeviriyi söyle: yorum, açıklama, selam, “çeviriyorum” deme. Anlam ve tıbbi terimleri doğru koru; ağrı yeri/şiddeti/süresi gibi bilgileri kaybetme.
- Anlamadığın kısım olursa o dilde kısaca tekrar etmesini iste.` : _ins(v);
  async function interpreter(lang) {
    const L = LANGS[fold(lang).replace(/\s+/g, '')] || Object.values(LANGS).find(x => fold(x).startsWith(fold(lang).slice(0, 4)));
    if (!L) throw Error('Dil: ' + Object.values(LANGS).join(', '));
    interp = L; logOp('tercüman', [L], 'başarılı');
    const live = window.jarvisLive; if (!live) return `Tercüman modu (${L}) açık: yazdığın her şeyi çeviririm.`;
    if (live.active()) live.stop();
    setTimeout(() => live.start(), 300);
    return `🌐 Canlı tercüman açık: Türkçe ↔ ${L}. Konuşun, ben çeviririm. Kapatmak için: “tercümanı kapat”.`;
  }
  function interpreterOff() { if (!interp) return 'Tercüman zaten kapalı.'; interp = ''; try { window.jarvisLive?.active() && window.jarvisLive.stop(); } catch {} return 'Tercüman kapandı; SATÜRN normal moda döndü.'; }

  /* ===== 12) YEDEK BEKÇİSİ  13) KİLİT ÖNERİSİ ===== */
  async function backupGuard() {
    if (guest()) return;
    const last = store.get('k2.lastCloud', 0);
    if (window.jarvisSync?.enabled?.()) {
      if (Date.now() - last > DAY) { try { await window.jarvisSync.push(); store.set('k2.lastCloud', Date.now()); logOp('bulut yedeği', [], 'başarılı', 'günlük'); } catch (e) { once('bkerr', () => note('Bulut yedeği alınamadı: ' + e.message)); } }
    } else if ((patients.length || store.get('ledger', []).length) && Date.now() - store.get('k2.bkNag', 0) > 7 * DAY && !chatting()) {
      store.set('k2.bkNag', Date.now());
      const n = bubble('ai', '🛡 Verilerin (hastalar, kasa, stok) şu an yalnız bu telefonda. Telefon kaybolur/bozulursa gider. Ücretsiz şifreli bulut yedeğini kur (Ayarlar → BAĞLANTI → Eşitleme: GitHub belirteci + yedek parolası) ya da şimdilik dosya yedeği al.');
      n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => TOOLS.yedek_al?.run([]) }, '⬇ Şimdi dosya yedeği al')));
    }
  }
  function lockHint() {
    if (guest() || !patients.length || (typeof lock !== 'undefined' && lock.on()) || store.get('k2.lockHint', 0) || chatting()) return;
    store.set('k2.lockHint', Date.now());
    const n = bubble('ai', '🔒 Hasta verilerin var ama SATÜRN kilitsiz. Telefon başkasının eline geçerse açılır. Face ID kilidini açayım mı?');
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => lock.enrollBio() }, 'Face ID kilidini kur')));
  }
  const yedekDurum = () => window.jarvisSync?.enabled?.() ? `Bulut yedeği AÇIK (şifreli). Son günlük yedek: ${store.get('k2.lastCloud', 0) ? dateTR(store.get('k2.lastCloud', 0)) : 'henüz yok'}. Kasa ve stok da dahil.` : 'Bulut yedeği KAPALI — veriler yalnız bu telefonda. Ayarlar → BAĞLANTI → Eşitleme ile ücretsiz şifreli yedek kurabilirsin; şimdilik “yedek al” ile dosya yedeği alınabilir.';

  /* ===== araçlar ===== */
  Object.assign(TOOLS, {
    seans_notu: { d: 'seans_notu|hasta adı|dikte metni — serbest dikteyi SOAP seans notuna çevirip hastanın dosyasına kaydeder (VAS, EHA, ölçek, uygulama ayrıştırılır)', run: async ([q, t]) => (await sessionNote(q, t)).text },
    ilerleme: { d: 'ilerleme|hasta adı — ağrı/EHA/ölçek seyri, eğilim ve ana ekranda grafik', run: ([q]) => progress(q) },
    gelismeyen: { d: 'gelismeyen — son seanslarında ağrısı/ölçeği iyileşmeyen hastalar', run: () => stalledText() },
    egzersiz_karti: { d: 'egzersiz_karti|hasta adı — kayıtlı ev programından resimli, paylaşılabilir egzersiz kartı tasarlar', run: async ([q]) => exerciseCard(q) },
    anket_gonder: { d: 'anket_gonder|hasta adı — tedavi sonu memnuniyet anketi WhatsApp mesajı hazırlar', run: ([q]) => surveySend(q) },
    anket_kaydet: { d: 'anket_kaydet|hasta adı|memnuniyet 1-5|iyileşme 1-5|tavsiye 0-10|yorum', run: ([q, a, b, c, y]) => surveySave(q, a, b, c, y) },
    anket_ozet: { d: 'anket_ozet — memnuniyet ortalamaları, NPS, yorumlar', run: () => surveySummary() },
    aylik_rapor: { d: 'aylik_rapor|YYYY-MM (boş: bu ay) — gelir/gider/net, seans, yeni hasta, en sık tanılar, geçen ayla karşılaştırma + grafik', run: ([m]) => monthReport(m) },
    stok_uyari: { d: 'stok_uyari — en az adedin altına düşen malzemeler', run: () => stockCheck(true) },
    sosyal_takvim: { d: 'sosyal_takvim|tema (isteğe bağlı) — 7 günlük Instagram planı (başlık, metin, etiket) + tek dokunuşla tasarım', run: async ([th]) => { await socialPlan(th); setTimeout(showPlan, 30); return 'Plan ekranda.'; } },
    sabah_brifingi: { d: 'sabah_brifingi — tarih, hava, bugünkü randevular, gecikmiş işler, gelişmeyen hastalar, stok, döviz/altın, gündem (kotasız)', run: async () => morning() },
    tercuman: { d: 'tercuman|dil (arapça/kürtçe/ingilizce/farsça/rusça…) veya kapat — CANLI sesli karşılıklı çeviri', run: async ([l]) => /kapat/i.test(l || '') ? interpreterOff() : interpreter(l || 'arapça') },
    belgeler: { d: 'belgeler|hasta adı — hastanın dosyasındaki okunmuş belgelerin özetleri', run: ([q]) => { const p = needP(q); return (p.belgeler || []).map(d => `• ${d.tur} ${d.tarih} — ${d.tani || ''} · ${d.ozet}`).join('\n') || 'Belge yok.'; } },
    yedek_durumu: { d: 'yedek_durumu — bulut yedeği açık mı, son yedek ne zaman', run: () => yedekDurum() }
  });
  WRITE_TOOLS.add('seans_notu'); WRITE_TOOLS.add('anket_kaydet');
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nKLİNİK II: dikte edilen seans bilgisi → seans_notu; hasta seyri → ilerleme; gelişmeyenler → gelismeyen; ev egzersiz kartı → egzersiz_karti; anket → anket_gonder/anket_kaydet/anket_ozet; ay sonu → aylik_rapor; Instagram planı → sosyal_takvim; sabah özeti → sabah_brifingi; tercüman → tercuman; belge özetleri → belgeler; yedek → yedek_durumu.';
  TOOL_GROUPS.push([/seans not|dikte|ilerleme|gelişme|seyri|egzersiz kart|anket|memnuniyet|aylık rapor|ayın rapor|bu ay|geçen ay|ay sonu|işletme rapor|ciro|kazanç|stok|malzeme|instagram plan|sosyal medya takvim|içerik takvim|sabah|brifing|tercüman|çevir|arapça|kürtçe|belge|rapor fotoğraf|yedek/i, /^(seans_notu|ilerleme|gelismeyen|egzersiz_karti|anket_gonder|anket_kaydet|anket_ozet|aylik_rapor|stok_uyari|sosyal_takvim|sabah_brifingi|tercuman|belgeler|yedek_durumu)$/]);

  /* ===== komutlar ===== */
  const _lc = localCommand;
  localCommand = text => {
    if (guest()) return _lc(text);
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '');
    let m;
    const later = (fn, msg) => { setTimeout(async () => { try { const r = await fn(); if (r) { const n = bubble('ai', typeof r === 'string' ? r : r.text); if (r.links) addLinks(n.el, r.links); answerTools(n.el, n.el.textContent); } } catch (e) { setPhase('idle', 'Hazır.'); note(e.message); } }, 30); return msg; };
    if ((m = t.match(/^(.{3,40}?)\s+(?:için\s+)?seans\s+not(?:u|unu)?\s*(?:yaz|kaydet|ekle)?\s*[:,-]\s*(.{8,})$/i))) return later(() => sessionNote(m[1], m[2]), '📝 Seans notunu düzenleyip kaydediyorum…');
    if ((m = t.match(/^seans\s+not(?:u|unu)?\s*(?:yaz|kaydet|ekle)?\s*[:,-]?\s*(.{12,})$/i))) return later(() => sessionNote('', m[1]), '📝 Seans notunu düzenleyip kaydediyorum…');
    if ((m = t.match(/^(.{3,40}?)['’]?(?:n[ıiuü]n|[ıiuü]n)?\s+(?:ilerlemesi|ilerlemesini göster|gidişatı|seyri|iyileşme grafiği)\??$/i)) && findPatient(m[1])) return later(() => progress(m[1]), 'Seyrini çıkarıyorum…');
    if (/^(gelişmeyen|ilerlemeyen|iyileşmeyen) hastalar\??$/i.test(t)) return stalledText();
    if ((m = t.match(/^(.{3,40}?)\s+(?:için\s+)?egzersiz kartı(?:\s+(?:yap|hazırla|tasarla))?$/i))) return later(() => exerciseCard(m[1]), '🏋 Egzersiz kartını tasarlıyorum…');
    if ((m = t.match(/^(.{3,40}?)['’]?(?:a|e|ya|ye)?\s+anket\s+(?:gönder|yolla)$/i))) return later(() => surveySend(m[1]), 'Anket mesajını hazırlıyorum…');
    if ((m = t.match(/^anket\s+(.{2,30}?)\s+(\d)\s+(\d)\s+(\d{1,2})\s*(.*)$/i))) { try { const p = patients.find(x => fold(x.ad).includes(fold(m[1]))); return surveySave(p ? p.ad : m[1], m[2], m[3], m[4], m[5]); } catch (e) { return e.message; } }
    if (/^(anket|memnuniyet) (sonuçları|özeti|raporu)$/i.test(t)) return surveySummary();
    if ((m = t.match(/^(?:aylık|ay sonu|işletme)\s+rapor(?:u)?\s*(\d{4}-\d{2})?$/i))) return monthReport(m[1]);
    if (/^stok(lar)?(ı)? (kontrol et|durumu|uyarısı)$/i.test(t)) return stockCheck(true);
    if ((m = t.match(/^(?:haftalık\s+)?(?:instagram|sosyal medya|içerik)\s+(?:planı|takvimi)\s*(?:yap|hazırla|çıkar|oluştur)?\s*[:,-]?\s*(.*)$/i))) return later(async () => { await socialPlan(m[1] || ''); showPlan(); }, '📅 Haftalık Instagram planını hazırlıyorum…');
    if (/^(sabah brifingi|günaydın|güne başla|bugünün özeti)\.?$/i.test(t)) return later(() => showMorning(true), '☀ Sabah brifingini hazırlıyorum…');
    if ((m = t.match(/^(arapça|kürtçe|ingilizce|farsça|rusça|almanca|fransızca|süryanice)\s+tercüman(?:ı)?\s*(?:aç|başlat)?$/i)) || (m = t.match(/^tercüman(?:ı)?\s+(?:aç|başlat)\s*[:,-]?\s*(\S+)$/i))) return later(() => interpreter(m[1]), '🌐 Tercümanı açıyorum…');
    if (/^tercüman(ı)?\s+(kapat|durdur)$/i.test(t)) return interpreterOff();
    if (/^(yedek durumu|yedeğim var mı|yedekleme durumu)\??$/i.test(t)) return yedekDurum();
    return _lc(text);
  };

  /* ===== panel: KLİNİK sekmesine KLİNİK+ bölümü ===== */
  const pSel = () => { const s = el('select', { 'aria-label': 'Hasta' }); s.append(new Option('Hasta seç…', '')); for (const p of [...patients].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))) s.append(new Option(p.ad, p.id)); return s; };
  const byId = id => patients.find(p => p.id === id);
  const ps1 = pSel(), nt = el('textarea', { id: 'noteDictate', rows: 3, placeholder: 'Seans notunu yaz ya da klavyedeki mikrofonla dikte et: “ağrısı 4, diz fleksiyon 110, kuadriseps güçlendirme ve TENS yaptık, ev programına uyuyor…”' });
  const ps2 = pSel(), docIn = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const lang = el('select', { 'aria-label': 'Dil' }); for (const v of Object.values(LANGS)) lang.append(new Option(v, v));
  docIn.onchange = async () => { const f = docIn.files[0]; docIn.value = ''; if (!f) return; $('drawer').classList.remove('open'); bubble('me', '📄 Belge okut' + (byId(ps2.value) ? ' · ' + byId(ps2.value).ad : ''), { image: URL.createObjectURL(f) }); try { const r = await readDoc(f, byId(ps2.value)); const n = bubble('ai', r.text); answerTools(n.el, r.text); } catch (e) { setPhase('idle', 'Hazır.'); note(e.message); } };
  const run = (fn) => async () => { try { const r = await fn(); if (r) { $('drawer').classList.remove('open'); const n = bubble('ai', typeof r === 'string' ? r : r.text); if (r?.links) addLinks(n.el, r.links); answerTools(n.el, n.el.textContent); } } catch (e) { setPhase('idle', 'Hazır.'); note(e.message); } };
  const box = el('div', { id: 'klinik2' },
    el('h3', {}, 'SEANS NOTU (DİKTE)'), el('div', { class: 'row' }, ps1), nt,
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: run(async () => { const p = byId(ps1.value); if (!p) throw Error('Hasta seç.'); const r = await sessionNote(p.ad, nt.value); nt.value = ''; return r; }) }, '📝 Kaydet (SOAP)')),
    el('h3', {}, 'BELGE OKU → DOSYAYA EKLE'), el('p', { class: 'muted' }, 'Rapor, reçete, epikriz, MR raporu fotoğrafı: okunur, özetlenir, hastanın dosyasına eklenir.'),
    el('div', { class: 'row' }, ps2, el('button', { type: 'button', class: 'btn', onclick: () => docIn.click() }, '📷 Fotoğraf çek / seç')), docIn,
    el('h3', {}, 'CANLI TERCÜMAN'), el('div', { class: 'row' }, lang, el('button', { type: 'button', class: 'btn', onclick: run(() => interpreter(fold(lang.value).split(' ')[0])) }, '🌐 Başlat'), el('button', { type: 'button', class: 'btn ghost', onclick: run(() => interpreterOff()) }, 'Kapat')),
    el('h3', {}, 'RAPORLAR VE TAKİP'),
    el('div', { class: 'row wrap' },
      el('button', { type: 'button', class: 'btn ghost', onclick: run(() => monthReport()) }, '📊 Aylık rapor'),
      el('button', { type: 'button', class: 'btn ghost', onclick: run(() => stalledText()) }, '⚠ Gelişmeyenler'),
      el('button', { type: 'button', class: 'btn ghost', onclick: run(() => surveySummary()) }, '⭐ Anket özeti'),
      el('button', { type: 'button', class: 'btn ghost', onclick: run(() => stockCheck(true)) }, '📦 Stok'),
      el('button', { type: 'button', class: 'btn ghost', onclick: run(async () => { await socialPlan(''); showPlan(); }) }, '📅 Instagram planı'),
      el('button', { type: 'button', class: 'btn ghost', onclick: run(() => showMorning(false)) }, '☀ Sabah brifingi'),
      el('button', { type: 'button', class: 'btn ghost', onclick: run(() => yedekDurum()) }, '🛡 Yedek durumu')));
  $('p-clinic')?.prepend(box);
  const refreshSel = () => { for (const s of [ps1, ps2]) { const v = s.value; const n = pSel(); s.replaceChildren(...n.children); s.value = v; } };
  const _rp = renderPatients; renderPatients = (...a) => { const r = _rp(...a); try { refreshSel(); } catch {} return r; };

  /* ===== zamanlayıcılar ===== */
  setTimeout(() => { morningAuto(); stockCheck(); eveningRemind(); }, 6000);
  setTimeout(() => { backupGuard(); lockHint(); }, 20000);
  setInterval(() => { if (!document.hidden) { eveningRemind(); stockCheck(); backupGuard(); } }, 30 * 60000);
  setTimeout(() => { if (new Date(Date.now() + OFF).getUTCDay() === 1 && stalled().length) once('stalled', () => note(stalledText())); }, 9000);

  window.jarvisKlinik2 = { sessionNote, progress, stalled, stalledText, exerciseCard, surveySend, surveySave, surveySummary, monthReport, stockCheck, socialPlan, showPlan, morning, showMorning, readDoc, interpreter, interpreterOff, backupGuard, yedekDurum, interp: () => interp };
})();
