/* JARVIS ışık huzmeleri — sağdan sola akan, sese ve duruma tepki veren ışık akışı + holografik çekirdek halkaları.
 * Okur: global `phase` (idle | starting | listening | thinking | speaking | error). Sağlar: jarvisAvatarLevel(v), jarvisLevelNow(). */
(function beams() {
  const canvas = document.getElementById('orb');
  const hud = document.getElementById('hud2d');
  const g = canvas.getContext('2d'), hg = hud.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let small = matchMedia('(max-width: 700px)').matches;
  let level = 0, target = 0, t = 0, W = 0, H = 0, dpr = 1, ecoSkip = false, pointerY = 0;
  window.jarvisAvatarLevel = v => { target = Math.max(0, Math.min(1, Number(v) || 0)); };
  window.jarvisLevelNow = () => level;
  const getPhase = () => (typeof phase === 'string' ? phase : 'idle');
  const COLORS = { idle: [87, 211, 255], starting: [140, 225, 255], listening: [255, 181, 71], thinking: [160, 150, 255], speaking: [110, 240, 255], error: [255, 100, 100] };
  const UCOL = { idle: [255, 52, 52], starting: [255, 110, 90], listening: [255, 181, 71], thinking: [255, 60, 150], speaking: [255, 96, 64], error: [255, 220, 80] };
  let col = [87, 211, 255], think = 0, speak = 0, listen = 0;
  const mix = (a, b, f) => a + (b - a) * f;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1], centre-weighted

  /* ---------- beams ---------- */
  let beams = [];
  function makeBeam(anyX) {
    const lane = gauss();                        // vertical position around the centre band
    const near = 1 - Math.min(1, Math.abs(lane)); // 1 at the centre band
    return {
      x: anyX ? rnd(0, 1.3) : rnd(1.02, 1.5),     // in screen widths
      lane, near,
      len: rnd(0.08, 0.45) * (0.6 + near * 0.8),  // in screen widths
      v: rnd(0.0018, 0.0065) * (0.7 + near * 0.6),
      w: rnd(0.6, 2.4) * (0.7 + near * 0.9),
      a: rnd(0.25, 0.85) * (0.4 + near * 0.6),
      warm: Math.random() < 0.18,                 // a few amber beams
      ph: rnd(0, Math.PI * 2), f: rnd(0.6, 1.8)
    };
  }
  function resize() {
    small = matchMedia('(max-width: 700px)').matches;
    dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = hud.width = Math.round(innerWidth * dpr);
    H = canvas.height = hud.height = Math.round(innerHeight * dpr);
    const n = small ? 70 : 150;
    beams = Array.from({ length: n }, () => makeBeam(true));
  }
  addEventListener('resize', resize); resize();
  addEventListener('pointermove', e => { pointerY = (e.clientY / innerHeight - 0.5); }, { passive: true });

  const centre = () => [W / 2, H * (small ? 0.34 : 0.4)];

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (window.jarvisEco && (ecoSkip = !ecoSkip)) return;
    const ph = getPhase();
    t += reduce ? 0.004 : 0.016;
    if (ph === 'speaking') target = Math.max(target * 0.9, 0.3 + 0.5 * Math.abs(Math.sin(t * 11) * Math.sin(t * 4.3)));
    else if (ph !== 'listening') target *= 0.92;
    level = mix(level, target, 0.25);
    const PAL = document.body.classList.contains('ultron') ? UCOL : COLORS;
    col = col.map((v, i) => mix(v, (PAL[ph] || PAL.idle)[i], 0.05));
    think = mix(think, ph === 'thinking' ? 1 : 0, 0.05);
    speak = mix(speak, ph === 'speaking' ? 1 : 0, 0.08);
    listen = mix(listen, ph === 'listening' || ph === 'starting' ? 1 : 0, 0.08);

    const [cx, cy] = centre();
    const band = H * (small ? 0.2 : 0.26);              // vertical spread of the beams
    const speedK = (reduce ? 0.25 : 1) * (1 + level * 2.2 + think * 1.6);
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    // soft horizontal glow along the band
    const glow = g.createLinearGradient(0, cy - band, 0, cy + band);
    glow.addColorStop(0, `rgba(${col},0)`); glow.addColorStop(0.5, `rgba(${col.map(Math.round)},${0.05 + level * 0.08})`); glow.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = glow; g.fillRect(0, cy - band, W, band * 2);

    for (const b of beams) {
      b.x -= b.v * speedK;
      if (b.x + b.len < -0.05) Object.assign(b, makeBeam(false));
      // voice turns the centre band into a living waveform; thinking pulls beams toward the centre line
      const wave = Math.sin(b.x * 9 * b.f + t * 5 + b.ph) * (level * 0.55 + listen * 0.12) * b.near;
      const lane = b.lane * (1 - think * 0.55) + wave * 0.35 + pointerY * 0.15 * (1 - b.near);
      const y = cy + lane * band;
      const x1 = b.x * W, x2 = (b.x + b.len) * W;
      const c = b.warm ? [255, 181, 71] : col.map(Math.round);
      const a = Math.min(1, b.a * (0.55 + level * 0.9 + speak * 0.2 + think * 0.25));
      const gr = g.createLinearGradient(x1, 0, x2, 0);
      gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(0.12, `rgba(${c},${a * 0.6})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.strokeStyle = gr; g.lineWidth = b.w * dpr * (1 + level * 0.6 * b.near);
      g.beginPath(); g.moveTo(x1, y);
      // slight curvature so beams look like streaming light, not lines
      g.quadraticCurveTo((x1 + x2) / 2, y + Math.sin(t * 2 + b.ph) * band * 0.04 * b.near, x2, y + lane * band * 0.02);
      g.stroke();
      // bright head
      if (b.near > 0.5 || b.warm) { g.fillStyle = `rgba(${c},${Math.min(1, a * 1.2)})`; g.beginPath(); g.arc(x1, y, b.w * dpr * 1.1, 0, Math.PI * 2); g.fill(); }
    }
    // centre line flare
    const flare = g.createRadialGradient(cx, cy, 0, cx, cy, band * (0.7 + level * 0.6));
    flare.addColorStop(0, `rgba(${col.map(Math.round)},${0.16 + level * 0.3})`); flare.addColorStop(1, `rgba(${col.map(Math.round)},0)`);
    g.fillStyle = flare; g.beginPath(); g.ellipse(cx, cy, band * 2.4, band * (0.55 + level * 0.4), 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    drawHud(ph, cx, cy);
  }

  /* ---------- holographic core rings (centre) ---------- */
  const RING_TEXT = ' J.A.R.V.I.S  ·  FİZYOVİTA  ·  CİZRE 37.33°K 42.19°D  ·  KİŞİSEL ASİSTAN  ·  IŞIK ÇEKİRDEĞİ  ·';
  const hex = () => Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  let hexRows = Array.from({ length: 9 }, hex), hexT = 0;
  const spec = new Float32Array(120);
  function drawHud(ph, hx, hy) {
    hg.clearRect(0, 0, W, H);
    if (window.jarvisEco && small) return;
    let R = Math.min(W, H) * (small ? 0.2 : 0.155);
    const maxR = Math.min(W / 2 - 8 * dpr, hy - (small ? 70 : 46) * dpr) / 1.72;
    if (R > maxR) R = maxR;
    const c = a => `rgba(${col.map(Math.round)},${a})`, am = a => `rgba(255,181,71,${a})`;
    const TAU = Math.PI * 2, spin = reduce ? 0.2 : 1;
    hg.save(); hg.globalCompositeOperation = 'lighter';
    const ring = (r, a, w = 1) => { hg.strokeStyle = c(a); hg.lineWidth = w * dpr; hg.beginPath(); hg.arc(hx, hy, r, 0, TAU); hg.stroke(); };
    const arc = (r, a0, a1, style, w) => { hg.strokeStyle = style; hg.lineWidth = w * dpr; hg.beginPath(); hg.arc(hx, hy, r, a0, a1); hg.stroke(); };
    // dark lens so text stays readable over the beams
    const lens = hg.createRadialGradient(hx, hy, 0, hx, hy, R);
    lens.addColorStop(0, c(0.10 + level * 0.15)); lens.addColorStop(0.7, c(0.03)); lens.addColorStop(1, c(0));
    hg.fillStyle = lens; hg.beginPath(); hg.arc(hx, hy, R, 0, TAU); hg.fill();
    // inner core: pulsing rings
    for (let i = 0; i < 3; i++) ring(R * (0.25 + i * 0.12 + level * 0.06 * (i + 1)), 0.35 - i * 0.08, 1.2);
    hg.fillStyle = c(0.75 + level * 0.25); hg.beginPath(); hg.arc(hx, hy, R * (0.07 + level * 0.05), 0, TAU); hg.fill();
    // circular voice spectrum
    for (let i = 0; i < spec.length; i++) {
      const n = Math.abs(Math.sin(i * 0.37 + t * 7.3) * Math.sin(i * 0.11 - t * 3.1)) * (0.35 + level * 1.4) + (ph === 'thinking' ? 0.15 * Math.abs(Math.sin(i * 0.5 + t * 12)) : 0);
      spec[i] += (n - spec[i]) * 0.35;
    }
    hg.lineWidth = 2 * dpr;
    for (let i = 0; i < spec.length; i++) {
      const a = (i / spec.length) * TAU - Math.PI / 2, len = (3 + spec[i] * R * 0.22) * (ph === 'idle' ? 0.45 : 1);
      hg.strokeStyle = ph === 'listening' ? am(0.35 + spec[i] * 0.5) : c(0.3 + spec[i] * 0.55);
      hg.beginPath(); hg.moveTo(hx + Math.cos(a) * R * 1.03, hy + Math.sin(a) * R * 1.03); hg.lineTo(hx + Math.cos(a) * (R * 1.03 + len), hy + Math.sin(a) * (R * 1.03 + len)); hg.stroke();
    }
    ring(R, 0.55, 1.2);
    // degree scale
    const rot1 = t * 0.05 * spin, rS = R * 1.3;
    hg.strokeStyle = c(0.45); hg.lineWidth = dpr; hg.beginPath();
    for (let i = 0; i < 180; i++) { const a = rot1 + (i / 180) * TAU, l = i % 15 === 0 ? 9 : i % 5 === 0 ? 5 : 2.5; hg.moveTo(hx + Math.cos(a) * rS, hy + Math.sin(a) * rS); hg.lineTo(hx + Math.cos(a) * (rS - l * dpr), hy + Math.sin(a) * (rS - l * dpr)); }
    hg.stroke();
    if (!small) { hg.fillStyle = c(0.6); hg.font = `${8 * dpr}px "Share Tech Mono", monospace`; hg.textAlign = 'center'; hg.textBaseline = 'middle'; for (let d = 0; d < 360; d += 30) { const a = rot1 + (d / 360) * TAU; hg.fillText(String(d).padStart(3, '0'), hx + Math.cos(a) * (rS + 9 * dpr), hy + Math.sin(a) * (rS + 9 * dpr)); } }
    // voice-level arc + thinking arcs
    arc(R * 1.17, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, level * 1.15), am(0.85), 3);
    arc(R * 1.17, 0, TAU, c(0.12), 3);
    const th = t * (ph === 'thinking' ? 2.6 : 0.6) * spin;
    for (let k = 0; k < 2; k++) arc(R * 1.47, th + k * Math.PI, th + k * Math.PI + 0.7, am(0.55), 2.5);
    // segmented ring
    const rot2 = -t * 0.18 * spin, rT = R * 1.4;
    [[0, 1.35], [1.6, 2.5], [2.75, 4.3], [4.6, 5.9]].forEach(([s, e]) => { arc(rT, rot2 + s, rot2 + e, c(0.22), 7); arc(rT, rot2 + e - 0.06, rot2 + e, c(0.9), 7); });
    // dashed ring
    hg.setLineDash([2 * dpr, 7 * dpr]); hg.lineDashOffset = -t * 40 * spin; ring(R * 1.53, 0.6, 1.4); hg.setLineDash([]);
    // ring text
    if (!small) {
      const rTx = R * 1.62, txt = RING_TEXT.repeat(2), step = TAU / txt.length, rot3 = t * 0.07 * spin;
      hg.fillStyle = c(0.55); hg.font = `${8.5 * dpr}px "Share Tech Mono", monospace`; hg.textAlign = 'center'; hg.textBaseline = 'middle';
      for (let i = 0; i < txt.length; i++) { const a = rot3 + i * step; hg.save(); hg.translate(hx + Math.cos(a) * rTx, hy + Math.sin(a) * rTx); hg.rotate(a + Math.PI / 2); hg.fillText(txt[i], 0, 0); hg.restore(); }
    }
    // outer hairline + markers + crosshair
    const rO = R * (small ? 1.6 : 1.7); ring(rO, 0.25, 1);
    hg.fillStyle = c(0.85);
    for (let k = 0; k < 4; k++) { const a = t * 0.3 * spin + k * Math.PI / 2; hg.save(); hg.translate(hx + Math.cos(a) * rO, hy + Math.sin(a) * rO); hg.rotate(a); hg.beginPath(); hg.moveTo(5 * dpr, 0); hg.lineTo(-3 * dpr, -4 * dpr); hg.lineTo(-3 * dpr, 4 * dpr); hg.closePath(); hg.fill(); hg.restore(); }
    hg.strokeStyle = c(0.7); hg.lineWidth = 1.4 * dpr; hg.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; hg.moveTo(hx + Math.cos(a) * (rO + 4 * dpr), hy + Math.sin(a) * (rO + 4 * dpr)); hg.lineTo(hx + Math.cos(a) * (rO + 16 * dpr), hy + Math.sin(a) * (rO + 16 * dpr)); }
    hg.stroke();
    // tilted orbitals
    for (let k = 0; k < 2; k++) {
      const tilt = (k ? -0.42 : 0.42) + Math.sin(t * 0.2 + k) * 0.05, rx = R * (1.9 - k * 0.2), ry = R * 0.3;
      hg.strokeStyle = c(0.22); hg.lineWidth = dpr; hg.beginPath(); hg.ellipse(hx, hy, rx, ry, tilt, 0, TAU); hg.stroke();
      const a = t * (0.5 + k * 0.25) * spin + k * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry, front = Math.sin(a) > 0;
      hg.fillStyle = k ? am(front ? 0.95 : 0.35) : c(front ? 0.95 : 0.35); hg.beginPath(); hg.arc(hx + ex * Math.cos(tilt) - ey * Math.sin(tilt), hy + ex * Math.sin(tilt) + ey * Math.cos(tilt), (front ? 3.2 : 2) * dpr, 0, TAU); hg.fill();
    }
    // side data
    if (!small) {
      if ((hexT += 1) % 9 === 0) { hexRows.shift(); hexRows.push(hex()); }
      hg.font = `${9 * dpr}px "Share Tech Mono", monospace`; hg.textAlign = 'right'; hg.textBaseline = 'alphabetic';
      const lx = hx - rO - 26 * dpr, ly = hy + R * 0.2, rx = hx + rO + 26 * dpr;
      hexRows.forEach((h, i) => { hg.fillStyle = c(0.15 + i * 0.07); hg.fillText('0x' + h, lx, ly + i * 12 * dpr); });
      for (let i = 0; i < 6; i++) { const v = Math.min(1, spec[i * 17] * 1.2); hg.fillStyle = c(0.12); hg.fillRect(rx, ly + i * 12 * dpr - 7 * dpr, 70 * dpr, 6 * dpr); hg.fillStyle = i % 3 === 2 ? am(0.75) : c(0.7); hg.fillRect(rx, ly + i * 12 * dpr - 7 * dpr, 70 * dpr * v, 6 * dpr); }
      hg.textAlign = 'left'; hg.fillStyle = c(0.7);
      const st = { idle: 'BEKLEMEDE', starting: 'BAŞLATIYOR', listening: 'DİNLİYOR', thinking: 'ANALİZ', speaking: 'YANITLIYOR', error: 'HATA' }[ph] || ph;
      [`DURUM  ${st}`, `SES    ${String(Math.round(level * 100)).padStart(3, '0')}`, `HUZME  ${beams.length}`, `AKIŞ   ${(1 + level * 2.2 + think * 1.6).toFixed(1)}x`].forEach((s, i) => hg.fillText(s, rx, hy - R * 0.75 + i * 13 * dpr));
      hg.textAlign = 'right';
      ['ÇEKİRDEK ' + (60 + Math.round(level * 40)) + '%', 'SES MOTORU ' + (typeof setting === 'function' && setting('voice') === 'natural' ? 'DOĞAL' : 'CİHAZ'), 'BAĞ ' + (navigator.onLine ? 'ÇEVRİMİÇİ' : 'YOK')].forEach((s, i) => hg.fillText(s, lx, hy - R * 0.75 + i * 13 * dpr));
    }
    hg.restore();
  }

  requestAnimationFrame(frame);
})();
