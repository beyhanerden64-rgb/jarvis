'use strict';
/* SATÜRN 32 — AKIL
 *  1) BAĞLAM TAKİBİ: az önce konuştuğun hastayı hatırlar — “o kaç seansta iyileşir”, “onun için 10 seans haftada 3”, “o 1500 ödedi”, “ona mesaj yaz”
 *  2) YAZIM HATASI TOLERANSI: “Aysee 1500 ödedi”, “Alı seans yapıldı” → doğru hastayı bulur
 *  3) “ŞİMDİ NE YAPAYIM”: tüm verini tarayıp önceliklendirir — gecikmiş işler, yaklaşan randevu, ödemesi girilmemiş seanslar (isimle), eski alacaklar, riskli hastalar, gelir hedefi — en önemli 5 iş, tek dokunuşla
 *  4) GİDER ZEKÂSI: giderleri kendiliğinden kategorilere ayırır (kira, fatura, maaş, malzeme, vergi…), bu ayı son 3 ayla kıyaslar, olağandışı artışı yakalar
 *  5) SENİ ÖĞRENEN ÖNERİLER: en sık yazdığın komutlar yazarken öneri listesinin başına geçer
 *  6) KISA YANIT MODU ZEKÂSI: “aynısı”, “tekrar” → son yerel komutu yeniden çalıştırır */
