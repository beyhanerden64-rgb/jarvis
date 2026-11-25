'use strict';
/* SATÜRN 27 — KLİNİK ÜRETKENLİK (7 özellik)
 *  1) gonyometre       — fotoğraftan eklem açısı: 3 noktaya dokun → açı (yerel hesap, internet gerekmez); hasta dosyasına kaydeder
 *  2) postur_analizi   — yan/ön fotoğrafta işaret noktalarına dokun → baş öne tilt (KVA), omuz/pelvis eğimi, çekül sapmaları; rapor
 *  3) cihaz_zamanlayici— çoklu yatak/cihaz zamanlayıcısı (TENS, sıcak paket, ultrason…), bitince sesli + titreşimli uyarı, yenilemede kaybolmaz
 *  4) sesli_koc        — ev programını sesli yöneten koç: hareketi anlatır, tekrar sayar, set arası dinlenme sayar (cihaz sesi, kotasız)
 *  5) epikriz          — tedavi sonu raporu: tanı, seans sayısı, ilk/son ağrı, ölçümler, ev programı, öneriler — yazdırılabilir
 *  6) bekleme_listesi  — iptal olan saat için bekleme listesindeki uygun hastaları bulur, hazır WhatsApp mesajıyla çağırır
 *  7) isletme_analizi  — 90 günlük işletme göstergeleri: aylık gelir eğilimi, seans başı gelir, tekrar gelme ve bırakma oranı, öneriler */
