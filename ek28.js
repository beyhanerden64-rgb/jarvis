'use strict';
/* SATÜRN 28 — YENİ NESİL ALTYAPI (kliniğe değil, hayatın her yerine)
 *  1) Cihaz içi yapay zekâ — Chrome’un yerleşik Gemini Nano’su: internetsiz/kotasız cevap (destekleyen cihazda)
 *  2) Yapay zekâ podcast’i — konu/link/not → iki sunuculu Türkçe sesli sohbet (NotebookLM tarzı), dinle/indir
 *  3) Uygulama üretici — “bana … yapan bir uygulama yap” → canlı önizleme, sözle düzenleme, kütüphane, indir (Canvas/Artifacts tarzı)
 *  4) Canlı ekran paylaşımı — CANLI modda Satürn bilgisayar ekranını sürekli görür (Astra tarzı) [live.js]
 *  5) Barkod/QR okuyucu — ürün bilgisi (Open Food Facts), QR bağlantı/Wi-Fi/metin
 *  6) Rota + yakıt — “Mardin’e ne kadar sürer” → mesafe, süre, yakıt maliyeti, harita (OpenStreetMap + OSRM, ücretsiz)
 *  7) Zihin haritası — konu/not/son cevap → görsel ağaç (SVG), indir
 *  8) Kendi entegrasyonların — Make/Zapier/n8n/IFTTT/Home Assistant webhook’larını araç olarak ekle
 */
