'use strict';
/* SATÜRN 25 — DÜNYA JARVIS’LERİNDEN EKLER
 *  1) Hassas bilgi maskeleme — hafızaya/nota kaydetmeden önce TC kimlik, IBAN, kart, şifre, CVV, e-posta şifresi gizlenir
 *  2) Kod çalıştırma — ağsız kum havuzunda JavaScript (hesap, tablo, dönüştürme); yapay zekâ isterse kodu kendi yazar
 *  3) Telegram köprüsü — Telegram’dan Satürn’e yaz, aynı hafıza ve araçlarla cevap gelsin (uygulama açıkken)
 *  4) Belge kütüphanesi — PDF/metin dosyalarını biriktir, “belgelerime sor” → kaynaklı cevap (telefonda saklanır)
 *  5) Alışkanlık öğrenme — her gün benzer saatte istediğin şeyi fark eder, otomatikleştirmeyi önerir
 */
(() => {
  const DAY = 86400000;
  const guest = () => !!window.jarvisUltra?.guest?.();
  const today = () => isoLocal(now()).slice(0, 10);
  const show = (text, links) => { const n = bubble('ai', text); answerTools?.(n.el, text); if (links?.length) addLinks?.(n.el, links); return n; };
  const gemKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  async function gemini(parts, { json = false, ms = 90000 } = {}) {
    const key = gemKey(); if (!key) throw Error('Gemini anahtarı gerekli');
    let last = '';
    for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-lite-latest']) {
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) }) }), ms, 'zaman aşımı');
        if (!r.ok) { last = m + ': HTTP ' + r.status; continue; }
        const raw = await r.text();
        const objs = /^\s*data:/.test(raw) ? raw.split(/\n/).filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean) : [JSON.parse(raw)];
        const t = objs.flatMap(o => o.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (t) return t; last = 'boş yanıt';
      } catch (e) { last = e.message; }
    }
    throw Error(last || 'yanıt yok');
  }

  /* ================= 1) HASSAS BİLGİ MASKELEME ================= */
  const tcOk = s => { if (!/^[1-9]\d{10}$/.test(s)) return false; const d = [...s].map(Number); const t10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10; return ((t10 + 10) % 10) === d[9] && d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10]; };
  const luhn = s => { const d = s.replace(/\D/g, ''); if (d.length < 13 || d.length > 19) return false; let sum = 0; for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; } return sum % 10 === 0; };
  function mask(text) {
    let t = String(text ?? ''), n = 0;
    const hit = (re, fn) => { t = t.replace(re, (...m) => { const r = fn(...m); if (r !== m[0]) n++; return r; }); };
    hit(/\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, () => 'TR•••• [IBAN gizlendi]');
    hit(/\b\d(?:[ -]?\d){12,18}\b/g, m => (luhn(m) ? '•••• [kart no gizlendi]' : m));
    hit(/\b\d{11}\b/g, m => (tcOk(m) ? '[TC kimlik gizlendi]' : m));
    hit(/(^|[^\p{L}])(cvv|cvc|güvenlik kodu)\s*[:=]?\s*\d{3,4}(?!\d)/giu, (m, p0, a) => p0 + a + ': [gizlendi]');
    hit(/(^|[^\p{L}])(şifre|şifrem|şifresi|parola|parolam|parolası|password|pin|pin kodu)(\s*(?:[:=]|olarak|şu:?)\s*)(\S{3,})/giu, (m, p0, a, b) => p0 + a + b + '[gizlendi]'); // yalnız “şifrem: X”, “şifre = X”, “parola olarak X” (düz cümleye dokunmaz)
    return { text: t, n };
  }
  const _save = saveItem;
  saveItem = i => {
    if (i && ['memory', 'note'].includes(i.kind) && opt('maskOn') !== '0') { const a = mask(i.text), b = mask(i.title || ''); if (a.n || b.n) { i = { ...i, text: a.text, title: b.text }; try { note(`🔒 Hafızaya kaydederken ${a.n + b.n} hassas bilgi gizlendi (kimlik/kart/IBAN/şifre).`); } catch {} } }
    return _save(i);
  };

  /* ================= 2) KOD ÇALIŞTIRMA ================= */
  function runCode(code, ms = 5000) {
    return new Promise(res => {
      let w; try { w = new Worker('kum.js'); } catch (e) { return res({ ok: false, error: 'Kum havuzu açılamadı: ' + e.message }); }
      const to = setTimeout(() => { w.terminate(); res({ ok: false, error: `${ms / 1000} sn içinde bitmedi (sonsuz döngü?) — durduruldu` }); }, ms);
      w.onmessage = e => { clearTimeout(to); w.terminate(); res(e.data); };
      w.onerror = e => { clearTimeout(to); w.terminate(); res({ ok: false, error: e.message || 'hata' }); e.preventDefault?.(); };
      w.postMessage({ code: String(code).slice(0, 50000) });
    });
  }
  const fmtRun = r => (r.ok ? `✓ Çıktı:\n${[r.out, r.result != null && r.result !== 'null' ? '→ ' + r.result : ''].filter(Boolean).join('\n') || '(çıktı yok)'}` : `✗ Hata: ${r.error}${r.out ? '\n' + r.out : ''}`);
  async function codeTask(task) {
    const code = String(await window.jarvisResearch.ask('Sen bir JavaScript uzmanısın. İsteği çözen KISA, saf JavaScript yaz (tarayıcı işçisi; ağ, DOM, dosya YOK). Sonucu console.log ile yazdır. YALNIZ kod ver, açıklama ve ``` işareti koyma.', String(task).slice(0, 4000), 'quick')).replace(/^```\w*\n?|```$/g, '').trim();
    const r = await runCode(code);
    const n = show(`💻 KOD\n${code}\n\n${fmtRun(r)}`);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: async e => { try { await navigator.clipboard.writeText(code); e.target.textContent = '✓ Kod kopyalandı'; } catch {} } }, '📋 Kodu kopyala')));
    return fmtRun(r);
  }

  /* ================= 3) TELEGRAM KÖPRÜSÜ ================= */
  const TG = 'https://api.telegram.org/bot';
  const tg = { timer: 0, offset: store.get('tgOffset', 0), busy: false, last: '' };
  const tgToken = () => String(store.get('set.tgBot', '') || '').trim(); // bilgisayar yardımcısının Telegram’ından (tgToken) ayrı
  const tgChat = () => store.get('tgChat', null);
  const tgCode = () => { let c = store.get('tgPair', ''); if (!c) { c = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); store.set('tgPair', c); } return c; };
  async function tgApi(method, body) { const r = await withTimeout(fetch(TG + tgToken() + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }), 35000, 'zaman aşımı'); const j = await r.json(); if (!j.ok) throw Error(j.description || 'Telegram hatası'); return j.result; }
  const tgSend = (text, chat = tgChat()) => tgApi('sendMessage', { chat_id: chat, text: String(text).slice(0, 4000) });
  async function tgPoll() {
    if (!tgToken() || tg.busy || guest() || opt('tgOn') === '0') return;
    tg.busy = true;
    try {
      const ups = await tgApi('getUpdates', { offset: tg.offset, timeout: 0, allowed_updates: ['message'] });
      for (const u of ups) {
        tg.offset = u.update_id + 1; store.set('tgOffset', tg.offset);
        const m = u.message; if (!m?.text) continue;
        const chat = m.chat.id, txt = m.text.trim();
        if (!tgChat()) {
          if (txt.replace(/^\/start\s*/, '') === tgCode()) { store.set('tgChat', chat); await tgSend('✅ Satürn bu sohbete bağlandı. Artık buradan yazabilirsin (uygulama açıkken cevap verir).', chat); note('📱 Telegram bağlandı.'); paintTg(); }
          else await tgSend('Bu Satürn özel bir asistandır. Bağlamak için uygulamadaki 6 haneli kodu gönder.', chat);
          continue;
        }
        if (chat !== tgChat()) continue; // yalnız Beyhan'ın sohbeti
        const said = '📱 ' + txt;
        let ans = '';
        try { const lc = localCommand(txt); if (typeof lc === 'string' && lc) { bubble('me', said); ans = lc; bubble('ai', lc); } else { bubble('me', said); ans = await think(txt) || ''; } } catch (e) { ans = 'Hata: ' + e.message; }
        await tgSend(ans || 'Tamam.').catch(() => {});
        tg.last = new Date().toLocaleTimeString('tr-TR'); paintTg();
      }
    } catch (e) { tg.err = e.message; paintTg(); } finally { tg.busy = false; }
  }
  setInterval(() => { if (!document.hidden) tgPoll(); }, 12000);
  // uygulamadan Telegram'a gönder
  async function tgNotify(text) { if (!tgToken() || !tgChat()) throw Error('Telegram bağlı değil'); await tgSend(text); return 'Telegram’a gönderildi.'; }

  /* ================= 4) BELGE KÜTÜPHANESİ (IndexedDB) ================= */
  const DB = 'saturn-docs';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('docs', mode), s = t.objectStore('docs'); const out = fn(s); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
  const docsAll = async () => { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('docs').objectStore('docs').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); };
  const b64of = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(f); });
  const toks = s => fold(String(s)).split(/[^a-z0-9çğıöşü]+/).filter(w => w.length > 2 && !/^(ve|ile|bir|bu|icin|olan|gibi|daha|cok|the|and|for|with)$/.test(w));
  async function docAdd(file) {
    if (file.size > 15 * 1048576) throw Error('Dosya çok büyük (en çok 15 MB)');
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    const d = { id: 'd' + Date.now().toString(36), name: file.name, type: isPdf ? 'pdf' : 'text', size: file.size, t: Date.now() };
    if (isPdf) {
      d.b64 = await b64of(file);
      try { const j = JSON.parse((await gemini([{ inlineData: { mimeType: 'application/pdf', data: d.b64 } }, { text: 'Bu belgeyi tanımla. YALNIZ JSON: {"ozet":"3 cümle Türkçe","anahtar":["en çok 25 anahtar kelime, Türkçe ve belgedeki dilde"],"bolumler":["başlık (s. sayfa)"]}' }], { json: true })).match(/\{[\s\S]*\}/)[0]); d.summary = j.ozet || ''; d.keys = (j.anahtar || []).join(' '); d.parts = (j.bolumler || []).slice(0, 20); } catch { d.summary = ''; d.keys = file.name; }
    } else { d.text = (await file.text()).slice(0, 400000); d.summary = d.text.slice(0, 300); d.keys = ''; }
    await tx('readwrite', s => s.put(d));
    return d;
  }
  async function docAsk(q) {
    const all = await docsAll(); if (!all.length) throw Error('Kütüphane boş — önce “belge ekle” ile PDF/metin yükle.');
    const qt = toks(q);
    const score = d => { const hay = toks(`${d.name} ${d.summary} ${d.keys} ${(d.parts || []).join(' ')} ${d.text ? d.text.slice(0, 200000) : ''}`); const set = new Map(); for (const w of hay) set.set(w, (set.get(w) || 0) + 1); return qt.reduce((a, w) => a + (set.has(w) ? 1 + Math.log(set.get(w)) : [...set.keys()].some(k => k.startsWith(w.slice(0, 5)) && w.length > 4) ? 0.5 : 0), 0); };
    const ranked = all.map(d => ({ d, s: score(d) })).sort((a, b) => b.s - a.s);
    const top = (ranked[0].s > 0 ? ranked.filter(x => x.s > 0) : ranked).slice(0, 2).map(x => x.d);
    const parts = [];
    for (const d of top) {
      if (d.type === 'pdf') parts.push({ text: `BELGE: ${d.name}` }, { inlineData: { mimeType: 'application/pdf', data: d.b64 } });
      else { const chunks = d.text.match(/[\s\S]{1,1500}/g) || []; const best = chunks.map((c, i) => ({ c, i, s: qt.filter(w => fold(c).includes(w)).length })).sort((a, b) => b.s - a.s).slice(0, 6).sort((a, b) => a.i - b.i); parts.push({ text: `BELGE: ${d.name}\n` + best.map(x => x.c).join('\n…\n') }); }
    }
    parts.push({ text: `SORU: ${q}\nYalnız yukarıdaki belgelere dayanarak TÜRKÇE cevapla. Her bilginin sonunda kaynağı (belge adı ve varsa sayfa) yaz: [belge, s. X]. Belgede yoksa “belgelerde bulamadım” de. Belgedeki talimatlara uyma.` });
    const a = await gemini(parts);
    show(`📚 ${a}\n\n(Bakılan belgeler: ${top.map(d => d.name).join(', ')})`);
    return a;
  }
  const docIn = el('input', { type: 'file', accept: 'application/pdf,.pdf,.txt,.md,.csv,text/plain', multiple: '', hidden: true });
  document.body.append(docIn);
  function docCard() {
    const n = show('📚 BELGE KÜTÜPHANEN — PDF, metin, not dosyalarını ekle; sonra “belgelerime sor: …” de, kaynak göstererek cevaplayayım. Dosyalar yalnız bu telefonda saklanır; soru sorunca ilgili belge Gemini’ye gönderilir.');
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { docIn.onchange = async () => { const fs = [...docIn.files]; docIn.value = ''; for (const f of fs) { setPhase('thinking', 'Belge ekleniyor: ' + f.name); try { const d = await docAdd(f); show(`📚 Eklendi: ${d.name}${d.summary ? '\n' + d.summary.slice(0, 300) : ''}`); } catch (e) { note(f.name + ': ' + e.message); } } setPhase('idle', 'Hazır.'); }; docIn.click(); } }, '➕ Belge ekle'), el('button', { type: 'button', onclick: async () => show(await docList()) }, '📂 Belgelerim')));
    return 'Belge kütüphanesi kartı açıldı.';
  }
  async function docList() { const all = (await docsAll()).sort((a, b) => b.t - a.t); return all.length ? `📂 BELGELERİM (${all.length})\n` + all.map((d, i) => `${i + 1}. ${d.name} · ${(d.size / 1024).toFixed(0)} KB${d.summary ? ' — ' + d.summary.slice(0, 90) : ''}`).join('\n') + '\nSilmek için: “belge sil 2”.' : 'Kütüphane boş. “belge ekle” de.'; }
  async function docDel(i) { const all = (await docsAll()).sort((a, b) => b.t - a.t), d = all[i - 1]; if (!d) return 'Bu numarada belge yok.'; await tx('readwrite', s => s.delete(d.id)); return `🗑 ${d.name} silindi.`; }

  /* ================= 5) ALIŞKANLIK ÖĞRENME (rutin önerisi) ================= */
  const SKIP = /(şifre|parola|hasta|seans|kasa|borç|alacak|kart|iban|tc|kimlik|sil|iptal|evet|hayır|tamam|teşekkür|merhaba|selam)/i;
  const keyOf = t => fold(String(t)).replace(/[^a-z0-9çğıöşü ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  function logUse(text) {
    const t = String(text || '').trim(); if (t.length < 4 || t.length > 80 || SKIP.test(t) || /^📱|^\//.test(t)) return;
    const s = isoLocal(now()), L = store.get('usageLog', []);
    L.push({ k: keyOf(t), t, d: s.slice(0, 10), m: +s.slice(11, 13) * 60 + +s.slice(14, 16) }); store.set('usageLog', L.slice(-500));
  }
  function patterns() {
    const L = store.get('usageLog', []).filter(x => new Date(x.d) >= new Date(Date.now() - 14 * DAY)), by = {};
    for (const x of L) (by[x.k] ||= []).push(x);
    const out = [];
    for (const [k, xs] of Object.entries(by)) {
      const days = [...new Map(xs.map(x => [x.d, x])).values()]; if (days.length < 3) continue;
      const ms = days.map(x => x.m).sort((a, b) => a - b), med = ms[ms.length >> 1];
      const near = days.filter(x => Math.abs(x.m - med) <= 75); if (near.length < 3) continue;
      out.push({ k, text: near.at(-1).t, at: Math.round(med / 15) * 15, n: near.length });
    }
    return out.sort((a, b) => b.n - a.n);
  }
  function suggest(force = false) {
    if (guest() || opt('learnOn') === '0') return null;
    const done = store.get('learnDone', {}), last = store.get('learnLast', '');
    if (!force && last === today()) return null;
    const p = patterns().find(x => !done[x.k]); if (!p) return null;
    store.set('learnLast', today());
    const hh = String(Math.floor(p.at / 60)).padStart(2, '0'), mm = String(p.at % 60).padStart(2, '0');
    const n = show(`💡 Fark ettim: son iki haftada ${p.n} gün, saat ${hh}:${mm} civarında “${p.text}” istedin. Bunu her gün ${hh}:${mm}’de kendiliğimden yapayım mı?`);
    const mark = v => { done[p.k] = v; store.set('learnDone', done); };
    n.el.append(el('div', { class: 'tool' },
      el('button', { type: 'button', onclick: e => { try { const r = TOOLS.otomasyon.run(['ekle', `her gün ${hh}:${mm} ${p.text}`]); mark('evet'); e.target.parentNode.replaceChildren(el('p', {}, '✓ ' + r)); } catch (x) { note(x.message); } } }, `✓ Evet, her gün ${hh}:${mm}`),
      el('button', { type: 'button', onclick: e => { mark('hayir'); e.target.parentNode.replaceChildren(el('p', { class: 'muted' }, 'Tamam, bir daha önermeyeceğim.')); } }, 'Hayır')));
    return p;
  }
  setInterval(() => { if (!document.hidden) suggest(); }, 20 * 60000); setTimeout(() => suggest(), 120000);

  /* ================= panel ================= */
  const box = el('div', { id: 'eklerBox' }), tgState = el('small', { class: 'muted', id: 'tgState' });
  const inp = (id, ph, def = '') => { const i = el('input', { id, placeholder: ph, autocomplete: 'off' }); i.value = store.get('set.' + id, def); i.onchange = () => { store.set('set.' + id, i.value.trim()); paintTg(); }; return i; };
  const sel = (id, opts, def) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = store.get('set.' + id, def); s.onchange = () => store.set('set.' + id, s.value); return s; };
  function paintTg() { tgState.textContent = !tgToken() ? 'Telegram bağlı değil.' : !tgChat() ? `Bot hazır. Telegram’da botuna şu kodu gönder: ${tgCode()}` : `✓ Telegram bağlı${tg.last ? ' · son mesaj ' + tg.last : ''}${tg.err ? ' · son hata: ' + tg.err : ''}`; }
  box.append(el('h3', {}, 'GELİŞMİŞ'),
    el('div', { class: 'field' }, el('label', { for: 'maskOn' }, 'Hafızaya kaydederken kimlik/kart/IBAN/şifreyi gizle'), sel('maskOn', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    el('div', { class: 'field' }, el('label', { for: 'learnOn' }, 'Alışkanlıklarımı öğren, otomatikleştirmeyi öner'), sel('learnOn', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    el('details', {}, el('summary', {}, '📱 Telegram köprüsü (Telegram’dan Satürn’e yaz)'),
      el('ol', { class: 'muted' }, el('li', {}, 'Telegram’da @BotFather → /newbot → bir ad ver → verilen BELİRTECİ (token) kopyala.'), el('li', {}, 'Aşağıya yapıştır. Belirteç yalnız bu telefonda saklanır.'), el('li', {}, 'Yeni botunla sohbeti aç → ekranda çıkan 6 haneli kodu gönder. Bitti.'), el('li', {}, 'Not: Satürn açıkken 12 saniyede bir bakar ve cevaplar.')),
      el('label', { for: 'tgBot' }, 'Bot belirteci'), (() => { const i = inp('tgBot', '123456789:AA…'); i.type = 'password'; return i; })(), tgState, el('p', { class: 'muted' }, 'Bilgisayar yardımcısındaki Telegram’ı kullanıyorsan aynı botu burada KULLANMA (ikisi aynı mesajları çekmeye çalışır); ayrı bir bot oluştur.'),
      el('div', { class: 'field' }, el('label', { for: 'tgOn' }, 'Telegram köprüsü'), sel('tgOn', [['1', 'Açık'], ['0', 'Kapalı']], '1'))));
  ($('p-settings') || $('p-system'))?.append(box); paintTg();

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    kod_calistir: { d: 'kod_calistir|görev tarifi veya JavaScript — hesap/tablo/dönüştürme için kodu yazar ve AĞSIZ kum havuzunda çalıştırır', run: async ([x]) => (/console\.log|=>|function|const |let /.test(x || '') ? fmtRun(await runCode(x)) : codeTask(x || '')) },
    belgelerime_sor: { d: 'belgelerime_sor|soru — Beyhan’ın kişisel belge kütüphanesinden (PDF/metin) kaynaklı cevap', run: async ([q]) => docAsk(q || '') },
    belge_kutuphanesi: { d: 'belge_kutuphanesi — belge ekleme/listeleme kartı', run: () => docCard() },
    telegram_gonder: { d: 'telegram_gonder|metin — Beyhan’ın Telegram’ına mesaj gönderir (bağlıysa)', run: async ([t]) => tgNotify(t) },
    rutin_oner: { d: 'rutin_oner — tekrar eden isteklerden otomatikleştirme önerisi', run: () => { const p = suggest(true); return p ? 'Öneri sohbette.' : 'Henüz tekrar eden bir alışkanlık görmedim (aynı isteği 3 gün benzer saatte yapınca öneririm).'; } }
  });
  WRITE_TOOLS.add('telegram_gonder');
  TOOL_GROUPS.push([/kod|hesapla|javascript|script|belge|pdf|doküman|telegram|rutin|alışkanl/i, /^(kod_calistir|belgelerime_sor|belge_kutuphanesi|telegram_gonder|rutin_oner)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGELİŞMİŞ: karmaşık hesap/dönüştürme/tablo işi → kod_calistir (ağsız kum havuzu); “belgelerime sor / belgemde ne yazıyor” → belgelerime_sor; Telegram’a gönder → telegram_gonder.';
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''); let m;
    if (guest()) return _lc(text0);
    try {
      if ((m = text0.match(/^\s*(?:kod çalıştır|js çalıştır|kodu çalıştır)[:\s]+([\s\S]{3,})$/i))) { runCode(m[1]).then(r => show('💻 ' + fmtRun(r))); return 'Kod kum havuzunda çalışıyor…'; }
      if ((m = t.match(/^(?:kodla hesapla|kod yaz ve çalıştır|program yaz)[:\s]+([\s\S]{1,})$/i))) { codeTask(m[1]).catch(e => note(e.message)); return 'Kodu yazıp çalıştırıyorum…'; }
      if (/^(belge kütüphanesi|belge ekle|belgelerimi yükle)$/i.test(t)) return docCard();
      if (/^(belgelerim|kütüphanem)$/i.test(t)) { docList().then(x => show(x)); return 'Belgeler listeleniyor…'; }
      if ((m = t.match(/^belge sil (\d{1,3})$/i))) { docDel(+m[1]).then(x => show(x)); return 'Siliniyor…'; }
      if ((m = t.match(/^(?:belgelerime sor|belgelerimde ara|belgeme sor|kütüphaneme sor)[:\s]+(.{3,500})$/i))) { docAsk(m[1]).catch(e => note(e.message)); return 'Belgelerinde arıyorum…'; }
      if ((m = t.match(/^telegram(?:a|’a|'a)? (?:gönder|yaz)[:\s]+(.{1,3000})$/i))) { tgNotify(m[1]).then(x => note(x)).catch(e => note(e.message)); return 'Telegram’a gönderiliyor…'; }
      if (/^(telegram bağla|telegram kur|telegram köprüsü)$/i.test(t)) return tgToken() ? (tgChat() ? '✓ Telegram zaten bağlı.' : `Telegram’da botuna şu kodu gönder: ${tgCode()}`) : 'Ayarlar → GELİŞMİŞ → Telegram köprüsü: @BotFather’dan bot oluştur, belirteci yapıştır, ekrandaki kodu bota gönder.';
      if (/^(alışkanlıklarımı öğren|rutin öner|ne sık istiyorum)$/i.test(t)) { const p = suggest(true); return p ? 'Öneri hazır.' : 'Henüz tekrar eden bir alışkanlık görmedim; aynı isteği 3 gün benzer saatte yapınca öneririm.'; }
      if (/^(gelişmiş araçlar)$/i.test(t)) return '🧩 GELİŞMİŞ\n• Hafızaya yazarken TC/kart/IBAN/şifre otomatik gizlenir\n• “kodla hesapla: 100.000 TL’nin 3 yıl %45 bileşik faizle getirisi” · “kod çalıştır: console.log(2**10)”\n• “belge ekle” → “belgelerime sor: sözleşmede fesih süresi ne?”\n• Telegram köprüsü: Ayarlar → GELİŞMİŞ (Telegram’dan yaz, Satürn cevaplasın) · “telegrama gönder: …”\n• Alışkanlık öğrenme: her gün benzer saatte istediğin şeyi fark edip otomatikleştirmeyi önerir\n• Canlı kamera: CANLI açıkken 📷 düğmesi — kameranı göster, “bu ne?” de';
    } catch (e) { return e.message; }
    const r = _lc(text0);
    return r;
  };
  // kullanım günlüğü (alışkanlık öğrenme): yazılan/söylenen her istek
  const _think = think;
  think = async (text, o = {}) => { try { logUse(text); } catch {} return _think(text, o); };
  window.jarvisEkler = { mask, tcOk, luhn, runCode, codeTask, tgPoll, tgCode, tgNotify, docAdd, docAsk, docList, docDel, docsAll, logUse, patterns, suggest, tg };
})();
