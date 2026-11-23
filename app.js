'use strict';
/* JARVIS uygulama 1.0 — kurulabilir web uygulaması (PWA).
 * Konuşma: tarayıcının konuşma tanıması + JARVIS 0.39 ses motoru (JarvisVoice, JarvisSpeechPlayer).
 * Beyin: kendi sunucumuzdaki /api/chat (Claude API). Anahtarlar yalnızca sunucuda. */
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('jarvisapp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jarvisapp.' + k, JSON.stringify(v)); } catch {} }
};
const TZ = { timeZone: 'Europe/Istanbul' };
const now = () => new Date();
let server = { speech: false, stt: false, sync: false, images: true };
let phase = 'idle', items = store.get('items', []), answering = false, controller = null, pendingImage = null;
let chat = { messages: store.get('history', []), summary: store.get('summary', '') };
let updated = store.get('updated', 0);

/* ================= auth & network ================= */
const key = () => store.get('key', '');
// In the GitHub Pages build there is no server: direct.js emulates the /api endpoints in the browser.
const net = (...a) => (window.jarvisDirect ? window.jarvisDirect.fetch(...a) : fetch(...a));
async function api(path, options = {}) {
  const r = await net(path, { ...options, headers: { 'Content-Type': 'application/json', 'x-jarvis-key': key(), ...(options.headers || {}) } });
  if (r.status === 401) { showGate('Şifre geçersiz veya değişmiş. Tekrar gir.'); throw Object.assign(Error('Yetkisiz'), { status: 401 }); }
  return r;
}
const authFetch = (url, o = {}) => net(url, { ...o, headers: { ...(o.headers || {}), 'x-jarvis-key': key() } });
function showGate(msg = '') { $('gate').hidden = false; $('gateErr').textContent = msg; setTimeout(() => $('gateKey').focus(), 50); }
$('gateForm').onsubmit = async e => {
  e.preventDefault();
  store.set('key', $('gateKey').value);
  try {
    const r = await net('/api/status', { headers: { 'x-jarvis-key': key(), 'x-validate': '1' } });
    if (!r.ok) { let d = {}; try { d = await r.json(); } catch {} $('gateErr').textContent = d.error || (r.status === 401 ? 'Şifre yanlış.' : 'Sunucu yanıt vermedi (' + r.status + ').'); return; }
    $('gate').hidden = true; $('gateKey').value = ''; boot(await r.json());
  } catch { $('gateErr').textContent = 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.'; }
};
$('logout').onclick = () => { store.set('key', ''); location.reload(); };

/* ================= settings ================= */
const voiceSel = $('voice');
(() => { // microphone method: browser recognition or recording + server speech-to-text (iPhone home-screen fallback)
  const f = document.createElement('div'); f.className = 'field';
  f.innerHTML = '<label for="micMode">Mikrofon yöntemi</label><select id="micMode"><option value="auto">Otomatik · tarayıcı tanıma</option><option value="record">Ses kaydı · sunucuda yazıya çevir</option></select>';
  $('pause').closest('.field').after(f);
})();
voiceSel.innerHTML = '<option value="natural">Doğal ses · sunucu</option><option value="device" selected>Telefon/bilgisayar sesi</option>';
for (const id of ['speakOn', 'voice', 'rate', 'pause', 'depth', 'length', 'learn', 'persona', 'micMode']) {
  const v = store.get('set.' + id, null);
  if (v !== null && [...$(id).options].some(o => o.value === v)) $(id).value = v;
  $(id).addEventListener('change', () => { store.set('set.' + id, $(id).value); sysInfo(); });
}
const setting = id => $(id).value;

/* ================= tabs, clock, install ================= */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-' + b.dataset.p);
});
const nowText = () => now().toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', ...TZ });
const isoLocal = d => { const p = n => String(n).padStart(2, '0'); const t = new Date(d.toLocaleString('en-US', TZ)); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };
setInterval(() => { $('clock').textContent = nowText(); }, 20000); $('clock').textContent = nowText();

