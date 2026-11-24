'use strict';
/* SATÜRN 23 — ÜRETKEN: günlük işi hızlandıran, yerel (internetsiz) çalışan, bozulmayan araçlar
 *  1) Günü planla — randevular sabit, açık işler önceliğe göre boşluklara yerleşir (zaman bloklama)
 *  2) Odak (Pomodoro) — 25/5 döngü, sesli/titreşimli uyarı, günlük odak dakikası
 *  3) Alışkanlıklar — seri (streak) takibi, akşam hatırlatması
 *  4) Alacak takibi — hasta borcu, kısmi ödeme (kasaya gelir), nazik WhatsApp hatırlatması
 *  5) Google yorum isteği — tedavisi biten hastaya WhatsApp ile yorum bağlantısı
 *  6) QR kod — yorum bağlantısı, Wi-Fi, kartvizit, her metin
 *  7) Klinik belgeleri — onam formu, KVKK aydınlatma, hasta bilgilendirme, randevu kartı (yazdır/paylaş; ad yalnız telefonda)
 *  8) Haftalık özet — pazar akşamı kendiliğinden: seans, kasa, alacak, alışkanlık, odak, gelecek hafta
 *  9) PDF özeti — PDF seç → ana fikir, maddeler, rakamlar, yapılacaklar
 *  Hepsi ücretsiz; yalnız QR (görsel servisi) ve PDF özeti internet ister. */
