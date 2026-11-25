'use strict';
/* SATÜRN 30 — HIZ ve ZEKÂ
 *  1) KOMUT PALETİ (Ctrl+K veya ⌘K, telefonda ⚡ düğmesi): 200+ özelliğin, hastaların, görevlerin, notların içinde anında arama → Enter ile çalıştır
 *  2) AKILLI HIZLI KAYIT: “Ayşe 1500 ödedi”, “Ali seans yapıldı ağrı 4”, “Mehmet 2000 borçlu”, “kira 15000 ödedim”, “Ali ev programına uymuyor”
 *     → doğru yere (kasa, seans, alacak, not) yapay zekâ beklemeden, anında kaydeder; geri al düğmesiyle
 *  3) SEANS SERİSİ PLANLAYICI: “Ayşe için 10 seans haftada 3 saat 14:00” → çakışmasız, tatil ve pazarları atlayan randevu serisi
 *  4) AYLIK GELİR HEDEFİ: tempo, ay sonu tahmini, kalan iş günü başına gereken gelir; geride kalınca proaktif kart
 *  5) HASTA BIRAKMA RİSKİ: her aktif hasta için 0–100 risk puanı (gelme aralığı, ağrı eğilimi, paket, seans sayısı)
 *  6) AKILLI ÖNBELLEK: zamandan bağımsız aynı soru 6 saat içinde tekrar gelirse yapay zekâya gitmeden anında yanıt (kota tasarrufu)
 *  7) SIRADAKİ EN İYİ EYLEM çipi: bekleyen öneri sayısı ekranda; dokununca öneriler
 *  8) KISAYOLLAR: Ctrl+K palet · “/” yazı kutusu · Alt+G hızlı görev · Alt+K kasa · Esc kapat */