(() => {
  const DAY = 86400000, P = () => (typeof patients !== 'undefined' ? patients : []);
  const show = t => { const b = bubble('ai', t); try { answerTools(b.el, t); } catch {} return b; };
  const findP = q => (typeof findPatient === 'function' ? findPatient(q) : null);
  const needP = q => { const p = q && findP(q); if (!p) throw Error(q ? `“${q}” adlı hasta bulunamadı.` : 'Hasta adı gerekli.'); return p; };
  const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
  const dTR = t => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  function overlay(title, ...kids) {
    document.querySelector('.satov')?.remove();
    const card = el('div', { class: 'sfcard', style: 'width:min(96vw,720px);max-height:92vh;overflow:auto' }, el('h4', {}, title), ...kids);
    const box = el('div', { class: 'camera skillform satov' }, card);
    const close = () => { box.remove(); box.onclose?.(); };
    card.append(el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Kapat')));
    box.onclick = e => { if (e.target === box) close(); };
    document.body.append(box); return { box, card, close };
  }
  const speakTR = (t, rate = 1) => new Promise(res => { try { const s = window.speechSynthesis; if (!s) return res(); const u = new SpeechSynthesisUtterance(t); u.lang = 'tr-TR'; u.rate = rate; const v = s.getVoices().find(v => /^tr/i.test(v.lang)); if (v) u.voice = v; u.onend = u.onerror = () => res(); s.speak(u); setTimeout(res, 2500 + t.length * 120); } catch { res(); } });
  const beep = (f = 880, ms = 250) => { try { const C = window.jarvisAudioCtx || (window.jarvisAudioCtx = new (window.AudioContext || window.webkitAudioContext)()); const o = C.createOscillator(), g = C.createGain(); o.frequency.value = f; o.connect(g); g.connect(C.destination); g.gain.value = 0.2; o.start(); o.stop(C.currentTime + ms / 1000); } catch {} };
  const addMeasure = (p, m) => { (p.olcumler ||= []).push({ t: Date.now(), ...m }); p.olcumler = p.olcumler.slice(-200); if (typeof savePatients === 'function') savePatients(); };

  /* ---------- foto + dokunma noktaları (gonyometre ve postür ortak) ---------- */
  function photoPicker(onImg) {
    const f = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
    f.onchange = () => { const file = f.files?.[0]; if (!file) return; const img = new Image(); img.onload = () => onImg(img); img.src = URL.createObjectURL(file); };
    return f;
  }
  function tapCanvas(img, labels, onDone, draw) {
    const W = Math.min(680, img.width), k = W / img.width, c = el('canvas', { width: W, height: Math.round(img.height * k), style: 'width:100%;touch-action:none;border-radius:8px;cursor:crosshair' });
    const ctx = c.getContext('2d'), pts = [], hint = el('p', { class: 'muted' });
    const paint = () => { ctx.drawImage(img, 0, 0, c.width, c.height); ctx.lineWidth = 3; ctx.strokeStyle = '#5fe0ea'; ctx.fillStyle = '#ff4d4d'; ctx.font = '600 14px system-ui';
      pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), p[0] + 8, p[1] - 8); ctx.fillStyle = '#ff4d4d'; });
      draw?.(ctx, pts, c); hint.textContent = pts.length < labels.length ? `${pts.length + 1}/${labels.length}: ${labels[pts.length]} noktasına dokun` : '✓ Tüm noktalar işaretlendi (yanlışsa “Geri al”).'; };
    c.addEventListener('pointerdown', e => { if (pts.length >= labels.length) return; const r = c.getBoundingClientRect(); pts.push([(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]); paint(); if (pts.length === labels.length) onDone(pts, c); });
    const undo = el('button', { type: 'button', class: 'btn ghost', onclick: () => { pts.pop(); paint(); onDone(null); } }, '↶ Geri al');
    img.decode?.().catch(() => {}).finally?.(paint); setTimeout(paint, 50);
    return el('div', {}, hint, c, el('div', { class: 'row' }, undo));
  }
  const angAt = (a, v, b) => { const x1 = a[0] - v[0], y1 = a[1] - v[1], x2 = b[0] - v[0], y2 = b[1] - v[1]; return Math.acos(Math.max(-1, Math.min(1, (x1 * x2 + y1 * y2) / (Math.hypot(x1, y1) * Math.hypot(x2, y2))))) * 180 / Math.PI; };
  const tiltDeg = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; // ekranda y aşağı

  /* ================= 1) GONYOMETRE ================= */
  const NORM = { 'diz fleksiyon': [0, 135], 'diz ekstansiyon': [0, 0], 'kalça fleksiyon': [0, 120], 'omuz fleksiyon': [0, 180], 'omuz abdüksiyon': [0, 180], 'dirsek fleksiyon': [0, 150], 'ayak bileği dorsifleksiyon': [0, 20], 'ayak bileği plantar fleksiyon': [0, 50], 'el bileği fleksiyon': [0, 80], 'el bileği ekstansiyon': [0, 70], 'boyun fleksiyon': [0, 50], 'gövde fleksiyon': [0, 80] };
  // gonyometre kuralı: omuzda sabit kol gövde boyunca aşağı → okuma = iç açı; ayak bileğinde nötr 90° → |90−iç açı|; diğerlerinde nötr düz uzuv (180°) → 180−iç açı
  const motion = (j, inner) => /^omuz/.test(j) ? inner : /ayak bileği/.test(j) ? Math.abs(90 - inner) : 180 - inner;
  function goniometer(patientQ, jointQ) {
    const res = el('div', { class: 'muted', style: 'font-size:1.05em' }, 'Fotoğrafı seç; sonra sırayla: 1) sabit kol (proksimal segment; omuzda gövde boyunca kalçaya doğru), 2) eklem merkezi (pivot), 3) hareketli kol (distal segment).');
    const jSel = el('select', {}, ...Object.keys(NORM).map(k => new Option(k, k))); if (jointQ) { const m = Object.keys(NORM).find(k => fold(k).includes(fold(jointQ))); if (m) jSel.value = m; }
    const side = el('select', {}, new Option('sağ', 'sağ'), new Option('sol', 'sol'));
    const pIn = el('input', { placeholder: 'Hasta adı (kaydetmek için, isteğe bağlı)' }); pIn.value = patientQ || '';
    const area = el('div', {}); let last = null;
    const pick = photoPicker(img => area.replaceChildren(tapCanvas(img, ['proksimal', 'eklem merkezi', 'distal'], pts => {
      if (!pts) { last = null; res.textContent = '…'; return; }
      const inner = angAt(pts[0], pts[1], pts[2]), [lo, hi] = NORM[jSel.value];
      last = Math.round(motion(jSel.value, inner));
      res.textContent = `📐 İç açı ${inner.toFixed(1)}° · ölçülen hareket ≈ ${last}° (${jSel.value}, ${side.value}) · normal aralık ${lo}–${hi}°${hi ? ` · %${Math.round(last / hi * 100)} (normale göre)` : ''}\nFotoğraf ölçümü ±5° hata payı taşır; kamerayı ekleme dik ve eklem hizasında tut.`;
      res.style.whiteSpace = 'pre-wrap';
    }, (ctx, pts) => { if (pts.length >= 2) { ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); if (pts[2]) ctx.lineTo(...pts[2]); ctx.stroke(); } if (pts.length === 3) { ctx.fillStyle = '#ffe066'; ctx.font = '700 20px system-ui'; ctx.fillText(Math.round(motion(jSel.value, angAt(...pts))) + '°', pts[1][0] + 12, pts[1][1] + 24); } })));
    const save = el('button', { type: 'button', class: 'btn', onclick: () => { if (last == null) return note('Önce 3 noktayı işaretle.'); const p = findP(pIn.value.trim()); if (!p) return note('Hasta bulunamadı — adı kontrol et.'); addMeasure(p, { tur: 'gonyometre', eklem: jSel.value, taraf: side.value, aci: last }); note(`Kaydedildi: ${nm(p)} · ${jSel.value} ${side.value} ${last}°`); } }, '💾 Hastaya kaydet');
    overlay('📐 Fotoğraftan gonyometre', el('div', { class: 'row' }, jSel, side), pIn, el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => pick.click() }, '📷 Fotoğraf çek / seç'), save), pick, area, res);
    return 'Gonyometre açıldı: fotoğraf seç ve 3 noktaya dokun.';
  }

  /* ================= 2) POSTÜR ANALİZİ ================= */
  const SIDE_L = ['kulak (tragus)', 'C7 dikeni', 'omuz (akromion)', 'büyük trokanter (kalça)', 'diz (eklem hizası)', 'dış topuk kemiği (lateral malleol)'];
  const FRONT_L = ['sağ omuz (akromion)', 'sol omuz (akromion)', 'sağ iliak kristal', 'sol iliak kristal', 'sağ diz', 'sol diz'];
  function postureReport(mode, pts) {
    const out = [];
    if (mode === 'yan') {
      const [ear, c7, sh, hip, knee, ank] = pts, hgt = Math.abs(ank[1] - ear[1]) || 1;
      const cva = Math.abs(Math.atan2(c7[1] - ear[1], Math.abs(ear[0] - c7[0])) * 180 / Math.PI);
      out.push(`Kraniovertebral açı (KVA): ${cva.toFixed(1)}° — ${cva >= 50 ? 'normal (≥50°)' : cva >= 45 ? 'hafif baş önde postür' : 'belirgin baş önde postür (<45°)'}`);
      const dev = (p, n) => { const d = (p[0] - ank[0]) / hgt * 100; return `${n} çekül hattının ${Math.abs(d) < 1.5 ? 'üzerinde' : (d > 0 ? 'önünde' : 'arkasında') + ' (%' + Math.abs(d).toFixed(1) + ' boy)'}`; };
      const face = Math.sign(ear[0] - c7[0]) || 1; const dv = p => (p[0] - ank[0]) * face / hgt * 100;
      out.push(dev(ear, 'Kulak'), dev(sh, 'Omuz'), dev(hip, 'Kalça'), dev(knee, 'Diz'));
      if (dv(ear) > 4) out.push('→ Baş öne taşınmış: derin boyun fleksörü (chin tuck), göğüs germe, torakal ekstansiyon önerilir.');
      if (dv(sh) > 3) out.push('→ Omuzlar önde (protraksiyon): kürek kemiği retraksiyonu ve pektoral germe.');
      if (dv(knee) < -2) out.push('→ Diz arkada (hiperekstansiyon eğilimi): quadriseps/hamstring kontrol eğitimi.');
      if (dv(hip) > 3) out.push('→ Pelvis önde (sway-back eğilimi): kalça ekstansör ve karın kası güçlendirme.');
    } else {
      const [rs, ls, ri, li, rk, lk] = pts;
      const t = (a, b) => { const d = tiltDeg(a, b); return Math.abs(d > 90 ? 180 - d : d < -90 ? -180 - d : d); };
      const shT = t(rs, ls), peT = t(ri, li), knT = t(rk, lk);
      const hi = (a, b, n) => Math.abs(a[1] - b[1]) < 3 ? 'eşit' : (a[1] < b[1] ? 'sağ ' + n + ' yüksek' : 'sol ' + n + ' yüksek');
      out.push(`Omuz eğimi: ${shT.toFixed(1)}° (${hi(rs, ls, 'omuz')})${shT > 2 ? ' — belirgin' : ''}`, `Pelvis eğimi: ${peT.toFixed(1)}° (${hi(ri, li, 'pelvis')})${peT > 2 ? ' — belirgin; bacak uzunluk farkı/skolyoz taraması düşün' : ''}`, `Diz hizası: ${knT.toFixed(1)}°`);
      if (shT > 2 && peT > 2 && Math.sign(rs[1] - ls[1]) !== Math.sign(ri[1] - li[1])) out.push('→ Omuz ve pelvis zıt yönlü eğik: skolyoz için Adams öne eğilme testi önerilir.');
    }
    return out.join('\n');
  }
  function posture(patientQ, modeQ) {
    let mode = /on|ön|front/.test(fold(modeQ || '')) ? 'ön' : 'yan';
    const res = el('pre', { class: 'muted', style: 'white-space:pre-wrap;font:inherit' }, 'Kişi ayakta, kollar yanda, tüm vücut kadrajda; kamera bel hizasında ve dik.');
    const mSel = el('select', {}, new Option('Yan görünüm', 'yan'), new Option('Ön görünüm', 'ön')); mSel.value = mode;
    const pIn = el('input', { placeholder: 'Hasta adı (kaydetmek için)' }); pIn.value = patientQ || '';
    const area = el('div', {}); let rep = '';
    const pick = photoPicker(img => { mode = mSel.value; area.replaceChildren(tapCanvas(img, mode === 'yan' ? SIDE_L : FRONT_L, pts => { if (!pts) { rep = ''; res.textContent = '…'; return; } rep = postureReport(mode, pts); res.textContent = '🧍 POSTÜR (' + mode + ')\n' + rep + '\n\nFotoğraf temelli tarama ölçümüdür; klinik muayenenin yerini tutmaz.'; },
      (ctx, pts, c) => { if (mode === 'yan' && pts.length === 6) { ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(pts[5][0], 0); ctx.lineTo(pts[5][0], c.height); ctx.stroke(); ctx.setLineDash([]); } if (mode === 'ön') for (const [a, b] of [[0, 1], [2, 3], [4, 5]]) if (pts[b]) { ctx.beginPath(); ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); ctx.stroke(); } })); });
    const save = el('button', { type: 'button', class: 'btn', onclick: () => { if (!rep) return note('Önce tüm noktaları işaretle.'); const p = findP(pIn.value.trim()); if (!p) return note('Hasta bulunamadı.'); addMeasure(p, { tur: 'postur', gorunum: mode, rapor: rep }); note('Postür raporu ' + nm(p) + ' dosyasına kaydedildi.'); } }, '💾 Hastaya kaydet');
    overlay('🧍 Postür analizi', el('div', { class: 'row' }, mSel, el('button', { type: 'button', class: 'btn', onclick: () => pick.click() }, '📷 Fotoğraf çek / seç'), save), pIn, pick, area, res);
    return 'Postür analizi açıldı.';
  }

  /* ================= 3) CİHAZ ZAMANLAYICILARI ================= */
  const DEV = { tens: ['TENS', 20], 'sıcak paket': ['Sıcak paket', 15], 'soğuk paket': ['Soğuk paket', 10], ultrason: ['Ultrason', 5], vakum: ['Vakum', 10], enterferans: ['Enterferans', 15], lazer: ['Lazer', 5], traksiyon: ['Traksiyon', 15], egzersiz: ['Egzersiz', 30], parafin: ['Parafin', 15] };
  let timers = store.get('devTimers', []).filter(t => t.end > Date.now() - 60000);
  const saveT = () => store.set('devTimers', timers);
  function tStart(devQ, minQ, label) {
    const k = Object.keys(DEV).find(x => fold(devQ || '').includes(fold(x))) || null;
    const name = k ? DEV[k][0] : (devQ || 'Zamanlayıcı'), min = Number(String(minQ || '').replace(',', '.')) || (k ? DEV[k][1] : 10);
    if (!(min > 0 && min <= 240)) throw Error('Süre 1–240 dk olmalı.');
    const t = { id: 'z' + Date.now().toString(36), name, label: label || '', end: Date.now() + min * 60000, min, done: false };
    timers.push(t); saveT(); renderT(); return `⏱ ${name}${label ? ' · ' + label : ''}: ${min} dk başladı (bitiş ${new Date(t.end).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}).`;
  }
  const tList = () => timers.filter(t => !t.done).map(t => `• ${t.name}${t.label ? ' · ' + t.label : ''}: ${Math.max(0, Math.ceil((t.end - Date.now()) / 60000))} dk kaldı`).join('\n') || 'Çalışan zamanlayıcı yok.';
  const pill = el('div', { id: 'devPill', style: 'position:fixed;left:12px;bottom:84px;z-index:60;display:none;flex-direction:column;gap:4px;max-width:260px' });
  document.body.append(pill);
  function renderT() {
    const act = timers.filter(t => !t.done);
    pill.style.display = act.length ? 'flex' : 'none';
    pill.replaceChildren(...act.map(t => { const s = Math.max(0, Math.round((t.end - Date.now()) / 1000)); return el('button', { type: 'button', class: 'btn ghost', style: `font-size:13px;padding:6px 10px;text-align:left;${s < 60 ? 'border-color:#ff6b6b' : ''}`, title: 'Durdurmak için dokun', onclick: () => { if (confirm(`${t.name}${t.label ? ' · ' + t.label : ''} durdurulsun mu?`)) { t.done = true; saveT(); renderT(); } } }, `⏱ ${t.name}${t.label ? ' · ' + short(t.label, 14) : ''} ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`); }));
  }
  setInterval(() => {
    let ch = false;
    for (const t of timers) if (!t.done && Date.now() >= t.end) {
      t.done = true; ch = true; const msg = `${t.name}${t.label ? ', ' + t.label : ''} süresi doldu`;
      note('⏰ ' + msg + '.'); beep(880); setTimeout(() => beep(660), 300); setTimeout(() => beep(880), 600); try { navigator.vibrate?.([400, 150, 400]); } catch {}
      speakTR(msg);
      try { if (Notification?.permission === 'granted') new Notification('SATÜRN', { body: msg }); } catch {}
    }
    if (ch) { timers = timers.filter(t => !t.done || Date.now() - t.end < 60000); saveT(); }
    renderT();
  }, 1000);
  renderT();

  /* ================= 4) SESLİ EGZERSİZ KOÇU ================= */
  function parseProgram(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(l => /^\d+[.)]/.test(l)).map(l => {
      const name = l.replace(/^\d+[.)]\s*/, '').split(/\s+[—-]\s+|\s+·\s+/)[0].trim();
      const how = (l.match(/—\s*([^·]+)/) || [])[1]?.trim() || '';
      const sx = l.match(/(\d+)\s*[×x]\s*(\d+)/), hold = l.match(/(\d+)\s*(?:sn|saniye)/), tek = l.match(/(\d+)\s*tekrar/);
      return { name, how, sets: sx ? +sx[1] : tek ? +tek[1] : 2, reps: sx ? +sx[2] : 10, hold: hold ? +hold[1] : 0, perSide: /taraf/.test(l) };
    }).filter(x => x.name);
  }
  function coach(source) {
    let text = source;
    const p = source && findP(source);
    if (p?.program) text = p.program;
    else if (!/\d+[.)]/.test(String(source || ''))) { const [b, s] = String(source || 'bel').split(/\s+/); text = window.jarvisYeni?.program(b, s) || ''; }
    const list = parseProgram(text);
    if (!list.length) return 'Programda “1. Hareket — … · 3×10” biçiminde satır bulamadım. Örnek: “sesli koç diz orta” ya da kayıtlı programı olan hasta adı.';
    let stop = false, pause = false;
    const st = el('p', { style: 'font-size:1.4em;font-weight:600;text-align:center' }, 'Hazır…'), sub = el('p', { class: 'muted', style: 'text-align:center' }, '');
    const pb = el('button', { type: 'button', class: 'btn', onclick: () => { pause = !pause; pb.textContent = pause ? '▶ Devam' : '⏸ Duraklat'; } }, '⏸ Duraklat');
    let skip = false;
    const ov = overlay('🗣 Sesli egzersiz koçu', st, sub, el('div', { class: 'row', style: 'justify-content:center' }, pb, el('button', { type: 'button', class: 'btn ghost', onclick: () => { skip = true; } }, '⏭ Sonraki hareket')));
    ov.box.onclose = () => { stop = true; try { speechSynthesis.cancel(); } catch {} };
    const wait = async ms => { const e = Date.now() + ms; while (Date.now() < e) { if (stop || skip) return; while (pause && !stop) await new Promise(r => setTimeout(r, 200)); await new Promise(r => setTimeout(r, 100)); } };
    (async () => {
      await speakTR(`Egzersize başlıyoruz. Toplam ${list.length} hareket.`);
      for (const [i, ex] of list.entries()) {
        if (stop) break; skip = false;
        st.textContent = `${i + 1}/${list.length} · ${ex.name}`; sub.textContent = ex.how;
        await speakTR(`${i + 1}. hareket: ${ex.name}. ${ex.how}`);
        for (let s = 1; s <= ex.sets && !stop && !skip; s++) {
          for (const side of ex.perSide ? ['sağ', 'sol'] : ['']) {
            if (stop || skip) break;
            sub.textContent = `Set ${s}/${ex.sets}${side ? ' · ' + side + ' taraf' : ''}`; beep(990, 150);
            await speakTR(`Set ${s}${side ? ', ' + side + ' taraf' : ''}. Başla.`);
            for (let r = 1; r <= ex.reps && !stop && !skip; r++) {
              st.textContent = `${ex.name} — ${r}/${ex.reps}`;
              if (ex.hold) { await speakTR(String(r)); await wait(ex.hold * 1000); beep(700, 80); } else { await speakTR(String(r), 1.1); await wait(1600); }
            }
          }
          if (s < ex.sets && !stop && !skip) { sub.textContent = 'Dinlen 30 sn'; await speakTR('Otuz saniye dinlen.'); await wait(30000); }
        }
      }
      if (!stop) { st.textContent = '✓ Tamamlandı'; sub.textContent = 'Harika iş!'; await speakTR('Program tamamlandı. Eline sağlık.'); if (p) { (p.seanslar ||= []); addMeasure(p, { tur: 'ev programı', not: 'sesli koçla tamamlandı' }); } }
    })();
    return `Sesli koç başladı: ${list.length} hareket.`;
  }

  /* ================= 5) EPİKRİZ / TEDAVİ SONU RAPORU ================= */
  function epicrisis(q) {
    const p = needP(q), S = (p.seanslar || []).slice().sort((a, b) => a.t - b.t), M = p.olcumler || [];
    const vas = S.filter(s => s.vas != null && isFinite(s.vas)), v0 = vas[0]?.vas, v1 = vas.at(-1)?.vas;
    const gon = {}; for (const m of M.filter(m => m.tur === 'gonyometre')) { const k = m.eklem + ' ' + m.taraf; (gon[k] ||= []).push(m); }
    const clinic = opt('clinicName') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
    const lines = [
      clinic, 'Cizre / Şırnak', '', 'TEDAVİ SONU RAPORU (EPİKRİZ)', `Tarih: ${dTR(Date.now())}`, '',
      `Hasta: ${p.ad}${p.yas ? ' · ' + p.yas + ' yaş' : ''}${p.tel ? ' · ' + p.tel : ''}`, `Tanı / şikâyet: ${p.tani || '-'}`,
      `Tedavi dönemi: ${S.length ? dTR(S[0].t) + ' – ' + dTR(S.at(-1).t) : '-'} · toplam ${S.length} seans`, '',
      'UYGULANAN TEDAVİ', ...[...new Set(S.map(s => s.egz).filter(Boolean))].slice(-6).map(x => '• ' + x), S.some(s => s.egz) ? '' : '• (seans uygulama notu girilmemiş)', '',
      'SONUÇ ÖLÇÜMLERİ',
      vas.length >= 2 ? `• Ağrı (VAS): ${v0} → ${v1} (${v0 - v1 >= 0 ? '−' : '+'}${Math.abs(v0 - v1)} puan${v0 ? ', %' + Math.round((v0 - v1) / v0 * 100) + ' azalma' : ''}${v0 - v1 >= 2 ? ' — klinik olarak anlamlı' : ''})` : `• Ağrı (VAS): ${v1 ?? '-'}`,
      ...Object.entries(gon).map(([k, a]) => `• ${k}: ${a[0].aci}°${a.length > 1 ? ' → ' + a.at(-1).aci + '°' : ''}`),
      ...S.filter(s => s.olcek).slice(-2).map(s => '• Ölçek: ' + s.olcek), ...M.filter(m => m.tur === 'postur').slice(-1).map(m => '• Postür: ' + m.rapor.split('\n')[0]), '',
      'EV PROGRAMI', p.program ? p.program.split('\n').slice(0, 12).join('\n') : '• Kayıtlı ev programı yok.', '',
      'ÖNERİLER', '• Ev egzersiz programına haftada en az 5 gün devam edilmesi', '• Ağrının artması, güç kaybı veya uyuşma halinde kontrole gelinmesi', `• Kontrol: ${dTR(Date.now() + 30 * DAY)} civarı`, '',
      `Fzt. ${opt('ownerName') || 'Beyhan Erden'}`, 'İmza: ____________________'
    ].filter(x => x !== null);
    const text = lines.join('\n');
    show('📄 EPİKRİZ HAZIR — “Yazdır” ile PDF/kâğıt alabilirsin.\n\n' + text);
    return `${nm(p)} için tedavi sonu raporu hazırlandı (${S.length} seans${vas.length >= 2 ? `, ağrı ${v0}→${v1}` : ''}).`;
  }

  /* ================= 6) BEKLEME LİSTESİ ================= */
  let wait = store.get('waitlist', []);
  const saveW = () => store.set('waitlist', wait);
  function waitTool([op, a, b, c]) {
    const o = fold(op || 'liste');
    if (/^ekle/.test(o)) { if (!a) throw Error('Biçim: bekleme_listesi|ekle|ad|telefon|tercih (ör. sabah / öğleden sonra / salı)'); const p = findP(a); wait.push({ id: 'w' + Date.now(), ad: p?.ad || a, tel: b || p?.tel || '', tercih: c || '', t: Date.now() }); saveW(); return `${p?.ad || a} bekleme listesine eklendi (${wait.length} kişi).`; }
    if (/^sil|cikar/.test(o)) { const n = wait.length; wait = wait.filter(w => !fold(w.ad).includes(fold(a || '§'))); saveW(); return n - wait.length ? 'Listeden çıkarıldı.' : 'Bulunamadı.'; }
    if (/^bos|iptal|uygun/.test(o)) {
      const when = a || 'yarın'; const h = parseInt((String(when).match(/(\d{1,2})[:.]?\d{0,2}/) || [])[1], 10), wd = fold(when);
      const part = isFinite(h) ? (h < 12 ? 'sabah' : h < 15 ? 'ogle' : 'aksam') : '';
      const days = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
      const score = w => { const t = fold(w.tercih || ''); let s = 1; if (!t || /farketmez|her/.test(t)) s += 1; if (part && (t.includes(part) || (part === 'aksam' && /ogleden sonra|aksamustu/.test(t)))) s += 3; for (const d of days) if (wd.includes(d) && t.includes(d)) s += 2; s += Math.min(3, (Date.now() - w.t) / (7 * DAY)); return s; };
      const ranked = wait.slice().sort((x, y) => score(y) - score(x)).slice(0, 3);
      if (!ranked.length) return 'Bekleme listesi boş. “bekleme listesine ekle Ali Kaya 0532… sabah” diyebilirsin.';
      for (const w of ranked) if (w.tel) pendingLinks.push({ url: `https://wa.me/${String(w.tel).replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(`Merhaba ${w.ad.split(' ')[0]}, FİZYOVİTA’da ${when} için bir randevu açıldı. Uygunsanız bu mesaja “evet” yazmanız yeterli.`)}`, title: '💬 ' + w.ad });
      return `🔁 ${when} boşluğu için en uygun adaylar:\n${ranked.map((w, i) => `${i + 1}. ${w.ad}${w.tel ? ' · ' + w.tel : ''} · tercih: ${w.tercih || 'farketmez'} · ${Math.round((Date.now() - w.t) / DAY)} gündür bekliyor`).join('\n')}\nHazır WhatsApp mesajları aşağıda.`;
    }
    return wait.length ? `⏳ BEKLEME LİSTESİ (${wait.length})\n${wait.map((w, i) => `${i + 1}. ${w.ad}${w.tel ? ' · ' + w.tel : ''} · ${w.tercih || 'farketmez'} · ${Math.round((Date.now() - w.t) / DAY)} gün`).join('\n')}` : 'Bekleme listesi boş.';
  }

  /* ================= 7) İŞLETME ANALİZİ ================= */
  function bizAnalysis() {
    const led = store.get('ledger', []), now0 = Date.now(), ps = P();
    const months = {}; for (const x of led) { const m = x.d.slice(0, 7); (months[m] ||= { g: 0, c: 0 }); months[m][x.type === 'gelir' ? 'g' : 'c'] += x.amt; }
    const ms = Object.keys(months).sort().slice(-4);
    const ses90 = ps.flatMap(p => (p.seanslar || []).filter(s => s.t > now0 - 90 * DAY));
    const g90 = led.filter(x => x.type === 'gelir' && Date.parse(x.d) > now0 - 90 * DAY).reduce((a, x) => a + x.amt, 0);
    const started = ps.filter(p => (p.seanslar || []).length && (p.seanslar[0].t > now0 - 120 * DAY));
    const drop = started.filter(p => p.seanslar.length < 3 && now0 - p.seanslar.at(-1).t > 21 * DAY);
    const back = ps.filter(p => { const s = (p.seanslar || []).map(x => x.t).sort(); for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 60 * DAY) return true; return false; });
    const avgS = ps.length ? ps.reduce((a, p) => a + (p.seanslar || []).length, 0) / ps.length : 0;
    const tl = v => Math.round(v).toLocaleString('tr-TR') + ' TL';
    const trend = ms.length >= 2 ? (months[ms.at(-1)].g - months[ms.at(-2)].g) / (months[ms.at(-2)].g || 1) * 100 : null;
    const tips = [];
    if (drop.length && started.length && drop.length / started.length > 0.2) tips.push(`Bırakma oranı yüksek (%${Math.round(drop.length / started.length * 100)}): ilk 3 seansta ev programı + 48 saat sonra WhatsApp kontrol mesajı (“takip listesi”) ekle.`);
    if (avgS && avgS < 6) tips.push('Hasta başı seans ortalaması düşük: tanıya göre 8–10 seanslık paket öner (“paket” aracı).');
    if (trend != null && trend < -10) tips.push('Gelir geçen aya göre düştü: Instagram planı (“sosyal takvim”) ve memnun hastalardan Google yorumu iste.');
    if (!tips.length) tips.push('Göstergeler dengeli; memnuniyet anketini ve Google yorum isteğini düzenli sürdür.');
    return `📊 İŞLETME ANALİZİ (son 90 gün)\nAylık: ${ms.map(m => `${m}: gelir ${tl(months[m].g)}, net ${tl(months[m].g - months[m].c)}`).join(' · ') || 'kasa kaydı yok'}${trend != null ? `\nSon ay değişim: ${trend >= 0 ? '+' : ''}${trend.toFixed(0)}%` : ''}\nSeans (90 gün): ${ses90.length} · seans başı gelir: ${ses90.length ? tl(g90 / ses90.length) : '-'}\nHasta başı ortalama seans: ${avgS.toFixed(1)} · aktif hasta (30 gün): ${ps.filter(p => (p.seanslar || []).some(s => s.t > now0 - 30 * DAY)).length}\nBırakma (ilk 3 seansta, 21+ gün gelmeyen): ${drop.length}${started.length ? '/' + started.length : ''}${drop.length ? ' — ' + drop.slice(0, 5).map(nm).join(', ') : ''}\nGeri dönen hasta (60+ gün aradan sonra): ${back.length}\nÖNERİLER:\n${tips.map(t => '• ' + t).join('\n')}`;
  }

  Object.assign(TOOLS, {
    gonyometre: { d: 'gonyometre|hasta adı (isteğe bağlı)|eklem (diz fleksiyon, omuz abdüksiyon…) — fotoğraftan eklem açısı ölçer (3 noktaya dokunarak), hastaya kaydeder', run: ([p, j]) => goniometer(p, j) },
    postur_analizi: { d: 'postur_analizi|hasta adı|yan veya ön — fotoğrafta işaret noktalarıyla baş öne tilt (KVA), omuz/pelvis eğimi ve çekül sapması raporu', run: ([p, m]) => posture(p, m) },
    cihaz_zamanlayici: { d: 'cihaz_zamanlayici|baslat|cihaz (TENS, sıcak paket, ultrason, vakum, enterferans, lazer, traksiyon…)|dakika (boş: standart)|yatak/hasta · cihaz_zamanlayici|liste · cihaz_zamanlayici|dur|etiket — çoklu seans zamanlayıcısı, bitince sesli uyarı', run: ([op, a, b, c]) => { const o = fold(op || 'liste'); if (/^bas|^kur/.test(o)) return tStart(a, b, c); if (/^dur|^iptal/.test(o)) { const t = timers.find(x => !x.done && fold(x.name + ' ' + x.label).includes(fold(a || ''))); if (!t) return 'Bulunamadı.'; t.done = true; saveT(); renderT(); return t.name + ' durduruldu.'; } return tList(); } },
    sesli_koc: { d: 'sesli_koc|hasta adı veya “bölge seviye” (ör. diz orta) — ev egzersiz programını sesle yöneten koç (tekrar sayar, dinlenme sayar)', run: ([s]) => coach(s) },
    epikriz: { d: 'epikriz|hasta adı — tedavi sonu raporu (tanı, seanslar, ilk/son ağrı, gonyometre/postür ölçümleri, ev programı, öneriler), yazdırılabilir', run: ([p]) => epicrisis(p) },
    bekleme_listesi: { d: 'bekleme_listesi|ekle|ad|telefon|tercih · bekleme_listesi|bosluk|“yarın 14:00” (iptal olan saat) · bekleme_listesi|liste · bekleme_listesi|sil|ad — iptal edilen saate en uygun bekleyen hastaları bulur', run: a => waitTool(a) },
    isletme_analizi: { d: 'isletme_analizi — son 90 gün: aylık gelir/net eğilimi, seans başı gelir, bırakma ve geri dönüş oranı, öneriler', run: () => bizAnalysis() }
  });
  WRITE_TOOLS.add('bekleme_listesi');
  TOOL_GROUPS.push([/gonyometre|açı ölç|aci olc|eklem açısı|postür|postur|duruş analiz|zamanlayıcı|zamanlayici|tens|sıcak paket|ultrason|sesli koç|sesli koc|epikriz|tedavi sonu|bekleme listesi|iptal oldu|işletme|isletme|analiz/i, /^(gonyometre|postur_analizi|cihaz_zamanlayici|sesli_koc|epikriz|bekleme_listesi|isletme_analizi)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nKLİNİK 27: eklem açısı ölç → gonyometre; postür → postur_analizi; cihaz süresi (TENS 20 dk, 3. yatak) → cihaz_zamanlayici|baslat; sesli egzersiz → sesli_koc; tedavi sonu raporu → epikriz; iptal olan saati doldur → bekleme_listesi|bosluk; işletme göstergeleri → isletme_analizi.';
  const _lc = localCommand;
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    let m;
    if (/^(gonyometre|aci olc|eklem acisi olc)/.test(f)) return goniometer(t.replace(/^\S+\s*(ölç|olc)?\s*/i, '').trim());
    if ((m = f.match(/^(?:postur|durus) analizi\s*(on|yan)?\s*(.*)$/))) return posture(m[2], m[1]);
    if ((m = f.match(/^(?:(\d)\.?\s*yatak\s+)?(tens|sicak paket|soguk paket|ultrason|vakum|enterferans|lazer|traksiyon|parafin)\s*(\d{1,3})?\s*(?:dk|dakika)?\s*(?:baslat|kur)?(?:\s+(.+))?$/))) return tStart(m[2].replace('sicak', 'sıcak').replace('soguk', 'soğuk'), m[3], [m[1] ? m[1] + '. yatak' : '', m[4] || ''].filter(Boolean).join(' '));
    if (/^(zamanlayicilar|cihaz zamanlayicilari|cihazlar)$/.test(f)) return tList();
    if ((m = t.match(/^sesli (?:koç|koc)\s*(.*)$/i))) return coach(m[1].trim() || 'bel');
    if ((m = t.match(/^(.{3,40}?)\s+(?:için|icin)\s+(?:epikriz|tedavi sonu raporu)$/i)) || (m = t.match(/^(?:epikriz|tedavi sonu raporu)\s+(.{3,40})$/i))) { try { return epicrisis(m[1].trim()); } catch (e) { return e.message; } }
    if ((m = t.match(/^(.{4,30}?)\s+iptal (?:oldu|edildi)[.!]?$/i))) return waitTool(['bosluk', m[1]]);
    if (/^(isletme analizi|isletme raporu|klinik performansi)$/.test(f)) return bizAnalysis();
    return _lc(t0);
  };
  window.jarvisKlinik27 = { goniometer, posture, postureReport, angAt, tStart, coach, parseProgram, epicrisis, waitTool, bizAnalysis };
})();
