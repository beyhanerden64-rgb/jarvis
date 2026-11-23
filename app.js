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
  store.set('key', $('gateKey').value.trim());
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
  const w = document.createElement('div'); w.className = 'field';
  w.innerHTML = '<label for="autoListen">Açılınca dinle · “Jarvis” deyince uyan</label><select id="autoListen"><option value="1" selected>Açık</option><option value="0">Kapalı · yalnız mikrofona dokununca</option></select>';
  f.after(w);
  const web = document.createElement('div'); web.className = 'field';
  web.innerHTML = '<label for="web">İnternette arama (Gemini)</label><select id="web"><option value="1" selected>Otomatik · güncel sorularda</option><option value="2">Her soruda</option><option value="0">Kapalı</option></select>';
  $('depth').closest('.field').after(web);
})();
voiceSel.innerHTML = '<option value="natural">Doğal ses · sunucu</option><option value="device" selected>Telefon/bilgisayar sesi</option>';
for (const id of ['speakOn', 'voice', 'rate', 'pause', 'depth', 'length', 'learn', 'persona', 'micMode', 'autoListen', 'web']) {
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
function openDrawer(p) {
  document.querySelector(`.tabs button[data-p="${p}"]`)?.click();
  $('drawer').classList.add('open');
  if (p === 'log') setTimeout(() => { const pane = $('p-log'); pane.scrollTop = pane.scrollHeight; }, 60);
}
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDrawer(b.dataset.open));
$('drawerClose').onclick = () => $('drawer').classList.remove('open');
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('drawer').classList.remove('open'); });
document.querySelectorAll('[data-proxy]').forEach(b => b.onclick = () => $(b.dataset.proxy).click());
const nowText = () => now().toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', ...TZ });
const isoLocal = d => { const p = n => String(n).padStart(2, '0'); const t = new Date(d.toLocaleString('en-US', TZ)); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };
function tickClock() {
  const d = now();
  $('clockTime').textContent = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', ...TZ });
  $('clock').textContent = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...TZ });
}
setInterval(tickClock, 10000); tickClock();

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
/* Holographic particle figure: a head-and-shoulders human made of points, rotating slowly.
 * It breathes when idle, brightens and ripples when listening, orbits when thinking and its mouth/face pulse when speaking. */