let installEvent = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('install').hidden = false; });
addEventListener('appinstalled', () => { $('install').hidden = true; note('JARVIS uygulama olarak yüklendi.'); });
if (isIOS && !standalone) $('install').hidden = false;
$('install').onclick = async () => {
  if (installEvent) { installEvent.prompt(); const r = await installEvent.userChoice; if (r.outcome === 'accepted') $('install').hidden = true; installEvent = null; }
  else if (isIOS) $('iosSheet').hidden = false;
  else note('Tarayıcının adres çubuğundaki “Yükle” simgesini veya menüdeki “Uygulamayı yükle”yi kullan.');
};
$('iosClose').onclick = () => { $('iosSheet').hidden = true; };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ================= phase & reactor ================= */
const LABEL = { idle: 'HAZIR', starting: 'MİKROFON', listening: 'DİNLİYORUM', thinking: 'DÜŞÜNÜYORUM', speaking: 'KONUŞUYORUM', error: 'DİKKAT' };
let micOn = false;
function setPhase(p, msg) {
  phase = p;
  $('phase').textContent = LABEL[p] || p;
  if (msg !== undefined) $('status').textContent = msg;
  $('mic').dataset.on = micOn || p === 'listening' || p === 'starting' ? '1' : '0';
  const busy = p === 'thinking' || p === 'speaking';
  $('send').textContent = busy ? 'Durdur' : 'Gönder';
  $('send').classList.toggle('stop', busy);
}
(function orb() {
  const c = $('orb'), g = c.getContext('2d'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0, level = 0;
  window.jarvisAvatarLevel = v => { level = Math.max(0, Math.min(1, Number(v) || 0)); };
  (function draw() {
    const css = getComputedStyle(document.documentElement);
    const brass = css.getPropertyValue('--brass').trim(), steel = css.getPropertyValue('--steel').trim(), line = css.getPropertyValue('--line').trim();
    const W = c.width, cx = W / 2, cy = W / 2;
    g.clearRect(0, 0, W, W);
    const energy = { idle: 0.15, starting: 0.4, listening: 0.75, thinking: 0.45, speaking: 1, error: 0.1 }[phase] ?? 0.2;
    t += reduce ? 0 : 0.016 * (0.6 + energy * 1.6);
    g.lineWidth = 2; g.strokeStyle = line; g.beginPath(); g.arc(cx, cy, W * 0.46, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 3; i++) {
      const r = W * (0.40 - i * 0.075), start = t * (i % 2 ? -1 : 1) * (1 + i * 0.4);
      g.strokeStyle = i === 1 ? steel : brass; g.lineWidth = 6 - i * 1.5; g.lineCap = 'round';
      for (let s = 0; s < 3; s++) { g.beginPath(); g.arc(cx, cy, r, start + s * 2.094, start + s * 2.094 + 1.2 + energy * 0.5); g.stroke(); }
    }
    const pulse = 1 + level * 0.25 + (phase === 'speaking' ? Math.sin(t * 9) * 0.08 : phase === 'listening' ? Math.sin(t * 5) * 0.05 : 0);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.16 * pulse);
    grad.addColorStop(0, brass); grad.addColorStop(1, 'transparent');
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, W * 0.16 * pulse, 0, Math.PI * 2); g.fill();
    requestAnimationFrame(draw);
  })();
})();
window.jarvisAvatarSpeech = () => {};

/* ================= feed ================= */
function bubble(kind, text, opts = {}) {
  $('empty')?.remove();
  const d = document.createElement('div');
  d.className = 'msg ' + kind;
  if (kind === 'me' || kind === 'ai') { const w = document.createElement('span'); w.className = 'who'; w.textContent = kind === 'me' ? 'BEYHAN' : 'JARVIS'; d.append(w); }
  if (opts.image) { const im = document.createElement('img'); im.src = opts.image; im.alt = 'Eklenen görsel'; d.append(im); }
  const body = document.createElement('span'); body.textContent = text; d.append(body);
  $('feed').append(d); $('feed').scrollTop = $('feed').scrollHeight;
  return { el: d, body };
}
function note(text, undo) {
  const n = bubble('note', text);
  if (undo) { const b = document.createElement('button'); b.type = 'button'; b.className = 'undo'; b.textContent = 'Geri al'; b.onclick = () => { undo(); b.remove(); n.body.textContent += ' (geri alındı)'; }; n.el.append(b); }
}
function answerTools(el, text) {
  const bar = document.createElement('div'); bar.className = 'tool';
  const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; bar.append(b); };
  mk('Kopyala', () => { const p = navigator.clipboard?.writeText(text); if (p) p.then(() => note('Kopyalandı.'), () => note('Kopyalanamadı.')); });
  mk('Not olarak kaydet', () => { saveItem({ kind: 'note', text, title: text.split(/[.\n]/)[0].slice(0, 60) }); note('Not kaydedildi.'); });
  mk('Sesli oku', () => { stopAll(); voiceSession.read(text); });
  mk('Paylaş', () => { if (navigator.share) navigator.share({ text }).catch(() => {}); else note('Bu cihazda paylaşma yok; Kopyala’yı kullan.'); });
  el.append(bar);
}
function renderChat() {
  $('feed').querySelectorAll('.msg').forEach(m => m.remove());
  for (const m of chat.messages.slice(-20)) { const b = bubble(m.role === 'user' ? 'me' : 'ai', m.content); if (m.role === 'assistant') answerTools(b.el, m.content); }
}

