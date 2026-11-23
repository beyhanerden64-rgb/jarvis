'use strict';
/* JARVIS 3.1 HUD katmanı: açılış dizisi, radar, dairesel göstergeler, canlı ses dalgası, bilgi şeridi, komut paleti, arayüz sesleri,
 * kenar telemetrisi + yeni araçlar (Vikipedi, deprem, namaz vakitleri, birim çevirme) ve rutinler. plus.js'ten sonra yüklenir. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 900px)').matches;

  /* ---------- arayüz sesleri (WebAudio, dosya yok) ---------- */
  let AC = null;
  const sfxOn = () => opt('sfx') !== '0';
  function tone(freq, dur = 0.06, type = 'sine', vol = 0.05, slide = 0) {
    if (!sfxOn()) return;
    try {
      AC ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch {}
  }
  const SFX = { click: () => tone(1800, 0.035, 'square', 0.018), listen: () => { tone(660, 0.09, 'sine', 0.05, 1.5); setTimeout(() => tone(990, 0.08, 'sine', 0.04), 70); }, think: () => tone(420, 0.05, 'triangle', 0.03), done: () => { tone(880, 0.07, 'sine', 0.035); setTimeout(() => tone(1320, 0.1, 'sine', 0.03), 80); }, error: () => tone(180, 0.22, 'sawtooth', 0.04, 0.7), boot: () => [0, 90, 180, 300].forEach((d, i) => setTimeout(() => tone(330 * (i + 1), 0.12, 'sine', 0.035), d)) };
  document.addEventListener('pointerdown', e => { if (e.target.closest('button, .linkchip, a.btn, [role=tab]')) SFX.click(); }, true);
  let lastPhase = phase;
  setInterval(() => {
    if (phase === lastPhase) return;
    if (phase === 'listening') SFX.listen(); else if (phase === 'thinking') SFX.think(); else if (phase === 'error') SFX.error(); else if (phase === 'idle' && ['speaking', 'thinking'].includes(lastPhase)) SFX.done();
    const ph = $('phase'); ph.classList.remove('glitch'); void ph.offsetWidth; ph.classList.add('glitch');
    lastPhase = phase;
  }, 120);

  /* ---------- açılış dizisi (oturum başına bir kez) ---------- */
  if (!sessionStorage.getItem('jarvis.booted') && !reduce) {
    sessionStorage.setItem('jarvis.booted', '1');
    const lines = ['JARVIS ÇEKİRDEĞİ BAŞLATILIYOR', 'BİYOMETRİK MODEL YÜKLENİYOR · ' + (mobile ? '16K' : '26K') + ' NOKTA', 'SES MOTORU 0.39 · TÜRKÇE', 'HAFIZA ÇÖZÜLÜYOR · ' + items.length + ' KAYIT', 'ARAÇLAR · ' + Object.keys(TOOLS).length + ' · UZMAN AJANLAR · ' + Object.keys(AGENTS).length, 'GÜVENLİK · YEREL ŞİFRELEME AKTİF', 'SİSTEM HAZIR'];
    const box = el('div', { class: 'boot', 'aria-hidden': 'true' }, el('div', { class: 'boot-ring' }, el('i'), el('i'), el('i')), el('div', { class: 'boot-title' }, 'J.A.R.V.I.S'), el('pre', { class: 'boot-log' }), el('div', { class: 'boot-bar' }, el('b')));
    document.body.append(box);
    const log = box.querySelector('.boot-log'), bar = box.querySelector('.boot-bar b');
    lines.forEach((l, i) => setTimeout(() => { log.textContent += '› ' + l + (i < lines.length - 1 ? ' ........ OK' : '') + '\n'; bar.style.width = ((i + 1) / lines.length) * 100 + '%'; }, 120 + i * 210));
    setTimeout(SFX.boot, 200);
    const end = () => { box.classList.add('out'); setTimeout(() => box.remove(), 600); };
    setTimeout(end, 220 + lines.length * 210 + 350);
    box.addEventListener('pointerdown', end);
  }

  /* ---------- yazı tipleri: Orbitron başlık, Share Tech Mono veri ---------- */

  /* ---------- kenar telemetrisi ---------- */
  document.body.append(
    el('div', { class: 'edge edge-l', 'aria-hidden': 'true' }, el('span', {}, '37.33°K · 42.19°D · CİZRE')),
    el('div', { class: 'edge edge-r', 'aria-hidden': 'true' }, el('span', { id: 'edgeR' }, 'SYS · NOMINAL')),
    el('div', { class: 'fps', id: 'fps', 'aria-hidden': 'true' }, 'FPS --'));
  let frames = 0, fpsT = performance.now();
  (function count(t) { frames++; if (t - fpsT > 1000) { $('fps').textContent = `FPS ${frames} · ${$('phase').textContent} · ${new Date().toLocaleTimeString('tr-TR', { hour12: false, ...TZ })}`; frames = 0; fpsT = t; } requestAnimationFrame(count); })(performance.now());

  /* ---------- telemetri kartı: radar + dairesel göstergeler ---------- */
  const gauge = (id, label) => el('div', { class: 'gauge' }, (() => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 64 64');
    s.innerHTML = '<circle cx="32" cy="32" r="27" class="g-track"/><circle cx="32" cy="32" r="27" class="g-val" id="' + id + 'Arc"/><circle cx="32" cy="32" r="21" class="g-in"/>';
    return s;
  })(), el('b', { id: id + 'Txt' }, '--'), el('small', {}, label));
  const tele = el('div', { class: 'card tele' }, el('h4', {}, 'TELEMETRİ · RADAR'), el('canvas', { id: 'radar', width: 220, height: 220, 'aria-label': 'Bugünün görevleri saat radarında' }),
    el('div', { class: 'gauges' }, gauge('gBat', 'PİL'), gauge('gTask', 'GÖREV'), gauge('gCpu', 'CPU')), el('div', { class: 'muted next', id: 'hNext2' }, ''));
  const right = document.querySelector('.right');
  right.append(tele);
  const oldNext = $('hNext').closest('.card'); oldNext.hidden = true;
  setGauge('gBat', 0, '--'); setGauge('gTask', 0, '--'); setGauge('gCpu', 0, '--');
  function setGauge(id, frac, text) {
    const c = 2 * Math.PI * 27, a = $(id + 'Arc');
    a.style.strokeDasharray = `${Math.max(0, Math.min(1, frac)) * c} ${c}`;
    a.classList.toggle('hot', id === 'gCpu' && frac > 0.85);
    $(id + 'Txt').textContent = text;
  }
  async function gaugesTick() {
    try { const b = await navigator.getBattery?.(); if (b) setGauge('gBat', b.level, Math.round(b.level * 100) + '%'); } catch {}
    const today = isoLocal(now()).slice(0, 10), t = items.filter(i => i.kind === 'task' && (i.due || '').startsWith(today));
    const done = t.filter(i => i.done).length; setGauge('gTask', t.length ? done / t.length : 0, t.length ? `${done}/${t.length}` : '0');
    const st = $('pcStats')?.textContent || '';
    const m = st.match(/CPU%(\d+)/) || st.match(/%(\d+)/);
    if (pcLocal && m) setGauge('gCpu', Number(m[1]) / 100, m[1] + '%'); else setGauge('gCpu', 0, pcLocal ? '…' : 'PC yok');
    $('hNext2').textContent = '▸ ' + $('hNext').textContent;
  }
  setInterval(gaugesTick, 5000); setTimeout(gaugesTick, 800);

  const rc = $('radar'), rg = rc.getContext('2d');
  let sweep = 0;
  function radar() {
    requestAnimationFrame(radar);
    if (document.hidden || tele.offsetParent === null) return;
    const W = rc.width, R = W / 2 - 6, cx = W / 2, cy = W / 2, col = getComputedStyle(document.documentElement).getPropertyValue('--holo').trim() || '#57d3ff';
    rg.clearRect(0, 0, W, W);
    rg.strokeStyle = col; rg.globalAlpha = 0.25; rg.lineWidth = 1;
    for (const k of [1, 0.66, 0.33]) { rg.beginPath(); rg.arc(cx, cy, R * k, 0, Math.PI * 2); rg.stroke(); }
    rg.beginPath(); rg.moveTo(cx - R, cy); rg.lineTo(cx + R, cy); rg.moveTo(cx, cy - R); rg.lineTo(cx, cy + R); rg.stroke();
    rg.globalAlpha = 0.5;
    for (let h = 0; h < 24; h++) { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; rg.beginPath(); rg.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); rg.lineTo(cx + Math.cos(a) * (R - (h % 6 ? 4 : 9)), cy + Math.sin(a) * (R - (h % 6 ? 4 : 9))); rg.stroke(); }
    rg.font = '10px "Share Tech Mono", monospace'; rg.fillStyle = col; rg.globalAlpha = 0.6; rg.textAlign = 'center';
    [['00', 0], ['06', 6], ['12', 12], ['18', 18]].forEach(([t, h]) => { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; rg.fillText(t, cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18) + 3); });
    // sweep
    sweep += reduce ? 0.004 : 0.025;
    const g = rg.createConicGradient ? rg.createConicGradient(sweep - 0.9, cx, cy) : null;
    if (g) { g.addColorStop(0, 'transparent'); g.addColorStop(0.14, col + '55'); g.addColorStop(0.145, 'transparent'); rg.globalAlpha = 1; rg.fillStyle = g; rg.beginPath(); rg.arc(cx, cy, R, 0, Math.PI * 2); rg.fill(); }
    // now hand
    const nowL = new Date(new Date().toLocaleString('en-US', TZ)), nh = nowL.getHours() + nowL.getMinutes() / 60, na = (nh / 24) * Math.PI * 2 - Math.PI / 2;
    rg.globalAlpha = 0.9; rg.strokeStyle = '#ffb547'; rg.beginPath(); rg.moveTo(cx, cy); rg.lineTo(cx + Math.cos(na) * R, cy + Math.sin(na) * R); rg.stroke();
    // blips: today's tasks by hour; distance = done/late
    const today = isoLocal(now()).slice(0, 10);
    for (const i of items.filter(x => x.kind === 'task' && (x.due || '').startsWith(today))) {
      const hh = Number(i.due.slice(11, 13) || 12) + Number(i.due.slice(14, 16) || 0) / 60, a = (hh / 24) * Math.PI * 2 - Math.PI / 2, d = R * (i.done ? 0.35 : 0.72);
      const near = Math.abs(((a - (sweep % (Math.PI * 2))) + Math.PI * 4) % (Math.PI * 2));
      rg.globalAlpha = i.done ? 0.4 : 0.55 + 0.45 * Math.max(0, 1 - near * 2);
      rg.fillStyle = i.done ? '#5fe0a0' : isLate(i) ? '#ff6b6b' : '#ffb547';
      rg.beginPath(); rg.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, i.done ? 3 : 4.5, 0, Math.PI * 2); rg.fill();
    }
    rg.globalAlpha = 1;
  }
  radar();

  /* ---------- canlı ses dalgası (dinlerken gerçek mikrofon, konuşurken JARVIS) ---------- */
  const wave = el('canvas', { class: 'wave', id: 'wave', height: 36, 'aria-hidden': 'true' });
  document.querySelector('.composer').before(wave);
  const wg = wave.getContext('2d');
  let an = null, micStream = null, buf = null;
  async function micOn() {
    if (an || isIOS || opt('liveWave') === '0') return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      AC ||= new (window.AudioContext || window.webkitAudioContext)();
      an = AC.createAnalyser(); an.fftSize = 256; buf = new Uint8Array(an.frequencyBinCount);
      AC.createMediaStreamSource(micStream).connect(an);
    } catch { an = null; }
  }
  function micOff() { micStream?.getTracks().forEach(t => t.stop()); micStream = null; an = null; }
  setInterval(() => { if ((phase === 'listening' || phase === 'starting') && voiceSession.active) micOn(); else if (an) micOff(); }, 400);
  let wt = 0;
  function drawWave() {
    requestAnimationFrame(drawWave);
    if (document.hidden) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = wave.clientWidth * dpr, h = 36 * dpr;
    if (wave.width !== w) { wave.width = w; wave.height = h; }
    wg.clearRect(0, 0, w, h);
    const n = 64, bw = w / n;
    let lv = 0, vals = new Array(n).fill(0);
    if (an) { an.getByteFrequencyData(buf); for (let i = 0; i < n; i++) vals[i] = buf[Math.floor(i * buf.length / n / 1.6)] / 255; lv = vals.reduce((s, x) => s + x, 0) / n; window.jarvisAvatarLevel?.(Math.min(1, lv * 2.2)); }
    else {
      wt += 0.08; const L = phase === 'speaking' ? 0.55 : phase === 'thinking' ? 0.18 : phase === 'listening' ? 0.25 : 0.05;
      for (let i = 0; i < n; i++) vals[i] = L * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.35 + wt) * Math.sin(i * 0.13 - wt * 1.7)));
    }
    const col = phase === 'listening' ? '255,181,71' : phase === 'error' ? '255,107,107' : '87,211,255';
    for (let i = 0; i < n; i++) {
      const v = vals[i], bh = Math.max(1.5 * dpr, v * h * 0.95), x = i * bw;
      wg.fillStyle = `rgba(${col},${0.25 + v * 0.75})`;
      wg.fillRect(x + bw * 0.2, (h - bh) / 2, bw * 0.6, bh);
    }
  }
  drawWave();

  /* ---------- bilgi şeridi: saat, hava, kripto, döviz, deprem, sıradaki görev ---------- */
  const ticker = el('div', { class: 'ticker', 'aria-label': 'Canlı bilgi şeridi' }, el('div', { class: 'tk-track', id: 'tkTrack' }));
  document.querySelector('.dock').append(ticker);
  const tk = { wx: '', btc: '', fx: '', quake: '' };
  async function tickerData() {
    try { const r = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22%5D'); const d = await r.json(); tk.btc = d.map(x => `${x.symbol.replace('USDT', '')} ${Number(x.lastPrice).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}$ ${Number(x.priceChangePercent) >= 0 ? '▲' : '▼'}${Math.abs(Number(x.priceChangePercent)).toFixed(1)}%`).join('  ·  '); } catch {}
    try { const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=TRY'); const d = await r.json(); const e = await (await fetch('https://api.frankfurter.app/latest?from=EUR&to=TRY')).json(); tk.fx = `USD/TRY ${d.rates.TRY.toFixed(2)}  ·  EUR/TRY ${e.rates.TRY.toFixed(2)}`; } catch {}
    try { tk.quake = await lastQuake(); } catch {}
    renderTicker();
  }
  function renderTicker() {
    const parts = [`CİZRE ${$('wx').textContent}`, tk.btc, tk.fx, tk.quake, '▸ ' + $('hNext').textContent, `GÖREV ${items.filter(i => i.kind === 'task' && !i.done).length} AÇIK`, `HAFIZA ${items.filter(i => i.kind === 'memory').length}`, `HASTA ${patients.length}`].filter(Boolean);
    const line = parts.join('   ◆   ');
    $('tkTrack').replaceChildren(el('span', {}, line), el('span', { 'aria-hidden': 'true' }, line));
    $('tkTrack').style.animationDuration = Math.max(30, line.length * 0.22) + 's';
  }
  setTimeout(tickerData, 3000); setInterval(tickerData, 5 * 60000); setInterval(renderTicker, 30000);

  /* ---------- fare ile hologram paralaksı ---------- */
  window.jarvisPointer = 0;
  addEventListener('pointermove', e => { window.jarvisPointer = (e.clientX / innerWidth - 0.5) * 2; }, { passive: true });

  /* ---------- komut paleti (Ctrl+K veya ⌘ düğmesi) ---------- */
  const cmds = () => [
    ...Object.entries(SKILLS).map(([k, v]) => ({ t: v.label, d: 'Yetenek', run: () => runSkill(k) })),
    ...[...document.querySelectorAll('.tabs button')].map(b => ({ t: b.textContent.replace(/\d+$/, '') + ' paneli', d: 'Panel', run: () => openDrawer(b.dataset.p) })),
    { t: 'Brifing', d: 'Komut', run: () => $('brief').click() },
    { t: 'Sürekli sohbet modu', d: 'Ses', run: () => $('mLive').click() },
    { t: 'Bas-konuş modu', d: 'Ses', run: () => $('mPush').click() },
    { t: 'Tema değiştir (açık/koyu)', d: 'Görünüm', run: () => { $('theme').value = opt('theme') === 'light' ? 'dark' : 'light'; $('theme').dispatchEvent(new Event('change')); } },
    { t: 'Arayüz seslerini aç/kapat', d: 'Görünüm', run: () => { $('sfx').value = opt('sfx') === '0' ? '1' : '0'; $('sfx').dispatchEvent(new Event('change')); note('Arayüz sesleri ' + (opt('sfx') === '0' ? 'kapalı' : 'açık') + '.'); } },
    { t: 'Tam ekran / odak', d: 'Görünüm', run: () => $('fullBtn').click() },
    { t: 'Acil dur', d: 'Güvenlik', run: () => $('estop').click() },
    { t: 'Son depremler', d: 'Bilgi', run: () => typedTurn('Türkiye ve çevresindeki son depremler neler? deprem aracını kullan.', false) },
    { t: 'Namaz vakitleri (Cizre)', d: 'Bilgi', run: () => typedTurn('Bugün Cizre namaz vakitleri? namaz aracını kullan.', false) },
    { t: 'Gün sonu özeti', d: 'Rutin', run: () => runRoutine('aksam') },
    { t: 'Haftalık klinik raporu', d: 'Rutin', run: () => runRoutine('hafta') },
    { t: 'Sohbeti indir', d: 'Dışa aktar', run: () => $('exportChat').click() },
    { t: 'Yedeği indir', d: 'Dışa aktar', run: () => $('backupSave').click() }
  ];
  const pal = el('div', { class: 'palette', id: 'palette', hidden: true, role: 'dialog', 'aria-label': 'Komut paleti' },
    el('div', { class: 'pal-box' }, el('input', { id: 'palIn', placeholder: 'Komut ara ya da Jarvis’e yaz ve Enter…', autocomplete: 'off', 'aria-label': 'Komut' }), el('ul', { id: 'palList' })));
  pal.hidden = true;
  document.body.append(pal);
  let palSel = 0, palItems = [];
  function palRender() {
    const q = fold($('palIn').value);
    palItems = cmds().filter(c => !q || fold(c.t + ' ' + c.d).includes(q)).slice(0, 12);
    if (q) palItems.push({ t: 'Jarvis’e sor: “' + $('palIn').value + '”', d: 'Sohbet', run: () => typedTurn($('palIn').value, false) });
    palSel = Math.min(palSel, palItems.length - 1);
    $('palList').replaceChildren(...palItems.map((c, i) => el('li', { class: i === palSel ? 'on' : '', onclick: () => palRun(i) }, el('span', {}, c.t), el('small', {}, c.d))));
  }
  function palOpen() { pal.hidden = false; $('palIn').value = ''; palSel = 0; palRender(); setTimeout(() => $('palIn').focus(), 20); }
  function palClose() { pal.hidden = true; }
  function palRun(i) { const c = palItems[i]; palClose(); window.jarvisUnlock?.(); c?.run(); }
  $('palIn').oninput = () => { palSel = 0; palRender(); };
  $('palIn').onkeydown = e => {
    if (e.key === 'ArrowDown') { palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); palRender(); e.preventDefault(); }
    else if (e.key === 'Enter') { palRun(palSel); e.preventDefault(); }
    else if (e.key === 'Escape') palClose();
  };
  pal.addEventListener('pointerdown', e => { if (e.target === pal) palClose(); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? palOpen() : palClose(); } });
  const pb = el('button', { type: 'button', class: 'install', id: 'palBtn', title: 'Komut paleti (Ctrl+K)', onclick: palOpen }, '⌘ KOMUT');
  document.querySelector('.readout').append(el('div', { class: 'hudbtns' }, pb, $('fullBtn'), $('estop')));

  /* ---------- yeni araçlar ---------- */
  async function lastQuake() {
    const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 19);
    const r = await withTimeout(fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${since}&minlatitude=35.5&maxlatitude=42.5&minlongitude=25.5&maxlongitude=45.5&minmagnitude=3.5&orderby=time&limit=1`), 10000);
    const f = (await r.json()).features?.[0]; if (!f) return '';
    return `SON DEPREM M${f.properties.mag.toFixed(1)} ${f.properties.place.replace(/^.*? of /, '')} ${new Date(f.properties.time).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...TZ })}`;
  }
  Object.assign(TOOLS, {
    vikipedi: { d: 'vikipedi|konu — Türkçe Vikipedi özeti ve bağlantısı', run: async ([q]) => {
      const s = await (await withTimeout(fetch('https://tr.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=' + encodeURIComponent(q)), 10000)).json();
      const title = s[1]?.[0]; if (!title) throw Error('Vikipedi’de bulunamadı');
      const d = await (await fetch('https://tr.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))).json();
      linkChip(d.content_urls?.desktop?.page || s[3][0], 'Vikipedi: ' + title);
      return `${title}: ${d.extract || ''}`.slice(0, 3000);
    } },
    deprem: { d: 'deprem|en küçük büyüklük (varsayılan 3.5) — Türkiye ve çevresindeki son 48 saatin depremleri (USGS)', run: async ([m]) => {
      const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 19);
      const r = await withTimeout(fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${since}&minlatitude=35.5&maxlatitude=42.5&minlongitude=25.5&maxlongitude=45.5&minmagnitude=${Number(m) || 3.5}&orderby=time&limit=10`), 12000);
      const fs = (await r.json()).features || [];
      return fs.length ? fs.map(f => `M${f.properties.mag.toFixed(1)} · ${f.properties.place} · ${new Date(f.properties.time).toLocaleString('tr-TR', TZ)} · derinlik ${f.geometry.coordinates[2]} km`).join('\n') : 'Son 48 saatte bu büyüklükte deprem yok.';
    } },
    namaz: { d: 'namaz|şehir (varsayılan Cizre) — bugünün namaz vakitleri (Diyanet yöntemi)', run: async ([c]) => {
      const city = c || 'Cizre';
      const r = await withTimeout(fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Turkey&method=13`), 10000);
      const t = (await r.json()).data?.timings; if (!t) throw Error('Vakitler alınamadı');
      return `${city}: İmsak ${t.Fajr}, Güneş ${t.Sunrise}, Öğle ${t.Dhuhr}, İkindi ${t.Asr}, Akşam ${t.Maghrib}, Yatsı ${t.Isha}`;
    } },
    birim: { d: 'birim|değer|kaynak birim|hedef birim — uzunluk, ağırlık, sıcaklık, hacim, hız, enerji (ör. birim|70|kg|lb)', run: ([v, a, b]) => convert(Number(String(v).replace(',', '.')), a, b) }
  });
  const U = { m: 1, km: 1000, cm: 0.01, mm: 0.001, inç: 0.0254, inch: 0.0254, in: 0.0254, ft: 0.3048, feet: 0.3048, mil: 1609.344, mile: 1609.344, yd: 0.9144,
    kg: 1, g: 0.001, mg: 1e-6, ton: 1000, lb: 0.45359237, pound: 0.45359237, oz: 0.0283495,
    l: 1, litre: 1, ml: 0.001, galon: 3.78541, gal: 3.78541, cup: 0.236588, 'kmh': 1, 'km/s': 1, 'km/sa': 1, mph: 1.609344, 'm/s': 3.6, kcal: 1, kj: 0.239006, cal: 0.001 };
  const G = [['m', 'km', 'cm', 'mm', 'inç', 'inch', 'in', 'ft', 'feet', 'mil', 'mile', 'yd'], ['kg', 'g', 'mg', 'ton', 'lb', 'pound', 'oz'], ['l', 'litre', 'ml', 'galon', 'gal', 'cup'], ['kmh', 'km/s', 'km/sa', 'mph', 'm/s'], ['kcal', 'kj', 'cal']];
  function convert(v, a, b) {
    a = fold(a).replace('°', ''); b = fold(b).replace('°', '');
    if (!Number.isFinite(v)) throw Error('Değer sayı olmalı');
    const T = { c: x => x, f: x => (x - 32) * 5 / 9, k: x => x - 273.15 }, TB = { c: x => x, f: x => x * 9 / 5 + 32, k: x => x + 273.15 };
    if (a in T && b in TB) return `${v} °${a.toUpperCase()} = ${Math.round(TB[b](T[a](v)) * 100) / 100} °${b.toUpperCase()}`;
    if (!G.some(g => g.includes(a) && g.includes(b))) throw Error('Bu birimler birbirine çevrilemez');
    return `${v} ${a} = ${Math.round((v * U[a] / U[b]) * 10000) / 10000} ${b}`;
  }

  /* ---------- rutinler ---------- */
  const ROUT = {
    sabah: { label: 'Sabah brifingi', ask: 'Günaydın brifingi: bugünün tarihi, Cizre hava durumu, bugünkü ve gecikmiş görevlerim, yaklaşan hatırlatmalar, aktif projede sıradaki adım. Kısa tut.' },
    aksam: { label: 'Gün sonu özeti', ask: 'Gün sonu özeti: bugün tamamlanan görevler, yarım kalanlar, yarının planı ve aktif projede sıradaki adım. Kısa tut.' },
    hafta: { label: 'Haftalık klinik raporu', ask: () => 'Haftalık klinik raporu: bu haftaki seanslar, hastaların ağrı seyri, takibi geciken hastalar, öneriler. Veriler: ' + patients.map(p => patientSummary(p)).join(' || ').slice(0, 9000) }
  };
  function runRoutine(k) { const r = ROUT[k]; if (!r || answering) return; logOp('rutin', [r.label], 'başarılı', 'çalıştırıldı'); typedTurn(typeof r.ask === 'function' ? r.ask() : r.ask, opt('speakOn') === '1' && !document.hidden); }
  setInterval(() => {
    if (document.hidden) return;
    const n = isoLocal(now()), day = n.slice(0, 10), hm = n.slice(11, 16), dow = new Date(n).getDay();
    for (const [k, at] of [['sabah', opt('rSabah')], ['aksam', opt('rAksam')], ['hafta', dow === 1 ? opt('rHafta') : '']]) {
      if (!at || at === 'off' || hm < at || store.get('rout.' + k, '') === day) continue;
      if (hm.slice(0, 2) - at.slice(0, 2) > 2) { store.set('rout.' + k, day); continue; } // missed by hours: skip today
      store.set('rout.' + k, day); runRoutine(k);
    }
    // physio-style break reminder during working hours
    const mins = Number(opt('mola')) || 0;
    if (mins && hm >= '09:00' && hm <= '19:00' && Date.now() - store.get('lastMola', 0) > mins * 60000) {
      store.set('lastMola', Date.now());
      if (store.get('molaStarted', 0)) { bubble('alarm', '🧘 Mola: 2 dakika boyun-omuz esnetme, göz dinlendirme ve su.'); beep(); if (opt('speakOn') === '1' && !voiceSession.active && !answering) voiceSession.read('Mola zamanı. İki dakika boyun ve omuzlarını esnet, biraz su iç.'); }
      store.set('molaStarted', 1);
    }
  }, 30000);
  const sel = (id, opts) => { const s = el('select', { id }); for (const [v, t] of opts) s.append(new Option(t, v)); return s; };
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const times = [['off', 'Kapalı'], ...['06:30', '07:00', '07:30', '08:00', '08:30', '09:00'].map(t => [t, t])];
  const evening = [['off', 'Kapalı'], ...['18:00', '19:00', '20:00', '21:00', '22:00'].map(t => [t, t])];
  $('p-settings').append(el('h3', {}, 'RUTİNLER'),
    el('p', { class: 'muted' }, 'Uygulama açıkken zamanı gelince kendiliğinden çalışır.'),
    field('rSabah', 'Sabah brifingi', sel('rSabah', times)), field('rAksam', 'Gün sonu özeti', sel('rAksam', evening)),
    field('rHafta', 'Pazartesi klinik raporu', sel('rHafta', [['off', 'Kapalı'], ['09:00', '09:00'], ['10:00', '10:00'], ['12:00', '12:00']])),
    field('mola', 'Mola hatırlatıcı (09–19 arası)', sel('mola', [['0', 'Kapalı'], ['45', '45 dakikada bir'], ['60', 'Saatte bir'], ['90', '90 dakikada bir']])),
    el('h3', {}, 'ARAYÜZ'),
    field('sfx', 'Arayüz sesleri', sel('sfx', [['1', 'Açık'], ['0', 'Kapalı']])),
    field('liveWave', 'Dinlerken canlı ses dalgası', sel('liveWave', [['1', 'Açık (bilgisayar, Android)'], ['0', 'Kapalı']])));
  for (const id of ['rSabah', 'rAksam', 'rHafta', 'mola', 'sfx', 'liveWave']) {
    const v = store.get('set.' + id, null), n = $(id); if (v !== null) n.value = v;
    n.addEventListener('change', () => store.set('set.' + id, n.value));
  }
  window.jarvisRunRoutine = runRoutine;
  $('edgeR').textContent = `ARAÇ ${Object.keys(TOOLS).length} · AJAN ${Object.keys(AGENTS).length} · v3.1.0`;
})();
