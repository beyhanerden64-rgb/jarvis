'use strict';
/* SATÜRN 23.1 — GÜNLÜK: hayatı kolaylaştıran pratik araçlar (internetsiz, ücretsiz, telefonda saklanır)
 *  1) Listeler — alışveriş, eczane, bavul, klinik açılış/kapanış; tikle, WhatsApp’la paylaş
 *  2) Fatura & abonelik — ödeme günü 2 gün önce ve günü hatırlatma, aylık toplam
 *  3) Önemli günler — doğum günü/yıldönümü (her yıl hatırlatır) + “kaç gün kaldı”
 *  4) Park yeri — “park ettim” → konumu kaydet, “arabam nerede” → haritada yol tarifi
 *  5) Hesap bölüşme — kişi başı + bahşiş
 *  6) Yakıt — litre/TL/km → 100 km’de tüketim, km başı maliyet, aylık yakıt gideri
 *  7) Toplu mesaj — bayram/duyuru: her hastaya kişisel hitaplı WhatsApp bağlantısı (tek tek dokun)
 *  8) Uyku hesaplayıcı — 90 dk döngüye göre yatış/kalkış saatleri
 */
(() => {
  const DAY = 86400000;
  const guest = () => !!window.jarvisUltra?.guest?.();
  const today = () => isoLocal(now()).slice(0, 10);
  const tl = n => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' TL';
  const num = s => Number(String(s ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  const show = (text, links) => { const n = bubble('ai', text); answerTools?.(n.el, text); if (links?.length) addLinks?.(n.el, links); return n; };
  const push = (msg, title) => { note(msg); if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(msg, { title, tags: 'bell' })?.catch?.(() => {}); };
  const AY = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
  const AYTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  // “12 Mart”, “12 mart 2027”, “12.03”, “2027-03-12” → {m (0-11), d, y?}
  function parseDay(s) {
    const f = fold(String(s || '')); let m;
    if ((m = f.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
    if ((m = f.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/))) return { d: +m[1], m: +m[2] - 1, y: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined };
    if ((m = f.match(/(\d{1,2})\s*(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\w*(?:\s+(\d{4}))?/))) return { d: +m[1], m: AY.indexOf(m[2]), y: m[3] ? +m[3] : undefined };
    return null;
  }
  const localMid = () => { const t = new Date(today() + 'T00:00:00'); return t; };
  const nextOccur = ({ m, d, y }) => { const base = localMid(); let t = new Date(y ?? base.getFullYear(), m, d); if (y == null && t < base) t = new Date(base.getFullYear() + 1, m, d); return t; };
  const daysTo = t => Math.round((t - localMid()) / DAY);
  const dayTR = t => `${t.getDate()} ${AYTR[t.getMonth()]} ${t.getFullYear()}`;

  /* ================= 1) LİSTELER ================= */
  const TEMPLATES = {
    bavul: ['Kimlik / pasaport', 'Telefon şarj aleti', 'Powerbank', 'İlaçlar', 'Diş fırçası ve macun', 'Çorap ve iç çamaşırı', 'Pijama', 'Yedek kıyafet', 'Ceket', 'Gözlük', 'Kulaklık', 'Cüzdan / kartlar'],
    'klinik açılış': ['Kapı ve ışıklar', 'Klima / ısıtma', 'Cihazları aç (TENS, ultrason)', 'Havlu ve çarşaf değişimi', 'Dezenfektan kontrolü', 'Günün randevularına bak', 'Kasa açılış'],
    'klinik kapanış': ['Cihazları kapat ve fişten çek', 'Kullanılmış havluları ayır', 'Yüzeyleri dezenfekte et', 'Kasa kapanış ve gün sonu', 'Yarının randevularını kontrol et', 'Pencereler ve kapı kilidi', 'Klima / ışıklar kapalı'],
    market: []
  };
  const lists = () => store.get('lists', {});
  const saveLists = L => store.set('lists', L);
  const listName = s => { const f = fold(String(s || 'market')).replace(/\s*(listesi|listem|listesine|listeye|listemi)\s*$/, '').trim(); return f === 'alisveris' || !f ? 'market' : f; };
  function list(op, name, itemsStr = '') {
    const L = lists(), k = listName(name), toks = String(itemsStr).split(/\s*(?:,|\bve\b|\+)\s*/).map(x => x.trim()).filter(x => x && x.length <= 60);
    const cur = (L[k] ||= []);
    if (op === 'ekle') {
      const added = []; for (const t of toks) if (!cur.some(x => fold(x.t) === fold(t))) { cur.push({ t, ok: false }); added.push(t); }
      saveLists(L); return `🛒 ${k} listesine eklendi: ${added.join(', ') || '(zaten vardı)'}. Listede ${cur.filter(x => !x.ok).length} eksik var.`;
    }
    if (op === 'al') {
      const done = []; for (const t of toks) { const x = cur.find(i => fold(i.t) === fold(t)) || cur.find(i => fold(i.t).includes(fold(t)) || fold(t).includes(fold(i.t))); if (x && !x.ok) { x.ok = true; done.push(x.t); } }
      saveLists(L); const left = cur.filter(x => !x.ok);
      return done.length ? `✓ ${done.join(', ')} alındı. ${left.length ? 'Kalan: ' + left.map(x => x.t).join(', ') : 'Liste tamam! 🎉'}` : 'Listede bulamadım.';
    }
    if (op === 'temizle') { L[k] = cur.filter(x => !x.ok); if (/hepsi|tum/.test(fold(itemsStr))) L[k] = []; saveLists(L); return `${k} listesi temizlendi${L[k].length ? ' (alınanlar silindi)' : ''}.`; }
    if (op === 'sablon') { const tk = Object.keys(TEMPLATES).find(t => fold(t) === k || fold(name).includes(fold(t))); if (!tk) return 'Hazır listeler: bavul, klinik açılış, klinik kapanış.'; L[listName(tk)] = TEMPLATES[tk].map(t => ({ t, ok: false })); saveLists(L); return renderList(listName(tk)); }
    return renderList(k);
  }
  const renderList = k => { const cur = lists()[k] || []; if (!cur.length) return `“${k}” listesi boş. Örnek: “listeye süt, ekmek ve yumurta ekle”.`; return `📝 ${k.toUpperCase()} LİSTESİ (${cur.filter(x => !x.ok).length} eksik)\n` + cur.map(x => (x.ok ? '☑ ' : '☐ ') + x.t).join('\n'); };
  function listCard(k) {
    k = listName(k); const cur = lists()[k] || [];
    const n = show(renderList(k));
    if (!cur.length) return n;
    const box = el('div', { class: 'tool', style: 'display:flex;flex-wrap:wrap;gap:6px' });
    for (const it of cur) box.append(el('button', { type: 'button', class: 'btn ghost', 'aria-pressed': String(it.ok), style: it.ok ? 'text-decoration:line-through;opacity:.6' : '', onclick: e => { const L = lists(); const x = (L[k] || []).find(i => i.t === it.t); if (!x) return; x.ok = !x.ok; saveLists(L); e.target.style.cssText = x.ok ? 'text-decoration:line-through;opacity:.6' : ''; e.target.setAttribute('aria-pressed', String(x.ok)); } }, it.t));
    const txt = `${k} listesi:\n` + cur.filter(x => !x.ok).map(x => '• ' + x.t).join('\n');
    box.append(el('a', { class: 'btn', href: 'https://wa.me/?text=' + encodeURIComponent(txt), target: '_blank', rel: 'noopener' }, '💬 WhatsApp’la gönder'));
    n.el.append(box); return n;
  }

  /* ================= 2) FATURA & ABONELİK ================= */
  const bills = () => store.get('bills', []);
  const saveBills = b => store.set('bills', b);
  const nextBill = b => { const base = localMid(); let t = new Date(base.getFullYear(), base.getMonth(), Math.min(b.gun, 28)); if (t < base) t = new Date(base.getFullYear(), base.getMonth() + 1, Math.min(b.gun, 28)); return t; };
  function bill(op, ad = '', gun = '', tutar = '') {
    const B = bills(), nm = String(ad).trim();
    if (op === 'ekle') { const g = parseInt(gun, 10); if (!nm || !(g >= 1 && g <= 31)) throw Error('Biçim: fatura|ekle|ad|ayın kaçı|tutar (ör. elektrik|15|900)'); const x = B.find(b => fold(b.ad) === fold(nm)); if (x) { x.gun = g; x.tutar = num(tutar) || x.tutar; } else B.push({ id: 'b' + Date.now().toString(36), ad: nm, gun: g, tutar: num(tutar) || 0, odendi: '' }); saveBills(B); const nb = nextBill({ gun: g }); return `🧾 ${nm}: her ayın ${g}. günü${num(tutar) ? ' · ~' + tl(num(tutar)) : ''}. Ödeme gününden 2 gün önce ve günü hatırlatırım (sıradaki: ${dayTR(nb)}).`; }
    if (op === 'ode') { const x = B.find(b => fold(b.ad).includes(fold(nm)) || fold(nm).includes(fold(b.ad))); if (!x) return `“${nm}” adlı fatura kayıtlı değil.`; x.odendi = today().slice(0, 7); if (num(tutar)) x.tutar = num(tutar); saveBills(B); return `✓ ${x.ad} bu ay ödendi${num(tutar) ? ' (' + tl(num(tutar)) + ')' : ''}. Bu ay hatırlatmayacağım.`; }
    if (op === 'sil') { const x = B.find(b => fold(b.ad).includes(fold(nm))); if (!x) return 'Bulunamadı.'; saveBills(B.filter(b => b !== x)); return `${x.ad} silindi.`; }
    if (!B.length) return 'Kayıtlı fatura/abonelik yok. Örnek: “elektrik faturası her ayın 15’i 900 TL”, “Netflix aboneliği her ayın 3’ü 230 TL”.';
    const m = today().slice(0, 7), total = B.reduce((a, b) => a + (b.tutar || 0), 0);
    return `🧾 FATURA & ABONELİKLER — aylık ~${tl(total)}\n` + [...B].sort((a, b) => nextBill(a) - nextBill(b)).map(b => `${b.odendi === m ? '✓' : '○'} ${b.ad} — her ayın ${b.gun}. günü${b.tutar ? ' · ' + tl(b.tutar) : ''}${b.odendi === m ? ' (bu ay ödendi)' : ' · ' + (daysTo(nextBill(b)) === 0 ? 'BUGÜN' : daysTo(nextBill(b)) + ' gün kaldı')}`).join('\n') + '\nÖdeyince: “elektriği ödedim”.';
  }
  function billNudge() {
    if (guest()) return; const hr = new Date(Date.now() + 3 * 3600000).getUTCHours(); if (hr < 9) return;
    const m = today().slice(0, 7), sent = store.get('billSent', {}), B = bills();
    for (const b of B) {
      if (b.odendi === m) continue; const dleft = daysTo(nextBill(b)); if (dleft > 2) continue;
      const k = b.id + ':' + isoLocal(nextBill(b)).slice(0, 10) + ':' + (dleft === 0 ? 0 : 2); if (sent[k]) continue;
      sent[k] = 1; push(`🧾 ${b.ad} ${dleft === 0 ? 'BUGÜN' : dleft + ' gün sonra'} ödenecek${b.tutar ? ' (~' + tl(b.tutar) + ')' : ''}. Ödeyince “${b.ad.split(' ')[0].toLowerCase()} ödedim” de.`, 'Fatura hatırlatması');
    }
    store.set('billSent', Object.fromEntries(Object.entries(sent).slice(-80)));
  }

  /* ================= 3) ÖNEMLİ GÜNLER + KAÇ GÜN KALDI ================= */
  const FIXED = [['yılbaşı', 0, 1], ['23 nisan', 3, 23], ['1 mayıs', 4, 1], ['19 mayıs', 4, 19], ['15 temmuz', 6, 15], ['30 ağustos', 7, 30], ['29 ekim', 9, 29], ['cumhuriyet bayramı', 9, 29], ['zafer bayramı', 7, 30], ['sevgililer günü', 1, 14], ['anneler günü', -1, 0], ['dünya fizyoterapi günü', 8, 8]];
  const motherDay = y => { const t = new Date(y, 4, 1); const first = (7 - t.getDay()) % 7; return new Date(y, 4, 1 + first + 7); }; // mayıs 2. pazar
  const events = () => store.get('events', []);
  function eventAdd(ad, when) {
    const p = parseDay(when); if (!ad || !p || p.m < 0 || !(p.d >= 1 && p.d <= 31)) throw Error('Tarih anlaşılmadı. Örnek: “annemin doğum günü 12 Mart”.');
    const E = events().filter(e => fold(e.ad) !== fold(ad)); E.push({ id: 'e' + Date.now().toString(36), ad: String(ad).trim(), m: p.m, d: p.d, y: p.y }); store.set('events', E);
    const nx = nextOccur({ m: p.m, d: p.d }); return `🎂 Kaydedildi: ${ad} — ${p.d} ${AYTR[p.m]}${p.y ? ' ' + p.y : ''}. Her yıl 1 gün önce ve günü hatırlatırım (sıradaki ${daysTo(nx)} gün sonra).`;
  }
  function eventsList() {
    const E = events(); if (!E.length) return 'Kayıtlı önemli gün yok. Örnek: “annemin doğum günü 12 Mart”, “evlilik yıldönümümüz 20.06.2015”.';
    return '🎂 ÖNEMLİ GÜNLER\n' + E.map(e => ({ e, nx: nextOccur({ m: e.m, d: e.d }) })).sort((a, b) => a.nx - b.nx).map(({ e, nx }) => `• ${e.ad} — ${e.d} ${AYTR[e.m]} · ${daysTo(nx) === 0 ? 'BUGÜN 🎉' : daysTo(nx) + ' gün kaldı'}${e.y && /doğum|yıldönüm|evlilik/i.test(e.ad) ? ` (${nx.getFullYear() - e.y}. yıl)` : ''}`).join('\n');
  }
  function countdown(q) {
    const f = fold(q).trim();
    const ev = events().find(e => fold(e.ad).includes(f) || f.includes(fold(e.ad)));
    let t = null, label = q;
    if (ev) { t = nextOccur({ m: ev.m, d: ev.d }); label = ev.ad; }
    else { const fx = FIXED.find(([n]) => f.includes(fold(n))); if (fx) { label = String(q).trim().replace(/^\p{Ll}/u, c => c.toLocaleUpperCase('tr')); t = fx[1] < 0 ? (() => { const y = localMid().getFullYear(); const a = motherDay(y); return a < localMid() ? motherDay(y + 1) : a; })() : nextOccur({ m: fx[1], d: fx[2] }); } else { const p = parseDay(q); if (p && p.m >= 0) t = nextOccur(p); } }
    if (!t) return null;
    const n = daysTo(t), w = Math.floor(n / 7);
    return n === 0 ? `🎉 ${label} BUGÜN!` : `⏳ ${label}: ${n} gün kaldı (${dayTR(t)}, ${t.toLocaleDateString('tr-TR', { weekday: 'long' })})${w >= 2 ? ` — yaklaşık ${w} hafta` : ''}.`;
  }
  function eventNudge() {
    if (guest()) return; const hr = new Date(Date.now() + 3 * 3600000).getUTCHours(); if (hr < 9) return;
    const sent = store.get('eventSent', {});
    for (const e of events()) { const nx = nextOccur({ m: e.m, d: e.d }), n = daysTo(nx); if (n > 1) continue; const k = e.id + ':' + isoLocal(nx).slice(0, 10) + ':' + n; if (sent[k]) continue; sent[k] = 1; push(n === 0 ? `🎉 Bugün ${e.ad}! Bir mesaj ya da arama unutulmasın.` : `🎂 Yarın ${e.ad}. Hediye/mesaj için hazırlık?`, 'Önemli gün'); }
    store.set('eventSent', Object.fromEntries(Object.entries(sent).slice(-80)));
  }

  /* ================= 4) PARK YERİ ================= */
  async function park(note0 = '') {
    const pos = await new Promise((res, rej) => { if (!navigator.geolocation) return rej(Error('Konum bu cihazda yok')); navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej(Error(e.code === 1 ? 'Konum izni verilmedi (Ayarlar → Safari → Konum)' : 'Konum alınamadı')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }); });
    store.set('parkSpot', { lat: pos.latitude, lon: pos.longitude, acc: Math.round(pos.accuracy || 0), t: Date.now(), note: String(note0).slice(0, 80) });
    return `🅿️ Park yeri kaydedildi (±${Math.round(pos.accuracy || 0)} m)${note0 ? ' — ' + note0 : ''}. Bulmak için: “arabam nerede”.`;
  }
  function findCar() {
    const s = store.get('parkSpot', null); if (!s) return { text: 'Kayıtlı park yeri yok. Park edince “park ettim” (istersen “park ettim B2 kat 14”) de.' };
    const ago = Math.round((Date.now() - s.t) / 60000);
    return { text: `🅿️ Araban ${ago < 90 ? ago + ' dakika' : Math.round(ago / 60) + ' saat'} önce burada park edildi${s.note ? ' — ' + s.note : ''}.`, links: [{ url: `https://maps.apple.com/?daddr=${s.lat},${s.lon}&dirflg=w`, title: '🚶 Apple Haritalar’da yürüyerek yol tarifi' }, { url: `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`, title: '🗺 Google Haritalar’da yol tarifi' }] };
  }

  /* ================= 5) HESAP BÖLÜŞME ================= */
  function split(total, people, tip = 0) {
    total = num(total); people = parseInt(people, 10) || 1; tip = num(tip) || 0;
    if (!(total > 0) || people < 1) throw Error('Örnek: “hesap böl 1250 4 kişi bahşiş 10”');
    const withTip = total * (1 + tip / 100), each = withTip / people, round = Math.ceil(each / 5) * 5;
    return `🧮 Hesap: ${tl(total)}${tip ? ` + %${tip} bahşiş (${tl(withTip - total)}) = ${tl(withTip)}` : ''}\nKişi başı: ${tl(Math.round(each * 100) / 100)}${round !== Math.round(each) ? ` · yuvarlayarak ${tl(round)}` : ''} (${people} kişi)`;
  }

  /* ================= 6) YAKIT ================= */
  const fuel = () => store.get('fuel', []);
  function fuelAdd(tutar, litre, km) {
    const F = fuel(), t = num(tutar), l = num(litre), k = num(km);
    if (!(t > 0)) throw Error('Örnek: “benzin aldım 1500 TL 35 litre km 45200”');
    F.push({ t: Date.now(), d: today(), tutar: t, litre: l || 0, km: k || 0 }); store.set('fuel', F.slice(-200));
    const withKm = F.filter(x => x.km > 0 && x.litre > 0);
    let eff = '';
    if (withKm.length >= 2) { const a = withKm.at(-2), b = withKm.at(-1), dist = b.km - a.km; if (dist > 0) eff = ` Son dolumdan beri ${Math.round(dist)} km: 100 km’de ${(b.litre / dist * 100).toFixed(1)} L, km başı ${(b.tutar / dist).toFixed(2)} TL.`; }
    const m = today().slice(0, 7), mt = F.filter(x => x.d.startsWith(m)).reduce((a, x) => a + x.tutar, 0);
    try { if (opt('fuelToLedger') === '1') TOOLS.kasa?.run(['gider', String(t).replace('.', ','), 'Yakıt']); } catch {}
    return `⛽ Kaydedildi: ${tl(t)}${l ? ' · ' + l + ' L (' + (t / l).toFixed(2) + ' TL/L)' : ''}.${eff} Bu ay yakıt: ${tl(mt)}.`;
  }
  function fuelReport() {
    const F = fuel(); if (!F.length) return 'Yakıt kaydı yok. Örnek: “benzin aldım 1500 TL 35 litre km 45200”.';
    const m = today().slice(0, 7), mt = F.filter(x => x.d.startsWith(m)), byM = {};
    for (const x of F) byM[x.d.slice(0, 7)] = (byM[x.d.slice(0, 7)] || 0) + x.tutar;
    const k = F.filter(x => x.km > 0 && x.litre > 0); let avg = '';
    if (k.length >= 2) { const dist = k.at(-1).km - k[0].km, lit = k.slice(1).reduce((a, x) => a + x.litre, 0), cost = k.slice(1).reduce((a, x) => a + x.tutar, 0); if (dist > 0) avg = `\nOrtalama: 100 km’de ${(lit / dist * 100).toFixed(1)} L · km başı ${(cost / dist).toFixed(2)} TL (${Math.round(dist)} km)`; }
    return `⛽ YAKIT — bu ay ${tl(mt.reduce((a, x) => a + x.tutar, 0))} (${mt.length} dolum)${avg}\nSon aylar: ` + Object.entries(byM).slice(-4).map(([mm, v]) => `${AYTR[+mm.slice(5) - 1]} ${tl(v)}`).join(' · ');
  }

  /* ================= 7) TOPLU MESAJ (bayram/duyuru) ================= */
  const waNum = tel => { let d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '9' + d; else if (d.length === 10 && d.startsWith('5')) d = '90' + d; return d; };
  const hitap = p => { const first = String(p?.ad || '').split(/\s+/)[0]; return first + (p.cinsiyet === 'k' ? ' Hanım' : p.cinsiyet === 'e' ? ' Bey' : ''); };
  const BULK = {
    ramazan: 'Ramazan Bayramınızı en içten dileklerimizle kutlar, sağlık ve huzur dolu nice bayramlar dileriz.',
    kurban: 'Kurban Bayramınızı kutlar, sevdiklerinizle birlikte sağlıklı ve huzurlu bir bayram geçirmenizi dileriz.',
    yilbasi: 'Yeni yılınızı kutlar, sağlıkla ve ağrısız geçecek mutlu bir yıl dileriz.',
    tatil: 'Kliniğimiz bayram süresince kapalı olacaktır. Randevularınız için bayram sonrası bizimle iletişime geçebilirsiniz.',
    kampanya: 'Bu ay kliniğimizde kontrol seansı fırsatı var. Ağrılarınızın takibi için randevu almak isterseniz bize yazabilirsiniz.'
  };
  function bulk(kind = '', custom = '', scope = '') {
    const P = (typeof patients !== 'undefined' ? patients : []).filter(p => waNum(p.tel));
    const days = /aktif|son/.test(fold(scope)) ? 90 : 3650;
    const list = P.filter(p => Date.now() - ((p.seanslar || []).at(-1)?.t || p.created || 0) < days * DAY).slice(0, 80);
    if (!list.length) return { text: 'Telefonu kayıtlı hasta yok.' };
    const k = Object.keys(BULK).find(x => fold(kind).includes(x)) || (/bayram/.test(fold(kind)) ? 'ramazan' : '');
    const body = String(custom || '').trim() || BULK[k] || ''; if (!body) return { text: 'Mesaj türleri: ramazan, kurban, yılbaşı, tatil, kampanya — ya da kendi metnin: “toplu mesaj: …”.' };
    const brand = store.get('set.brandName', '') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
    const n = show(`📣 Toplu mesaj hazır — ${list.length} hasta. WhatsApp kuralları gereği her birine tek dokunuşla ayrı ayrı gönderilir (kişisel hitaplı). Gönderdiklerin işaretlenir.\n\nÖrnek: “Merhaba ${hitap(list[0])}, ${body} — ${brand}”`);
    const box = el('div', { class: 'tool', style: 'display:flex;flex-wrap:wrap;gap:6px' });
    for (const p of list) { const a = el('a', { class: 'btn ghost', href: `https://wa.me/${waNum(p.tel)}?text=${encodeURIComponent(`Merhaba ${hitap(p)}, ${body} — ${brand}`)}`, target: '_blank', rel: 'noopener', onclick: e => { e.currentTarget.style.opacity = '.45'; e.currentTarget.textContent = '✓ ' + p.ad; } }, '💬 ' + p.ad); box.append(a); }
    n.el.append(box);
    return { text: `${list.length} kişilik toplu mesaj listesi hazırlandı.` };
  }

  /* ================= 8) UYKU ================= */
  function sleep(q) {
    const m = String(q).match(/(\d{1,2})(?:[:.](\d{2}))?/); const hh = m ? +m[1] : null, mm = m?.[2] ? +m[2] : 0;
    const f = (h, mi) => String(((h % 24) + 24) % 24).padStart(2, '0') + ':' + String(((mi % 60) + 60) % 60).padStart(2, '0');
    const add = (base, mins) => { const t = base + mins; return f(Math.floor(t / 60), t % 60); };
    if (/kalk|uyan/.test(fold(q)) && hh != null) { const wake = hh * 60 + mm; const opts = [6, 5, 4].map(c => add(wake, -(c * 90 + 15))); return `😴 ${f(hh, mm)}’de dinç uyanmak için şu saatlerde uykuya dal: ${opts.join(' · ')} (6/5/4 uyku döngüsü, dalma süresi 15 dk dahil). İdeali ilki — 9 saat.`; }
    const nowT = new Date(Date.now() + 3 * 3600000), base = (hh != null ? hh * 60 + mm : nowT.getUTCHours() * 60 + nowT.getUTCMinutes()) + 15;
    return `⏰ ${hh != null ? f(hh, mm) + '’de' : 'Şimdi'} yatarsan dinç uyanma saatleri: ${[4, 5, 6].map(c => add(base, c * 90)).join(' · ')} (4/5/6 döngü).`;
  }

  /* ================= zamanlama ================= */
  setInterval(() => { billNudge(); eventNudge(); }, 10 * 60000);
  setTimeout(() => { billNudge(); eventNudge(); }, 70000);

  /* ================= araçlar ================= */
  const res = r => (typeof r === 'string' ? r : r.text + (r.links?.length ? '\n' + r.links.map(l => l.title + ': ' + l.url).join('\n') : ''));
  Object.assign(TOOLS, {
    liste: { d: 'liste|ekle/al/goster/temizle/sablon|liste adı (market, eczane, bavul, klinik açılış…)|öğeler virgülle — alışveriş ve kontrol listeleri', run: ([op, n, it]) => list(fold(op || 'goster'), n, it) },
    fatura: { d: 'fatura|ekle|ad|ayın kaçı|tutar · fatura|ode|ad · fatura|liste — fatura/abonelik takibi ve ödeme hatırlatması', run: ([op, a, b, c]) => bill(fold(op || 'liste').replace('ö', 'o'), a, b, c) },
    onemli_gun: { d: 'onemli_gun|ekle|ad|tarih (12 Mart) · onemli_gun|liste — doğum günü/yıldönümü, her yıl hatırlatma', run: ([op, a, b]) => /ekle/.test(op || '') ? eventAdd(a, b) : eventsList() },
    kac_gun: { d: 'kac_gun|tarih veya gün adı (yılbaşı, 29 Ekim, 12 Mart, annemin doğum günü) — kaç gün kaldı', run: ([q]) => countdown(q || '') || 'Tarih anlaşılmadı.' },
    park: { d: 'park|kaydet|not · park|bul — park yerini kaydeder / yol tarifi verir', run: async ([op, n]) => /bul|nerede/.test(fold(op || '')) ? res(findCar()) : park(n) },
    hesap_bol: { d: 'hesap_bol|tutar|kişi|bahşiş % — kişi başı tutar', run: ([a, b, c]) => split(a, b, c) },
    yakit: { d: 'yakit|tutar|litre|km · yakit|rapor — yakıt kaydı, 100 km tüketim, aylık gider', run: ([a, b, c]) => /rapor/.test(fold(a || '')) ? fuelReport() : fuelAdd(a, b, c) },
    toplu_mesaj: { d: 'toplu_mesaj|ramazan/kurban/yilbasi/tatil/kampanya veya boş|özel metin|aktif — hastalara kişisel hitaplı WhatsApp bağlantıları', run: ([k, c, s]) => res(bulk(k, c, s)) },
    uyku: { d: 'uyku|“7’de kalkacağım” veya “23:30’da yatarsam” — uyku döngüsü saatleri', run: ([q]) => sleep(q || '') }
  });
  TOOL_GROUPS.push([/liste|market|alışveriş|fatura|abonelik|doğum günü|yıldönüm|kaç gün|park|araba|hesap|bahşiş|benzin|yakıt|mazot|toplu|bayram|uyku|yat|kalk/i, /^(liste|fatura|onemli_gun|kac_gun|park|hesap_bol|yakit|toplu_mesaj|uyku)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGÜNLÜK: alışveriş/kontrol listesi → liste; fatura/abonelik → fatura; doğum günü/yıldönümü → onemli_gun; “kaç gün kaldı” → kac_gun; park yeri → park; hesap bölüşme → hesap_bol; benzin/yakıt → yakit; bayram/duyuru mesajı → toplu_mesaj; uyku saati → uyku.';

  /* ================= doğal dil ================= */
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''); let m;
    const out = r => { if (typeof r === 'string') return r; setTimeout(() => show(r.text, r.links), 20); return r.text; };
    if (guest()) return _lc(text0);
    try {
      // listeler
      if ((m = t.match(/^(?:(\S+(?: \S+)?) )?(?:listesine|listeye|listeme) (.{2,200}?) ekle$/i))) return list('ekle', m[1] || 'market', m[2]);
      if ((m = t.match(/^(.{2,200}?) (?:aldım|alındı)$/i)) && Object.values(lists()).some(L => L.some(x => !x.ok && fold(m[1]).split(/\s*(?:,|\bve\b)\s*/).some(w => fold(x.t).includes(w) || w.includes(fold(x.t)))))) { const k = Object.entries(lists()).find(([, L]) => L.some(x => !x.ok && fold(m[1]).includes(fold(x.t))))?.[0] || 'market'; return list('al', k, m[1]); }
      if ((m = t.match(/^(alışveriş|market|eczane|bavul|klinik açılış|klinik kapanış|[\p{L}]+) list(?:esi|em|emi göster|esini göster)$/iu))) { if (TEMPLATES[fold(m[1]).replace('acilis', 'açılış').replace('kapanis', 'kapanış')] && !(lists()[listName(m[1])] || []).length) list('sablon', m[1]); setTimeout(() => listCard(m[1]), 20); return renderList(listName(m[1])); }
      if ((m = t.match(/^(\S+(?: \S+)?) listesini (temizle|sıfırla|boşalt)$/i))) return list('temizle', m[1], /sıfırla|boşalt/i.test(m[2]) ? 'hepsi' : '');
      // fatura
      if ((m = t.match(/^(.{2,40}?)(?: faturası| aboneliği| faturam| aboneliğim)? her ayın (\d{1,2})(?:['’.]?\p{L}{0,3})?(?: günü)?(?: (\d[\d.,]*) ?(?:tl|lira|₺)?)?$/iu))) return bill('ekle', m[1], m[2], m[3] || '');
      if ((m = t.match(/^(.{2,30}?)(?:[iıuü]|y[iıuü]|n[iıuü])? (?:faturasını )?ödedim(?: (\d[\d.,]*) ?(?:tl)?)?$/i)) && bills().some(b => fold(b.ad).startsWith(fold(m[1]).slice(0, 4)))) { const b = bills().find(x => fold(x.ad).startsWith(fold(m[1]).slice(0, 4))); return bill('ode', b.ad, '', m[2] || ''); }
      if (/^(faturalarım|faturalar|aboneliklerim|abonelikler)$/i.test(t)) return bill('liste');
      // önemli günler
      if ((m = t.match(/^(.{3,50}?(?:doğum günü|yıldönümü|yıl dönümü|nikah|düğün)[\p{L}]*) (\d{1,2}[ ./].{2,20}|\d{4}-\d{2}-\d{2})$/iu))) return eventAdd(m[1], m[2]);
      if (/^(önemli günler|doğum günleri|önemli günlerim)$/i.test(t)) return eventsList();
      if ((m = t.match(/^(.{2,40}?)(?:['’]?(?:a|e|ya|ye|na|ne))? (?:kaç gün (?:var|kaldı)|ne kadar kaldı)$/i))) { const r = countdown(m[1]); if (r) return r; }
      // park
      if ((m = t.match(/^(?:arabayı |aracı )?(?:buraya )?park ettim(?: (.{1,60}))?$/i))) { park(m[1] || '').then(r => show(r)).catch(e => note(e.message)); return 'Konumu alıyorum…'; }
      if (/^(arabam|aracım|arabamı|aracımı) (nerede|nereye park ettim|bul)$|^park yerim$/i.test(t)) return out(findCar());
      // hesap
      if ((m = t.match(/^(?:hesap|hesabı) ?böl(?:üş)?(?:ü)? (\d[\d.,]*)(?: ?tl)? (\d{1,2}) ?kişi(?:ye)?(?: (?:bahşiş|%) ?%?(\d{1,2}))?$/i))) return split(m[1], m[2], m[3] || 0);
      // yakıt
      if ((m = t.match(/^(?:benzin|mazot|motorin|yakıt|lpg) (?:aldım|doldurdum|koydum) (\d[\d.,]*) ?(?:tl|lira)?(?: (\d[\d.,]*) ?(?:litre|lt|l))?(?: (?:km|kilometre) ?(\d[\d.,]*))?$/i))) return fuelAdd(m[1], m[2] || '', m[3] || '');
      if (/^(yakıt (?:raporu|durumu|giderim)|benzin raporu|ne kadar yakıt yaktım)$/i.test(t)) return fuelReport();
      // toplu mesaj
      if ((m = t.match(/^(ramazan|kurban|yılbaşı|tatil|kampanya)?\s*(?:bayramı? )?(?:toplu mesaj|bayram mesajı|kutlama mesajı|mesajı)(?: hazırla| gönder)?(?: (aktif|son) hastalar(?:a|ım)?)?$/i)) && (m[1] || /toplu|bayram|kutlama/i.test(t))) return out(bulk(m[1] || (/bayram/i.test(t) ? 'ramazan' : ''), '', m[2] || ''));
      if ((m = t.match(/^toplu mesaj[: ]+(.{10,500})$/i))) return out(bulk('', m[1]));
      // uyku
      if (/(kalkacağım|kalkmam lazım|uyanacağım|uyanmam lazım|yatarsam|ne zaman yatayım|ne zaman uyuyayım|uyku hesapla)/i.test(t) && !/hatırlat|alarm|kur\b|görev/i.test(t) && t.length < 80) return sleep(t);
      if (/^(günlük araçlar|pratik araçlar)$/i.test(t)) return '🧰 GÜNLÜK ARAÇLAR\n• “listeye süt, ekmek ve yumurta ekle” → “süt aldım” → “alışveriş listesi”\n• “bavul listesi”, “klinik kapanış listesi”\n• “elektrik faturası her ayın 15’i 900 TL” → “elektriği ödedim” → “faturalarım”\n• “annemin doğum günü 12 Mart” → “önemli günler”\n• “yılbaşına kaç gün kaldı”, “29 Ekim’e kaç gün var”\n• “park ettim B2 kat” → “arabam nerede”\n• “hesap böl 1250 4 kişi bahşiş 10”\n• “benzin aldım 1500 TL 35 litre km 45200” → “yakıt raporu”\n• “ramazan bayramı mesajı hazırla”, “toplu mesaj: …”\n• “7’de kalkacağım ne zaman yatayım”';
    } catch (e) { return e.message; }
    return _lc(text0);
  };
  window.jarvisGunluk = { parseDay, nextOccur, list, listCard, bill, billNudge, eventAdd, eventsList, countdown, eventNudge, park, findCar, split, fuelAdd, fuelReport, bulk, sleep };
})();
