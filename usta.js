'use strict';
/* SATÜRN 34 — TASARIM USTASI
 *  1) TASARIM EĞİTİMİ: yapay zekâya profesyonel tasarım bilgisi — tipografi ölçeği, 8’lik ızgara, kenar boşlukları, 60-30-10 renk kuralı,
 *     WCAG kontrastı, görsel hiyerarşi, odak noktası, format başına düzen kalıpları
 *  2) TASARIM ELEŞTİRMENİ (her tasarımda otomatik): taşan yazı, üst üste binen metin, düşük kontrast (gerçek piksel ölçümüyle), küçük yazı,
 *     kenara yapışık öğe → yerelde düzeltir; düzeltilemeyen çakışma varsa yapay zekâya sorun listesiyle bir tur revizyon yaptırır; 100 üzerinden puan
 *  3) HAZIR ŞABLONLAR (kotasız, her zaman kusursuz ölçü): bilgi kartı, kampanya, söz, istatistik, egzersiz adımları, duyuru
 *     “şablon bilgi: Bel ağrısına 4 öneri | Uzun süre oturmayın | …” ya da “hazır tasarım: diz ağrısı için 4 öneri” (metni yapay zekâ yazar)
 *  4) ÜRÜN / MAKİNE TASARIMI: “egzersiz bisikleti için ayarlı pedal aparatı tasarla” → teknik çizim (ön + yan görünüş, ölçü çizgileri,
 *     parça balonları), parça listesi (malzeme, ölçü, adet), antet; çalışma prensibi, hesaplar, üretim adımları, maliyet, güvenlik + konsept görsel */