(() => {
  const guest = () => !!window.jarvisUltra?.guest?.();
  const show = text => { const n = bubble('ai', text); try { answerTools(n.el, text); } catch {} return n; };
  const tl = n => Math.round(n).toLocaleString('tr-TR') + ' TL';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const css = el('style', {});
  css.textContent = `
.e26 iframe.app28{flex:1;width:100%;border:0;background:#fff}
.e26 .mm{flex:1;overflow:auto;background:#05080d;-webkit-overflow-scrolling:touch}
.e26 .mm svg{display:block}
.e26 .vid28{width:100%;max-width:560px;border-radius:14px;background:#000;aspect-ratio:4/3;object-fit:cover}
.e26 .lib28{width:100%;max-width:560px;display:flex;flex-direction:column;gap:6px}
.e26 .lib28 .it{display:flex;gap:6px;align-items:center;background:#0d1520;border:1px solid #1d2b3a;border-radius:10px;padding:6px 8px;text-align:left}
.e26 .lib28 .it span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.e26 audio{width:100%;max-width:560px}
`;
  document.head.append(css);
  function overlay(id, title, ...kids) {
    closeAll();
    const v = el('div', { class: 'e26', id, role: 'dialog', 'aria-label': title }, el('div', { class: 'bar' }, el('b', {}, title), el('button', { type: 'button', onclick: () => closeAll() }, '✕ Kapat')), ...kids);
    document.body.append(v); return v;
  }
  let cleanup = null;
  window.__e28Cleanup = () => { try { cleanup?.(); } catch {} cleanup = null; };
  function closeAll() { try { cleanup?.(); } catch {} cleanup = null; for (const id of ['appView', 'mmView', 'scan28View', 'podView']) document.getElementById(id)?.remove(); try { window.jarvisE27?.closeAll?.(); } catch {} }

  /* ---------- Gemini (doğrudan) ---------- */
  const gemKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  async function gemini(parts, { json = false, ms = 120000, models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-lite-latest'], gen = {} } = {}) {
    const key = gemKey(); if (!key) throw Error('Gemini anahtarı gerekli (Bağlantı sekmesi)');
    if (navigator.onLine === false) throw Error('İnternet yok');
    let last = '';
    for (const m of models) {
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), ...gen } }) }), ms, 'zaman aşımı');
        if (r.status === 429) { last = 'Gemini ücretsiz kotası doldu, biraz sonra dene'; continue; }
        if (!r.ok) { last = m + ': HTTP ' + r.status; continue; }
        const raw = await r.text();
        const objs = /^\s*data:/.test(raw) ? raw.split(/\n/).filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean) : [JSON.parse(raw)];
        const t = objs.flatMap(o => o.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (t) return t; last = 'boş yanıt';
      } catch (e) { last = e.message; }
    }
    throw Error(last || 'yanıt yok');
  }
  const jsonOf = t => { try { return JSON.parse(t); } catch {} try { return JSON.parse((String(t).match(/[[{][\s\S]*[\]}]/) || ['{}'])[0]); } catch { return {}; } };
  const lastAnswer = () => [...document.querySelectorAll('#feed .msg.ai')].map(m => m.querySelector('span:not(.who)')?.textContent || m.textContent).filter(t => t && t.length > 60).at(-1) || '';

  /* ================= 1) CİHAZ İÇİ YAPAY ZEKÂ (Gemini Nano) ================= */
  const ND = { session: null, state: '' };
  const LM = () => window.LanguageModel || window.ai?.languageModel || null;
  async function nanoStatus() {
    const M = LM(); if (!M) return { ok: false, s: 'yok', msg: 'Bu tarayıcıda cihaz içi yapay zekâ yok. Destek: bilgisayarda güncel Chrome (138+, ~22 GB boş alan, 4 GB+ ekran kartı veya 16 GB RAM). Telefonlarda henüz yaygın değil; Satürn normal (bulut) modelle çalışmaya devam eder.' };
    let a = 'unavailable';
    try { a = await (M.availability ? M.availability({ expectedInputs: [{ type: 'text', languages: ['tr'] }], expectedOutputs: [{ type: 'text', languages: ['tr'] }] }).catch(() => M.availability()) : M.capabilities().then(c => c.available === 'readily' ? 'available' : c.available === 'after-download' ? 'downloadable' : 'unavailable')); } catch {}
    ND.state = a;
    return { ok: a === 'available', s: a, msg: { available: '✓ Cihaz içi yapay zekâ HAZIR (Gemini Nano). İnternet yokken ya da kota dolunca cevapları telefonun/bilgisayarın kendisi üretir.', downloadable: 'Cihaz içi model indirilebilir (~2–4 GB, bir kez). “cihaz içi yapay zekâyı indir” de.', downloading: 'Cihaz içi model iniyor…', unavailable: 'Bu cihaz cihaz içi modeli desteklemiyor (donanım veya dil). Bulut modeli kullanılır.' }[a] || 'Durum bilinmiyor: ' + a };
  }
  async function nanoSession(progress) {
    if (ND.session) return ND.session;
    const M = LM(); if (!M) throw Error('Cihaz içi yapay zekâ yok');
    const sys = 'Sen SATÜRN adlı kişisel asistansın. Kullanıcı Beyhan. Her zaman kısa, net ve TÜRKÇE cevap ver.';
    const opts = { initialPrompts: [{ role: 'system', content: sys }], monitor(m) { m.addEventListener?.('downloadprogress', e => progress?.(Math.round((e.loaded || 0) * 100))); } };
    try { ND.session = await M.create({ ...opts, expectedInputs: [{ type: 'text', languages: ['tr'] }], expectedOutputs: [{ type: 'text', languages: ['tr'] }] }); }
    catch { ND.session = await M.create(opts); }
    return ND.session;
  }
  async function nanoAsk(q) { const s = await nanoSession(); const r = await withTimeout(s.prompt(String(q).slice(0, 4000)), 90000, 'cihaz içi model geç yanıt verdi'); return String(r || '').trim(); }
  const _think = think;
  think = async (text, o = {}) => {
    // internet yokken ve cihaz içi model hazırsa sıraya almak yerine hemen cevap ver
    if (navigator.onLine === false && !o.image && typeof text === 'string' && text.trim() && store.get('set.nanoOn', '1') !== '0' && LM() && ND.state === 'available') {
      let local = null; try { local = localCommand(text); } catch {}
      if (!local) {
        bubble('me', text); const b = bubble('ai', '📱 Cihaz içi yapay zekâ düşünüyor…');
        try { const r = await nanoAsk(text); b.body.textContent = '📱 ' + r; try { answerTools(b.el, r); } catch {} return r; } catch (e) { b.body.textContent = '📱 Cihaz içi model cevap veremedi: ' + e.message; }
      }
    }
    return _think(text, o);
  };
  setTimeout(() => { if (LM()) nanoStatus().catch(() => {}); }, 4000);

  /* ================= 2) YAPAY ZEKÂ PODCAST’İ ================= */
  const HOSTS = [{ ad: 'Deniz', ses: 'Charon' }, { ad: 'Elif', ses: 'Kore' }];
  function pcm16ToWav(chunks, rate = 24000) {
    const len = chunks.reduce((s, c) => s + c.length, 0), h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); h.setUint32(4, 36 + len, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, len, true);
    return new Blob([h.buffer, ...chunks], { type: 'audio/wav' });
  }
  const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const silence = (ms, rate = 24000) => new Uint8Array(Math.round(rate * ms / 1000) * 2);
  // WAV/PCM parçasından ham 16-bit PCM + örnek hızı
  async function pcmOf(blob) { const u = new Uint8Array(await blob.arrayBuffer()); if (u[0] === 0x52 && u[1] === 0x49) { const dv = new DataView(u.buffer); return { pcm: u.subarray(44), rate: dv.getUint32(24, true) }; } return { pcm: u, rate: 24000 }; }
  async function multiTts(script) {
    // tek istekte iki konuşmacı (Gemini çok konuşmacılı ses)
    const text = script.map(l => `${l.who}: ${l.text}`).join('\n');
    const key = gemKey(); if (!key) throw Error('Gemini anahtarı gerekli');
    for (const model of ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']) {
      const spk = HOSTS.map(h => ({ speaker: h.ad, voiceConfig: { prebuiltVoiceConfig: { voiceName: h.ses } } }));
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Aşağıdaki Türkçe podcast sohbetini doğal, sıcak ve akıcı seslendir:\n' + text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: spk } } } }) }), 180000, 'ses zaman aşımı');
        if (!r.ok) continue;
        const d = await r.json(), part = d.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data); if (!part) continue;
        const bytes = b64bytes(part.inlineData.data), mime = part.inlineData.mimeType || '';
        return (bytes[0] === 0x52 && bytes[1] === 0x49) ? new Blob([bytes], { type: 'audio/wav' }) : pcm16ToWav([bytes], Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000);
      } catch {}
    }
    return null;
  }
  async function lineTts(script, onp) {
    // yedek yol: her repliği sırayla sunucunun kendi sesiyle üret, aralarına kısa sessizlik koyup birleştir
    const out = []; let rate = 24000;
    for (let i = 0; i < script.length; i++) {
      onp?.(`Seslendiriliyor ${i + 1}/${script.length}…`);
      const h = HOSTS.find(x => x.ad === script[i].who) || HOSTS[i % 2];
      const r = await withTimeout(api('/api/speech', { method: 'POST', body: JSON.stringify({ text: script[i].text, voice: h.ses }) }), 60000, 'ses zaman aşımı');
      if (!r.ok || !/audio/.test(r.headers.get('Content-Type') || '')) throw Error(r.status === 429 ? 'Doğal ses kotası doldu' : 'Doğal ses alınamadı (' + r.status + ')');
      const p = await pcmOf(await r.blob()); rate = p.rate; out.push(p.pcm, silence(350, rate));
    }
    return pcm16ToWav(out, rate);
  }
  async function podScript(topic, src = '') {
    const j = jsonOf(await gemini([{ text: `İki sunuculu, Türkçe, merak uyandıran kısa bir podcast bölümü yaz (NotebookLM “sesli özet” tarzı). Sunucular: ${HOSTS[0].ad} (meraklı soran) ve ${HOSTS[1].ad} (konuyu iyi bilen). 12–18 replik, her replik 1–3 cümle; doğal konuşma dili, örnekler ve benzetmeler; başta kısa giriş, sonda 2-3 maddelik özet. Uydurma bilgi verme; emin olmadığını söyle.
YALNIZ JSON: {"baslik":"...","replikler":[{"kim":"${HOSTS[0].ad}","metin":"..."}]}
KONU: ${topic}${src ? '\n\nKAYNAK METİN:\n' + src.slice(0, 30000) : ''}` }], { json: true }));
    const L = (Array.isArray(j.replikler) ? j.replikler : []).filter(x => x?.metin).slice(0, 22).map((x, i) => ({ who: HOSTS.some(h => h.ad === x.kim) ? x.kim : HOSTS[i % 2].ad, text: String(x.metin).slice(0, 400) }));
    if (L.length < 4) throw Error('Podcast metni üretilemedi');
    return { title: String(j.baslik || topic).slice(0, 80), lines: L };
  }
  async function podcast(topic) {
    let src = '';
    const url = (String(topic).match(/https?:\/\/\S+/) || [])[0];
    if (url) { try { src = await gemini([{ text: `Bu adresteki içeriğin ana noktalarını Türkçe, ayrıntılı çıkar: ${url}` }], { gen: {} }); } catch {} }
    if (/^(bunu|bunun|son cevab[ıi]|yukarıdaki)/i.test(String(topic).trim())) src = lastAnswer();
    const card = bubble('ai', '🎧 Podcast hazırlanıyor: metin yazılıyor…');
    const set = t => { card.body.textContent = '🎧 ' + t; };
    try {
      const S = await podScript(src && !url ? 'yukarıdaki içerik' : topic, src);
      set(`${S.title} — seslendiriliyor…`);
      let wav = null, how = '';
      try { wav = await multiTts(S.lines); how = 'çok konuşmacılı doğal ses'; } catch {}
      if (!wav) { try { wav = await lineTts(S.lines, set); how = 'doğal ses'; } catch (e) { how = e.message; } }
      const scriptTxt = S.lines.map(l => `${l.who}: ${l.text}`).join('\n');
      set(`${S.title}\n\n${scriptTxt}`);
      const bar = el('div', { class: 'tool' });
      if (wav) {
        window.__podWav = wav; const url2 = URL.createObjectURL(wav), au = el('audio', { controls: '', src: url2, preload: 'auto' }); card.el.append(au);
        bar.append(el('button', { type: 'button', onclick: () => { const a = el('a', { href: url2, download: S.title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 40) + '.wav' }); document.body.append(a); a.click(); a.remove(); } }, '⬇ Sesi indir'));
        try { au.play().catch(() => {}); } catch {}
      } else {
        bar.append(el('button', { type: 'button', onclick: () => { const ss = window.speechSynthesis; if (!ss) return; ss.cancel(); const vs = ss.getVoices().filter(v => /^tr/i.test(v.lang)); S.lines.forEach((l, i) => { const u = new SpeechSynthesisUtterance(l.text); u.lang = 'tr-TR'; if (vs.length) u.voice = vs[(l.who === HOSTS[0].ad ? 0 : 1) % vs.length]; u.pitch = l.who === HOSTS[0].ad ? 0.9 : 1.15; ss.speak(u); }); } }, '🔊 Telefon sesiyle dinle'));
        note('Doğal ses alınamadı (' + how + '); metin hazır, telefon sesiyle dinleyebilirsin.');
      }
      bar.append(el('button', { type: 'button', onclick: () => { saveItem({ kind: 'note', title: '🎧 ' + S.title, text: scriptTxt }); note('Podcast metni nota kaydedildi.'); } }, '📝 Metni kaydet'));
      card.el.append(bar); logOp('podcast', [S.title], 'başarılı', how);
      return S.title;
    } catch (e) { set('Podcast hazırlanamadı: ' + e.message); throw e; }
  }

  /* ================= 3) UYGULAMA ÜRETİCİ ================= */
  const IDB = (() => { let db = null; const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => { const r = indexedDB.open('saturn-apps', 1); r.onupgradeneeded = () => r.result.createObjectStore('apps', { keyPath: 'id' }); r.onsuccess = () => res(db = r.result); r.onerror = () => rej(r.error); });
    const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('apps', mode), s = t.objectStore('apps'), q = fn(s); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
    return { put: a => tx('readwrite', s => s.put(a)), all: () => tx('readonly', s => s.getAll()), del: id => tx('readwrite', s => s.delete(id)) }; })();
  const APP_SYS = `Sen dünya çapında bir ön yüz geliştiricisisin. İstenen şeyi TEK DOSYALIK, eksiksiz, çalışan bir HTML uygulaması olarak yaz.
Kurallar: <!doctype html> ile başla; tüm CSS ve JS dosyanın içinde; dış kütüphane gerekiyorsa yalnız https://cdn.jsdelivr.net veya https://cdnjs.cloudflare.com; telefon ekranına göre (mobil öncelikli), büyük dokunma alanları, modern ve şık tasarım, Türkçe arayüz; localStorage/sessionStorage/cookie KULLANMA (korumalı alanda çalışır), veriyi değişkende tut; alert/prompt yerine sayfa içi öğeler kullan; hata yapma, eksik bırakma.
YALNIZ HTML KODUNU VER (açıklama ve \`\`\` işareti yok).`;
  const htmlOf = t => { let s = String(t).replace(/^[\s\S]*?```(?:html)?\s*/i, m => (/```/.test(m) ? '' : m)).replace(/```[\s\S]*$/, '').trim(); const i = s.search(/<!doctype html|<html/i); if (i > 0) s = s.slice(i); if (!/<html|<!doctype/i.test(s)) throw Error('Uygulama kodu üretilemedi'); return s; };
  // korumalı önizlemede localStorage yoktur: üretilen uygulama yine de kullanırsa çökmesin diye bellek içi yedek
  const SHIM = '<script>(()=>{const mk=()=>{const m=new Map;return{getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v))},removeItem:k=>{m.delete(String(k))},clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};window.__satLS=mk();window.__satSS=mk();})()<\/script>';
  // tarayıcı korumalı alanda localStorage’ı değiştirmeye izin vermez → üretilen koddaki kullanımları bellek içi yedeğe yönlendir
  const withShim = h0 => { const h = String(h0).replace(/\b(?:window\.)?localStorage\b/g, '__satLS').replace(/\b(?:window\.)?sessionStorage\b/g, '__satSS'); return /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, m => m + SHIM) : /<html[^>]*>/i.test(h) ? h.replace(/<html[^>]*>/i, m => m + '<head>' + SHIM + '</head>') : SHIM + h; };
  async function buildApp(req, prev = '') {
    const parts = [{ text: APP_SYS + (prev ? `\n\nMEVCUT UYGULAMA (bunu değiştir, çalışan kısımları bozma):\n${prev.slice(0, 60000)}\n\nİSTENEN DEĞİŞİKLİK: ${req}` : `\n\nİSTEK: ${req}`) }];
    return htmlOf(await gemini(parts, { ms: 180000, models: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'] }));
  }
  function openApp(app) {
    const A = app || { id: 'a' + Date.now().toString(36), ad: '', html: '', t: Date.now(), hist: [] };
    const frame = el('iframe', { class: 'app28', sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-downloads', title: 'Uygulama önizleme', referrerpolicy: 'no-referrer' });
    // Satürn’ün güvenlik politikası (CSP) srcdoc’a da geçer ve satır içi betikleri engeller → uygulama ayrı, CSP’siz ve korumalı run28.html’de çalışır
    let pendingHtml = '', gen = 0;
    const onMsg = e => { if (e.source === frame.contentWindow && e.data?.t === 'saturn-app-ready' && pendingHtml) { frame.contentWindow.postMessage({ t: 'saturn-app', html: pendingHtml }, '*'); } };
    const load = html => { pendingHtml = html; frame.removeAttribute('srcdoc'); frame.src = 'run28.html#' + (++gen); };
    const inp = el('input', { placeholder: A.html ? 'Değişiklik iste (ör. “koyu tema yap”, “toplam satırı ekle”)…' : 'Ne yapan bir uygulama? (ör. “kira–aidat takip tablosu”)', 'aria-label': 'Uygulama isteği' });
    const go = el('button', { type: 'button' }, A.html ? '✎ Değiştir' : '✨ Oluştur'), undo = el('button', { type: 'button', disabled: !A.hist?.length }, '↶ Geri al'), stat = el('span', { class: 'small' }, '');
    const dl = el('button', { type: 'button', disabled: !A.html }, '⬇ İndir'), lib = el('button', { type: 'button' }, '📚 Uygulamalarım');
    const v = overlay('appView', '🧩 UYGULAMA ÜRETİCİ', el('div', { class: 'bar' }, el('div', { class: 'row', style: 'max-width:none;flex:1' }, inp, go)), frame, el('div', { class: 'foot' }, stat, undo, dl, lib));
    window.addEventListener('message', onMsg); cleanup = () => window.removeEventListener('message', onMsg);
    const paint = () => { if (A.html) load(withShim(A.html)); else frame.srcdoc = '<!doctype html><meta charset=utf-8><body style="font:16px system-ui;padding:24px;color:#345;background:#f5f8fb"><h2>🧩 Uygulama üretici</h2><p>Üstteki kutuya ne istediğini yaz: hesap makinesi, oyun, takip tablosu, sayaç, quiz, dönüştürücü, kişisel web sayfası…</p><p>Sonra “koyu yap”, “şu butonu ekle” gibi sözlerle değiştir. Uygulamalar telefonda saklanır.</p>'; dl.disabled = !A.html; undo.disabled = !A.hist?.length; go.textContent = A.html ? '✎ Değiştir' : '✨ Oluştur'; };
    const run = async () => {
      const q = inp.value.trim(); if (!q) return inp.focus(); go.disabled = true; stat.textContent = A.html ? '✎ Değiştiriliyor…' : '✨ Uygulama yazılıyor… (20–60 sn)';
      try { const h = await buildApp(q, A.html); if (A.html) (A.hist ||= []).push(A.html); A.hist = (A.hist || []).slice(-5); A.html = h; A.ad ||= q.slice(0, 50); A.t = Date.now(); await IDB.put(A).catch(() => {}); inp.value = ''; inp.placeholder = 'Değişiklik iste…'; stat.textContent = '✓ Hazır · kaydedildi'; logOp('uygulama üretici', [A.ad], 'başarılı'); paint(); }
      catch (e) { stat.textContent = '⚠️ ' + e.message; }
      go.disabled = false;
    };
    go.onclick = run; inp.onkeydown = e => { if (e.key === 'Enter') run(); };
    undo.onclick = async () => { if (!A.hist?.length) return; A.html = A.hist.pop(); await IDB.put(A).catch(() => {}); stat.textContent = '↶ Önceki sürüm'; paint(); };
    dl.onclick = async () => { const f = new File([A.html], (A.ad || 'uygulama').replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 40) + '.html', { type: 'text/html' }); try { if (navigator.canShare?.({ files: [f] })) return await navigator.share({ files: [f], title: A.ad }); } catch (e) { if (e.name === 'AbortError') return; } const a = el('a', { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); a.remove(); };
    lib.onclick = () => openLibrary();
    paint(); setTimeout(() => inp.focus(), 50);
    window.__app28 = A; window.__app28html = () => pendingHtml;
    return v;
  }
  async function openLibrary() {
    const list = el('div', { class: 'lib28' }), v = overlay('appView', '📚 UYGULAMALARIM', el('div', { class: 'body27', style: 'flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px' }, el('button', { type: 'button', class: 'talk', onclick: () => openApp() }, '✨ Yeni uygulama'), list));
    const A = (await IDB.all().catch(() => [])).sort((a, b) => b.t - a.t);
    list.replaceChildren(...(A.length ? A.map(a => el('div', { class: 'it' }, el('span', {}, '🧩 ' + a.ad), el('small', { class: 'small' }, new Date(a.t).toLocaleDateString('tr-TR')), el('button', { type: 'button', onclick: () => openApp(a) }, 'Aç'), el('button', { type: 'button', 'aria-label': 'Sil', onclick: async e => { await IDB.del(a.id); e.target.closest('.it').remove(); } }, '✕'))) : [el('p', { class: 'small' }, 'Henüz uygulama yok.')]));
    return v;
  }

  /* ================= 5) BARKOD / QR ================= */
  async function product(code) {
    const r = await withTimeout(fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_tr,brands,quantity,nutriscore_grade,nova_group,ingredients_text_tr,ingredients_text,allergens_tags,nutriments,countries_tags`), 12000, 'ürün veritabanı geç yanıt verdi');
    const d = await r.json().catch(() => ({}));
    if (d.status !== 1 || !d.product) return null;
    const p = d.product, n = p.nutriments || {}, al = (p.allergens_tags || []).map(a => a.replace(/^\w+:/, '')).join(', ');
    const nut = [n['energy-kcal_100g'] != null && `${Math.round(n['energy-kcal_100g'])} kcal`, n.sugars_100g != null && `şeker ${n.sugars_100g} g`, n.fat_100g != null && `yağ ${n.fat_100g} g`, n['saturated-fat_100g'] != null && `doymuş yağ ${n['saturated-fat_100g']} g`, n.salt_100g != null && `tuz ${n.salt_100g} g`, n.proteins_100g != null && `protein ${n.proteins_100g} g`].filter(Boolean).join(' · ');
    return `🛒 ${p.product_name_tr || p.product_name || 'Ürün'}${p.brands ? ' — ' + p.brands : ''}${p.quantity ? ' (' + p.quantity + ')' : ''}\nBarkod: ${code}${/^869/.test(code) ? ' · 🇹🇷 Türkiye' : ''}` +
      (p.nutriscore_grade && p.nutriscore_grade !== 'unknown' ? `\nNutri-Score: ${p.nutriscore_grade.toUpperCase()}${p.nova_group ? ' · NOVA ' + p.nova_group + (p.nova_group >= 4 ? ' (ultra işlenmiş)' : '') : ''}` : '') +
      (nut ? `\n100 g’da: ${nut}` : '') + (al ? `\n⚠️ Alerjen: ${al}` : '') + ((p.ingredients_text_tr || p.ingredients_text) ? `\nİçindekiler: ${short(p.ingredients_text_tr || p.ingredients_text, 300)}` : '') + '\n(Kaynak: Open Food Facts)';
  }
  function parseCode(raw, format = '') {
    const s = String(raw || '').trim(); if (!s) return { kind: 'none', text: 'Kod okunamadı.' };
    let m;
    if ((m = s.match(/^WIFI:(.*);;?$/i))) { const f = k => (m[1].match(new RegExp('(?:^|;)' + k + ':((?:\\\\.|[^;])*)')) || [])[1]?.replace(/\\(.)/g, '$1') || ''; return { kind: 'wifi', ssid: f('S'), pass: f('P'), sec: f('T') || 'açık', text: `📶 Wi-Fi: ${f('S')}\nŞifre: ${f('P') || '(yok)'} · Güvenlik: ${f('T') || 'açık'}` }; }
    if (/^https?:\/\//i.test(s)) return { kind: 'url', url: s, text: `🔗 Bağlantı: ${s}` };
    if (/^(?:\d{8}|\d{12,14})$/.test(s) && !/qr/i.test(format)) return { kind: 'product', code: s, text: `Barkod: ${s}` };
    if (/^tel:/i.test(s)) return { kind: 'text', text: '📞 ' + s.slice(4) };
    if (/^BEGIN:VCARD/i.test(s)) return { kind: 'text', text: '👤 Kartvizit:\n' + s.split(/\r?\n/).filter(l => /^(FN|TEL|EMAIL|ORG)/i.test(l)).map(l => l.replace(/^[^:]+:/, '')).join('\n') };
    return { kind: 'text', text: '🔤 ' + s };
  }
  async function showCode(raw, format) {
    const c = parseCode(raw, format), n = bubble('ai', c.text), bar = el('div', { class: 'tool' });
    if (c.kind === 'product') { n.body.textContent = '🔎 Ürün aranıyor… ' + c.code; try { const t = await product(c.code); n.body.textContent = t || `Barkod ${c.code} — ürün veritabanında bulunamadı${/^869/.test(c.code) ? ' (Türk ürünü)' : ''}.`; } catch (e) { n.body.textContent = `Barkod ${c.code} — ${e.message}`; } bar.append(el('button', { type: 'button', onclick: () => window.open('https://www.google.com/search?q=' + c.code, '_blank', 'noopener') }, '🔎 Google’da ara'), el('button', { type: 'button', onclick: () => window.open('https://www.akakce.com/arama/?q=' + c.code, '_blank', 'noopener') }, '💸 Fiyat karşılaştır')); }
    if (c.kind === 'url') bar.append(el('button', { type: 'button', onclick: () => window.open(c.url, '_blank', 'noopener,noreferrer') }, '↗ Bağlantıyı aç'), el('button', { type: 'button', onclick: () => think('Bu bağlantı güvenli mi ve ne anlatıyor? Kısaca: ' + c.url) }, '🛡 İncele/özetle'));
    if (c.kind === 'wifi') bar.append(el('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(c.pass).then(() => note('Şifre kopyalandı.')) }, '📋 Şifreyi kopyala'));
    if (c.kind === 'text') bar.append(el('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(String(raw)).then(() => note('Kopyalandı.')) }, '📋 Kopyala'));
    n.el.append(bar); logOp('barkod/QR', [c.kind], 'başarılı');
    return n;
  }
  async function decodeImage(file) {
    if ('BarcodeDetector' in window) { try { const bd = new window.BarcodeDetector(); const bmp = await createImageBitmap(file); const r = await bd.detect(bmp); if (r[0]) return { raw: r[0].rawValue, format: r[0].format }; } catch {} }
    const im = await prepareImage(file);
    const j = jsonOf(await gemini([{ text: 'Bu fotoğraftaki barkodu veya QR kodu oku. Barkodsa altındaki rakamları, QR ise içeriğini AYNEN ver. YALNIZ JSON: {"tur":"barkod|qr|yok","deger":"..."}' }, { inlineData: { mimeType: im.type, data: im.data } }], { json: true }));
    return { raw: j.tur === 'yok' ? '' : String(j.deger || '').trim(), format: j.tur || '' };
  }
  function openScanner28() {
    const vid = el('video', { class: 'vid28', autoplay: '', muted: '', playsinline: '' }), stat = el('div', { class: 'small' }, 'Kamerayı barkoda/QR’a tut.');
    const pick = el('button', { type: 'button' }, '🖼 Fotoğraftan oku');
    const v = overlay('scan28View', '▦ BARKOD · QR', el('div', { class: 'body27' }, vid, stat, pick));
    let stream = null, iv = null, done = false;
    const finish = async (raw, format) => { if (done) return; done = true; closeAll(); await showCode(raw, format); };
    pick.onclick = () => { const i = el('input', { type: 'file', accept: 'image/*' }); i.style.display = 'none'; i.onchange = async () => { const f = i.files?.[0]; i.remove(); if (!f) return; stat.textContent = 'Okunuyor…'; try { const r = await decodeImage(f); if (!r.raw) { stat.textContent = 'Kod bulunamadı; daha yakından ve net çek.'; return; } finish(r.raw, r.format); } catch (e) { stat.textContent = '⚠️ ' + e.message; } }; document.body.append(i); i.click(); };
    (async () => {
      if (!('BarcodeDetector' in window)) { stat.textContent = 'Bu telefonda canlı tarama yok (iPhone). “Fotoğraftan oku” ile çek; kodu yapay zekâ okur.'; vid.remove(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); vid.srcObject = stream; await vid.play().catch(() => {}); } catch (e) { stat.textContent = 'Kamera açılamadı: ' + e.message + ' — “Fotoğraftan oku”yu kullan.'; return; }
      const bd = new window.BarcodeDetector();
      iv = setInterval(async () => { if (done || vid.readyState < 2) return; try { const r = await bd.detect(vid); if (r[0]?.rawValue) { try { navigator.vibrate?.(80); } catch {} finish(r[0].rawValue, r[0].format); } } catch {} }, 350);
    })();
    cleanup = () => { clearInterval(iv); try { stream?.getTracks().forEach(t => t.stop()); } catch {} };
    return v;
  }

  /* ================= 6) ROTA + YAKIT ================= */
  const here = () => new Promise(res => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, ad: 'bulunduğun yer' }), () => res(null), { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }); });
  async function geocode(q) {
    const r = await withTimeout(fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=tr&q=' + encodeURIComponent(q)), 10000, 'adres servisi geç yanıt verdi');
    const d = (await r.json())[0]; if (!d) throw Error(`“${q}” bulunamadı`);
    return { lat: +d.lat, lon: +d.lon, ad: d.display_name.split(',').slice(0, 2).join(',') };
  }
  const fuelPrice = () => { const F = store.get('fuel', []).filter(f => f.tutar > 0 && f.litre > 0).slice(-3); const own = Number(store.get('set.fuelTL', 0)); return own > 0 ? own : F.length ? F.reduce((s, f) => s + f.tutar / f.litre, 0) / F.length : 0; };
  async function route(to, from) {
    const A = from ? await geocode(from) : (await here()) || await geocode(store.get('set.homeCity', 'Cizre, Şırnak'));
    const B = await geocode(to);
    const r = await withTimeout(fetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=false&alternatives=false`), 15000, 'rota servisi geç yanıt verdi');
    const d = await r.json(); if (d.code !== 'Ok' || !d.routes?.[0]) throw Error('Rota bulunamadı');
    const km = d.routes[0].distance / 1000, min = d.routes[0].duration / 60, L100 = Number(store.get('set.fuelL100', 7)) || 7, price = fuelPrice(), lit = km * L100 / 100;
    const dur = min >= 60 ? `${Math.floor(min / 60)} sa ${Math.round(min % 60)} dk` : `${Math.round(min)} dk`;
    const arrive = new Date(Date.now() + min * 60000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
    const text = `🚗 ${A.ad} → ${B.ad}\n• Mesafe: ${km < 10 ? km.toFixed(1) : Math.round(km)} km\n• Süre: ~${dur} (trafiksiz tahmin; şimdi çıkarsan ≈${arrive})\n• Yakıt: ≈${lit.toFixed(1)} L (${L100} L/100 km)${price ? ` ≈ ${tl(lit * price)} · gidiş-dönüş ≈ ${tl(2 * lit * price)}` : ' — fiyat için “benzin litre fiyatı 45 TL” de veya yakıt alımını kaydet'}`;
    return { text, maps: `https://www.google.com/maps/dir/?api=1&origin=${A.lat},${A.lon}&destination=${B.lat},${B.lon}&travelmode=driving`, km, min };
  }
  async function routeCard(to, from) {
    const n = bubble('ai', '🚗 Rota hesaplanıyor…');
    try { const r = await route(to, from); n.body.textContent = r.text; n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => window.open(r.maps, '_blank', 'noopener') }, '🗺 Haritada yol tarifi'))); logOp('rota', [to], 'başarılı', Math.round(r.km) + ' km'); return r; }
    catch (e) { n.body.textContent = '🚗 Rota hesaplanamadı: ' + e.message; throw e; }
  }

  /* ================= 7) ZİHİN HARİTASI ================= */
  async function mindData(topic, src = '') {
    const j = jsonOf(await gemini([{ text: `“${topic}” için Türkçe bir zihin haritası çıkar. 4–7 ana dal, her dalda 2–5 alt düğüm, gerekirse bir seviye daha. Düğümler 1–5 kelime. YALNIZ JSON: {"k":"merkez","c":[{"k":"dal","c":[{"k":"alt"}]}]}${src ? '\n\nKAYNAK:\n' + src.slice(0, 20000) : ''}` }], { json: true }));
    const clean = (n, d = 0) => ({ k: String(n?.k || n?.ad || n?.title || '').slice(0, 40) || '…', c: d < 3 && Array.isArray(n?.c || n?.children) ? (n.c || n.children).slice(0, 8).map(x => clean(x, d + 1)) : [] });
    const t = clean(j); if (!t.c.length) throw Error('Zihin haritası üretilemedi'); return t;
  }
  function mindSvg(tree, maxW = 0) {
    const COL = ['#3fb6ff', '#ff8a3d', '#5fd38d', '#c77dff', '#ffd23f', '#ff5d8f', '#4dd0e1', '#a3e635'];
    const leaves = n => n.c.length ? n.c.reduce((s, x) => s + leaves(x), 0) : 1, depth = n => 1 + Math.max(0, ...n.c.map(depth)), pad = 14, ROW = 34, COLW = maxW ? Math.max(128, Math.min(210, Math.floor((maxW - 2 * pad) / depth(tree)))) : 210, CH = Math.floor((COLW - 34) / 7.4);
    const nodes = [], links = [];
    let y0 = pad;
    const place = (n, d, color) => { const L = leaves(n); const top = y0; if (n.c.length) { n.c.forEach((c, i) => place(c, d + 1, d === 0 ? COL[i % COL.length] : color)); } else y0 += ROW; const y = n.c.length ? (n.c[0].y + n.c.at(-1).y) / 2 : top + ROW / 2; Object.assign(n, { x: pad + d * COLW, y, d, color: color || '#e8f4ff' }); nodes.push(n); n.c.forEach(c => links.push([n, c])); void L; };
    place(tree, 0, '');
    const W = pad * 2 + (Math.max(...nodes.map(n => n.d)) + 1) * COLW, H = Math.max(y0 + pad, 200);
    const tw = s => Math.min(COLW - 20, Math.min(s.length, CH) * 7.4 + 18);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif"><rect width="100%" height="100%" fill="#05080d"/>` +
      links.map(([a, b]) => `<path d="M${a.x + tw(a.k)} ${a.y} C${a.x + tw(a.k) + 40} ${a.y}, ${b.x - 40} ${b.y}, ${b.x} ${b.y}" fill="none" stroke="${b.color}" stroke-opacity=".7" stroke-width="${a.d === 0 ? 3 : 2}"/>`).join('') +
      nodes.map(n => `<g><rect x="${n.x}" y="${n.y - 13}" rx="9" width="${tw(n.k)}" height="26" fill="${n.d === 0 ? '#0f3350' : '#0d1520'}" stroke="${n.color}" stroke-width="${n.d < 2 ? 2 : 1}"/><text x="${n.x + 9}" y="${n.y + 5}" font-size="${n.d === 0 ? 14 : 13}" font-weight="${n.d < 2 ? 700 : 400}" fill="#e8f4ff">${esc(n.k.length > CH ? n.k.slice(0, CH - 1) + '…' : n.k)}</text></g>`).join('') + '</svg>';
    return { svg, W, H };
  }
  async function mindMap(topic) {
    let src = ''; if (/^(bunu|bunun|son cevab[ıi]|yukarıdaki)/i.test(String(topic).trim())) { src = lastAnswer(); topic = 'yukarıdaki içerik'; }
    const box = el('div', { class: 'mm' }, el('p', { class: 'small', style: 'padding:20px' }, '🧠 Zihin haritası hazırlanıyor…'));
    const dlS = el('button', { type: 'button', disabled: true }, '⬇ SVG'), dlP = el('button', { type: 'button', disabled: true }, '⬇ PNG');
    const v = overlay('mmView', '🧠 ZİHİN HARİTASI', box, el('div', { class: 'foot' }, dlS, dlP));
    try {
      const T = await mindData(topic, src), M = mindSvg(T, Math.min(window.innerWidth, 1200));
      if (!document.getElementById('mmView')) return T;
      box.innerHTML = M.svg; const sv = box.querySelector('svg'); if (sv && M.W > box.clientWidth) { sv.style.width = '100%'; sv.style.height = 'auto'; } dlS.disabled = dlP.disabled = false;
      const name = (T.k || 'zihin-haritasi').replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 40) || 'zihin-haritasi';
      const save = (blob, ext) => { const a = el('a', { href: URL.createObjectURL(blob), download: name + ext }); document.body.append(a); a.click(); a.remove(); };
      dlS.onclick = () => save(new Blob([M.svg], { type: 'image/svg+xml' }), '.svg');
      dlP.onclick = () => { const img = new Image(); img.onload = () => { const k = Math.min(2, 8000 / Math.max(M.W, M.H)), c = document.createElement('canvas'); c.width = M.W * k; c.height = M.H * k; const x = c.getContext('2d'); x.scale(k, k); x.drawImage(img, 0, 0); c.toBlob(b => save(b, '.png'), 'image/png'); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(M.svg); };
      logOp('zihin haritası', [T.k], 'başarılı');
      return T;
    } catch (e) { box.replaceChildren(el('p', { class: 'small', style: 'padding:20px' }, '⚠️ ' + e.message)); throw e; }
  }

  /* ================= 8) KENDİ ENTEGRASYONLARIN (webhook) ================= */
  const hooks = () => store.get('hooks', []);
  const slug = s => fold(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
  function hookAdd(ad, url, aciklama = '', method = 'POST') {
    ad = String(ad || '').trim(); url = String(url || '').trim();
    if (!ad || !/^https:\/\/[^\s]+$/i.test(url)) throw Error('Ad ve https:// ile başlayan webhook adresi gerekli');
    const H = hooks().filter(h => slug(h.ad) !== slug(ad)); H.push({ id: slug(ad), ad, url, aciklama: String(aciklama).slice(0, 200), method: /get/i.test(method) ? 'GET' : 'POST' }); store.set('hooks', H.slice(-20)); paintHooks();
    return `✓ “${ad}” entegrasyonu eklendi. Artık “${ad} tetikle: …” diyebilirsin; yapay zekâ da gerektiğinde kullanır (her seferinde onay ister).`;
  }
  async function hookRun(name, text = '') {
    const h = hooks().find(x => x.id === slug(name)) || hooks().find(x => fold(x.ad).includes(fold(name))); if (!h) throw Error(`“${name}” adlı entegrasyon yok`);
    const payload = { text: String(text), source: 'SATÜRN', time: new Date().toISOString() };
    const url = h.method === 'GET' ? h.url + (h.url.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(text) : h.url;
    try {
      const r = await withTimeout(fetch(url, h.method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 20000, 'entegrasyon geç yanıt verdi');
      const t = (await r.text().catch(() => '')).slice(0, 1500); logOp('entegrasyon', [h.ad], r.ok ? 'başarılı' : 'hata', 'HTTP ' + r.status);
      return `${r.ok ? '✓' : '⚠️'} ${h.ad}: HTTP ${r.status}${t ? '\n' + t : ''}`;
    } catch (e) {
      if (h.method === 'GET') throw e;
      // tarayıcı CORS engeli: isteği yine de gönder (yanıt okunamaz)
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
      logOp('entegrasyon', [h.ad], 'başarılı', 'no-cors');
      return `✓ ${h.ad}: gönderildi (servis yanıtı tarayıcıya kapalı, içeriği okunamadı).`;
    }
  }
  const hookList = el('div', { class: 'lib28' });
  function paintHooks() { hookList.replaceChildren(...(hooks().length ? hooks().map(h => el('div', { class: 'it' }, el('span', {}, `🔌 ${h.ad} · ${h.method}${h.aciklama ? ' — ' + h.aciklama : ''}`), el('button', { type: 'button', onclick: async () => { try { note(await hookRun(h.ad, 'SATÜRN test')); } catch (e) { note(e.message); } } }, 'Dene'), el('button', { type: 'button', 'aria-label': 'Sil', onclick: () => { store.set('hooks', hooks().filter(x => x.id !== h.id)); paintHooks(); } }, '✕'))) : [el('small', { class: 'muted' }, 'Henüz entegrasyon yok.')])); }

  /* ================= panel ================= */
  const hName = el('input', { placeholder: 'Ad (ör. Işıklar, Sheets’e yaz)', 'aria-label': 'Entegrasyon adı' }), hUrl = el('input', { placeholder: 'https://hook.make.com/… veya n8n/Zapier/HA adresi', 'aria-label': 'Webhook adresi', autocomplete: 'off' }), hDesc = el('input', { placeholder: 'Ne yapar? (yapay zekâ buna bakarak kullanır)', 'aria-label': 'Açıklama' });
  const nanoState = el('small', { class: 'muted' }, '');
  const box = el('div', { id: 'e28Box' }, el('h3', {}, 'YENİ NESİL ARAÇLAR'),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: () => openApp() }, '🧩 Uygulama üret'), el('button', { type: 'button', class: 'btn', onclick: () => openLibrary() }, '📚 Uygulamalarım'),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => { const q = prompt('Podcast konusu (veya link)'); if (q) podcast(q).catch(() => {}); } }, '🎧 Podcast'),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => openScanner28() }, '▦ Barkod/QR'),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => { const q = prompt('Zihin haritası konusu'); if (q) mindMap(q).catch(() => {}); } }, '🧠 Zihin haritası')),
    el('div', { class: 'field' }, el('label', {}, 'Cihaz içi yapay zekâ (Gemini Nano)'), nanoState, el('button', { type: 'button', class: 'btn ghost', onclick: async () => { nanoState.textContent = (await nanoStatus()).msg; } }, 'Durumu kontrol et')),
    el('div', { class: 'field' }, el('label', { for: 'fuelL100' }, 'Aracın yakıt tüketimi (L/100 km) · benzin fiyatı (TL/L)'), el('div', { class: 'row' }, (() => { const i = el('input', { id: 'fuelL100', type: 'number', step: '0.1', inputmode: 'decimal' }); i.value = store.get('set.fuelL100', 7); i.onchange = () => store.set('set.fuelL100', Number(i.value) || 7); return i; })(), (() => { const i = el('input', { id: 'fuelTL', type: 'number', step: '0.01', inputmode: 'decimal', placeholder: 'otomatik' }); i.value = store.get('set.fuelTL', '') || ''; i.onchange = () => store.set('set.fuelTL', Number(i.value) || 0); return i; })())),
    el('details', {}, el('summary', {}, '🔌 Kendi entegrasyonların (Make · Zapier · n8n · IFTTT · Home Assistant)'),
      el('p', { class: 'muted' }, 'Bir servis webhook adresi verir (ör. Make → Webhooks → Custom webhook). Buraya ekle; Satürn “ad tetikle: metin” deyince ya da yapay zekâ gerekli görünce, onayınla, o adrese metni gönderir. Böylece Google Sheets’e satır ekleme, akıllı prize komut, e-posta gönderme gibi binlerce işe bağlanırsın.'),
      hName, hUrl, hDesc, el('button', { type: 'button', class: 'btn', onclick: () => { try { note(hookAdd(hName.value, hUrl.value, hDesc.value)); hName.value = hUrl.value = hDesc.value = ''; } catch (e) { note(e.message); } } }, '+ Ekle'), hookList));
  ($('p-settings') || $('p-system'))?.append(box); paintHooks();
  if (LM()) nanoStatus().then(s => { nanoState.textContent = s.msg; }).catch(() => {}); else nanoState.textContent = 'Bu tarayıcıda yok (bilgisayarda güncel Chrome’da çalışır).';

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    uygulama_uret: { d: 'uygulama_uret|istek — tek dosyalık çalışan web uygulaması/oyun/araç/site üretir, canlı önizleme açar', run: ([q]) => { const v = openApp(); const i = v.querySelector('input'); if (q) { i.value = q; v.querySelector('.bar .row button').click(); } return 'Uygulama üretici açıldı' + (q ? '; üretiliyor.' : '.'); } },
    podcast_yap: { d: 'podcast_yap|konu veya link veya “bunu” — iki sunuculu Türkçe sesli podcast üretir', run: async ([q]) => `🎧 Podcast hazır: ${await podcast(q || 'günün konusu')}` },
    barkod_oku: { d: 'barkod_oku|barkod numarası (isteğe bağlı) — barkod/QR tarayıcı; numara verilirse ürün bilgisini getirir', run: async ([c]) => { if (c && /^\d{8,14}$/.test(String(c).trim())) return (await product(String(c).trim())) || 'Ürün bulunamadı.'; openScanner28(); return 'Barkod/QR tarayıcı açıldı.'; } },
    rota: { d: 'rota|nereye|nereden (boşsa bulunduğun yer) — mesafe, süre, yakıt maliyeti', run: async ([to, from]) => (await routeCard(to, from)).text },
    zihin_haritasi: { d: 'zihin_haritasi|konu veya “bunu” — görsel zihin haritası', run: async ([q]) => { const T = await mindMap(q || 'bunu'); return `🧠 Zihin haritası açıldı: ${T.k} (${T.c.length} ana dal).`; } },
    cihaz_ici_yz: { d: 'cihaz_ici_yz|soru — internetsiz cihaz içi model (Gemini Nano) ile cevap; soru boşsa durum', run: async ([q]) => q ? '📱 ' + await nanoAsk(q) : (await nanoStatus()).msg },
    entegrasyon: { d: 'entegrasyon|ad|metin — Beyhan’ın eklediği webhook entegrasyonunu tetikler', run: async ([a, t]) => hookRun(a, t || '') },
    entegrasyon_ekle: { d: 'entegrasyon_ekle|ad|https webhook adresi|açıklama|POST/GET', run: ([a, u, d, m]) => hookAdd(a, u, d, m) }
  });
  WRITE_TOOLS.add('entegrasyon'); WRITE_TOOLS.add('entegrasyon_ekle');
  TOOL_GROUPS.push([/uygulama|app|oyun|site|sayfa yap|araç yap|podcast|sesli özet|barkod|qr|ürün|rota|yol|kaç km|ne kadar sürer|mesafe|yakıt|zihin|harita|mind|cihaz içi|internetsiz|nano|entegrasyon|webhook|tetikle|make|zapier|n8n/i, /^(uygulama_uret|podcast_yap|barkod_oku|rota|zihin_haritasi|cihaz_ici_yz|entegrasyon|entegrasyon_ekle)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nYENİ NESİL: “… yapan uygulama/oyun/site yap” → uygulama_uret; konuyu/linki sesli sohbet → podcast_yap; barkod/QR → barkod_oku; “X’e ne kadar sürer / kaç km / yol” → rota; konuyu görsel şemaya dök → zihin_haritasi; internetsiz cevap → cihaz_ici_yz.' + (hooks().length ? '\nBEYHAN’IN ENTEGRASYONLARI (entegrasyon|ad|metin ile tetikle, onay gerekir): ' + hooks().map(h => `${h.ad}${h.aciklama ? ' (' + h.aciklama + ')' : ''}`).join('; ') : '');
  const _lc = localCommand;
  localCommand = text0 => {
    const raw = String(text0 || '').trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''), t = raw.toLocaleLowerCase('tr-TR'); let m;
    if (guest()) return _lc(text0);
    try {
      if (/^(uygulama üret|uygulama üretici|uygulama yap|app yap)$/.test(t)) { openApp(); return '🧩 Uygulama üretici açıldı.'; }
      if (/^(uygulamalarım|ürettiğim uygulamalar)$/.test(t)) { openLibrary(); return '📚 Uygulamaların açıldı.'; }
      if ((m = raw.match(/^(?:bana\s+)?(.{4,300}?)\s+(?:yapan|gösteren|hesaplayan|takip eden|oynatan)\s+(?:bir\s+)?(?:uygulama|app|oyun|site|web sitesi|sayfa|araç)\s+(?:yap|oluştur|üret|kodla|yaz)$/i)) || (m = raw.match(/^(?:bana\s+)?(?:bir\s+)?(.{3,200}?)\s+(?:uygulaması|oyunu|sitesi|web sitesi)\s+(?:yap|oluştur|üret|kodla)$/i)) || (m = raw.match(/^(?:uygulama|app|oyun|site)\s+(?:yap|üret|oluştur)\s*[:,]\s*(.{3,300})$/i))) { TOOLS.uygulama_uret.run([raw]); return '🧩 Uygulamayı yazıyorum; önizleme açıldı (20–60 sn).'; }
      if ((m = raw.match(/^(?:(.{2,300}?)\s+(?:hakkında|için|konulu)\s+)?(?:bir\s+)?podcast\s*(?:yap|hazırla|oluştur|üret)?(?:\s*[:,]\s*(.{2,300}))?$/i)) && (m[1] || m[2] || /podcast (?:yap|hazırla|oluştur|üret)/i.test(raw))) { const q = (m[2] || m[1] || 'bunu').trim(); podcast(q).catch(() => {}); return '🎧 Podcast hazırlanıyor (1–2 dk): önce metin, sonra iki sunuculu ses.'; }
      if ((m = raw.match(/^(?:bunu\s+)?(?:sesli özet|sesli sohbet)\s*(?:yap|hazırla)?(?:\s*[:,]\s*(.{2,300}))?$/i))) { podcast((m[1] || 'bunu').trim()).catch(() => {}); return '🎧 Sesli özet hazırlanıyor…'; }
      if (/^(barkod oku|barkod tara|qr oku|qr kod oku|qr tara|karekod oku|ürün tara|barkod)$/.test(t)) { openScanner28(); return '▦ Barkod/QR tarayıcı açıldı.'; }
      if ((m = t.match(/^(\d{8}|\d{12,14})\s*(?:barkod(?:u|lu ürün)?|ürün)?\s*(?:nedir|ne)?$/))) { showCode(m[1], 'ean'); return '🔎 Barkod aranıyor…'; }
      // “ne kadar sürer / kaç saat” yalnız özel adla (kesme işaretiyle) rota sayılır: “iyileşme ne kadar sürer” rota değildir
      const VERB = '(ne kadar sürer|kaç km|kaç kilometre|kaç saat(?:te gidilir)?|yol tarifi|rota|nasıl giderim|mesafe(?: ne kadar)?|gitmek ne kadar tutar)', strong = v => !/^(ne kadar sürer|kaç saat)/i.test(v) || /['’]/.test(raw);
      if ((m = raw.match(new RegExp("^(.{2,60}?)(?:['’]?(?:dan|den|tan|ten))\\s+(.{2,60}?)(?:['’]?(?:ya|ye|a|e|na|ne))\\s+" + VERB + '$', 'i'))) && strong(m[3])) { routeCard(m[2], m[1]).catch(() => {}); return '🚗 Rota hesaplanıyor…'; }
      if (((m = raw.match(new RegExp("^(.{2,60}?)(?:['’]?(?:ya|ye|a|e|na|ne))\\s+" + VERB + '$', 'i'))) && strong(m[2])) || (m = raw.match(/^(?:rota|yol tarifi|mesafe)\s*[:,]\s*(.{2,60})$/i))) { routeCard(m[1]).catch(() => {}); return '🚗 Rota hesaplanıyor…'; }
      if ((m = t.match(/^(?:benzin|motorin|mazot|yakıt)\s+(?:litre\s+)?fiyatı\s+(\d+(?:[.,]\d+)?)\s*(?:tl)?$/))) { store.set('set.fuelTL', Number(m[1].replace(',', '.'))); return `⛽ Yakıt fiyatı ${m[1]} TL/L olarak kaydedildi; rota hesaplarında kullanırım.`; }
      if ((m = t.match(/^(?:aracım|arabam)\s+(?:100\s*km\s*['’]?\s*(?:de|da)\s+)?(\d+(?:[.,]\d+)?)\s*(?:litre|lt|l)\s*(?:yakar|harcar|yakıyor)?$/))) { store.set('set.fuelL100', Number(m[1].replace(',', '.'))); return `⛽ Tüketim ${m[1]} L/100 km olarak kaydedildi.`; }
      if ((m = raw.match(/^(?:(.{2,200}?)\s+(?:için\s+)?)?zihin haritası\s*(?:çıkar|yap|oluştur|çiz)?(?:\s*[:,]\s*(.{2,200}))?$/i)) && (m[1] || m[2] || /zihin haritası (?:çıkar|yap|oluştur|çiz)/i.test(raw))) { mindMap((m[2] || m[1] || 'bunu').replace(/^(bunun|bunu)$/i, 'bunu').trim()).catch(() => {}); return '🧠 Zihin haritası hazırlanıyor…'; }
      if (/^(cihaz içi yapay zek[aâ]|cihaz içi yz|gemini nano|internetsiz yapay zek[aâ])(?: durumu)?$/.test(t)) { nanoStatus().then(s => show('📱 ' + s.msg)); return 'Cihaz içi yapay zekâ kontrol ediliyor…'; }
      if (/^cihaz içi yapay zek[aâ]y[ıi] (?:indir|kur|hazırla)$/.test(t)) { nanoSession(p => note(`📱 Model iniyor: %${p}`)).then(() => { ND.state = 'available'; show('📱 Cihaz içi yapay zekâ hazır.'); }).catch(e => show('📱 Kurulamadı: ' + e.message)); return '📱 Cihaz içi model hazırlanıyor (ilk kez birkaç dakika sürebilir)…'; }
      if ((m = raw.match(/^(?:cihazda|internetsiz)\s+sor\s*[:,]\s*(.{2,2000})$/i))) { nanoAsk(m[1]).then(r => show('📱 ' + r)).catch(e => show('📱 ' + e.message)); return '📱 Cihaz içi model düşünüyor…'; }
      if (/^(entegrasyonlarım|entegrasyonlar|webhooklarım)$/.test(t)) return hooks().length ? '🔌 ENTEGRASYONLAR\n' + hooks().map(h => `• ${h.ad}${h.aciklama ? ' — ' + h.aciklama : ''} (“${h.ad.toLocaleLowerCase('tr-TR')} tetikle: …”)`).join('\n') : 'Henüz entegrasyon yok. Ayarlar → YENİ NESİL ARAÇLAR → Kendi entegrasyonların.';
      if ((m = raw.match(/^(.{2,40}?)\s+tetikle(?:\s*[:,]\s*(.{0,2000}))?$/i)) && hooks().some(h => h.id === slug(m[1]) || fold(h.ad).includes(fold(m[1])))) { const a = m[1], tx = m[2] || ''; hookRun(a, tx).then(show, e => show('⚠️ ' + e.message)); return `🔌 ${a} tetikleniyor…`; }
      if (/^(ekranımı paylaş|ekranımı izle|canlı ekran paylaşımı|ekranımı canlı izle|ekranımı gör)$/.test(t)) {
        setTimeout(() => { const n = bubble('ai', '🖥 Ekran paylaşımı CANLI modda çalışır (bilgisayarda). Dokun:'); n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'btn', onclick: () => { if (window.jarvisLive?.active?.()) window.jarvisLive.screenStart(); else note('Önce CANLI’yı aç (mikrofon düğmesi), sonra sağdaki 🖥 düğmesine dokun.'); } }, '🖥 Ekranı paylaş'))); }, 0);
        return '🖥 Canlı ekran paylaşımı: Satürn ekranını görerek konuşur.';
      }
      if (/^(yeni nesil araçlar|neler yeni|yeni özellikler)$/.test(t)) return '🚀 YENİ NESİL\n• “kira takip uygulaması yap” → çalışan uygulama + canlı önizleme, sözle düzenle\n• “yapay zekâ hakkında podcast yap” / “bunu sesli özet yap” → iki sunuculu sesli sohbet\n• “barkod oku” → ürün içeriği, alerjen, Nutri-Score · QR → link/Wi-Fi\n• “Mardin’e ne kadar sürer” → km, süre, yakıt TL\n• “zihin haritası: kripto para” / “bunu zihin haritası yap”\n• CANLI’da 🖥 ile ekranını paylaş (bilgisayar)\n• Cihaz içi yapay zekâ (internetsiz, destekleyen Chrome’da)\n• Kendi entegrasyonların: Make/Zapier/n8n/Home Assistant';
    } catch (e) { return e.message; }
    return _lc(text0);
  };
  window.jarvisE28 = { withShim, nanoStatus, nanoAsk, podcast, podScript, multiTts, lineTts, pcm16ToWav, openApp, openLibrary, buildApp, htmlOf, IDB, openScanner28, decodeImage, parseCode, showCode, product, route, routeCard, geocode, mindMap, mindData, mindSvg, hookAdd, hookRun, hooks, closeAll };
})();
