'use strict';
/* SATÜRN 8 — dünyadaki en iyi SATÜRN/asistan projelerinden (OpenClaw, Leon, Home Assistant Assist, vierisid/jarvis,
 * OpenJarvis, isair/jarvis) alınan ücretsiz özellikler:
 *  1) Zamanlanmış ve tekrarlayan komutlar (cron/heartbeat görevleri): "10 dakika sonra …", "her gün 9'da …", "her pazartesi …", "her 2 saatte bir …"
 *  2) Adlandırılmış sayaçlar: duraklat, sürdür, süre ekle, kalan süreyi sor
 *  3) Öğretilebilir beceriler (makrolar): "yeni beceri kapanış: …; …" → "kapanış"
 *  4) Yetki kuralları: araç bazında Varsayılan / Her zaman sor / Engelle
 *  5) Hassas bilgi maskeleme: TC kimlik, kart, IBAN, şifre hafızaya/arşive açık yazılmaz
 *  6) Proaktif nabız: yaklaşan görev, geciken iş, bilgisayar sorunu kendiliğinden söylenir (sessiz saatlere uyar)
 *  7) Günlük not + gece hafıza birleştirme ("rüya"): günde 1 kısa çağrı, dünün konuşmalarından kalıcı bilgiler
 *  8) Dikte modu: konuştuğun her şey bilgisayarda açık pencereye yazılır (yapay zekâ kullanmaz)
 *  9) Telegram kanalı: SATÜRN'e her yerden Telegram'dan yaz (bilgisayar yardımcısı üzerinden, ücretsiz)
 * Diğer dosyalarla aynı genel kapsamı paylaşır. */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const sel = (id, opts, def) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = store.get('set.' + id, def) ?? def; s.onchange = () => store.set('set.' + id, s.value); return s; };
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR, OFF = 3 * HOUR; // Türkiye UTC+3 (yaz saati yok)
  const local = t => new Date(t + OFF); // UTC alanları Türkiye saatini verir
  const atLocal = (y, mo, d, h, mi) => Date.UTC(y, mo, d, h, mi) - OFF;
  const NUMW = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, onbeş: 15, yirmi: 20, otuz: 30, kırk: 40, kırkbeş: 45, elli: 50, altmış: 60, yarım: 0.5 };
  const num = s => Number(String(s).replace(',', '.')) || NUMW[String(s).replace(/\s+/g, '')] || 0;
  const DOW = { pazar: 0, pazartesi: 1, salı: 2, çarşamba: 3, perşembe: 4, cuma: 5, cumartesi: 6 };
  const DOWN = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
  const UNIT = u => (/^(?:saniye|sn)/.test(u) ? 1000 : /^(?:dakika|dk)/.test(u) ? MIN : HOUR);
  const NUMRE = '(\\d+(?:[.,]\\d+)?|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on beş|on|yirmi|otuz|kırk beş|kırk|elli|altmış|yarım)';
  const HM = "(?:saat\\s*)?(\\d{1,2})(?:[:.](\\d{2}))?(?:['’]?(?:de|da|te|ta))?";

  /* ================= 1) ZAMANLANMIŞ / TEKRARLAYAN KOMUTLAR ================= */
  let jobs = store.get('jobs', []);
  const saveJobs = () => { store.set('jobs', jobs); renderJobs(); };
  function nextRun(j, from = Date.now()) {
    if (j.kind === 'once') return j.at;
    if (j.kind === 'every') return (j.last || from) + j.every;
    const L = local(from); const [h, m] = j.hm.split(':').map(Number);
    for (let add = 0; add <= 7; add++) {
      const t = atLocal(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate() + add, h, m);
      if (t <= from) continue;
      if (j.kind === 'weekly' && local(t).getUTCDay() !== j.dow) continue;
      return t;
    }
    return from + DAY;
  }
  const isReminder = c => /hatırlat|hatirlat/i.test(c);
  const cleanCmd = c => c.replace(/^(?:bana\s+)?/i, '').replace(/\s+/g, ' ').trim();
  function describe(j) {
    const when = j.kind === 'once' ? dateTR(j.at) : j.kind === 'daily' ? `her gün ${j.hm}` : j.kind === 'weekly' ? `her ${DOWN[j.dow]} ${j.hm}` : `her ${j.every >= HOUR ? j.every / HOUR + ' saatte' : j.every / MIN + ' dakikada'} bir`;
    return `${when} → ${j.cmd.replace(/^hatırlat(?:ma)?\s+/i, '')}`;
  }
  function addJob(j) {
    j.id = uid('j'); j.created = Date.now(); j.tur = isReminder(j.cmd) ? 'hatirlat' : 'komut'; j.next = nextRun(j);
    jobs.push(j); saveJobs(); logOp('otomasyon', [describe(j)], 'başarılı', 'zamanlandı');
    // uygulama kapalıyken de telefona ulaşsın (ntfy en fazla 3 gün ileri)
    if (j.next - Date.now() < 3 * DAY - MIN && opt('ntfyOn') === '1') window.jarvisPushPhone?.((j.tur === 'hatirlat' ? '⏰ ' : '▶ Zamanlanmış görev: ') + j.cmd, { title: 'SATÜRN', at: new Date(j.next).toISOString(), tags: 'alarm_clock' }).then(() => { j.pushed = j.next; saveJobs(); }).catch(() => {});
    return j;
  }
  function parseJob(text) {
    const t = text.toLocaleLowerCase('tr-TR').replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/, '').replace(/[.!?]+$/, '').trim();
    let m;
    if ((m = t.match(new RegExp('^' + NUMRE + '\\s*(saniye|sn|dakika|dk|saat)\\s+sonra\\s+(.{3,})$')))) {
      if (/^(?:bir\s+)?(?:sayaç|zamanlayıcı|alarm|geri sayım)/.test(m[3])) return null; // sayaç işi eski koda
      const ms = num(m[1]) * UNIT(m[2]); if (!ms) return null;
      return { kind: 'once', at: Date.now() + ms, cmd: cleanCmd(m[3]) };
    }
    if ((m = t.match(new RegExp('^her\\s+gün\\s+' + HM + '\\s+(.{3,})$')))) return { kind: 'daily', hm: `${m[1].padStart(2, '0')}:${m[2] || '00'}`, cmd: cleanCmd(m[3]) };
    if ((m = t.match(new RegExp('^her\\s+(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)\\s+' + HM + '\\s+(.{3,})$')))) return { kind: 'weekly', dow: DOW[m[1]], hm: `${m[2].padStart(2, '0')}:${m[3] || '00'}`, cmd: cleanCmd(m[4]) };
    if ((m = t.match(new RegExp('^her\\s+' + NUMRE + '?\\s*(dakika|dk|saat)(?:te|ta|de|da)?\\s+bir\\s+(.{3,})$')))) {
      const every = Math.max(15 * MIN, (num(m[1] || '1') || 1) * UNIT(m[2])); // kota için en az 15 dk
      return { kind: 'every', every, cmd: cleanCmd(m[3]) };
    }
    if ((m = t.match(new RegExp('^(yarın|bugün|bu akşam)?\\s*' + HM.replace('(?:saat\\s*)?', 'saat\\s*') + '\\s+(.{3,})$')))) {
      let h = Number(m[2]); const mi = Number(m[3] || 0); if (h > 23 || mi > 59) return null;
      if (m[1] === 'bu akşam' && h < 12) h += 12;
      const L = local(Date.now()); let at = atLocal(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate() + (m[1] === 'yarın' ? 1 : 0), h, mi);
      if (at <= Date.now()) at += DAY;
      return { kind: 'once', at, cmd: cleanCmd(m[4]) };
    }
    // “yarın 9da …”, “bu akşam 23:30 …”, “pazartesi 10:00 …”: saat açıkça yazılmalı (9da / 9:00) ya da komut “hatırlat” içermeli —
    // böylece “yarın 2 hasta gelecek” gibi cümleler yanlışlıkla görev olmaz.
    const DAYW = '(yarın|bugün|bu akşam|bu sabah|bu gece|akşam|sabah|(?:önümüzdeki|gelecek)?\\s*(?:pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar))(?:\\s+günü)?';
    if ((m = t.match(new RegExp('^' + DAYW + '\\s+(?:saat\\s*)?(\\d{1,2})(?:[:.](\\d{2}))?([\'’]?(?:de|da|te|ta))?\\s+(.{3,})$')))) {
      const [, dw, hs, ms, suf, rest] = m; if (!ms && !suf && !isReminder(rest)) return null;
      let h = Number(hs); const mi = Number(ms || 0); if (h > 23 || mi > 59) return null;
      if (/akşam/.test(dw) && h >= 1 && h < 12) h += 12; else if (/gece/.test(dw) && h >= 6 && h < 12) h += 12; /* gece 1–5 = sabaha karşı */
      const L = local(Date.now()); let add = 0; const wd = dw.replace(/^(?:önümüzdeki|gelecek)\s*/, '').trim();
      if (dw === 'yarın') add = 1;
      else if (wd in DOW) { const cur = L.getUTCDay(); add = (DOW[wd] - cur + 7) % 7; if (add === 0 && /önümüzdeki|gelecek/.test(dw)) add = 7; /* bugün o günse ve saat geçmediyse bugün */ }
      let at = atLocal(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate() + add, h, mi);
      if (at <= Date.now()) at += wd in DOW ? 7 * DAY : DAY;
      return { kind: 'once', at, cmd: cleanCmd(rest) };
    }
    return null;
  }
  async function runJob(j, late) {
    logOp('otomasyon', [j.cmd], 'başarılı', late ? 'geç çalıştı' : 'çalıştı');
    if (j.tur === 'hatirlat') {
      const what = j.cmd.replace(/^hatırlat(?:ma)?\s+/i, '').replace(/\s*(?:bana\s+)?(?:onu\s+)?hatırlat(?:ır mısın)?\s*$/i, '').replace(/(?:ı|i|u|ü|yı|yi|yu|yü|nı|ni)$/, '') || j.cmd;
      bubble('alarm', '⏰ Hatırlatma: ' + j.cmd.replace(/^hatırlat(?:ma)?\s+/i, '')); beep(); setTimeout(beep, 700);
      if (setting('speakOn') === '1' && !answering && !quiet()) voiceSession.read('Beyhan, hatırlatma: ' + what);
      return;
    }
    await waitIdle(); typedTurn(j.cmd, setting('speakOn') === '1' && !document.hidden && !quiet());
  }
  const waitIdle = async (max = 120000) => { const t0 = Date.now(); while ((answering || phase === 'thinking') && Date.now() - t0 < max) await sleep(500); };
  async function jobTick() {
    const nowT = Date.now();
    for (const j of [...jobs]) {
      if (j.next > nowT) continue;
      const late = nowT - j.next > 2 * MIN;
      if (late && nowT - j.next > 2 * HOUR) { /* kapalıyken kaçan iş saatler sonra çalışmasın; hatırlatma zaten telefona gitti */ note('Kaçırılan zamanlanmış görev (uygulama kapalıydı): ' + describe(j)); }
      else await runJob(j, late);
      if (j.kind === 'once') jobs = jobs.filter(x => x.id !== j.id); else { j.last = nowT; j.next = nextRun(j, nowT); }
      saveJobs();
    }
  }
  setInterval(jobTick, 15000); setTimeout(jobTick, 4000);

  /* ================= 2) ADLANDIRILMIŞ SAYAÇLAR: duraklat / sürdür / ekle / kalan ================= */
  const paused = [];
  function timerCmd(t) {
    let m;
    const pick = name => (name ? timers.find(x => fold(x.label).includes(fold(name))) : timers.at(-1));
    if ((m = t.match(/^(?:(.+?)\s+)?sayac[ıi]n?[ıi]?\s+(?:duraklat|durakla|beklet)$/))) {
      const tm = pick(m[1]); if (!tm) return 'Çalışan sayaç yok.';
      paused.push({ label: tm.label, left: tm.end - Date.now() }); cancelTimer(tm.id); return `${tm.label} duraklatıldı.`;
    }
    if ((m = t.match(/^(?:(.+?)\s+)?sayac[ıi]n?[ıi]?\s+(?:sürdür|devam ettir|başlat)$/)) && paused.length) {
      const i = m[1] ? paused.findIndex(p => fold(p.label).includes(fold(m[1]))) : paused.length - 1; if (i < 0) return 'Duraklatılmış o sayaç yok.';
      const p = paused.splice(i, 1)[0]; startTimer(p.left, p.label); return `${p.label} kaldığı yerden sürüyor.`;
    }
    if ((m = t.match(new RegExp('^(?:(.+?)\\s+)?sayac(?:[ıi]n)?a\\s+' + NUMRE + '\\s*(saniye|sn|dakika|dk|saat)\\s+(?:ekle|daha ekle)$')))) {
      const tm = pick(m[1]); if (!tm) return 'Çalışan sayaç yok.';
      const left = tm.end - Date.now() + num(m[2]) * UNIT(m[3]); cancelTimer(tm.id); startTimer(left, tm.label); return `${tm.label} uzatıldı: ${Math.round(left / MIN)} dakika kaldı.`;
    }
    if ((m = t.match(/^(?:(.+?)\s+)?sayac[ıi]n?(?:da|nda)?\s+(?:ne kadar|kaç dakika|kaç saniye) (?:kaldı|var)$/)) || /^(?:ne kadar|kaç dakika) kaldı$/.test(t)) {
      const tm = pick(m?.[1]); if (!tm) return paused.length ? `${paused.at(-1).label} duraklatılmış, ${Math.round(paused.at(-1).left / MIN)} dakika kaldı.` : 'Çalışan sayaç yok.';
      const left = tm.end - Date.now(); return `${tm.label}: ${Math.floor(left / MIN)} dakika ${Math.round(left / 1000) % 60} saniye kaldı.`;
    }
    return null;
  }

  /* ================= 3) ÖĞRETİLEBİLİR BECERİLER (MAKROLAR) ================= */
  let macros = store.get('macros', {});
  const saveMacros = () => { store.set('macros', macros); renderJobs(); };
  const mkey = n => Object.keys(macros).find(k => fold(k) === fold(n).trim());
  async function runMacro(name, voice) {
    const steps = macros[name]; if (!steps) return;
    logOp('beceri', [name], 'başarılı', steps.length + ' adım');
    for (const s of steps) { await waitIdle(); const r = localCommand(s); if (r) { bubble('ai', r); if (voice && setting('speakOn') === '1') voiceSession.read(r); await sleep(1500); } else await typedTurn(s, voice); await sleep(400); }
  }
  function macroCmd(t, raw) {
    let m;
    if ((m = raw.match(/^\s*(?:jarvis[,\s]+)?(?:yeni\s+beceri|beceri\s+öğren|beceri\s+kaydet)\s*[:,]?\s*([^:]{2,40}?)\s*[:=]\s*(.+)$/i))) {
      const name = trLower(m[1]).trim(), steps = m[2].split(/\s*(?:;|\bsonra\b|\bardından\b)\s*/i).map(s => s.trim()).filter(s => s.length > 2).slice(0, 10);
      if (!steps.length) return 'Beceri adımlarını “;” ile ayırarak söyle.';
      const old = mkey(name); if (old) delete macros[old]; macros[name] = steps; saveMacros(); return `“${m[1].trim()}” becerisini öğrendim (${steps.length} adım). “${m[1].trim()}” dediğinde çalıştırırım.`;
    }
    if ((m = t.match(/^(.+?)\s+becerisini\s+(?:sil|unut)$/)) && mkey(m[1])) { delete macros[mkey(m[1])]; saveMacros(); return `“${m[1]}” becerisini sildim.`; }
    if (/^(?:becerilerim|beceri listesi|hangi becerileri biliyorsun)$/.test(t)) { const k = Object.keys(macros); return k.length ? 'Öğrettiğin beceriler: ' + k.map(x => `${x} (${macros[x].length} adım)`).join(', ') : 'Henüz bana beceri öğretmedin. Örnek: “yeni beceri kapanış: ışıkları kapat; yarınki randevuları oku”.'; }
    const key = mkey(t.replace(/\s+becerisini\s+(?:çalıştır|başlat)$/, ''));
    if (key) { setTimeout(() => runMacro(key, true), 50); return `“${key}” becerisini çalıştırıyorum (${macros[key].length} adım).`; }
    return null;
  }

  /* ================= yerel komut sarmalayıcı ================= */
  const _lc = localCommand;
  localCommand = text => {
    const t = text.toLocaleLowerCase('tr-TR').replace(/^\s*(?:hey\s+)?jarvis[,\s]+/, '').replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
    try {
      const mc = macroCmd(t, text); if (mc) return mc;
      const tc = timerCmd(t); if (tc) return tc;
      if (/^dikte(?:\s+modunu)?\s+(?:aç|başlat)$/.test(t)) { setDictation(true); return 'Dikte modu açık: söylediklerini bilgisayarda açık pencereye yazacağım. Bitirmek için “dikteyi kapat” de.'; }
      if (/^(?:otomasyonlar[ıi]m|zamanlanm[ıi]ş görevler(?:im)?|planlı görevler(?:im)?)$/.test(t)) return jobs.length ? 'Zamanlanmış görevler: ' + jobs.map(describe).join(' · ') : 'Zamanlanmış görev yok.';
      if (/^(?:tüm\s+)?otomasyonlar[ıi]\s+(?:sil|iptal et|kapat)$/.test(t)) { const n = jobs.length; jobs = []; saveJobs(); return n + ' zamanlanmış görev iptal edildi.'; }
      const j = parseJob(text); if (j) { const a = addJob(j); return `Tamam: ${describe(a)}.`; }
    } catch (e) { onerr(e); }
    return _lc(text);
  };
  const onerr = e => { try { logOp('pro', [], 'başarısız', e.message); } catch {} };

  /* ================= 4) YETKİ KURALLARI ================= */
  let policy = store.get('policy', {});
  const pol = k => policy[k] || 'varsayilan';
  for (const [k, tool] of Object.entries(TOOLS)) {
    if (k === 'pc' || typeof tool.run !== 'function') continue;
    const run = tool.run;
    tool.run = (args, ctx) => { // varsayılan kuralda eskisi gibi (eşzamanlı araçlar eşzamanlı kalır)
      if (pol(k) === 'engelle') throw Error(`“${k}” aracı Beyhan tarafından engellendi (Yetki kuralları).`);
      if (pol(k) === 'sor') return confirmAction(`${k} ${short((args || []).join(' | '), 120)}`, ctx?.say).then(y => { if (!y) throw Error('Beyhan onaylamadı.'); return run(args, ctx); });
      return run(args, ctx);
    };
  }
  const _pcCall = pcCall;
  pcCall = async (sub, args, onay) => {
    const k = 'pc:' + sub;
    if (pol(k) === 'engelle') throw Error(`Bilgisayarda “${sub}” Beyhan tarafından engellendi (Yetki kuralları).`);
    if (pol(k) === 'sor' && !onay) { if (!(await confirmAction(`Bilgisayarda “${sub}” ${short((args || []).join(' '), 100)}`))) throw Error('Beyhan onaylamadı.'); onay = true; }
    return _pcCall(sub, args, onay);
  };

  /* ================= 5) HASSAS BİLGİ MASKELEME ================= */
  const luhn = d => { let s = 0; for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } return s % 10 === 0; };
  const tckn = d => { if (d.length !== 11 || d[0] === '0') return false; const n = [...d].map(Number); const a = (((n[0] + n[2] + n[4] + n[6] + n[8]) * 7 - (n[1] + n[3] + n[5] + n[7])) % 10 + 10) % 10; return a === n[9] && n.slice(0, 10).reduce((x, y) => x + y, 0) % 10 === n[10]; };
  function redact(s) {
    if (opt('redact') === '0' || !s) return s;
    return String(s)
      .replace(/\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, '[IBAN GİZLİ]')
      .replace(/\b(?:\d[ -]?){13,19}\b/g, x => (luhn(x.replace(/\D/g, '')) ? '[KART GİZLİ]' : x))
      .replace(/\b\d{11}\b/g, x => (tckn(x) ? '[TC GİZLİ]' : x))
      .replace(/((?:şifre(?:m|si)?|parola(?:m|sı)?|password|pin(?: kodu)?)\s*(?:[:=]|\bis\b|şu(?=\s))?\s*)(\S{3,})/gi, (all, a) => a + '[GİZLİ]');
  }
  window.jarvisRedact = redact;
  const _arch = archiveTurn;
  archiveTurn = (q, a) => _arch(redact(q), redact(a)); window.jarvisArchive = archiveTurn;
  const _save = saveItem;
  saveItem = i => _save(['memory', 'note', 'task'].includes(i.kind) ? { ...i, text: redact(i.text), title: redact(i.title || '') } : i);

  /* ================= 6) PROAKTİF NABIZ ================= */
  const quiet = () => { const q = opt('quiet') || '23-07'; if (q === 'off') return false; const [a, b] = q.split('-').map(Number), h = local(Date.now()).getUTCHours(); return a > b ? h >= a || h < b : h >= a && h < b; };
  const pulseSeen = store.get('pulse', {});
  function pulse() {
    if (opt('pulse') === '0') return;
    const nowT = Date.now(), msgs = [];
    for (const i of items) {
      if (i.kind !== 'task' || i.done || !i.due || !i.due.includes('T')) continue;
      const t = new Date(i.due).getTime(), k = 'y:' + i.id + i.due;
      if (t > nowT && t - nowT <= 15 * MIN && !pulseSeen[k]) { pulseSeen[k] = nowT; msgs.push(`${Math.max(1, Math.round((t - nowT) / MIN))} dakika sonra: ${i.text}`); }
    }
    const lateN = items.filter(isLate).length, day = local(nowT).toISOString().slice(0, 10);
    if (lateN && pulseSeen['late:' + day] !== lateN && local(nowT).getUTCHours() >= 9) { pulseSeen['late:' + day] = lateN; msgs.push(`${lateN} geciken görevin var`); }
    const nb = window.jarvisNobet?.sorun || 0;
    if (nb && (pulseSeen.nb || 0) < nb) msgs.push(`bilgisayar nöbetçileri ${nb} sorun buldu (NÖBET sekmesi)`);
    pulseSeen.nb = nb;
    for (const k of Object.keys(pulseSeen)) if (/^y:/.test(k) && pulseSeen[k] < nowT - 2 * DAY) delete pulseSeen[k];
    store.set('pulse', pulseSeen);
    if (!msgs.length) return;
    const text = 'Beyhan, ' + msgs.join('; ') + '.';
    bubble('note', '◉ Nabız: ' + text);
    if (setting('speakOn') === '1' && !answering && phase === 'idle' && !quiet() && !document.hidden) voiceSession.read(text);
    else if (document.hidden && opt('ntfyOn') === '1' && !quiet()) window.jarvisPushPhone?.(text, { title: 'SATÜRN', tags: 'bell' }).catch(() => {});
  }
  setInterval(pulse, 5 * MIN); setTimeout(pulse, 20000);

  /* ================= 7) GÜNLÜK NOT + GECE HAFIZA BİRLEŞTİRME ("rüya") ================= */
  async function dream(force) {
    const today = local(Date.now()).toISOString().slice(0, 10);
    if (!force && (opt('dream') === '0' || store.get('dreamDay', '') === today)) return;
    const y0 = Date.parse(today + 'T00:00:00Z') - OFF - DAY, y1 = y0 + DAY;
    const turns = archive.filter(x => x.t >= (force ? Date.now() - DAY : y0) && x.t < (force ? Date.now() : y1));
    store.set('dreamDay', today);
    if (turns.length < 2) return;
    const convo = turns.map(x => `B: ${short(x.q, 300)}\nJ: ${short(x.a, 400)}`).join('\n').slice(-12000);
    const known = items.filter(i => i.kind === 'memory').map(i => '- ' + short(i.text, 120)).join('\n').slice(0, 4000);
    const sys = 'Sen SATÜRN’ün gece hafıza birleştirme ajanısın. Konuşmalardan günlük bir not çıkar ve yalnızca Beyhan’ın açıkça söylediği, kalıcı ve yeni bilgileri seç (tercihler, kişiler, işler, kararlar). Sağlık, kimlik, şifre ve para hesap bilgisi yazma. Zaten bilinenleri tekrar etme. YALNIZCA JSON: {"gunluk":"3-5 kısa madde, \\n ile","kalici":["en fazla 3 kısa bilgi"]}';
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier: 'quick', system: sys, messages: [{ role: 'user', content: `BİLİNENLER:\n${known || '-'}\n\nKONUŞMALAR (${today} öncesi gün):\n${convo}` }] }) });
    if (!r.ok) throw Error('rüya ajanı yanıt alamadı');
    const j = JSON.parse(((await r.text()).match(/\{[\s\S]*\}/) || ['{}'])[0]);
    const d = new Date(y0 + OFF).toISOString().slice(0, 10);
    if (j.gunluk) saveItem({ kind: 'note', title: 'Günlük · ' + d, text: String(j.gunluk).slice(0, 1500), src: 'rüya' });
    const have = items.filter(i => i.kind === 'memory').map(i => fold(i.text));
    const added = [];
    for (const f of (j.kalici || []).slice(0, 3)) { const ff = fold(f); if (f && f.length > 5 && !have.some(h => h.includes(ff) || ff.includes(h))) { saveItem({ kind: 'memory', text: String(f).slice(0, 300), src: 'rüya' }); added.push(f); } }
    logOp('rüya', [d], 'başarılı', `günlük not${added.length ? ' + ' + added.length + ' yeni bilgi' : ''}`);
    note(`Dünün günlüğünü yazdım${added.length ? ' ve ' + added.length + ' yeni şey öğrendim: ' + added.join('; ') : ''}. (HAFIZA / notlar)`, added.length ? () => { items = items.filter(i => !(i.kind === 'memory' && i.src === 'rüya' && added.includes(i.text))); persist(); } : undefined);
  }
  setInterval(() => { if (phase === 'idle' && !answering) dream().catch(onerr); }, 10 * MIN); setTimeout(() => { if (phase === 'idle' && !answering) dream().catch(onerr); }, 45000);

  /* ================= 8) DİKTE MODU ================= */
  let dict = false;
  function setDictation(on) { dict = on; document.body.classList.toggle('dictating', on); $('dictBtn') && ($('dictBtn').textContent = on ? 'Dikteyi kapat' : 'Dikte modunu aç'); }
  const _tt = typedTurn;
  typedTurn = async (text, voiceTurn = false) => {
    if (dict && voiceTurn) {
      const t = text.toLocaleLowerCase('tr-TR').replace(/[.!?,]/g, '').trim();
      if (/^(?:jarvis\s+)?dikte(?:yi|\s+modunu)?\s+(?:kapat|bitir|durdur)$/.test(t)) { setDictation(false); bubble('ai', 'Dikte bitti.'); return; }
      const out = text.replace(/\s+(virgül)\s*/gi, ', ').replace(/\s+(nokta)\s*/gi, '. ').replace(/\s*yeni satır\s*/gi, '\n').replace(/\s+soru işareti\s*/gi, '? ').trim() + ' ';
      try { await pcCall('yaz', [out], true); bubble('note', '⌨ ' + out); } catch (e) { setDictation(false); note('Dikte durdu: ' + e.message); }
      return;
    }
    return _tt(text, voiceTurn);
  };

  /* ================= LLM araçları ================= */
  Object.assign(TOOLS, {
    otomasyon: { d: 'otomasyon|ekle|Türkçe zaman ifadesi ve komut (ör. "her gün 09:00 hava durumunu söyle", "yarın 14:30 bana ilacı hatırlat", "30 dakika sonra kasa raporunu ver") · otomasyon|liste · otomasyon|sil|kimlik', run: ([op, ...a]) => {
      op = fold(op);
      if (op === 'liste') return jobs.length ? jobs.map(j => `[${j.id}] ${describe(j)}`).join('\n') : 'Zamanlanmış görev yok.';
      if (op === 'sil') { const n = jobs.length; jobs = jobs.filter(j => j.id !== a[0]); saveJobs(); return n !== jobs.length ? 'silindi' : 'bulunamadı'; }
      const j = parseJob(a.join(' ')); if (!j) throw Error('Zaman ifadesi anlaşılamadı. Örnek: "her gün 09:00 …", "yarın 14:30 …", "30 dakika sonra …", "her pazartesi 08:00 …", "her 2 saatte bir …"');
      return 'Zamanlandı: ' + describe(addJob(j));
    } },
    beceri: { d: 'beceri|ekle|ad|adım1; adım2; … (Beyhan’ın öğrettiği çok adımlı komut) · beceri|calistir|ad · beceri|liste', run: ([op, name, steps]) => {
      op = fold(op);
      if (op === 'liste') return Object.entries(macros).map(([k, v]) => `${k}: ${v.join(' ; ')}`).join('\n') || 'beceri yok';
      if (op === 'ekle') { const s = String(steps || '').split(';').map(x => x.trim()).filter(Boolean); if (!name || !s.length) throw Error('ad ve adımlar gerekli'); const o = mkey(name); if (o) delete macros[o]; macros[trLower(name).trim()] = s.slice(0, 10); saveMacros(); return `“${name}” becerisi kaydedildi (${s.length} adım)`; }
      if (mkey(name || '')) { const k = mkey(name); setTimeout(() => runMacro(k, false), 100); return 'çalıştırılıyor'; }
      throw Error('böyle bir beceri yok');
    } }
  });
  WRITE_TOOLS.add?.('otomasyon'); WRITE_TOOLS.add?.('beceri');
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `\nOTOMASYON: Gelecekte veya tekrar tekrar yapılacak işler için otomasyon aracını kullan (her gün/hafta, X dakika sonra, yarın saat …). Beyhan’ın öğrettiği beceriler: ${Object.keys(macros).join(', ') || 'yok'}. Zamanlanmış görev sayısı: ${jobs.length}.${dict ? ' DİKTE MODU AÇIK.' : ''}`;

  /* ================= OTOMASYON paneli ================= */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-auto', 'aria-selected': 'false', 'data-p': 'auto' }, 'OTOMASYON');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-auto'); renderJobs(); };
  const jobIn = el('input', { id: 'jobInput', placeholder: 'ör. her gün 08:30 sabah brifingini ver' });
  const polBox = el('div', { class: 'polgrid', id: 'polGrid' });
  const p = el('div', { class: 'pane', id: 'p-auto', role: 'tabpanel' },
    el('h3', {}, 'ZAMANLANMIŞ GÖREVLER'),
    el('form', { class: 'row', onsubmit: e => { e.preventDefault(); const j = parseJob(jobIn.value); if (!j) return note('Anlayamadım. Örnek: “her gün 09:00 hava durumunu söyle”, “yarın 14:30 ilacı hatırlat”, “30 dakika sonra kasa raporunu ver”, “her 2 saatte bir su içmeyi hatırlat”.'); addJob(j); jobIn.value = ''; } }, jobIn, el('button', { type: 'submit', class: 'btn' }, 'Ekle')),
    el('ul', { class: 'list', id: 'jobList' }),
    el('p', { class: 'muted' }, 'Sesle de olur: “Jarvis, her pazartesi 8’de haftalık klinik raporunu ver”. Hatırlatmalar yapay zekâ kullanmaz; komutlar zamanı gelince SATÜRN’e sorulur. Uygulama kapalıysa telefona bildirim gider.'),
    el('h3', {}, 'BECERİLER'), el('ul', { class: 'list', id: 'macroList' }),
    el('p', { class: 'muted' }, 'Öğretmek için: “Jarvis, yeni beceri kapanış: ışıkları kapat; yarınki randevuları oku; kasa raporunu ver”. Sonra “kapanış” demen yeter.'),
    el('h3', {}, 'DİKTE'), el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'dictBtn', onclick: () => { setDictation(!dict); note(dict ? 'Dikte modu açık: konuştuğun her şey bilgisayarda açık pencereye yazılır. “virgül”, “nokta”, “yeni satır” diyebilirsin.' : 'Dikte modu kapandı.'); } }, 'Dikte modunu aç')),
    el('h3', {}, 'NABIZ VE HAFIZA'),
    field('pulse', 'Proaktif nabız (yaklaşan iş, gecikenler, bilgisayar sorunu)', sel('pulse', [['1', 'Açık'], ['0', 'Kapalı']], '1')),
    field('quiet', 'Sessiz saatler', sel('quiet', [['23-07', '23:00–07:00'], ['22-08', '22:00–08:00'], ['off', 'Yok']], '23-07')),
    field('dream', 'Gece hafıza birleştirme (günde 1 kısa çağrı)', sel('dream', [['1', 'Açık · dünün günlüğünü yazar, kalıcı bilgileri öğrenir'], ['0', 'Kapalı']], '1')),
    field('redact', 'Hassas bilgi maskeleme', sel('redact', [['1', 'Açık · TC, kart, IBAN, şifre kayıtlara yazılmaz'], ['0', 'Kapalı']], '1')),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => dream(true).catch(e => note(e.message)) }, 'Son 24 saatin günlüğünü şimdi yaz')),
    el('h3', {}, 'YETKİ KURALLARI'), el('p', { class: 'muted' }, 'Her araç için: Varsayılan (otonomi ayarına göre), Her zaman sor, Engelle.'), polBox,
    el('h3', {}, 'TELEGRAM KANALI'),
    el('p', { class: 'muted' }, 'Telegram’dan SATÜRN’e yaz: bilgisayar açıksa yardımcı cevap verir; durum, nöbet raporu, ekran görüntüsü ister, program açtırırsın. Ücretsiz. 1) Telegram’da @BotFather → /newbot ile bot oluştur. 2) Verdiği anahtarı aşağı yapıştır. 3) Bota “/start ERİŞİM-KODU” yaz.'),
    field('tgToken', 'Telegram bot anahtarı', el('input', { id: 'tgToken', type: 'password', placeholder: '123456:ABC…', autocomplete: 'off' })),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'tgBtn', onclick: async () => {
      const tok = $('tgToken').value.trim(); if (tok && !/^\d{5,}:[\w-]{20,}$/.test(tok)) return note('Bu bir Telegram bot anahtarına benzemiyor.');
      let key = ''; try { key = JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch {}
      try { const r = await fetch(PC + '/eslestir', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': opt('pcToken') || '' }, body: JSON.stringify({ telegram: tok, gemini: key }) }); if (!r.ok) throw Error(r.status); store.set('set.tgOn', tok ? '1' : '0'); $('tgToken').value = ''; note(tok ? 'Telegram kanalı bilgisayar yardımcısına bağlandı. Şimdi bota “/start ' + (opt('pcToken') || 'ERİŞİM-KODU') + '” yaz.' : 'Telegram kanalı kapatıldı.'); }
      catch { note('Yardımcıya ulaşılamadı; bunu yardımcının kurulu olduğu bilgisayardan yap (sürüm 8 gerekli).'); }
    } }, 'Bilgisayar yardımcısına bağla'), el('button', { type: 'button', class: 'btn ghost', onclick: () => { $('tgToken').value = ''; $('tgBtn').click(); } }, 'Kapat')));
  p.hidden = true; $('p-settings').before(p);
  const dk = el('button', { type: 'button', 'data-open': 'auto', onclick: () => openDrawer('auto') }, 'OTOMASYON');
  document.querySelector('.dockbar').insertBefore(dk, document.querySelector('.dockbar [data-open="settings"]'));
  function renderJobs() {
    if (!$('jobList')) return;
    $('jobList').replaceChildren(...(jobs.length ? [...jobs].sort((a, b) => a.next - b.next).map(j => el('li', { class: 'item' }, el('span', {}, j.tur === 'hatirlat' ? '⏰' : '▶'), el('div', {}, el('p', {}, j.cmd), el('small', {}, describe(j).split(' → ')[0] + ' · sıradaki: ' + dateTR(j.next))), el('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Sil', onclick: () => { jobs = jobs.filter(x => x.id !== j.id); saveJobs(); } }, '×'))) : [el('li', { class: 'muted' }, 'Zamanlanmış görev yok.')]));
    $('macroList').replaceChildren(...(Object.keys(macros).length ? Object.entries(macros).map(([k, v]) => el('li', { class: 'item' }, el('span', {}, '◆'), el('div', {}, el('p', {}, el('b', {}, k)), el('small', {}, v.join(' → '))), el('div', { class: 'nbbtns' }, el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); runMacro(k, false); } }, 'Çalıştır'), el('button', { type: 'button', class: 'btn ghost', onclick: () => { delete macros[k]; saveMacros(); } }, 'Sil')))) : [el('li', { class: 'muted' }, 'Henüz beceri yok.')]));
  }
  const POL_PC = ['dosya_sil', 'dosya_tasi', 'surec_kapat', 'kapat', 'guc', 'kur', 'powershell', 'yaz', 'tikla', 'ac', 'ekran'];
  function renderPolicy() {
    const keys = [...Object.keys(TOOLS).filter(k => k !== 'pc'), ...POL_PC.map(s => 'pc:' + s)];
    polBox.replaceChildren(...keys.map(k => { const s = el('select', { 'aria-label': k }); for (const [v, t] of [['varsayilan', 'Varsayılan'], ['sor', 'Her zaman sor'], ['engelle', 'Engelle']]) s.append(new Option(t, v)); s.value = pol(k); s.onchange = () => { if (s.value === 'varsayilan') delete policy[k]; else policy[k] = s.value; store.set('policy', policy); logOp('yetki kuralı', [k, s.value], 'başarılı'); }; return el('label', { class: 'polrow' }, el('span', {}, k.replace('pc:', 'bilgisayar · ')), s); }));
  }
  renderPolicy(); renderJobs();
  window.jarvisPro = { parseJob, addJob, jobs: () => jobs, macros: () => macros, redact, dream, pulse, setDictation, runMacro };
})();