/* ================= items ================= */
const isLate = i => i.kind === 'task' && !i.done && i.due && new Date(i.due) <= now();
function dueText(due) {
  const d = new Date(due); if (isNaN(d)) return due;
  return d.toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', ...(String(due).includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}), ...TZ });
}
function renderItems() {
  const tasks = items.filter(i => i.kind === 'task').sort((a, b) => (a.done - b.done) || String(a.due || '9').localeCompare(String(b.due || '9')) || a.created - b.created);
  const mem = items.filter(i => i.kind === 'memory').sort((a, b) => b.created - a.created);
  const notes = items.filter(i => i.kind === 'note').sort((a, b) => b.created - a.created);
  const row = i => {
    const li = document.createElement('li'); li.className = 'item' + (i.done ? ' done' : '') + (isLate(i) ? ' late' : '');
    let lead;
    if (i.kind === 'task') { lead = document.createElement('input'); lead.type = 'checkbox'; lead.checked = !!i.done; lead.setAttribute('aria-label', 'Tamamlandı'); lead.onchange = () => saveItem({ ...i, done: lead.checked }); }
    else { lead = document.createElement('span'); lead.textContent = i.kind === 'note' ? '▪' : '•'; }
    const p = document.createElement('div');
    if (i.kind === 'note') { const d = document.createElement('details'); const s = document.createElement('summary'); s.textContent = i.title || i.text.slice(0, 60); const t = document.createElement('p'); t.textContent = i.text; d.append(s, t); p.append(d); }
    else { const t = document.createElement('p'); t.textContent = i.text; p.append(t); }
    if (i.kind === 'task' && i.due) { const s = document.createElement('small'); s.textContent = (isLate(i) ? 'Gecikti · ' : '') + dueText(i.due); p.append(s); }
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Sil'); x.onclick = () => removeItem(i.id);
    li.append(lead, p, x); return li;
  };
  $('tasks').replaceChildren(...tasks.map(row)); $('memory').replaceChildren(...mem.map(row)); $('notes').replaceChildren(...notes.map(row));
  $('tasksEmpty').hidden = tasks.length > 0; $('memoryEmpty').hidden = mem.length > 0; $('notesEmpty').hidden = notes.length > 0;
  const late = tasks.filter(isLate).length; $('lateBadge').hidden = !late; $('lateBadge').textContent = late;
}
function persist() { updated = Date.now(); store.set('items', items); store.set('history', chat.messages.slice(-28)); store.set('summary', chat.summary); store.set('updated', updated); renderItems(); sysInfo(); scheduleSync(); }
function saveItem(i) {
  const id = i.id || (i.kind[0] + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const clean = { id, kind: i.kind, text: String(i.text).slice(0, 4000), title: String(i.title || '').slice(0, 120), due: i.due || '', done: !!i.done, created: i.created || Date.now() };
  items = items.filter(x => x.id !== id).concat(clean); persist(); return id;
}
function removeItem(id) { items = items.filter(x => x.id !== id); persist(); }
$('addTask').onsubmit = e => { e.preventDefault(); const v = $('taskInput').value.trim(); if (!v) return; saveItem({ kind: 'task', text: v, due: $('taskDue').value || '' }); $('taskInput').value = ''; $('taskDue').value = ''; };
$('addMemory').onsubmit = e => { e.preventDefault(); const v = $('memoryInput').value.trim(); if (v) { saveItem({ kind: 'memory', text: v }); $('memoryInput').value = ''; } };

/* ================= sync (optional, server KV) ================= */
let syncTimer = null, syncing = false;
function scheduleSync() { if (!server.sync) return; clearTimeout(syncTimer); syncTimer = setTimeout(pushSync, 1500); }
async function pushSync() {
  if (!server.sync || syncing) return; syncing = true;
  try { await api('/api/sync', { method: 'PUT', body: JSON.stringify({ items, chat: { messages: chat.messages.slice(-28), summary: chat.summary }, updated }) }); chip('cMem', 'Hafıza: eşitlendi', true); }
  catch { chip('cMem', 'Hafıza: bu cihaz', false); } finally { syncing = false; }
}
async function pullSync() {
  if (!server.sync || answering) return;
  try {
    const r = await api('/api/sync'); if (!r.ok) return;
    const d = await r.json();
    if (d && d.updated > updated) {
      items = Array.isArray(d.items) ? d.items : items;
      if (d.chat) { chat.messages = Array.isArray(d.chat.messages) ? d.chat.messages : chat.messages; chat.summary = d.chat.summary || chat.summary; }
      updated = d.updated; store.set('items', items); store.set('history', chat.messages); store.set('summary', chat.summary); store.set('updated', updated);
      renderItems(); renderChat(); $('summary').textContent = chat.summary || $('summary').textContent; sysInfo();
    } else if (d && d.updated < updated) pushSync();
    chip('cMem', 'Hafıza: eşitlendi', true);
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullSync(); });
setInterval(() => { if (!document.hidden) pullSync(); }, 60000);

/* ================= the brain ================= */
const ACTION = /⟦(HAFIZA|GOREV|TAMAM|SIL|NOT|MOD)\|([^⟧]*)⟧/g;
const cleanAnswer = t => { const cut = t.indexOf('⟦'); return (cut >= 0 ? t.slice(0, cut) : t).replace(/\s+$/, ''); };
const PERSONA = {
  genel: 'Genel kişisel asistan: iş, günlük yaşam, plan, yazışma ve fikir konularında yardım et.',
  fizyo: 'Fizyoterapi uzmanı gibi düşün: kanıta dayalı rehabilitasyon, klinik akıl yürütme, egzersiz dozajı (set, tekrar, sıklık, ilerleme), kırmızı bayraklar. Hasta için yazarken sade dil kullan. Tanı koyma; yönlendirme gereken durumları belirt.',
  klinik: 'Klinik işletme danışmanı gibi düşün: randevu akışı, hasta memnuniyeti, fiyatlandırma, personel, maliyet, yasal yükümlülükler (KVKK, SGK) ve pratik adımlar.',
  icerik: 'Sağlık içerik yazarı ve sosyal medya uzmanı gibi düşün: FİZYOVİTA için Instagram ve WhatsApp metinleri, başlık, görsel önerisi, etik ve yanıltmayan sağlık iletişimi, Cizre yerel kitlesi.',
  akademik: 'Akademik danışman gibi düşün (ZOİ çalışmaları dahil): hipotez, yöntem, istatistik, literatür; emin olmadığın kaynağı uydurma, doğrulanması gerektiğini söyle.'
};
const LENGTH = { kisa: 'Yanıtları kısa ve öz tut.', normal: 'Yanıt uzunluğunu soruya göre ayarla.', detay: 'Konu gerektiriyorsa ayrıntılı ve yapılandırılmış yanıt ver.' };
function instructions(voiceTurn) {
  const fmt = arr => arr.map(i => `- [${i.id}] ${i.text}${i.due ? ' (zaman: ' + i.due + (isLate(i) ? ', GECİKTİ' : '') + ')' : ''}`).join('\n') || '(yok)';
  return `Sen JARVIS'sin: Fizyoterapist Beyhan Erden'in kişisel yapay zekâ asistanı. Beyhan, Cizre/Şırnak'ta FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi'ni işletiyor.
Şu an: ${nowText()} (Türkiye saati, ISO ${isoLocal(now())}).
Rol: ${PERSONA[setting('persona')] || PERSONA.genel}
Üslup: doğal, sıcak, akıcı Türkçe; "sen" diye hitap et; önce cevabı ver; gereksiz selam ve kapanış sorusu kullanma; yeri gelince kısa, zekice bir espri. ${LENGTH[setting('length')]} Bilmediğini uydurma. Yapmadığın bir işlemi (mesaj gönderme, arama yapma, internete bakma) yaptım deme; internete erişimin yok, güncel bilgi gerekiyorsa bunu söyle. Kesin tıbbi tanı veya ilaç dozu verme.
${voiceTurn ? 'BU YANIT SESLİ OKUNACAK: 1-4 kısa cümle; liste, başlık, emoji, parantez, bağlantı, tablo kullanma; kısaltmaları açık yaz; yüzde ve para birimini sözcükle yaz.' : 'Yazılı yanıt: gerekirse kısa liste kullan.'}

GEÇMİŞ SOHBETLERİN ÖZETİ:
${chat.summary || '(yok)'}

BEYHAN HAKKINDA BİLDİKLERİN:
${fmt(items.filter(i => i.kind === 'memory'))}

AÇIK GÖREVLER VE HATIRLATMALAR:
${fmt(items.filter(i => i.kind === 'task' && !i.done))}

SON TAMAMLANANLAR:
${fmt(items.filter(i => i.kind === 'task' && i.done).slice(-5))}

NOTLAR (başlıklar):
${items.filter(i => i.kind === 'note').slice(-8).map(i => `- [${i.id}] ${i.title || i.text.slice(0, 60)}`).join('\n') || '(yok)'}

EYLEMLER: gerektiğinde yanıtın EN SONUNA, her biri ayrı satırda, açıklamasız ekle; sistem uygular ve ekranda gizler.
⟦GOREV|metin|YYYY-MM-DDTHH:MM veya boş⟧ Beyhan bir şey yapmayı, hatırlatmayı veya randevuyu söylediğinde. Göreceli zamanı ("yarın 10'da", "1 saat sonra") yukarıdaki şu ana göre mutlak zamana çevir.
⟦TAMAM|görev id⟧ bir görevin bittiğini söylediğinde.
⟦NOT|başlık|metin⟧ "not al" veya "kaydet" dediğinde ya da hazırladığın uzun bir metni saklamak istediğinde.
⟦HAFIZA|bilgi⟧ "hatırla" dediğinde${setting('learn') === '1' ? '; ayrıca kendisi, işi veya tercihleri hakkında kalıcı ve işe yarar bir bilgi söylediğinde (sağlık, din, siyaset, para gibi hassas bilgileri kendiliğinden KAYDETME; zaten listede olanı tekrar kaydetme)' : ''}.
⟦SIL|id⟧ bir kaydı silmesini istediğinde. ⟦MOD|genel, fizyo, klinik, icerik veya akademik⟧ başka bir uzmanlık istediğinde.
Yalnızca listedeki id'leri kullan. Eylem yoksa işaret ekleme. Eylem eklediysen yanıtta kısaca ne yaptığını söyle.`;
}
function applyActions(text) {
  for (const [, kind, raw] of text.matchAll(ACTION)) {
    const [a = '', b = ''] = raw.split('|').map(s => s.trim());
    if (kind === 'HAFIZA' && a) { const id = saveItem({ kind: 'memory', text: a }); note('Hafızaya eklendi: ' + a, () => removeItem(id)); }
    if (kind === 'GOREV' && a) { const due = /^\d{4}-\d{2}-\d{2}/.test(b) ? b : ''; const id = saveItem({ kind: 'task', text: a, due }); note('Görev: ' + a + (due ? ' · ' + dueText(due) : ''), () => removeItem(id)); }
    if (kind === 'NOT' && (a || b)) { const id = saveItem({ kind: 'note', title: a, text: b || a }); note('Not kaydedildi: ' + (a || b.slice(0, 40)), () => removeItem(id)); }
    if (kind === 'TAMAM') { const it = items.find(i => i.id === a && i.kind === 'task'); if (it) { saveItem({ ...it, done: true }); note('Tamamlandı: ' + it.text, () => saveItem({ ...it, done: false })); } }
    if (kind === 'SIL') { const it = items.find(i => i.id === a); if (it) { removeItem(a); note('Silindi: ' + (it.title || it.text), () => saveItem(it)); } }
    if (kind === 'MOD' && PERSONA[a]) { $('persona').value = a; store.set('set.persona', a); note('Uzman modu: ' + $('persona').selectedOptions[0].text); sysInfo(); }
  }
}
function pickTier(text, voiceTurn, hasImage) {
  const s = setting('depth');
  if (s !== 'auto') return s;
  if (hasImage) return 'default';
  if (/analiz|plan|program|strateji|makale|araştır|karşılaştır|detaylı|ayrıntılı|rapor|protokol|hesapla|istatistik/i.test(text) || text.length > 400) return 'complex';
  if (voiceTurn && text.length < 120) return 'quick';
  return text.length < 60 ? 'quick' : 'default';
}
function localCommand(text) {
  const t = text.toLocaleLowerCase('tr-TR').replace(/[.!?,]/g, '').trim();
  const rate = v => { $('rate').value = v; store.set('set.rate', v); };
  if (/^(?:jarvis\s+)?(?:daha\s+)?yavaş konuş$/.test(t)) { rate('0.9'); return 'Daha yavaş konuşacağım.'; }
  if (/^(?:jarvis\s+)?normal hızda konuş$/.test(t)) { rate('1'); return 'Normal hızıma döndüm.'; }
  if (/^(?:jarvis\s+)?(?:daha\s+)?hızlı konuş$/.test(t)) { rate('1.12'); return 'Biraz hızlanıyorum.'; }
  if (/^(?:jarvis\s+)?sesli yanıtı kapat$/.test(t)) { $('speakOn').value = '0'; store.set('set.speakOn', '0'); return 'Bundan sonra yalnızca yazacağım.'; }
  if (/^(?:jarvis\s+)?sesli yanıtı aç$/.test(t)) { $('speakOn').value = '1'; store.set('set.speakOn', '1'); return 'Sesli yanıt açık.'; }
  return null;
}
/** Streams a Claude answer. onDelta receives only the speakable part (action marks are cut). Returns the clean reply. */
async function think(text, { voiceTurn = false, onDelta = () => {}, image = null } = {}) {
  const local = localCommand(text);
  bubble('me', text || '(görsel)', { image: image?.url });
  if (local) { const b = bubble('ai', local); answerTools(b.el, local); return local; }
  const messages = chat.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'user', content: text || 'Bu görseli incele; ne gördüğünü ve varsa önemli noktaları söyle.' });
  const out = bubble('ai', '…');
  answering = true; controller = new AbortController();
  let full = '', sent = 0;
  try {
    const r = await api('/api/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ system: instructions(voiceTurn), messages, tier: pickTier(text, voiceTurn, !!image), image: image ? { mediaType: image.type, data: image.data } : undefined }) });
    if (!r.ok) { let d = {}; try { d = await r.json(); } catch {} throw Object.assign(Error(d.error || 'Sunucu hatası ' + r.status), { status: r.status }); }
    const reader = r.body.getReader(), dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      full += dec.decode(value, { stream: true });
      const c = cleanAnswer(full);
      out.body.textContent = c || '…'; $('feed').scrollTop = $('feed').scrollHeight;
      if (c.length > sent) { onDelta(c.slice(sent)); sent = c.length; }
    }
    full += dec.decode();
    const marker = full.lastIndexOf('\u0000ERR:');
    if (marker >= 0) throw Error(full.slice(marker + 5) || 'Yanıt yarıda kesildi.');
    const c = cleanAnswer(full) || 'Tamam.';
    out.body.textContent = c; answerTools(out.el, c);
    applyActions(full);
    remember(text || '(görsel gönderdi)', c);
    return c;
  } catch (e) {
    if (e.name === 'AbortError') { out.body.textContent = cleanAnswer(full) || '(durduruldu)'; return null; }
    out.body.textContent = cleanAnswer(full) || (e.status === 429 ? 'Kullanım sınırına takıldım; biraz sonra tekrar dene.' : 'Yanıt alınamadı: ' + e.message);
    throw e;
  } finally { answering = false; controller = null; }
}
function stopAll() { controller?.abort(); answering = false; voiceSession.stop('Sustum.'); recorder.stop(); }

