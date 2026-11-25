'use strict';
/* SATÜRN 35 — TASARIM MİMARI
 *  1) MİMARİ PLAN: “12x9 m klinik planı: bekleme 20, tedavi 12, tedavi 12, egzersiz 35, ofis 10, wc 5, depo 5” ya da “120 m² fizik tedavi kliniği planı çiz”
 *     → çift taraflı koridorlu yerleşim, duvar kalınlıkları, kapı açılım yayları, pencereler, mobilya (tedavi yatağı, masa, WC, bekleme koltukları),
 *       oda adı + m² + ölçü, genel ölçü çizgileri, kuzey oku, ölçek çubuğu, antet; erişilebilirlik ve oda boyutu denetimi
 *  2) RENK PALETİ: “palet #0e7c86” → tamamlayıcı, analog, üçlü, ayrık tamamlayıcı, ton skalası; her renge kontrast ve yazı rengi önerisi; tek dokunuşla marka rengi yap
 *  3) 3 SEÇENEKLİ ŞABLON: “3 seçenek: bel ağrısına 4 öneri” → aynı içerik üç farklı renk kimliğiyle, birini seç
 *  4) VERİ GRAFİĞİ TASARIMI: “grafik: Ocak 120, Şubat 150, Mart 170” (sütun/çizgi, eğilim çizgisi ve otomatik yorum), “pasta grafik: kira 15000, fatura 4800”,
 *     “aylık gelir grafiği”, “gider pasta grafiği” — kendi verinden, marka renklerinde, PNG/SVG */
