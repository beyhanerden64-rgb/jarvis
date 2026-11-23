'use strict';
/* JARVIS 9 — dünyadaki en iyi JARVIS projelerinde olup bizde eksik kalan özellikler:
 *  1) Anlamsal hafıza araması (OpenClaw memory_search, isair "unlimited memory"): anlamca benzer kayıtları bulur (Gemini embedding, ücretsiz)
 *  2) Tam yedek / geri yükleme + işlem kaydı CSV (vierisid "backup & restore", "audit trail")
 *  3) Sistem teşhisi — "doctor" (OpenJarvis/vierisid): tek dokunuşla tüm sağlık raporu, yapay zekâsız
 *  4) Mini JARVIS — her zaman üstte duran yüzen pencere (vierisid "floating desktop interface")
 *  5) Bas-konuş kısayolu: Boşluk / Ctrl+Boşluk (vierisid, akshayaggarwal "hold to talk")
 *  6) Takvim bağlantısı (iCal gizli adres; OpenJarvis Calendar, Saner daily planning): brifing ve nabız takvimi görür
 *  7) Sağlık günlüğü: su, uyku, egzersiz, ağrı (isair "nutrition / well-being tracking")
 *  8) Sohbette grafik (OpenClaw Live Canvas, ChatGPT canvas)
 *  9) Misafir modu (vierisid guest access): hastalar/ziyaretçiler kullanırken özel bilgiler kapalı
 * 10) E-posta taslağı (OpenClaw email, Saner)
 * 11) Dikte temizliği: "ııı, eee, şey" gibi dolgu sözcüklerini atar (akshayaggarwal filler removal)
 * 12) İsim cümlenin herhangi bir yerinde: "saat kaç Jarvis" (isair) — engine/wake-core.js içinde */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR, OFF = 3 * HOUR;
  const getKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  const isPhone = /iphone|ipad|android/i.test(navigator.userAgent);
  const today = (t = Date.now()) => new Date(t + OFF).toISOString().slice(0, 10);
  const onerr = e => { try { logOp('ultra', [], 'başarısız', e.message); } catch {} };

  /* ================= 1) ANLAMSAL HAFIZA ================= */
  const DIM = 256, EMB_MODELS = ['gemini-embedding-001', 'text-embedding-004'];
  let emb = store.get('emb', {}); // anahtar → base64 Float32 vektör
  const b64f = v => btoa(String.fromCharCode(...new Uint8Array(new Float32Array(v).buffer)));
  const fb64 = s => new Float32Array(Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer);
  const norm = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map(x => x / s); };
  async function embed(texts, kind = 'RETRIEVAL_DOCUMENT') {
    if (!getKey() || !navigator.onLine) throw Error('Anlamsal arama için Gemini anahtarı ve internet gerekli');
    let last;
    for (const model of EMB_MODELS) {
      if (window.jarvisBrain && window.jarvisModelGate?.order([model], 'tts').length === 0) continue; // dinlenmedeki model atlanır
      try {
        const body = { requests: texts.map(t => ({ model: 'models/' + model, content: { parts: [{ text: String(t).slice(0, 2000) }] }, taskType: kind, outputDimensionality: DIM })) };
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() }, body: JSON.stringify(body) }), 20000, 'zaman aşımı');
        window.jarvisModelGate?.report(model, r.status, 0);
        if (!r.ok) { last = r.status; continue; }
        const d = await r.json();
        return d.embeddings.map(e => norm((e.values || []).slice(0, DIM)));
      } catch (e) { last = e.message; }
    }
    throw Error('Anlamsal arama şu an yapılamadı (' + last + ')');
  }
  const docs = () => [
    ...items.filter(i => !i.private).map(i => ({ k: 'i:' + i.id + ':' + (i.text || '').length, src: i, text: `${i.kind} ${i.title || ''} ${i.text}` })),
    ...archive.slice(-400).map(x => ({ k: 'a:' + x.t, src: x, text: `Beyhan: ${x.q}\nJARVIS: ${x.a}` }))
  ];
  let indexing = false;
  async function indexMore(max = 100) {
    if (indexing || opt('semantic') === '0' || !getKey()) return 0;
    indexing = true;
    try {
      const all = docs(), keys = new Set(all.map(d => d.k));
      for (const k of Object.keys(emb)) if (!keys.has(k)) delete emb[k]; // silinen kayıtların vektörleri de silinir
      const todo = all.filter(d => !emb[d.k]).slice(0, max);
      if (!todo.length) return 0;
      const vecs = await embed(todo.map(d => d.text));
      todo.forEach((d, i) => { emb[d.k] = b64f(vecs[i]); });
      try { store.set('emb', emb); } catch { emb = {}; }
      return todo.length;
    } finally { indexing = false; }
  }
  async function semanticSearch(q, n = 6) {
    await indexMore(100).catch(() => {});
    const [qv] = await embed([q], 'RETRIEVAL_QUERY');
    const res = [];
    for (const d of docs()) { const s = emb[d.k]; if (!s) continue; const v = fb64(s); let dot = 0; for (let i = 0; i < DIM; i++) dot += v[i] * qv[i]; res.push({ d, dot }); }
    return res.sort((a, b) => b.dot - a.dot).slice(0, n).filter(r => r.dot > 0.45);
  }
  setInterval(() => { if (phase === 'idle' && !answering && !document.hidden) indexMore(100).catch(() => {}); }, 15 * MIN);
  setTimeout(() => { if (phase === 'idle' && !answering) indexMore(100).catch(() => {}); }, 60000);
  const _ha = TOOLS.hafiza_ara.run;
  TOOLS.hafiza_ara.run = async (args, ctx) => {
    const kw = await _ha(args, ctx);
    if (opt('semantic') === '0') return kw;
    try {
      const sem = await semanticSearch(args[0] || '');
      if (!sem.length) return kw;
      return kw + '\n\nANLAMCA YAKIN KAYITLAR:\n' + sem.map(({ d, dot }) => `[%${Math.round(dot * 100)} benzer · ${d.src.created ? dateTR(d.src.created) : dateTR(d.src.t)}] ${short(d.text.replace(/\n/g, ' '), 300)}`).join('\n');
    } catch { return kw; }
  };

  /* ================= 2) TAM YEDEK / GERİ YÜKLEME ================= */
  const SECRET = /^jarvisapp\.(?:key|set\.(?:ghToken|syncPass|elevenKey|haToken|pcToken|igToken|tgToken))$/;
  function backup(withSecrets) {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k.startsWith('jarvisapp.') || k.startsWith('jarvisapp.bozuk.') || k === 'jarvisapp.emb' || (!withSecrets && SECRET.test(k))) continue; data[k] = localStorage.getItem(k); }
    const blob = new Blob([JSON.stringify({ jarvis: 'yedek', surum: (document.querySelector('script[src*="ultra.js"]')?.src.match(/v=([\w.]+)/) || [])[1], tarih: new Date().toISOString(), anahtarlar_dahil: !!withSecrets, veri: data }, null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `jarvis-yedek-${today()}.json` }); document.body.append(a); a.click(); a.remove();
    logOp('yedek', [withSecrets ? 'anahtarlarla' : 'anahtarsız'], 'başarılı', Object.keys(data).length + ' kayıt'); store.set('lastBackup', Date.now());
    return Object.keys(data).length;
  }
  async function restore(file) {
    const j = JSON.parse(await file.text());
    if (j?.jarvis !== 'yedek' || typeof j.veri !== 'object') throw Error('Bu bir JARVIS yedeği değil');
    if (!(await confirmAction(`${dateTR(j.tarih)} tarihli yedek geri yüklensin mi? Bu cihazdaki şimdiki veriler yedektekilerle değiştirilir (önce otomatik yedek alınır).`))) return;
    backup(false);
    for (const [k, v] of Object.entries(j.veri)) if (k.startsWith('jarvisapp.')) localStorage.setItem(k, v);
    note('Yedek geri yüklendi; JARVIS yeniden başlıyor…'); setTimeout(() => location.reload(), 1500);
  }
  function exportOps() {
    const rows = [['zaman', 'araç', 'durum', 'ayrıntı', 'sonuç'], ...opLog.map(o => [new Date(o.t).toLocaleString('tr-TR'), o.tool, o.status, o.args, o.result])];
    const csv = '﻿' + rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `jarvis-islem-kaydi-${today()}.csv` }); document.body.append(a); a.click(); a.remove();
  }

  /* ================= 3) SİSTEM TEŞHİSİ ================= */
  async function doctor() {
    const L = [], add = (ok, k, v) => L.push({ ok, k, v });
    add(!!getKey(), 'Yapay zekâ anahtarı', getKey() ? 'var' : 'YOK — Bağlantı sekmesinden Gemini anahtarını gir');
    add(navigator.onLine, 'İnternet', navigator.onLine ? 'bağlı' : 'yok');
    const B = window.jarvisBrain?.B; window.jarvisBrain?.AGENTS.find(a => a.id === 'oztest')?.run();
    add(!B?.lastTest?.bad?.length, 'Öz-test', B?.lastTest ? (B.lastTest.bad.length ? 'bozuk: ' + B.lastTest.bad.join(', ') : '6/6 geçti') : '—');
    const ms = Object.entries(B?.models || {}).filter(([m]) => !/tts|embedding/.test(m)), cooled = ms.filter(([, h]) => h.cool > Date.now());
    add(!ms.length || cooled.length < ms.length, 'Yapay zekâ modelleri', ms.length ? `${ms.length - cooled.length}/${ms.length} hazır${cooled.length ? ' · dinlenmede: ' + cooled.map(([m]) => m.replace('gemini-', '')).join(', ') : ''}` : 'henüz istek yok');
    const tts = Object.entries(B?.models || {}).filter(([m]) => /tts/.test(m));
    add(true, 'Doğal ses', tts.length ? tts.filter(([, h]) => h.cool <= Date.now()).length + '/' + tts.length + ' model hazır' : 'henüz kullanılmadı (cihaz sesi hazır)');
    try { const p = await navigator.permissions?.query({ name: 'microphone' }); add(p?.state !== 'denied', 'Mikrofon izni', { granted: 'verildi', prompt: 'ilk kullanımda sorulacak', denied: 'REDDEDİLMİŞ — tarayıcı ayarlarından aç' }[p?.state] || 'bilinmiyor'); } catch { add(true, 'Mikrofon izni', 'kontrol edilemedi'); }
    add(window.Notification?.permission !== 'denied', 'Bildirim izni', { granted: 'verildi', default: 'sorulmadı', denied: 'reddedilmiş' }[window.Notification?.permission] || 'desteklenmiyor');
    try { const e = await navigator.storage?.estimate?.(); add(!e || e.usage / e.quota < 0.85, 'Depolama', e ? `%${Math.round(e.usage / e.quota * 100)} dolu (${(e.usage / 1e6).toFixed(1)} MB)` : '—'); } catch {}
    try { const r = await navigator.serviceWorker?.getRegistration(); add(!!r, 'Çevrimdışı çalışma', r ? 'hazır' : 'kurulmamış'); } catch {}
    add(true, 'Eşitleme', window.jarvisSync?.enabled?.() ? 'açık (şifreli)' : 'kapalı');
    add(true, 'Telefon bildirimleri', opt('ntfyOn') === '1' ? 'açık' : 'kapalı');
    if (opt('pcToken') && !isPhone) {
      try {
        const r = await withTimeout(fetch(PC + '/durum', { headers: { 'X-Jarvis-Token': opt('pcToken') } }), 3000);
        const d = await r.json(); let latest = '';
        try { latest = (await (await fetch('pc/version.txt?x=' + Date.now(), { cache: 'no-store' })).text()).trim(); } catch {}
        add(r.ok && (!latest || d.version === latest), 'Bilgisayar yardımcısı', r.ok ? `${d.pc} · sürüm ${d.version}${latest && d.version !== latest ? ' → yeni sürüm ' + latest + ' var (NÖBET → Yardımcıyı güncelle)' : ' (güncel)'}` : 'erişim kodu yanlış');
      } catch { add(false, 'Bilgisayar yardımcısı', 'ulaşılamadı — bilgisayarda çalışmıyor olabilir'); }
    } else add(true, 'Bilgisayar yardımcısı', opt('pcToken') ? 'telefondan köprüyle' : 'kurulmamış');
    const nb = window.jarvisNobet; if (nb) add(!nb.sorun, 'Nöbetçiler', `${nb.ajan} ajan · ${nb.sorun ? nb.sorun + ' sorun (NÖBET sekmesi)' : 'sorun yok'}`);
    const errs = store.get('appErrors', []).filter(e => Date.now() - e.t < DAY);
    add(errs.length < 3, 'Son 24 saat uygulama hatası', errs.length ? errs.length + ' (en son: ' + short(errs.at(-1).m, 60) + ')' : 'yok');
    const lb = store.get('lastBackup', 0); add(Date.now() - lb < 30 * DAY || window.jarvisSync?.enabled?.(), 'Yedek', lb ? 'son yedek ' + dateTR(lb) : window.jarvisSync?.enabled?.() ? 'bulutta şifreli eşitleme var' : 'hiç alınmadı — OTOMASYON → Tam yedek');
    { const pc = store.get('phoneCal', null); add(true, 'Takvim', [opt('icsUrl') ? 'iCal bağlı' : '', pc?.at ? 'iPhone takvimi ' + dateTR(pc.at) + ' okundu' : ''].filter(Boolean).join(' · ') || 'bağlı değil (OTOMASYON → Takvim veya “telefonumdaki takvimi oku”)'); }
    add(true, 'Anlamsal hafıza', `${Object.keys(emb).length}/${docs().length} kayıt dizinli`);
    const bad = L.filter(x => !x.ok);
    logOp('teşhis', [], bad.length ? 'başarısız' : 'başarılı', bad.length ? bad.map(b => b.k).join(', ') : 'her şey yolunda');
    return { L, bad, text: (bad.length ? `${L.length} kontrolden ${bad.length} tanesinde sorun var: ` + bad.map(b => `${b.k} — ${b.v}`).join('; ') : `${L.length} kontrolün hepsi geçti; her şey yolunda.`) };
  }
  async function showDoctor() {
    const r = await doctor();
    const n = bubble('note', '🩺 Sistem teşhisi: ' + (r.bad.length ? r.bad.length + ' sorun' : 'her şey yolunda'));
    n.el.append(el('div', { class: 'kvs doctor' }, ...r.L.flatMap(x => [el('span', {}, (x.ok ? '✓ ' : '✗ ') + x.k), el('b', { class: x.ok ? '' : 'bad' }, x.v)])));
    return r.text;
  }

  /* ================= 4) MİNİ JARVIS (yüzen pencere) ================= */
  let pip = null;
  async function miniJarvis() {
    if (!window.documentPictureInPicture) throw Error('Bu tarayıcı yüzen pencereyi desteklemiyor (Chrome/Edge masaüstü gerekir)');
    if (pip) { pip.focus?.(); return; }
    pip = await documentPictureInPicture.requestWindow({ width: 340, height: 230 });
    const d = pip.document;
    d.head.append(Object.assign(d.createElement('style'), { textContent: `body{margin:0;background:#03080d;color:#dff6ff;font:13px system-ui,sans-serif;display:grid;grid-template-rows:auto 1fr auto;height:100vh}
      header{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #57d3ff33}
      .core{width:34px;height:34px;border-radius:50%;border:2px solid #57d3ff;box-shadow:0 0 14px #57d3ff88;display:grid;place-items:center;cursor:pointer;background:radial-gradient(#57d3ff55,transparent 70%)}
      .core.on{border-color:#ffb547;box-shadow:0 0 18px #ffb547}
      h1{margin:0;font:700 13px/1 system-ui;letter-spacing:.3em;color:#57d3ff} small{color:#7fa3b6;display:block;margin-top:3px;letter-spacing:.1em}
      main{padding:8px 12px;overflow:auto;color:#cfe9f5;white-space:pre-wrap} form{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #57d3ff33}
      input{flex:1;background:#071521;border:1px solid #57d3ff55;color:#dff6ff;border-radius:6px;padding:7px} button{background:#0e2a3a;color:#9be9ff;border:1px solid #57d3ff77;border-radius:6px;padding:6px 10px;cursor:pointer}` }));
    const core = d.createElement('div'); core.className = 'core'; core.title = 'Konuş'; core.textContent = '◉';
    const h = d.createElement('div'); h.innerHTML = '<h1>JARVIS</h1><small>HAZIR</small>';
    const head = d.createElement('header'); head.append(core, h);
    const main = d.createElement('main'); main.textContent = 'Mikrofona dokun ya da yaz.';
    const form = d.createElement('form'), inp = d.createElement('input'), btn = d.createElement('button');
    inp.placeholder = 'JARVIS’e yaz…'; btn.textContent = '➤'; form.append(inp, btn);
    d.body.append(head, main, form);
    core.onclick = () => { window.jarvisUnlock?.(); if (voiceSession.active) voiceSession.stop(''); else voiceSession.start(); };
    form.onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; inp.value = ''; typedTurn(v, false); };
    const tick = setInterval(() => {
      if (!pip) return;
      h.querySelector('small').textContent = $('phase').textContent + ' · ' + short($('status').textContent || '', 40);
      core.classList.toggle('on', phase === 'listening' || phase === 'speaking');
      const last = [...document.querySelectorAll('#feed .msg.ai span:not(.who), #feed .msg.ai .body')].at(-1)?.textContent;
      if (last && main.dataset.last !== last) { main.dataset.last = last; main.textContent = last; }
    }, 400);
    pip.addEventListener('pagehide', () => { clearInterval(tick); pip = null; });
  }

  /* ================= 5) BAS-KONUŞ KISAYOLU ================= */
  addEventListener('keydown', e => {
    if (opt('ptt') === '0' || e.repeat) return;
    const typing = /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.code === 'Space' && !typing && !e.ctrlKey) || (e.code === 'Space' && e.ctrlKey)) {
      e.preventDefault(); window.jarvisUnlock?.();
      if (phase === 'speaking') { voiceSession.interrupt?.(); return; }
      if (!voiceSession.active) voiceSession.start();
    }
  });

  /* ================= 6) TAKVİM (iCal) ================= */
  let cal = store.get('calCache', { t: 0, ev: [] });
  const icsDate = v => { const m = String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/); if (!m) return null; const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m; return z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : Date.UTC(+y, mo - 1, +d, +h, +mi, +s) - OFF; };
  function parseIcs(txt) {
    const lines = txt.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), out = []; let ev = null;
    for (const l of lines) {
      if (l === 'BEGIN:VEVENT') ev = {}; else if (l === 'END:VEVENT') { if (ev?.start) out.push(ev); ev = null; }
      else if (ev) { const i = l.indexOf(':'); if (i < 0) continue; const k = l.slice(0, i).split(';')[0], v = l.slice(i + 1); if (k === 'DTSTART') { ev.start = icsDate(v); ev.allDay = !/T/.test(v); } else if (k === 'DTEND') ev.end = icsDate(v); else if (k === 'SUMMARY') ev.title = v.replace(/\\,/g, ',').replace(/\\n/g, ' '); else if (k === 'LOCATION') ev.loc = v.replace(/\\,/g, ','); else if (k === 'RRULE') ev.rrule = v; }
    }
    // basit tekrar açılımı (günlük/haftalık/aylık) önümüzdeki 30 gün için
    const lim = Date.now() + 30 * DAY, from = Date.now() - DAY, res = [];
    for (const e of out) {
      if (!e.rrule) { if (e.start >= from && e.start <= lim) res.push(e); continue; }
      const f = (e.rrule.match(/FREQ=(\w+)/) || [])[1], until = icsDate((e.rrule.match(/UNTIL=(\w+)/) || [])[1] || '') || Infinity, step = { DAILY: DAY, WEEKLY: 7 * DAY }[f];
      if (!step && f !== 'MONTHLY') continue;
      for (let t = e.start, n = 0; t <= Math.min(lim, until) && n < 400; n++) { if (t >= from) res.push({ ...e, start: t, end: e.end ? t + (e.end - e.start) : null }); if (f === 'MONTHLY') { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + 1); t = d.getTime(); } else t += step; }
    }
    return res.sort((a, b) => a.start - b.start);
  }
  async function loadCal(force) {
    const url = opt('icsUrl'); if (!url) throw Error('Takvim bağlı değil (OTOMASYON → Takvim bağlantısı)');
    if (!force && Date.now() - cal.t < 15 * MIN) return cal.ev;
    let txt = '';
    try { const r = await withTimeout(fetch(url), 8000); if (r.ok) txt = await r.text(); } catch {} // bazı takvimler doğrudan izin verir
    if (!/BEGIN:VCALENDAR/.test(txt)) { const d = await pcCall('web_al', [url], false); txt = d.text || ''; } // değilse bilgisayar yardımcısı getirir (adres üçüncü kişiye gitmez)
    if (!/BEGIN:VCALENDAR/.test(txt)) throw Error('Takvim okunamadı; adresin “gizli iCal adresi” olduğundan emin ol');
    cal = { t: Date.now(), ev: parseIcs(txt).map(e => ({ s: e.start, e: e.end, t: e.title || '(başlıksız)', l: e.loc || '', a: !!e.allDay })) };
    store.set('calCache', cal); return cal.ev;
  }
  const fmtEv = e => `${new Date(e.s + OFF).toISOString().slice(0, 10)} ${e.a ? 'tüm gün' : new Date(e.s + OFF).toISOString().slice(11, 16)} — ${e.t}${e.l ? ' (' + e.l + ')' : ''}`;
  async function calText(which = 'bugün') {
    const ev = await loadCal(), w = fold(which), d0 = Date.parse(today() + 'T00:00:00Z') - OFF;
    const [a, b] = /yarin/.test(w) ? [d0 + DAY, d0 + 2 * DAY] : /hafta/.test(w) ? [d0, d0 + 7 * DAY] : /ay/.test(w) ? [d0, d0 + 30 * DAY] : [d0, d0 + DAY];
    const list = ev.filter(e => e.s >= a && e.s < b);
    return list.length ? list.map(fmtEv).join('\n') : 'Bu aralıkta takvimde etkinlik yok.';
  }

  /* ================= 7) SAĞLIK GÜNLÜĞÜ ================= */
  let health = store.get('health', {});
  const hDay = (d = today()) => (health[d] ||= { su: 0, uyku: 0, egzersiz: [], agri: [], not: [] });
  const saveH = () => { const keys = Object.keys(health).sort(); for (const k of keys.slice(0, -120)) delete health[k]; store.set('health', health); };
  function hLog(kind, val, extra = '') {
    const d = hDay();
    if (kind === 'su') d.su += Number(val) || 250;
    else if (kind === 'uyku') d.uyku = Number(String(val).replace(',', '.')) || 0;
    else if (kind === 'egzersiz') d.egzersiz.push(String(val || extra).slice(0, 80));
    else if (kind === 'agri') d.agri.push({ v: Math.min(10, Number(val) || 0), b: String(extra).slice(0, 40), t: Date.now() });
    else d.not.push(String(val).slice(0, 120));
    saveH(); logOp('sağlık', [kind, String(val)], 'başarılı');
  }
  function hReport(days = 7) {
    const keys = Object.keys(health).sort().slice(-days);
    if (!keys.length) return 'Sağlık günlüğünde kayıt yok.';
    const avg = a => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0);
    const su = keys.map(k => health[k].su), uy = keys.map(k => health[k].uyku).filter(Boolean), ag = keys.flatMap(k => health[k].agri.map(x => x.v));
    return `Son ${keys.length} gün: ortalama su ${Math.round(avg(su))} ml/gün, ortalama uyku ${avg(uy).toFixed(1)} saat (${uy.length} gün kayıtlı), egzersiz ${keys.reduce((s, k) => s + health[k].egzersiz.length, 0)} kez${ag.length ? `, ağrı ortalaması ${avg(ag).toFixed(1)}/10` : ''}. Bugün: su ${hDay().su} ml, uyku ${hDay().uyku || '—'} saat, egzersiz ${hDay().egzersiz.join(', ') || 'yok'}.`;
  }

  /* ================= 8) SOHBETTE GRAFİK ================= */
  function drawChart(title, pairs, type = 'bar') {
    const n = bubble('note', '📊 ' + title);
    const c = el('canvas', { width: 520, height: 220, class: 'chatchart', 'aria-label': title + ': ' + pairs.map(([k, v]) => k + ' ' + v).join(', ') });
    n.el.append(c);
    const g = c.getContext('2d'), W = c.width, H = c.height, pad = 30, max = Math.max(...pairs.map(p => p[1]), 0) || 1, min = Math.min(0, ...pairs.map(p => p[1]));
    const col = getComputedStyle(document.documentElement).getPropertyValue('--holo').trim() || '#57d3ff';
    const y = v => H - pad - (v - min) / (max - min || 1) * (H - pad * 2), bw = (W - pad * 2) / pairs.length;
    g.font = '11px "Share Tech Mono", monospace'; g.fillStyle = '#7fa3b6'; g.strokeStyle = 'rgb(87 211 255 / .25)';
    g.beginPath(); g.moveTo(pad, y(0)); g.lineTo(W - pad, y(0)); g.stroke();
    pairs.forEach(([k, v], i) => {
      const x = pad + i * bw;
      if (type === 'bar') { g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x + bw * 0.15, Math.min(y(v), y(0)), bw * 0.7, Math.abs(y(v) - y(0))); g.globalAlpha = 1; }
      g.fillStyle = '#cfe9f5'; g.fillText(String(v), x + bw * 0.15, y(v) - 4); g.fillStyle = '#7fa3b6'; g.fillText(short(k, 8), x + bw * 0.1, H - 10);
    });
    if (type !== 'bar') { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); pairs.forEach(([, v], i) => { const x = pad + i * bw + bw / 2; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); }); g.stroke(); }
  }

  /* ================= 9) MİSAFİR MODU ================= */
  const GUEST_TOOLS = new Set(['hesapla', 'birim', 'doviz', 'hava', 'vikipedi', 'deprem', 'namaz', 'grafik', 'zamanlayici']);
  const guest = () => store.get('guest', false);
  function setGuest(on) { store.set('guest', !!on); document.body.classList.toggle('guest', !!on); $('guestBtn') && ($('guestBtn').textContent = on ? 'Misafir modunu kapat' : 'Misafir modunu aç'); }
  setGuest(guest());
  const _instr = instructions;
  instructions = voiceTurn => (guest()
    ? `Sen JARVIS'sin, FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi'nin (Cizre) yardımcı asistanı. ŞU AN MİSAFİR MODUNDASIN: konuştuğun kişi Beyhan değil, bir misafir veya danışan. Beyhan'ın kişisel bilgilerini, hafızasını, hastalarını, randevularını, kasa/para bilgilerini, bilgisayarını ve kayıtlarını ASLA paylaşma, bunlarla ilgili işlem yapma; sorulursa kibarca "bunu Beyhan Bey'e sorabilirsiniz" de. Genel sorulara, egzersiz ve sağlıklı yaşam hakkında genel bilgiye yardımcı ol; tıbbi teşhis koyma, gerekirse fizyoterapiste yönlendir. Kısa, nazik, "siz" diye hitap et. Şu an: ${nowText()}.\nKullanabileceğin araçlar (⟦ARAC|ad|argüman⟧): ${[...GUEST_TOOLS].filter(k => TOOLS[k]).map(k => TOOLS[k].d).join(' · ')}`
    : _instr(voiceTurn));
  const _rt = window.jarvisRunTools;
  window.jarvisRunTools = async (calls, ctx) => {
    if (!guest()) return _rt(calls, ctx);
    const ok = calls.filter(c => GUEST_TOOLS.has(fold(c.split('|')[0]))), no = calls.filter(c => !ok.includes(c));
    const r = ok.length ? await _rt(ok, ctx) : { text: '', image: null };
    return { ...r, text: [r.text, ...no.map(c => c.split('|')[0] + ': İPTAL — misafir modunda kapalı')].filter(Boolean).join('\n') };
  };
  const _arch = archiveTurn; archiveTurn = (q, a) => { if (!guest()) _arch(q, a); }; window.jarvisArchive = archiveTurn;
  const _save = saveItem; saveItem = i => (guest() && ['memory', 'note', 'task', 'project'].includes(i.kind) ? null : _save(i));
  async function guestOff() {
    if (lock?.on?.() && !(await lock.reauth())) return 'Misafir modundan çıkmak için kimlik doğrulaması gerekiyor.';
    if (!lock?.on?.() && !(await confirmAction('Misafir modu kapatılsın mı? (Beyhan değilsen “hayır” de)'))) return 'Misafir modu açık kalıyor.';
    setGuest(false); return 'Misafir modu kapandı. Hoş geldin Beyhan.';
  }

  /* ================= 10) E-POSTA TASLAĞI + 11) DİKTE TEMİZLİĞİ ================= */
  const cleanFill = s => String(s).replace(/(^|\s)(?:ı+h*|ee+|ıı+|mm+|hı+m*|şey(?:\s+yani)?|yani\s+şey|hani)(?=[\s,.]|$)/gi, ' ').replace(/\s{2,}/g, ' ').replace(/\s+([,.?!])/g, '$1').trim();
  window.jarvisCleanDictation = cleanFill;
  const _pc = pcCall;
  pcCall = (sub, args, onay) => (sub === 'yaz' && document.body.classList.contains('dictating') ? _pc(sub, [cleanFill(args[0]) + ' '], onay) : _pc(sub, args, onay));

  /* ================= ARAÇLAR ================= */
  Object.assign(TOOLS, {
    teshis: { d: 'teshis — JARVIS’in tüm sistem sağlığını kontrol eder (anahtar, internet, modeller, mikrofon, depolama, bilgisayar yardımcısı, nöbetçiler, yedek)', run: async () => (await doctor()).text },
    takvim_oku: { d: 'takvim_oku|bugün/yarın/hafta/ay — Beyhan’ın bağlı takviminden (iCal) etkinlikler', run: async ([w]) => calText(w || 'bugün') },
    saglik: { d: 'saglik|su|ml veya saglik|uyku|saat veya saglik|egzersiz|açıklama veya saglik|agri|0-10|bölge veya saglik|rapor|gün — Beyhan’ın kişisel sağlık günlüğü', run: ([k, v, x]) => { k = fold(k || 'rapor'); if (k === 'rapor') return hReport(Number(v) || 7); hLog(k, v, x); return 'Kaydedildi. ' + hReport(1); } },
    grafik: { d: 'grafik|başlık|etiket:değer, etiket:değer, …|bar veya cizgi — sohbette grafik çizer (veri karşılaştırma, trend)', run: ([t, data, type]) => { const pairs = String(data || '').split(/[,;]\s*/).map(x => x.split(':')).filter(p => p.length === 2 && isFinite(+p[1])).map(([k, v]) => [k.trim(), +v]); if (pairs.length < 2) throw Error('En az 2 “etiket:değer” gerekli'); drawChart(t || 'Grafik', pairs.slice(0, 24), /cizgi|çizgi|line/i.test(type || '') ? 'line' : 'bar'); return 'Grafik sohbette çizildi.'; } },
    eposta: { d: 'eposta|alıcı@adres|konu|metin — e-posta taslağı hazırlar (Beyhan gönder’e basar)', pending: true, run: ([to, sub, body]) => { pendingLinks.push({ url: `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(sub || '')}&body=${encodeURIComponent(body || '')}`, title: '✉ E-posta taslağını aç' }, { url: `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to || '')}&su=${encodeURIComponent(sub || '')}&body=${encodeURIComponent(body || '')}`, title: '✉ Gmail’de aç' }); return 'Taslak hazır; Beyhan bağlantıya dokunup gönderecek.'; } },
    yedek_al: { d: 'yedek_al — tüm JARVIS verisinin (anahtarlar hariç) yedek dosyasını indirir', run: () => `${backup(false)} kayıt yedeklendi (indirilenler klasörü).` },
    mini: { d: 'mini — her zaman üstte duran küçük JARVIS penceresini açar (bilgisayarda)', run: async () => { await miniJarvis(); return 'Mini JARVIS açıldı.'; } }
  });
  PC_READONLY.add('web_al');
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `\nJARVIS 9: Takvim ${opt('icsUrl') ? 'bağlı (iCal) — brifinglerde ve “bugün ne var” sorularında takvim_oku kullan' : 'iCal bağlı değil; iPhone takvimi için yukarıdaki iPHONE TAKVİMİ bölümünü kullan, eskiyse iphone|takvim öner'}. Sağlık günlüğü için saglik, karşılaştırma/trend için grafik, e-posta için eposta (taslak), sistem durumu için teshis aracını kullan. Hafıza sorularında hafiza_ara anlamca da arar.`;

  /* ================= yerel komutlar ================= */
  const _lc = localCommand;
  localCommand = text => {
    const t = text.toLocaleLowerCase('tr-TR').replace(/^\s*(?:hey\s+)?jarvis[,\s]+/, '').replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
    let m;
    try {
      if (/^(?:kendini kontrol et|sistem teşhisi|teşhis yap|sağlık kontrolü yap|her şey yolunda mı)$/.test(t)) { setTimeout(() => showDoctor().then(r => { if (setting('speakOn') === '1') voiceSession.read(r); }), 30); return 'Sistemi kontrol ediyorum…'; }
      if (/^misafir modunu? (?:aç|başlat)$/.test(t)) { setGuest(true); return 'Misafir modu açık. Kişisel bilgiler ve bilgisayar kapalı.'; }
      if (/^misafir modunu? (?:kapat|bitir)$/.test(t)) { setTimeout(() => guestOff().then(r => bubble('ai', r)), 30); return 'Kimlik doğruluyorum…'; }
      if (guest()) return _lc(text);
      if ((m = t.match(/^(?:(\d+)\s*(?:ml|mililitre)\s+|(?:bir|1)\s+(?:bardak|şişe)\s+)?su içtim$/))) { const ml = m[1] ? +m[1] : /şişe/.test(t) ? 500 : 250; hLog('su', ml); return `Not ettim: ${ml} ml su. Bugün toplam ${hDay().su} ml.`; }
      if ((m = t.match(/^(\d+(?:[.,]\d)?)\s*saat uyudum$/))) { hLog('uyku', m[1]); return `Not ettim: ${m[1]} saat uyku.`; }
      if ((m = t.match(/^(\d+)\s*(?:dakika|dk)\s+(.+?)\s+(?:yaptım|yürüdüm|koştum)$/))) { hLog('egzersiz', `${m[1]} dk ${m[2]}`); return `Not ettim: ${m[1]} dakika ${m[2]}.`; }
      if (/^(?:sağlık raporu|sağlık günlüğüm|bu hafta nasılım)$/.test(t)) return hReport(7);
      if (/^(?:mini (?:pencere|jarvis)(?:yi)?(?: aç)?|yüzen pencere(?:yi)? aç)$/.test(t)) { setTimeout(() => miniJarvis().catch(e => note(e.message)), 30); return 'Mini pencereyi açıyorum.'; }
      if (/^(?:yedek al|tam yedek al|verilerimi yedekle)$/.test(t)) { const n = backup(false); return `${n} kayıt yedeklendi; dosya indirilenler klasöründe.`; }
    } catch (e) { onerr(e); }
    return _lc(text);
  };

  /* ================= nabız: takvim etkinliği yaklaşıyor ================= */
  const seen = store.get('calSeen', {});
  setInterval(async () => {
    if (!opt('icsUrl') || guest()) return;
    try {
      const ev = await loadCal(); const now = Date.now();
      for (const e of ev) { const k = e.s + e.t; if (!e.a && e.s > now && e.s - now <= 15 * MIN && !seen[k]) { seen[k] = now; const msg = `Beyhan, ${Math.max(1, Math.round((e.s - now) / MIN))} dakika sonra: ${e.t}${e.l ? ', ' + e.l : ''}.`; bubble('note', '📅 ' + msg); if (setting('speakOn') === '1' && phase === 'idle' && !document.hidden) voiceSession.read(msg); else if (opt('ntfyOn') === '1') window.jarvisPushPhone?.(msg, { title: 'JARVIS takvim', tags: 'calendar' }).catch(() => {}); } }
      for (const k of Object.keys(seen)) if (seen[k] < now - 2 * DAY) delete seen[k];
      store.set('calSeen', seen);
    } catch {}
  }, 5 * MIN);

  /* ================= PANEL: OTOMASYON sekmesine ekler ================= */
  const fileIn = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: e => { const f = e.target.files[0]; if (f) restore(f).catch(x => note('Geri yüklenemedi: ' + x.message)); e.target.value = ''; } });
  const sel = (id, opts, def) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = store.get('set.' + id, def) ?? def; s.onchange = () => store.set('set.' + id, s.value); return s; };
  const ics = el('input', { id: 'icsUrl', type: 'password', placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics', autocomplete: 'off' });
  ics.value = store.get('set.icsUrl', '') || ''; ics.onchange = () => { store.set('set.icsUrl', ics.value.trim()); cal = { t: 0, ev: [] }; if (ics.value.trim()) loadCal(true).then(ev => note(`Takvim bağlandı: önümüzdeki 30 günde ${ev.length} etkinlik.`), e => note(e.message)); };
  const box = el('div', { id: 'ultraBox', class: 'ultrabox' },
    el('h3', {}, 'SİSTEM'),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); showDoctor().catch(e => note(e.message)); } }, 'Sistem teşhisi'),
      el('button', { type: 'button', class: 'btn', id: 'miniBtn', hidden: !window.documentPictureInPicture, onclick: () => miniJarvis().catch(e => note(e.message)) }, 'Mini JARVIS (yüzen pencere)'),
      el('button', { type: 'button', class: 'btn', id: 'guestBtn', onclick: async () => { if (guest()) bubble('ai', await guestOff()); else { setGuest(true); note('Misafir modu açık: kişisel bilgiler, hastalar, kasa ve bilgisayar kapalı.'); } } }, guest() ? 'Misafir modunu kapat' : 'Misafir modunu aç')),
    el('h3', {}, 'YEDEK'),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: () => note(backup(false) + ' kayıt yedeklendi (anahtarlar hariç).') }, 'Tam yedek al'),
      el('button', { type: 'button', class: 'btn', onclick: async () => { if (await confirmAction('Yedeğe şifre ve anahtarlar da yazılsın mı? Dosyayı kimseyle paylaşma.')) note(backup(true) + ' kayıt yedeklendi (anahtarlar dahil).'); } }, 'Anahtarlarla yedek'),
      el('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, 'Yedekten geri yükle'),
      el('button', { type: 'button', class: 'btn', onclick: exportOps }, 'İşlem kaydı (Excel/CSV)'), fileIn),
    el('h3', {}, 'TAKVİM BAĞLANTISI'),
    field('icsUrl', 'Gizli iCal adresi (Google Takvim → Ayarlar → takvimin → “iCal biçiminde gizli adres”)', ics),
    el('p', { class: 'muted' }, 'Adres yalnız bu cihazda saklanır. Takvim doğrudan okunamazsa bilgisayar yardımcısı getirir; adres hiçbir aracı siteye gönderilmez.'),
    el('h3', {}, 'AKILLI ÖZELLİKLER'),
    field('semantic', 'Anlamsal hafıza araması (Gemini, ücretsiz; 15 dk’da bir en fazla 1 istek)', sel('semantic', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    field('ptt', 'Bas-konuş kısayolu (Boşluk veya Ctrl+Boşluk)', sel('ptt', [['1', 'Açık'], ['0', 'Kapalı']], '1')));
  $('p-auto').prepend(box);

  window.jarvisUltra = { doctor, showDoctor, backup, restore, semanticSearch, indexMore, parseIcs, calText, loadCal, hReport, hLog, drawChart, setGuest, guest, guestOff, miniJarvis, cleanFill };
})();