/* long-term memory: summarise older turns */
async function remember(q, a) {
  chat.messages.push({ role: 'user', content: q }, { role: 'assistant', content: a });
  if (chat.messages.length > 28) {
    const old = chat.messages.slice(0, 12);
    try {
      const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier: 'quick', system: 'Konuşma özetleyicisin. Yalnızca özeti yaz.', messages: [{ role: 'user', content: `Beyhan ile JARVIS arasındaki eski konuşmaları ve mevcut özeti tek bir güncel özete dönüştür: en fazla 900 karakter, Türkçe, madde işaretli; kalıcı kararlar, devam eden işler, tercihler, önemli kişiler ve tarihler.\n\nMEVCUT ÖZET:\n${chat.summary || '(yok)'}\n\nESKİ KONUŞMA:\n${old.map(m => (m.role === 'user' ? 'Beyhan: ' : 'JARVIS: ') + m.content.slice(0, 1200)).join('\n')}` }] }) });
      const text = r.ok ? (await r.text()).split('\u0000ERR:')[0].trim() : '';
      if (text) { chat.summary = text.slice(0, 1500); chat.messages = chat.messages.slice(12); $('summary').textContent = chat.summary; }
    } catch { chat.messages = chat.messages.slice(-28); }
  }
  persist();
}

