'use strict';
/* SATÜRN 33 — DEHA
 *  1) ÇOK ADIMLI KOMUT: “Ayşe 1500 ödedi ve seans yapıldı ağrı 4, yarın 15:00 randevu” → üç işi sırayla yapar
 *  2) KENDİ VERİNE SORU (yapay zekâsız, anında, kotasız): “bu ay kaç seans yaptım”, “geçen ay ne kadar kazandım”, “Ayşe ne kadar ödedi”,
 *     “Ali kaç seans oldu”, “en çok gelen hastalar”, “kaç hastam var”, “bu ay kaç yeni hasta”, “bugün kimler geldi”
 *  3) İÇGÖRÜLER: “içgörüler” — verinden kendiliğinden çıkan desenler: en yoğun gün/saat, tanıya göre iyileşme, tahsilat oranı, hasta başı seans…
 *  4) SEANS SONRASI KLİNİK ZEKÂ: seans kaydedilince ağrı arttıysa, platoya girdiyse ya da hedefe indiyse hemen fark eder ve sonraki adımı önerir */
(() => {
  const DAY = 86400000, P = () => (typeof patients !== 'undefined' ? patients : []);
  const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
  const tl = v => Math.round(v).toLocaleString('tr-TR') + ' TL';
  const ymd = d => isoLocal(d).slice(0, 10);
  const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const sessions = () => P().flatMap(p => (p.seanslar || []).map(s => ({ p, ...s })));

  /* ---------- dönem çözümleyici ---------- */
  function period(f) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t = d0.getTime();
    const mStart = o => { const d = new Date(d0); d.setDate(1); d.setMonth(d.getMonth() - o); return d.getTime(); };
    const wStart = o => { const d = new Date(d0); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * DAY - o * 7 * DAY; };
    if (/\bdun\b/.test(f)) return { a: t - DAY, b: t, ad: 'dün' };
    if (/gecen hafta/.test(f)) return { a: wStart(1), b: wStart(0), ad: 'geçen hafta' };
    if (/bu hafta|haftada/.test(f)) return { a: wStart(0), b: t + DAY, ad: 'bu hafta' };
    if (/gecen ay/.test(f)) return { a: mStart(1), b: mStart(0), ad: 'geçen ay' };
    if (/bu yil|bu sene/.test(f)) { const d = new Date(d0); d.setMonth(0, 1); return { a: d.getTime(), b: t + DAY, ad: 'bu yıl' }; }
    if (/bu ay|ayda/.test(f)) return { a: mStart(0), b: t + DAY, ad: 'bu ay' };
    if (/bugun/.test(f)) return { a: t, b: t + DAY, ad: 'bugün' };
    return null;
  }
  const inP = (pr, ts) => ts >= pr.a && ts < pr.b;
  const ledIn = pr => store.get('ledger', []).filter(x => { const ts = new Date(x.d + 'T12:00').getTime(); return ts >= pr.a && ts < pr.b; });

  /* ---------- 2) kendi verine soru ---------- */
  function ask(t) {
    const f = fold(t).replace(/[?!.]+$/, '').trim(); if (f.length > 70) return null;
    const pr = period(f);
    let m;
    if (pr && /kac seans|seans sayisi|kac hasta (bakt|gel)|kac kisi geldi/.test(f)) { const S = sessions().filter(s => inP(pr, s.t)); const pp = new Set(S.map(s => s.p)); return `📊 ${pr.ad[0].toUpperCase() + pr.ad.slice(1)}: ${S.length} seans, ${pp.size} farklı hasta.`; }
    if (pr && /(ne kadar|kac para|kac tl).*(kazan|gelir|ciro|kasa)|(gelir|ciro|kazanc)\w*\s*(ne kadar|kac)|kasa (durumu|ne kadar)/.test(f)) {
      const L = ledIn(pr), g = L.filter(x => x.type === 'gelir').reduce((a, x) => a + x.amt, 0), c = L.filter(x => x.type === 'gider').reduce((a, x) => a + x.amt, 0), S = sessions().filter(s => inP(pr, s.t)).length;
      return `💰 ${pr.ad[0].toUpperCase() + pr.ad.slice(1)}: gelir ${tl(g)}, gider ${tl(c)}, net ${tl(g - c)}${S ? ` · ${S} seans, seans başı ≈ ${tl(g / S)}` : ''}.`;
    }
    if (pr && /(kimler|kim) geldi|gelen hastalar/.test(f)) { const S = sessions().filter(s => inP(pr, s.t)); return S.length ? `👥 ${pr.ad}: ` + [...new Set(S.map(s => nm(s.p)))].join(', ') : `${pr.ad} kayıtlı seans yok.`; }
    if (pr && /yeni hasta/.test(f)) { const N = P().filter(p => { const first = p.created || Math.min(...(p.seanslar || []).map(s => s.t)); return Number.isFinite(first) && inP(pr, first); }); return `🆕 ${pr.ad} ${N.length} yeni hasta${N.length ? ': ' + N.slice(0, 10).map(nm).join(', ').replace(/\.$/, '') : ''}.`; }
    if (/^kac (aktif )?hastam var|hasta sayisi/.test(f)) { const t0 = Date.now(), act = P().filter(p => (p.seanslar || []).some(s => t0 - s.t < 30 * DAY)); return `👥 Toplam ${P().length} kayıtlı hasta · son 30 günde gelen (aktif) ${act.length}.`; }
    if (/en (cok|sik) gelen hasta|en sadik hasta/.test(f)) { const t0 = Date.now(); const r = P().map(p => ({ p, n: (p.seanslar || []).filter(s => t0 - s.t < 90 * DAY).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 7); return r.length ? '🏅 Son 90 günde en çok gelen: ' + r.map(x => `${nm(x.p)} (${x.n})`).join(', ') : 'Son 90 günde seans kaydı yok.'; }
    if ((m = t.match(/^(.{2,40}?)\s+(?:ne kadar|kaç para|kac para|toplam ne kadar)\s+(?:ödedi|odedi|ödeme yaptı|verdi)/i))) { const p = findPatient(m[1].replace(/['’].*$/, '')); if (p) { const fn = fold(p.ad).split(' ')[0]; const paid = store.get('ledger', []).filter(x => x.type === 'gelir' && fold(x.desc || '').includes(fn)).reduce((a, x) => a + x.amt, 0); const R = store.get('receivables', []).filter(r => fold(r.ad) === fold(p.ad)); const open = R.reduce((a, r) => a + r.tutar - (r.odenen || []).reduce((s, x) => s + x.amt, 0), 0); return `💳 ${nm(p)}: kasaya giren toplam ${tl(paid)}${open > 0 ? ` · açık borcu ${tl(open)}` : ' · açık borcu yok'} · ${(p.seanslar || []).length} seans.`; } }
    if ((m = t.match(/^(.{2,40}?)\s+(?:kaç|kac)\s+seans\s*(?:oldu|yaptı|yapti|geldi|yapıldı|yapildi)?$/i))) { const p = findPatient(m[1].replace(/['’].*$/, '')); if (p) { const s = p.seanslar || []; const left = p.paket ? p.paket - s.filter(x => x.t >= (p.paketBas || 0)).length : null; return `🗓 ${nm(p)}: ${s.length} seans${s.length ? `, son seans ${new Date(s.at(-1).t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` : ''}${left != null ? ` · paketinde ${Math.max(0, left)} seans kaldı` : ''}.`; } }
    if (/en yogun (gun|saat)|hangi gun yogun|ne zaman yogun/.test(f)) return insights().split('\n').slice(1, 3).join('\n');
    return null;
  }

  /* ---------- 3) içgörüler ---------- */
  function insights() {
    const t0 = Date.now(), S = sessions().filter(s => t0 - s.t < 120 * DAY), out = ['💡 İÇGÖRÜLER (son 4 ay, kendi verinden)'];
    if (S.length < 5) return out[0] + '\nDesen çıkarmak için en az birkaç haftalık seans kaydı gerekiyor. Seansları kaydettikçe burası zenginleşir.';
    const byD = Array(7).fill(0), byH = {}; for (const s of S) { const d = new Date(s.t); byD[d.getDay()]++; byH[d.getHours()] = (byH[d.getHours()] || 0) + 1; }
    const wk = byD.map((n, i) => [i, n]).filter(x => x[0] !== 0).sort((a, b) => b[1] - a[1]);
    out.push(`📅 En yoğun gün: ${GUN[wk[0][0]]} (${wk[0][1]} seans) · en sakin: ${GUN[wk.at(-1)[0]]} (${wk.at(-1)[1]}) — sakin güne kampanya/kontrol randevusu koyabilirsin.`);
    const hs = Object.entries(byH).sort((a, b) => b[1] - a[1]); out.push(`🕒 En yoğun saat: ${String(hs[0][0]).padStart(2, '0')}:00 (${hs[0][1]} seans)${hs.length > 2 ? ` · en az dolu: ${String(hs.at(-1)[0]).padStart(2, '0')}:00` : ''}.`);
    const done = P().filter(p => (p.seanslar || []).length >= 3);
    if (done.length) out.push(`🔁 Hasta başına ortalama ${(done.reduce((a, p) => a + p.seanslar.length, 0) / done.length).toFixed(1)} seans (3+ seans gelen ${done.length} hasta).`);
    const kw = p => fold(p.tani || '').split(/[^a-z0-9]+/).find(w => w.length >= 3 && !/^(sag|sol|ve|ile|agri|agrisi|kronik|akut)$/.test(w));
    const g = {}; for (const p of done) { const v = p.seanslar.map(s => s.vas).filter(x => x != null && x !== '').map(Number); if (v.length < 2 || !kw(p)) continue; (g[kw(p)] ||= []).push((v[0] - v.at(-1)) / Math.max(1, v[0]) * 100); }
    const gr = Object.entries(g).filter(x => x[1].length >= 2).map(([k, a]) => [k, a.reduce((s, x) => s + x, 0) / a.length, a.length]).sort((a, b) => b[1] - a[1]);
    if (gr.length) out.push(`🩺 Tanıya göre ağrı azalması: ${gr.slice(0, 4).map(([k, a, n]) => `${k} %${Math.round(a)} (${n} hasta)`).join(', ')}${gr.length > 1 ? ` — en zayıf sonuç “${gr.at(-1)[0]}”da, protokolü gözden geçirmeye değer.` : ''}`);
    const R = store.get('receivables', []); if (R.length) { const tot = R.reduce((a, r) => a + r.tutar, 0), paid = R.reduce((a, r) => a + (r.odenen || []).reduce((s, x) => s + x.amt, 0), 0); out.push(`💳 Veresiye tahsilat oranı: %${Math.round(paid / tot * 100)} (${tl(paid)} / ${tl(tot)}).`); }
    const L = store.get('ledger', []).filter(x => x.type === 'gelir' && t0 - new Date(x.d).getTime() < 120 * DAY);
    if (L.length >= 5) { const byDR = Array(7).fill(0), cnt = Array(7).fill(0); const days = new Set(); for (const x of L) { const w = new Date(x.d + 'T12:00').getDay(); byDR[w] += x.amt; if (!days.has(x.d)) { days.add(x.d); cnt[w]++; } } const best = byDR.map((v, i) => [i, cnt[i] ? v / cnt[i] : 0]).sort((a, b) => b[1] - a[1])[0]; if (best[1]) out.push(`💰 Gün başına en kazançlı gün: ${GUN[best[0]]} (ortalama ${tl(best[1])}).`); }
    const lost = P().filter(p => { const s = p.seanslar || []; return s.length > 0 && s.length <= 2 && t0 - s.at(-1).t > 21 * DAY && t0 - s.at(-1).t < 150 * DAY; }).length;
    if (lost) out.push(`🚪 1–2 seans gelip bırakan ${lost} hasta var — ilk seanslarda beklenti ve plan konuşması bu oranı düşürür; “kontrol çağrısı” ile geri kazanılabilir.`);
    return out.join('\n');
  }

  /* ---------- 4) seans sonrası klinik zekâ ---------- */
  const _rt = window.jarvisRunTools;
  window.jarvisRunTools = async (calls, ctx) => {
    const r = await _rt(calls, ctx);
    for (const c of calls || []) { const a = String(c).split('|'); if (a[0] !== 'seans_ekle') continue; try { const p = findPatient(a[1]); if (p) setTimeout(() => clinical(p), 400); } catch {} }
    return r;
  };
  function clinical(p) {
    const v = (p.seanslar || []).map(s => s.vas).filter(x => x != null && x !== '').map(Number); if (v.length < 2) return;
    const last = v.at(-1), prev = v.at(-2), first = v[0]; let msg = null, acts = [];
    if (last - prev >= 2) { msg = `⚠ ${nm(p)}: ağrı ${prev} → ${last} arttı. Son seansın yükü, ev programına aşırı yüklenme veya yeni bir olay olabilir — bir sonraki seansta yükü azaltıp yeniden değerlendirmek iyi olur.`; acts = [['Seyri gör', `${p.ad} ilerleme`], ['Yapay zekâya danış', `${p.ad} için ağrı ${prev}'den ${last}'e çıktı, tedavi planında neyi değiştirmeliyim? Kısa öneri.`]]; }
    else if (last <= 2 && first >= 4) { msg = `🎉 ${nm(p)}: ağrı ${first} → ${last} — hedef bölgeye indi (%${Math.round((first - last) / first * 100)} azalma). Bitirme/idame planı, epikriz ve ev programı zamanı.`; acts = [['Epikriz', `${p.ad} için epikriz`], ['Memnuniyet anketi', `${p.ad} için anket gönder`]]; }
    else if (v.length >= 4 && Math.max(...v.slice(-3)) - Math.min(...v.slice(-3)) <= 0.5 && last >= 4) { msg = `⏸ ${nm(p)}: son 3 seansta ağrı ${v.slice(-3).join(' → ')} — platoda. Yaklaşımı değiştirmeyi (yük, modalite, ev programı uyumu) ya da yeniden değerlendirmeyi düşün.`; acts = [['İyileşme tahmini', `${p.ad} kaç seansta iyileşir`]]; }
    if (!msg) return;
    const b = bubble('ai', msg); b.el.append(el('div', { class: 'tool' }, ...acts.map(([l, c]) => el('button', { type: 'button', onclick: () => typedTurn(c, false) }, l))));
  }

  /* ---------- 1) çok adımlı komut ---------- */
  const TIMEWORD = /^(bugun|yarin|obur gun|ertesi gun|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar)\b/;
  const looks = s => { const f = fold(s); return /\d[\d.]*\s*(?:bin|k)?\s*(?:tl|lira)?\s*(?:odedi|odedim|borclu|verdi)|seans(?:i)?\s+(?:yapildi|yaptik|bitti)|icin\s+\d{1,2}\s*seans|kac\s+seans|odedim$/.test(f) || (TIMEWORD.test(f) && /\d{1,2}[:.]\d{2}/.test(f)); };
  function timeTask(part) {
    const f = fold(part), m = part.match(/(\d{1,2})[:.](\d{2})/); if (!m || !TIMEWORD.test(f)) return null;
    const d = new Date(); d.setHours(0, 0, 0, 0); const w = f.match(TIMEWORD)[1];
    if (w === 'yarin' || w === 'ertesi gun') d.setDate(d.getDate() + 1); else if (w === 'obur gun') d.setDate(d.getDate() + 2);
    else if (w !== 'bugun') { const idx = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'].indexOf(w); let k = (idx - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + k); }
    const due = `${ymd(d)}T${m[1].padStart(2, '0')}:${m[2]}`;
    let text = part.replace(/^\s*\S+(\s+gün)?\s*/i, '').replace(/(saat\s*)?\d{1,2}[:.]\d{2}('?(de|da|te|ta))?/i, '').trim();
    const cp = window.jarvisAkil?.ctx?.(); if (cp && !fold(text).includes(fold(cp.ad).split(' ')[0])) text = `${text || 'randevu'} — ${cp.ad}`;
    window.jarvisZeki?.snap('görev: ' + text);
    saveItem({ kind: 'task', text: text[0].toUpperCase() + text.slice(1), due });
    return `📌 ${new Date(due).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}: ${text}`;
  }
  function multi(t) {
    if (t.length > 220 || t.length < 12) return null;
    const parts = t.split(/\s*;\s*|\s*,\s*(?=\S)|\s+(?:ve|sonra|ayrıca|ayrica)\s+(?=\S)/i).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    // virgülle bölünmüş not parçalarını önceki parçaya geri yapıştır
    const merged = []; for (const p of parts) { if (merged.length && !looks(p) && !/^(seans|odedi|ödedi|\d)/i.test(p)) merged[merged.length - 1] += ', ' + p; else merged.push(p); }
    if (merged.length < 2 || merged.filter(looks).length < 2) return null;
    const res = [];
    for (let p of merged) {
      const cp = window.jarvisAkil?.ctx?.();
      if (cp && /^(seans|odedi|ödedi|\d)/i.test(p)) p = cp.ad.split(' ')[0] + ' ' + p;
      if (TIMEWORD.test(fold(p)) && /\d{1,2}[:.]\d{2}/.test(p)) { res.push(timeTask(p)); continue; }
      const r = localCommand(p); res.push(r == null ? `• “${p}” anlaşılamadı — ayrıca yaz.` : r);
    }
    return `🧩 ${merged.length} işlem:\n` + res.map(r => String(r).split('\n')[0]).join('\n');
  }

  /* ---------- araçlar + komutlar ---------- */
  Object.assign(TOOLS, {
    icgoruler: { d: 'icgoruler — verinden çıkan desenler: yoğun gün/saat, tanıya göre iyileşme, tahsilat oranı, bırakma oranı', run: () => insights() },
    veri_sor: { d: 'veri_sor|soru — kayıtlı veriye doğrudan soru (“bu ay kaç seans”, “geçen ay gelir”, “Ayşe ne kadar ödedi”, “en çok gelen hastalar”)', run: ([q]) => ask(q) || 'Bu soruyu kayıtlardan doğrudan cevaplayamadım.' }
  });
  TOOL_GROUPS.push([/içgörü|icgoru|desen|yoğun|yogun|kaç seans|kac seans|ne kadar kazan|kaç hasta|kac hasta|ne kadar ödedi|ne kadar odedi/i, /^(icgoruler|veri_sor)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nDEHA: kayıtlı sayılar (seans sayısı, gelir, hasta ödemesi) için önce veri_sor; desen/analiz için icgoruler.';
  const _lc = localCommand;
  localCommand = t0 => {
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    const t = String(t0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (/^(icgoruler|icgoru|desenler|verilerimden ne cikiyor|analiz et beni)$/.test(f)) return insights();
    const q = ask(t); if (q) return q;
    const mm = multi(t); if (mm) return mm;
    return _lc(t0);
  };
  window.jarvisDeha = { ask, insights, multi, clinical, period, timeTask };
})();