(() => {
  const ST = () => window.jarvisStage, U = () => window.jarvisUsta, BL = () => window.jarvisBilim;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";
  const f1 = v => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
  const brand = () => U().brand();
  function keep(svg, request, format, qa) { const rec = { id: uid('ds'), t: Date.now(), request, format, svg, photo: '', qa }; const D = ST().designs(); D.unshift(rec); try { store.set('designs', D.slice(0, 12)); } catch { try { store.set('designs', D.slice(0, 5)); } catch {} } return rec; }

  /* ======================= 1) MİMARİ PLAN ======================= */
  const PROGRAM = total => { const net = total * 0.86; const tr = Math.max(2, Math.min(8, Math.round(net * 0.34 / 11))); return [['Resepsiyon + bekleme', net * 0.16], ...Array.from({ length: tr }, (_, i) => [`Tedavi ${i + 1}`, net * 0.34 / tr]), ['Egzersiz salonu', net * 0.24], ['Muayene / ofis', net * 0.09], ['Engelli WC', Math.max(4.5, net * 0.045)], ['Personel', net * 0.06], ['Depo', Math.max(3, net * 0.035)]]; };
  const KIND = n => { const f = fold(n); return /bekleme|resepsiyon|kayit|giris|lobi/.test(f) ? 'bekleme' : /tedavi|terapi|kabin|seans/.test(f) ? 'tedavi' : /egzersiz|salon|spor|jimnastik|rehabilit/.test(f) ? 'salon' : /wc|tuvalet|banyo|lavabo/.test(f) ? 'wc' : /ofis|muayene|doktor|yonetim/.test(f) ? 'ofis' : /depo|arsiv|teknik/.test(f) ? 'depo' : /personel|mutfak|dinlenme/.test(f) ? 'personel' : /hidro|havuz/.test(f) ? 'havuz' : 'diger'; };
  const MINW = { tedavi: 2.4, salon: 3, bekleme: 3, ofis: 2.4, personel: 2, wc: 1.5, depo: 1.0, havuz: 3, diger: 2.2 };
  const FILL = { bekleme: '#eaf6f7', tedavi: '#f1f7ee', salon: '#fff6e6', wc: '#eef1fb', ofis: '#f6f0fa', depo: '#f2f2f2', personel: '#fbf0ee', havuz: '#e6f3fb', diger: '#f6f8f9' };
  function parseRooms(t) { const out = []; for (const part of String(t).split(/\s*[,;\n]\s*/)) { const m = part.match(/^(?:(\d+)\s*[x×]\s*)?(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrekare)?$/i); if (!m) continue; const n = +(m[1] || 1); for (let i = 0; i < n; i++) out.push([n > 1 ? `${m[2].trim()} ${i + 1}` : m[2].trim(), parseFloat(m[3].replace(',', '.'))]); } return out; }
  function plan(spec) {
    let { W, D, rooms } = spec; const CW = 1.5; // koridor (tekerlekli sandalye için ≥ 1,5 m)
    if ((D - CW) / 2 < 2.4) throw Error('bina derinliği çok az; en az ' + (2 * 2.4 + CW).toFixed(1) + ' m olmalı');
    const rs0 = rooms.map(([n, a]) => ({ n, a, kind: KIND(n) }));
    const order = row => [...row.filter(r => r.kind === 'bekleme'), ...row.filter(r => !['bekleme', 'wc', 'depo'].includes(r.kind)), ...row.filter(r => r.kind === 'wc' || r.kind === 'depo')];
    const lay = (row, y0, dep) => { const tot = row.reduce((s, r) => s + r.a, 0); let x = 0; return order(row).map(r => { const w = W * r.a / tot; const o = { ...r, x, y: y0, w, h: dep }; x += w; o.area = w * dep; return o; }); };
    // en iyi koridor konumu ve oda dağılımı: dar oda ve alan sapmasını en aza indir
    let best = null;
    for (let Db = 2.4; Db <= D - CW - 2.4 + 1e-9; Db += 0.1) {
      const Dt = D - CW - Db, capT = W * Dt, capB = W * Db, sum = rs0.reduce((s, r) => s + r.a, 0), k = (capT + capB) / sum;
      const rs = rs0.map(r => ({ ...r, a: r.a * k })), top = [], bot = []; let ta = 0, ba = 0;
      for (const r of rs.filter(r => r.kind === 'bekleme')) { top.push(r); ta += r.a; }
      const small = r => r.a < Math.min(Dt, Db) * 2.6;
      for (const r of rs.filter(r => r.kind !== 'bekleme').sort((a, b) => b.a - a.a)) { const shallowBot = Db <= Dt; const prefer = small(r) ? (shallowBot ? 'b' : 't') : null; const ft = ta / capT, fb = ba / capB; const go = prefer && (prefer === 'b' ? fb < 1.05 : ft < 1.05) ? prefer : ft <= fb ? 't' : 'b'; if (go === 't') { top.push(r); ta += r.a; } else { bot.push(r); ba += r.a; } }
      if (!top.length || !bot.length) continue;
      const R0 = [...lay(top, 0, Dt), ...lay(bot, Dt + CW, Db)];
      const pen = R0.reduce((p, r) => p + Math.max(0, MINW[r.kind] - r.w) * 12 + Math.abs(r.area / r.a - 1) * 4 + (r.kind === 'wc' ? Math.max(0, 1.6 - Math.min(r.w, r.h)) * 8 : 0) + Math.max(0, r.w / r.h - 3.5) * 2 + Math.max(0, r.h / r.w - 3) * 2, 0);
      if (!best || pen < best.pen) best = { pen, R0, Dt };
    }
    const R = best.R0, rowD = best.Dt;
    // çizim
    const PW = 1500, PH = 1000, M = 120, sc = Math.min((PW - 2 * M - 260) / W, (PH - 2 * M - 120) / D), X = v => M + v * sc, Y = v => M + 40 + v * sc, wo = 0.25 * sc, wi = 0.12 * sc;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" font-family="${FONT}"><defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="8" stroke="#0b2530" stroke-width="2"/></pattern></defs><rect width="${PW}" height="${PH}" fill="#fbfcfd"/>`;
    s += `<rect x="${X(0)}" y="${Y(rowD)}" width="${W * sc}" height="${CW * sc}" fill="#ffffff"/><text x="${X(W / 2)}" y="${Y(rowD + CW / 2) + 6}" font-size="15" text-anchor="middle" fill="#7a8a91" letter-spacing="4">KORİDOR · ${f1(CW)} m</text>`;
    const issues = [];
    for (const r of R) {
      s += `<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * sc}" height="${r.h * sc}" fill="${FILL[r.kind]}"/>`;
      // mobilya
      const cx = X(r.x + r.w / 2), cy = Y(r.y + r.h / 2), up = r.y === 0;
      if (r.kind === 'tedavi') { const bw = 0.75 * sc, bh = 1.95 * sc; if (r.w > 1.6) s += `<rect x="${X(r.x) + 0.45 * sc}" y="${up ? Y(r.y) + 0.35 * sc : Y(r.y + r.h) - 0.35 * sc - bh}" width="${bw}" height="${bh}" rx="6" fill="#fff" stroke="#5a6b73" stroke-width="1.5"/><rect x="${X(r.x) + 0.45 * sc + 6}" y="${up ? Y(r.y) + 0.35 * sc + 6 : Y(r.y + r.h) - 0.35 * sc - bh + 6}" width="${bw - 12}" height="${0.35 * sc}" rx="5" fill="#dfe7ea"/>`; }
      if (r.kind === 'ofis' && r.w > 2) s += `<rect x="${cx - 0.7 * sc}" y="${up ? Y(r.y) + 0.4 * sc : Y(r.y + r.h) - 1.1 * sc}" width="${1.4 * sc}" height="${0.7 * sc}" rx="4" fill="#fff" stroke="#5a6b73" stroke-width="1.5"/><circle cx="${cx}" cy="${up ? Y(r.y) + 1.45 * sc : Y(r.y + r.h) - 1.45 * sc}" r="${0.25 * sc}" fill="#fff" stroke="#5a6b73" stroke-width="1.5"/>`;
      if (r.kind === 'wc') s += `<ellipse cx="${X(r.x + r.w) - 0.6 * sc}" cy="${up ? Y(r.y) + 0.55 * sc : Y(r.y + r.h) - 0.55 * sc}" rx="${0.22 * sc}" ry="${0.3 * sc}" fill="#fff" stroke="#5a6b73" stroke-width="1.5"/><rect x="${X(r.x) + 0.25 * sc}" y="${up ? Y(r.y) + 0.15 * sc : Y(r.y + r.h) - 0.6 * sc}" width="${0.55 * sc}" height="${0.45 * sc}" rx="5" fill="#fff" stroke="#5a6b73" stroke-width="1.5"/>${r.area >= 4 ? `<circle cx="${cx}" cy="${cy}" r="${Math.min(0.75 * sc, r.w * sc / 2 - 4, r.h * sc / 2 - 4)}" fill="none" stroke="#9aa9af" stroke-dasharray="5 5"/>` : ''}`;
      if (r.kind === 'bekleme') { const n = Math.max(2, Math.min(8, Math.floor((r.w - 1) / 0.6))); for (let i = 0; i < n; i++) s += `<rect x="${X(r.x) + 0.5 * sc + i * 0.6 * sc}" y="${up ? Y(r.y) + 0.3 * sc : Y(r.y + r.h) - 0.8 * sc}" width="${0.5 * sc}" height="${0.5 * sc}" rx="5" fill="#fff" stroke="#5a6b73" stroke-width="1.3"/>`; if (r.w > 4) s += `<rect x="${X(r.x + r.w) - 1.9 * sc}" y="${up ? Y(r.y + r.h) - 1.5 * sc : Y(r.y) + 0.9 * sc}" width="${1.6 * sc}" height="${0.6 * sc}" rx="6" fill="#fff" stroke="#0e7c86" stroke-width="1.8"/>`; }
      if (r.kind === 'salon') { const mh = Math.max(1.2, Math.min(1.8, r.h - 1.3)), n = Math.max(1, Math.min(4, Math.floor((r.w * 0.5) / 1.2))); for (let i = 0; i < n; i++) s += `<rect x="${X(r.x) + 0.5 * sc + i * 1.2 * sc}" y="${up ? Y(r.y) + 0.35 * sc : Y(r.y + r.h) - (0.35 + mh) * sc}" width="${0.8 * sc}" height="${mh * sc}" rx="5" fill="#fff" stroke="#f5a623" stroke-width="1.5"/>`; if (r.w > 4) s += `<rect x="${X(r.x + r.w) - 1.6 * sc}" y="${up ? Y(r.y) + 0.35 * sc : Y(r.y + r.h) - 0.95 * sc}" width="${1.1 * sc}" height="${0.6 * sc}" rx="4" fill="#fff" stroke="#5a6b73" stroke-width="1.5"/>`; }
      // pencere (dış duvar)
      if (r.kind !== 'wc' && r.kind !== 'depo' && r.w > 1.6) { const wy = up ? Y(0) : Y(D), ww = Math.min(1.8, r.w * 0.5) * sc; s += `<rect x="${cx - ww / 2}" y="${wy - wo / 2}" width="${ww}" height="${wo}" fill="#fff"/><line x1="${cx - ww / 2}" x2="${cx + ww / 2}" y1="${wy - wo / 6}" y2="${wy - wo / 6}" stroke="#0b2530" stroke-width="1.2"/><line x1="${cx - ww / 2}" x2="${cx + ww / 2}" y1="${wy + wo / 6}" y2="${wy + wo / 6}" stroke="#0b2530" stroke-width="1.2"/>`; }
      if (r.w < MINW[r.kind] - 0.05) issues.push(`${r.n}: genişlik ${f1(r.w)} m dar (bu oda türü için ≥ ${f1(MINW[r.kind])} m önerilir)`);
      if (r.kind === 'tedavi' && r.area < 8) issues.push(`${r.n}: ${f1(r.area)} m² — tedavi odası için en az 8–9 m² önerilir`);
      if (r.kind === 'wc' && (r.w < 1.5 || r.h < 1.5)) issues.push(`${r.n}: engelli WC için 1,5 m dönüş dairesi sığmıyor`);
    }
    // duvarlar: iç bölmeler
    for (const r of R) { if (r.x > 0.01) s += `<line x1="${X(r.x)}" x2="${X(r.x)}" y1="${Y(r.y)}" y2="${Y(r.y + r.h)}" stroke="#0b2530" stroke-width="${wi}"/>`; }
    s += `<line x1="${X(0)}" x2="${X(W)}" y1="${Y(rowD)}" y2="${Y(rowD)}" stroke="#0b2530" stroke-width="${wi}"/><line x1="${X(0)}" x2="${X(W)}" y1="${Y(rowD + CW)}" y2="${Y(rowD + CW)}" stroke="#0b2530" stroke-width="${wi}"/>`;
    // kapılar (koridora açılır)
    const dw = 0.9 * sc;
    for (const r of R) { const up = r.y === 0, wy = up ? Y(rowD) : Y(rowD + CW), dx = r.kind === 'wc' ? X(r.x + r.w / 2) - dw / 2 : X(r.x) + Math.min(0.35 * sc, Math.max(4, r.w * sc - dw - 6)); if (r.w * sc < dw + 8) continue; const dir = up ? -1 : 1;
      s += `<rect x="${dx}" y="${wy - wi / 2 - 1}" width="${dw}" height="${wi + 2}" fill="${FILL[r.kind]}"/><line x1="${dx}" y1="${wy}" x2="${dx}" y2="${wy + dir * dw}" stroke="#0b2530" stroke-width="2"/><path d="M ${dx} ${wy + dir * dw} A ${dw} ${dw} 0 0 ${up ? 1 : 0} ${dx + dw} ${wy}" fill="none" stroke="#0b2530" stroke-width="1" stroke-dasharray="4 3"/>`; }
    // dış duvar + giriş
    s += `<rect x="${X(0)}" y="${Y(0)}" width="${W * sc}" height="${D * sc}" fill="none" stroke="#0b2530" stroke-width="${wo}"/>`;
    const ey = Y(rowD + CW / 2); s += `<rect x="${X(0) - wo / 2 - 1}" y="${ey - 0.6 * sc}" width="${wo + 2}" height="${1.2 * sc}" fill="#fbfcfd"/><path d="M ${X(0) - 46} ${ey} l 30 0 m -10 -9 l 10 9 l -10 9" fill="none" stroke="#0e7c86" stroke-width="3"/><text x="${X(0) - 31}" y="${ey + 30}" font-size="13" font-weight="800" fill="#0e7c86" text-anchor="middle">GİRİŞ</text>`;
    // etiketler
    for (const r of R) { const up = r.y === 0, narrow = r.w * sc < 78, cx = X(r.x + r.w / 2) + (r.kind === 'tedavi' && r.w > 2.4 ? 0.45 * sc : 0) + (r.kind === 'salon' ? r.w * sc * 0.22 : 0), cy = Y(r.y + r.h / 2) + (r.kind === 'tedavi' ? (up ? 0.5 * sc : -0.5 * sc) : r.kind === 'bekleme' ? (up ? -0.3 * sc : 0.3 * sc) : 0);
      if (narrow) { s += `<g transform="rotate(-90 ${X(r.x + r.w / 2)} ${Y(r.y + r.h / 2)})"><text x="${X(r.x + r.w / 2)}" y="${Y(r.y + r.h / 2) - 2}" font-size="13" font-weight="700" fill="#0b2530" text-anchor="middle">${esc(r.n)}</text><text x="${X(r.x + r.w / 2)}" y="${Y(r.y + r.h / 2) + 14}" font-size="11" fill="#0e7c86" text-anchor="middle" font-weight="600">${f1(r.area)} m² · ${f1(r.w)} × ${f1(r.h)}</text></g>`; continue; }
      const maxw = r.w * sc - 14; const fs = Math.max(11, Math.min(18, maxw / Math.max(6, r.n.length) * 1.7));
      s += `<text x="${cx}" y="${cy - 4}" font-size="${fs}" font-weight="700" fill="#0b2530" text-anchor="middle">${esc(r.n)}</text><text x="${cx}" y="${cy + fs}" font-size="${Math.max(10, fs - 3)}" fill="#0e7c86" text-anchor="middle" font-weight="600">${f1(r.area)} m²</text><text x="${cx}" y="${cy + fs * 2}" font-size="${Math.max(9, fs - 5)}" fill="#7a8a91" text-anchor="middle">${f1(r.w)} × ${f1(r.h)}</text>`; }
    // ölçü çizgileri
    const dim = (x1, y1, x2, y2, txt, vert) => vert ? `<g stroke="#5a6b73" stroke-width="1.3"><line x1="${x1 - 8}" x2="${x1 + 8}" y1="${y1}" y2="${y1}"/><line x1="${x1 - 8}" x2="${x1 + 8}" y1="${y2}" y2="${y2}"/><line x1="${x1}" x2="${x1}" y1="${y1}" y2="${y2}"/></g><text x="${x1 - 12}" y="${(y1 + y2) / 2}" font-size="15" fill="#5a6b73" text-anchor="middle" transform="rotate(-90 ${x1 - 12} ${(y1 + y2) / 2})">${txt}</text>` : `<g stroke="#5a6b73" stroke-width="1.3"><line x1="${x1}" x2="${x1}" y1="${y1 - 8}" y2="${y1 + 8}"/><line x1="${x2}" x2="${x2}" y1="${y1 - 8}" y2="${y1 + 8}"/><line x1="${x1}" x2="${x2}" y1="${y1}" y2="${y1}"/></g><text x="${(x1 + x2) / 2}" y="${y1 - 8}" font-size="15" fill="#5a6b73" text-anchor="middle">${txt}</text>`;
    s += dim(X(0), Y(0) - 40, X(W), Y(0) - 40, `${f1(W)} m`) + dim(X(0) - 70, Y(0), X(0) - 70, Y(D), `${f1(D)} m`, true);
    for (const r of R.filter(r => r.y === 0)) s += `<g stroke="#9aa9af" stroke-width="1"><line x1="${X(r.x)}" x2="${X(r.x)}" y1="${Y(0) - 20}" y2="${Y(0) - 12}"/></g><text x="${X(r.x + r.w / 2)}" y="${Y(0) - 16}" font-size="11" fill="#9aa9af" text-anchor="middle">${f1(r.w)}</text>`;
    // kuzey oku, ölçek, antet
    const bx = PW - 230; s += `<g transform="translate(${bx + 105},${M + 40})"><circle r="34" fill="#fff" stroke="#0b2530" stroke-width="1.5"/><path d="M0 -28 L12 14 L0 6 L-12 14 Z" fill="#0b2530"/><text y="-40" font-size="16" font-weight="800" text-anchor="middle" fill="#0b2530">K</text></g>`;
    s += `<g transform="translate(${bx},${M + 130})"><rect width="${sc}" height="8" fill="#0b2530"/><rect x="${sc}" width="${sc}" height="8" fill="#fff" stroke="#0b2530"/><rect x="${2 * sc}" width="${3 * sc}" height="8" fill="#0b2530"/><text y="26" font-size="12" fill="#5a6b73">0</text><text x="${sc}" y="26" font-size="12" fill="#5a6b73" text-anchor="middle">1</text><text x="${5 * sc}" y="26" font-size="12" fill="#5a6b73" text-anchor="middle">5 m</text></g>`;
    const tot = R.reduce((a, r) => a + r.area, 0), corr = W * CW, b = brand();
    let ly = M + 200; s += `<text x="${bx}" y="${ly}" font-size="15" font-weight="800" fill="#0e7c86" letter-spacing="2">ALAN ÇİZELGESİ</text>`;
    for (const r of R) { ly += 22; s += `<text x="${bx}" y="${ly}" font-size="13" fill="#0b2530">${esc(r.n.length > 20 ? r.n.slice(0, 19) + '…' : r.n)}</text><text x="${PW - 40}" y="${ly}" font-size="13" fill="#0b2530" text-anchor="end">${f1(r.area)} m²</text>`; }
    ly += 26; s += `<line x1="${bx}" x2="${PW - 40}" y1="${ly - 16}" y2="${ly - 16}" stroke="#0b2530"/><text x="${bx}" y="${ly}" font-size="13" fill="#5a6b73">Koridor</text><text x="${PW - 40}" y="${ly}" font-size="13" fill="#5a6b73" text-anchor="end">${f1(corr)} m²</text>`; ly += 22; s += `<text x="${bx}" y="${ly}" font-size="14" font-weight="800" fill="#0b2530">Toplam</text><text x="${PW - 40}" y="${ly}" font-size="14" font-weight="800" fill="#0b2530" text-anchor="end">${f1(W * D)} m²</text>`;
    s += `<rect x="${bx - 10}" y="${PH - 150}" width="${PW - bx - 20}" height="120" fill="#fff" stroke="#0b2530" stroke-width="1.5"/><text x="${bx}" y="${PH - 122}" font-size="12" fill="#5a6b73" letter-spacing="1.5">PROJE</text><text x="${bx}" y="${PH - 96}" font-size="16" font-weight="800" fill="#0b2530">${esc(String(spec.title || 'Kat planı').replace(/^.*? — /, ''))}</text><text x="${bx}" y="${PH - 70}" font-size="13" fill="#0b2530">${esc(b.ad)} · ön tasarım</text><text x="${bx}" y="${PH - 48}" font-size="12" fill="#5a6b73">${new Date().toLocaleDateString('tr-TR')} · SATÜRN · ölçek grafik</text>`;
    s += `<text x="${M}" y="${M - 72}" font-size="26" font-weight="800" fill="#0b2530">${esc(spec.title || 'Kat planı')}</text><text x="${M}" y="${M - 48}" font-size="14" fill="#5a6b73">${f1(W)} × ${f1(D)} m · ${R.length} hacim · net kullanım %${Math.round(tot / (W * D) * 100)} · koridor ${f1(CW)} m (tekerlekli sandalye uygun) · kapılar 90 cm</text></svg>`;
    return { svg: s, R, issues, eff: tot / (W * D) };
  }
  function planCmd(t) {
    const f = fold(t); let W, D; let m = t.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:m|metre)?/i);
    const total = (t.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrekare)/i) || [])[1];
    let rooms = parseRooms((t.split(/[:]/)[1] || '').trim());
    if (m) { W = +m[1].replace(',', '.'); D = +m[2].replace(',', '.'); if (D > W) [W, D] = [D, W]; }
    else if (total) { const A = +total.replace(',', '.'); D = Math.max(7.5, Math.min(12, Math.sqrt(A / 1.6))); W = A / D; }
    else if (rooms.length) { const A = rooms.reduce((s, r) => s + r[1], 0) / 0.86; D = Math.max(7.5, Math.min(12, Math.sqrt(A / 1.6))); W = A / D; }
    else throw Error('Ölçü ya da alan ver: “12x9 m klinik planı: bekleme 20, tedavi 12, …” veya “120 m² fizik tedavi kliniği planı”');
    if (!rooms.length) rooms = PROGRAM(W * D);
    const title = /klinik|fizik|tedavi|merkez/.test(f) ? `${brand().ad} — Klinik kat planı` : /ev|daire|konut/.test(f) ? 'Konut kat planı' : /ofis|buro/.test(f) ? 'Ofis kat planı' : 'Kat planı';
    const p = plan({ W, D, rooms, title });
    const rec = keep(p.svg, title, 'slayt', `📐 ${p.R.length} hacim · net kullanım %${Math.round(p.eff * 100)}${p.issues.length ? ' · ⚠ ' + p.issues.join('; ') : ' · oda boyutları ve erişilebilirlik uygun'}`);
    ST().showDesign(rec);
    return `📐 ${title}: ${f1(W)} × ${f1(D)} m, ${p.R.length} hacim${p.issues.length ? '\n⚠ ' + p.issues.join('\n⚠ ') : ''}\nNot: Ön tasarımdır; ruhsat ve uygulama için mimar/mühendis onayı gerekir (yangın kaçışı, statik, tesisat).`;
  }

  /* ======================= 2) RENK PALETİ ======================= */
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
  const hsl2hex = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q2, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q2 - p) * 6 * t : t < 1 / 2 ? q2 : t < 2 / 3 ? p + (q2 - p) * (2 / 3 - t) * 6 : p; }; return rgb2hex([f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => v * 255)); };
  const NAMED = { kırmızı: '#d63031', kirmizi: '#d63031', mavi: '#0984e3', lacivert: '#1e2a78', yeşil: '#00a86b', yesil: '#00a86b', turkuaz: '#0e7c86', mor: '#6c5ce7', turuncu: '#f39c12', sarı: '#f1c40f', sari: '#f1c40f', pembe: '#e84393', bordo: '#7b1e3a', kahverengi: '#8d5524', gri: '#636e72', siyah: '#1e272e', altın: '#c9a227', altin: '#c9a227', zeytin: '#708238', petrol: '#0b4f6c', mint: '#3eb489', somon: '#fa8072' };
  function palette(base) {
    const [h, s, l] = rgb2hsl(hex2rgb(base)), C = window.jarvisUsta.contrast;
    const sw = hx => { const rgb = hex2rgb(hx), cw = C(rgb, [255, 255, 255]), cb = C(rgb, [11, 37, 48]); return { hx, txt: cw >= cb ? '#ffffff' : '#0b2530', c: Math.max(cw, cb) }; };
    const S2 = Math.max(0.35, Math.min(0.85, s)), L2 = Math.max(0.3, Math.min(0.55, l));
    const sets = [['Ana renk ve tonları', [...new Set([0.93, 0.8, 0.64, L2, 0.3, 0.2, 0.12].map(v => Math.round(v * 100) / 100))].sort((a, b2) => b2 - a).slice(0, 7).map(L => hsl2hex(h, S2, L))], ['Tamamlayıcı', [hsl2hex(h, S2, L2), hsl2hex(h, S2 * 0.5, 0.94), hsl2hex(h + 180, S2, L2), hsl2hex(h + 180, S2, 0.88), hsl2hex(h, 0.25, 0.14)]], ['Analog (uyumlu, sakin)', [hsl2hex(h - 30, S2, L2), hsl2hex(h, S2, L2), hsl2hex(h + 30, S2, L2), hsl2hex(h, 0.2, 0.96), hsl2hex(h, 0.3, 0.15)]], ['Üçlü (canlı, dengeli)', [hsl2hex(h, S2, L2), hsl2hex(h + 120, S2, L2 + 0.05), hsl2hex(h + 240, S2, L2 + 0.05), hsl2hex(h, 0.15, 0.97), hsl2hex(h, 0.3, 0.14)]], ['Ayrık tamamlayıcı', [hsl2hex(h, S2, L2), hsl2hex(h + 150, S2, L2 + 0.08), hsl2hex(h + 210, S2, L2 + 0.08), hsl2hex(h, 0.15, 0.96), hsl2hex(h, 0.3, 0.13)]]].map(([n, a]) => [n, a.map(sw)]);
    const Wd = 1300, rowH = 150; let y = 110;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${110 + sets.length * (rowH + 40) + 30}" width="${Wd}" height="${110 + sets.length * (rowH + 40) + 30}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fbfcfd"/><text x="50" y="58" font-size="30" font-weight="800" fill="#0b2530">Renk paleti · ${base.toUpperCase()}</text><text x="50" y="86" font-size="15" fill="#5a6b73">Her kutuda önerilen yazı rengi ve kontrast oranı (≥ 4,5 gövde metni için yeterli) · 60-30-10: ilk renk baskın, ikinci destek, üçüncü vurgu</text>`;
    for (const [n, a] of sets) { svg += `<text x="50" y="${y + 18}" font-size="17" font-weight="700" fill="#0b2530">${n}</text>`; const w = (Wd - 100 - (a.length - 1) * 12) / a.length; a.forEach((c, i) => { const x = 50 + i * (w + 12); svg += `<rect x="${x}" y="${y + 30}" width="${w}" height="${rowH - 20}" rx="14" fill="${c.hx}" stroke="#00000014"/><text x="${x + 16}" y="${y + 66}" font-size="19" font-weight="800" fill="${c.txt}">${c.hx.toUpperCase()}</text><text x="${x + 16}" y="${y + rowH - 6}" font-size="13" fill="${c.txt}" opacity=".85">Aa · ${c.c.toFixed(1)}:1</text>`; }); y += rowH + 40; }
    svg += '</svg>';
    return { svg, sets, brandSet: [hsl2hex(h, S2, L2), hsl2hex(h, 0.35, 0.14), hsl2hex(h + 180 + (h > 180 ? -10 : 10), Math.max(0.7, S2), 0.55), '#ffffff'] };
  }
  function paletteCmd(t) {
    const hx = (t.match(/#?[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i) || [])[0]; const nm = Object.keys(NAMED).find(k => fold(t).includes(fold(k)));
    const base = hx ? (hx.startsWith('#') ? hx : '#' + hx) : nm ? NAMED[nm] : (brand().renk[0] || '#0e7c86');
    const p = palette(base), rec = keep(p.svg, 'Renk paleti ' + base, 'slayt', '🎨 Kontrast oranları WCAG’e göre hesaplandı.');
    ST().showDesign(rec);
    const n = bubble('ai', `🎨 Önerilen marka seti: ana ${p.brandSet[0]} · koyu ${p.brandSet[1]} · vurgu ${p.brandSet[2]} · zemin ${p.brandSet[3]}`);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: ev => { store.set('set.brandColors', p.brandSet.join(', ')); const i = document.getElementById('brandColors'); if (i) i.value = p.brandSet.join(', '); ev.target.disabled = true; note('✓ Marka renklerin güncellendi — bundan sonraki tüm tasarımlar bu paletle.'); } }, '✓ Bunu marka rengim yap')));
    return `🎨 ${base} için 5 palet hazır (ana ekranda).`;
  }

  /* ======================= 3) 3 SEÇENEKLİ ŞABLON ======================= */
  async function variants(text, fmt = 'gonderi') {
    const u = U(), { kind, d } = await u.dataOf(text), b = u.brand(), [, W, H] = ST().FORMATS[fmt] || [0, 1080, 1080];
    const [h] = rgb2hsl(hex2rgb(b.renk[0] || '#0e7c86'));
    const looks = [['Marka', b.renk], ['Gece mavisi', ['#3b5bdb', '#0f1a3d', '#ffd166', '#ffffff']], ['Sıcak', ['#e8590c', '#3a1408', '#ffd43b', '#ffffff']]];
    const out = [];
    for (const [nm, renk] of looks) { const svg = u.TPL[kind](d, W, H, { ...b, renk }); const r = await u.audit(svg, W, H, { darkC: renk[1] }); out.push({ nm, svg: r.svg, qa: u.qaLine(r), score: r.score }); }
    const n = bubble('ai', `🎨 ${u.TPL_TR[kind]} — 3 seçenek (kalite: ${out.map(o => o.nm + ' ' + o.score).join(' · ')}). Beğendiğini seç:`);
    n.el.append(el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px' }, ...out.map(o => el('button', { type: 'button', style: 'padding:0;border:2px solid transparent;border-radius:10px;overflow:hidden;background:none;cursor:pointer', title: o.nm, onclick: () => { const rec = keep(o.svg, `${u.TPL_TR[kind]} (${o.nm}): ${d.baslik}`, fmt, o.qa); ST().showDesign(rec); } }, el('img', { src: ST().svgSrc(o.svg), alt: o.nm, style: 'width:100%;display:block' }), el('div', { style: 'padding:4px;font-size:12px' }, o.nm)))));
    return '3 seçenek hazır — birine dokun.';
  }

  /* ======================= 4) VERİ GRAFİĞİ TASARIMI ======================= */
  function parsePairs(t) { const out = []; for (const part of String(t).split(/\s*[,;\n]\s*(?=[^\d\s])|\s*;\s*|\n/)) { const m = part.trim().match(/^(.+?)\s*[:=]?\s+(-?[\d.]+(?:,\d+)?)\s*(?:tl|%|₺)?$/i); if (m) out.push([m[1].trim(), parseFloat(m[2].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))]); } return out; }
  const tl = v => Math.round(v).toLocaleString('tr-TR');
  function chart(pairs, { title = 'Grafik', type = 'auto', unit = '' } = {}) {
    if (pairs.length < 2) throw Error('en az 2 veri ver: “grafik: Ocak 120, Şubat 150, Mart 170”');
    const b = brand(), [c1, c2, c3] = b.renk, W = 1200, H = 800, M = { l: 100, r: 50, t: 150, b: 110 };
    const vals = pairs.map(p => p[1]), labs = pairs.map(p => p[0]), n = pairs.length, mx = Math.max(...vals, 0), mn = Math.min(...vals, 0);
    const ticks = BL().nice(mn, mx * 1.08, 6), top = ticks.at(-1), bot = Math.min(0, ticks[0]);
    const X = i => M.l + (i + 0.5) * (W - M.l - M.r) / n, Y = v => H - M.b - (v - bot) / (top - bot) * (H - M.t - M.b);
    const line = type === 'cizgi' || (type === 'auto' && n > 12);
    const xs = vals.map((_, i) => i), rg = BL().regress(xs, vals), ch = vals.at(-1) - vals[0], chP = vals[0] ? ch / Math.abs(vals[0]) * 100 : 0, iMax = vals.indexOf(Math.max(...vals));
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="#ffffff"/><text x="${M.l}" y="62" font-size="34" font-weight="800" fill="${c2}" letter-spacing="-1">${esc(title)}</text>`;
    const insight = `${chP >= 0 ? '▲' : '▼'} Dönem boyunca %${Math.abs(chP).toFixed(1).replace('.', ',')} ${chP >= 0 ? 'artış' : 'düşüş'} · en yüksek: ${esc(labs[iMax])} (${tl(vals[iMax])}${unit}) · ortalama ${tl(vals.reduce((a, b2) => a + b2, 0) / n)}${unit}`;
    s += `<text x="${M.l}" y="98" font-size="18" fill="${chP >= 0 ? c1 : '#c0392b'}" font-weight="600">${insight}</text>`;
    for (const tk of ticks) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(tk)}" y2="${Y(tk)}" stroke="#e9eef0"/><text x="${M.l - 14}" y="${Y(tk) + 6}" font-size="16" text-anchor="end" fill="#7a8a91">${tl(tk)}</text>`;
    const bw = Math.min(70, (W - M.l - M.r) / n * 0.62);
    if (line) { const pts = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' '); s += `<polygon points="${X(0)},${Y(bot)} ${pts} ${X(n - 1)},${Y(bot)}" fill="${c1}" opacity=".12"/><polyline points="${pts}" fill="none" stroke="${c1}" stroke-width="4" stroke-linejoin="round"/>` + vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === iMax ? 8 : 5}" fill="${i === iMax ? c3 : c1}" stroke="#fff" stroke-width="2"/>`).join(''); }
    else s += vals.map((v, i) => `<rect x="${X(i) - bw / 2}" y="${Math.min(Y(v), Y(0))}" width="${bw}" height="${Math.abs(Y(v) - Y(0))}" rx="8" fill="${i === iMax ? c3 : c1}"/><text x="${X(i)}" y="${Math.min(Y(v), Y(0)) - 10}" font-size="16" font-weight="700" text-anchor="middle" fill="${c2}">${tl(v)}</text>`).join('');
    if (n >= 3) s += `<line x1="${X(0)}" y1="${Y(rg.b0)}" x2="${X(n - 1)}" y2="${Y(rg.b0 + rg.b1 * (n - 1))}" stroke="${c2}" stroke-width="2.5" stroke-dasharray="10 8" opacity=".7"/><text x="${M.l}" y="126" font-size="15" fill="${c2}" opacity=".8">- - - eğilim ${rg.b1 >= 0 ? '+' : '−'}${tl(Math.abs(rg.b1))}${unit}/dönem · R² ${rg.r2.toFixed(2).replace('.', ',')}</text>`;
    const step = Math.ceil(n / 14); labs.forEach((l, i) => { if (i % step === 0) s += `<text x="${X(i)}" y="${H - M.b + 32}" font-size="16" text-anchor="middle" fill="#5a6b73">${esc(String(l).slice(0, 12))}</text>`; });
    s += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="${c2}" stroke-width="1.5"/><text x="${M.l}" y="${H - 34}" font-size="15" font-weight="800" fill="${c1}" letter-spacing="2">${esc(b.ad)}</text><text x="${W - M.r}" y="${H - 34}" font-size="13" text-anchor="end" fill="#9aa9af">Kaynak: kendi kayıtların · SATÜRN</text></svg>`;
    return { svg: s, insight: insight.replace(/&amp;/g, '&') };
  }
  function pie(pairs, title = 'Dağılım') {
    const b = brand(), W = 1200, H = 800, tot = pairs.reduce((a, p) => a + p[1], 0); if (!(tot > 0)) throw Error('değerler pozitif olmalı');
    const P = [...pairs].sort((a, c) => c[1] - a[1]), base = rgb2hsl(hex2rgb(b.renk[0]))[0], cols = P.map((_, i) => i === 0 ? b.renk[0] : hsl2hex(base + i * (300 / P.length), 0.55, 0.5 + (i % 2) * 0.08));
    const cx = 400, cy = 450, R = 270, r = 150; let a0 = -Math.PI / 2, s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="#fff"/><text x="70" y="80" font-size="34" font-weight="800" fill="${b.renk[1]}" letter-spacing="-1">${esc(title)}</text>`;
    P.forEach(([l, v], i) => { const a1 = a0 + v / tot * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0, p = (ang, rr) => `${cx + rr * Math.cos(ang)} ${cy + rr * Math.sin(ang)}`; s += P.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${cols[i]}" stroke-width="${R - r}"/>` : `<path d="M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z" fill="${cols[i]}" stroke="#fff" stroke-width="3"/>`; const am = (a0 + a1) / 2; if (v / tot > 0.05) s += `<text x="${cx + (R + r) / 2 * Math.cos(am)}" y="${cy + (R + r) / 2 * Math.sin(am) + 7}" font-size="20" font-weight="800" fill="#fff" text-anchor="middle">%${Math.round(v / tot * 100)}</text>`; a0 = a1; });
    s += `<text x="${cx}" y="${cy - 6}" font-size="18" fill="#7a8a91" text-anchor="middle">Toplam</text><text x="${cx}" y="${cy + 30}" font-size="34" font-weight="800" fill="${b.renk[1]}" text-anchor="middle">${tl(tot)}</text>`;
    P.slice(0, 10).forEach(([l, v], i) => { const y = 220 + i * 52; s += `<rect x="760" y="${y - 22}" width="26" height="26" rx="7" fill="${cols[i]}"/><text x="800" y="${y - 2}" font-size="20" font-weight="600" fill="#0b2530">${esc(String(l).slice(0, 22))}</text><text x="1140" y="${y - 2}" font-size="20" fill="#5a6b73" text-anchor="end">${tl(v)} · %${(v / tot * 100).toFixed(1).replace('.', ',')}</text>`; });
    s += `<text x="70" y="${H - 34}" font-size="15" font-weight="800" fill="${b.renk[0]}" letter-spacing="2">${esc(b.ad)}</text></svg>`;
    return { svg: s, insight: `En büyük pay: ${P[0][0]} (%${(P[0][1] / tot * 100).toFixed(1).replace('.', ',')})${P.length > 1 ? ` · ilk iki kalem toplamın %${((P[0][1] + P[1][1]) / tot * 100).toFixed(0)}’i` : ''}` };
  }
  function showChart(r, title) { const rec = keep(r.svg, title, 'slayt', '📊 ' + r.insight); ST().showDesign(rec); return '📊 ' + r.insight; }
  function monthly(type = 'gelir', months = 12) { const L = store.get('ledger', []); const out = []; const d = new Date(); d.setDate(1); for (let i = months - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); const k = isoLocal(x).slice(0, 7); out.push([x.toLocaleDateString('tr-TR', { month: 'short' }), L.filter(e => e.d.startsWith(k) && e.type === type).reduce((s, e) => s + e.amt, 0)]); } while (out.length && !out[0][1]) out.shift(); return out; }

  /* ======================= araçlar + komutlar ======================= */
  const wrapT = fn => async (...a) => { try { return await fn(...a); } catch (e) { return '⚠ ' + e.message; } };
  Object.assign(TOOLS, {
    mimari_plan: { d: 'mimari_plan|ölçü veya alan ve oda listesi (ör. “12x9 m: bekleme 20, tedavi 12, egzersiz 35” ya da “120 m² fizik tedavi kliniği”) — ölçekli kat planı: duvarlar, kapılar, pencereler, mobilya, ölçüler, alan çizelgesi', run: wrapT(([t]) => planCmd(t)) },
    renk_paleti: { d: 'renk_paleti|ana renk (#hex veya renk adı) — 5 profesyonel palet, kontrast oranlarıyla', run: wrapT(([t]) => paletteCmd(t || '')) },
    sablon_secenek: { d: 'sablon_secenek|konu veya “başlık | madde | …” — aynı şablonu 3 farklı renk kimliğiyle üretir', run: wrapT(([t]) => variants(t)) },
    grafik_tasarla: { d: 'grafik_tasarla|başlık|“etiket değer, etiket değer …”|tür (sutun/cizgi/pasta) — marka renkli veri grafiği, eğilim çizgisi ve yorum', run: wrapT(([ti, data, ty]) => { const P = parsePairs(data); return fold(ty || '').startsWith('pasta') ? showChart(pie(P, ti || 'Dağılım'), ti || 'Pasta grafik') : showChart(chart(P, { title: ti || 'Grafik', type: fold(ty || 'auto') }), ti || 'Grafik'); }) }
  });
  TOOL_GROUPS.push([/plan|mimari|kat planı|oda|palet|renk|seçenek|secenek|grafik|pasta|sütun|sutun/i, /^(mimari_plan|renk_paleti|sablon_secenek|grafik_tasarla)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nTASARIM MİMARI: kat/klinik/oda planı → mimari_plan; renk/marka paleti → renk_paleti; aynı tasarımın seçenekleri → sablon_secenek; veriden grafik → grafik_tasarla.';
  const _lc = localCommand;
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t); let m;
    const run = (p, msg) => { Promise.resolve().then(p).then(x => x && /^⚠/.test(x) && note(x)).catch(e => note(e.message)); return msg; };
    if (/(kat plani|mimari plan|klinik plani|yerlesim plani|plan ciz|plani ciz|planini ciz|planini tasarla|plani tasarla|plani cikar|planini cikar)/.test(f) && /(\d+\s*[x×*]\s*\d+|\d+\s*(m2|m²|metrekare)|:\s*\S+\s+\d)/i.test(t)) { try { return planCmd(t); } catch (e) { return '⚠ ' + e.message; } }
    if ((m = t.match(/^(?:renk )?palet(?:i)?\s*[:\s]?\s*(.*)$/i)) || (m = t.match(/^(.+?)\s+(?:renk )?paleti(?: oluştur| yap| çıkar)?$/i))) { try { return paletteCmd(m[1] || ''); } catch (e) { return '⚠ ' + e.message; } }
    if ((m = t.match(/^(?:3|üç|uc)\s*(?:seçenek|secenek|varyasyon|alternatif)\s*[:\s]\s*(.+)$/i))) return run(() => variants(m[1]), '🎨 3 seçenek hazırlanıyor…');
    if ((m = t.match(/^(?:pasta grafik|pasta grafiği|pasta|halka grafik)\s*[:\s]\s*(.+)$/i))) { try { return showChart(pie(parsePairs(m[1]), 'Dağılım'), 'Pasta grafik'); } catch (e) { return '⚠ ' + e.message; } }
    if ((m = t.match(/^(?:grafik|sütun grafik|sutun grafik|çizgi grafik|cizgi grafik|grafik tasarla|bar grafik)\s*[:\s]\s*(.+)$/i)) && parsePairs(m[1]).length >= 2) { try { const [ti, data] = m[1].includes('|') ? m[1].split('|') : ['Grafik', m[1]]; return showChart(chart(parsePairs(data), { title: ti.trim(), type: /cizgi/.test(f) ? 'cizgi' : /sutun|bar/.test(f) ? 'sutun' : 'auto' }), ti.trim()); } catch (e) { return '⚠ ' + e.message; } }
    if (/^(aylik )?(gelir|ciro|kazanc) grafigi$/.test(f)) { const P = monthly('gelir'); if (P.length < 2) return 'Grafik için en az 2 aylık gelir kaydı gerekiyor.'; return showChart(chart(P, { title: 'Aylık gelir', unit: ' TL' }), 'Aylık gelir'); }
    if (/^(aylik )?gider grafigi$/.test(f)) { const P = monthly('gider'); if (P.length < 2) return 'Grafik için en az 2 aylık gider kaydı gerekiyor.'; return showChart(chart(P, { title: 'Aylık gider', unit: ' TL' }), 'Aylık gider'); }
    if (/^gider (pasta|dagilim) grafigi$|^giderlerimin dagilimi$/.test(f)) { const mk = isoLocal(new Date()).slice(0, 7), cat = window.jarvisAkil?.catOf || (x => x), by = {}; store.get('ledger', []).filter(x => x.type === 'gider' && x.d.startsWith(mk)).forEach(x => { const c = cat(x.desc); by[c] = (by[c] || 0) + x.amt; }); const P = Object.entries(by); if (!P.length) return 'Bu ay gider kaydı yok.'; return showChart(pie(P, 'Bu ayın giderleri'), 'Gider dağılımı'); }
    return _lc(t0);
  };
  window.jarvisMimar = { plan, planCmd, palette, variants, chart, pie, parsePairs, parseRooms };
})();