/* ================= voice: JARVIS 0.39 engine ================= */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recovery = new JarvisVoiceRecovery({ load: () => store.get('voiceRecovery', null), save: d => store.set('voiceRecovery', d) });
const player = new JarvisSpeechPlayer({
  synth: window.speechSynthesis, fetcher: authFetch, recovery,
  mode: () => server.speech && setting('voice') === 'natural',
  voice: () => 'default',
  status: t => { $('naturalStatus') && ($('naturalStatus').textContent = t); }
});
const bestVoice = () => (window.speechSynthesis?.getVoices() || []).filter(v => /^tr/i.test(v.lang)).sort((a, b) => JarvisSpeechPlayer.voiceScore(b) - JarvisSpeechPlayer.voiceScore(a))[0] || null;
let continuous = store.get('set.continuous', false);
const voiceSession = new JarvisVoice({
  Recognition, synth: player, Utterance: window.SpeechSynthesisUtterance,
  loop: () => continuous,
  voice: bestVoice,
  rate: () => Number(setting('rate')),
  onTranscript: (text, final) => { $('partial').textContent = final ? '' : text; },
  onMicrophoneError: () => note('Mikrofon izni verilmedi. Tarayıcı veya telefon ayarlarından bu siteye mikrofon izni ver.' + (server.stt ? ' Sorun sürerse Ayar → Mikrofon yöntemi → Ses kaydı seç.' : '')),
  onState: (p, msg) => { micOn = voiceSession.active && ['starting', 'listening'].includes(p); setPhase(p === 'idle' ? 'idle' : p, msg); },
  onText: async (text, onDelta) => {
    if (JarvisHandsFree.hallucination(text)) return null;
    try { return await think(text, { voiceTurn: true, onDelta: setting('speakOn') === '1' ? onDelta : () => {} }); }
    catch { return null; }
  }
});

