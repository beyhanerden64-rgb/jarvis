'use strict';
/* SATÜRN 26 — GÜNLÜK HAYAT EKLERİ
 *  1) Tercüman ekranı — CANLI moda (Gemini Live) gerek yok: iki büyük düğme, telefon masada ikiniz arasında.
 *     Ses kaydı → Gemini yazıya döker + çevirir → büyük yazı + sesli okuma (Kurmancî, Arapça, İngilizce, Farsça…)
 *  2) Satürn’e paylaş — başka uygulamadan metin/link/fotoğraf/PDF paylaş → özetle, not al, hatırlat, cevap yaz, tara
 *  3) Simge kısayolları — simgeye basılı tut: Hatırlat · Tercüman · Belge tara · Canlı konuş · Not · Piyasa
 *  4) Belge tarayıcı — çok sayfa fotoğraf → kenar kırpma + tarama netliği → tek PDF (indir/paylaş/özetle/kütüphane)
 *  5) İnternetsiz kuyruk — internet yokken yapay zekâ isteğini sıraya alır, bağlantı gelince kendisi yapar
 *  6) Gün sonu sesli özet — her akşam (varsayılan 21:00) günün özeti: seans, kasa, görev, yarın, fatura, piyasa
 */
(() => {
  const DAY = 86400000;
  const guest = () => !!window.jarvisUltra?.guest?.();
  const today = () => isoLocal(now()).slice(0, 10);
  const hm = () => isoLocal(now()).slice(11, 16);
  const show = text => { const n = bubble('ai', text); try { answerTools(n.el, text); } catch {} return n; };
  const css = el('style', {});
  css.textContent = `
.e26{position:fixed;inset:0;z-index:210;display:flex;flex-direction:column;background:#05080d;color:#e8f4ff;font:16px/1.4 system-ui,sans-serif}
.e26 .bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid #1d2b3a;background:#0a1018}
.e26 .bar b{flex:1;min-width:120px;letter-spacing:.06em}
.e26 button,.e26 select,.e26 input{font:inherit;border-radius:10px;border:1px solid #2a3c50;background:#101a26;color:#e8f4ff;padding:8px 12px}
.e26 button:disabled{opacity:.5}
.e26 .half{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:14px 16px;min-height:0;overflow:auto;text-align:center}
.e26 .half.them{border-bottom:2px dashed #1d2b3a}
.e26 .half.flip{transform:rotate(180deg)}
.e26 .big{font-size:clamp(20px,5.4vw,30px);line-height:1.3;max-width:100%;overflow-wrap:anywhere;white-space:pre-wrap}
.e26 .small{font-size:14px;opacity:.7;max-width:100%;overflow-wrap:anywhere}
.e26 .talk{font-size:20px;padding:16px 26px;border-radius:999px;min-width:220px;max-width:100%;background:#0f3350;border-color:#2b7bb9}
.e26 .talk.on{background:#7a1020;border-color:#ff4d6d;animation:e26p 1s infinite}
@keyframes e26p{50%{box-shadow:0 0 0 10px rgba(255,77,109,.15)}}
.e26 .row{display:flex;gap:8px;width:100%;max-width:560px}
.e26 .row input{flex:1;min-width:0}
.e26 .lvl{height:6px;width:200px;max-width:80%;background:#14202d;border-radius:4px;overflow:hidden}
.e26 .lvl i{display:block;height:100%;width:0;background:#3fb6ff;transition:width .08s}
.e26 .pages{flex:1;overflow:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;align-content:start}
.e26 .pg{position:relative;background:#0d1520;border:1px solid #1d2b3a;border-radius:10px;padding:6px;text-align:center}
.e26 .pg img{width:100%;height:auto;display:block;border-radius:6px;background:#fff}
.e26 .pg .ops{display:flex;gap:6px;justify-content:center;margin-top:6px}
.e26 .pg .ops button{padding:4px 10px}
.e26 .foot{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid #1d2b3a;background:#0a1018}
.e26 .foot button{flex:1;min-width:130px}
.e26 .empty{grid-column:1/-1;text-align:center;opacity:.7;padding:40px 10px}
.e26 .log{font-size:13px;opacity:.65;max-height:22vh;overflow:auto;width:100%;max-width:560px;text-align:left}
`;
  document.head.append(css);

  /* ---------- Gemini (ses/görsel girişli doğrudan çağrı) ---------- */
  const gemKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  async function gemini(parts, { json = false, ms = 90000 } = {}) {
    const key = gemKey(); if (!key) throw Error('Gemini anahtarı gerekli (Bağlantı sekmesi)');
    if (navigator.onLine === false) throw Error('İnternet yok');
    let last = '';
    for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-lite-latest']) {
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) }) }), ms, 'zaman aşımı');
        if (r.status === 429) { last = 'Gemini ücretsiz kotası doldu, biraz sonra tekrar dene'; continue; }
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

  /* ---------- konuşma çıkışı: telefonun sesi → yoksa doğal ses (Gemini) → yoksa yalnız yazı ---------- */
  let audioEl = null;
  function stopSay() { try { window.speechSynthesis?.cancel(); } catch {} try { audioEl?.pause(); } catch {} }
  async function sayIn(text, code) {
    text = String(text || '').trim(); if (!text) return 'boş';
    stopSay();
    const v = window.jarvisVoiceFor?.(code);
    if (v && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try { const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 0.95; window.speechSynthesis.speak(u); return 'cihaz'; } catch {}
    }
    try {
      const r = await withTimeout(api('/api/speech', { method: 'POST', body: JSON.stringify({ text: text.slice(0, 1200) }) }), 40000, 'ses zaman aşımı');
      if (r.ok && /audio/.test(r.headers.get('Content-Type') || '')) {
        const url = URL.createObjectURL(await r.blob()); audioEl = audioEl || new Audio(); audioEl.src = url; await audioEl.play(); return 'doğal';
      }
    } catch {}
    return '';
  }

  /* ================= 1) TERCÜMAN EKRANI ================= */
  const LANGS = [
    { n: 'Kürtçe (Kurmancî)', c: 'ku', talk: 'Bipeyive', hint: 'Kurmancî, Latin alfabesiyle' },
    { n: 'Arapça', c: 'ar', talk: 'تكلّم', hint: 'Arapça (Arap alfabesi)' },
    { n: 'İngilizce', c: 'en', talk: 'Speak', hint: 'İngilizce' },
    { n: 'Farsça', c: 'fa', talk: 'صحبت کنید', hint: 'Farsça (Fars alfabesi)' },
    { n: 'Kürtçe (Zazaca)', c: 'zza', talk: 'Qisey bike', hint: 'Zazaca, Latin alfabesiyle' },
    { n: 'Rusça', c: 'ru', talk: 'Говорите', hint: 'Rusça' },
    { n: 'Almanca', c: 'de', talk: 'Sprechen', hint: 'Almanca' },
    { n: 'Fransızca', c: 'fr', talk: 'Parlez', hint: 'Fransızca' }
  ];
  const langOf = n => { const f = fold(n || '').replace(/kurmanc[iî]/, 'kurtce').trim(); if (!f) return LANGS[0]; return LANGS.find(l => fold(l.n) === f) || LANGS.find(l => fold(l.n).includes(f.slice(0, 5))) || (/^(ku|kurt)/.test(f) ? LANGS[0] : LANGS[0]); };
  const TR = { n: 'Türkçe', c: 'tr', hint: 'Türkçe' };
  const T = { lang: langOf(store.get('set.tercLang', '') || store.get('set.transLang', '')), rec: null, busy: false, log: [], flip: store.get('set.tercFlip', '1') === '1', view: null };

  async function translate({ text = '', audio = null, from, to }) {
    const ask = `Sen bir fizyoterapi kliniğinde SÖZLÜ TERCÜMANSIN. ${audio ? `Ekli ses kaydında konuşan kişi ${from.hint} konuşuyor (bazen başka dil karışabilir).` : `Metin ${from.hint}.`}
1) ${audio ? 'Söyleneni aynen yazıya dök.' : 'Metni olduğu gibi al.'}
2) ${to.hint} diline doğal, sade ve TIBBİ AÇIDAN DOĞRU çevir. Ağrının yeri, şiddeti, süresi, ilaç ve egzersiz bilgisini asla kaybetme. Yorum, açıklama, selam ekleme.
YALNIZ JSON: {"duyulan":"...","ceviri":"..."}. Anlaşılır konuşma yoksa ikisini de boş bırak.`;
    const parts = [{ text: ask }];
    if (audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: await b64(audio) } }); else parts.push({ text: 'METİN: ' + text });
    const j = jsonOf(await gemini(parts, { json: true, ms: 60000 }));
    return { heard: String(j.duyulan || (audio ? '' : text)).trim(), out: String(j.ceviri || '').trim() };
  }

  function openTranslator() {
    closeAll();
    const L = () => T.lang;
    const themBig = el('div', { class: 'big', lang: L().c, dir: /^(ar|fa)$/.test(L().c) ? 'rtl' : 'auto' }, '…');
    const themSmall = el('div', { class: 'small' }, '');
    const meBig = el('div', { class: 'big' }, 'Türkçe konuşmak için alttaki düğmeye bas. Hasta konuşacaksa üstteki düğmeye.');
    const meSmall = el('div', { class: 'small' }, '');
    const lvl1 = el('div', { class: 'lvl' }, el('i')), lvl2 = el('div', { class: 'lvl' }, el('i'));
    const btnThem = el('button', { type: 'button', class: 'talk', 'aria-label': 'Hasta konuşuyor' }, '🎤 ' + L().talk);
    const btnMe = el('button', { type: 'button', class: 'talk', 'aria-label': 'Türkçe konuş' }, '🎤 Türkçe konuş');
    const inThem = el('input', { placeholder: 'veya yaz…', 'aria-label': 'Hastanın dilinde yaz' }), inMe = el('input', { placeholder: 'veya Türkçe yaz…', 'aria-label': 'Türkçe yaz' });
    const sendThem = el('button', { type: 'button', 'aria-label': 'Çevir' }, '➤'), sendMe = el('button', { type: 'button', 'aria-label': 'Çevir' }, '➤');
    const replayThem = el('button', { type: 'button', 'aria-label': 'Tekrar oku' }, '🔊'), replayMe = el('button', { type: 'button', 'aria-label': 'Tekrar oku' }, '🔊');
    const logBox = el('div', { class: 'log' });
    const langSel = el('select', { 'aria-label': 'Hastanın dili' }); for (const l of LANGS) langSel.append(new Option(l.n, l.n)); langSel.value = L().n;
    const them = el('div', { class: 'half them' + (T.flip ? ' flip' : '') }, themBig, themSmall, lvl1, btnThem, el('div', { class: 'row' }, inThem, sendThem, replayThem));
    const me = el('div', { class: 'half me' }, meSmall, meBig, lvl2, btnMe, el('div', { class: 'row' }, inMe, sendMe, replayMe), logBox);
    const flipBtn = el('button', { type: 'button', title: 'Üst yarıyı karşıdaki kişiye çevir' }, '⇅');
    const copyBtn = el('button', { type: 'button' }, '📋');
    const v = el('div', { class: 'e26', id: 'tercView', role: 'dialog', 'aria-label': 'Tercüman' },
      el('div', { class: 'bar' }, el('b', {}, '🌐 TERCÜMAN'), langSel, flipBtn, copyBtn, el('button', { type: 'button', onclick: closeTranslator }, '✕ Kapat')), them, me);
    T.view = { v, themBig, themSmall, meBig, meSmall, lvl1, lvl2, btnThem, btnMe, logBox, last: { them: '', me: '' } };
    const paintLang = () => { btnThem.textContent = '🎤 ' + L().talk; themBig.lang = L().c; themBig.dir = /^(ar|fa)$/.test(L().c) ? 'rtl' : 'auto'; themBig.textContent = `${L().n} · ${L().talk}`; };
    langSel.onchange = () => { T.lang = langOf(langSel.value); store.set('set.tercLang', T.lang.n); paintLang(); };
    flipBtn.onclick = () => { T.flip = !T.flip; store.set('set.tercFlip', T.flip ? '1' : '0'); them.classList.toggle('flip', T.flip); };
    copyBtn.onclick = () => { const t = T.log.map(x => `${x.who === 'me' ? 'Ben' : 'Hasta'}: ${x.heard}\n→ ${x.out}`).join('\n\n'); navigator.clipboard?.writeText(t).then(() => note('Konuşma kopyalandı.'), () => note('Kopyalanamadı.')); };
    btnThem.onclick = () => record('them'); btnMe.onclick = () => record('me');
    const typed = (side, inp) => { const t = inp.value.trim(); if (!t) return; inp.value = ''; run(side, { text: t }); };
    sendThem.onclick = () => typed('them', inThem); sendMe.onclick = () => typed('me', inMe);
    inThem.onkeydown = e => { if (e.key === 'Enter') typed('them', inThem); }; inMe.onkeydown = e => { if (e.key === 'Enter') typed('me', inMe); };
    replayThem.onclick = () => T.view?.last.them && sayIn(T.view.last.them, L().c);
    replayMe.onclick = () => T.view?.last.me && sayIn(T.view.last.me, 'tr');
    document.body.append(v); paintLang();
    logOp('tercüman ekranı', [L().n], 'başarılı');
    return v;
  }
  function closeTranslator() { try { T.rec?.cancel(); } catch {} T.rec = null; stopSay(); T.view?.v.remove(); T.view = null; }

  async function run(side, input) {
    if (!T.view || T.busy) return;
    const V = T.view, from = side === 'me' ? TR : T.lang, to = side === 'me' ? T.lang : TR;
    const big = side === 'me' ? V.themBig : V.meBig, small = side === 'me' ? V.themSmall : V.meSmall, mine = side === 'me' ? V.meSmall : V.themSmall;
    T.busy = true; V.btnThem.disabled = V.btnMe.disabled = true; mine.textContent = '⏳ çeviriyorum…';
    try {
      const r = await translate({ ...input, from, to });
      if (!r.out) { mine.textContent = side === 'me' ? 'Anlaşılmadı, tekrar söyler misin?' : '؟ / Nehat fêmkirin — tekrar'; return; }
      mine.textContent = '🗣 ' + r.heard; big.textContent = r.out; small.textContent = side === 'me' ? '(Türkçe: ' + r.heard + ')' : '';
      if (side === 'me') V.last.them = r.out; else V.last.me = r.out;
      T.log.push({ who: side, heard: r.heard, out: r.out, t: Date.now() }); if (T.log.length > 60) T.log.shift();
      V.logBox.replaceChildren(...T.log.slice(-6).map(x => el('div', {}, `${x.who === 'me' ? '🇹🇷' : '🗨'} ${x.heard} → ${x.out}`)));
      const how = await sayIn(r.out, to.c);
      if (!how && to.c !== 'tr') small.textContent = (small.textContent ? small.textContent + ' · ' : '') + 'Bu dilde ses yok — yazıyı göster.';
    } catch (e) { mine.textContent = '⚠️ ' + e.message; }
    finally { T.busy = false; if (T.view) V.btnThem.disabled = V.btnMe.disabled = false; }
  }

  function record(side) {
    if (!T.view) return;
    if (T.rec) { const was = T.rec.side; T.rec.finish(); if (was === side) return; }
    if (T.busy) return;
    stopSay();
    try { AudioHub.prime(); } catch {}
    const V = T.view, btn = side === 'me' ? V.btnMe : V.btnThem, bar = (side === 'me' ? V.lvl2 : V.lvl1).firstChild;
    const R = { side, chunks: [], rate: 48000, heard: false, voiced: 0, last: Date.now(), t0: Date.now(), cap: null, done: false, noise: 0.006, mins: [] };
    const label = btn.textContent; btn.classList.add('on'); btn.textContent = side === 'me' ? '⏹ Dinliyorum… (bitince dokun)' : '⏹ ' + T.lang.talk + ' …';
    const end = () => { btn.classList.remove('on'); btn.textContent = label; bar.style.width = '0'; if (T.rec === R) T.rec = null; };
    R.cancel = () => { R.done = true; try { R.cap?.stop(); } catch {} end(); };
    R.finish = () => {
      if (R.done) return; R.done = true; try { R.cap?.stop(); } catch {} end();
      const secs = R.chunks.reduce((s, c) => s + c.length, 0) / R.rate;
      if (!R.heard || secs < 0.5) { (side === 'me' ? V.meSmall : V.themSmall).textContent = 'Ses duyulmadı — düğmeye dokunup konuş.'; return; }
      run(side, { audio: AudioHub.wav(R.chunks, R.rate) });
    };
    T.rec = R;
    AudioHub.mic().then(stream => {
      if (R.done) return;
      R.cap = AudioHub.capture(stream, (f, rate) => {
        if (R.done) return;
        R.rate = rate; R.chunks.push(f);
        let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i];
        const rms = Math.sqrt(s / f.length), ms = f.length / rate * 1000;
        R.mins.push(rms); if (R.mins.length > 24) R.mins.shift(); R.noise = Math.min(0.03, Math.max(0.004, Math.min(...R.mins) * 1.2));
        bar.style.width = Math.min(100, rms * 900) + '%';
        if (rms > Math.max(0.01, R.noise * 2.6)) { R.voiced += ms; if (R.voiced > 220) R.heard = true; R.last = Date.now(); }
        else if (R.heard && Date.now() - R.last > 1400) R.finish();
        if (Date.now() - R.t0 > 45000 || (!R.heard && Date.now() - R.t0 > 12000)) R.finish();
      });
    }).catch(e => { R.cancel(); (side === 'me' ? V.meSmall : V.themSmall).textContent = '⚠️ ' + e.message; });
  }

  /* ================= 4) BELGE TARAYICI → PDF ================= */
  const S = { pages: [], mode: store.get('set.scanMode', 'belge'), view: null, busy: false };
  const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  async function loadImg(file) {
    let bmp = null;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { try { bmp = await createImageBitmap(file); } catch {} }
    if (!bmp) throw Error('Görsel açılamadı (JPEG/PNG olmalı).');
    const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = canvasOf(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); try { bmp.close?.(); } catch {}
    return c;
  }
  // kâğıt arka plandan açık renkliyse çevresindeki masayı/zemini kırpar (emin değilse dokunmaz)
  function autoCrop(src) {
    const W = 160, H = Math.max(1, Math.round(src.height * W / src.width)), s = canvasOf(W, H), x = s.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < W * H; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; hist[v | 0]++; }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, th = 128; const N = W * H;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) ** 2; if (b > best) { best = b; th = t; } }
    const rowOk = y => { let n = 0; for (let i = 0; i < W; i++) if (g[y * W + i] > th) n++; return n / W > 0.5; };
    const colOk = c0 => { let n = 0; for (let j = 0; j < H; j++) if (g[j * W + c0] > th) n++; return n / H > 0.5; };
    let t0 = 0, b0 = H - 1, l0 = 0, r0 = W - 1;
    while (t0 < H && !rowOk(t0)) t0++; while (b0 > t0 && !rowOk(b0)) b0--; while (l0 < W && !colOk(l0)) l0++; while (r0 > l0 && !colOk(r0)) r0--;
    const area = (b0 - t0 + 1) * (r0 - l0 + 1) / N;
    if (!(area > 0.3 && area < 0.97) || best < 300 * N) return src; // net bir kâğıt kenarı yok → olduğu gibi
    const k = src.width / W, m = 2, cx = Math.max(0, (l0 + m) * k), cy = Math.max(0, (t0 + m) * k), cw = Math.min(src.width - cx, (r0 - l0 + 1 - 2 * m) * k), ch = Math.min(src.height - cy, (b0 - t0 + 1 - 2 * m) * k);
    if (cw < 100 || ch < 100) return src;
    const out = canvasOf(Math.round(cw), Math.round(ch)); out.getContext('2d').drawImage(src, cx, cy, cw, ch, 0, 0, out.width, out.height); return out;
  }
  // tarama görünümü: gölge/sarılığı arka plan bölmesiyle siler, yazıyı koyulaştırır
  function enhance(src, mode) {
    if (mode === 'orijinal') return src;
    const w = src.width, h = src.height, out = canvasOf(w, h), o = out.getContext('2d', { willReadFrequently: true });
    o.drawImage(src, 0, 0); const img = o.getImageData(0, 0, w, h), p = img.data;
    const bw = Math.max(8, Math.round(w / 24)), bh = Math.max(8, Math.round(h / 24)), bg = canvasOf(bw, bh), bx = bg.getContext('2d', { willReadFrequently: true });
    bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.filter = 'blur(1px)'; bx.drawImage(src, 0, 0, bw, bh);
    const big = canvasOf(w, h), gx = big.getContext('2d', { willReadFrequently: true }); gx.imageSmoothingEnabled = true; gx.imageSmoothingQuality = 'high'; gx.drawImage(bg, 0, 0, w, h);
    // arka plan tahmini için açık tonları al (yazıyı değil kâğıdı izlesin): bulanık görüntü yazıyı da içerir; bu yüzden 0.92 kazanç
    const B = gx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < p.length; i += 4) {
      if (mode === 'sb') {
        const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2], b = Math.max(40, 0.299 * B[i] + 0.587 * B[i + 1] + 0.114 * B[i + 2]);
        let r = Math.min(1, v / (b * 0.92)); r = r > 0.82 ? 1 : r < 0.55 ? 0 : (r - 0.55) / 0.27; r = r * r * (3 - 2 * r);
        p[i] = p[i + 1] = p[i + 2] = Math.round(r * 255);
      } else {
        for (let c = 0; c < 3; c++) { let r = Math.min(1, p[i + c] / (Math.max(40, B[i + c]) * 0.92)); r = r < 0.5 ? r * r * 2 : 1 - (1 - r) * (1 - r) * 2; p[i + c] = Math.round(r * 255); }
      }
    }
    o.putImageData(img, 0, 0); return out;
  }
  function rotate(c) { const r = canvasOf(c.height, c.width), x = r.getContext('2d'); x.translate(r.width, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0); return r; }
  const jpegOf = (c, q = 0.82) => new Promise(res => c.toBlob(b => res(b), 'image/jpeg', q));
  async function addPage(file) {
    const raw = await loadImg(file), crop = autoCrop(raw);
    const pg = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), raw: crop, rot: 0 };
    await render(pg); S.pages.push(pg); return pg;
  }
  async function render(pg) {
    let c = enhance(pg.raw, S.mode); for (let i = 0; i < pg.rot; i++) c = rotate(c);
    pg.c = c; pg.jpg = await jpegOf(c); try { pg.url && URL.revokeObjectURL(pg.url); } catch {} pg.url = URL.createObjectURL(pg.jpg);
  }
  // en küçük geçerli PDF: her sayfa A4 üzerine ortalanmış JPEG (DCTDecode) — dış kütüphane yok
  async function makePdf(pages) {
    if (!pages.length) throw Error('Önce en az bir sayfa ekle.');
    const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
    const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
    const n = pages.length, obj = i => offs[i] = pos;
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\xE2\xE3\xCF\xD3]/g, '~'));
    obj(1); put('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    obj(2); put(`2 0 obj\n<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>\nendobj\n`);
    for (let i = 0; i < n; i++) {
      const pg = pages[i], jpg = new Uint8Array(await pg.jpg.arrayBuffer()), W = pg.c.width, H = pg.c.height;
      const land = W > H, PW = land ? 842 : 595, PH = land ? 595 : 842, M = 18, k = Math.min((PW - 2 * M) / W, (PH - 2 * M) / H), dw = W * k, dh = H * k, dx = (PW - dw) / 2, dy = (PH - dh) / 2;
      const pId = 3 + i * 3, cId = pId + 1, iId = pId + 2, content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im${i} Do Q`;
      obj(pId); put(`${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${iId} 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`);
      obj(cId); put(`${cId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
      obj(iId); put(`${iId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); put(jpg); put('\nendstream\nendobj\n');
    }
    const total = 3 + n * 3, xref = pos;
    put(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }
  const pdfName = () => `Tarama-${today()}-${hm().replace(':', '')}.pdf`;
  async function pdfFile() { return new File([await makePdf(S.pages)], pdfName(), { type: 'application/pdf' }); }
  function download(file) { const a = el('a', { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  async function scanSummary() {
    if (!S.pages.length) throw Error('Önce sayfa ekle.');
    const parts = [{ text: 'Bu taranmış belgenin sayfalarını oku. Türkçe, maddeli ve kısa özetle: belge türü, tarih, kurum, önemli bilgiler, yapılacaklar/son tarihler. Kişi adlarını yalnız baş harfleriyle yaz; TC kimlik, IBAN, kart numarası yazma.' }];
    for (const pg of S.pages.slice(0, 8)) { const k = Math.min(1, 1500 / Math.max(pg.c.width, pg.c.height)), c = canvasOf(Math.round(pg.c.width * k), Math.round(pg.c.height * k)); c.getContext('2d').drawImage(pg.c, 0, 0, c.width, c.height); parts.push({ inlineData: { mimeType: 'image/jpeg', data: await b64(await jpegOf(c, 0.8)) } }); }
    let t = await gemini(parts, { ms: 120000 }); try { t = window.jarvisEkler?.mask?.(t)?.text || t; } catch {}
    return t;
  }
  function openScanner(files) {
    closeAll();
    const grid = el('div', { class: 'pages' }), state = el('span', { class: 'small' });
    const pick = (cam) => { const i = el('input', { type: 'file', accept: 'image/*', ...(cam ? { capture: 'environment' } : { multiple: true }) }); i.style.display = 'none'; i.onchange = () => { const fs = [...(i.files || [])]; i.remove(); addFiles(fs); }; document.body.append(i); i.click(); };
    const modeSel = el('select', { 'aria-label': 'Tarama görünümü' }); for (const [v, t] of [['belge', 'Belge (renkli, net)'], ['sb', 'Siyah-beyaz'], ['orijinal', 'Orijinal']]) modeSel.append(new Option(t, v)); modeSel.value = S.mode;
    const btns = { pdf: el('button', { type: 'button' }, '📄 PDF indir'), share: el('button', { type: 'button' }, '📤 Paylaş'), sum: el('button', { type: 'button' }, '🧠 Özetle'), lib: el('button', { type: 'button' }, '📚 Kütüphaneye ekle') };
    const v = el('div', { class: 'e26', id: 'scanView', role: 'dialog', 'aria-label': 'Belge tarayıcı' },
      el('div', { class: 'bar' }, el('b', {}, '📄 BELGE TARAYICI'), el('button', { type: 'button', onclick: () => pick(true) }, '📷 Sayfa çek'), el('button', { type: 'button', onclick: () => pick(false) }, '🖼 Galeriden'), modeSel, el('button', { type: 'button', onclick: closeScanner }, '✕ Kapat')),
      grid, el('div', { class: 'foot' }, state, btns.pdf, btns.share, btns.sum, btns.lib));
    S.view = { v, grid, state, btns };
    const busy = async (msg, fn) => { if (S.busy) return; S.busy = true; state.textContent = msg; Object.values(btns).forEach(b => b.disabled = true); try { await fn(); } catch (e) { state.textContent = '⚠️ ' + e.message; return; } finally { S.busy = false; Object.values(btns).forEach(b => b.disabled = !S.pages.length); } state.textContent = `${S.pages.length} sayfa`; };
    async function addFiles(fs) { if (!fs.length) return; await busy('Sayfalar işleniyor…', async () => { for (const f of fs.slice(0, 30)) { if (S.pages.length >= 40) throw Error('En çok 40 sayfa'); await addPage(f); } paint(); }); }
    S.addFiles = addFiles;
    modeSel.onchange = () => busy('Görünüm uygulanıyor…', async () => { S.mode = modeSel.value; store.set('set.scanMode', S.mode); for (const pg of S.pages) await render(pg); paint(); });
    btns.pdf.onclick = () => busy('PDF hazırlanıyor…', async () => { const f = await pdfFile(); download(f); logOp('belge tarama', [S.pages.length + ' sayfa'], 'başarılı', 'PDF'); note(`📄 ${f.name} indirildi (${S.pages.length} sayfa).`); });
    btns.share.onclick = () => busy('Paylaşıma hazırlanıyor…', async () => { const f = await pdfFile(); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: f.name }).catch(e => { if (e.name !== 'AbortError') throw e; }); else { download(f); note('Bu telefonda doğrudan paylaşım yok; PDF indirildi.'); } });
    btns.sum.onclick = () => busy('Belge okunuyor…', async () => { const t = await scanSummary(); show('📄 TARANAN BELGE ÖZETİ\n' + t); note('Özet sohbete yazıldı.'); });
    btns.lib.onclick = () => busy('Kütüphaneye ekleniyor…', async () => { if (!window.jarvisEkler?.docAdd) throw Error('Belge kütüphanesi yok'); const f = await pdfFile(); const r = await window.jarvisEkler.docAdd(f); note(typeof r === 'string' ? r : `📚 ${f.name} belge kütüphanesine eklendi.`); });
    function paint() {
      Object.values(btns).forEach(b => b.disabled = !S.pages.length || S.busy); state.textContent = S.pages.length ? `${S.pages.length} sayfa` : '';
      grid.replaceChildren(...(S.pages.length ? S.pages.map((pg, i) => el('div', { class: 'pg' }, el('img', { src: pg.url, alt: 'Sayfa ' + (i + 1) }), el('div', { class: 'ops' },
        el('span', { class: 'small' }, String(i + 1)),
        el('button', { type: 'button', 'aria-label': 'Döndür', onclick: () => busy('Döndürülüyor…', async () => { pg.rot = (pg.rot + 1) % 4; await render(pg); paint(); }) }, '↻'),
        i ? el('button', { type: 'button', 'aria-label': 'Öne al', onclick: () => { [S.pages[i - 1], S.pages[i]] = [S.pages[i], S.pages[i - 1]]; paint(); } }, '◀') : '',
        el('button', { type: 'button', 'aria-label': 'Sayfayı sil', onclick: () => { try { URL.revokeObjectURL(pg.url); } catch {} S.pages.splice(i, 1); paint(); } }, '✕')))) : [el('div', { class: 'empty' }, '📷 “Sayfa çek” ile belgeyi düz bir zeminde, tam kadraj çek. Birden çok sayfa ekleyebilirsin; kenarlar otomatik kırpılır, gölge temizlenir. Sonra tek PDF yap.')]));
    }
    S.paint = paint;
    document.body.append(v); paint();
    if (files?.length) addFiles(files);
    return v;
  }
  function closeScanner() { S.view?.v.remove(); S.view = null; }
  function closeAll() { closeTranslator(); closeScanner(); }

  /* ================= 2) SATÜRN’E PAYLAŞ  3) SİMGE KISAYOLLARI ================= */
  const URLRE = /https?:\/\/\S+/i;
  async function readShare() {
    const out = { title: '', text: '', url: '', files: [] };
    try {
      if (!('caches' in window)) return out;
      const c = await caches.open('saturn-share'), m = await c.match('./__share/meta'); if (!m) return out;
      const meta = await m.json(); Object.assign(out, { title: meta.title || '', text: meta.text || '', url: meta.url || '' });
      for (const k of meta.files || []) { const r = await c.match('./__share/' + k); if (!r) continue; const blob = await r.blob(); out.files.push(new File([blob], decodeURIComponent(r.headers.get('X-Name') || k), { type: blob.type || r.headers.get('Content-Type') || '' })); }
      for (const k of await c.keys()) await c.delete(k);
    } catch {}
    return out;
  }
  function shareCard(s) {
    const text = [s.title, s.text, s.url].filter(Boolean).join('\n').trim(), url = s.url || (text.match(URLRE) || [])[0] || '';
    const imgs = s.files.filter(f => /^image\//.test(f.type)), pdfs = s.files.filter(f => /pdf/.test(f.type) || /\.pdf$/i.test(f.name)), others = s.files.filter(f => !imgs.includes(f) && !pdfs.includes(f));
    if (!text && !s.files.length) return null;
    const head = `📥 PAYLAŞILAN İÇERİK\n${text ? short(text, 400) : ''}${s.files.length ? `${text ? '\n' : ''}📎 ${s.files.map(f => f.name).join(', ')}` : ''}`;
    const n = bubble('ai', head), bar = el('div', { class: 'tool' });
    const b = (label, fn) => bar.append(el('button', { type: 'button', onclick: async e => { e.target.disabled = true; try { await fn(); } catch (x) { note(x.message); e.target.disabled = false; } } }, label));
    if (text) {
      b('🧠 Özetle', () => think(url && text.length < url.length + 40 ? `Bu bağlantıdaki içeriği oku ve Türkçe kısaca özetle: ${url}` : `Aşağıdaki paylaşılan içeriği Türkçe, maddeli ve kısa özetle:\n\n${text.slice(0, 8000)}`));
      b('💬 Cevap taslağı', () => think(`Bana gelen şu mesaja kısa, kibar ve doğal bir Türkçe cevap taslağı yaz (yalnız taslak):\n\n${text.slice(0, 4000)}`));
      b('📝 Not al', () => { saveItem({ kind: 'note', title: short(s.title || text.split('\n')[0], 60), text: text.slice(0, 6000) }); note('Not kaydedildi.'); });
      b('⏰ Hatırlat', () => { const p = $('prompt'); if (p) { p.value = `yarın 10:00 hatırlat ${short(s.title || text.replace(URLRE, '').trim() || url, 80)}`; p.focus(); note('Saati düzenleyip gönder.'); } });
      if (typeof window.jarvisAnaliz?.looksTable === 'function' && window.jarvisAnaliz.looksTable(text)) b('📊 Tabloyu analiz et', () => think('veri analizi:\n' + text.slice(0, 20000)));
    }
    if (imgs.length) {
      b('🔍 Görseli açıkla', async () => { await setImage(imgs[0], imgs[0].name); const p = $('prompt'); if (p) { p.value = 'Bu görselde ne var? Önemli noktaları kısaca söyle.'; p.focus(); } note('Görsel eklendi — gönder tuşuna bas.'); });
      b(imgs.length > 1 ? `📄 ${imgs.length} sayfayı PDF yap` : '📄 Belge olarak tara', () => openScanner(imgs));
    }
    for (const p of pdfs) b('📚 ' + short(p.name, 24) + ' → kütüphane', async () => { const r = await window.jarvisEkler.docAdd(p); note(typeof r === 'string' ? r : 'Belge kütüphanesine eklendi.'); });
    if (others.length) b('📚 Dosyayı kütüphaneye ekle', async () => { for (const f of others) await window.jarvisEkler.docAdd(f); note('Eklendi.'); });
    n.el.append(bar); logOp('paylaşım', [s.files.length ? s.files.length + ' dosya' : 'metin'], 'başarılı', 'alındı');
    return n;
  }
  const SC = {
    hatirlat: () => { const p = $('prompt'); if (p) { p.value = 'yarın 10:00 hatırlat '; p.focus(); } return 'Ne zaman, neyi hatırlatayım? Örnek: “yarın 10:00 hatırlat ilaç al”'; },
    not: () => { const p = $('prompt'); if (p) { p.value = 'not al: '; p.focus(); } return 'Notunu yaz ya da söyle.'; },
    piyasa: () => { try { const r = localCommand('piyasa özeti'); return typeof r === 'string' ? r : 'Piyasa özeti hazırlanıyor…'; } catch (e) { return e.message; } },
    tercuman: () => { openTranslator(); return ''; },
    tara: () => { openScanner(); return ''; },
    canli: () => {
      const n = bubble('ai', '🎙 Canlı konuşma için dokun (telefon izni için bir dokunuş gerekir).');
      n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'btn', onclick: e => { try { window.jarvisUnlock?.(); AudioHub.prime(); } catch {} e.target.disabled = true; if (window.jarvisLive?.start) window.jarvisLive.start(); else $('mic')?.click(); } }, '🎙 Konuşmayı başlat')));
      return '';
    }
  };
  async function onLaunch() {
    const q = new URLSearchParams(location.search); let used = false;
    if (q.get('share') === '1' || q.has('text') || q.has('url') || q.has('title')) {
      used = true;
      const s = q.get('share') === '1' ? await readShare() : { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '', files: [] };
      if (q.get('share') === '1' && !s.text && !s.url && !s.title) Object.assign(s, { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '' });
      if (!shareCard(s)) note('Paylaşılan içerik okunamadı.');
    }
    const k = q.get('k');
    if (k && SC[k]) { used = true; const r = SC[k](); if (r) show(r); }
    if (used) { try { history.replaceState(null, '', location.pathname); } catch {} }
  }

  /* ================= 5) İNTERNETSİZ KUYRUK ================= */
  const Q = { list: store.get('offlineQ', []), running: false };
  const saveQ = () => { Q.list = Q.list.filter(x => Date.now() - x.t < 3 * DAY).slice(-30); store.set('offlineQ', Q.list); paintSettings(); };
  const offline = () => navigator.onLine === false;
  const _think = think;
  think = async (text, o = {}) => {
    if (offline() && !o.image && !o.fromQueue && typeof text === 'string' && text.trim()) {
      const t = text.replace(/^\s*(?:hey\s+)?(?:s[aâ]t[uüıi]r[uüı]?n(?![\s,]*gezegen)|jarvis)\s*[,:!.]?\s+(?=\S)/iu, '');
      let local = null; try { local = localCommand(t); } catch (e) { local = e.message; }
      bubble('me', t);
      if (local) { const b = bubble('ai', local); try { answerTools(b.el, local); } catch {} return local; }
      if (!Q.list.some(x => x.text === t)) { Q.list.push({ t: Date.now(), text: t }); saveQ(); }
      const msg = `📴 İnternet yok. Bu isteği sıraya aldım (${Q.list.length}. sırada); bağlantı gelince kendim yapacağım. Hatırlatma, not, kasa, hesap gibi komutlar internetsiz de çalışır.`;
      bubble('ai', msg); return msg;
    }
    return _think(text, o);
  };
  async function flushQueue() {
    if (Q.running || offline() || !Q.list.length || answering || guest()) return;
    Q.running = true;
    try {
      while (Q.list.length && !offline()) {
        const it = Q.list.shift(); saveQ();
        note(`🌐 İnternet geldi — sıradaki isteğin (${new Date(it.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}): “${short(it.text, 60)}”`);
        try { await _think(it.text, { fromQueue: true }); } catch {}
        await new Promise(r => setTimeout(r, 800));
        while (answering) await new Promise(r => setTimeout(r, 500));
      }
    } finally { Q.running = false; }
  }
  window.addEventListener('online', () => setTimeout(flushQueue, 1500));
  setInterval(() => { if (!document.hidden) flushQueue(); }, 60000);

  /* ================= 6) GÜN SONU SESLİ ÖZET ================= */
  const tl = n => Math.round(n).toLocaleString('tr-TR') + ' TL';
  function eodText() {
    const L = [];
    let k = ''; try { k = window.jarvisKlinik?.dayEnd?.() || ''; } catch {}
    if (k) L.push(k.replace(/^GÜN SONU · /, '🌙 GÜN SONU · '));
    else L.push('🌙 GÜN SONU · ' + new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' }));
    try {
      const tom = isoLocal(new Date(Date.now() + DAY)).slice(0, 10), t0 = Date.parse(tom + 'T00:00:00+03:00');
      const jobs = (window.jarvisPro?.jobs?.() || []).filter(j => j.next >= t0 && j.next < t0 + DAY).sort((a, b) => a.next - b.next);
      if (jobs.length) L.push('• Yarın hatırlatmalar: ' + jobs.slice(0, 5).map(j => new Date(j.next).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) + ' ' + short(String(j.cmd).replace(/^hatırlat(?:ma)?\s+/i, '').replace(/\s*hatırlat\s*$/i, ''), 30)).join(', '));
    } catch {}
    try {
      const m = today().slice(0, 7), B = store.get('bills', []), d = Number(today().slice(8, 10));
      const due = B.filter(b => b.odendi !== m && b.gun >= d && b.gun <= d + 3);
      if (due.length) L.push('• Yaklaşan fatura: ' + due.map(b => `${b.ad} (ayın ${b.gun}’i${b.tutar ? ', ~' + tl(b.tutar) : ''})`).join(', '));
    } catch {}
    try {
      const tom = isoLocal(new Date(Date.now() + DAY)).slice(5, 10), ev = store.get('events', []).filter(e => `${String(e.m).padStart(2, '0')}-${String(e.d).padStart(2, '0')}` === tom);
      if (ev.length) L.push('• Yarın önemli gün: ' + ev.map(e => e.ad).join(', '));
    } catch {}
    try {
      const P = window.jarvisPicks?.live?.prices || {}, f = (s, n) => P[s]?.p ? `${n} ${P[s].p >= 1000 ? Math.round(P[s].p).toLocaleString('tr-TR') : P[s].p.toFixed(2)} $ (${P[s].ch >= 0 ? '+' : ''}${P[s].ch.toFixed(1)}%)` : '';
      const mk = [f('BTCUSDT', 'BTC'), f('ETHUSDT', 'ETH'), f('PAXGUSDT', 'Altın')].filter(Boolean);
      if (mk.length) L.push('• Piyasa: ' + mk.join(' · '));
    } catch {}
    try { if (Q.list.length) L.push(`• İnternetsiz sırada bekleyen ${Q.list.length} istek var.`); } catch {}
    return L.join('\n');
  }
  const forSpeech = t => 'Beyhan, gün sonu özetin. ' + t.replace(/^🌙 GÜN SONU · [^\n]*\n?/, '').replace(/[•🌙📲]/g, '').replace(/\n+/g, '. ').replace(/\s+/g, ' ').replace(/\$/g, ' dolar').replace(/%/g, ' yüzde ').slice(0, 900);
  function eod(speak = true, display = true) {
    const t = eodText(); if (display) show(t);
    if (speak && setting('speakOn') === '1' && !answering) { try { voiceSession.read(forSpeech(t)); } catch {} }
    store.set('eodDone', today()); logOp('gün sonu özeti', [hm()], 'başarılı');
    return t;
  }
  const hasOwnEodJob = () => (window.jarvisPro?.jobs?.() || []).some(j => /gün sonu/i.test(j.cmd || ''));
  function eodTick() {
    if (guest() || opt('eodOn') === '0' || store.get('eodDone', '') === today() || hasOwnEodJob()) return;
    const at = /^\d{2}:\d{2}$/.test(opt('eodTime') || '') ? opt('eodTime') : '21:00', cur = hm();
    if (cur < at || cur > '23:58') return;
    if (document.hidden) { if (!store.get('eodPushed', '').startsWith(today()) && opt('ntfyOn') === '1') { store.set('eodPushed', today()); window.jarvisPushPhone?.('🌙 Gün sonu özetin hazır — Satürn’ü açınca okurum.', { title: 'SATÜRN', tags: 'crescent_moon' })?.catch?.(() => {}); } return; }
    if (answering || window.jarvisLive?.active?.() || Date.now() - (window.__lastUserMsg || 0) < 120000 || document.getElementById('tercView') || document.getElementById('scanView')) return; // konuşmanın ortasına girme
    eod(true);
  }
  setInterval(eodTick, 60000); setTimeout(eodTick, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(eodTick, 2500); });

  /* ================= ayarlar + panel ================= */
  const qState = el('small', { class: 'muted' });
  function paintSettings() { qState.textContent = Q.list.length ? `Sırada ${Q.list.length} istek bekliyor.` : 'Sırada bekleyen istek yok.'; }
  const sel = (id, opts, def) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = store.get('set.' + id, def); s.onchange = () => store.set('set.' + id, s.value); return s; };
  const timeIn = el('input', { id: 'eodTime', type: 'time' }); timeIn.value = store.get('set.eodTime', '21:00'); timeIn.onchange = () => { store.set('set.eodTime', timeIn.value || '21:00'); store.set('eodDone', ''); };
  const box = el('div', { id: 'e26Box' }, el('h3', {}, 'GÜNLÜK HAYAT'),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => openTranslator() }, '🌐 Tercüman ekranı'), el('button', { type: 'button', class: 'btn', onclick: () => openScanner() }, '📄 Belge tara → PDF'), el('button', { type: 'button', class: 'btn ghost', onclick: () => eod(true) }, '🌙 Gün sonu özeti')),
    el('div', { class: 'field' }, el('label', { for: 'eodOn' }, 'Her akşam gün sonu sesli özeti'), sel('eodOn', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    el('div', { class: 'field' }, el('label', { for: 'eodTime' }, 'Özet saati'), timeIn),
    el('div', { class: 'field' }, el('label', {}, 'İnternetsiz kuyruk'), qState, el('button', { type: 'button', class: 'btn ghost', onclick: () => { Q.list = []; saveQ(); note('Sıra temizlendi.'); } }, 'Sırayı temizle')),
    el('p', { class: 'muted' }, 'Android: başka uygulamada “Paylaş → SATÜRN” ile metin/link/fotoğraf gönderebilir, simgeye basılı tutarak kısayolları kullanabilirsin (önce Satürn ana ekrana eklenmiş olmalı). iPhone: Kestirmeler uygulamasında “URL’yi aç” ile …/jarvis/?text=… ya da ?k=tercuman adresini kullan.'));
  ($('p-settings') || $('p-system'))?.append(box); paintSettings();
  const qb = el('div', { class: 'row', id: 'e26Quick' }, el('button', { type: 'button', class: 'btn', onclick: () => openTranslator() }, '🌐 Tercüman'), el('button', { type: 'button', class: 'btn ghost', onclick: () => openScanner() }, '📄 Belge tara'));
  $('p-clinic')?.prepend(qb);

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    tercuman_ekrani: { d: 'tercuman_ekrani|dil (Kürtçe/Arapça/İngilizce/Farsça/Zazaca/Rusça…) — iki düğmeli sesli tercüman ekranını açar (CANLI mod gerekmez)', run: ([l]) => { if (l) { T.lang = langOf(l); store.set('set.tercLang', T.lang.n); } openTranslator(); return `Tercüman ekranı açıldı: Türkçe ↔ ${T.lang.n}.`; } },
    cevir_konus: { d: 'cevir_konus|dil|metin — metni o dile çevirip sesli okur ve büyük gösterir', run: async ([l, t]) => { const L = langOf(l); const r = await translate({ text: t || '', from: TR, to: L }); if (!r.out) throw Error('Çeviri boş'); sayIn(r.out, L.c); return `${L.n}: ${r.out}`; } },
    belge_tara: { d: 'belge_tara — çok sayfalı belge tarayıcıyı açar (fotoğraf → kırpma/netleştirme → tek PDF)', run: () => { openScanner(); return 'Belge tarayıcı açıldı.'; } },
    gun_sonu_ozeti: { d: 'gun_sonu_ozeti — günün özeti (seans, kasa, görev, yarın, fatura, piyasa)', run: () => eod(false, false) },
    internetsiz_kuyruk: { d: 'internetsiz_kuyruk — internet yokken sıraya alınan istekler', run: () => (Q.list.length ? Q.list.map((x, i) => `${i + 1}. ${short(x.text, 80)}`).join('\n') : 'Sırada bekleyen istek yok.') }
  });
  TOOL_GROUPS.push([/tercüman|çevir|tercume|kurmanc|kürtçe|arapça|farsça|tara|pdf|belge|gün sonu|günün özeti|kuyruk|internet/i, /^(tercuman_ekrani|cevir_konus|belge_tara|gun_sonu_ozeti|internetsiz_kuyruk)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGÜNLÜK HAYAT: hastayla karşılıklı çeviri / tercüman ekranı → tercuman_ekrani; bir cümleyi başka dilde söylet → cevir_konus; kâğıt belge/rapor tarama, PDF yapma → belge_tara; günün özeti → gun_sonu_ozeti.';
  const LANGRE = '(kürtçe|kurmancî|kurmanci|zazaca|arapça|ingilizce|farsça|rusça|almanca|fransızca)';
  const _lc = localCommand;
  localCommand = text0 => {
    const t = String(text0 || '').trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, '').toLocaleLowerCase('tr-TR'); let m;
    if (guest()) return _lc(text0);
    try {
      if (/^(tercüman ekranı|tercüman|çeviri ekranı|karşılıklı tercüman|karşılıklı çeviri|hastayla konuş|hasta ile konuş)$/.test(t)) { openTranslator(); return `🌐 Tercüman ekranı açıldı: Türkçe ↔ ${T.lang.n}. Üstteki düğme hastanın, alttaki senin.`; }
      if ((m = t.match(new RegExp('^' + LANGRE + '\\s+tercüman ekranı$')))) { T.lang = langOf(m[1].replace('kurmanci', 'kürtçe').replace('kurmancî', 'kürtçe')); store.set('set.tercLang', T.lang.n); openTranslator(); return `🌐 Tercüman ekranı: Türkçe ↔ ${T.lang.n}.`; }
      if ((m = t.match(new RegExp('^' + LANGRE + '\\s+(?:olarak\\s+)?(?:söyle|çevir ve söyle|çevirip söyle)\\s*[:,]?\\s+(.{2,400})$'))) || (m = t.match(new RegExp('^' + LANGRE + '\\s+(?:de|oku)\\s*:\\s*(.{2,400})$')))) {
        const L = langOf(m[1].replace(/kurmanc[iî]/, 'kürtçe')), txt = m[2];
        translate({ text: txt, from: TR, to: L }).then(r => { if (!r.out) throw Error('Çeviri boş'); show(`🌐 ${L.n}: ${r.out}`); sayIn(r.out, L.c); }).catch(e => note(e.message));
        return `${L.n} diline çeviriyorum…`;
      }
      if (/^(belge tara|belge tarayıcı|tarayıcı|pdf tara|sayfa tara|evrak tara|belgeyi tara|tarayıcıyı aç|tara ve pdf yap)$/.test(t)) { openScanner(); return '📄 Belge tarayıcı açıldı: “Sayfa çek” → kenarlar kırpılır, netleşir → PDF.'; }
      if (/^(gün sonu özeti|günün özeti|akşam özeti|gün sonu sesli özet|günü özetle)$/.test(t)) return eod(true, false);
      if (/^(bekleyen istekler|internetsiz kuyruk|kuyruk|sıradaki istekler)$/.test(t)) return TOOLS.internetsiz_kuyruk.run([]);
      if (/^(günlük hayat araçları|yeni araçlar)$/.test(t)) return '🧩 GÜNLÜK HAYAT\n• “tercüman” → iki düğmeli sesli tercüman (Kurmancî, Arapça, İngilizce, Farsça, Zazaca…)\n• “arapça söyle: ağrınız nerede” → çevirip sesli okur\n• “belge tara” → çok sayfa → kırp/netleştir → PDF\n• Paylaş → SATÜRN (Android) · simgeye basılı tut → kısayollar\n• İnternet yokken istekler sıraya girer, bağlantı gelince yapılır\n• Her akşam 21:00 gün sonu sesli özeti (“gün sonu özeti”)';
    } catch (e) { return e.message; }
    return _lc(text0);
  };

  setTimeout(() => { onLaunch().catch(() => {}); }, 1200);
  window.jarvisE26 = { openTranslator, closeTranslator, translate, sayIn, langOf, LANGS, T, openScanner, closeScanner, addPage, autoCrop, enhance, makePdf, S, readShare, shareCard, onLaunch, flushQueue, Q, eod, eodText, eodTick };
})();
