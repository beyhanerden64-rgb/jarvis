'use strict';
/* SATÜRN 27 — ÖLÇ · SAY · KAYDET
 *  1) Gonyometre — telefonun ivmeölçeriyle eklem açısı (sıfırla → hareket ettir → en büyük açı), normal değere göre %, hastaya kaydet
 *  2) Klinik test kronometresi — TUG, 30 sn otur-kalk (dokunarak say), tek ayak denge, 6 dk yürüme (sesli dakika + beklenen mesafe)
 *  3) Sesli egzersiz koçu — set/tekrar/tutma/dinlenme sesli sayılır, ekran kararmaz (internetsiz)
 *  4) Nefes egzersizi — kutu nefes, 4-7-8, rahatlama; büyüyen-küçülen halka + sesli yönlendirme (internetsiz)
 *  5) Görüşme/toplantı kaydedici — konuşma parça parça yazıya dökülür; bitince özet, kararlar, yapılacaklar → görev
 *  6) Fotoğraftan yazı çıkar — fotoğraftaki metni kopyalanabilir yazıya çevirir
 * Ölçümler hastanın dosyasında p.olcumler’de durur (seans sayısını/paketi etkilemez).
 */
(() => {
  const guest = () => !!window.jarvisUltra?.guest?.();
  const show = text => { const n = bubble('ai', text); try { answerTools(n.el, text); } catch {} return n; };
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('tr-TR');
  const css = el('style', {});
  css.textContent = `
.e26 .tabs27{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #1d2b3a}
.e26 .tabs27 button.on{background:#0f3350;border-color:#2b7bb9}
.e26 .body27{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.e26 .huge{font-size:clamp(56px,20vw,110px);font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.e26 .mid{font-size:clamp(18px,5vw,24px)}
.e26 .grid27{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:100%;max-width:560px}
.e26 .grid27>*{flex:1;min-width:120px}
.e26 .res:empty{display:none}
.e26 .res{width:100%;max-width:560px;text-align:left;white-space:pre-wrap;background:#0d1520;border:1px solid #1d2b3a;border-radius:10px;padding:10px 12px;font-size:15px}
.e26 .ring{width:min(62vw,260px);height:min(62vw,260px);border-radius:50%;background:radial-gradient(circle,#2b7bb9 0%,#0f3350 60%,#05080d 72%);transform:scale(.55);transition-property:transform;transition-timing-function:ease-in-out;display:flex;align-items:center;justify-content:center;font-size:22px}
.e26 .tap{font-size:26px;padding:28px 10px;width:100%;max-width:560px;border-radius:18px;background:#0f3350;border-color:#2b7bb9}
.e26 label.s{font-size:14px;opacity:.8;display:flex;flex-direction:column;gap:4px;text-align:left}
.e26 .gauge{width:min(78vw,300px);height:auto}
`;
  document.head.append(css);

  /* ---------- ortak: ekran açık kalsın, kısa sesli söz ---------- */
  let lock = null;
  const keepAwake = async on => { try { if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } else if (!on && lock) { await lock.release(); lock = null; } } catch { lock = null; } };
  const trVoice = () => { try { return (typeof bestVoice === 'function' && bestVoice()) || window.jarvisVoiceFor?.('tr') || null; } catch { return null; } };
  function say(text, { rate = 1.05, flush = true } = {}) {
    const ss = window.speechSynthesis; if (!ss || !window.SpeechSynthesisUtterance || store.get('set.coachVoice', '1') === '0') return;
    try { if (flush) ss.cancel(); const u = new SpeechSynthesisUtterance(text); const v = trVoice(); if (v) u.voice = v; u.lang = 'tr-TR'; u.rate = rate; ss.speak(u); } catch {}
  }
  let actx = null;
  function beep(f = 880, ms = 120) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; g.gain.value = 0.12; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + ms / 1000); } catch {} }
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const every = (fn, ms) => { const id = setInterval(fn, ms); timers.add(id); return id; };
  const clearAll = () => { for (const id of timers) { clearTimeout(id); clearInterval(id); } timers.clear(); try { window.speechSynthesis?.cancel(); } catch {} };
  let cleanup = null;
  function overlay(id, title, ...kids) {
    closeAll();
    const v = el('div', { class: 'e26', id, role: 'dialog', 'aria-label': title }, el('div', { class: 'bar' }, el('b', {}, title), el('button', { type: 'button', onclick: () => closeAll() }, '✕ Kapat')), ...kids);
    document.body.append(v); return v;
  }
  function closeAll() {
    try { cleanup?.(); } catch {} cleanup = null; clearAll(); keepAwake(false);
    for (const id of ['gonView', 'testView', 'coachView', 'breathView', 'recView']) document.getElementById(id)?.remove();
    try { window.jarvisE26?.closeTranslator?.(); window.jarvisE26?.closeScanner?.(); } catch {}
  }

  /* ---------- hasta seçimi + ölçüm kaydı ---------- */
  const patientSel = () => { const s = el('select', { 'aria-label': 'Hasta' }); s.append(new Option('Hasta seç (isteğe bağlı)…', '')); for (const p of [...(typeof patients !== 'undefined' ? patients : [])].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))) s.append(new Option(p.ad, p.id)); return s; };
  const byId = id => (typeof patients !== 'undefined' ? patients.find(p => p.id === id) : null);
  function saveMeasure(p, tur, deger, birim = '', not = '') {
    if (!p) throw Error('Önce hasta seç');
    (p.olcumler ||= []).push({ t: Date.now(), tur: String(tur).slice(0, 60), deger: Number(deger), birim, not: String(not).slice(0, 200) });
    if (p.olcumler.length > 400) p.olcumler = p.olcumler.slice(-400);
    savePatients(); logOp('ölçüm', [tur], 'başarılı', 'kaydedildi');
    const prev = p.olcumler.filter(o => o.tur === tur).slice(-2, -1)[0];
    return `✓ ${p.ad}: ${tur} ${fmt1(deger)}${birim}${prev ? ` (önceki ${fmt1(prev.deger)}${birim}, ${new Date(prev.t).toLocaleDateString('tr-TR')})` : ''} kaydedildi.`;
  }
  function measures(q) {
    const p = findPatient(q || ''); if (!p) return 'Hasta bulunamadı: ' + q;
    const M = p.olcumler || []; if (!M.length) return `${p.ad} için kayıtlı ölçüm yok. Gonyometre veya klinik testlerden “hastaya kaydet” ile eklenir.`;
    const groups = {}; for (const m of M) (groups[m.tur] ||= []).push(m);
    return `📏 ${p.ad} — ÖLÇÜMLER\n` + Object.entries(groups).map(([k, a]) => `• ${k}: ${a.slice(-6).map(m => fmt1(m.deger) + (m.birim || '')).join(' → ')}${a.length > 1 ? `  (${a.at(-1).deger - a[0].deger >= 0 ? '+' : ''}${fmt1(a.at(-1).deger - a[0].deger)}${a[0].birim || ''}, ${new Date(a[0].t).toLocaleDateString('tr-TR')}’den beri)` : ''}`).join('\n');
  }

  /* ================= 1) GONYOMETRE ================= */
  // Yaklaşık normal hareket açıklıkları (AAOS). Telefon ölçülen segmentin üzerine yatırılır.
  const ROM = [['Diz fleksiyon', 135], ['Diz ekstansiyon (eksik)', 0], ['Kalça fleksiyon', 120], ['Kalça abdüksiyon', 45], ['Kalça ekstansiyon', 30], ['Omuz fleksiyon', 180], ['Omuz abdüksiyon', 180], ['Omuz ekstansiyon', 60], ['Omuz dış rotasyon', 90], ['Omuz iç rotasyon', 70], ['Dirsek fleksiyon', 150], ['El bileği fleksiyon', 80], ['El bileği ekstansiyon', 70], ['Ayak bileği dorsifleksiyon', 20], ['Ayak bileği plantar fleksiyon', 50], ['Boyun fleksiyon', 45], ['Boyun ekstansiyon', 45], ['Boyun lateral fleksiyon', 45], ['Gövde fleksiyon (eğim)', 90], ['Serbest ölçüm', 0]];
  const G = { g: null, zero: null, ang: 0, peak: 0, src: '' };
  const angleOf = (a, b) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], n = Math.hypot(...a) * Math.hypot(...b); return n ? Math.acos(Math.max(-1, Math.min(1, d / n))) * 180 / Math.PI : 0; };
  async function sensorOn(onG) {
    const ask = async C => { if (typeof C?.requestPermission === 'function') { const r = await C.requestPermission(); if (r !== 'granted') throw Error('Hareket algılayıcı izni verilmedi (iPhone: Ayarlar → Safari → Hareket ve Yönelim).'); } };
    await ask(window.DeviceMotionEvent).catch(e => { throw e; });
    let got = false;
    const onM = e => { const a = e.accelerationIncludingGravity; if (!a || a.x == null) return; got = true; onG([a.x, a.y, a.z], 'ivmeölçer'); };
    const onO = e => { if (got || e.beta == null) return; const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180; onG([Math.sin(g) * Math.cos(b) * 9.81, -Math.sin(b) * 9.81, Math.cos(b) * Math.cos(g) * 9.81], 'yönelim'); };
    window.addEventListener('devicemotion', onM); window.addEventListener('deviceorientation', onO);
    return () => { window.removeEventListener('devicemotion', onM); window.removeEventListener('deviceorientation', onO); };
  }
  function openGonio() {
    const big = el('div', { class: 'huge', 'aria-live': 'polite' }, '—°'), peakT = el('div', { class: 'mid' }, 'En büyük: —'), info = el('div', { class: 'small' }, 'Telefonu ölçülecek segmentin (ör. bacak) üzerine düz yatır, başlangıç pozisyonunda “Sıfırla”ya bas, sonra eklemi hareket ettir.');
    const joint = el('select', { 'aria-label': 'Eklem/hareket' }); for (const [n] of ROM) joint.append(new Option(n, n)); joint.value = store.get('set.gonJoint', 'Diz fleksiyon');
    const ps = patientSel(), res = el('div', { class: 'res' }, ''), norm = el('div', { class: 'small' });
    const paintNorm = () => { const n = ROM.find(r => r[0] === joint.value)?.[1]; norm.textContent = n ? `Yaklaşık normal: ${n}° (AAOS)` : ''; store.set('set.gonJoint', joint.value); };
    joint.onchange = paintNorm;
    const start = el('button', { type: 'button', class: 'talk' }, '▶ Algılayıcıyı başlat'), zero = el('button', { type: 'button' }, '⊙ Sıfırla'), hold = el('button', { type: 'button' }, '⏸ Değeri al'), saveB = el('button', { type: 'button' }, '💾 Hastaya kaydet');
    const v = overlay('gonView', '📐 GONYOMETRE', el('div', { class: 'body27' }, joint, norm, big, peakT, info, start, el('div', { class: 'grid27' }, zero, hold), ps, saveB, res));
    let off = null, frozen = null;
    const paint = () => { const a = frozen ?? G.ang; big.textContent = G.zero ? Math.round(a) + '°' : (G.g ? 'Sıfırla' : '—°'); peakT.textContent = G.zero ? `En büyük: ${Math.round(G.peak)}°` : 'En büyük: —'; };
    const onG = (g, src) => { G.src = src; G.g = G.g ? G.g.map((x, i) => x * 0.8 + g[i] * 0.2) : g; if (G.zero) { G.ang = angleOf(G.zero, G.g); if (G.ang > G.peak) G.peak = G.ang; } if (!frozen) paint(); };
    start.onclick = async () => { try { off?.(); off = await sensorOn(onG); start.textContent = '✓ Algılayıcı açık'; start.disabled = true; keepAwake(true); later(() => { if (!G.g) info.textContent = '⚠️ Bu cihazda hareket algılayıcısı veri vermiyor (bilgisayar tarayıcısı olabilir). Telefonda dene.'; }, 2500); } catch (e) { info.textContent = '⚠️ ' + e.message; } };
    zero.onclick = () => { if (!G.g) return note('Önce algılayıcıyı başlat.'); G.zero = [...G.g]; G.ang = 0; G.peak = 0; frozen = null; hold.textContent = '⏸ Değeri al'; beep(660); paint(); };
    hold.onclick = () => { if (!G.zero) return note('Önce sıfırla.'); if (frozen == null) { frozen = G.peak > G.ang + 2 ? G.peak : G.ang; hold.textContent = '▶ Ölçmeye devam'; beep(990); } else { frozen = null; hold.textContent = '⏸ Değeri al'; } paint(); result(); };
    const result = () => { const val = Math.round(frozen ?? G.peak), n = ROM.find(r => r[0] === joint.value)?.[1]; res.textContent = `${joint.value}: ${val}°${n ? ` — normalin %${Math.round(val / n * 100)}’i (${n}°)` : ''}`; return val; };
    saveB.onclick = () => { try { if (!G.zero) throw Error('Önce ölç'); const val = result(); res.textContent = saveMeasure(byId(ps.value), joint.value, val, '°'); } catch (e) { res.textContent = '⚠️ ' + e.message; } };
    cleanup = () => { off?.(); G.g = G.zero = null; G.ang = G.peak = 0; };
    paintNorm(); paint();
    window.__gonFeed = g => onG(g, 'test'); // otomatik test için
    return v;
  }

  /* ================= 2) KLİNİK TEST KRONOMETRESİ ================= */
  const STS = { k: [[60, 12, 17], [65, 11, 16], [70, 10, 15], [75, 10, 15], [80, 9, 14], [85, 8, 13], [90, 4, 11]], e: [[60, 14, 19], [65, 12, 18], [70, 12, 17], [75, 11, 17], [80, 10, 15], [85, 8, 14], [90, 7, 12]] }; // Rikli & Jones
  const SLS = [[18, 43], [40, 40], [50, 36], [60, 27], [70, 15], [80, 6]]; // tek ayak, gözler açık, ort. sn (Springer 2007)
  const band = (T, age) => { let r = null; for (const x of T) if (age >= x[0]) r = x; return r; };
  function interpTUG(s) { return `TUG ${fmt1(s)} sn — ${s < 10 ? 'normal hareketlilik' : s < 13.5 ? 'çoğunlukla bağımsız; yaşlılarda sınırda' : s < 20 ? 'düşme riski artmış (≥13,5 sn)' : 'belirgin mobilite kısıtlılığı (≥20 sn)'}. (Shumway-Cook 2000)`; }
  function interpSTS(n, age, sex) { const b = age >= 60 ? band(STS[sex === 'e' ? 'e' : 'k'], age) : null; return `30 sn otur-kalk: ${n} tekrar` + (b ? ` — ${age} yaş ${sex === 'e' ? 'erkek' : 'kadın'} normal aralık ${b[1]}–${b[2]}: ${n < b[1] ? 'NORMALİN ALTINDA (alt ekstremite kuvveti zayıf, düşme riski)' : n > b[2] ? 'normalin üstünde' : 'normal'}. (Rikli & Jones)` : age ? ' — norm tablosu 60–94 yaş için; genç yetişkinde ≥15 genelde iyi kabul edilir.' : ''); }
  function interpSLS(s, age) { const b = age ? band(SLS, age) : null; return `Tek ayak duruş: ${fmt1(s)} sn` + (b ? ` — ${age} yaş ortalaması ≈${b[1]} sn: ${s < b[1] * 0.7 ? 'ortalamanın belirgin altında (denge çalışması önerilir)' : s < b[1] ? 'ortalamanın biraz altında' : 'ortalama veya üstü'}. (Springer 2007, gözler açık)` : '') + (s < 5 && (!age || age >= 60) ? ' · <5 sn düşme riskiyle ilişkili.' : ''); }
  function sixMWT(dist, age, sex, h, w) {
    let txt = `6 dk yürüme: ${Math.round(dist)} m`;
    if (age && h && w) { const pred = sex === 'e' ? 7.57 * h - 5.02 * age - 1.76 * w - 309 : 2.11 * h - 2.29 * w - 5.78 * age + 667, lln = pred - (sex === 'e' ? 153 : 139); txt += ` — beklenen ≈${Math.round(pred)} m (%${Math.round(dist / pred * 100)}), alt sınır ≈${Math.round(lln)} m: ${dist < lln ? 'NORMALİN ALTINDA' : 'normal sınırlar içinde'}. (Enright & Sherrill 1998)`; }
    else txt += ' — beklenen değer için yaş, boy (cm) ve kilo (kg) gir.';
    return txt;
  }
  function openTests(tab = 'tug') {
    const tabs = el('div', { class: 'tabs27' }), body = el('div', { class: 'body27' });
    const ps = patientSel(), age = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Yaş', min: 5, max: 110, 'aria-label': 'Yaş' }), sex = el('select', { 'aria-label': 'Cinsiyet' }, new Option('Kadın', 'k'), new Option('Erkek', 'e'));
    ps.onchange = () => { const p = byId(ps.value); if (p?.yas) age.value = parseInt(p.yas, 10) || ''; };
    const common = el('div', { class: 'grid27' }, ps, age, sex);
    const v = overlay('testView', '⏱ KLİNİK TESTLER', tabs, el('div', { class: 'body27', style: 'flex:0;padding-bottom:0' }, common), body);
    const res = el('div', { class: 'res' }), saveB = el('button', { type: 'button' }, '💾 Hastaya kaydet');
    let last = null;
    saveB.onclick = () => { try { if (!last) throw Error('Önce testi yap'); res.textContent += '\n' + saveMeasure(byId(ps.value), last.tur, last.val, last.birim, last.not); } catch (e) { res.textContent = res.textContent.replace(/\n⚠️.*$/, '') + '\n⚠️ ' + e.message; } };
    const done = (tur, val, birim, text) => { last = { tur, val, birim, not: text }; res.textContent = text; beep(990, 200); say(text.split(' — ')[0].replace(/(\d),(\d)/g, '$1 virgül $2')); };
    const A = () => parseInt(age.value, 10) || 0;
    const T = {
      tug: () => {
        const big = el('div', { class: 'huge' }, '0,0'), b = el('button', { type: 'button', class: 'tap' }, '▶ BAŞLA'); let t0 = 0, iv = null;
        b.onclick = () => { if (!t0) { t0 = performance.now(); b.textContent = '⏹ DUR'; beep(); iv = every(() => big.textContent = fmt1((performance.now() - t0) / 1000), 100); } else { const s = (performance.now() - t0) / 1000; clearInterval(iv); t0 = 0; b.textContent = '↻ Tekrar'; big.textContent = fmt1(s); done('TUG', Math.round(s * 10) / 10, ' sn', interpTUG(s)); } };
        return [el('div', { class: 'small' }, 'Hasta sandalyede sırtı dayalı. “Başla” deyince kalkar, 3 m yürür, döner, oturur. Sırtı sandalyeye değince “Dur”.'), big, b];
      },
      sts: () => {
        const big = el('div', { class: 'huge' }, '0'), tm = el('div', { class: 'mid' }, '30 sn'), b = el('button', { type: 'button', class: 'tap' }, '▶ BAŞLA (30 sn)'); let n = 0, run = false;
        b.onclick = () => {
          if (!run) { run = true; n = 0; big.textContent = '0'; b.textContent = '👆 HER KALKIŞTA DOKUN'; say('Başla'); const t0 = Date.now();
            const iv = every(() => { const left = 30 - Math.floor((Date.now() - t0) / 1000); tm.textContent = Math.max(0, left) + ' sn'; if (left === 10) say('On saniye', { flush: false }); if (left <= 0) { clearInterval(iv); run = false; b.textContent = '↻ Tekrar'; say('Dur'); done('30 sn otur-kalk', n, ' tekrar', interpSTS(n, A(), sex.value)); } }, 250);
          } else { n++; big.textContent = String(n); beep(700, 60); }
        };
        return [el('div', { class: 'small' }, 'Kollar göğüste çapraz. 30 sn içinde tam kalkış sayısı. Her tam kalkışta büyük düğmeye dokun.'), big, tm, b];
      },
      sls: () => {
        const big = el('div', { class: 'huge' }, '0,0'), b = el('button', { type: 'button', class: 'tap' }, '▶ BAŞLA'); let t0 = 0, iv = null;
        const stop = () => { const s = Math.min(60, (performance.now() - t0) / 1000); clearInterval(iv); t0 = 0; b.textContent = '↻ Tekrar'; big.textContent = fmt1(s); done('Tek ayak duruş', Math.round(s * 10) / 10, ' sn', interpSLS(s, A())); };
        b.onclick = () => { if (!t0) { t0 = performance.now(); b.textContent = '⏹ AYAK DEĞDİ / DUR'; beep(); iv = every(() => { const s = (performance.now() - t0) / 1000; big.textContent = fmt1(s); if (s >= 60) stop(); }, 100); } else stop(); };
        return [el('div', { class: 'small' }, 'Gözler açık, eller belde, tek ayak üstünde. Diğer ayak yere değince ya da eller ayrılınca “Dur” (en çok 60 sn).'), big, b];
      },
      six: () => {
        const big = el('div', { class: 'huge' }, '6:00'), b = el('button', { type: 'button', class: 'tap' }, '▶ BAŞLA (6 dk)'), laps = el('div', { class: 'mid' }, 'Tur: 0'), lapB = el('button', { type: 'button' }, '+1 tur'), lapM = el('input', { type: 'number', inputmode: 'numeric', value: store.get('set.sixLap', '30'), 'aria-label': 'Koridor tur uzunluğu (m)' });
        const dist = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Toplam mesafe (m)', 'aria-label': 'Toplam mesafe' }), h = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Boy (cm)', 'aria-label': 'Boy' }), w = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'Kilo (kg)', 'aria-label': 'Kilo' });
        const calc = el('button', { type: 'button' }, 'Hesapla'); let lapsN = 0, run = false;
        lapM.onchange = () => store.set('set.sixLap', lapM.value);
        lapB.onclick = () => { lapsN++; laps.textContent = 'Tur: ' + lapsN; dist.value = Math.round(lapsN * (Number(lapM.value) || 30)); beep(700, 60); };
        const PEP = { 5: 'İyi gidiyorsunuz. 5 dakika kaldı.', 4: 'Böyle devam edin. 4 dakika kaldı.', 3: 'İyi gidiyorsunuz. Yarısı bitti.', 2: 'Böyle devam edin. Sadece 2 dakika kaldı.', 1: 'İyi gidiyorsunuz. 1 dakika kaldı.' };
        b.onclick = () => { if (run) return; run = true; keepAwake(true); say('Başla'); const t0 = Date.now(); let spoken = 6;
          const iv = every(() => { const left = 360 - Math.floor((Date.now() - t0) / 1000); big.textContent = `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, '0')}`; const m = Math.ceil(left / 60); if (left > 0 && left % 60 === 0 && m < spoken) { spoken = m; say(PEP[m] || '', { flush: false }); } if (left === 15) say('Birazdan dur diyeceğim; olduğunuz yerde durun.', { flush: false }); if (left <= 0) { clearInterval(iv); run = false; b.textContent = '↻ Tekrar'; say('Dur.'); beep(990, 400); } }, 250); };
        calc.onclick = () => { const d = Number(dist.value); if (!(d > 0)) return note('Mesafeyi gir'); done('6 dk yürüme', d, ' m', sixMWT(d, A(), sex.value, Number(h.value), Number(w.value))); };
        return [el('div', { class: 'small' }, 'Standart talimat (ATS): koridorda 6 dk boyunca olabildiğince çok yürü; dakika başı sesli teşvik verilir. Her turda “+1 tur”a dokun.'), big, b, el('div', { class: 'grid27' }, laps, lapB, el('label', { class: 's' }, 'Tur (m)', lapM)), el('div', { class: 'grid27' }, dist, h, w), calc];
      }
    };
    const names = { tug: 'TUG', sts: '30 sn otur-kalk', sls: 'Tek ayak denge', six: '6 dk yürüme' };
    const go = k => { clearAll(); last = null; res.textContent = ''; for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k); body.replaceChildren(...T[k](), res, saveB); };
    for (const k of Object.keys(T)) tabs.append(el('button', { type: 'button', 'data-k': k, onclick: () => go(k) }, names[k]));
    go(T[tab] ? tab : 'tug');
    return v;
  }

  /* ================= 3) SESLİ EGZERSİZ KOÇU ================= */
  const NUM = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on', 'on bir', 'on iki', 'on üç', 'on dört', 'on beş', 'on altı', 'on yedi', 'on sekiz', 'on dokuz', 'yirmi'];
  const nTR = n => NUM[n] || String(n);
  function parseCoach(t = '') {
    const f = fold(t), g = re => { const m = f.match(re); return m ? Number(m[1]) : 0; };
    return { sets: Math.min(10, g(/(\d+)\s*set/) || 3), reps: Math.min(50, g(/(\d+)\s*tekrar/) || 10), hold: Math.min(60, g(/(\d+)\s*(?:sn|saniye)\s*(?:tut|bekle)/) || g(/tut(?:ma)?\s*(\d+)/) || 0), rest: Math.min(300, g(/(\d+)\s*(?:sn|saniye)?\s*dinlen/) || g(/dinlenme\s*(\d+)/) || 30), tempo: 2, name: (t.match(/[:\-]\s*([^\d:]{3,40})$/) || [])[1]?.trim() || '' };
  }
  function openCoach(cfg = {}) {
    const C = { ...parseCoach(''), ...cfg };
    const inp = (k, lbl, max) => { const i = el('input', { type: 'number', inputmode: 'numeric', min: 0, max, value: C[k], 'aria-label': lbl }); i.onchange = () => { C[k] = Math.max(0, Math.min(max, Number(i.value) || 0)); }; return el('label', { class: 's' }, lbl, i); };
    const big = el('div', { class: 'huge', 'aria-live': 'polite' }, '—'), stat = el('div', { class: 'mid' }, `${C.sets} set × ${C.reps} tekrar`), name = el('input', { placeholder: 'Egzersiz adı (isteğe bağlı)', value: C.name, 'aria-label': 'Egzersiz adı' });
    const b = el('button', { type: 'button', class: 'tap' }, '▶ BAŞLA'), stop = el('button', { type: 'button' }, '■ Durdur');
    const v = overlay('coachView', '🏋 EGZERSİZ KOÇU', el('div', { class: 'body27' }, name, el('div', { class: 'grid27' }, inp('sets', 'Set', 10), inp('reps', 'Tekrar', 50), inp('hold', 'Tutma (sn)', 60), inp('rest', 'Dinlenme (sn)', 300), inp('tempo', 'Tekrar süresi (sn)', 10)), big, stat, b, stop));
    let run = 0;
    const wait = ms => new Promise(r => later(r, ms));
    stop.onclick = () => { run++; clearAll(); b.disabled = false; b.textContent = '▶ BAŞLA'; big.textContent = '—'; keepAwake(false); };
    b.onclick = async () => {
      const id = ++run; b.disabled = true; keepAwake(true); const alive = () => id === run && document.getElementById('coachView');
      say(`${name.value ? name.value + '. ' : ''}${nTR(C.sets)} set, ${nTR(C.reps)} tekrar. Hazır ol.`); big.textContent = 'Hazır'; await wait(3500);
      for (let s = 1; s <= C.sets && alive(); s++) {
        stat.textContent = `Set ${s}/${C.sets}`; say(`Set ${nTR(s)}`); await wait(1300);
        for (let r = 1; r <= C.reps && alive(); r++) {
          big.textContent = String(r); say(nTR(r), { rate: 1.15 }); beep(620, 60);
          if (C.hold) { await wait(900); for (let h = C.hold; h > 0 && alive(); h--) { stat.textContent = `Set ${s}/${C.sets} · tut ${h}`; if (h <= 3) beep(500, 50); await wait(1000); } say('bırak', { rate: 1.2 }); await wait(900); stat.textContent = `Set ${s}/${C.sets}`; }
          else await wait(Math.max(800, C.tempo * 1000));
        }
        if (!alive()) return;
        if (s < C.sets) { say(`Güzel. ${C.rest} saniye dinlen.`); for (let x = C.rest; x > 0 && alive(); x--) { big.textContent = '⏸ ' + x; if (x === 10) say('On saniye', { flush: false }); if (x <= 3) beep(500, 50); await wait(1000); } }
      }
      if (!alive()) return;
      big.textContent = '✓'; stat.textContent = 'Bitti'; say('Harika, egzersiz bitti.'); beep(990, 300); b.disabled = false; b.textContent = '↻ Tekrar'; keepAwake(false);
      logOp('egzersiz koçu', [`${C.sets}x${C.reps}`], 'başarılı');
    };
    return v;
  }

  /* ================= 4) NEFES EGZERSİZİ ================= */
  const BREATH = { kutu: { ad: 'Kutu nefes (4-4-4-4)', p: [['Nefes al', 4, 1], ['Tut', 4, 1], ['Ver', 4, 0.55], ['Tut', 4, 0.55]] }, '478': { ad: '4-7-8 (uykuya geçiş)', p: [['Nefes al', 4, 1], ['Tut', 7, 1], ['Ver', 8, 0.55]] }, rahat: { ad: 'Rahatlama (4 al, 6 ver)', p: [['Nefes al', 4, 1], ['Ver', 6, 0.55]] } };
  function openBreath(kind = 'kutu', mins = 3) {
    const sel = el('select', { 'aria-label': 'Nefes tekniği' }); for (const [k, x] of Object.entries(BREATH)) sel.append(new Option(x.ad, k)); sel.value = BREATH[kind] ? kind : 'kutu';
    const dur = el('select', { 'aria-label': 'Süre' }); for (const m of [1, 2, 3, 5, 10]) dur.append(new Option(m + ' dk', m)); dur.value = String([1, 2, 3, 5, 10].includes(+mins) ? mins : 3);
    const ring = el('div', { class: 'ring' }, ''), stat = el('div', { class: 'mid' }, 'Hazır olunca başla'), b = el('button', { type: 'button', class: 'talk' }, '▶ Başla');
    const v = overlay('breathView', '🌬 NEFES', el('div', { class: 'body27' }, el('div', { class: 'grid27' }, sel, dur), ring, stat, b));
    let run = 0;
    b.onclick = async () => {
      if (b.dataset.on) { run++; clearAll(); delete b.dataset.on; b.textContent = '▶ Başla'; ring.style.transform = 'scale(.55)'; ring.textContent = ''; stat.textContent = 'Durduruldu'; keepAwake(false); return; }
      const id = ++run, B = BREATH[sel.value], end = Date.now() + Number(dur.value) * 60000; b.dataset.on = '1'; b.textContent = '■ Durdur'; keepAwake(true);
      let cyc = 0;
      while (id === run && Date.now() < end && document.getElementById('breathView')) {
        cyc++;
        for (const [w, s, sc] of B.p) {
          if (id !== run) return;
          ring.style.transitionDuration = s + 's'; ring.style.transform = `scale(${sc})`; stat.textContent = `${w} · ${s}`; say(w.toLowerCase(), { rate: 0.9 });
          for (let x = s; x > 0 && id === run; x--) { ring.textContent = String(x); await new Promise(r => later(r, 1000)); }
        }
      }
      if (id !== run) return;
      delete b.dataset.on; b.textContent = '↻ Tekrar'; ring.textContent = '✓'; stat.textContent = `${cyc} döngü tamamlandı`; say('Bitti. Kendini nasıl hissediyorsun?'); keepAwake(false);
      logOp('nefes', [B.ad, dur.value + ' dk'], 'başarılı');
    };
    return v;
  }

  /* ================= 5) GÖRÜŞME / TOPLANTI KAYDEDİCİ ================= */
  const gemKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  async function gemini(parts, { json = false, ms = 120000 } = {}) {
    const key = gemKey(); if (!key) throw Error('Gemini anahtarı gerekli (Bağlantı sekmesi)');
    let last = '';
    for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-lite-latest']) {
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) }) }), ms, 'zaman aşımı');
        if (r.status === 429) { last = 'Gemini ücretsiz kotası doldu'; continue; }
        if (!r.ok) { last = m + ': HTTP ' + r.status; continue; }
        const raw = await r.text();
        const objs = /^\s*data:/.test(raw) ? raw.split(/\n/).filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean) : [JSON.parse(raw)];
        const t = objs.flatMap(o => o.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (t) return t; last = 'boş yanıt';
      } catch (e) { last = e.message; }
    }
    throw Error(last || 'yanıt yok');
  }
  const jsonOf = t => { try { return JSON.parse(t); } catch {} try { return JSON.parse((String(t).match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch { return {}; } };
  const b64 = blob => (typeof blobToBase64 === 'function' ? blobToBase64(blob) : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }));
  const REC = { on: false, segs: [], text: [], pending: 0, t0: 0, cap: null, cur: [], curSec: 0, rate: 48000, SEG: 90, MAX: 60 * 60, working: false };
  async function transcribeLoop(paint) {
    if (REC.working) return; REC.working = true;
    try {
      while (REC.segs.length) {
        if (navigator.onLine === false) { await new Promise(r => setTimeout(r, 5000)); continue; }
        const s = REC.segs[0];
        try {
          const t = await gemini([{ text: 'Bu ses kaydı bir görüşme/toplantının parçası. Türkçe olarak AYNEN yazıya dök; konuşmacı değişince yeni satıra “K1:”, “K2:” gibi etiketle. Anlaşılmayan yeri […] yaz. Yalnız metni ver.' }, { inlineData: { mimeType: 'audio/wav', data: await b64(s.wav) } }]);
          REC.text[s.i] = t.trim(); REC.segs.shift(); s.tries = 0;
        } catch (e) { s.tries = (s.tries || 0) + 1; REC.err = e.message; if (s.tries >= 3) { REC.text[s.i] = `[${s.i + 1}. parça yazıya dökülemedi: ${e.message}]`; REC.segs.shift(); } else await new Promise(r => setTimeout(r, 4000 * s.tries)); }
        paint();
      }
    } finally { REC.working = false; paint(); }
  }
  function openRecorder() {
    const big = el('div', { class: 'huge' }, '0:00'), stat = el('div', { class: 'small' }, 'Kayda başlamadan önce karşı tarafa kayıt aldığını söyle. Kayıt telefonda yazıya dökülür; ses dosyası saklanmaz.');
    const b = el('button', { type: 'button', class: 'talk' }, '⏺ Kayda başla'), res = el('div', { class: 'res' }, ''), sumB = el('button', { type: 'button', disabled: true }, '🧠 Özet + yapılacaklar');
    const v = overlay('recView', '🎙 GÖRÜŞME KAYDI', el('div', { class: 'body27' }, big, stat, b, res, sumB));
    let seg = 0, tick = null;
    const paint = () => { const left = REC.segs.length; stat.textContent = REC.on ? `Kayıt sürüyor · ${seg} parça · ${left ? left + ' parça yazıya dökülüyor' : 'yazıya dökme güncel'}` : left ? `${left} parça yazıya dökülüyor…` : (REC.text.length ? '✓ Yazıya dökme tamam.' : stat.textContent); res.textContent = REC.text.filter(Boolean).join('\n').slice(-4000) || (REC.on ? '…' : ''); sumB.disabled = REC.on || !!left || !REC.text.filter(Boolean).length; if (REC.err && left) stat.textContent += ' · son hata: ' + REC.err; };
    const cut = () => { if (!REC.cur.length) return; const wav = AudioHub.wav(REC.cur, REC.rate); REC.cur = []; REC.curSec = 0; REC.segs.push({ i: seg++, wav }); transcribeLoop(paint); };
    const stopRec = () => { if (!REC.on) return; REC.on = false; try { REC.cap?.stop(); } catch {} REC.cap = null; clearInterval(tick); cut(); b.textContent = '⏺ Yeni kayıt'; keepAwake(false); paint(); logOp('görüşme kaydı', [big.textContent], 'başarılı'); };
    b.onclick = async () => {
      if (REC.on) return stopRec();
      try { AudioHub.prime(); } catch {}
      Object.assign(REC, { segs: [], text: [], cur: [], curSec: 0, err: '' }); seg = 0; res.textContent = '';
      let stream; try { stream = await AudioHub.mic(); } catch (e) { stat.textContent = '⚠️ ' + e.message; return; }
      REC.on = true; REC.t0 = Date.now(); b.textContent = '⏹ Kaydı bitir'; keepAwake(true);
      REC.cap = AudioHub.capture(stream, (f, rate) => { if (!REC.on) return; REC.rate = rate; REC.cur.push(f); REC.curSec += f.length / rate; if (REC.curSec >= REC.SEG) cut(); });
      tick = every(() => { const s = Math.floor((Date.now() - REC.t0) / 1000); big.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= REC.MAX) { stopRec(); note('60 dakika sınırına gelindi; kayıt durdu.'); } }, 500);
      paint();
    };
    sumB.onclick = async () => {
      sumB.disabled = true; const full = REC.text.filter(Boolean).join('\n');
      try {
        const j = jsonOf(await gemini([{ text: `Aşağıdaki görüşme dökümünü Türkçe değerlendir. YALNIZ JSON: {"baslik":"kısa başlık","ozet":"3-6 cümle","kararlar":["..."],"yapilacaklar":[{"is":"...","kim":"...","tarih":"YYYY-MM-DD veya boş"}]}. Bugün ${isoLocal(now()).slice(0, 10)}. Kişi adlarını yalnız baş harfle yaz; TC/IBAN/kart yazma.\n\nDÖKÜM:\n${full.slice(0, 60000)}` }], { json: true }));
        const todo = Array.isArray(j.yapilacaklar) ? j.yapilacaklar.filter(x => x?.is).slice(0, 12) : [];
        const txt = `🎙 ${j.baslik || 'Görüşme özeti'}\n${j.ozet || ''}${j.kararlar?.length ? '\n\nKARARLAR\n' + j.kararlar.map(k => '• ' + k).join('\n') : ''}${todo.length ? '\n\nYAPILACAKLAR\n' + todo.map(x => `• ${x.is}${x.kim ? ' — ' + x.kim : ''}${x.tarih ? ' (' + x.tarih + ')' : ''}`).join('\n') : ''}`;
        const masked = window.jarvisEkler?.mask?.(txt)?.text || txt;
        const n = show(masked); res.textContent = masked;
        const bar = el('div', { class: 'tool' });
        if (todo.length) bar.append(el('button', { type: 'button', onclick: e => { for (const x of todo) saveItem({ kind: 'task', text: x.is + (x.kim ? ' — ' + x.kim : ''), due: /^\d{4}-\d{2}-\d{2}$/.test(x.tarih || '') ? x.tarih : '' }); e.target.replaceWith(el('span', {}, `✓ ${todo.length} görev eklendi`)); } }, `✅ ${todo.length} işi görevlere ekle`));
        bar.append(el('button', { type: 'button', onclick: e => { saveItem({ kind: 'note', title: (j.baslik || 'Görüşme') + ' · ' + isoLocal(now()).slice(0, 10), text: (masked + '\n\nDÖKÜM\n' + full).slice(0, 20000) }); e.target.replaceWith(el('span', {}, '✓ Not kaydedildi')); } }, '📝 Özet + dökümü nota kaydet'));
        n.el.append(bar);
      } catch (e) { note('Özet çıkarılamadı: ' + e.message); }
      sumB.disabled = false;
    };
    cleanup = () => { if (REC.on) { REC.on = false; try { REC.cap?.stop(); } catch {} REC.cap = null; cut(); } };
    paint();
    return v;
  }

  /* ================= 6) FOTOĞRAFTAN YAZI ÇIKAR ================= */
  async function ocr(file) {
    if (!file) throw Error('Fotoğraf seçilmedi');
    const im = await prepareImage(file);
    let t = await gemini([{ text: 'Fotoğraftaki TÜM yazıyı aynen, satır düzenini koruyarak çıkar. Tablo varsa sekmeyle ayır. Yorum ekleme; yalnız metni ver. Yazı yoksa “(yazı bulunamadı)” de.' }, { inlineData: { mimeType: im.type, data: im.data } }]);
    t = t.replace(/^```[a-z]*\n?|```$/g, '').trim();
    return t;
  }
  function ocrPrompt() {
    const n = bubble('ai', '🔤 Yazısını çıkaracağım fotoğrafı seç ya da çek.');
    const run = cam => { const i = el('input', { type: 'file', accept: 'image/*', ...(cam ? { capture: 'environment' } : {}) }); i.style.display = 'none'; i.onchange = async () => { const f = i.files?.[0]; i.remove(); if (!f) return; const w = bubble('ai', '🔤 Yazı çıkarılıyor…'); try { const t = await ocr(f); w.body.textContent = t; answerTools(w.el, t); logOp('yazı çıkar', [f.name], 'başarılı'); } catch (e) { w.body.textContent = '⚠️ ' + e.message; } }; document.body.append(i); i.click(); };
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'btn', onclick: () => run(true) }, '📷 Fotoğraf çek'), el('button', { type: 'button', class: 'btn ghost', onclick: () => run(false) }, '🖼 Galeriden seç')));
    return n;
  }

  /* ================= panel + araçlar + komutlar ================= */
  const qb = $('e26Quick'); if (qb) qb.append(el('button', { type: 'button', class: 'btn ghost', onclick: () => openGonio() }, '📐 Gonyometre'), el('button', { type: 'button', class: 'btn ghost', onclick: () => openTests() }, '⏱ Testler'), el('button', { type: 'button', class: 'btn ghost', onclick: () => openCoach() }, '🏋 Egzersiz koçu'));
  const box = $('e26Box'); if (box) box.querySelector('.row')?.append(el('button', { type: 'button', class: 'btn ghost', onclick: () => openBreath() }, '🌬 Nefes'), el('button', { type: 'button', class: 'btn ghost', onclick: () => openRecorder() }, '🎙 Görüşme kaydı'), el('button', { type: 'button', class: 'btn ghost', onclick: () => ocrPrompt() }, '🔤 Yazı çıkar'));

  Object.assign(TOOLS, {
    gonyometre: { d: 'gonyometre — telefonla eklem açısı ölçme ekranını açar', run: () => { openGonio(); return 'Gonyometre açıldı.'; } },
    klinik_test: { d: 'klinik_test|tug/sts/sls/six — TUG, 30 sn otur-kalk, tek ayak denge, 6 dk yürüme kronometresi', run: ([k]) => { openTests(({ tug: 'tug', sts: 'sts', 'otur': 'sts', sls: 'sls', denge: 'sls', six: 'six', '6': 'six', 'yurume': 'six' })[fold(k || '').split(/\s+/)[0]] || 'tug'); return 'Klinik test ekranı açıldı.'; } },
    egzersiz_kocu: { d: 'egzersiz_kocu|ör. “3 set 10 tekrar 5 sn tut 30 sn dinlenme: köprü” — sesli sayan egzersiz koçu', run: ([x]) => { openCoach(parseCoach(x || '')); return 'Egzersiz koçu açıldı; başlat düğmesine bas.'; } },
    nefes: { d: 'nefes|kutu/478/rahat|dakika — nefes egzersizi ekranı', run: ([k, m]) => { openBreath(k === '4-7-8' ? '478' : k || 'kutu', Number(m) || 3); return 'Nefes egzersizi açıldı.'; } },
    gorusme_kaydi: { d: 'gorusme_kaydi — görüşme/toplantı kaydedici (yazıya döker, özet + yapılacaklar)', run: () => { openRecorder(); return 'Görüşme kaydedici açıldı; kayda başlamak için düğmeye bas.'; } },
    yazi_cikar: { d: 'yazi_cikar — fotoğraftaki yazıyı metne çevirme (fotoğraf seçtirir)', run: () => { setTimeout(ocrPrompt, 0); return 'Fotoğraf seçme düğmeleri sohbette.'; } },
    olcum_kaydet: { d: 'olcum_kaydet|hasta|ölçüm türü (ör. Diz fleksiyon, TUG)|değer|birim (°, sn, m, tekrar) — hastanın dosyasına ölçüm ekler', run: ([q, tur, deger, birim = '']) => { const p = findPatient(q || ''); if (!p) throw Error('Hasta bulunamadı: ' + q); const d = Number(String(deger).replace(',', '.').replace(/[^\d.-]/g, '')); if (!Number.isFinite(d)) throw Error('Değer sayı olmalı'); return saveMeasure(p, tur || 'Ölçüm', d, !birim ? '' : /^(°|derece)$/i.test(birim.trim()) ? '°' : ' ' + birim.trim()); } },
    olcumler: { d: 'olcumler|hasta — hastanın ölçüm geçmişi (açı, test sonuçları) ve değişim', run: ([q]) => measures(q) }
  });
  WRITE_TOOLS.add('olcum_kaydet');
  TOOL_GROUPS.push([/gonyo|açı|derece|rom|eklem|tug|otur.?kalk|denge|yürüme testi|test|egzersiz|set|tekrar|nefes|rahatla|kayd|toplantı|görüşme|yazı|metin|ocr|ölçüm/i, /^(gonyometre|klinik_test|egzersiz_kocu|nefes|gorusme_kaydi|yazi_cikar|olcum_kaydet|olcumler)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nÖLÇ·SAY·KAYDET: eklem açısı ölç → gonyometre; TUG/otur-kalk/denge/6 dk yürüme → klinik_test; söylenen ölçümü hastaya yaz (ör. “Ayşe diz fleksiyon 110 derece”) → olcum_kaydet; hastanın ölçüm gelişimi → olcumler; set/tekrar saydır → egzersiz_kocu; nefes/rahatlama → nefes; toplantı/görüşme kaydet → gorusme_kaydi; fotoğraftaki yazıyı çıkar → yazi_cikar.';
  const _lc = localCommand;
  localCommand = text0 => {
    const t = String(text0 || '').trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, '').toLocaleLowerCase('tr-TR'); let m;
    if (guest()) return _lc(text0);
    try {
      if (/^(gonyometre|gonyometreyi aç|açı ölç|açıyı ölç|eklem açısı(?:nı)? ölç|rom ölç|eğim ölçer|açıölçer)$/.test(t)) { openGonio(); return '📐 Gonyometre açıldı: algılayıcıyı başlat → telefonu segmente yatır → sıfırla → hareket ettir.'; }
      if (/^(klinik testler|test kronometresi|klinik test)$/.test(t)) { openTests(); return '⏱ Klinik testler açıldı.'; }
      if (/^(tug|tug testi|kalk ve yürü testi|süreli kalk yürü)$/.test(t)) { openTests('tug'); return '⏱ TUG testi hazır.'; }
      if (/^(otur kalk testi|30 (?:sn|saniye) otur kalk|otur-kalk testi|sandalyeden kalkma testi)$/.test(t)) { openTests('sts'); return '⏱ 30 sn otur-kalk testi hazır.'; }
      if (/^(denge testi|tek ayak (?:denge |duruş )?testi)$/.test(t)) { openTests('sls'); return '⏱ Tek ayak denge testi hazır.'; }
      if (/^(6 dakika yürüme testi|altı dakika yürüme testi|6 dk yürüme testi|yürüme testi)$/.test(t)) { openTests('six'); return '⏱ 6 dk yürüme testi hazır.'; }
      if ((m = t.match(/^(?:egzersiz koçu|egzersiz koçunu aç)(?:[\s:,]+(.*))?$/)) || (m = t.match(/^((?:\d+\s*set\s*)?\d+\s*tekrar.*?)\s*(?:say|saydır|sayar mısın)$/))) { openCoach(parseCoach(m[1] || '')); const c = parseCoach(m[1] || ''); return `🏋 Egzersiz koçu: ${c.sets} set × ${c.reps} tekrar${c.hold ? `, ${c.hold} sn tutma` : ''}, ${c.rest} sn dinlenme. “Başla”ya bas.`; }
      if ((m = t.match(/^(kutu nefes|4-7-8 nefes|478 nefes|nefes egzersizi|nefes egzersizi yap|nefes al(?:dır)?|rahatla(?:mak istiyorum)?|sakinleş)$/))) { openBreath(/kutu/.test(t) ? 'kutu' : /4-?7-?8/.test(t) ? '478' : /rahat|sakin/.test(t) ? 'rahat' : 'kutu'); return '🌬 Nefes egzersizi açıldı. “Başla”ya bas.'; }
      if (/^(görüşmeyi kaydet|toplantıyı kaydet|görüşme kaydı|toplantı kaydı|kayda başla|ses kaydı al|görüşmeyi yazıya dök)$/.test(t)) { openRecorder(); return '🎙 Görüşme kaydedici açıldı. Karşı tarafa kayıt aldığını söyle, sonra “Kayda başla”.'; }
      if (/^(yazıyı çıkar|fotoğraftaki yazıyı (?:çıkar|oku)|metni çıkar|resimdeki yazıyı (?:çıkar|oku)|ocr)$/.test(t)) { setTimeout(ocrPrompt, 0); return '🔤 Tamam — aşağıdan fotoğrafı çek ya da seç.'; }
      if ((m = t.match(/^(.{2,40}?)(?:'?n[ıiuü]n|'?[ıiuü]n)?\s+ölçümleri$/))) { const r = measures(m[1]); if (!/^Hasta bulunamadı/.test(r)) return r; }
    } catch (e) { return e.message; }
    return _lc(text0);
  };
  window.jarvisE27 = { openGonio, openTests, openCoach, openBreath, openRecorder, ocr, ocrPrompt, closeAll, parseCoach, interpTUG, interpSTS, interpSLS, sixMWT, saveMeasure, measures, angleOf, G, REC };
})();