/* Recording fallback for browsers without speech recognition (needs server speech-to-text). */
const recorder = {
  active: false, stream: null, rec: null, ctx: null, timer: null,
  async start() {
    if (!server.stt) { note('Bu tarayıcıda konuşma tanıma yok ve sunucuda yazıya çevirme ayarlı değil. Chrome/Edge/Safari kullan veya GROQ_API_KEY ekle.'); return; }
    try {
      this.stream ||= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { note('Mikrofon izni verilmedi.'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(x => window.MediaRecorder?.isTypeSupported(x)) || '';
    const chunks = []; this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    this.rec.onstop = async () => {
      clearInterval(this.timer); this.ctx?.close().catch(() => {}); this.ctx = null;
      if (!this.active) return; this.active = false; micOn = false;
      const blob = new Blob(chunks, { type: (this.rec.mimeType || mime || 'audio/webm').split(';')[0] });
      if (blob.size < 2000) { setPhase('idle', 'Ses algılanmadı.'); return; }
      setPhase('thinking', 'Sözlerini yazıya çeviriyorum…');
      try {
        const b64 = await blobToBase64(blob);
        const r = await api('/api/stt', { method: 'POST', body: JSON.stringify({ mimeType: blob.type, data: b64 }) });
        const d = await r.json();
        if (!r.ok || !d.text) { setPhase('idle', d.error || 'Konuşma anlaşılamadı.'); if (continuous) this.start(); return; }
        await typedTurn(d.text, true);
        if (continuous && !document.hidden) this.start();
      } catch { setPhase('error', 'Ses gönderilemedi.'); }
    };
    this.rec.start(250); this.active = true; micOn = true;
    setPhase('listening', 'Dinliyorum… Sözün bitince gönderirim.');
    // adaptive end-of-speech (same rule as JARVIS 0.39 recording path)
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC(); const an = this.ctx.createAnalyser(); an.fftSize = 1024; this.ctx.createMediaStreamSource(this.stream).connect(an);
    const buf = new Float32Array(an.fftSize); const floor = { blocks: [], min: Infinity, ticks: 0, noise: 0.004 };
    let heard = false, voiced = 0, last = Date.now(); const begun = Date.now();
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf); const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
      window.jarvisAvatarLevel(rms * 12);
      floor.min = Math.min(floor.min, rms);
      if (++floor.ticks >= 3) { floor.blocks.push(floor.min); if (floor.blocks.length > 6) floor.blocks.shift(); if (floor.blocks.length >= 3) floor.noise = Math.min(0.03, Math.min(...floor.blocks) * 1.1); floor.min = Infinity; floor.ticks = 0; }
      if (rms > Math.max(0.008, floor.noise * 2.8)) { voiced += 100; if (voiced >= 200) heard = true; last = Date.now(); }
      else if (heard && Date.now() - last > JarvisLiveDictation.endPause(Number(setting('pause')), '')) this.finish();
      if (Date.now() - begun > 30000 || (!heard && Date.now() - begun > 12000)) this.finish();
    }, 100);
  },
  finish() { clearInterval(this.timer); try { if (this.rec?.state === 'recording') this.rec.stop(); } catch {} },
  stop() { this.active = false; micOn = false; this.finish(); this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; window.jarvisAvatarLevel(0); }
};
const blobToBase64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });

/* Typed turn (and recording fallback): speak the streamed answer with the same engine. */
async function typedTurn(text, voiceTurn = false) {
  const image = pendingImage; pendingImage = null; $('pendingImg').hidden = true;
  const speak = setting('speakOn') === '1' && (voiceTurn || store.get('set.readTyped', true));
  const stream = speak ? voiceSession.readStream(() => {}) : null;
  setPhase('thinking', image ? 'Görseli inceliyorum…' : 'Düşünüyorum…');
  try {
    const reply = await think(text, { voiceTurn, image, onDelta: d => stream?.push(d) });
    if (!reply) { stream && voiceSession.stop('Durdurdum.'); if (!stream) setPhase('idle', 'Durdurdum.'); return; }
    if (stream) { if (!stream.received) stream.push(reply); stream.finish(); } else setPhase('idle', 'Hazırım.');
  } catch (e) { stream && voiceSession.stop(); setPhase('error', e.status === 429 ? 'Kullanım sınırı; biraz bekle.' : 'Yanıt alınamadı. Bağlantını kontrol et.'); }
}