(function figure() {
  const c = $('orb'), g = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 700px)').matches;
  const N = small ? 2800 : 7000;
  let level = 0, target = 0, t = 0, W = 0, H = 0, dpr = 1;
  window.jarvisAvatarLevel = v => { target = Math.max(0, Math.min(1, Number(v) || 0)); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const P = [];
  const add = (x, y, z, kind = 0) => P.push({ x, y, z, kind, ph: Math.random() * 6.283, sp: rnd(0.4, 1.4), orb: rnd(0, 6.283), r: rnd(0.32, 0.62) });
  // head: ellipsoid surface, slight jaw taper; kind 1 = face front, 2 = mouth, 3 = eyes
  for (let i = 0; i < N * 0.42; i++) {
    const u = rnd(0, 6.283), v = Math.acos(rnd(-1, 1));
    let x = Math.sin(v) * Math.cos(u) * 0.2, y = Math.cos(v) * 0.26, z = Math.sin(v) * Math.sin(u) * 0.22;
    if (y < -0.05) { const k = 1 - (-0.05 - y) * 1.6; x *= k; z *= 0.92 + 0.08 * k; }
    const front = z > 0.12;
    const mouth = front && y > -0.17 && y < -0.1 && Math.abs(x) < 0.07;
    const eye = front && y > 0.02 && y < 0.07 && Math.abs(Math.abs(x) - 0.075) < 0.035;
    add(x, y + 0.98, z, mouth ? 2 : eye ? 3 : front ? 1 : 0);
  }
  // nose ridge
  for (let i = 0; i < N * 0.02; i++) { const y = rnd(-0.08, 0.04); add(rnd(-0.012, 0.012), y + 0.98, 0.215 + (0.04 - y) * 0.25, 1); }
  // neck
  for (let i = 0; i < N * 0.06; i++) { const u = rnd(0, 6.283); add(Math.cos(u) * 0.085, rnd(0.6, 0.76), Math.sin(u) * 0.08); }
  // shoulders + chest: superellipse rings
  for (let i = 0; i < N * 0.4; i++) {
    const y = rnd(-0.55, 0.6), k = (0.6 - y) / 1.15;
    const wdt = y > 0.45 ? 0.12 + (0.6 - y) * 3.0 : 0.52 - k * 0.14;
    const dep = 0.14 + Math.min(0.08, (0.6 - y) * 0.4);
    const u = rnd(0, 6.283), cu = Math.cos(u), su = Math.sin(u);
    const ex = 0.6;
    add(Math.sign(cu) * Math.abs(cu) ** ex * wdt, y, Math.sign(su) * Math.abs(su) ** ex * dep);
  }
  // upper arms
  for (let i = 0; i < N * 0.1; i++) {
    const side = Math.random() < 0.5 ? -1 : 1, y = rnd(-0.5, 0.42), u = rnd(0, 6.283);
    add(side * (0.56 + (0.42 - y) * 0.06) + Math.cos(u) * 0.07, y, Math.sin(u) * 0.08);
  }
  // holographic floor ring particles
  for (let i = 0; i < N * 0.06; i++) { const u = rnd(0, 6.283), r = rnd(0.55, 0.95); add(Math.cos(u) * r, -0.72, Math.sin(u) * r * 0.9, 4); }
  function resize() {
    dpr = Math.min(1.75, devicePixelRatio || 1);
    W = c.width = Math.round(innerWidth * dpr); H = c.height = Math.round(innerHeight * dpr);
  }
  addEventListener('resize', resize); resize();
  const COLORS = { idle: [87, 211, 255], starting: [140, 220, 255], listening: [255, 190, 90], thinking: [150, 170, 255], speaking: [120, 235, 255], error: [255, 107, 107] };
  let col = [87, 211, 255];
  (function draw() {
    requestAnimationFrame(draw);
    if (document.hidden) return;
    const p = phase;
    const dt = reduce ? 0.004 : 0.016;
    t += dt;
    if (p === 'speaking') target = Math.max(target * 0.9, 0.35 + 0.45 * Math.abs(Math.sin(t * 11) * Math.sin(t * 4.3)));
    else if (p !== 'listening') target *= 0.92;
    level += (target - level) * 0.25;
    const want = COLORS[p] || COLORS.idle;
    col = col.map((v, i) => v + (want[i] - v) * 0.06);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const scale = small ? Math.min(W * 0.62, H * 0.5) : Math.min(W * 0.36, H * 0.42);
    const cx = W / 2, cy = H * (small ? 0.4 : 0.5);
    const yaw = Math.sin(t * 0.25) * 0.45 + (p === 'thinking' ? t * 0.6 : 0);
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const breath = 1 + Math.sin(t * 1.6) * 0.012;
    g.globalCompositeOperation = 'lighter';
    const [R, G, B] = col.map(Math.round);
    const sz = Math.max(1, (small ? 1.5 : 1.8) * dpr);
    for (const q of P) {
      let x = q.x, y = q.y, z = q.z;
      if (q.kind === 4) { const a = q.orb + t * 0.3; const rr = Math.hypot(x, z); x = Math.cos(a) * rr; z = Math.sin(a) * rr * 0.9; }
      if (p === 'thinking' && q.kind !== 4 && q.ph < 0.5) { const a = q.orb + t * q.sp * 1.6; x = Math.cos(a) * q.r; z = Math.sin(a) * q.r; y = 0.98 + Math.sin(a * 2 + q.ph) * 0.08; }
      const j = (reduce ? 0.001 : 0.004) * (1 + level * 3);
      x += Math.sin(t * q.sp * 3 + q.ph) * j; y = (y - 0.2) * breath + 0.2 + Math.cos(t * q.sp * 2.4 + q.ph) * j;
      if (q.kind === 2) { y -= level * 0.03 * Math.sin(q.ph * 3); z += level * 0.015; }
      if (p === 'listening' && q.kind !== 4) { const wave = Math.sin(y * 18 - t * 7) * 0.008 * (0.5 + level); x *= 1 + wave; z *= 1 + wave; }
      const rx = x * cyaw + z * syaw, rz = -x * syaw + z * cyaw;
      const persp = 2.6 / (2.6 - rz);
      const sx = cx + rx * scale * persp, sy = cy - (y - 0.25) * scale * persp;
      const depth = (rz + 0.6) / 1.2;
      let a = 0.18 + depth * 0.5;
      if (q.kind === 1) a += 0.12; if (q.kind === 3) a += 0.45 + level * 0.3; if (q.kind === 2) a += level * 0.9; if (q.kind === 4) a = 0.12 + level * 0.2;
      g.fillStyle = `rgba(${R},${G},${B},${Math.min(1, a)})`;
      g.fillRect(sx, sy, sz, sz);
    }
    // scanning ring around the figure
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = `rgba(${R},${G},${B},${0.25 + level * 0.3})`;
    g.lineWidth = 1.2 * dpr;
    const ry = cy - (0.98 - 0.25) * scale + Math.sin(t * 0.9) * scale * 0.9;
    if (!reduce && p !== 'idle') { g.beginPath(); g.ellipse(cx, ry, scale * 0.42, scale * 0.06, 0, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.ellipse(cx, cy + 0.97 * scale, scale * (0.7 + level * 0.1), scale * 0.08, 0, 0, Math.PI * 2); g.stroke();
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

/* ================= caption, links ================= */
let pendingLinks = [];
function addLinks(el, links) {
  if (!links?.length) return;
  const box = document.createElement('div'); box.className = 'src';
  for (const l of links) { if (!/^https:\/\//.test(l.url || '')) continue; const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = l.title || new URL(l.url).hostname; box.append(a); }
  if (box.children.length) el.insertBefore(box, el.querySelector('.tool'));
}
// The caption under the figure mirrors the latest exchange from the log.
new MutationObserver(() => {
  const msgs = [...$('feed').querySelectorAll('.msg.ai, .msg.me, .msg.alarm')];
  const last = msgs.at(-1); if (!last) return;
  const cap = $('caption'); cap.replaceChildren();
  const who = document.createElement('span'); who.className = 'who';
  who.textContent = last.classList.contains('me') ? 'SEN' : last.classList.contains('alarm') ? 'HATIRLATMA' : 'JARVIS';
  const body = document.createElement('div'); body.textContent = (last.querySelector('span:not(.who)') || last).textContent;
  cap.append(who, body);
  const src = last.querySelector('.src'); if (src) cap.append(src.cloneNode(true));
  cap.scrollTop = cap.scrollHeight;
}).observe($('feed'), { childList: true, subtree: true, characterData: true });

/* ================= weather (Open-Meteo, no key) ================= */
const WX = { 0: 'açık', 1: 'az bulutlu', 2: 'parçalı bulutlu', 3: 'kapalı', 45: 'sisli', 48: 'kırağılı sis', 51: 'hafif çisenti', 53: 'çisenti', 55: 'yoğun çisenti', 61: 'hafif yağmurlu', 63: 'yağmurlu', 65: 'kuvvetli yağmurlu', 66: 'dondurucu yağmur', 67: 'dondurucu yağmur', 71: 'hafif karlı', 73: 'karlı', 75: 'yoğun karlı', 77: 'kar taneleri', 80: 'sağanak', 81: 'sağanak', 82: 'şiddetli sağanak', 85: 'kar sağanağı', 86: 'kar sağanağı', 95: 'gök gürültülü', 96: 'dolu ve fırtına', 99: 'dolu ve fırtına' };
const weather = {
  text: '',
  async load() {
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.33&longitude=42.19&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Europe%2FIstanbul&forecast_days=2');
      if (!r.ok) throw 0;
      const d = await r.json(), c = d.current, dl = d.daily;
      const now = `${Math.round(c.temperature_2m)}°, ${WX[c.weather_code] || 'değişken'}`;
      this.text = `şu an ${now} (hissedilen ${Math.round(c.apparent_temperature)}°, rüzgâr ${Math.round(c.wind_speed_10m)} km/sa, nem %${c.relative_humidity_2m}); bugün en yüksek ${Math.round(dl.temperature_2m_max[0])}°, en düşük ${Math.round(dl.temperature_2m_min[0])}°, yağış olasılığı %${dl.precipitation_probability_max[0]}; yarın ${WX[dl.weather_code[1]] || ''} ${Math.round(dl.temperature_2m_min[1])}–${Math.round(dl.temperature_2m_max[1])}°`;
      $('wx').textContent = 'Cizre · ' + now;
    } catch { $('wx').textContent = 'Hava bilgisi alınamadı'; }
  }
};
weather.load(); setInterval(() => weather.load(), 30 * 60000);

/* ================= web search (Gemini Google Search grounding) ================= */
const webSearch = {
  allowed: () => server.provider === 'gemini' && setting('web') !== '0',
  wanted(text) {
    if (!this.allowed()) return false;
    if (setting('web') === '2') return true;
    return /\b(?:haber|son dakika|güncel|bugün(?:kü)?\s+(?:maç|dolar|euro|altın|borsa|gündem)|dolar|euro|altın|kur|borsa|bitcoin|fiyat(?:ı|lar)?|kimdir|kim kazandı|maç(?:ı)?|skor|seçim|deprem|yol durumu|nöbetçi eczane|açık mı|nerede|adres|telefon numarası|internette|araştır|ara(?:t)?\s|google|son çıkan|yeni çıkan|2025|2026|2027)\b/i.test(text);
  }
};

/* ================= timers (local, spoken) ================= */
const timers = [];
function renderTimers() {
  $('timerCard').hidden = !timers.length;
  $('timers').replaceChildren(...timers.map(tm => {
    const row = document.createElement('div'); row.className = 'timer';
    const left = Math.max(0, tm.end - Date.now()), m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
    const label = document.createElement('span'); label.textContent = `${tm.label} · ${m}:${String(sec).padStart(2, '0')}`;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Sayacı iptal et'); x.onclick = () => cancelTimer(tm.id);
    row.append(label, x); return row;
  }));
}
function startTimer(ms, label) {
  const tm = { id: Math.random().toString(36).slice(2), end: Date.now() + ms, label };
  tm.handle = setTimeout(() => {
    cancelTimer(tm.id, true);
    bubble('alarm', '⏰ ' + label + ' doldu.');
    beep(); setTimeout(beep, 700); setTimeout(beep, 1400);
    try { if (window.Notification?.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('JARVIS', { body: label + ' doldu.', icon: 'icon-192.png' })); } catch {}
    if (setting('speakOn') === '1' && !answering) voiceSession.read('Beyhan, ' + label + ' doldu.');
  }, ms);
  timers.push(tm); renderTimers();
}
function cancelTimer(id, done) { const i = timers.findIndex(t => t.id === id); if (i >= 0) { if (!done) clearTimeout(timers[i].handle); timers.splice(i, 1); } renderTimers(); }
setInterval(() => { if (timers.length) renderTimers(); }, 1000);
const NUM = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, onbeş: 15, yirmi: 20, otuz: 30, kırk: 40, kırkbeş: 45, elli: 50, altmış: 60, yarım: 0.5 };
function parseTimer(t) {
  const m = t.match(/(\d+(?:[.,]\d+)?|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on beş|on|yirmi|otuz|kırk beş|kırk|elli|altmış|yarım)\s*(saniye|sn|dakika|dk|saat)(?:lık|lik)?\s*(?:sonra\s+)?(?:bir\s+)?(sayaç|zamanlayıcı|alarm|geri sayım|hatırlat|haber ver|uyar|söyle)/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.')) || NUM[m[1].replace(/\s+/g, '').toLocaleLowerCase('tr-TR')];
  if (!n) return null;
  const unit = /^(?:saniye|sn)$/i.test(m[2]) ? 1000 : /^(?:dakika|dk)$/i.test(m[2]) ? 60000 : 3600000;
  const what = t.replace(m[0], '').replace(/^(?:jarvis[\s,]*)/i, '').replace(/\b(?:kur|başlat|ayarla|aç|lütfen)\b/gi, '').replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
  return { ms: n * unit, label: `${m[1]} ${m[2]}${what && what.length < 40 ? ' · ' + what : ''} sayacı` };
}

/* ================= system HUD ================= */
function hudNet() { $('hNet').textContent = navigator.onLine ? 'çevrimiçi' : 'ÇEVRİMDIŞI'; }
addEventListener('online', hudNet); addEventListener('offline', hudNet); hudNet();
navigator.getBattery?.().then(b => { const f = () => { $('hBat').textContent = Math.round(b.level * 100) + '%' + (b.charging ? ' · şarjda' : ''); }; f(); b.addEventListener('levelchange', f); b.addEventListener('chargingchange', f); }).catch(() => {});
if (!navigator.getBattery) $('hBat').textContent = '—';
function greeting() {
  const h = Number(now().toLocaleString('en-US', { hour: 'numeric', hour12: false, ...TZ }));
  return h < 5 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
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
  $('dockBadge').hidden = !late; $('dockBadge').textContent = late;
  const open = tasks.filter(i => !i.done);
  $('hTasks').textContent = open.length + (late ? ` · ${late} gecikmiş` : '');
  const next = open.filter(i => i.due && !isLate(i)).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  $('hNext').textContent = next ? `${dueText(next.due)} · ${next.text}` : late ? 'Gecikmiş görevlerin var.' : 'Yaklaşan görev yok.';
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
const cleanAnswer = t => { const cuts = [t.indexOf('⟦'), t.indexOf('\u0000')].filter(i => i >= 0); return (cuts.length ? t.slice(0, Math.min(...cuts)) : t).replace(/\s+$/, ''); };
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
Üslup: doğal, sıcak, akıcı Türkçe; "sen" diye hitap et; önce cevabı ver; gereksiz selam ve kapanış sorusu kullanma; yeri gelince kısa, zekice bir espri. ${LENGTH[setting('length')]} Bilmediğini uydurma. Yapmadığın bir işlemi (mesaj gönderme, telefon araması) yaptım deme.${webSearch.allowed() ? '' : ' İnternete erişimin yok; güncel bilgi gerekiyorsa bunu söyle.'} Kesin tıbbi tanı veya ilaç dozu verme.
${voiceTurn ? 'BU YANIT SESLİ OKUNACAK: 1-4 kısa cümle; liste, başlık, emoji, parantez, bağlantı, tablo kullanma; kısaltmaları açık yaz; yüzde ve para birimini sözcükle yaz.' : 'Yazılı yanıt: gerekirse kısa liste kullan.'}

${weather.text ? 'Cizre hava durumu (canlı): ' + weather.text + '\n' : ''}${webSearch.allowed() ? 'İnternette arama yapabiliyorsun; güncel bilgi gerektiğinde ara ve kısaca kaynağını söyle.\n' : ''}
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
  const tm = parseTimer(t);
  if (tm) { startTimer(tm.ms, tm.label); return `Tamam, ${tm.label.replace(/ sayacı$/, '')} için sayaç kurdum.`; }
  if (/(?:sayac[ıi]|sayaçları|zamanlayıcıyı|alarmı)\s+(?:iptal et|kapat|durdur|sil)/.test(t)) { const n = timers.length; timers.slice().forEach(x => cancelTimer(x.id)); return n ? 'Sayaçları iptal ettim.' : 'Kurulu sayaç yok.'; }
  let m;
  if ((m = t.match(/^(?:jarvis\s+)?(?:google'?da|internette|webde)\s+(.+?)\s+(?:ara|arat|bul)$/))) { pendingLinks.push({ url: 'https://www.google.com/search?q=' + encodeURIComponent(m[1]), title: 'Google: ' + m[1] }); return `“${m[1]}” aramasını açmak için bağlantıya dokun.`; }
  if ((m = t.match(/^(?:jarvis\s+)?youtube'?(?:da|ta)\s+(.+?)\s+(?:aç|ara|bul|oynat)$/))) { pendingLinks.push({ url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(m[1]), title: 'YouTube: ' + m[1] }); return `YouTube'da “${m[1]}” için bağlantı hazır.`; }
  if ((m = t.match(/^(?:jarvis\s+)?(?:haritada|haritadan)\s+(.+?)\s+(?:göster|bul|aç)$/))) { pendingLinks.push({ url: 'https://www.google.com/maps/search/' + encodeURIComponent(m[1]), title: 'Harita: ' + m[1] }); return `${m[1]} için harita bağlantısı hazır.`; }
  const apps = { whatsapp: 'https://web.whatsapp.com/', instagram: 'https://www.instagram.com/', youtube: 'https://www.youtube.com/', gmail: 'https://mail.google.com/', takvim: 'https://calendar.google.com/', harita: 'https://www.google.com/maps' };
  if ((m = t.match(/^(?:jarvis\s+)?(whatsapp|instagram|youtube|gmail|takvim|harita)(?:'?[ıiyu]?)?\s*(?:aç|başlat)$/))) { pendingLinks.push({ url: apps[m[1]], title: m[1][0].toLocaleUpperCase('tr-TR') + m[1].slice(1) }); return `${m[1][0].toLocaleUpperCase('tr-TR') + m[1].slice(1)} bağlantısı hazır; açmak için dokun.`; }
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
  if (local) { const b = bubble('ai', local); if (pendingLinks.length) addLinks(b.el, pendingLinks.splice(0)); answerTools(b.el, local); return local; }
  const messages = chat.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'user', content: text || 'Bu görseli incele; ne gördüğünü ve varsa önemli noktaları söyle.' });
  const out = bubble('ai', '…');
  answering = true; controller = new AbortController();
  let full = '', sent = 0;
  try {
    const r = await api('/api/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ system: instructions(voiceTurn), messages, tier: pickTier(text, voiceTurn, !!image), search: !image && webSearch.wanted(text), image: image ? { mediaType: image.type, data: image.data } : undefined }) });
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
    out.body.textContent = c;
    const si = full.indexOf('\u0000SRC:');
    if (si >= 0) { try { addLinks(out.el, JSON.parse(full.slice(si + 5).split('\u0000')[0]).slice(0, 5)); } catch {} }
    answerTools(out.el, c);
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

/* ================= wake word: listen from the moment the app opens ================= */
const wake = {
  rec: null, blocked: false, gate: new JarvisWakeGate({ windowMs: 8000 }),
  enabled() { return !!Recognition && setting('autoListen') === '1' && setting('micMode') !== 'record' && $('gate').hidden; },
  idle() { return !voiceSession.active && !recorder.active && !answering && !document.hidden; },
  start() {
    if (this.rec || this.blocked || !this.enabled() || !this.idle()) return;
    const r = new Recognition();
    r.lang = 'tr-TR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0]?.transcript || '';
        if (!e.results[i].isFinal) { if (this.gate.awakeUntil > Date.now() || /^\s*(?:hey\s+)?[jcç][ae]rv/i.test(text)) $('partial').textContent = text; continue; }
        this.heard(text.trim());
      }
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.blocked = true;
        setPhase('idle', 'Dinlemeye başlamam için sayfaya bir kez dokun (tarayıcı ilk seferde izin istiyor).');
      }
    };
    r.onend = () => { if (this.rec === r) this.rec = null; };
    try { r.start(); this.rec = r; if (phase === 'idle') setPhase('idle', 'Dinliyorum. “Jarvis” diye seslen.'); }
    catch { this.rec = null; }
  },
  stop() {
    const r = this.rec; this.rec = null;
    if (r) { r.onend = r.onresult = r.onerror = null; try { r.abort(); } catch {} }
  },
  heard(text) {
    if (!text || JarvisHandsFree.hallucination(text)) return;
    const wasAwake = this.gate.awakeUntil > Date.now();
    const command = this.gate.accept(text);
    $('partial').textContent = '';
    if (command === null && !wasAwake) {
      // Only the wake word: answer with a chime and listen for the request.
      if (this.gate.awakeUntil > Date.now()) { this.stop(); beep(); window.jarvisUnlock(); voiceSession.start(); }
      return;
    }
    if (!command) return;
    this.gate.reset(); this.stop(); window.jarvisUnlock();
    if (/^(?:\S+\s+)?(?:dur|sus|yeter)[.!]*$/i.test(command)) { stopAll(); return; }
    typedTurn(command, true);
  }
};
// Resume listening whenever JARVIS is quiet again (after answering, after the user stops the mic, after returning to the app).
setInterval(() => { if (wake.enabled() && wake.idle()) wake.start(); else if (!wake.idle()) wake.stop(); }, 1500);
document.addEventListener('visibilitychange', () => { if (document.hidden) wake.stop(); });
document.addEventListener('pointerdown', () => { if (wake.blocked) { wake.blocked = false; wake.start(); } }, true);
$('autoListen').addEventListener('change', () => { if (setting('autoListen') !== '1') { wake.stop(); setPhase('idle', 'Mikrofona dokunarak konuşabilirsin.'); } });

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
  wake.stop();
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
  $('prompt').value = ''; autosize(); wake.stop(); voiceSession.stop(''); typedTurn(v, false);
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
    ['İnternet', webSearch.allowed() ? 'Gemini Google araması · ' + $('web').selectedOptions[0].text : 'kapalı'],
    ['Hava', weather.text ? 'Cizre · Open-Meteo' : 'alınamadı'],
    ['Uyandırma', wake.enabled() ? 'açık · “Jarvis” deyince dinler' : 'kapalı'],
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
  setTimeout(() => wake.start(), 800);
  setInterval(() => { $('hWake').textContent = wake.rec ? 'dinliyor' : wake.enabled() ? 'beklemede' : 'kapalı'; }, 1500);
  if (!chat.messages.length || !$('caption').textContent) {
    const open = items.filter(i => i.kind === 'task' && !i.done).length;
    $('caption').textContent = `${greeting()} Beyhan. ${open ? open + ' açık görevin var. ' : ''}“Jarvis” diye seslen ya da yaz.`;
  }
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