(() => {
  const ST = () => window.jarvisStage;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";
  const brand = () => ({ ad: opt('brandName') || 'FİZYOVİTA', alt: opt('brandSub') || 'Fizik Tedavi ve Rehabilitasyon Merkezi · Cizre', renk: (opt('brandColors') || '#0e7c86, #0b2530, #f5a623, #ffffff').split(/\s*,\s*/), iletisim: opt('brandContact') || '' });
  const jsonOf = t => { try { return JSON.parse((String(t).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch { return null; } };

  /* ================= 1) TASARIM EĞİTİMİ ================= */
  const LAYOUT = {
    'Instagram gönderisi': 'Üstte marka yazı-logosu (küçük), ortada tek güçlü fikir; başlık en fazla 2 satır; en fazla 4 madde; altta iletişim şeridi. Sosyal medya için toplam ≤ 45 kelime.',
    'Instagram hikâyesi': 'Üst ve alt %12’lik alanı boş bırak (uygulama arayüzü); içerik dikey akış; başlık ekranın üst üçte birinde; büyük harf boyutları.',
    'Afiş': 'Uzaktan okunur: başlık genişliğin %70’ini kaplasın; tek odak görseli; bilgi blokları (ne, ne zaman, nerede) ızgarada; alt bantta iletişim.',
    'İnfografik': 'Başlık + kısa giriş; 3–6 bölüm, her bölüm ikon + kısa başlık + 1–2 satır; numaralı akış veya ızgara; kaynak satırı en altta küçük.',
    'Sunum slaytı': '16:9; sol üstte başlık; tek mesaj; en fazla 3 madde ya da 1 görsel/grafik; bol boşluk; slayt numarası/marka altta küçük.',
    'Akış şeması / diyagram': 'Akış soldan sağa ya da yukarıdan aşağıya; aynı türdeki kutular aynı boyut ve renkte; oklar kesişmesin; karar kutusu eşkenar dörtgen; kutular arası eşit aralık.',
    'Egzersiz kartı': 'Başlık + amaç; 3–5 adım, her adımda numara, sade figür/ikon, tekrar/set; altta güvenlik uyarısı (“ağrı artarsa durun”).',
    'Logo taslağı': 'Basit, ölçeklenebilir tek simge + yazı; 2 renk; küçük boyutta da okunur; ince detay yok; simge ve yazı dengeli.',
    'YouTube kapak': 'En fazla 4–5 kelime, çok büyük ve kalın; güçlü kontrast; tek yüz/nesne odağı; sağ alt köşe süre etiketi için boş kalsın.'
  };
  window.jarvisDesignRules = (fmt, W, H) => {
    const u = Math.round(W / 135) * 1; // ~8 px (1080 için)
    return `\nPROFESYONEL TASARIM EĞİTİMİ (kesin uygula):
- IZGARA: ${u}px temel birim; tüm konum/aralıklar bunun katı. Dış kenar boşluğu en az ${Math.round(W * 0.07)}px; hiçbir metin/öğe bu boşluğa girmesin. 12 sütun düşün, öğeleri sütunlara hizala.
- TİPOGRAFİ ÖLÇEĞİ (1.25–1.33 oranlı): başlık ${Math.round(W * 0.067)}–${Math.round(W * 0.089)}px kalın (700–800), alt başlık ${Math.round(W * 0.037)}–${Math.round(W * 0.044)}px (600), gövde ${Math.round(W * 0.026)}–${Math.round(W * 0.03)}px (400–500), not ${Math.round(W * 0.02)}px. Gövde metni ${Math.round(W * 0.02)}px’ten küçük OLMASIN. Satır aralığı gövdede 1.35–1.5×, başlıkta 1.1×. Başlıkta harf aralığı hafif negatif (letter-spacing="-1").
- HİYERARŞİ: göz önce başlığa, sonra ana görsele/rakama, sonra maddelere gitsin. Tek bir odak noktası olsun. Aynı önemdeki öğeler aynı stilde.
- RENK: 60-30-10 kuralı (baskın zemin %60, ikincil %30, vurgu rengi %10 — yalnız önemli yerde). Koyu zeminde açık metin, açık zeminde koyu metin. Metin/zemin kontrastı en az 4.5:1 (büyük başlık 3:1). Gradyan kullanacaksan aynı ton ailesinde, yumuşak.
- METİN: her satır en fazla ~${Math.round(W / 30)} karakter; uzun satırı <tspan x=".." dy=".."> ile böl; metin kutusu ile kenar arasında en az ${u * 3}px pay bırak. Metinler birbirinin üstüne BİNMESİN — her blok için y konumlarını satır sayısı × satır yüksekliği ile hesapla.
- ŞEKİL: köşe yarıçapı tutarlı (${u * 2}–${u * 3}px); ikonlar aynı çizgi kalınlığında (stroke-width 3–4) ve aynı boyutta; gölge gerekirse çok hafif (filter ile, opaklık ≤ 0.15).
- BOŞLUK: tasarımın en az %30’u boş alan; kalabalık yerine az ve net.
- DÜZEN (${fmt}): ${LAYOUT[fmt] || 'tek net mesaj, güçlü başlık, düzenli ızgara.'}
- Son kontrol (içinden yap): taşan metin yok, çakışma yok, kontrast yeterli, hizalar tutarlı, yazım hatası yok.`;
  };

  /* ================= 2) TASARIM ELEŞTİRMENİ ================= */
  const rgbOf = c => { const m = String(c).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/); if (m) return [+m[1], +m[2], +m[3]]; const h = String(c).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!h) return null; let x = h[1]; if (x.length === 3) x = [...x].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  function mount(svg, W, H) {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-${W + 5000}px;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none;opacity:0`;
    host.innerHTML = svg; document.body.append(host);
    const root = host.querySelector('svg'); root.setAttribute('width', W); root.setAttribute('height', H); root.style.width = W + 'px'; root.style.height = H + 'px';
    return { host, root };
  }
  async function bgPixels(svg, W, H) { // metinsiz hâli çizip zemini piksel olarak oku
    const noText = svg.replace(/<text[\s\S]*?<\/text>/gi, '');
    const im = new Image(); await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = svgUrl(noText); });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(im, 0, 0, W, H);
    return (x, y, w, h) => { x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y)); w = Math.max(1, Math.min(W - x, Math.ceil(w))); h = Math.max(1, Math.min(H - y, Math.ceil(h))); const d = g.getImageData(x, y, w, h).data; const step = Math.max(4, Math.floor(d.length / 4 / 400)) * 4; const px = []; for (let i = 0; i < d.length; i += step) px.push([d[i], d[i + 1], d[i + 2]]); return px; };
  }
  function measure(root, W, H) {
    const rr = root.getBoundingClientRect(), kx = W / rr.width, ky = H / rr.height;
    return [...root.querySelectorAll('text')].filter(t => t.textContent.trim()).map(t => { const r = t.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(t).fontSize) * kx; return { t, x: (r.left - rr.left) * kx, y: (r.top - rr.top) * ky, w: r.width * kx, h: r.height * ky, fs, bold: +getComputedStyle(t).fontWeight >= 600 }; }).filter(b => b.w > 0 && b.h > 0);
  }
  const setFill = (t, c) => { t.setAttribute('fill', c); t.style.fill = c; for (const s of t.querySelectorAll('tspan')) { if (s.getAttribute('fill') || s.style.fill) { s.setAttribute('fill', c); s.style.fill = c; } } };
  const scaleFont = (t, k) => { for (const n of [t, ...t.querySelectorAll('tspan')]) { const a = n.getAttribute('font-size'); if (a) n.setAttribute('font-size', (parseFloat(a) * k).toFixed(1)); if (n.style.fontSize) n.style.fontSize = (parseFloat(n.style.fontSize) * k).toFixed(1) + 'px'; } if (!t.getAttribute('font-size') && !t.style.fontSize) t.setAttribute('font-size', (parseFloat(getComputedStyle(t).fontSize) * k).toFixed(1)); for (const s of t.querySelectorAll('tspan[dy]')) { const dy = s.getAttribute('dy'); if (/^-?[\d.]+$/.test(dy)) s.setAttribute('dy', (parseFloat(dy) * k).toFixed(1)); } };
  async function audit(svg, W, H, { fix = true, darkC = '#0b2530' } = {}) {
    const { host, root } = mount(svg, W, H); const issues = [], fixed = [];
    try {
      const M = W * 0.03;
      // taşma → yazıyı küçült
      for (const b of measure(root, W, H)) {
        const over = b.x < -1 || b.x + b.w > W + 1 || b.y < -1 || b.y + b.h > H + 1;
        if (over) {
          if (fix) { const k = Math.max(0.45, Math.min((W - 2 * M) / b.w, b.x < 0 || b.x + b.w > W ? (W - 2 * M) / b.w : 1, b.y + b.h > H || b.y < 0 ? (H - 2 * M) / b.h : 1) * 0.97); if (k < 1) { scaleFont(b.t, k); fixed.push(`taşan yazı küçültüldü: “${short(b.t.textContent.trim(), 30)}”`); } }
          else issues.push({ k: 'taşma', s: 15, m: `“${short(b.t.textContent.trim(), 30)}” kenvastan taşıyor` });
        }
      }
      let B = measure(root, W, H);
      for (const b of B) { if (b.x < -1 || b.x + b.w > W + 1 || b.y < -1 || b.y + b.h > H + 1) issues.push({ k: 'taşma', s: 15, m: `“${short(b.t.textContent.trim(), 30)}” hâlâ taşıyor` }); else if (b.x < M * 0.5 || b.x + b.w > W - M * 0.5) issues.push({ k: 'kenar', s: 2, m: `“${short(b.t.textContent.trim(), 24)}” kenara çok yakın` }); }
      // küçük yazı
      const small = B.filter(b => b.fs < W / 60 && b.t.textContent.trim().length > 3); if (small.length) issues.push({ k: 'küçük', s: Math.min(9, small.length * 3), m: `${small.length} metin çok küçük (${Math.round(Math.min(...small.map(b => b.fs)))}px)` });
      // çakışma
      const ov = []; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], c = B[j]; if (a.t.contains(c.t) || c.t.contains(a.t)) continue; const ix = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)), iy = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)); if (ix * iy > 0.18 * Math.min(a.w * a.h, c.w * c.h)) ov.push([a, c]); }
      for (const [a, c] of ov.slice(0, 4)) issues.push({ k: 'çakışma', s: 10, m: `“${short(a.t.textContent.trim(), 22)}” ile “${short(c.t.textContent.trim(), 22)}” üst üste biniyor` });
      // kontrast (gerçek piksel)
      let px = null; try { px = await bgPixels(new XMLSerializer().serializeToString(root), W, H); } catch {}
      if (px) for (const b of B) {
        const fc = rgbOf(getComputedStyle(b.t).fill); if (!fc) continue;
        const P = px(b.x, b.y, b.w, b.h); if (!P.length) continue;
        const worst = P.map(p => contrast(fc, p)).sort((x, y) => x - y)[Math.floor(P.length * 0.2)]; // en kötü %20’lik dilim
        const need = b.fs >= W * 0.035 || (b.bold && b.fs >= W * 0.026) ? 3 : 4.5;
        if (worst < need) {
          if (fix) { const avg = P.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / P.length); const cand = ['#ffffff', darkC, '#000000'].map(c => [c, contrast(rgbOf(c), avg)]).sort((x, y) => y[1] - x[1])[0]; if (cand[1] > worst + 0.5) { setFill(b.t, cand[0]); fixed.push(`kontrast düzeltildi: “${short(b.t.textContent.trim(), 26)}” (${worst.toFixed(1)} → ${cand[1].toFixed(1)}:1)`); continue; } }
          issues.push({ k: 'kontrast', s: 8, m: `“${short(b.t.textContent.trim(), 26)}” zor okunuyor (kontrast ${worst.toFixed(1)}:1)` });
        }
      }
      const out = new XMLSerializer().serializeToString(root);
      const score = Math.max(0, 100 - issues.reduce((a, i) => a + i.s, 0));
      return { svg: out, score, issues, fixed };
    } finally { host.remove(); }
  }
  async function aiRevise(svg, issues, ctx) {
    const sys = `Sen titiz bir kıdemli grafik tasarımcısın. Sana bir SVG tasarım ve otomatik kalite kontrolünün bulduğu sorunlar verilecek. Tasarımın fikrini, metnini ve renklerini koru; YALNIZ sorunları düzelt (konumları/satır kırılımlarını/boyutları yeniden hesapla). Yalnız TAM SVG döndür, açıklama yok.` + (window.jarvisDesignRules?.(ctx.fmt, ctx.W, ctx.H) || '');
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier: 'complex', system: sys, maxTokens: 24000, messages: [{ role: 'user', content: `SORUNLAR:\n- ${issues.map(i => i.m).join('\n- ')}\n\nSVG:\n${svg.replace(/data:image\/[^"']+/g, '{{FOTO}}').slice(0, 30000)}` }] }) });
    if (!r.ok) throw Error('revizyon yok');
    const txt = (await r.text()).replace(/\u0000[^\n]*\n?/g, '');
    let out = ST().sanitize(txt);
    const photo = (svg.match(/data:image\/[^"']+/) || [])[0]; if (photo) out = out.split('{{FOTO}}').join(photo); else out = out.replace(/<image[^>]*\{\{FOTO\}\}[^>]*\/?>(<\/image>)?/g, '');
    return out;
  }
  const qaLine = r => `✓ Kalite kontrolü: ${r.score}/100${r.fixed.length ? ` · ${r.fixed.length} sorun kendiliğinden düzeltildi` : ''}${r.issues.length ? ` · kalan: ${r.issues.slice(0, 3).map(i => i.m).join('; ')}` : ' · taşma, çakışma, kontrast sorunu yok'}`;
  window.jarvisDesignQA = async (svg, ctx) => {
    const dark = ctx.brand?.renk?.split?.(/\s*,\s*/)?.[1] || '#0b2530';
    let r = await audit(svg, ctx.W, ctx.H, { darkC: dark });
    if (r.issues.some(i => i.k === 'çakışma' || i.k === 'taşma') && !window.jarvisUltra?.guest?.()) {
      try { setPhase('thinking', 'Kalite kontrolü sorun buldu — tasarımcı düzeltiyor…'); const s2 = await aiRevise(r.svg, r.issues, ctx); const r2 = await audit(s2, ctx.W, ctx.H, { darkC: dark }); if (r2.score > r.score) { r2.fixed.unshift('yapay zekâ revizyonu: ' + r.issues.filter(i => i.s >= 10).length + ' çakışma/taşma giderildi'); r = r2; } } catch {}
    }
    return { svg: r.svg, report: qaLine(r), score: r.score };
  };

  /* ================= 3) HAZIR ŞABLONLAR ================= */
  const cv = document.createElement('canvas').getContext('2d');
  function wrap(text, size, weight, maxW, maxLines) {
    cv.font = `${weight} ${size}px Inter, 'Segoe UI', Roboto, Arial, sans-serif`;
    const words = String(text).split(/\s+/).filter(Boolean), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cv.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    return lines.length > maxLines ? null : lines;
  }
  function fit(text, size, weight, maxW, maxLines, min = 0.55) { for (let s = size; s >= size * min; s -= Math.max(1, size * 0.04)) { const L = wrap(text, Math.round(s), weight, maxW, maxLines); if (L) return { size: Math.round(s), lines: L }; } const s = Math.round(size * min); return { size: s, lines: (wrap(text, s, weight, maxW, 99) || [text]).slice(0, maxLines) }; }
  const tx = (x, y, f, weight, color, anchor = 'start', extra = '') => f.lines.map((l, i) => `<text x="${x}" y="${Math.round(y + i * f.size * (weight >= 700 ? 1.12 : 1.4))}" font-family="${FONT}" font-size="${f.size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${weight >= 700 ? ' letter-spacing="-1"' : ''} ${extra}>${esc(l)}</text>`).join('');
  const hgt = (f, weight) => f.lines.length * f.size * (weight >= 700 ? 1.12 : 1.4);
  function shell(W, H, inner, b, { bg = 'dark' } = {}) {
    const [c1, c2, c3] = b.renk, dark = bg === 'dark';
    const bgFill = dark ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}" stop-opacity=".92"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="${W * 0.92}" cy="${H * 0.06}" r="${W * 0.28}" fill="${c3}" opacity=".10"/><circle cx="${W * 0.04}" cy="${H * 0.97}" r="${W * 0.22}" fill="#ffffff" opacity=".05"/>` : `<rect width="${W}" height="${H}" fill="#f7f9fa"/><rect width="${W}" height="${H * 0.012}" fill="${c1}"/>`;
    const fg = dark ? '#ffffff' : c2, M = Math.round(W * 0.074);
    const top = `<text x="${M}" y="${M + W * 0.03}" font-family="${FONT}" font-size="${Math.round(W * 0.03)}" font-weight="800" letter-spacing="3" fill="${dark ? '#ffffff' : c1}">${esc(b.ad)}</text><rect x="${M}" y="${M + W * 0.045}" width="${W * 0.06}" height="${Math.max(4, W * 0.005)}" rx="2" fill="${c3}"/>`;
    const foot = `<line x1="${M}" x2="${W - M}" y1="${H - M - W * 0.045}" y2="${H - M - W * 0.045}" stroke="${fg}" stroke-opacity=".18" stroke-width="2"/>` + tx(M, H - M, fit(b.alt + (b.iletisim ? ' · ' + b.iletisim : ''), Math.round(W * 0.021), 500, W - 2 * M, 1), 500, fg, 'start', 'opacity=".8"');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bgFill}${top}${inner}${foot}</svg>`;
  }
  const TPL = {
    bilgi(d, W, H, b) { const M = Math.round(W * 0.074), cw = W - 2 * M, sq = H / W < 1.15, n = (d.maddeler || []).length; let y = M + W * (sq ? 0.15 : 0.17); const T = fit(d.baslik, W * (sq && n > 3 ? 0.07 : 0.083), 800, cw, sq ? 2 : 3); let s = tx(M, y, T, 800, '#ffffff'); y += hgt(T, 800) + W * 0.01;
      if (d.alt && !(sq && n > 4)) { const A = fit(d.alt, W * 0.03, 500, cw, sq ? 1 : 2); s += tx(M, y, A, 500, '#ffffff', 'start', 'opacity=".85"'); y += hgt(A, 500) + W * 0.03; }
      const items = (d.maddeler || []).slice(0, 5), avail = H - M - W * 0.1 - y, gap = W * (sq ? 0.016 : 0.025), ch = Math.min(W * 0.15, (avail - gap * (items.length - 1)) / Math.max(1, items.length)); y += Math.max(0, (avail - items.length * ch - gap * (items.length - 1)) / 2);
      items.forEach((m, i) => { const yy = y + i * (ch + gap), r = ch * 0.28, F = fit(m, Math.min(W * 0.036, ch * 0.4), 600, cw - ch * 0.9 - W * 0.04, 2); s += `<rect x="${M}" y="${yy}" width="${cw}" height="${ch}" rx="${W * 0.022}" fill="#ffffff" opacity=".11"/><circle cx="${M + ch * 0.45}" cy="${yy + ch / 2}" r="${r}" fill="${b.renk[2]}"/><text x="${M + ch * 0.45}" y="${yy + ch / 2 + r * 0.38}" font-family="${FONT}" font-size="${Math.round(r * 1.05)}" font-weight="800" fill="${b.renk[1]}" text-anchor="middle">${i + 1}</text>` + tx(M + ch * 0.9 + W * 0.01, yy + ch / 2 - hgt(F, 600) / 2 + F.size * 0.95, F, 600, '#ffffff'); });
      return shell(W, H, s, b); },
    egzersiz(d, W, H, b) { const out = TPL.bilgi({ ...d, maddeler: (d.maddeler || []).slice(0, 5) }, W, H, b); const M = Math.round(W * 0.074); return out.replace('</svg>', `<text x="${W - M}" y="${M + W * 0.03}" font-family="${FONT}" font-size="${Math.round(W * 0.022)}" font-weight="600" fill="#ffffff" text-anchor="end" opacity=".85">${esc(d.not || 'Ağrı artarsa egzersizi bırakın')}</text></svg>`); },
    kampanya(d, W, H, b) { const M = Math.round(W * 0.074), cw = W - 2 * M; let y = M + W * 0.2; const T = fit(d.baslik, W * 0.095, 800, cw, 3); let s = tx(M, y, T, 800, '#ffffff'); y += hgt(T, 800) + W * 0.04;
      const by = H - M - W * 0.2, room = by - W * 0.04 - y;
      if (d.vurgu) { const R = Math.min(W * 0.17, room / 2 - W * 0.01), cx = W - M - R, cy = y + R; const V = fit(d.vurgu, R * 0.34, 800, R * 1.45, 2); s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${b.renk[2]}"/>` + tx(cx, cy - hgt(V, 800) / 2 + V.size * 0.9, V, 800, b.renk[1], 'middle'); }
      if (d.alt) { const A = fit(d.alt, W * 0.036, 500, d.vurgu ? cw - W * 0.4 : cw, 5); s += tx(M, y + A.size, A, 500, '#ffffff', 'start', 'opacity=".9"'); }
      const Bt = fit(d.cta || 'Randevu için bize yazın', W * 0.036, 700, cw - W * 0.1, 1); s += `<rect x="${M}" y="${by}" width="${cw}" height="${W * 0.1}" rx="${W * 0.05}" fill="#ffffff"/>` + tx(W / 2, by + W * 0.05 + Bt.size * 0.36, Bt, 700, b.renk[1], 'middle');
      return shell(W, H, s, b); },
    soz(d, W, H, b) { const M = Math.round(W * 0.074), cw = W - 2 * M; const Q = fit(d.baslik, W * 0.065, 700, cw * 0.92, 6); const h = hgt(Q, 700), y = H / 2 - h / 2 + Q.size * 0.8;
      let s = `<text x="${M}" y="${y - Q.size * 0.6}" font-family="Georgia, serif" font-size="${Math.round(W * 0.2)}" font-weight="700" fill="${b.renk[2]}" opacity=".9">“</text>` + tx(W / 2, y, Q, 700, '#ffffff', 'middle');
      if (d.alt) s += tx(W / 2, y + h + W * 0.03, fit('— ' + d.alt, W * 0.03, 500, cw, 1), 500, b.renk[2], 'middle'); return shell(W, H, s, b); },
    istatistik(d, W, H, b) { const M = Math.round(W * 0.074), cw = W - 2 * M; const N = fit(d.vurgu || '%', W * 0.27, 800, cw, 1); let y = H * 0.42; let s = tx(W / 2, y, N, 800, b.renk[2], 'middle');
      const T = fit(d.baslik, W * 0.055, 700, cw, 3); y += N.size * 0.22 + W * 0.04 + T.size; s += tx(W / 2, y, T, 700, '#ffffff', 'middle'); y += hgt(T, 700) + W * 0.03; if (d.alt) s += tx(W / 2, y, fit(d.alt, W * 0.03, 500, cw, 4), 500, '#ffffff', 'middle', 'opacity=".85"');
      if (d.kaynak) s += tx(W / 2, H - M - W * 0.08, fit('Kaynak: ' + d.kaynak, W * 0.02, 500, cw, 1), 500, '#ffffff', 'middle', 'opacity=".6"'); return shell(W, H, s, b); },
    duyuru(d, W, H, b) { const M = Math.round(W * 0.074), cw = W - 2 * M; let y = M + W * 0.24; const tag = fit(d.etiket || 'DUYURU', W * 0.026, 800, cw, 1); let s = `<rect x="${M}" y="${y - W * 0.055}" width="${cv.measureText(tag.lines[0]).width + W * 0.06}" height="${W * 0.06}" rx="${W * 0.03}" fill="${b.renk[0]}"/>` + tx(M + W * 0.03, y - W * 0.016, tag, 800, '#ffffff', 'start', 'letter-spacing="2"'); y += W * 0.08;
      const T = fit(d.baslik, W * 0.08, 800, cw, 3); s += tx(M, y, T, 800, b.renk[1]); y += hgt(T, 800) + W * 0.03; if (d.vurgu) { const V = fit(d.vurgu, W * 0.045, 700, cw, 2); s += tx(M, y, V, 700, b.renk[0]); y += hgt(V, 700) + W * 0.03; }
      if (d.alt) s += tx(M, y, fit(d.alt, W * 0.032, 500, cw, 7), 500, b.renk[1], 'start', 'opacity=".85"'); return shell(W, H, s, b, { bg: 'light' }); }
  };
  const TPL_TR = { bilgi: 'Bilgi kartı', egzersiz: 'Egzersiz adımları', kampanya: 'Kampanya', soz: 'Söz / alıntı', istatistik: 'İstatistik', duyuru: 'Duyuru' };
  const tplOf = f => /egzersiz|hareket|adim/.test(f) ? 'egzersiz' : /kampanya|indirim|firsat|ozel teklif/.test(f) ? 'kampanya' : /soz|alinti|motivasyon/.test(f) ? 'soz' : /istatistik|rakam|yuzde|%/.test(f) ? 'istatistik' : /duyuru|kapali|tatil|ilan|haber/.test(f) ? 'duyuru' : 'bilgi';
  async function template(kind, data, fmt = 'gonderi') {
    const [, W, H] = ST()?.FORMATS?.[fmt] || [0, 1080, 1350], b = brand();
    let svg = TPL[kind](data, W, H, b);
    const r = await audit(svg, W, H, { darkC: b.renk[1] }); svg = r.svg;
    const rec = { id: uid('ds'), t: Date.now(), request: `${TPL_TR[kind]}: ${data.baslik}`, format: fmt, svg, photo: '', qa: qaLine(r) };
    const D = ST().designs(); D.unshift(rec); try { store.set('designs', D.slice(0, 12)); } catch {}
    ST().showDesign(rec); return rec;
  }
  async function smartTemplate(text, fmt, forced) { const { kind, d } = await dataOf(text, forced); return template(kind, d, fmt); }
  async function dataOf(text, forced) {
    const f = fold(text), kind = TPL[forced] ? forced : tplOf(f);
    const parts = text.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) { const [baslik, ...rest] = parts; const d = { baslik }; if (kind === 'bilgi' || kind === 'egzersiz') d.maddeler = rest; else { d.alt = rest[0]; d.vurgu = rest[1]; d.cta = rest[2]; } if (kind === 'istatistik') { d.vurgu = rest[0]; d.alt = rest[1]; d.kaynak = rest[2]; } if (kind === 'soz') { d.alt = rest[0]; } return { kind, d }; }
    setPhase('thinking', 'Tasarım metnini yazıyorum…');
    const sys = `Sosyal medya için kısa, doğru ve etkili Türkçe metin yazarı ve fizyoterapi uzmanısın. ${brand().ad} için. Yalnız JSON döndür: {"baslik":"≤ 8 kelime","alt":"≤ 14 kelime","maddeler":["her biri ≤ 9 kelime", 3-5 adet],"vurgu":"kısa vurgu (ör. %20, ÜCRETSİZ, 3 dk) veya boş","cta":"≤ 6 kelime","etiket":"tek kelime (DUYURU/YENİ/ÖNEMLİ)"}. Tıbbi iddia uydurma; abartısız ve güvenli bilgi ver.`;
    try { const d = jsonOf(await window.jarvisResearch.ask(sys, `Şablon türü: ${TPL_TR[kind]}. Konu: ${text}`, 'default')); if (!d?.baslik) throw Error('metin gelmedi'); return { kind, d }; }
    finally { setPhase('idle', 'Hazır.'); }
  }

  /* ================= 4) ÜRÜN / MAKİNE TASARIMI ================= */
  const ENG_SYS = `Sen deneyimli bir makine mühendisi ve endüstriyel ürün tasarımcısısın (fizik tedavi ekipmanı, klinik mobilyası, cihaz aparatı, ev/atölye düzenekleri). İstenen ürünü üretilebilir, güvenli ve ölçülü biçimde tasarla.
Silah, patlayıcı, zarar vermek ya da güvenlik sistemlerini aşmak için düzenek İSTENİRSE yalnız {"red":"kısa neden"} döndür.
Yalnız JSON döndür (açıklama yok), birimler mm/kg/N/TL:
{"ad":"ürün adı","amac":"1-2 cümle","prensip":"çalışma prensibi 2-4 cümle","olcu":{"g":genişlik,"y":yükseklik,"d":derinlik},
"parcalar":[{"no":1,"ad":"..","malzeme":"..","olcu":"..","adet":1,"not":".."}] (4-12 parça),
"on":[ön görünüş şekilleri, mm cinsinden, sol-alt köşe 0,0, y yukarı: {"t":"rect","x":..,"y":..,"w":..,"h":..,"p":parça no} | {"t":"circle","x":merkez,"y":..,"r":..,"p":no} | {"t":"line","x1":..,"y1":..,"x2":..,"y2":..,"p":no}],
"yan":[yan görünüş için aynı biçim (x yerine derinlik)],
"hesaplar":[{"ad":"..","formul":"..","sonuc":".."}] (yük, moment, devir, güvenlik katsayısı vb. 2-5 adet, gerçekçi),
"uretim":["adım", 4-8 adım],"maliyet":"yaklaşık TL aralığı ve kalemler","guvenlik":["..", 2-5 madde],"gelistirme":["sonraki sürüm fikri", 2-3],
"gorsel":"İngilizce fotoğraf-gerçekçi ürün konsept render istemi (studio, white background, product shot)"}
Şekiller gerçek oranlı olsun, toplam ölçülerle tutarlı, parçalar birbirine temas etsin (havada parça yok).`;
  function drawView(shapes, ox, oy, bw, bh, sizeW, sizeH, label) { // mm → px, ölçü çizgileri
    const k = Math.min((bw - 200) / Math.max(1, sizeW), (bh - 110) / Math.max(1, sizeH)), X = v => ox + (bw - sizeW * k) / 2 + v * k, Y = v => oy + bh - (bh - sizeH * k) / 2 - v * k;
    let s = '', balloons = new Map();
    for (const g of shapes || []) {
      if (g.t === 'rect') { s += `<rect x="${X(g.x)}" y="${Y(g.y + g.h)}" width="${g.w * k}" height="${g.h * k}" fill="#eef3f5" stroke="#0b2530" stroke-width="2"/>`; if (g.p && !balloons.has(g.p)) balloons.set(g.p, [X(g.x + g.w / 2), Y(g.y + g.h / 2)]); }
      else if (g.t === 'circle') { s += `<circle cx="${X(g.x)}" cy="${Y(g.y)}" r="${g.r * k}" fill="#eef3f5" stroke="#0b2530" stroke-width="2"/><line x1="${X(g.x) - g.r * k - 6}" x2="${X(g.x) + g.r * k + 6}" y1="${Y(g.y)}" y2="${Y(g.y)}" stroke="#0e7c86" stroke-width="1" stroke-dasharray="10 4 2 4"/><line y1="${Y(g.y) - g.r * k - 6}" y2="${Y(g.y) + g.r * k + 6}" x1="${X(g.x)}" x2="${X(g.x)}" stroke="#0e7c86" stroke-width="1" stroke-dasharray="10 4 2 4"/>`; if (g.p && !balloons.has(g.p)) balloons.set(g.p, [X(g.x), Y(g.y)]); }
      else if (g.t === 'line') { s += `<line x1="${X(g.x1)}" y1="${Y(g.y1)}" x2="${X(g.x2)}" y2="${Y(g.y2)}" stroke="#0b2530" stroke-width="3" stroke-linecap="round"/>`; if (g.p && !balloons.has(g.p)) balloons.set(g.p, [(X(g.x1) + X(g.x2)) / 2, (Y(g.y1) + Y(g.y2)) / 2]); }
    }
    const x0 = X(0), x1 = X(sizeW), y0 = Y(0), y1 = Y(sizeH), dy = y0 + 34, dx = x0 - 34;
    s += `<g stroke="#5a6b73" stroke-width="1.4" fill="#5a6b73" font-family="${FONT}" font-size="15"><line x1="${x0}" x2="${x0}" y1="${y0 + 6}" y2="${dy + 8}"/><line x1="${x1}" x2="${x1}" y1="${y0 + 6}" y2="${dy + 8}"/><line x1="${x0}" x2="${x1}" y1="${dy}" y2="${dy}" marker-start="url(#ar)" marker-end="url(#ar)"/><text x="${(x0 + x1) / 2}" y="${dy - 7}" text-anchor="middle" stroke="none">${Math.round(sizeW)}</text>
<line y1="${y0}" y2="${y0}" x1="${x0 - 6}" x2="${dx - 8}"/><line y1="${y1}" y2="${y1}" x1="${x0 - 6}" x2="${dx - 8}"/><line y1="${y0}" y2="${y1}" x1="${dx}" x2="${dx}" marker-start="url(#ar)" marker-end="url(#ar)"/><text x="${dx - 8}" y="${(y0 + y1) / 2}" text-anchor="middle" stroke="none" transform="rotate(-90 ${dx - 8} ${(y0 + y1) / 2})">${Math.round(sizeH)}</text></g>`;
    const mid = ox + bw / 2, sides = { L: [], R: [] };
    for (const [p, [bx, by]] of balloons) sides[bx < mid ? 'L' : 'R'].push({ p, bx, by });
    for (const [k, arr] of Object.entries(sides)) { arr.sort((a, c) => a.by - c.by); let last = oy + 40; for (const o of arr) { o.ly = Math.max(o.by, last + 38); last = o.ly; } const over = last - (oy + bh - 60); if (over > 0) for (const o of arr) o.ly -= over; const lx = k === 'L' ? ox + 22 : ox + bw - 22;
      for (const o of arr) s += `<polyline points="${o.bx},${o.by} ${k === 'L' ? lx + 40 : lx - 40},${o.ly} ${k === 'L' ? lx + 15 : lx - 15},${o.ly}" fill="none" stroke="#f5a623" stroke-width="1.5"/><circle cx="${o.bx}" cy="${o.by}" r="3.5" fill="#f5a623"/><circle cx="${lx}" cy="${o.ly}" r="15" fill="#fff" stroke="#f5a623" stroke-width="2"/><text x="${lx}" y="${o.ly + 5}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="700" fill="#0b2530">${esc(o.p)}</text>`; }
    s += `<text x="${ox + 10}" y="${oy + 24}" font-family="${FONT}" font-size="16" font-weight="700" fill="#0e7c86" letter-spacing="2">${label}</text>`;
    return { s, scale: k };
  }
  function sheet(d) {
    const W = 1684, H = 1191, M = 30, b = brand();
    const o = d.olcu || {}, gw = +o.g || 500, gy = +o.y || 500, gd = +o.d || 400;
    const vw = 630, vh = H - 2 * M - 230;
    const fv = drawView(d.on, M + 10, M + 60, vw, vh, gw, gy, "ÖN GÖRÜNÜŞ"), sv = drawView(d.yan, M + 20 + vw, M + 60, vw * 0.68, vh, gd, gy, 'YAN GÖRÜNÜŞ');
    const scaleTxt = (() => { const r = 1 / (Math.min(fv.scale, sv.scale) * 420 / W); if (r < 0.9) return Math.round(1 / r) + ':1'; return '1:' + ([1, 2, 2.5, 5, 10, 20, 25, 50, 100].find(v => v >= r * 0.98) || Math.round(r)); })() + ' (A3)';
    // parça listesi
    const tx0 = M + 40 + vw * 1.68, tw = W - M - 14 - tx0; let rows = `<text x="${tx0}" y="${M + 84}" font-family="${FONT}" font-size="16" font-weight="700" fill="#0e7c86" letter-spacing="2">PARÇA LİSTESİ</text>`;
    const cols = [[0, 'No'], [32, 'Parça'], [tw * 0.4, 'Malzeme'], [tw * 0.7, 'Ölçü'], [tw - 46, 'Adet']];
    let y = M + 110; rows += `<rect x="${tx0}" y="${y - 20}" width="${tw}" height="28" fill="#0b2530"/>` + cols.map(([x, t]) => `<text x="${tx0 + x + 6}" y="${y}" font-family="${FONT}" font-size="13" font-weight="700" fill="#fff">${t}</text>`).join('');
    const clip = (s, px) => { cv.font = `13px ${FONT}`; let t = String(s ?? ''); while (t.length > 1 && cv.measureText(t).width > px) t = t.slice(0, -2); return t === String(s ?? '') ? t : t + '…'; };
    for (const [i, p] of (d.parcalar || []).slice(0, 16).entries()) { y += 30; rows += `<rect x="${tx0}" y="${y - 20}" width="${tw}" height="30" fill="${i % 2 ? '#ffffff' : '#f1f5f7'}"/>` + [p.no ?? i + 1, clip(p.ad, tw * 0.4 - 44), clip(p.malzeme, tw * 0.3 - 12), clip(p.olcu, tw * 0.3 - 58), p.adet ?? 1].map((v, j) => `<text x="${tx0 + cols[j][0] + 6}" y="${y}" font-family="${FONT}" font-size="13" fill="#0b2530">${esc(v)}</text>`).join(''); }
    rows += `<rect x="${tx0}" y="${M + 90}" width="${tw}" height="${y - M - 80}" fill="none" stroke="#0b2530" stroke-width="1.5"/>`;
    // notlar
    let ny = y + 50; rows += `<text x="${tx0}" y="${ny}" font-family="${FONT}" font-size="16" font-weight="700" fill="#0e7c86" letter-spacing="2">HESAPLAR</text>`;
    for (const h of (d.hesaplar || []).slice(0, 5)) { ny += 26; rows += `<text x="${tx0}" y="${ny}" font-family="${FONT}" font-size="13" fill="#0b2530"><tspan font-weight="700">${esc(clip(h.ad, 150))}: </tspan>${esc(clip(`${h.formul} = ${h.sonuc}`, tw - 160))}</text>`; }
    // antet
    const ty = H - M - 120, tbw = W - 2 * M;
    const cell = (x, w, lab, val, big) => `<rect x="${x}" y="${ty}" width="${w}" height="120" fill="#fff" stroke="#0b2530" stroke-width="1.5"/><text x="${x + 12}" y="${ty + 24}" font-family="${FONT}" font-size="12" fill="#5a6b73" letter-spacing="1.5">${lab}</text><text x="${x + 12}" y="${ty + (big ? 76 : 70)}" font-family="${FONT}" font-size="${big ? 30 : 18}" font-weight="700" fill="#0b2530">${esc(clip(val, w - 24))}</text>`;
    const tb = cell(M, tbw * 0.42, 'ÜRÜN', d.ad, true) + cell(M + tbw * 0.42, tbw * 0.16, 'GENEL ÖLÇÜ (mm)', `${gw} × ${gy} × ${gd}`) + cell(M + tbw * 0.58, tbw * 0.1, 'ÖLÇEK', scaleTxt) + cell(M + tbw * 0.68, tbw * 0.12, 'TARİH', new Date().toLocaleDateString('tr-TR')) + cell(M + tbw * 0.8, tbw * 0.2, 'TASARLAYAN', `${b.ad} · SATÜRN`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#5a6b73"/></marker><pattern id="gr" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e3eaed" stroke-width="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="#fbfcfd"/><rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="url(#gr)" stroke="#0b2530" stroke-width="3"/>
<text x="${M + 20}" y="${M + 40}" font-family="${FONT}" font-size="24" font-weight="800" fill="#0b2530">${esc(clip(d.ad, 900))} — TEKNİK ÇİZİM</text>
${fv.s}${sv.s}${rows}${tb}</svg>`;
  }
  async function product(req) {
    if (window.jarvisUltra?.guest?.()) throw Error('Misafir modunda kapalı.');
    setPhase('thinking', 'Mühendislik tasarımı yapıyorum…');
    let d; try { d = jsonOf(await window.jarvisResearch.ask(ENG_SYS, 'TASARLANACAK: ' + req, 'complex')); } finally { setPhase('idle', 'Hazır.'); }
    if (!d) throw Error('Tasarım verisi gelmedi; biraz sonra tekrar dene.');
    if (d.red) return '⛔ Bu tasarımı yapamam: ' + d.red;
    const svg = ST().sanitize(sheet(d));
    const rec = { id: uid('ds'), t: Date.now(), request: 'Teknik çizim: ' + d.ad, format: 'slayt', svg, photo: '', qa: '📐 Teknik çizim: ön + yan görünüş, ölçüler mm, parça balonları ve antet.' };
    const D = ST().designs(); D.unshift(rec); try { store.set('designs', D.slice(0, 12)); } catch { try { store.set('designs', D.slice(0, 6)); } catch {} }
    ST().showDesign(rec);
    const rep = [`⚙ ${d.ad}`, d.amac, '', '🔧 ÇALIŞMA PRENSİBİ', d.prensip, '', `📏 Genel ölçü: ${d.olcu?.g} × ${d.olcu?.y} × ${d.olcu?.d} mm`, '', '🧮 HESAPLAR', ...(d.hesaplar || []).map(h => `• ${h.ad}: ${h.formul} = ${h.sonuc}`), '', '🏭 ÜRETİM ADIMLARI', ...(d.uretim || []).map((s, i) => `${i + 1}. ${s}`), '', '💰 MALİYET: ' + (d.maliyet || '-'), '', '⚠ GÜVENLİK', ...(d.guvenlik || []).map(s => '• ' + s), '', '🚀 SONRAKİ SÜRÜM', ...(d.gelistirme || []).map(s => '• ' + s), '', 'Not: Ön tasarımdır; imalattan önce bir mühendis/usta ile ölçü ve dayanımı doğrula.'].filter(x => x != null).join('\n');
    const n = bubble('ai', rep);
    if (d.gorsel && window.jarvisImage?.pollUrl) { const src = window.jarvisImage.pollUrl(d.gorsel + ', professional industrial design product render, studio lighting, white background, high detail', [1216, 832], Math.floor(Math.random() * 1e9)); n.el.append(el('div', { class: 'muted' }, '🖼 Konsept görsel (yapay zekâ çizimi, yükleniyor…)'), el('img', { src, alt: d.ad + ' konsept', class: 'genimg', loading: 'lazy' })); }
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => ST().exportPng(svg, 'teknik-cizim') }, '⬇ Teknik çizim PNG'), el('button', { type: 'button', onclick: () => ST().dl(new Blob([rep], { type: 'text/plain;charset=utf-8' }), 'tasarim-raporu.txt') }, '⬇ Rapor')));
    return `⚙ ${d.ad}: teknik çizim ana ekranda, rapor ve konsept görsel aşağıda.`;
  }

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    sablon_tasarim: { d: 'sablon_tasarim|konu veya “başlık | madde | madde”|format (gonderi/hikaye/afis) — kusursuz ölçülü hazır şablon tasarım (bilgi, egzersiz, kampanya, söz, istatistik, duyuru)', run: async ([t, f]) => { await smartTemplate(t, ST().FORMATS[fold(f || '')] ? fold(f) : 'gonderi'); return 'Şablon tasarım ana ekranda.'; } },
    urun_tasarla: { d: 'urun_tasarla|ne tasarlanacak — makine/cihaz/aparat/mobilya için mühendislik tasarımı: teknik çizim, parça listesi, hesaplar, üretim adımları, maliyet, konsept görsel', run: ([r]) => product(r) },
    tasarim_kontrol: { d: 'tasarim_kontrol — son tasarımı yeniden kalite kontrolünden geçirir ve düzeltir', run: async () => { const d0 = ST().designs()[0]; if (!d0) return 'Henüz tasarım yok.'; const [, W, H] = ST().FORMATS[d0.format] || [0, 1080, 1350]; const r = await window.jarvisDesignQA(d0.svg, { W, H, fmt: ST().FORMATS[d0.format]?.[0], brand: { renk: brand().renk.join(',') } }); d0.svg = r.svg; d0.qa = r.report; store.set('designs', ST().designs().slice(0, 12)); ST().showDesign(d0); return r.report; } }
  });
  WRITE_TOOLS.add?.('urun_tasarla');
  TOOL_GROUPS.push([/şablon|sablon|hazır tasarım|hazir tasarim|makine|cihaz|aparat|mekanizma|teknik çizim|teknik cizim|ürün tasar|urun tasar|mobilya|düzenek|duzenek|kalite kontrol/i, /^(sablon_tasarim|urun_tasarla|tasarim_kontrol|tasarim_yap|gorsel_olustur)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nTASARIM USTASI: makine/cihaz/aparat/mobilya/mekanizma tasarımı → urun_tasarla (teknik çizim + parça listesi). Hızlı ve kusursuz sosyal medya kartı → sablon_tasarim. Serbest yaratıcı tasarım → tasarim_yap (otomatik kalite kontrolünden geçer).';
  const PRODUCT = /(makine|makina|cihaz|alet|aparat|mekanizma|düzenek|duzenek|mobilya|masa|sehpa|tezgah|tezgâh|raf|dolap|sedye|yatak|bariyer|paralel bar|merdiven|rampa|robot|motor|kalıp|kalip|parça|parca|ekipman|egzersiz aleti|bisiklet|pedal|kasnak|makara|platform|stand|tutucu|bağlantı elemanı|kızak|kizak)/i;
  const _lc = localCommand;
  localCommand = t0 => {
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    const t = String(t0 || '').trim(); let m;
    if ((m = t.match(/^(?:şablon|sablon|hazır tasarım|hazir tasarim)\s*([a-zçğıöşü]*)\s*[:,-]\s*(.{3,})$/i))) { const body = m[2], fb = fold(body); const fmt = /hikaye|story/.test(fb) ? 'hikaye' : /afis/.test(fb) ? 'afis' : 'gonderi'; smartTemplate(body, fmt, fold(m[1] || '')).catch(e => note('Şablon yapılamadı: ' + e.message)); return '🎨 Şablon tasarım hazırlanıyor…'; }
    if ((m = t.match(/^(.{4,140}?)\s+(?:tasarla|tasarımı yap|tasarımını yap|için tasarım yap|teknik çizimini çiz|teknik çizim)\.?$/i)) && PRODUCT.test(m[1]) && !/(afiş|afis|gönderi|gonderi|post|logo|infografik|slayt|kart|kapak|hikaye|hikâye|broşür|brosur)/i.test(m[1])) { product(m[1]).then(x => x && /^⛔/.test(x) && bubble('ai', x)).catch(e => note('Ürün tasarımı yapılamadı: ' + e.message)); return '⚙ Mühendislik tasarımı başlıyor: ölçüler, parçalar, teknik çizim…'; }
    if (/^(tasarim kontrol|tasarimi kontrol et|kalite kontrol)$/.test(fold(t))) { TOOLS.tasarim_kontrol.run([]).catch(e => note(e.message)); return '🔎 Son tasarım kontrol ediliyor…'; }
    return _lc(t0);
  };
  window.jarvisUsta = { audit, template, smartTemplate, dataOf, tplOf, qaLine, TPL, TPL_TR, brand, wrap, fit, sheet, product, contrast, fit };
})();