/* ================= controls ================= */
function setMode(cont) {
  continuous = cont; store.set('set.continuous', cont);
  $('mPush').setAttribute('aria-pressed', String(!cont)); $('mLive').setAttribute('aria-pressed', String(cont));
  $('hint').textContent = cont
    ? 'Sürekli sohbet: bir kez dokun; ben yanıt verince kendiliğinden yeniden dinlerim. Konuşurken dokunursan sözümü keserim. Kulaklık önerilir.'
    : 'Bas-konuş: dokun, konuş; sözün bitince gönderirim. Ben konuşurken dokunursan susar ve seni dinlerim.';
}
$('mPush').onclick = () => setMode(false); $('mLive').onclick = () => setMode(true);
setMode(continuous);
$('mic').onclick = () => {
  window.jarvisUnlock();
  if (recorder.active) { recorder.finish(); return; }
  if (!Recognition || setting('micMode') === 'record') { recorder.start(); return; }
  if (voiceSession.active) {
    // Barge-in: stop talking and listen to the user right away (0.39 interrupt).
    if (['speaking', 'thinking'].includes(voiceSession.phase)) { controller?.abort(); voiceSession.interrupt(); return; }
    voiceSession.stop(continuous ? 'Sürekli sohbet kapandı.' : 'Mikrofon kapalı.'); return;
  }
  controller?.abort();
  voiceSession.start();
};
window.jarvisUnlock = () => {
  player.unlock();
  try { if (!window.jarvisPrimed && window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'tr-TR'; speechSynthesis.speak(u); window.jarvisPrimed = true; } } catch {}
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { stopAll(); return; }
  if (e.code !== 'Space' || e.repeat || /input|textarea|select|button/i.test(document.activeElement?.tagName || '')) return;
  e.preventDefault(); $('mic').click();
});
$('composer').onsubmit = e => {
  e.preventDefault(); window.jarvisUnlock();
  if (phase === 'thinking' || phase === 'speaking') { stopAll(); return; }
  const v = $('prompt').value.trim(); if (!v && !pendingImage) return;
  $('prompt').value = ''; autosize(); voiceSession.stop(''); typedTurn(v, false);
};
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); $('composer').requestSubmit(); } });
function autosize() { const t = $('prompt'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }
$('prompt').addEventListener('input', autosize);
document.querySelectorAll('.suggest button').forEach(b => b.onclick = () => { window.jarvisUnlock(); if (b.dataset.p) { $('persona').value = b.dataset.p; store.set('set.persona', b.dataset.p); } typedTurn(b.dataset.q, false); });
$('brief').onclick = () => { window.jarvisUnlock(); typedTurn('Bana kısa bir brifing ver: bugünün tarihi, gecikmiş ve bugünkü görevlerim, yaklaşan hatırlatmalar ve dikkat etmem gereken bir şey varsa o.', true); };
$('clearChat').onclick = () => { chat.messages = []; persist(); renderChat(); note('Sohbet temizlendi. Özet, hafıza, notlar ve görevler duruyor.'); };
$('testVoice').onclick = () => { window.jarvisUnlock(); stopAll(); voiceSession.read('Merhaba Beyhan, ben Jarvis. Sesim böyle; hızımı ve tonumu buradan değiştirebilirsin.'); };

/* images: resize on the phone before sending (faster, cheaper, within API limits) */
async function prepareImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw Error('Görsel açılamadı.');
  const s = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  return { type: 'image/jpeg', data: await blobToBase64(blob), url: URL.createObjectURL(blob) };
}
async function setImage(f, name) {
  try { pendingImage = await prepareImage(f); $('pendingThumb').src = pendingImage.url; $('pendingName').textContent = name; $('pendingImg').hidden = false; $('prompt').focus(); }
  catch { note('Bu görsel açılamadı. JPEG veya PNG dene.'); }
}
$('file').accept = 'image/*';
$('attach').onclick = () => $('file').click();
$('file').onchange = () => { const f = $('file').files[0]; $('file').value = ''; if (f) setImage(f, f.name); };
$('dropImg').onclick = () => { pendingImage = null; $('pendingImg').hidden = true; };
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) setImage(f, 'Yapıştırılan görsel'); });

/* ================= reminders ================= */
const announced = new Set(store.get('announced', []));
function beep() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, A.currentTime); g.gain.exponentialRampToValueAtTime(0.15, A.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 0.5);
    o.connect(g).connect(A.destination); o.start(); o.stop(A.currentTime + 0.55); setTimeout(() => A.close(), 800);
  } catch {}
}
function checkReminders() {
  const due = items.filter(i => isLate(i) && !announced.has(i.id));
  for (const i of due) {
    announced.add(i.id);
    bubble('alarm', '⏰ Hatırlatma: ' + i.text + ' · ' + dueText(i.due));
    beep();
    try { if (window.Notification?.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('JARVIS hatırlatma', { body: i.text, icon: 'icon-192.png', tag: i.id })); } catch {}
    if (!voiceSession.active && !answering && Date.now() - new Date(i.due) < 3600000 && setting('speakOn') === '1') voiceSession.read('Beyhan, hatırlatma: ' + i.text + '.');
  }
  if (due.length) store.set('announced', [...announced].slice(-300));
  renderItems();
}
setInterval(checkReminders, 30000);
(() => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Bildirimlere izin ver';
  b.hidden = !('Notification' in window) || Notification.permission !== 'default';
  b.onclick = () => Notification.requestPermission().then(p => { b.hidden = true; note(p === 'granted' ? 'Bildirimler açık. Uygulama açıkken zamanı gelen hatırlatmalar bildirim olarak da gelir.' : 'Bildirim izni verilmedi.'); });
  $('addTask').after(b);
})();

