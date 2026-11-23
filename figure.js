/* JARVIS holographic figure — WebGL point/contour hologram of a human bust with a 2D HUD overlay.
 * Reads the global `phase` (idle | starting | listening | thinking | speaking | error) and window.jarvisAvatarLevel(v). */
(function figure() {
  const canvas = document.getElementById('orb');
  const hud = document.getElementById('hud2d');
  const hg = hud.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 700px)').matches;
  let level = 0, target = 0, t = 0, W = 0, H = 0, dpr = 1;
  window.jarvisAvatarLevel = v => { target = Math.max(0, Math.min(1, Number(v) || 0)); };
  const getPhase = () => (typeof phase === 'string' ? phase : 'idle');

  /* ---------- geometry: contour rings of a human bust ---------- */
  const pts = [], lines = []; // pts: x,y,z,kind,seed ; lines: pairs of points
  const g2 = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / s);
  function face(x, y, z) {
    if (z <= 0) return z;
    let dz = 0;
    if (Math.abs(x) < 0.032 && y > 0.85 && y < 0.995) dz += 0.06 * (1 - Math.abs(x) / 0.032) * Math.min(1, (0.995 - y) / 0.11); // nose
    dz -= 0.04 * (g2(x, y, 0.066, 0.985, 0.0007) + g2(x, y, -0.066, 0.985, 0.0007)); // eye sockets
    dz += 0.02 * (g2(x, y, 0.06, 1.03, 0.0012) + g2(x, y, -0.06, 1.03, 0.0012)); // brow
    dz += 0.012 * g2(x, y, 0, 0.815, 0.0009) * (Math.abs(x) < 0.05 ? 1 : 0.3); // lips
    dz += 0.012 * g2(x, y, 0, 0.745, 0.0012); // chin
    dz += 0.01 * (g2(x, y, 0.1, 0.93, 0.0015) + g2(x, y, -0.1, 0.93, 0.0015)); // cheekbones
    return z + dz * Math.min(1, z / 0.08);
  }
  function kindOf(x, y, z) {
    if (z > 0.13 && y > 0.795 && y < 0.83 && Math.abs(x) < 0.05) return 2; // mouth
    if (z > 0.12 && Math.abs(Math.abs(x) - 0.066) < 0.03 && Math.abs(y - 0.985) < 0.018) return 3; // eyes
    if (z > 0.1 && y > 0.72 && y < 1.1) return 1; // face
    return 0;
  }
  function ring(y, w, d, step, opts = {}) {
    const n = Math.max(16, Math.round((Math.PI * (w + d)) / step));
    const ringPts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let x = (opts.cx || 0) + Math.sign(ca) * Math.abs(ca) ** (opts.ex || 1) * w;
      let z = Math.sign(sa) * Math.abs(sa) ** (opts.ex || 1) * d;
      if (opts.pec && z > 0) z += 0.03 * Math.exp(-((Math.abs(x) - 0.17) ** 2) / 0.012) * opts.pec;
      if (opts.face) z = face(x, y, z);
      const k = opts.kind ?? kindOf(x, y, z);
      ringPts.push([x, y, z, k, Math.random()]);
    }
    pts.push(...ringPts);
    if (opts.line) for (let i = 0; i < ringPts.length; i++) { const a = ringPts[i], b = ringPts[(i + 1) % ringPts.length]; lines.push(a, b); }
    return ringPts;
  }
  const S = small ? 1.6 : 1; // sparser on phones
  // head
  let r = 0;
  for (let y = 1.245; y > 0.715; y -= 0.0085 * S, r++) {
    const tt = (y - 0.985) / 0.265, k = Math.sqrt(Math.max(0, 1 - tt * tt));
    let w = 0.175 * k, d = 0.205 * k;
    if (y < 0.95) { const f = (y - 0.715) / 0.235; w *= 0.72 + 0.28 * f; d *= 0.86 + 0.14 * f; }
    if (w < 0.01) continue;
    ring(y, w, d, 0.0062 * S, { face: true, line: r % 4 === 0 });
  }
  // ears
  for (const side of [-1, 1]) for (let y = 0.9; y < 1.01; y += 0.008 * S) { const e = Math.sqrt(Math.max(0, 1 - ((y - 0.955) / 0.055) ** 2)); ring(y, 0.012 * e + 0.002, 0.03 * e + 0.002, 0.006 * S, { cx: side * 0.158, kind: 0 }); }
  // head meridians (vertical lines) for a wireframe feel
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * Math.PI * 2; let prev = null;
    for (let y = 1.24; y > 0.72; y -= 0.02) {
      const tt = (y - 0.985) / 0.265, k = Math.sqrt(Math.max(0, 1 - tt * tt));
      let w = 0.165 * k, d = 0.205 * k; if (y < 0.95) { const f = (y - 0.715) / 0.235; w *= 0.72 + 0.28 * f; d *= 0.86 + 0.14 * f; }
      const x = Math.cos(a) * w, z = face(x, y, Math.sin(a) * d), p = [x, y, z, 0, Math.random()];
      if (prev) lines.push(prev, p); prev = p;
    }
  }
  // neck
  r = 0;
  for (let y = 0.735; y > 0.55; y -= 0.014 * S, r++) ring(y, 0.072 + (0.735 - y) * 0.08, 0.07, 0.007 * S, { kind: 0, line: r % 3 === 0 });
  // torso with trapezius slope, shoulders, chest
  r = 0;
  for (let y = 0.6; y > -0.02; y -= 0.012 * S, r++) {
    let w, d;
    if (y > 0.44) { const f = (0.6 - y) / 0.16; w = 0.085 + Math.sin(f * Math.PI / 2) ** 1.6 * 0.4; d = 0.075 + f * 0.07; }
    else { w = 0.485 - (0.44 - y) * 0.12; d = 0.145 + 0.04 * Math.exp(-((y - 0.25) ** 2) / 0.03); }
    ring(y, w, d, 0.0085 * S, { ex: 0.8, pec: y < 0.4 && y > 0.1 ? 1 : 0, kind: 0, line: r % 4 === 0 });
  }
  // shoulder caps (deltoids) and torso meridians
  for (const side of [-1, 1]) for (let y = 0.5; y > 0.2; y -= 0.012 * S) { const e = Math.sqrt(Math.max(0, 1 - ((y - 0.4) / 0.14) ** 2)); ring(y, 0.05 + 0.04 * e, 0.07 + 0.04 * e, 0.009 * S, { cx: side * (0.44 + 0.03 * e), kind: 0 }); }
  for (let m = 0; m < 16; m++) {
    const a = (m / 16) * Math.PI * 2; let prev = null;
    for (let y = 0.6; y > -0.02; y -= 0.03) {
      let w, d; if (y > 0.44) { const f = (0.6 - y) / 0.16; w = 0.085 + Math.sin(f * Math.PI / 2) ** 1.6 * 0.4; d = 0.075 + f * 0.07; } else { w = 0.485 - (0.44 - y) * 0.12; d = 0.145 + 0.04 * Math.exp(-((y - 0.25) ** 2) / 0.03); }
      const ca = Math.cos(a), sa = Math.sin(a), p = [Math.sign(ca) * Math.abs(ca) ** 0.8 * w, y, Math.sign(sa) * Math.abs(sa) ** 0.8 * d, 0, 0];
      if (prev) lines.push(prev, p); prev = p;
    }
  }
  // chest energy core (kind 6), floor rings (kind 4), rising data stream (kind 5)
  for (let i = 0; i < 260 / S; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 0.045; pts.push([Math.cos(a) * rr, 0.3 + Math.sin(a) * rr, 0.19, 6, Math.random()]); }
  for (let ringI = 0; ringI < 4; ringI++) for (let i = 0; i < 220 / S; i++) { const a = (i / (220 / S)) * 6.283, rr = 0.45 + ringI * 0.17; pts.push([Math.cos(a) * rr, -0.04, Math.sin(a) * rr * 0.9, 4, ringI / 4]); }
  for (let i = 0; i < 700 / S; i++) { const a = Math.random() * 6.283, rr = 0.55 + Math.random() * 0.5; pts.push([Math.cos(a) * rr, -0.04 + Math.random() * 1.4, Math.sin(a) * rr * 0.9, 5, Math.random()]); }

  /* ---------- WebGL ---------- */
  const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false, alpha: true });
  if (!gl) return fallback2D();
  const VS = `
    attribute vec3 p; attribute float k; attribute float s;
    uniform float t, yaw, lvl, scale, aspect, scanY, think, listen, speak, dpr, cyOff;
    varying float a; varying float kk;
    void main() {
      vec3 q = p;
      float breath = 1.0 + sin(t * 1.6) * 0.012;
      q.y = (q.y - 0.2) * breath + 0.2;
      if (k == 5.0) { q.y = -0.04 + mod(p.y + 0.04 + t * (0.05 + s * 0.08), 1.4); }
      if (k == 4.0) { float ang = atan(q.z, q.x) + t * (0.15 + s * 0.25) * (mod(s * 4.0, 2.0) < 1.0 ? 1.0 : -1.0); float rr = length(q.xz); q.x = cos(ang) * rr; q.z = sin(ang) * rr; }
      if (k == 2.0) { q.y -= lvl * 0.018 * sin(s * 20.0 + t * 30.0); q.z += lvl * 0.01; }
      if (k == 6.0) { float pulse = 1.0 + lvl * 0.8 + sin(t * 3.0) * 0.1; q.xy = vec2(q.x, q.y - 0.3) * pulse + vec2(0.0, 0.3); }
      if (think > 0.0 && k < 4.0 && s < 0.22) { float ang = s * 40.0 + t * (1.2 + s * 3.0); float rr = 0.28 + s * 0.5; q = mix(q, vec3(cos(ang) * rr, 0.98 + sin(ang * 2.0 + s * 9.0) * 0.12, sin(ang) * rr), think); }
      if (listen > 0.0 && k < 4.0) { float w = sin(q.y * 22.0 - t * 8.0) * 0.006 * (0.6 + lvl) * listen; q.x *= 1.0 + w; q.z *= 1.0 + w; }
      vec3 j = vec3(sin(t * 2.1 + s * 40.0), cos(t * 1.7 + s * 33.0), sin(t * 1.3 + s * 21.0)) * 0.0025 * (1.0 + lvl * 2.0);
      q += j * (k == 5.0 ? 4.0 : 1.0);
      float c = cos(yaw), sn = sin(yaw);
      vec3 r = vec3(q.x * c + q.z * sn, q.y, -q.x * sn + q.z * c);
      float persp = 2.6 / (2.6 - r.z);
      vec2 sc = vec2(r.x * persp * scale / aspect, (r.y - 0.62) * persp * scale + cyOff);
      gl_Position = vec4(sc, 0.0, 1.0);
      float depth = clamp((r.z + 0.6) / 1.2, 0.0, 1.0);
      float scan = smoothstep(0.035, 0.0, abs(q.y - scanY));
      a = (0.2 + depth * 0.5) * (k < 4.0 ? smoothstep(-0.02, 0.22, p.y) : 1.0) + scan * 0.9;
      if (k == 1.0) a += 0.12;
      if (k == 3.0) a += 0.55 + lvl * 0.4;
      if (k == 2.0) a += speak * lvl * 1.1;
      if (k == 4.0) a = 0.18 + lvl * 0.25;
      if (k == 5.0) a = 0.10 + s * 0.15;
      if (k == 6.0) a = 0.55 + lvl * 0.45;
      kk = k;
      gl_PointSize = (k == 6.0 ? 3.2 : k == 3.0 ? 2.6 : k == 5.0 ? 1.6 : 2.0) * dpr * (0.75 + depth * 0.5) * (1.0 + scan * 0.6);
    }`;
  const FS = `
    precision mediump float; uniform vec3 col; uniform vec3 col2; varying float a; varying float kk;
    void main() {
      vec2 d = gl_PointCoord - 0.5; float r = length(d);
      float g = smoothstep(0.5, 0.0, r); g = g * g;
      vec3 c = (kk == 6.0 || kk == 3.0) ? col2 : col;
      gl_FragColor = vec4(c * g * a, g * a);
    }`;
  const LVS = `
    attribute vec3 p; uniform float t, yaw, scale, aspect, cyOff, lvl;
    varying float a;
    void main() {
      vec3 q = p; q.y = (q.y - 0.2) * (1.0 + sin(t * 1.6) * 0.012) + 0.2;
      float c = cos(yaw), sn = sin(yaw);
      vec3 r = vec3(q.x * c + q.z * sn, q.y, -q.x * sn + q.z * c);
      float persp = 2.6 / (2.6 - r.z);
      gl_Position = vec4(r.x * persp * scale / aspect, (r.y - 0.62) * persp * scale + cyOff, 0.0, 1.0);
      a = (0.05 + clamp((r.z + 0.6) / 1.2, 0.0, 1.0) * 0.15) * (1.0 + lvl) * smoothstep(-0.02, 0.22, p.y);
    }`;
  const LFS = `precision mediump float; uniform vec3 col; varying float a; void main() { gl_FragColor = vec4(col * a, a); }`;
  function prog(vs, fs) {
    const pr = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh)); gl.attachShader(pr, sh); }
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(pr));
    return pr;
  }
  let P, L;
  try { P = prog(VS, FS); L = prog(LVS, LFS); } catch (e) { console.warn('JARVIS figure fallback', e); return fallback2D(); }
  const pData = new Float32Array(pts.length * 5); pts.forEach((v, i) => pData.set(v, i * 5));
  const pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.bufferData(gl.ARRAY_BUFFER, pData, gl.STATIC_DRAW);
  const lData = new Float32Array(lines.length * 3); lines.forEach((v, i) => lData.set([v[0], v[1], v[2]], i * 3));
  const lBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lBuf); gl.bufferData(gl.ARRAY_BUFFER, lData, gl.STATIC_DRAW);
  const U = (pr, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(pr, n)]));
  const pu = U(P, ['t', 'yaw', 'lvl', 'scale', 'aspect', 'scanY', 'think', 'listen', 'speak', 'dpr', 'cyOff', 'col', 'col2']);
  const lu = U(L, ['t', 'yaw', 'scale', 'aspect', 'cyOff', 'lvl', 'col']);
  const pa = { p: gl.getAttribLocation(P, 'p'), k: gl.getAttribLocation(P, 'k'), s: gl.getAttribLocation(P, 's') };
  const la = gl.getAttribLocation(L, 'p');

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = hud.width = Math.round(innerWidth * dpr);
    H = canvas.height = hud.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', resize); resize();
  const COLORS = { idle: [0.34, 0.83, 1], starting: [0.55, 0.88, 1], listening: [1, 0.72, 0.32], thinking: [0.62, 0.62, 1], speaking: [0.45, 0.95, 1], error: [1, 0.4, 0.4] };
  let ecoSkip = false, pointerYaw = 0, col = [0.34, 0.83, 1], think = 0, listen = 0, speak = 0, yawExtra = 0;
  const mix = (a, b, f) => a + (b - a) * f;

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (window.jarvisEco && (ecoSkip = !ecoSkip)) return; // low-power: half frame rate
    const ph = getPhase();
    t += reduce ? 0.004 : 0.016;
    if (ph === 'speaking') target = Math.max(target * 0.9, 0.3 + 0.5 * Math.abs(Math.sin(t * 11) * Math.sin(t * 4.3)));
    else if (ph !== 'listening') target *= 0.92;
    level = mix(level, target, 0.25);
    col = col.map((v, i) => mix(v, (COLORS[ph] || COLORS.idle)[i], 0.06));
    think = mix(think, ph === 'thinking' ? 1 : 0, 0.05);
    listen = mix(listen, ph === 'listening' || ph === 'starting' ? 1 : 0, 0.08);
    speak = mix(speak, ph === 'speaking' ? 1 : 0, 0.1);
    yawExtra += think * 0.012;
    pointerYaw += ((window.jarvisPointer || 0) * 0.45 - pointerYaw) * 0.04;
    const yaw = Math.sin(t * 0.22) * 0.35 + yawExtra + pointerYaw;
    const aspect = W / H;
    const scale = small ? Math.min(1.1, 1.6 * aspect) : Math.min(1.0, 1.25 * aspect);
    const cyOff = small ? 0.1 : 0.06;
    const scanY = 1.3 - ((t * 0.3) % 1.4);
    const col2 = ph === 'listening' ? [1, 0.75, 0.35] : [1, 0.8, 0.45];

    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    // contour lines
    gl.useProgram(L);
    gl.bindBuffer(gl.ARRAY_BUFFER, lBuf); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 3, gl.FLOAT, false, 12, 0);
    gl.uniform1f(lu.t, t); gl.uniform1f(lu.yaw, yaw); gl.uniform1f(lu.scale, scale); gl.uniform1f(lu.aspect, aspect); gl.uniform1f(lu.cyOff, cyOff); gl.uniform1f(lu.lvl, level); gl.uniform3fv(lu.col, col);
    gl.drawArrays(gl.LINES, 0, lines.length);
    gl.disableVertexAttribArray(la);
    // particles
    gl.useProgram(P);
    gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
    gl.enableVertexAttribArray(pa.p); gl.vertexAttribPointer(pa.p, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(pa.k); gl.vertexAttribPointer(pa.k, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(pa.s); gl.vertexAttribPointer(pa.s, 1, gl.FLOAT, false, 20, 16);
    gl.uniform1f(pu.t, t); gl.uniform1f(pu.yaw, yaw); gl.uniform1f(pu.lvl, level); gl.uniform1f(pu.scale, scale); gl.uniform1f(pu.aspect, aspect);
    gl.uniform1f(pu.scanY, scanY); gl.uniform1f(pu.think, think); gl.uniform1f(pu.listen, listen); gl.uniform1f(pu.speak, speak);
    gl.uniform1f(pu.dpr, dpr); gl.uniform1f(pu.cyOff, cyOff); gl.uniform3fv(pu.col, col); gl.uniform3fv(pu.col2, col2);
    gl.drawArrays(gl.POINTS, 0, pts.length);

    drawHud(ph, scale, cyOff, aspect);
  }

  /* ---------- 2D HUD overlay: multi-layer holographic core around the head (concentric rotating rings,
   * circular voice spectrum, degree scale, orbitals, ring text, projector beam, side data) ---------- */
  const RING_TEXT = ' J.A.R.V.I.S  ·  FİZYOVİTA  ·  CİZRE 37.33°K 42.19°D  ·  KİŞİSEL ASİSTAN  ·  BİYOMETRİK ÇEKİRDEK  ·';
  const hex = () => Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  let hexRows = Array.from({ length: 9 }, hex), hexT = 0;
  const spec = new Float32Array(120);
  window.jarvisLevelNow = () => level;
  function drawHud(ph, scale, cyOff, aspect) {
    hg.clearRect(0, 0, W, H);
    const toPx = (x, y) => [W / 2 + (x * scale / aspect) * W / 2, H / 2 - ((y - 0.62) * scale + cyOff) * H / 2];
    const [hx, hy] = toPx(0, 0.98);
    let R = 0.28 * scale * H / 2;
    const maxR = Math.min(W / 2 - 8 * dpr, hy - (small ? 70 : 46) * dpr) / 1.72;
    if (R > maxR) R = maxR;
    const [r0, g0, b0] = col.map(v => Math.round(v * 255));
    const c = a => `rgba(${r0},${g0},${b0},${a})`, am = a => `rgba(255,181,71,${a})`;
    const TAU = Math.PI * 2, spin = reduce ? 0.2 : 1;
    hg.save(); hg.globalCompositeOperation = 'lighter'; hg.lineCap = 'butt';
    const ring = (r, a, w = 1) => { hg.strokeStyle = c(a); hg.lineWidth = w * dpr; hg.beginPath(); hg.arc(hx, hy, r, 0, TAU); hg.stroke(); };
    const arc = (r, a0, a1, style, w) => { hg.strokeStyle = style; hg.lineWidth = w * dpr; hg.beginPath(); hg.arc(hx, hy, r, a0, a1); hg.stroke(); };

    // projector beam from the base up to the bust
    const [bx0, by0] = toPx(0, -0.04);
    const beam = hg.createLinearGradient(0, by0, 0, hy - R);
    beam.addColorStop(0, c(0.09)); beam.addColorStop(0.6, c(0.025)); beam.addColorStop(1, c(0));
    hg.fillStyle = beam; hg.beginPath();
    hg.moveTo(bx0 - R * 0.35, by0); hg.lineTo(bx0 + R * 0.35, by0); hg.lineTo(bx0 + R * 2.1, hy - R * 0.4); hg.lineTo(bx0 - R * 2.1, hy - R * 0.4); hg.closePath(); hg.fill();
    // projector base ellipses
    for (let i = 0; i < 3; i++) { hg.strokeStyle = c(0.35 - i * 0.09); hg.lineWidth = (1.6 - i * 0.4) * dpr; hg.beginPath(); hg.ellipse(bx0, by0, R * (0.45 + i * 0.32), R * (0.07 + i * 0.045), 0, 0, TAU); hg.stroke(); }

    // 1 circular voice spectrum
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

    // 2 degree scale (slow rotation)
    const rot1 = t * 0.05 * spin, rS = R * 1.3;
    hg.strokeStyle = c(0.45); hg.lineWidth = 1 * dpr; hg.beginPath();
    for (let i = 0; i < 180; i++) { const a = rot1 + (i / 180) * TAU, l = i % 15 === 0 ? 9 : i % 5 === 0 ? 5 : 2.5; hg.moveTo(hx + Math.cos(a) * rS, hy + Math.sin(a) * rS); hg.lineTo(hx + Math.cos(a) * (rS - l * dpr), hy + Math.sin(a) * (rS - l * dpr)); }
    hg.stroke();
    if (!small) { hg.fillStyle = c(0.6); hg.font = `${8 * dpr}px "Share Tech Mono", monospace`; hg.textAlign = 'center'; hg.textBaseline = 'middle'; for (let d = 0; d < 360; d += 30) { const a = rot1 + (d / 360) * TAU; hg.fillText(String(d).padStart(3, '0'), hx + Math.cos(a) * (rS + 9 * dpr), hy + Math.sin(a) * (rS + 9 * dpr)); } }

    // 3 voice-level arc (amber) + thinking arcs
    arc(R * 1.17, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, level * 1.15), am(0.85), 3);
    arc(R * 1.17, 0, TAU, c(0.12), 3);
    const th = t * (ph === 'thinking' ? 2.6 : 0.6) * spin;
    for (let k = 0; k < 2; k++) arc(R * 1.47, th + k * Math.PI, th + k * Math.PI + 0.7, am(0.55), 2.5);

    // 4 thick segmented ring with bright leading edges
    const rot2 = -t * 0.18 * spin, rT = R * 1.4;
    [[0, 1.35], [1.6, 2.5], [2.75, 4.3], [4.6, 5.9]].forEach(([s, e]) => { arc(rT, rot2 + s, rot2 + e, c(0.22), 7); arc(rT, rot2 + e - 0.06, rot2 + e, c(0.9), 7); });

    // 5 dashed counter-rotating ring
    hg.setLineDash([2 * dpr, 7 * dpr]); hg.lineDashOffset = -t * 40 * spin; ring(R * 1.53, 0.6, 1.4); hg.setLineDash([]);

    // 6 text running around the core
    if (!small) {
      const rTx = R * 1.62, txt = RING_TEXT.repeat(2), step = TAU / txt.length, rot3 = t * 0.07 * spin;
      hg.fillStyle = c(0.55); hg.font = `${8.5 * dpr}px "Share Tech Mono", monospace`; hg.textAlign = 'center'; hg.textBaseline = 'middle';
      for (let i = 0; i < txt.length; i++) { const a = rot3 + i * step; hg.save(); hg.translate(hx + Math.cos(a) * rTx, hy + Math.sin(a) * rTx); hg.rotate(a + Math.PI / 2); hg.fillText(txt[i], 0, 0); hg.restore(); }
    }
    // 7 outer hairline with moving triangle markers
    const rO = R * (small ? 1.6 : 1.7); ring(rO, 0.25, 1);
    hg.fillStyle = c(0.85);
    for (let k = 0; k < 4; k++) { const a = t * 0.3 * spin + k * Math.PI / 2, x = hx + Math.cos(a) * rO, y = hy + Math.sin(a) * rO; hg.save(); hg.translate(x, y); hg.rotate(a); hg.beginPath(); hg.moveTo(5 * dpr, 0); hg.lineTo(-3 * dpr, -4 * dpr); hg.lineTo(-3 * dpr, 4 * dpr); hg.closePath(); hg.fill(); hg.restore(); }
    // crosshair ticks at cardinal points
    hg.strokeStyle = c(0.7); hg.lineWidth = 1.4 * dpr; hg.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; hg.moveTo(hx + Math.cos(a) * (rO + 4 * dpr), hy + Math.sin(a) * (rO + 4 * dpr)); hg.lineTo(hx + Math.cos(a) * (rO + 16 * dpr), hy + Math.sin(a) * (rO + 16 * dpr)); }
    hg.stroke();

    // 8 tilted 3D orbitals with travelling nodes
    for (let k = 0; k < 2; k++) {
      const tilt = (k ? -0.42 : 0.42) + Math.sin(t * 0.2 + k) * 0.05, rx = R * (1.9 - k * 0.2), ry = R * 0.3;
      hg.strokeStyle = c(0.22); hg.lineWidth = 1 * dpr; hg.beginPath(); hg.ellipse(hx, hy, rx, ry, tilt, 0, TAU); hg.stroke();
      const a = t * (0.5 + k * 0.25) * spin + k * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      const x = hx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = hy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      const front = Math.sin(a) > 0;
      hg.fillStyle = k ? am(front ? 0.95 : 0.35) : c(front ? 0.95 : 0.35); hg.beginPath(); hg.arc(x, y, (front ? 3.2 : 2) * dpr, 0, TAU); hg.fill();
    }

    // 9 side data: hex stream (left) and level bars (right)
    if (!small) {
      if ((hexT += 1) % 9 === 0) { hexRows.shift(); hexRows.push(hex()); }
      hg.font = `${9 * dpr}px "Share Tech Mono", monospace`; hg.textAlign = 'right'; hg.textBaseline = 'alphabetic';
      const lx = hx - rO - 26 * dpr, ly = hy + R * 0.2;
      hexRows.forEach((h, i) => { hg.fillStyle = c(0.15 + i * 0.07); hg.fillText('0x' + h, lx, ly + i * 12 * dpr); });
      const rx = hx + rO + 26 * dpr;
      for (let i = 0; i < 6; i++) { const v = Math.min(1, spec[i * 17] * 1.2); hg.fillStyle = c(0.12); hg.fillRect(rx, ly + i * 12 * dpr - 7 * dpr, 70 * dpr, 6 * dpr); hg.fillStyle = i % 3 === 2 ? am(0.75) : c(0.7); hg.fillRect(rx, ly + i * 12 * dpr - 7 * dpr, 70 * dpr * v, 6 * dpr); }
      hg.textAlign = 'left'; hg.fillStyle = c(0.7);
      const st = { idle: 'BEKLEMEDE', starting: 'BAŞLATIYOR', listening: 'DİNLİYOR', thinking: 'ANALİZ', speaking: 'YANITLIYOR', error: 'HATA' }[ph] || ph;
      [`DURUM  ${st}`, `SES    ${String(Math.round(level * 100)).padStart(3, '0')}`, `YAW    ${(Math.sin(t * 0.22) * 20).toFixed(1)}°`, `NOKTA  ${pts.length}`].forEach((s, i) => hg.fillText(s, rx, hy - R * 0.75 + i * 13 * dpr));
      hg.textAlign = 'right';
      ['ÇEKİRDEK ' + (60 + Math.round(level * 40)) + '%', 'TARAMA ' + String(Math.round(((t * 0.3) % 1.4) / 1.4 * 100)).padStart(3, '0') + '%', 'BAĞ ' + (navigator.onLine ? 'ÇEVRİMİÇİ' : 'YOK')].forEach((s, i) => hg.fillText(s, lx, hy - R * 0.75 + i * 13 * dpr));
    }
    hg.restore();
    // chest core halo
    const [cx, cy] = toPx(0, 0.3);
    const grad = hg.createRadialGradient(cx, cy, 0, cx, cy, R * (0.55 + level * 0.4));
    grad.addColorStop(0, 'rgba(255,200,120,' + (0.18 + level * 0.25) + ')'); grad.addColorStop(1, 'rgba(255,200,120,0)');
    hg.fillStyle = grad; hg.beginPath(); hg.arc(cx, cy, R * (0.55 + level * 0.4), 0, Math.PI * 2); hg.fill();
  }

  function fallback2D() {
    // Simple 2D projection of the same points if WebGL is unavailable.
    const g = canvas.getContext('2d'); if (!g) return;
    const sample = pts.filter((_, i) => i % 3 === 0);
    function resize2() { dpr = Math.min(1.5, devicePixelRatio || 1); W = canvas.width = hud.width = innerWidth * dpr; H = canvas.height = hud.height = innerHeight * dpr; }
    addEventListener('resize', resize2); resize2();
    (function loop() {
      requestAnimationFrame(loop); if (document.hidden) return;
      t += 0.016; g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
      const yaw = Math.sin(t * 0.22) * 0.5, c = Math.cos(yaw), s = Math.sin(yaw), scale = Math.min(W, H) * 0.42;
      g.fillStyle = getPhase() === 'listening' ? 'rgba(255,180,80,.5)' : 'rgba(87,211,255,.45)';
      for (const p of sample) { const rx = p[0] * c + p[2] * s, rz = -p[0] * s + p[2] * c, k = 2.6 / (2.6 - rz); g.fillRect(W / 2 + rx * k * scale, H * 0.45 - (p[1] - 0.62) * k * scale, 1.5 * dpr, 1.5 * dpr); }
    })();
  }

  requestAnimationFrame(frame);
})();