(() => {
  const DAY = 86400000, P = () => (typeof patients !== 'undefined' ? patients : []);
  const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
  const tl = v => Math.round(v).toLocaleString('tr-TR') + ' TL';
  const ymd = d => isoLocal(d).slice(0, 10);

  /* ---------- 2) yazım hatası toleransı ---------- */
  const lev = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  const COMMON = new Set('bugun yarin kasa gorev hava altin dolar euro kira fatura seans hasta saat ekle sil geri yedek kontrol gelir gider borc odedi notu not'.split(' '));
  function fixName(t) {
    const m = t.match(/^(\S{3,})(\s+\S+)?/); if (!m) return { t };
    const w = fold(m[1]).replace(/['’].*$/, ''), w2 = m[2] ? fold(m[2]).trim() : '';
    if (COMMON.has(w) || !/\d|odedi|verdi|seans|borclu|iyiles|icin|ilerleme|epikriz|randevu|not[:\s]/.test(fold(t))) return { t };
    const firsts = P().map(p => ({ p, f: fold(p.ad).split(' ')[0], s: fold(p.ad).split(' ')[1] || '' }));
    if (firsts.some(x => x.f === w)) return { t };
    const tol = w.length >= 5 ? 2 : 1;
    const hits = firsts.filter(x => w.length >= 3 && lev(w, x.f) <= tol);
    if (hits.length !== 1 && w2) { const h2 = hits.filter(x => x.s && lev(w2, x.s) <= 1); if (h2.length === 1) hits.splice(0, hits.length, h2[0]); }
    if (hits.length !== 1) return { t };
    const p = hits[0].p, surnameTyped = w2 && hits[0].s && lev(w2, hits[0].s) <= 1;
    return { t: t.replace(surnameTyped ? m[0] : m[1], surnameTyped ? p.ad : p.ad.split(' ')[0]), fixed: p };
  }

  /* ---------- 1) bağlam takibi ---------- */
  let ctxP = null, ctxT = 0;
  const mentioned = t => { const f = fold(t); return P().find(p => f.includes(fold(p.ad))) || P().find(p => { const fn = fold(p.ad).split(' ')[0]; return fn.length >= 3 && new RegExp('(^|\\s)' + fn + "(['’]?\\w{0,4})?(\\s|$)").test(f); }); };
  function resolvePronoun(t) {
    if (!ctxP || Date.now() - ctxT > 15 * 60000) return t;
    const ad = ctxP.ad;
    const rules = [
      [/^(?:onun|ona|onu)\s+(?:için|icin)\s+/i, ad + ' için '],
      [/^ona\s+(\d{1,2}\s*seans)/i, ad + ' için $1'],
      [/^(?:o|onun)\s+(?:hasta\s+)?(kaç|kac)\s+/i, ad + ' $1 '],
      [/^(?:o|hasta)\s+(\d)/i, ad.split(' ')[0] + ' $1'],
      [/^(?:o|onun)\s+(seans|tedavi)/i, ad.split(' ')[0] + ' $1'],
      [/^onun\s+(ilerleme(?:si)?|epikriz(?:i)?|dosyası|dosyasi|programı|programi)/i, ad + ' $1'],
      [/^(ona|onunla)\s+(randevu|mesaj)/i, ad + ' $2'],
      [/^(o|onun)\s+(\d+)\s*(tl)?\s*(borçlu|borclu)/i, ad + ' $2 TL borçlu']
    ];
    for (const [re, rep] of rules) if (re.test(t)) return t.replace(re, rep).replace(/ilerlemesi$/i, 'ilerleme').replace(/epikrizi$/i, 'için epikriz').replace(/(randevu)$/i, 'randevu öner');
    return t;
  }

  /* ---------- 5) seni öğrenen öneriler ---------- */
  const HK = 'cmdHist';
  function learn(t) { const f = String(t).trim(); if (f.length < 4 || f.length > 60 || /\n/.test(f)) return; const h = store.get(HK, {}); h[f] = (h[f] || 0) + 1; const ks = Object.keys(h); if (ks.length > 80) for (const k of ks.sort((a, b) => h[a] - h[b]).slice(0, ks.length - 80)) delete h[k]; store.set(HK, h); }
  const hist = () => { const h = store.get(HK, {}); return Object.keys(h).filter(k => h[k] >= 2).sort((a, b) => h[b] - h[a]); };
  const sugBox = document.getElementById('satSug'), pr = document.getElementById('prompt');
  pr?.addEventListener('input', () => setTimeout(() => {
    const f = fold(pr.value).trim(); if (f.length < 2 || !sugBox) return;
    const mine = hist().filter(k => fold(k).startsWith(f) && fold(k) !== f).slice(0, 3); if (!mine.length) return;
    const have = new Set([...sugBox.children].map(c => c.firstChild?.textContent));
    const add = mine.filter(m => !have.has(m)).map(s => el('div', { role: 'option', onmousedown: e => { e.preventDefault(); pr.value = s; try { autosize(); } catch {} pr.focus(); sugBox.style.display = 'none'; } }, '★ ' + s));
    if (!add.length) return;
    sugBox.prepend(...add); while (sugBox.children.length > 7) sugBox.lastChild.remove();
    if (sugBox.style.display !== 'block') { const r = pr.getBoundingClientRect(); sugBox.style.display = 'block'; sugBox.style.left = Math.max(6, r.left) + 'px'; sugBox.style.bottom = (innerHeight - r.top + 6) + 'px'; }
  }, 0));

  /* ---------- 3) şimdi ne yapayım ---------- */
  const paidToday = (p, d) => store.get('ledger', []).some(x => x.d === d && x.type === 'gelir' && fold(x.desc || '').includes(fold(p.ad).split(' ')[0]));
  function priorities() {
    const t0 = Date.now(), d = ymd(new Date()), A = [];
    const late = items.filter(i => i.kind === 'task' && !i.done && i.due && new Date(i.due).getTime() < t0 - 30 * 60000);
    const soon = items.filter(i => i.kind === 'task' && !i.done && i.due && new Date(i.due).getTime() >= t0 - 10 * 60000 && new Date(i.due).getTime() < t0 + 2 * 3600000).sort((a, b) => a.due.localeCompare(b.due));
    if (soon.length) { const m = Math.round((new Date(soon[0].due) - t0) / 60000); A.push({ s: 100 - Math.max(0, m) / 3, icon: '⏰', text: `${soon[0].due.slice(11, 16)} — ${short(soon[0].title || soon[0].text, 50)} (${m <= 0 ? 'şimdi' : m + ' dk sonra'})`, label: 'Bugünün programı', cmd: 'bugün ne var' }); }
    const unpaid = P().filter(p => (p.seanslar || []).some(s => ymd(new Date(s.t)) === d) && !(p.paket && p.paketBas) && !paidToday(p, d));
    if (unpaid.length) A.push({ s: 80, icon: '🧾', text: `Bugün seansı yapılıp ödemesi kasada görünmeyen: ${unpaid.slice(0, 5).map(nm).join(', ')}`, label: `${unpaid[0].ad.split(' ')[0]} ödemesini yaz`, prefill: `${unpaid[0].ad.split(' ')[0]} ` + (avgFee() || 1000) + ' ödedi' });
    if (late.length) A.push({ s: 70 + Math.min(15, late.length * 3), icon: '⚠', text: `${late.length} gecikmiş görev${late.length ? ': ' + short(late[0].title || late[0].text, 40) + (late.length > 1 ? '…' : '') : ''}`, label: 'Görevleri aç', run: () => { document.getElementById('drawer')?.classList.add('open'); document.getElementById('t-tasks')?.click(); } });
    const R = store.get('receivables', []).map(r => ({ r, left: r.tutar - (r.odenen || []).reduce((s, x) => s + x.amt, 0) })).filter(x => x.left > 0);
    const old = R.filter(x => t0 - x.r.t > 14 * DAY);
    if (old.length) A.push({ s: 55 + Math.min(20, old.length * 4), icon: '💰', text: `${old.length} alacak 2 haftayı geçti, toplam ${tl(old.reduce((s, x) => s + x.left, 0))} (${old.slice(0, 3).map(x => x.r.ad.split(' ')[0]).join(', ')})`, label: 'Hatırlatma mesajları', cmd: 'alacakları hatırlat' });
    const rk = window.jarvisHizli?.risk?.() || ''; const red = (rk.match(/🔴/g) || []).length;
    if (red) A.push({ s: 60, icon: '🚨', text: `${red} hasta tedaviyi bırakma riskinde`, label: 'Riskli hastalar', cmd: 'bırakma riski' });
    const rc = window.jarvisZeki?.recallList?.() || []; if (rc.length) A.push({ s: 35, icon: '📞', text: `${rc.length} eski hastaya kontrol mesajı atılabilir`, label: 'Kontrol çağrısı', cmd: 'kontrol çağrısı' });
    const G = Number(store.get('set.revGoal', 0)); if (G) { const rv = window.jarvisHizli.revenue(); if (/gerisinde/.test(rv)) A.push({ s: 45, icon: '💹', text: rv.split('\n')[2] || 'Gelir hedefinin gerisindesin', label: 'Hedef durumu', cmd: 'gelir hedefi' }); }
    const noProg = P().filter(p => (p.seanslar || []).length >= 3 && !p.program && t0 - Math.max(...p.seanslar.map(s => s.t)) < 14 * DAY);
    if (noProg.length) A.push({ s: 30, icon: '🏋', text: `${noProg.length} aktif hastanın ev programı yok (${noProg.slice(0, 3).map(nm).join(', ')})`, label: 'Program yaz', prefill: `${noProg[0].ad} için ev egzersiz programı` });
    const lastBk = store.get('lastBackup', 0); if (t0 - lastBk > 30 * DAY) A.push({ s: 20, icon: '💾', text: 'Bilgisayara indirilmiş yedeğin 30 günden eski (cihaz içi otomatik yedek açık)', label: 'Yedek indir', cmd: 'yedek al' });
    return A.sort((a, b) => b.s - a.s).slice(0, 5);
  }
  const avgFee = () => { const L = store.get('ledger', []).filter(x => x.type === 'gelir' && x.amt >= 200 && x.amt <= 10000).slice(-40).map(x => x.amt).sort((a, b) => a - b); return L.length >= 3 ? L[Math.floor(L.length / 2)] : 0; };
  function nowCard() {
    const A = priorities();
    if (!A.length) { bubble('ai', '✓ Şu an acil bir iş görünmüyor: gecikmiş görev, ödenmemiş seans, eski alacak ya da riskli hasta yok. Güzel gidiyor.'); return '✓ Acil iş yok.'; }
    const b = bubble('ai', '🎯 ŞİMDİ NE YAPMALI — önem sırasıyla\n' + A.map((a, i) => `${i + 1}. ${a.icon} ${a.text}`).join('\n'));
    b.el.append(el('div', { class: 'tool' }, ...A.map((a, i) => el('button', { type: 'button', class: i === 0 ? 'yes' : '', onclick: () => { if (a.run) return a.run(); if (a.prefill) { const p = document.getElementById('prompt'); p.value = a.prefill; try { autosize(); } catch {} p.focus(); return; } typedTurn(a.cmd, false); } }, a.icon + ' ' + a.label))));
    return `🎯 ${A.length} öncelik: ` + A.map(a => a.text).join(' · ');
  }

  /* ---------- 4) gider zekâsı ---------- */
  const CATS = [['Kira', /kira|aidat/], ['Fatura', /fatura|elektrik|su |dogalgaz|dogal gaz|internet|telefon|turkcell|vodafone|turk telekom/], ['Personel', /maas|personel|sgk|prim|avans|yevmiye/], ['Malzeme', /malzeme|bant|jel|elektrot|havlu|ped|sarf|tens|cihaz|alet/], ['Vergi/muhasebe', /vergi|kdv|stopaj|muhasebe|mali musavir|bagkur/], ['Ulaşım/yakıt', /yakit|benzin|mazot|motorin|otopark|taksi|ulasim/], ['Temizlik', /temizlik|deterjan|camasir/], ['Reklam', /reklam|instagram|tanitim|matbaa|brosur|kartvizit/], ['Yemek/mutfak', /yemek|cay|kahve|market|mutfak|su$/], ['Bakım/onarım', /tamir|bakim|onarim|servis/]];
  const catOf = desc => (CATS.find(([, re]) => re.test(' ' + fold(desc || '') + ' ')) || ['Diğer'])[0];
  function expenses() {
    const L = store.get('ledger', []).filter(x => x.type === 'gider'); if (!L.length) return 'Henüz gider kaydı yok. Örn: “kira 15000 ödedim”.';
    const mk = o => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - o); return isoLocal(d).slice(0, 7); };
    const cur = mk(0), prev = [mk(1), mk(2), mk(3)];
    const sum = (m, c) => L.filter(x => x.d.startsWith(m) && (!c || catOf(x.desc) === c)).reduce((a, x) => a + x.amt, 0);
    const cats = [...new Set(L.map(x => catOf(x.desc)))];
    const rows = cats.map(c => { const now0 = sum(cur, c), avg = prev.reduce((a, m) => a + sum(m, c), 0) / 3; return { c, now0, avg }; }).filter(r => r.now0 || r.avg).sort((a, b) => b.now0 - a.now0);
    const tot = sum(cur), totAvg = prev.reduce((a, m) => a + sum(m), 0) / 3;
    const flags = rows.filter(r => r.avg > 0 && r.now0 > r.avg * 1.5 && r.now0 - r.avg > 1000);
    return `🧮 GİDER ANALİZİ — ${cur}\nBu ay toplam ${tl(tot)}${totAvg ? ` (son 3 ay ort. ${tl(totAvg)}, ${tot >= totAvg ? '+' : ''}${Math.round((tot / totAvg - 1) * 100)}%)` : ''}\n` +
      rows.map(r => `• ${r.c}: ${tl(r.now0)}${r.avg ? ` — ort. ${tl(r.avg)}` : ''}`).join('\n') +
      (flags.length ? `\n⚠ Olağandışı artış: ${flags.map(r => `${r.c} (+${tl(r.now0 - r.avg)})`).join(', ')}` : '\n✓ Olağandışı artış yok.');
  }
  window.jarvisProaktif?.RULES.push({ id: 'gider_anomali', when: () => new Date().getDay() === 5 && new Date().getHours() >= 12, check() { const t = expenses(); return /Olağandışı artış:/.test(t) ? [{ key: 'ga' + ymd(new Date()).slice(0, 7) + (t.match(/⚠.*$/m) || [''])[0].length, icon: '🧮', text: (t.match(/⚠.*$/m) || [''])[0], actions: [{ label: 'Gider analizi', main: true, run: () => bubble('ai', expenses()) }] }] : []; } });

  /* ---------- araçlar + komutlar ---------- */
  Object.assign(TOOLS, {
    simdi_ne_yapayim: { d: 'simdi_ne_yapayim — tüm veriyi tarayıp şu an yapılması gereken en önemli 5 işi önceliklendirir', run: () => nowCard() },
    gider_analizi: { d: 'gider_analizi — giderleri kategorilere ayırır, bu ayı son 3 ayla kıyaslar, olağandışı artışı bulur', run: () => expenses() }
  });
  TOOL_GROUPS.push([/ne yapay|ne yapmal|öncelik|oncelik|gider|masraf|harcama/i, /^(simdi_ne_yapayim|gider_analizi)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nAKIL: “şimdi ne yapayım/neye öncelik vermeliyim” → simdi_ne_yapayim; masraf/gider nereye gidiyor → gider_analizi.' + (ctxP && Date.now() - ctxT < 15 * 60000 ? `\nBAĞLAM: Kullanıcının az önce konuştuğu hasta: ${nm(ctxP)} — “o/ona/onun” bu hastayı kastediyor olabilir.` : '');
  let lastCmd = null;
  const _lc = localCommand;
  localCommand = t0 => {
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    let t = String(t0 || '').trim(); const f = fold(t).replace(/[?!.]+$/, '');
    if (/^(simdi ne yapayim|simdi ne yapmaliyim|ne yapmaliyim|oncelikler|bugun neye oncelik vereyim|siradaki is ne)$/.test(f)) return nowCard();
    if (/^(gider analizi|masraflar|giderlerim|para nereye gidiyor|harcama analizi)$/.test(f)) return expenses();
    if (/^(aynisi|tekrar|bir daha|yine)$/.test(f) && lastCmd) return localCommand(lastCmd);
    const before = t;
    t = resolvePronoun(t);
    const fx = fixName(t); t = fx.t;
    const p = fx.fixed || mentioned(t); if (p) { ctxP = p; ctxT = Date.now(); }
    const r = _lc(t);
    if (r != null) { lastCmd = t; learn(before); if (t !== before && typeof r === 'string') return r + (fx.fixed ? `\n(“${before.split(/\s+/)[0]}” → ${nm(fx.fixed)} olarak anladım)` : ''); }
    return r;
  };
  window.jarvisAkil = { fixName, resolvePronoun, priorities, nowCard, expenses, catOf, hist, ctx: () => ctxP };
})();
