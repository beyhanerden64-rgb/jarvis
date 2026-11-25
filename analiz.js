'use strict';
/* SATÜRN 24 — VERİ ANALİZİ: CSV / yapıştırılan tablo → istatistik, eğilim, aykırı değer, gruplama, grafik, yorum
 *  • Hesaplar telefonda yapılır (ham veri dışarı gitmez); isteğe bağlı yorum için yapay zekâya YALNIZ özet sayılar gider
 *  • Ayraç otomatik (virgül, noktalı virgül, sekme); Türkçe sayı biçimi (1.234,5) desteklenir
 *  • Sütun başına: n, toplam, ortalama, medyan, min, maks, std sapma, eğilim (doğrusal), aykırı değerler (|z|>3)
 *  • En güçlü korelasyon, kategori sütununa göre toplamlar, grafik
 */
(() => {
  const nf = (v, d = 2) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d });
  const parseNum = s => { let t = String(s ?? '').trim().replace(/[₺$€%\s]|tl$/gi, ''); if (!t) return NaN; if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.'); else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? +t : NaN; };
  function parse(text) {
    const lines = String(text).replace(/\r/g, '').split('\n').map(l => l.trimEnd()).filter(l => l.trim());
    if (lines.length < 2) throw Error('En az bir başlık ve bir veri satırı gerekli.');
    const cand = ['\t', ';', ',', '|'].map(d => ({ d, n: lines.slice(0, 5).map(l => l.split(d).length) })).filter(x => x.n[0] > 1 && x.n.every(v => v === x.n[0]));
    const d = (cand.sort((a, b) => b.n[0] - a.n[0])[0] || { d: /\t/.test(lines[0]) ? '\t' : /;/.test(lines[0]) ? ';' : ',' }).d;
    const split = l => { if (d !== ',') return l.split(d).map(x => x.trim()); const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
    const head = split(lines[0]).map((h, i) => h.replace(/^"|"$/g, '') || 'Sütun ' + (i + 1));
    const rows = lines.slice(1).map(split).filter(r => r.length >= Math.min(2, head.length)).slice(0, 20000);
    return { head, rows, delim: d };
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const median = a => { const s = [...a].sort((x, y) => x - y); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
  const std = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const slope = a => { const n = a.length, xm = (n - 1) / 2, ym = mean(a); let num = 0, den = 0; a.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2; }); return den ? num / den : 0; };
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; };
  function analyze(text) {
    const { head, rows } = parse(text);
    const cols = head.map((h, i) => { const raw = rows.map(r => r[i] ?? ''); const nums = raw.map(parseNum); const ok = nums.filter(Number.isFinite); return { h, i, raw, nums, numeric: ok.length >= Math.max(2, raw.filter(x => x !== '').length * 0.8) }; });
    const num = cols.filter(c => c.numeric), cat = cols.filter(c => !c.numeric && new Set(c.raw).size <= Math.max(2, Math.min(30, rows.length * 0.6)));
    const date = cols.find(c => !c.numeric && c.raw.filter(x => /^\d{4}-\d{2}(-\d{2})?|^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(x)).length >= rows.length * 0.8);
    const stats = num.map(c => {
      const v = c.nums.filter(Number.isFinite), m = mean(v), s = std(v), sl = slope(v);
      const out = s ? c.nums.map((x, k) => ({ x, k })).filter(o => Number.isFinite(o.x) && Math.abs((o.x - m) / s) > 3) : [];
      return { h: c.h, n: v.length, sum: v.reduce((a, b) => a + b, 0), mean: m, median: median(v), min: Math.min(...v), max: Math.max(...v), std: s, trend: sl, trendPct: m ? sl / Math.abs(m) * 100 : 0, first: v[0], last: v.at(-1), outliers: out.slice(0, 5).map(o => ({ row: o.k + 2, x: o.x })) };
    });
    let best = null;
    for (let a = 0; a < num.length; a++) for (let b = a + 1; b < num.length; b++) { const idx = num[a].nums.map((x, k) => k).filter(k => Number.isFinite(num[a].nums[k]) && Number.isFinite(num[b].nums[k])); if (idx.length < 4) continue; const r = corr(idx.map(k => num[a].nums[k]), idx.map(k => num[b].nums[k])); if (!best || Math.abs(r) > Math.abs(best.r)) best = { a: num[a].h, b: num[b].h, r }; }
    let group = null;
    if (cat.length && num.length) { const c = cat.find(x => x !== date) || cat[0], v = num[0], g = {}; c.raw.forEach((k, j) => { if (Number.isFinite(v.nums[j])) g[k || '(boş)'] = (g[k || '(boş)'] || 0) + v.nums[j]; }); group = { by: c.h, of: v.h, items: Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 10) }; }
    return { head, rows: rows.length, stats, best, group, date: date?.h || null, labels: (date || cat[0] || null)?.raw || null };
  }
  function text(A) {
    const L = [`📊 VERİ ANALİZİ — ${A.rows} satır, ${A.head.length} sütun (${A.stats.length} sayısal)${A.date ? ' · tarih sütunu: ' + A.date : ''}`];
    for (const s of A.stats) {
      const dir = Math.abs(s.trendPct) < 0.5 ? 'yatay' : s.trendPct > 0 ? 'artış' : 'azalış';
      L.push(`\n• ${s.h}: toplam ${nf(s.sum)} · ortalama ${nf(s.mean)} · medyan ${nf(s.median)} · en düşük ${nf(s.min)} · en yüksek ${nf(s.max)} · std ${nf(s.std)}`);
      L.push(`  eğilim: ${dir}${dir !== 'yatay' ? ` (satır başına ${s.trend > 0 ? '+' : ''}${nf(s.trend)}, ortalamanın %${nf(Math.abs(s.trendPct), 1)}’i)` : ''} · ilk ${nf(s.first)} → son ${nf(s.last)} (%${nf(s.first ? (s.last / s.first - 1) * 100 : 0, 1)})${s.outliers.length ? ` · ⚠ aykırı: ${s.outliers.map(o => `satır ${o.row} (${nf(o.x)})`).join(', ')}` : ''}`);
    }
    if (A.best && Math.abs(A.best.r) >= 0.5) L.push(`\nİlişki: “${A.best.a}” ile “${A.best.b}” ${A.best.r > 0 ? 'birlikte artıyor' : 'ters yönde hareket ediyor'} (r = ${nf(A.best.r)}${Math.abs(A.best.r) >= 0.8 ? ', güçlü' : ', orta'}). İlişki nedensellik değildir.`);
    if (A.group) L.push(`\n${A.group.by} kırılımında ${A.group.of} toplamı: ` + A.group.items.map(([k, v]) => `${k} ${nf(v)}`).join(' · '));
    return L.join('\n');
  }
  async function aiComment(A) {
    const sum = JSON.stringify({ satir: A.rows, sutunlar: A.head, istatistik: A.stats.map(s => ({ ad: s.h, ort: +s.mean.toFixed(2), min: s.min, max: s.max, egilim_yuzde: +s.trendPct.toFixed(2), ilk: s.first, son: s.last, aykiri: s.outliers.length })), iliski: A.best, grup: A.group });
    return window.jarvisResearch.ask('Sen deneyimli bir veri analistisin. TÜRKÇE, en çok 120 kelime: 3 madde “ne görüyorum” + 2 madde “ne yapmalı”. Yalnız verilen özet sayılara dayan, sayı uydurma.', sum, 'quick');
  }
  async function run(textData, { ai = opt('analizAI') !== '0' } = {}) {
    const A = analyze(textData), t = text(A), n = bubble('ai', t); answerTools?.(n.el, t);
    const s = A.stats[0];
    if (s) { const col = A.stats[0].h, ci = A.head.indexOf(col), P = parse(textData); const pts = P.rows.map((r, k) => [String(A.labels?.[k] ?? k + 1).slice(0, 12), parseNum(r[ci])]).filter(p => Number.isFinite(p[1])); const sample = pts.length > 40 ? pts.filter((_, k) => k % Math.ceil(pts.length / 40) === 0) : pts; if (sample.length >= 2) window.jarvisUltra?.drawChart?.(`${col}${A.date ? ' — zamana göre' : ''}`, sample, sample.length > 12 || A.date ? 'cizgi' : 'bar'); }
    if (A.group?.items.length >= 2) window.jarvisUltra?.drawChart?.(`${A.group.of} — ${A.group.by} kırılımı`, A.group.items, 'bar');
    if (ai && window.jarvisResearch?.ask) { try { const c = await withTimeout(aiComment(A), 30000, 'zaman aşımı'); if (c) bubble('ai', '🧠 YORUM\n' + String(c).trim()); } catch {} }
    return t;
  }
  // yapıştırılan metin GERÇEKTEN tablo mu? ≥4 satır, her satırda aynı ayraç sayısı (≥1), veri hücrelerinin ≥%40’ı sayı
  function looksTable(t) {
    const L = String(t).split('\n').map(x => x.trim()).filter(Boolean); if (L.length < 4) return false;
    for (const d of ['\t', ';', ',', '|']) {
      const n = L.map(l => l.split(d).length); if (n[0] < 2 || !n.every(x => x === n[0])) continue;
      const cells = L.slice(1).flatMap(l => l.split(d)); const numeric = cells.filter(c => Number.isFinite(parseNum(c))).length;
      if (numeric / cells.length >= 0.4) return true;
    }
    return false;
  }
  const fileIn = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', hidden: true });
  document.body.append(fileIn);
  function card() {
    const ta = el('textarea', { rows: 5, placeholder: 'Tabloyu buraya yapıştır (Excel/Sheets’ten kopyala) — ilk satır başlık', style: 'width:100%;box-sizing:border-box' });
    const n = bubble('ai', '📊 VERİ ANALİZİ — CSV dosyası seç ya da tabloyu yapıştır. Hesaplar telefonda yapılır; Excel dosyasını “CSV olarak kaydet” ile verebilirsin.');
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { fileIn.onchange = async () => { const f = fileIn.files[0]; fileIn.value = ''; if (!f) return; if (f.size > 5 * 1048576) return note('Dosya çok büyük (en çok 5 MB).'); try { await run(await f.text()); } catch (e) { note(e.message); } }; fileIn.click(); } }, '📁 CSV seç'), ta, el('button', { type: 'button', onclick: async () => { try { await run(ta.value); } catch (e) { note(e.message); } } }, '📊 Analiz et')));
    return 'Veri analizi kartı açıldı.';
  }
  Object.assign(TOOLS, { veri_analizi: { d: 'veri_analizi|tablo metni (CSV/sekmeli; boşsa kart açar) — istatistik, eğilim, aykırı değer, korelasyon, kırılım, grafik ve yorum (telefonda hesaplanır)', run: async ([d]) => (d && /\n/.test(d) ? run(d) : card()) } });
  TOOL_GROUPS.push([/analiz|istatistik|csv|tablo|excel|veri/i, /^veri_analizi$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nVERİ ANALİZİ: Beyhan tablo/CSV verirse ya da “veri analizi” derse → veri_analizi (tablo metnini olduğu gibi ilet).';
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim();
    if (window.jarvisUltra?.guest?.()) return _lc(text0);
    if (/^(?:satürn[, ]+)?(veri analizi|csv analiz|tablo analiz|excel analiz|verimi analiz et)$/i.test(t)) return card();
    const m = t.match(/^(?:analiz et|bunu analiz et|veriyi analiz et|tabloyu analiz et)[:\s]*\n([\s\S]{10,})$/i);
    if (m) { run(m[1]).catch(e => note(e.message)); return 'Tablo analiz ediliyor…'; }
    if (looksTable(t)) { run(t).catch(e => note(e.message)); return 'Yapıştırdığın tabloyu analiz ediyorum…'; }
    return _lc(text0);
  };
  window.jarvisAnaliz = { looksTable, parse, parseNum, analyze, text, run, card };
})();