(() => {
  const DAY = 86400000, $id = id => document.getElementById(id);
  const P = () => (typeof patients !== 'undefined' ? patients : []), IT = () => (typeof items !== 'undefined' ? items : []);
  const todayK = () => isoLocal(now()).slice(0, 10);
  const tl = v => Math.round(v).toLocaleString('tr-TR') + ' TL';
  const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
  const runTool = async (line, show = true) => { const r = await window.jarvisRunTools([line], { voiceTurn: false, say: () => {} }); const t = r.text.replace(/^[a-z_]+(?:\|[^\n:]*)?: (?:BAŞARILI|BAŞARISIZ) — /gm, ''); if (show) bubble('ai', t); return t; };
  const amount = s => { const m = String(s).match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(bin|k)?/i); if (!m) return NaN; let v = Number(m[1].replace(/[.\s]/g, '') + (m[2] ? '.' + m[2] : '')); if (m[3]) v *= 1000; return v; };

  /* ================= 1) KOMUT PALETİ ================= */
  const style = document.createElement('style');
  style.textContent = `#satPal{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding-top:9vh}
#satPal .box{width:min(94vw,640px);background:var(--panel,#0b1b28);border:1px solid var(--line-2,#2a5566);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);overflow:hidden}
#satPal input{width:100%;box-sizing:border-box;padding:16px 18px;font-size:18px;background:transparent;border:0;border-bottom:1px solid var(--line-2,#2a5566);color:inherit;outline:none}
#satPal ul{list-style:none;margin:0;padding:6px;max-height:56vh;overflow:auto}#satPal li{padding:9px 12px;border-radius:9px;cursor:pointer;display:flex;gap:10px;align-items:baseline}
#satPal li.on{background:rgba(95,224,234,.16)}#satPal li b{font-weight:600}#satPal li small{opacity:.65;font-size:12px}#satPal .k{margin-left:auto;opacity:.5;font-size:11px;white-space:nowrap}
#satChip{position:fixed;right:14px;bottom:150px;z-index:55;display:none;border-radius:20px;padding:7px 12px;font:600 13px system-ui;background:#0e7c86;color:#fff;border:0;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer}
#satBolt{position:fixed;right:14px;bottom:196px;z-index:55;width:40px;height:40px;border-radius:50%;border:1px solid var(--line-2,#2a5566);background:rgba(10,30,45,.85);color:#ffe066;font-size:18px;cursor:pointer}`;
  document.head.append(style);
  function entries() {
    const E = [];
    for (const [k, v] of Object.entries(SKILLS || {})) if (v?.label) E.push({ kind: 'Yetenek', t: v.label, d: '', run: () => (typeof runSkill === 'function' ? runSkill(k) : v.run?.()) });
    for (const [k, v] of Object.entries(TOOLS)) E.push({ kind: 'Araç', t: k.replace(/_/g, ' '), d: String(v.d || '').replace(/^[^—]*—\s*/, '').slice(0, 110), tool: k, usage: String(v.d || '').split(' — ')[0] });
    for (const b of document.querySelectorAll('.tabs button')) E.push({ kind: 'Panel', t: b.textContent.replace(/\d+$/, '').trim(), d: 'sekmeyi aç', run: () => { $id('drawer')?.classList.add('open'); b.click(); } });
    for (const p of P()) E.push({ kind: 'Hasta', t: p.ad, d: [p.tani, p.tel, (p.seanslar || []).length + ' seans'].filter(Boolean).join(' · '), run: () => runTool('hasta_bul|' + p.ad) });
    for (const i of IT().filter(i => !i.done).slice(-150)) E.push({ kind: i.kind === 'task' ? 'Görev' : 'Not', t: short(i.title || i.text, 70), d: i.due ? i.due.replace('T', ' ') : '', run: () => { $id('drawer')?.classList.add('open'); document.querySelector('.tabs [data-p="tasks"], #t-tasks')?.click(); } });
    return E;
  }
  const score = (e, q) => { const hay = fold(e.t + ' ' + e.d + ' ' + e.kind), toks = fold(q).split(/\s+/).filter(Boolean); let s = 0; for (const t of toks) { const i = hay.indexOf(t); if (i < 0) return -1; s += i === 0 ? 30 : fold(e.t).startsWith(t) ? 25 : fold(e.t).includes(t) ? 15 : 5; } const use = (store.get('palUse', {})[e.kind + e.t] || 0); return s + Math.min(20, use * 3) + (e.kind === 'Yetenek' ? 6 : e.kind === 'Hasta' ? 4 : 0); };
  function palette(initial = '') {
    $id('satPal')?.remove();
    const all = entries(), inp = el('input', { placeholder: 'Ne yapmak istiyorsun? (özellik, hasta, görev ara — ya da doğrudan yaz ve Enter)', autocomplete: 'off', spellcheck: 'false' }), ul = el('ul', {});
    const box = el('div', { id: 'satPal', role: 'dialog', 'aria-label': 'Komut paleti' }, el('div', { class: 'box' }, inp, ul));
    let rows = [], sel = 0;
    const close = () => box.remove();
    const paint = () => {
      const q = inp.value.trim();
      rows = q ? all.map(e => [score(e, q), e]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 14).map(x => x[1]) : all.filter(e => e.kind === 'Yetenek' || (store.get('palUse', {})[e.kind + e.t] || 0) > 1).slice(0, 14);
      if (q) rows.push({ kind: 'Sor', t: `“${short(q, 60)}” → Satürn’e sor`, d: 'Enter', ask: q });
      sel = Math.min(sel, rows.length - 1);
      ul.replaceChildren(...rows.map((e, i) => { const li = el('li', { class: i === sel ? 'on' : '', onclick: () => pick(e) }, el('b', {}, e.t), el('small', {}, e.d || ''), el('span', { class: 'k' }, e.kind)); return li; }));
    };
    async function pick(e) {
      close(); const u = store.get('palUse', {}); u[e.kind + e.t] = (u[e.kind + e.t] || 0) + 1; store.set('palUse', u);
      if (e.ask) return typedTurn(e.ask, false);
      if (e.run) return e.run();
      if (e.tool) { // argümanlı araç: tek satırlık küçük form
        const need = /\|/.test(e.usage);
        if (!need) return runTool(e.tool).catch(x => note(x.message));
        const f = el('input', { placeholder: e.usage.replace(/^[a-z_]+\|?/, '').replace(/\|/g, ' | '), style: 'width:100%;margin:8px 0' });
        const ov = el('div', { class: 'camera skillform' }, el('form', { class: 'sfcard', onsubmit: ev => { ev.preventDefault(); ov.remove(); runTool(e.tool + '|' + f.value.split(/\s*\|\s*/).join('|')).catch(x => note(x.message)); } }, el('h4', {}, e.t), el('small', { class: 'muted' }, e.d), f, el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn' }, 'Çalıştır'), el('button', { type: 'button', class: 'btn ghost', onclick: () => ov.remove() }, 'Vazgeç'))));
        document.body.append(ov); setTimeout(() => f.focus(), 20);
      }
    }
    inp.oninput = () => { sel = 0; paint(); };
    inp.onkeydown = ev => { if (ev.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); paint(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); ev.preventDefault(); } else if (ev.key === 'Enter') { ev.preventDefault(); if (rows[sel]) pick(rows[sel]); } else if (ev.key === 'Escape') close(); };
    box.onclick = ev => { if (ev.target === box) close(); };
    document.body.append(box); inp.value = initial; paint(); setTimeout(() => inp.focus(), 10);
  }
  document.addEventListener('keydown', e => {
    const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
    if (e.altKey && e.key.toLowerCase() === 'g') { e.preventDefault(); const p = $id('prompt'); p.value = 'görev: '; autosize?.(); p.focus(); return; }
    if (e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); const p = $id('prompt'); p.value = 'kasa gelir '; autosize?.(); p.focus(); return; }
    if (e.key === '/' && !typing) { e.preventDefault(); $id('prompt')?.focus(); }
  }, true);
  document.body.append(el('button', { id: 'satBolt', type: 'button', title: 'Komut paleti (Ctrl+K)', 'aria-label': 'Komut paleti', onclick: () => palette() }, '⚡'));

  /* ================= 2) AKILLI HIZLI KAYIT ================= */
  const patientIn = t => { const f = fold(t); let best = null; for (const p of P()) { const full = fold(p.ad), firstN = full.split(' ')[0]; if (f.includes(full)) return p; if (firstN.length >= 3 && new RegExp('(^|\\s)' + firstN + "('|’)?\\w{0,4}(\\s|$)").test(f) && !best) best = p; } return best; };
  function quickCapture(t0) {
    const t = String(t0 || '').trim(), f = fold(t);
    if (t.length > 120 || /\?$/.test(t)) return null;
    const p = patientIn(t), a = amount(t);
    const undoOf = fn => fn;
    // hasta ödemesi
    if (p && a > 0 && /(odedi|verdi|yatirdi|getirdi|tahsil|nakit|kartla|eft|havale)/.test(f)) {
      setTimeout(async () => { try { const amt = String(a).replace('.', ','); const R = store.get('receivables', []).filter(r => fold(r.ad) === fold(p.ad) && r.tutar - (r.odenen || []).reduce((s, x) => s + x.amt, 0) > 0); const txt = await runTool(R.length ? `alacak|ode|${p.ad}|${amt}` : `kasa|gelir|${amt}|${p.ad} ödeme`, false); bubble('ai', `⚡ ${nm(p)} → ${tl(a)} kasaya gelir yazıldı${R.length ? ' ve açık alacağından düşüldü' : ''}.\n${txt}`); } catch (e) { note(e.message); } }, 5);
      return `⚡ ${nm(p)} ödemesi kaydediliyor (${tl(a)})…`;
    }
    // hasta borcu
    if (p && a > 0 && /(borclu|borcu var|veresiye|sonra odeyecek|odemedi)/.test(f)) { setTimeout(() => runTool(`alacak|ekle|${p.ad}|${String(a).replace('.', ',')}|hızlı kayıt`).catch(e => note(e.message)), 5); return `⚡ ${nm(p)} için ${tl(a)} alacak kaydediliyor…`; }
    // seans
    let m;
    if (p && /(seans|tedavi)\s*(yapildi|yaptik|bitti|tamam|geldi)|geldi\s*seans/.test(f)) { const v = (f.match(/agri(?:si)?\s*(\d{1,2})/) || f.match(/vas\s*(\d{1,2})/) || [])[1]; const not = t.replace(/^.*?(yapıldı|yaptık|bitti|tamam|geldi)\s*/i, '').replace(/ağrı(sı)?\s*\d{1,2}/i, '').trim(); setTimeout(() => runTool(`seans_ekle|${p.ad}|${v ?? ''}|${not || 'hızlı kayıt'}`).catch(e => note(e.message)), 5); return `⚡ ${nm(p)} seansı kaydediliyor${v ? ' (ağrı ' + v + ')' : ''}…`; }
    // gider
    if (!p && a > 0 && (m = f.match(/^(.{2,40}?)\s+(?:icin\s+)?[\d.,]+\s*(?:bin|k)?\s*(?:tl|lira)?\s*(odedim|harcadim|verdim|aldim|odendi)$/))) { setTimeout(() => runTool(`kasa|gider|${String(a).replace('.', ',')}|${m[1]}`).catch(e => note(e.message)), 5); return `⚡ Gider kaydediliyor: ${m[1]} ${tl(a)}…`; }
    // hasta notu
    if (p && (m = t.match(/^\S+(?:\s+\S+)?\s+(?:hakkında|için)?\s*not[:\s]+(.{4,})$/i))) { p.notlar = [...(p.notlar || []), { t: Date.now(), not: m[1] }].slice(-50); if (typeof savePatients === 'function') savePatients(); return `📝 ${nm(p)} dosyasına not eklendi.`; }
    return null;
  }

  /* ================= 3) SEANS SERİSİ PLANLAYICI ================= */
  const DAYSET = { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] };
  function planSeries(pq, nRaw, perWeekRaw, timeRaw, startRaw) {
    const p = P().find(x => fold(x.ad) === fold(pq)) || (typeof findPatient === 'function' ? findPatient(pq) : null);
    const N = Math.max(1, Math.min(40, parseInt(nRaw, 10) || 10)), W = Math.max(1, Math.min(6, parseInt(perWeekRaw, 10) || 3));
    const tm = (String(timeRaw || '').match(/(\d{1,2})[:.]?(\d{2})?/) || []); let H = tm[1] ? +tm[1] : 14, M = tm[2] ? +tm[2] : 0;
    const name = p?.ad || String(pq || '').trim(); if (!name) throw Error('Biçim: seri_planla|hasta|seans sayısı|haftada kaç|saat|başlangıç (yarın/YYYY-MM-DD)');
    const hol = new Set([...(store.get('tatil.' + new Date().getFullYear(), []) || []), ...(store.get('tatil.' + (new Date().getFullYear() + 1), []) || [])].map(x => x[0]));
    const busy = IT().filter(i => i.kind === 'task' && !i.done && i.due).map(i => i.due);
    let d = new Date(now()); d.setHours(0, 0, 0, 0); d = new Date(d.getTime() + DAY);
    if (/^\d{4}-\d\d-\d\d$/.test(startRaw || '')) d = new Date(startRaw + 'T00:00:00'); else if (/bugun/.test(fold(startRaw || ''))) d = new Date(d.getTime() - DAY);
    const days = DAYSET[W], out = []; let guard = 0;
    while (out.length < N && guard++ < 400) {
      const iso = isoLocal(d).slice(0, 10);
      if (days.includes(d.getDay()) && !hol.has(iso)) {
        let h = H, mm = M, ok = false;
        for (let k = 0; k < 8 && !ok; k++) { const slot = `${iso}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; const clash = busy.some(b => b.slice(0, 10) === iso && Math.abs((+b.slice(11, 13) * 60 + +b.slice(14, 16)) - (h * 60 + mm)) < 45); if (!clash && h >= 8 && h <= 19) { out.push(slot); busy.push(slot); ok = true; } else { h = h + 1 > 19 ? 9 : h + 1; } }
      }
      d = new Date(d.getTime() + DAY);
    }
    return { name, p, out, N, W };
  }
  function planText(r) { const fmt = s => new Date(s).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); return `📆 ${r.name}: ${r.out.length} seans, haftada ${r.W} (pazar ve resmi tatiller atlandı, mevcut randevularla çakışma yok)\n${r.out.map((s, i) => `${i + 1}. ${fmt(s)}`).join('\n')}`; }
  function planCommit(r) { r.out.forEach((s, i) => saveItem({ kind: 'task', text: `Seans: ${r.name} (${i + 1}/${r.out.length})`, due: s })); if (r.p) { r.p.paket = r.out.length; r.p.paketBas = Date.now(); if (typeof savePatients === 'function') savePatients(); } return `✓ ${r.out.length} seans takvime eklendi${r.p ? ' ve ' + r.out.length + ' seanslık paket başlatıldı' : ''}.`; }
  function planCard(r) { const b = bubble('ai', planText(r)); b.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', class: 'yes', onclick: ev => { ev.target.disabled = true; note(planCommit(r)); } }, '✓ Takvime ekle'), r.p?.tel ? el('button', { type: 'button', onclick: () => window.open(`https://wa.me/${String(r.p.tel).replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(`Merhaba ${r.name.split(' ')[0]}, seans programınız:\n` + r.out.map((s, i) => `${i + 1}) ${new Date(s).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`).join('\n') + '\nFİZYOVİTA')}`, '_blank', 'noopener') }, '💬 Hastaya gönder') : null)); }

  /* ================= 4) AYLIK GELİR HEDEFİ ================= */
  function revenue(goalRaw) {
    if (goalRaw && amount(goalRaw) > 0) store.set('set.revGoal', String(amount(goalRaw)));
    const G = Number(store.get('set.revGoal', 0)); const m = todayK().slice(0, 7);
    const got = store.get('ledger', []).filter(x => x.d.startsWith(m) && x.type === 'gelir').reduce((a, x) => a + x.amt, 0);
    const d = new Date(now()), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    let workDone = 0, workLeft = 0; for (let i = 1; i <= last; i++) { const w = new Date(d.getFullYear(), d.getMonth(), i).getDay(); if (w === 0) continue; i <= d.getDate() ? workDone++ : workLeft++; }
    const pace = workDone ? got / workDone : 0, proj = got + pace * workLeft;
    if (!G) return `💹 Bu ay gelir: ${tl(got)} · iş günü ortalaması ${tl(pace)} · ay sonu tahmini ${tl(proj)}. Hedef koymak için: “gelir hedefim 150000”.`;
    const need = workLeft ? Math.max(0, (G - got) / workLeft) : 0, pct = Math.round(got / G * 100);
    return `💹 AYLIK GELİR HEDEFİ ${tl(G)}\nŞu an: ${tl(got)} (%${pct}) · ${workDone} iş günü geçti, ${workLeft} kaldı\nTempo: günde ${tl(pace)} → ay sonu tahmini ${tl(proj)} (${proj >= G ? '✓ hedefe ulaşır' : '⚠ hedefin ' + tl(G - proj) + ' gerisinde'})\n${got >= G ? '🎉 Hedef tamamlandı!' : `Hedef için kalan her iş gününde ≈ ${tl(need)} gerekiyor${pace && need / pace < 4 ? ' (bugünkü tempondan %' + Math.round((need / pace - 1) * 100) + ' ' + (need > pace ? 'fazla' : 'az') + ')' : ''}.`}`;
  }

  /* ================= 5) BIRAKMA RİSKİ ================= */
  function risk() {
    const now0 = Date.now(), rows = [];
    for (const p of P()) {
      const s = (p.seanslar || []).map(x => x.t).sort((a, b) => a - b); if (!s.length || now0 - s.at(-1) > 75 * DAY) continue;
      const gaps = s.slice(1).map((t, i) => t - s[i]), avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 4 * DAY, since = now0 - s.at(-1);
      const v = (p.seanslar || []).filter(x => x.vas != null), vTrend = v.length >= 3 ? v.at(-1).vas - v[0].vas : 0;
      const left = p.paket ? p.paket - (p.seanslar || []).filter(x => x.t >= (p.paketBas || 0)).length : null;
      let r = 0; const why = [];
      if (since > avg * 2 && since > 6 * DAY) { r += Math.min(45, Math.round(since / avg * 10)); why.push(`${Math.round(since / DAY)} gündür yok (normalde ${Math.max(1, Math.round(avg / DAY))} günde bir)`); }
      if (vTrend >= 0 && v.length >= 3) { r += 25; why.push('ağrı düşmüyor'); }
      if (s.length <= 2) { r += 15; why.push('yalnız ' + s.length + ' seans'); }
      if (left != null && left > 0 && since > 7 * DAY) { r += 15; why.push(`paketinde ${left} seans var`); }
      if (!p.program) { r += 5; why.push('ev programı yok'); }
      if (r >= 25) rows.push({ p, r: Math.min(100, r), why });
    }
    rows.sort((a, b) => b.r - a.r);
    return rows.length ? '🚨 TEDAVİYİ BIRAKMA RİSKİ\n' + rows.slice(0, 10).map(x => `${x.r >= 60 ? '🔴' : x.r >= 40 ? '🟠' : '🟡'} ${nm(x.p)} — ${x.r}/100 · ${x.why.join(', ')}`).join('\n') + '\nYüksek riskliler için “takip listesi” hazır mesajlar verir.' : '✓ Belirgin bırakma riski olan aktif hasta yok.';
  }

  /* ================= 6) AKILLI ÖNBELLEK ================= */
  const TIMELY = /(bugun|simdi|su an|guncel|son dakika|haber|fiyat|kur|dolar|euro|altin|borsa|bitcoin|btc|hava|saat|tarih|yarin|dun|bu hafta|bu ay|randevu|gorev|hasta|kasa|takvim|hatirlat|benim|bana|bizim)/;
  if (window.jarvisResearch?.ask) {
    const orig = window.jarvisResearch.ask.bind(window.jarvisResearch);
    const C = () => store.get('askCache', {});
    window.jarvisResearch.ask = async (system, user, tier = 'default', search = false, image) => {
      const key = !image && !search && String(user).length < 600 && !TIMELY.test(fold(String(user))) ? (tier + '|' + fold(String(system)).slice(0, 80) + '|' + fold(String(user))).slice(0, 900) : null;
      if (key) { const c = C()[key]; if (c && Date.now() - c.t < 6 * 3600000) { window.jarvisCacheHits = (window.jarvisCacheHits || 0) + 1; return c.v; } }
      const v = await orig(system, user, tier, search, image);
      if (key && v && v.length > 20) { const c = C(); c[key] = { t: Date.now(), v }; const keys = Object.keys(c); if (keys.length > 120) for (const k of keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 120)) delete c[k]; store.set('askCache', c); }
      return v;
    };
  }

  /* ================= 7) SIRADAKİ EYLEM çipi ================= */
  const chip = el('button', { id: 'satChip', type: 'button', onclick: () => { $id('drawer')?.classList.add('open'); $id('t-hub')?.click(); } });
  document.body.append(chip);
  setInterval(() => { const n = document.querySelectorAll('#proList li.item').length; chip.style.display = n ? 'block' : 'none'; chip.textContent = `💡 ${n} öneri`; }, 3000);

  /* ================= proaktif kural: gelir hedefi geride ================= */
  window.jarvisProaktif?.RULES.push({ id: 'gelir_hedef', when: () => new Date().getDate() >= 10 && [1, 4].includes(new Date().getDay()), check() { const G = Number(store.get('set.revGoal', 0)); if (!G) return []; const t = revenue(); return /gerisinde/.test(t) ? [{ key: 'gh' + todayK(), icon: '💹', text: t.split('\n').slice(0, 3).join(' · '), actions: [{ label: '🚨 Riskli hastalar', main: true, run: () => bubble('ai', risk()) }, { label: '📊 İşletme analizi', run: () => runTool('isletme_analizi') }] }] : []; } },
    { id: 'risk', when: () => new Date().getDay() === 2, check() { const t = risk(); return /🔴/.test(t) ? [{ key: 'risk' + todayK(), icon: '🚨', text: t.split('\n').slice(0, 3).join(' · '), actions: [{ label: '📞 Takip listesi', main: true, run: () => runTool('takip_listesi|14') }] }] : []; } });

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    seri_planla: { d: 'seri_planla|hasta|seans sayısı|haftada kaç|saat (14:00)|başlangıç (yarın/YYYY-MM-DD) — çakışmasız, pazar/tatil atlayan seans serisi; onayla takvime ekler ve paketi başlatır', run: ([a, b, c, d, e]) => { const r = planSeries(a, b, c, d, e); planCard(r); return planText(r) + '\n(Takvime eklemek için kartın altındaki düğmeye bas.)'; } },
    gelir_hedefi: { d: 'gelir_hedefi|aylık hedef TL (boş: durum) — bu ayın geliri, tempo, ay sonu tahmini, kalan gün başına gereken', run: ([g]) => revenue(g) },
    birakma_riski: { d: 'birakma_riski — aktif hastaların tedaviyi bırakma risk puanı (0-100) ve nedenleri', run: () => risk() },
    komut_paleti: { d: 'komut_paleti|arama — tüm özellikler/hastalar/görevler içinde arama paletini açar (Ctrl+K)', run: ([q]) => { palette(q || ''); return 'Komut paleti açıldı.'; } }
  });
  TOOL_GROUPS.push([/seans planla|seri|haftada \d|gelir hedef|hedefim|ciro|risk|bırak|birak|palet/i, /^(seri_planla|gelir_hedefi|birakma_riski|komut_paleti)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nHIZ/ZEKÂ: seans serisi/randevu programı → seri_planla; aylık gelir hedefi/tempo → gelir_hedefi; tedaviyi bırakabilecek hastalar → birakma_riski.';
  const _lc = localCommand;
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    let m;
    if ((m = t.match(/^(.{3,40}?)\s+(?:için|icin)\s+(\d{1,2})\s*seans\s*(?:,?\s*haftada\s*(\d))?(?:\s*(?:saat\s*)?(\d{1,2}[:.]\d{2}|\d{1,2})(?:'?(?:de|da|te|ta))?)?(?:\s*(planla|ayarla|programla))?$/i))) { try { const r = planSeries(m[1], m[2], m[3] || 3, m[4] || '14:00'); planCard(r); return null === r ? '' : '📆 Seans serisi hazır — kontrol edip “Takvime ekle”ye bas.'; } catch (e) { return e.message; } }
    if ((m = f.match(/^(?:aylik\s+)?(?:gelir|ciro)\s+hedef(?:im|i)?\s*(.*)$/))) return revenue(m[1]);
    if (/^(birakma riski|riskli hastalar|hasta riski)$/.test(f)) return risk();
    if (/^(komut paleti|palet|ara)$/.test(f)) { palette(); return 'Komut paleti açıldı (Ctrl+K).'; }
    const q = quickCapture(t0); if (q) return q;
    return _lc(t0);
  };
  window.jarvisHizli = { palette, quickCapture, planSeries, planText, planCommit, revenue, risk, amount };
})();