(() => {
  const DAY = 86400000;
  const guest = () => !!window.jarvisUltra?.guest?.();
  const today = () => isoLocal(now()).slice(0, 10);
  const dkey = t => isoLocal(new Date(t)).slice(0, 10);
  const tl = n => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' TL';
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const toMin = s => { const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const brand = () => store.get('set.brandName', '') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
  const waNum = tel => { let d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '9' + d; else if (d.length === 10 && d.startsWith('5')) d = '90' + d; return d; };
  const wa = (tel, text) => { const n = waNum(tel); return `https://wa.me/${n}?text=${encodeURIComponent(text)}`; };
  const hitap = p => { const first = String(p?.ad || '').split(/\s+/)[0]; return first ? first + (p.cinsiyet === 'k' ? ' Hanım' : p.cinsiyet === 'e' ? ' Bey' : '') : ''; };
  const pat = q => (typeof findPatient === 'function' ? findPatient(q) : null);
  const show = (text, links) => { const n = bubble('ai', text); answerTools?.(n.el, text); if (links?.length) addLinks?.(n.el, links); return n; };

  /* ================= 1) GÜNÜ PLANLA ================= */
  function plan(dateStr = today()) {
    const start = toMin(store.get('set.workStart', '09:00')) ?? 540, end = toMin(store.get('set.workEnd', '19:00')) ?? 1140;
    const lunch = [toMin(store.get('set.lunch', '12:30')) ?? 750, (toMin(store.get('set.lunch', '12:30')) ?? 750) + 60];
    const open = items.filter(i => i.kind === 'task' && !i.done);
    const fixed = open.filter(i => (i.due || '').startsWith(dateStr) && /T\d{2}:\d{2}/.test(i.due)).map(i => ({ s: toMin(i.due.slice(11)), e: toMin(i.due.slice(11)) + 45, text: i.text, fixed: true })).sort((a, b) => a.s - b.s);
    const late = i => i.due && i.due.slice(0, 10) < dateStr;
    const flex = open.filter(i => !fixed.some(f => f.text === i.text) && (!i.due || i.due.slice(0, 10) <= dateStr))
      .sort((a, b) => (late(b) - late(a)) || String(a.due || '9').localeCompare(String(b.due || '9')) || a.created - b.created).slice(0, 8);
    const busy = [...fixed.map(f => [f.s, f.e]), lunch].sort((a, b) => a[0] - b[0]);
    const nowM = dateStr === today() ? (() => { const d = isoLocal(now()); return toMin(d.slice(11)); })() : 0;
    let cur = Math.max(start, Math.ceil(nowM / 15) * 15);
    const blocks = [...fixed.map(f => ({ ...f }))];
    for (const t of flex) {
      const dur = /rapor|plan|hazırla|yaz|analiz|muhasebe|vergi/i.test(t.text) ? 50 : 25;
      let placed = false;
      while (cur + dur <= end) {
        const clash = busy.find(([s, e]) => cur < e && cur + dur > s);
        if (clash) { cur = clash[1]; continue; }
        blocks.push({ s: cur, e: cur + dur, text: t.text, late: late(t) }); busy.push([cur, cur + dur]); busy.sort((a, b) => a[0] - b[0]); cur += dur + 5; placed = true; break;
      }
      if (!placed) blocks.push({ s: null, text: t.text, late: late(t) });
    }
    blocks.push({ s: lunch[0], e: lunch[1], text: 'Öğle arası', rest: true });
    const timed = blocks.filter(b => b.s != null).sort((a, b) => a.s - b.s), spill = blocks.filter(b => b.s == null);
    const L = [`🗓 GÜN PLANI — ${dateStr} (${hm(start)}–${hm(end)})`];
    if (!timed.some(b => !b.rest)) L.push('Planlanacak randevu/görev yok. Görev eklemek için: “görev: … yarın 15:00”.');
    for (const b of timed) L.push(`${hm(b.s)}–${hm(b.e)}  ${b.fixed ? '📌 ' : b.rest ? '🍽 ' : '▫ '}${b.text}${b.late ? ' (gecikmiş)' : ''}`);
    if (spill.length) L.push('\nBugüne sığmayanlar (yarına öner): ' + spill.map(b => b.text).join(' · ') + (dateStr === today() && end - nowM < 60 ? '\nMesai bitmek üzere — “yarını planla” de, yarının planını çıkarayım.' : ''));
    const free = Math.max(0, end - Math.max(start, nowM) - busy.reduce((a, [s, e]) => a + Math.max(0, Math.min(e, end) - Math.max(s, start, nowM)), 0));
    L.push(`\nBoş zaman: yaklaşık ${Math.round(free / 60 * 10) / 10} saat. İpucu: zor işi ilk boşluğa koydum; “odak başlat” ile 25 dakikalık bloklarla ilerle.`);
    return L.join('\n');
  }

  /* ================= 2) ODAK (POMODORO) ================= */
  const F = { on: false, phase: '', until: 0, cycle: 0, cycles: 4, work: 25, rest: 5, timer: 0, label: '' };
  const focusLog = () => store.get('focusLog', {});
  const addFocus = m => { const L = focusLog(); L[today()] = (L[today()] || 0) + m; const keys = Object.keys(L).sort().slice(-60); store.set('focusLog', Object.fromEntries(keys.map(k => [k, L[k]]))); };
  const pill = el('button', { type: 'button', id: 'focusPill', hidden: true, style: 'position:fixed;right:12px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:50;border-radius:999px;padding:8px 12px;font:600 13px/1 system-ui;background:#1f2937;color:#fbbf24;border:1px solid #fbbf24', onclick: () => note(focusStatus()) });
  document.body.append(pill);
  const ding = msg => { note(msg); try { navigator.vibrate?.([200, 100, 200]); } catch {} try { if (setting('speakOn') === '1') voiceSession.read(msg.replace(/[^\p{L}\p{N}\s,.!?']/gu, '')); } catch {} };
  function focusTick() {
    if (!F.on) { pill.hidden = true; return; }
    const left = Math.max(0, F.until - Date.now());
    pill.hidden = false; pill.textContent = `${F.phase === 'work' ? '🎯' : '☕'} ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')} · ${F.cycle}/${F.cycles}`;
    if (left > 0) return;
    if (F.phase === 'work') {
      addFocus(F.work);
      if (F.cycle >= F.cycles) { focusStop(true); return; }
      F.phase = 'rest'; F.until = Date.now() + F.rest * 60000; ding(`Odak bloğu ${F.cycle} bitti. ${F.rest} dakika mola.`);
    } else { F.cycle++; F.phase = 'work'; F.until = Date.now() + F.work * 60000; ding(`Mola bitti. ${F.cycle}. odak bloğu başladı.`); }
    store.set('focusState', { ...F, timer: 0 });
  }
  function focusStart(work = 25, cycles = 4, label = '') {
    work = Math.max(5, Math.min(120, +work || 25)); cycles = Math.max(1, Math.min(12, +cycles || 4));
    Object.assign(F, { on: true, phase: 'work', cycle: 1, cycles, work, rest: work >= 50 ? 10 : 5, until: Date.now() + work * 60000, label });
    clearInterval(F.timer); F.timer = setInterval(focusTick, 1000); focusTick(); store.set('focusState', { ...F, timer: 0 });
    return `🎯 Odak başladı: ${cycles} × ${work} dk (molalar ${F.rest} dk)${label ? ' — ' + label : ''}. Bitince haber veririm; durdurmak için “odak dur”.`;
  }
  function focusStop(done = false) {
    if (!F.on) return 'Şu an odak oturumu yok.';
    if (!done && F.phase === 'work') addFocus(Math.round((F.work * 60000 - Math.max(0, F.until - Date.now())) / 60000));
    F.on = false; clearInterval(F.timer); pill.hidden = true; store.set('focusState', null);
    const m = focusLog()[today()] || 0;
    const msg = done ? `✓ Odak oturumu tamamlandı. Bugün toplam ${m} dakika odaklandın. Tebrikler!` : `Odak durduruldu. Bugün toplam ${m} dakika.`;
    if (done) ding(msg);
    return msg;
  }
  const focusStatus = () => {
    const L = focusLog(), week = Object.entries(L).filter(([d]) => Date.now() - new Date(d).getTime() < 7 * DAY).reduce((a, [, m]) => a + m, 0);
    return (F.on ? `${F.phase === 'work' ? 'Odaktasın' : 'Moladasın'} (${F.cycle}/${F.cycles}), kalan ${Math.ceil((F.until - Date.now()) / 60000)} dk. ` : '') + `Bugün ${L[today()] || 0} dk, son 7 gün ${week} dk odak.`;
  };
  { const s = store.get('focusState', null); if (s?.on && s.until > Date.now() - 3600000) { Object.assign(F, s); F.timer = setInterval(focusTick, 1000); } }

  /* ================= 3) ALIŞKANLIKLAR ================= */
  const habits = () => store.get('habits', []);
  const saveHabits = h => store.set('habits', h);
  const streak = h => { let n = 0, d = Date.now(); if (!h.days[dkey(d)]) d -= DAY; while (h.days[dkey(d)]) { n++; d -= DAY; } return n; };
  function habit(op, name = '') {
    const H = habits(), nm = String(name).trim().replace(/\s+/g, ' ');
    const find = () => H.find(h => fold(h.name) === fold(nm)) || H.find(h => fold(h.name).includes(fold(nm)) || fold(nm).includes(fold(h.name)));
    if (op === 'ekle') { if (!nm) throw Error('Alışkanlık adı gerekli'); if (find()) return `“${nm}” zaten listede.`; H.push({ id: 'h' + Date.now().toString(36), name: nm, days: {}, created: Date.now() }); saveHabits(H); return `✓ Alışkanlık eklendi: ${nm}. Her yaptığında “${nm} yaptım” de; akşam 21:00'de yapılmayanları hatırlatırım.`; }
    if (op === 'yap') { const h = find(); if (!h) return `“${nm}” adlı alışkanlık yok. Eklemek için: “alışkanlık ekle ${nm}”.`; h.days[today()] = 1; saveHabits(H); const s = streak(h); return `✓ ${h.name} — bugün tamam. Seri: ${s} gün${s >= 7 ? ' 🔥' : ''}.`; }
    if (op === 'sil') { const h = find(); if (!h) return 'Bulunamadı.'; saveHabits(H.filter(x => x !== h)); return `“${h.name}” silindi.`; }
    if (!H.length) return 'Henüz alışkanlık yok. Örnek: “alışkanlık ekle 2 litre su”, “alışkanlık ekle 20 dk yürüyüş”.';
    return '✅ ALIŞKANLIKLAR\n' + H.map(h => { const last7 = Array.from({ length: 7 }, (_, i) => h.days[dkey(Date.now() - (6 - i) * DAY)] ? '■' : '□').join(''); return `${h.days[today()] ? '✓' : '○'} ${h.name} — seri ${streak(h)} gün · son 7 gün ${last7}`; }).join('\n');
  }
  function habitNudge() {
    const d = new Date(Date.now() + 3 * 3600000); if (d.getUTCHours() < 21 || store.get('habitNudged') === today() || guest()) return;
    const undone = habits().filter(h => !h.days[today()]); if (!undone.length) return;
    store.set('habitNudged', today()); note('✅ Bugün henüz yapılmayan alışkanlıklar: ' + undone.map(h => h.name).join(', ') + '. Yaptıysan “… yaptım” de.');
  }

  /* ================= 4) ALACAK TAKİBİ ================= */
  const recs = () => store.get('receivables', []);
  const saveRecs = r => store.set('receivables', r);
  const amtOf = s => Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  const due = r => r.tutar - (r.odenen || []).reduce((a, x) => a + x.amt, 0);
  function alacak(op, ad = '', tutar = '', aciklama = '') {
    const R = recs(), p = ad ? pat(ad) : null, name = p?.ad || String(ad).trim();
    const mine = () => R.filter(r => fold(r.ad) === fold(name) && due(r) > 0);
    if (op === 'ekle') { const a = amtOf(tutar); if (!name || !(a > 0)) throw Error('Biçim: alacak|ekle|hasta adı|tutar|açıklama'); R.push({ id: 'r' + Date.now().toString(36), ad: name, tel: p?.tel || '', tutar: a, aciklama: String(aciklama).slice(0, 120), t: Date.now(), odenen: [] }); saveRecs(R); return `✓ Alacak kaydedildi: ${name} — ${tl(a)}${aciklama ? ' (' + aciklama + ')' : ''}. Toplam açık alacak: ${tl(R.reduce((x, r) => x + due(r), 0))}.`; }
    if (op === 'ode') {
      let a = amtOf(tutar); const list = mine(); if (!list.length) return `${name || 'Bu kişi'} için açık alacak yok.`;
      const total = list.reduce((x, r) => x + due(r), 0); if (!(a > 0)) a = total;
      let left = a; for (const r of list.sort((x, y) => x.t - y.t)) { const pay = Math.min(left, due(r)); if (pay > 0) { r.odenen.push({ amt: pay, t: Date.now() }); left -= pay; } }
      saveRecs(R);
      try { TOOLS.kasa?.run(['gelir', String(Math.round((a - left) * 100) / 100).replace('.', ','), 'Tahsilat: ' + name]); /* kasa noktayı binlik sayar → ondalık virgülle */ } catch {}
      const rest = mine().reduce((x, r) => x + due(r), 0);
      return `✓ ${name} ${tl(a - left)} ödedi (kasaya gelir yazıldı). ${rest > 0 ? 'Kalan borcu: ' + tl(rest) + '.' : 'Borcu kapandı. ✔'}`;
    }
    if (op === 'hatirlat') {
      const list = mine(); if (!list.length) return { text: `${name} için açık alacak yok.` };
      const rest = list.reduce((x, r) => x + due(r), 0), tel = list[0].tel || p?.tel || '';
      const msg = `Merhaba ${hitap(p || { ad: name }) || name}, ${brand()} olarak geçmiş olsun dileklerimizi iletiriz. Hesabınızda ${tl(rest)} tutarında ödeme görünüyor. Uygun olduğunuzda kliniğimize ya da IBAN ile ödeyebilirsiniz. Sağlıklı günler dileriz.`;
      return { text: `${name}: kalan ${tl(rest)}. Nazik hatırlatma mesajı hazır${tel ? '' : ' (telefon kayıtlı değil — WhatsApp’ta kişiyi seçersin)'}.`, links: [{ url: wa(tel, msg), title: `💬 ${name} — ödeme hatırlatması (WhatsApp)` }] };
    }
    const open = R.filter(r => due(r) > 0).sort((a, b) => a.t - b.t);
    if (!open.length) return '💰 Açık alacak yok.';
    const byName = {}; for (const r of open) (byName[r.ad] ||= []).push(r);
    return `💰 AÇIK ALACAKLAR — toplam ${tl(open.reduce((x, r) => x + due(r), 0))}\n` + Object.entries(byName).map(([n, rs]) => `• ${n}: ${tl(rs.reduce((x, r) => x + due(r), 0))} (en eskisi ${Math.round((Date.now() - rs[0].t) / DAY)} gün önce${rs[0].aciklama ? ' · ' + rs[0].aciklama : ''})`).join('\n') + '\nHatırlatmak için: “Ali’ye ödeme hatırlat”.';
  }

  /* ================= 5) GOOGLE YORUM İSTEĞİ ================= */
  function review(ad) {
    const link = store.get('set.reviewLink', '');
    if (!/^https:\/\//.test(link)) return { text: 'Önce Google yorum bağlantını kaydet: Google Haritalar’da işletmeni aç → “Yorum iste / Profili paylaş” → bağlantıyı kopyala → Satürn’e “yorum linki: https://g.page/r/…” de. (Bir kez yeterli.)' };
    const p = pat(ad); if (!p) return { text: `“${ad}” adlı hasta bulunamadı.` };
    const msg = `Merhaba ${hitap(p) || p.ad}, ${brand()} olarak tedavinizde size eşlik etmek bizim için mutluluktu. Deneyiminizi Google’da birkaç cümleyle paylaşırsanız başka hastalarımıza çok yardımcı olur: ${link} — Teşekkür ederiz, sağlıklı günler!`;
    p.yorumIstendi = Date.now(); try { savePatients(); } catch {}
    return { text: `${p.ad} için yorum isteği hazır.`, links: [{ url: wa(p.tel, msg), title: `⭐ ${p.ad} — Google yorum isteği (WhatsApp)` }] };
  }

  /* ================= 6) QR KOD ================= */
  function qrPayload(kind, a = '', b = '') {
    const esc = s => String(s).replace(/([\\;,:"])/g, '\\$1');
    if (/^wifi$/i.test(kind)) return `WIFI:T:WPA;S:${esc(a)};P:${esc(b)};;`;
    if (/^(kartvizit|vcard)$/i.test(kind)) return `BEGIN:VCARD\nVERSION:3.0\nN:${a};;;\nFN:${a}\nORG:${brand()}\nTEL;TYPE=CELL:${b || store.get('set.brandContact', '')}\nEND:VCARD`;
    if (/^yorum$/i.test(kind)) { const l = store.get('set.reviewLink', ''); if (!l) throw Error('Önce “yorum linki: https://…” ile Google yorum bağlantını kaydet'); return l; }
    return [kind, a, b].filter(Boolean).join(' ');
  }
  function qr(kind, a, b) {
    const data = qrPayload(kind, a, b); if (!data.trim()) throw Error('QR için metin gerekli');
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(data)}`;
    const alt = `https://quickchart.io/qr?size=600&margin=2&text=${encodeURIComponent(data)}`;
    const n = bubble('ai', `🔳 QR kod hazır (${/^wifi$/i.test(kind) ? 'Wi-Fi: ' + a : /^yorum$/i.test(kind) ? 'Google yorum bağlantısı' : /^(kartvizit|vcard)$/i.test(kind) ? 'kartvizit' : 'metin'}). Basılı olarak tezgâha/duvara koyabilirsin.`);
    const img = el('img', { src, alt: 'QR kod', style: 'width:240px;max-width:100%;background:#fff;padding:8px;border-radius:8px', onerror: () => { if (img.src !== alt) img.src = alt; } });
    n.el.append(el('div', { class: 'tool' }, img, el('a', { href: src, target: '_blank', rel: 'noopener', class: 'btn ghost' }, '⬇ Büyük boy aç / kaydet')));
    return 'QR kod oluşturuldu.';
  }

  /* ================= 7) KLİNİK BELGELERİ (şablon, yerel) ================= */
  const DOCS = {
    onam: { t: 'Fizik Tedavi Aydınlatılmış Onam Formu', b: p => `<p>Sayın <b>${p}</b>,</p><p>${brand()} bünyesinde size uygulanacak fizik tedavi ve rehabilitasyon programı; elektroterapi (TENS, ultrason vb.), sıcak/soğuk uygulamalar, manuel terapi, egzersiz ve gerektiğinde kinezyo bantlama yöntemlerinden oluşabilir.</p><p><b>Beklenen yararlar:</b> ağrının azalması, hareket açıklığının ve kas kuvvetinin artması, günlük yaşam aktivitelerinde kolaylık.</p><p><b>Olası yan etkiler:</b> uygulama sonrası geçici kas ağrısı, yorgunluk, ciltte kızarıklık; nadiren bant/elektrot kaynaklı cilt hassasiyeti. Kalp pili, gebelik, aktif enfeksiyon, açık yara, kanser öyküsü, metal implant veya ciltte duyu kaybı varsa lütfen terapistinize bildiriniz.</p><p><b>Alternatifler:</b> yalnız ev egzersiz programı, ilaç tedavisi veya doktorunuzun önereceği diğer yöntemler.</p><p>Tedaviyi istediğiniz zaman bırakma hakkınız vardır. Sorularınız tarafıma yanıtlanmış, bilgilendirme anlaşılır biçimde yapılmıştır.</p><p>Yukarıdaki bilgileri okudum, anladım; tedavinin uygulanmasını kabul ediyorum.</p>`, sign: true },
    kvkk: { t: 'Kişisel Verilerin Korunması — Aydınlatma Metni', b: p => `<p>${brand()} olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla, <b>${p}</b> adlı hastamızın kimlik, iletişim ve sağlık verilerini; tedavi hizmetinin planlanması ve yürütülmesi, randevu ve iletişim süreçleri ile yasal yükümlülüklerin yerine getirilmesi amacıyla işlemekteyiz.</p><p>Sağlık verileriniz, Kanun’un 6. maddesi uyarınca kamu sağlığının korunması, tıbbi teşhis ve tedavi hizmetlerinin yürütülmesi amacıyla, sır saklama yükümlülüğü altındaki kişilerce işlenir; yasal zorunluluklar dışında üçüncü kişilerle paylaşılmaz.</p><p>Kanun’un 11. maddesi gereğince verilerinize ilişkin bilgi talep etme, düzeltme, silinmesini isteme ve itiraz haklarınızı kliniğimize yazılı olarak başvurarak kullanabilirsiniz.</p><p>Aydınlatma metnini okudum ve anladım.</p>`, sign: true },
    bilgilendirme: { t: 'Hasta Bilgilendirme ve Seans Kuralları', b: p => `<p>Sayın <b>${p}</b>, tedavinizden en iyi sonucu almanız için:</p><ul><li>Seanslara rahat kıyafetle ve randevu saatinden 5 dakika önce gelin.</li><li>Gelemeyecekseniz en az 3 saat önce haber verin; seansınızı başka güne alalım.</li><li>Size verilen ev egzersizlerini her gün, ağrı sınırını aşmadan düzenli yapın — iyileşmenin yarısı evde olur.</li><li>Ağrınızda belirgin artış, uyuşma, güç kaybı veya ateş olursa seansı beklemeden bize ve doktorunuza bildirin.</li><li>Seans sonrası hafif yorgunluk ve kas ağrısı normaldir; 24 saat içinde geçer.</li><li>Kullandığınız ilaçlarda değişiklik olursa terapistinize söyleyin.</li></ul><p>Sorularınız için bize her zaman ulaşabilirsiniz${store.get('set.brandContact', '') ? ': ' + store.get('set.brandContact', '') : ''}.</p>` },
    randevu: { t: 'Randevu Kartı', b: (p, extra) => `<p><b>${p}</b></p><p style="font-size:20px">📅 ${extra || '……… / ……… / 20……  saat ……:……'}</p><p>Lütfen randevunuzdan 5 dakika önce geliniz. Gelemeyecekseniz en az 3 saat önce haber veriniz.</p>${store.get('set.brandContact', '') ? `<p>☎ ${store.get('set.brandContact', '')}</p>` : ''}` }
  };
  function doc(kind, ad = '', extra = '') {
    const k = Object.keys(DOCS).find(x => fold(kind).includes(x)) || (/onay/.test(fold(kind)) ? 'onam' : /kisisel|veri|aydinlatma/.test(fold(kind)) ? 'kvkk' : /kural|bilgi/.test(fold(kind)) ? 'bilgilendirme' : null);
    if (!k) return 'Belge türleri: onam formu, KVKK aydınlatma metni, hasta bilgilendirme, randevu kartı. Örnek: “Ayşe Yılmaz için onam formu hazırla”.';
    const p = ad ? pat(ad) : null, name = p?.ad || String(ad || '').trim() || '……………………………';
    if (k === 'randevu' && !extra && p) { const nx = items.filter(i => i.kind === 'task' && !i.done && i.due && i.due >= isoLocal(now()) && fold(i.text).includes(fold(p.ad.split(' ')[0]))).sort((a, b) => a.due.localeCompare(b.due))[0]; if (nx) extra = new Date(nx.due).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }); }
    const D = DOCS[k];
    const body = `<header>${brand().toUpperCase()}</header><h1>${D.t}</h1>${D.b(name, extra)}${D.sign ? `<p>Tarih: ${new Date().toLocaleDateString('tr-TR')}</p><div class="sig"><div>Hasta / Yasal temsilci<br>Ad Soyad – İmza</div><div>Fizyoterapist<br>Ad Soyad – İmza</div></div>` : ''}<footer>Bu belge ${brand()} için hazırlanmış şablondur; mevzuat değişikliklerine göre gözden geçiriniz.</footer>`;
    const css = 'font:15px/1.55 Georgia,serif;color:#111;max-width:720px;margin:0 auto;padding:20px';
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${D.t}</title><style>body{${css}}h1{font-size:20px;text-align:center}header{text-align:center;font:600 13px system-ui;color:#0e7c86;border-bottom:2px solid #0e7c86;padding-bottom:8px}.sig{display:flex;gap:24px;margin-top:40px}.sig div{flex:1;border-top:1px solid #333;padding-top:6px;font:13px system-ui}footer{margin-top:28px;font:11px system-ui;color:#666;text-align:center}</style></head><body>${body}</body></html>`;
    lastDoc = { t: D.t, html, body };
    const n = bubble('ai', `📄 ${D.t} hazır${p ? ' — ' + p.ad : ''}. “Belgeyi aç” → Yazdır (PDF olarak da kaydedilir) ya da Paylaş. Hasta adı yalnız bu telefonda işlendi.`);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'btn', onclick: () => openDoc({ t: D.t, html, body }) }, '📄 Belgeyi aç / yazdır')));
    return `${D.t} hazırlandı.`;
  }

  // uygulama içinde tam ekran belge görünümü; yazdırırken yalnız belge basılır (iPhone ana ekran uygulamasında da çalışır)
  let lastDoc = null;
  const pst = document.createElement('style');
  pst.textContent = '#docView{position:fixed;inset:0;z-index:200;background:#fff;color:#111;overflow:auto;-webkit-overflow-scrolling:touch}#docView .bar{position:sticky;top:0;display:flex;gap:8px;padding:10px 12px calc(10px);padding-top:calc(10px + env(safe-area-inset-top));background:#0e7c86}#docView .bar button{flex:1;padding:10px;border:0;border-radius:8px;font:600 14px system-ui;background:#fff;color:#0e7c86}#docView .page{font:15px/1.55 Georgia,serif;max-width:720px;margin:0 auto;padding:20px 20px 60px}#docView h1{font-size:20px;text-align:center;color:#111}#docView header{text-align:center;font:600 13px system-ui;letter-spacing:.08em;color:#0e7c86;border-bottom:2px solid #0e7c86;padding-bottom:8px}#docView .sig{display:flex;gap:24px;margin-top:40px}#docView .sig div{flex:1;border-top:1px solid #333;padding-top:6px;font:13px system-ui}#docView footer{margin-top:28px;font:11px system-ui;color:#666;text-align:center}@media print{body>*:not(#docView){display:none!important}#docView{position:static;overflow:visible}#docView .bar{display:none}}';
  document.head.append(pst);
  function openDoc(d) {
    document.getElementById('docView')?.remove();
    const page = el('div', { class: 'page' }); page.innerHTML = d.body;
    const v = el('div', { id: 'docView', role: 'dialog', 'aria-label': d.t },
      el('div', { class: 'bar' },
        el('button', { type: 'button', onclick: () => window.print() }, '🖨 Yazdır / PDF'),
        el('button', { type: 'button', onclick: async () => { const f = new File([d.html], d.t + '.html', { type: 'text/html' }); try { if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: d.t }); else await navigator.share({ title: d.t, text: page.innerText }); } catch {} } }, '📤 Paylaş'),
        el('button', { type: 'button', onclick: () => v.remove() }, '✕ Kapat')),
      page);
    document.body.append(v);
    return v;
  }

  /* ================= 8) HAFTALIK ÖZET ================= */
  function weekly() {
    const t0 = Date.now() - 7 * DAY, P = typeof patients !== 'undefined' ? patients : [];
    const ses = P.reduce((a, p) => a + (p.seanslar || []).filter(s => s.t >= t0).length, 0), yeni = P.filter(p => p.created >= t0).length;
    const led = store.get('ledger', []).filter(x => new Date(x.d).getTime() >= t0 - DAY);
    const g = led.filter(x => x.type === 'gelir').reduce((a, x) => a + x.amt, 0), c = led.filter(x => x.type === 'gider').reduce((a, x) => a + x.amt, 0);
    const al = recs().reduce((a, r) => a + due(r), 0);
    const fl = focusLog(), fm = Object.entries(fl).filter(([d]) => new Date(d).getTime() >= t0 - DAY).reduce((a, [, m]) => a + m, 0);
    const H = habits().map(h => `${h.name} ${Object.keys(h.days).filter(d => new Date(d).getTime() >= t0 - DAY).length}/7`);
    const nextW = items.filter(i => i.kind === 'task' && !i.done && i.due && i.due >= isoLocal(now()) && new Date(i.due) - Date.now() < 7 * DAY).length;
    const lateN = items.filter(i => i.kind === 'task' && !i.done && typeof isLate === 'function' && isLate(i)).length;
    return [`📊 HAFTALIK ÖZET — ${new Date(t0).toLocaleDateString('tr-TR')} – ${new Date().toLocaleDateString('tr-TR')}`,
      `Klinik: ${ses} seans · ${yeni} yeni hasta`,
      `Kasa: gelir ${tl(g)} · gider ${tl(c)} · net ${tl(g - c)}`,
      `Açık alacak: ${tl(al)}`,
      `Odak: ${fm} dakika${H.length ? ' · Alışkanlıklar: ' + H.join(', ') : ''}`,
      `Gelecek 7 gün: ${nextW} randevu/görev${lateN ? ` · ⚠ ${lateN} gecikmiş görev` : ''}`,
      '\nÖnerim: ' + (lateN ? 'pazartesi sabahı gecikmiş işleri “günü planla” ile ilk bloklara koy. ' : '') + (al > 0 ? '“alacaklar” listesinden en eski borca nazik hatırlatma gönder. ' : '') + (ses && !P.some(p => p.yorumIstendi && p.yorumIstendi >= t0) ? 'Tedavisi biten bir hastadan Google yorumu iste (“yorum iste …”).' : 'Haftaya güçlü başla!')].join('\n');
  }
  function weeklyAuto() {
    const d = new Date(Date.now() + 3 * 3600000), wk = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 || d.getUTCHours() < 20 || store.get('weeklyDone') === wk || guest() || document.hidden) return;
    store.set('weeklyDone', wk); const t = weekly(); show(t);
    if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(t.split('\n').slice(1, 4).join(' · '), { title: 'SATÜRN haftalık özet', tags: 'bar_chart' }).catch?.(() => {});
  }
  setInterval(() => { habitNudge(); weeklyAuto(); }, 10 * 60000);
  setTimeout(() => { habitNudge(); weeklyAuto(); }, 60000);

  /* ================= 9) PDF ÖZETİ ================= */
  const pdfIn = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  document.body.append(pdfIn);
  async function pdfSummary(file, q = '') {
    if (!file) throw Error('PDF seçilmedi');
    if (file.size > 18 * 1024 * 1024) throw Error('PDF çok büyük (en çok 18 MB)');
    const key = (() => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } })(); if (!key) throw Error('Gemini anahtarı gerekli');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const prompt = (q ? `Soru: ${q}\nÖnce bu soruyu belgeye dayanarak yanıtla, sonra özetle.\n` : '') + 'Bu PDF belgesini TÜRKÇE özetle. Biçim:\nKISA ÖZET (2-3 cümle)\nANA NOKTALAR (madde madde, en çok 8)\nÖNEMLİ RAKAMLAR/TARİHLER\nYAPILACAKLAR / DİKKAT EDİLECEKLER\nBelgede olmayan bilgi ekleme.';
    let last = '';
    for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite']) {
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: b64 } }, { text: prompt }] }] }) }), 90000, 'zaman aşımı');
        if (!r.ok) { last = m + ': HTTP ' + r.status; continue; }
        const raw = await r.text(); // düz JSON ya da akış (data: …) biçimi — ikisi de okunur
        const objs = /^\s*data:/.test(raw) ? raw.split(/\n/).filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean) : [JSON.parse(raw)];
        const t = objs.flatMap(o => o.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (t) return t;
        last = 'boş yanıt';
      } catch (e) { last = e.message; }
    }
    throw Error('PDF özetlenemedi (' + last + ')');
  }
  function pdfCard(q = '') {
    const n = bubble('ai', '📑 PDF ÖZETİ — dosyayı seç; ana fikri, maddeleri, rakamları ve yapılacakları çıkarayım.' + (q ? ' Sorun: ' + q : ''));
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { pdfIn.onchange = async () => { const f = pdfIn.files[0]; pdfIn.value = ''; if (!f) return; setPhase('thinking', 'PDF okunuyor: ' + f.name); try { const t = await pdfSummary(f, q); show('📑 ' + f.name + '\n\n' + t); } catch (e) { note(e.message); } finally { setPhase('idle', 'Hazır.'); } }; pdfIn.click(); } }, '📑 PDF seç')));
    return 'PDF seçme kartı açıldı.';
  }

  /* ================= panel (GÖREV sekmesi) ================= */
  const box = el('div', { id: 'uretkenBox' });
  const qb = (lab, fn) => el('button', { type: 'button', class: 'btn ghost', onclick: () => { $('drawer')?.classList.remove('open'); try { const r = fn(); if (typeof r === 'string') show(r); else if (r?.text) show(r.text, r.links); } catch (e) { note(e.message); } } }, lab);
  box.append(el('h3', {}, 'ÜRETKEN'), el('p', { class: 'muted' }, 'Günü planla, odaklan, alışkanlık ve alacak takibi, klinik belgeleri, QR, PDF özeti — internetsiz ve ücretsiz.'),
    el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
      qb('🗓 Günü planla', () => plan()), qb('🎯 Odak 25 dk', () => focusStart(25, 4)), qb('✅ Alışkanlıklar', () => habit('liste')), qb('💰 Alacaklar', () => alacak('liste')),
      qb('📊 Haftalık özet', weekly), qb('📄 Onam formu', () => doc('onam')), qb('📑 PDF özetle', () => pdfCard())),
    el('div', { class: 'field' }, el('label', { for: 'reviewLink' }, 'Google yorum bağlantısı (yorum isteği ve QR için)'), (() => { const i = el('input', { id: 'reviewLink', placeholder: 'https://g.page/r/…', inputmode: 'url' }); i.value = store.get('set.reviewLink', ''); i.onchange = () => store.set('set.reviewLink', i.value.trim()); return i; })()),
    el('div', { class: 'field' }, el('label', { for: 'workStart' }, 'Mesai (günü planla için)'), (() => { const w = el('div', { class: 'row' }); for (const [id, d] of [['workStart', '09:00'], ['lunch', '12:30'], ['workEnd', '19:00']]) { const i = el('input', { id, type: 'time', value: store.get('set.' + id, d), style: 'flex:1' }); i.onchange = () => store.set('set.' + id, i.value); w.append(i); } return w; })()));
  ($('p-tasks') || $('p-settings'))?.append(box);

  /* ================= araçlar ================= */
  const res = r => (typeof r === 'string' ? r : r.text + (r.links?.length ? '\n' + r.links.map(l => l.title + ': ' + l.url).join('\n') : ''));
  Object.assign(TOOLS, {
    gunu_planla: { d: 'gunu_planla|YYYY-MM-DD (boş: bugün) — randevuları sabitleyip açık işleri önceliğe göre saat bloklarına yerleştirir', run: ([d]) => plan(/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : today()) },
    odak: { d: 'odak|başlat|dakika|döngü|etiket · odak|dur · odak|durum — Pomodoro odak oturumu', run: ([op, a, b, c]) => /dur|bitir/i.test(op || '') ? focusStop() : /durum/i.test(op || '') ? focusStatus() : focusStart(a, b, c) },
    aliskanlik: { d: 'aliskanlik|ekle/yap/sil/liste|ad — alışkanlık ve seri takibi', run: ([op, n]) => habit(fold(op || 'liste'), n) },
    alacak: { d: 'alacak|ekle|ad|tutar|açıklama · alacak|ode|ad|tutar · alacak|hatirlat|ad · alacak|liste — hasta borç/tahsilat takibi (ödeme kasaya gelir yazılır)', run: ([op, a, b, c]) => res(alacak(fold(op || 'liste').replace('ö', 'o'), a, b, c)) },
    yorum_iste: { d: 'yorum_iste|hasta adı — Google yorum isteği WhatsApp mesajı', run: ([a]) => res(review(a)) },
    qr: { d: 'qr|metin · qr|wifi|ağ adı|şifre · qr|kartvizit|ad|telefon · qr|yorum — QR kod görseli', run: ([k, a, b]) => qr(k, a, b) },
    belge: { d: 'belge|onam/kvkk/bilgilendirme/randevu|hasta adı|ek bilgi — yazdırılabilir klinik belgesi (yerel şablon)', run: ([k, a, b]) => doc(k || '', a, b) },
    haftalik_ozet: { d: 'haftalik_ozet — son 7 gün: seans, kasa, alacak, odak, alışkanlık, gelecek hafta', run: () => weekly() },
    pdf_ozet: { d: 'pdf_ozet|soru (isteğe bağlı) — PDF seçme kartı açar ve özetler', run: ([q]) => pdfCard(q) }
  });
  WRITE_TOOLS.add('alacak');
  TOOL_GROUPS.push([/plan|gün|odak|pomodoro|alışkan|seri|alacak|borç|ödedi|tahsil|yorum|qr|karekod|belge|onam|kvkk|form|randevu kartı|haftalık|pdf/i, /^(gunu_planla|odak|aliskanlik|alacak|yorum_iste|qr|belge|haftalik_ozet|pdf_ozet)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nÜRETKEN: günü planla → gunu_planla; odak/pomodoro → odak; alışkanlık → aliskanlik; hasta borcu/tahsilat → alacak; Google yorumu → yorum_iste; QR → qr; onam/KVKK/bilgilendirme/randevu kartı → belge; haftalık özet → haftalik_ozet; PDF → pdf_ozet.';

  /* ================= doğal dil komutları ================= */
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''); let m;
    const out = r => { if (typeof r === 'string') return r; setTimeout(() => show(r.text, r.links), 20); return r.text; };
    if (guest()) return _lc(text0);
    if (/^(günümü|günü|bugünü|yarını) planla$|^gün planı$|^bugün ne yapayım$/i.test(t)) return plan(/yarın/i.test(t) ? isoLocal(new Date(Date.now() + DAY)).slice(0, 10) : today());
    if ((m = t.match(/^(?:odak|pomodoro)(?: (?:başlat|modu))?(?: (\d{1,3}))?(?: dk| dakika)?$/i))) return focusStart(m[1] || 25, 4);
    if (/^(odak|pomodoro) (dur|bitir|kapat)$/i.test(t)) return focusStop();
    if (/^(odak|pomodoro) durumu?$|^bugün ne kadar odaklandım$/i.test(t)) return focusStatus();
    if ((m = t.match(/^alışkanlık ekle (.{2,60})$/i))) return habit('ekle', m[1]);
    if ((m = t.match(/^alışkanlık sil (.{2,60})$/i))) return habit('sil', m[1]);
    if (/^(alışkanlıklarım|alışkanlıklar|serilerim)$/i.test(t)) return habit('liste');
    if ((m = t.match(/^(.{2,40}?) (?:yaptım|tamamladım|içtim|okudum|yürüdüm)$/i)) && habits().some(h => fold(h.name).includes(fold(m[1])) || fold(m[1]).includes(fold(h.name)))) return habit('yap', m[1]);
    if ((m = t.match(/^(.{2,40}?)(?:'(?:n|nin|nın|nun|nün|in|ın|un|ün))? (\d[\d.,]*) ?(?:tl|lira|₺) borcu (?:var|kaldı)(?: (.{0,60}))?$/i))) return alacak('ekle', m[1], m[2], m[3] || '');
    if ((m = t.match(/^(.{2,40}?) (\d[\d.,]*) ?(?:tl|lira|₺)? ?ödedi$/i))) return alacak('ode', m[1], m[2]);
    if ((m = t.match(/^(.{2,40}?) (?:borcunu|hepsini) ödedi$/i))) return alacak('ode', m[1], '');
    if (/^(alacaklar|alacaklarım|borçlular|kim borçlu)$/i.test(t)) return alacak('liste');
    if ((m = t.match(/^(.{2,40}?)(?:'?(?:a|e|ya|ye))? (?:ödeme|borç) hatırlat$/i))) return out(alacak('hatirlat', m[1]));
    if ((m = t.match(/^yorum (?:linki|bağlantısı)[: ]+(https:\/\/\S+)$/i))) { store.set('set.reviewLink', m[1]); return '✓ Google yorum bağlantısı kaydedildi. Artık “yorum iste Ayşe Yılmaz” ve “yorum QR” kullanabilirsin.'; }
    if ((m = t.match(/^(?:yorum iste|google yorumu iste) (.{2,40})$/i)) || (m = t.match(/^(.{2,40}?)(?:'?(?:dan|den|tan|ten))? yorum iste$/i))) return out(review(m[1]));
    if ((m = t.match(/^(?:wifi|wi-fi) qr (\S+) (\S+)$/i))) return qr('wifi', m[1], m[2]);
    if (/^(yorum qr|qr yorum)$/i.test(t)) return qr('yorum');
    if ((m = t.match(/^qr(?: kod)?[: ]+(.{1,300})$/i))) return qr(m[1]);
    if ((m = t.match(/^(?:(.{2,40}?) için )?(onam formu|kvkk(?: aydınlatma)?(?: metni)?|aydınlatma metni|bilgilendirme(?: formu)?|seans kuralları|randevu kartı)(?: hazırla| oluştur| yap)?$/i))) return doc(m[2], m[1] || '');
    if (/^(haftalık özet|haftanın özeti|bu hafta nasıl geçti)$/i.test(t)) return weekly();
    if (/^(pdf özetle|pdf oku|pdf özeti|belge özetle)$/i.test(t)) return pdfCard();
    if (/^(neler yapabilirsin|üretken araçlar|yeni özellikler)$/i.test(t)) return '🚀 ÜRETKEN ARAÇLAR\n• “günümü planla” — randevular + işler saat bloklarına\n• “odak başlat” / “odak 50” — Pomodoro\n• “alışkanlık ekle 2 litre su” → “su içtim”\n• “Ali Kaya’nın 1500 TL borcu var” → “Ali Kaya 500 ödedi” → “alacaklar”\n• “yorum iste Ayşe Yılmaz” (önce “yorum linki: https://…”)\n• “qr: metin”, “wifi qr AğAdı Şifre”, “yorum qr”\n• “Ayşe Yılmaz için onam formu”, “KVKK aydınlatma metni”, “randevu kartı”\n• “haftalık özet” (pazar 20:00’de kendiliğinden)\n• “pdf özetle”\nPratik günlük araçlar için: “günlük araçlar” ve “pratik araçlar”. Ayrıca: haftalık nicel seçim, tahmin, derin araştırma, görsel/tasarım, klinik araçları, sistem taraması…';
    return _lc(text0);
  };
  window.jarvisUretken = { openDoc, lastDoc: () => lastDoc, plan, focusStart, focusStop, focusStatus, habit, streak, alacak, review, qr, qrPayload, doc, weekly, pdfSummary, pdfCard, F };
})();