/* ================= export ================= */
function download(filename, data) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'text/markdown' })); a.download = filename;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const stamp = () => isoLocal(now()).slice(0, 10);
$('exportNotes').onclick = () => download(`jarvis-notlar-${stamp()}.md`, '# JARVIS notları\n\n' + items.filter(i => i.kind === 'note').map(i => `## ${i.title || 'Not'}\n\n${i.text}\n`).join('\n') + '\n# Hafıza\n\n' + items.filter(i => i.kind === 'memory').map(i => '- ' + i.text).join('\n') + '\n\n# Görevler\n\n' + items.filter(i => i.kind === 'task').map(i => `- [${i.done ? 'x' : ' '}] ${i.text}${i.due ? ' (' + dueText(i.due) + ')' : ''}`).join('\n'));
$('exportChat').onclick = () => download(`jarvis-sohbet-${stamp()}.md`, '# JARVIS sohbeti\n\n' + (chat.summary ? '## Özet\n\n' + chat.summary + '\n\n' : '') + chat.messages.map(m => `**${m.role === 'user' ? 'Beyhan' : 'JARVIS'}:** ${m.content}`).join('\n\n'));

/* ================= status ================= */
function chip(id, text, on) { $(id).textContent = text; $(id).dataset.s = on ? 'on' : 'off'; }
function sysInfo() {
  const rows = [
    ['Beyin', (server.provider === 'gemini' ? 'Gemini ücretsiz' : 'Claude') + ' · ' + $('depth').selectedOptions[0].text],
    ['Uzman modu', $('persona').selectedOptions[0].text],
    ['Mikrofon', Recognition && setting('micMode') !== 'record' ? 'tarayıcı konuşma tanıma · Türkçe' : server.stt ? 'ses kaydı → sunucuda yazıya çevirme' : 'yok · yazarak kullan'],
    ['Ses', setting('voice') === 'natural' && server.speech ? 'doğal ses (sunucu), sorun olursa cihaz sesi' : 'cihaz sesi · ' + (bestVoice()?.name || 'varsayılan')],
    ['Eşitleme', server.sync ? 'telefon ve bilgisayar ortak' : 'yalnız bu cihaz (sunucuda JARVIS_KV yok)'],
    ['Kayıtlar', ['task', 'memory', 'note'].map(k => items.filter(i => i.kind === k).length + ' ' + { task: 'görev', memory: 'hafıza', note: 'not' }[k]).join(' · ')],
    ['Kurulum', standalone ? 'uygulama olarak açık' : 'tarayıcıda açık'],
    ['Ses motoru', 'JARVIS 0.39.0']
  ];
  $('sys').replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
}
window.speechSynthesis?.addEventListener?.('voiceschanged', sysInfo);

/* ================= boot ================= */
function boot(info) {
  server = { ...server, ...info };
  const naturalOpt = voiceSel.querySelector('[value="natural"]');
  naturalOpt.disabled = !server.speech;
  if (!server.speech && voiceSel.value === 'natural') voiceSel.value = 'device';
  chip('cBrain', server.provider === 'gemini' ? 'Beyin: Gemini (ücretsiz)' : 'Beyin: Claude', true);
  chip('cMic', Recognition ? 'Mikrofon: hazır' : server.stt ? 'Mikrofon: kayıt' : 'Mikrofon: yok', !!Recognition || server.stt);
  chip('cVoice', server.speech && setting('voice') === 'natural' ? 'Ses: doğal' : 'Ses: cihaz', true);
  chip('cMem', server.sync ? 'Hafıza: eşitleniyor' : 'Hafıza: bu cihaz', server.sync);
  if (!Recognition && !server.stt) $('mLive').disabled = true;
  $('micMode').querySelector('[value="record"]').disabled = !server.stt;
  if (!server.stt && setting('micMode') === 'record') $('micMode').value = 'auto';
  renderChat(); renderItems(); sysInfo();
  if (chat.summary) $('summary').textContent = chat.summary;
  pullSync().then(checkReminders);
  const late = items.filter(isLate).length;
  setPhase('idle', late ? `${late} gecikmiş görevin var. “Brifing”e dokunabilirsin.` : 'Mikrofona dokun ve konuş, ya da yaz.');
  if (new URLSearchParams(location.search).has('brifing')) { history.replaceState(null, '', location.pathname); $('brief').click(); }
}
(async () => {
  if (!key()) { showGate(); return; }
  try {
    const r = await net('/api/status', { headers: { 'x-jarvis-key': key() } });
    if (r.status === 401) { showGate('Şifre değişmiş; tekrar gir.'); return; }
    boot(r.ok ? await r.json() : {});
  } catch { boot({}); setPhase('error', 'Sunucuya ulaşılamadı; çevrimdışısın. Kayıtların bu cihazda duruyor.'); }
})();
