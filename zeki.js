'use strict';
/* SATÜRN 31 — ZEKİ YAZIM ve GÜVENLİK AĞI
 *  1) YAZARKEN ÖNERİ: kutuya yazmaya başlayınca uygun komutlar ve hasta adları belirir; Tab veya dokunuşla tamamla
 *  2) GERİ AL: “geri al” — son kayıt işlemini (kasa, alacak, seans, hasta, görev, seans serisi) tek komutla geri çevirir (son 8 işlem)
 *  3) İYİLEŞME SÜRESİ TAHMİNİ: “Ayşe kaç seansta iyileşir” — hastanın kendi ağrı eğilimi + aynı tanılı eski hastaların verisi
 *  4) KONTROL ÇAĞRISI: tedavisi 1,5–6 ay önce biten hastalara nazik kontrol mesajı (WhatsApp, tek dokunuş); pazartesi proaktif kart
 *  5) OTOMATİK GÜNLÜK YEDEK: her gün cihazın içine sessiz yedek (son 7 gün) — “yedekler”, “yedekten dön 2026-11-24”
 *  6) SIRADAKİ RANDEVU ÇİPİ: önümüzdeki 3 saatteki randevu geri sayımla ekranda
 *  7) ÖĞRENEN SAAT: seans serisinde saat verilmezse hastanın her zamanki saati kullanılır */
(() => {
  const DAY = 86400000, $id = id => document.getElementById(id);
  const P = () => (typeof patients !== 'undefined' ? patients : []);
  const nm = p => (typeof aiName === 'function' ? aiName(p) : p.ad);
  const ymd = d => isoLocal(d).slice(0, 10);

  /* ================= 2) GERİ AL ================= */
  const KEYS = ['ledger', 'receivables', 'patients', 'items'];
  const MUT = /^(kasa|alacak|seans_ekle|seans_notu|hasta_ekle|program_kaydet|paket|makbuz|envanter|portfoy|gorev|hatirlat|not_ekle|ilac_hatirlatici|onemli_gun|hedef|seri_planla)$/;
  const stack = [];
  function snap(label) { const s = { label, t: Date.now(), v: {} }; for (const k of KEYS) s.v[k] = localStorage.getItem('jarvisapp.' + k); stack.push(s); if (stack.length > 8) stack.shift(); }
  function undo() {
    const s = stack.pop(); if (!s) return 'Geri alınacak yakın bir kayıt işlemi yok (yalnız bu oturumdaki son 8 işlem geri alınabilir).';
    for (const k of KEYS) { if (s.v[k] == null) localStorage.removeItem('jarvisapp.' + k); else localStorage.setItem('jarvisapp.' + k, s.v[k]); }
    patients.splice(0, patients.length, ...store.get('patients', []));
    items = store.get('items', []);
    try { renderItems(); renderPatients(); scheduleSync(); } catch {}
    return `↩ Geri alındı: ${s.label} (${new Date(s.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}).${stack.length ? ` ${stack.length} işlem daha geri alınabilir.` : ''}`;
  }
  const _rt = window.jarvisRunTools;
  window.jarvisRunTools = async (calls, ctx) => {
    const muts = (calls || []).map(c => String(c).split('|')).filter(a => MUT.test(a[0]) || (typeof WRITE_TOOLS !== 'undefined' && WRITE_TOOLS.has(a[0]) && a[0] !== 'pc' && a[0] !== 'ev'));
    if (muts.length) snap(muts.map(a => a.slice(0, 3).join(' ')).join(', ').slice(0, 90));
    return _rt(calls, ctx);
  };

  /* ================= 3) İYİLEŞME SÜRESİ TAHMİNİ ================= */
  const vasOf = p => (p.seanslar || []).map(x => x.vas).filter(v => v != null && v !== '').map(Number).filter(Number.isFinite);
  const keyWord = t => fold(t || '').split(/[^a-z0-9]+/).find(w => w.length >= 3 && !/^(sag|sol|ve|ile|agri|agrisi|kronik|akut)$/.test(w)) || '';
  function eta(q) {
    const p = (typeof findPatient === 'function' && findPatient(q)) || null;
    if (!p) return `“${q}” adlı hasta bulunamadı.`;
    const v = vasOf(p), n = (p.seanslar || []).length, kw = keyWord(p.tani);
    // aynı tanılı geçmiş hastalar: ağrının ilk kez ≤2 olduğu seans
    const coh = P().filter(o => o !== p && kw && fold(o.tani || '').includes(kw)).map(o => { const vs = vasOf(o); const i = vs.findIndex(x => x <= 2); return vs.length >= 2 && i > 0 ? i + 1 : null; }).filter(Boolean).sort((a, b) => a - b);
    const med = coh.length ? coh[Math.floor(coh.length / 2)] : null;
    const lines = [`🔮 İYİLEŞME TAHMİNİ — ${nm(p)}${p.tani ? ' (' + p.tani + ')' : ''}`, `Şu ana kadar ${n} seans${v.length ? ', ağrı ' + v.join(' → ') : ''}.`];
    let own = null;
    if (v.length >= 3) {
      const xs = v.map((_, i) => i + 1), mx = xs.reduce((a, b) => a + b) / xs.length, my = v.reduce((a, b) => a + b) / v.length;
      const sl = xs.reduce((a, x, i) => a + (x - mx) * (v[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0), ic = my - sl * mx;
      if (v.at(-1) <= 2) lines.push('✓ Ağrı zaten hedef bölgede (≤2) — idame/bitirme planı konuşulabilir.');
      else if (sl < -0.05) { own = Math.max(n + 1, Math.ceil((2 - ic) / sl)); lines.push(`Kendi eğilimi: seans başına ${Math.abs(sl).toFixed(1)} puan düşüş → ağrının 2’ye inmesi için toplam ≈ ${own} seans (${Math.max(0, own - n)} seans daha).`); }
      else lines.push('⚠ Ağrı son seanslarda düşmüyor — tedavi planını gözden geçirmek iyi olur (yaklaşım, ev programına uyum, yeniden değerlendirme).');
    } else lines.push('Kişisel eğilim için en az 3 ağrı ölçümü gerekiyor.');
    if (med) lines.push(`Aynı tanılı ${coh.length} eski hastanda ağrı ortalama ${med}. seansta 2’ye indi${coh.length < 4 ? ' (az veri, kaba tahmin)' : ''}.`);
    const fin = own && med ? Math.round((own * 2 + med) / 3) : own || med;
    if (fin) lines.push(`➡ Tahmini toplam: ${fin} seans${fin > n ? ` — ${fin - n} seans daha` : ''}. ${p.paket ? `Paket: ${p.paket} seans.` : ''}`.trim());
    lines.push('Not: Bu bir eğilim hesabıdır; klinik değerlendirmenin yerini tutmaz.');
    return lines.join('\n');
  }

  /* ================= 4) KONTROL ÇAĞRISI ================= */
  const recallList = () => { const sent = store.get('recallSent', {}), t0 = Date.now(); return P().filter(p => { const s = (p.seanslar || []).map(x => x.t); if (s.length < 3 || !p.tel) return false; const last = Math.max(...s), age = t0 - last; return age > 45 * DAY && age < 200 * DAY && !(sent[p.id || p.ad] > t0 - 150 * DAY); }).sort((a, b) => Math.max(...b.seanslar.map(x => x.t)) - Math.max(...a.seanslar.map(x => x.t))); };
  const recallMsg = p => { const mo = Math.max(1, Math.round((Date.now() - Math.max(...p.seanslar.map(x => x.t))) / (30 * DAY))); return `Merhaba ${p.ad.split(' ')[0]}, FİZYOVİTA’dan Beyhan. Tedavinizin üzerinden yaklaşık ${mo} ay geçti; nasılsınız, şikâyetleriniz tekrarladı mı? Ev egzersizlerinize devam edebiliyorsanız harika. İsterseniz kısa bir kontrol için randevu ayarlayabiliriz. Geçmiş olsun, iyi günler dileriz.`; };
  const wa = p => `https://wa.me/${String(p.tel).replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(recallMsg(p))}`;
  function recall(show = true) {
    const L = recallList();
    if (!L.length) return '✓ Kontrol çağrısı bekleyen hasta yok (tedavisi 1,5–6 ay önce bitmiş, telefonu kayıtlı hasta).';
    if (show) { const b = bubble('ai', `📞 KONTROL ÇAĞRISI — ${L.length} hasta\nTedavisi 1,5–6 ay önce bitmiş hastalar. Kısa bir “nasılsınız” mesajı hem bağı korur hem dönüş getirir.`); b.el.append(el('div', { class: 'tool' }, ...L.slice(0, 12).map(p => el('button', { type: 'button', onclick: ev => { window.open(wa(p), '_blank', 'noopener'); const s = store.get('recallSent', {}); s[p.id || p.ad] = Date.now(); store.set('recallSent', s); ev.target.disabled = true; ev.target.textContent = '✓ ' + nm(p); } }, '💬 ' + nm(p))))); }
    return `📞 Kontrol çağrısı bekleyen ${L.length} hasta: ${L.slice(0, 12).map(nm).join(', ').replace(/\.$/, '')}. Mesaj düğmeleri ekranda.`;
  }

  /* ================= 5) OTOMATİK GÜNLÜK YEDEK (IndexedDB) ================= */
  const SECRET = /^jarvisapp\.(?:key|set\.(?:ghToken|syncPass|elevenKey|haToken|pcToken|igToken|tgToken|tgBot))$/, SKIP = /^jarvisapp\.(?:askCache|emb|bozuk\.)/;
  const db = () => new Promise((res, rej) => { const r = indexedDB.open('saturn-yedek', 1); r.onupgradeneeded = () => r.result.createObjectStore('g', { keyPath: 'day' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('g', mode), s = t.objectStore('g'), out = fn(s); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
  async function dailyBackup(force) {
    const day = ymd(now()); if (!force && store.get('autoBackupDay') === day) return null;
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('jarvisapp.') && !SECRET.test(k) && !SKIP.test(k)) data[k] = localStorage.getItem(k); }
    await tx('readwrite', s => s.put({ day, t: Date.now(), data }));
    const days = (await tx('readonly', s => s.getAllKeys())).sort(); for (const d of days.slice(0, Math.max(0, days.length - 7))) await tx('readwrite', s => s.delete(d));
    store.set('autoBackupDay', day); return Object.keys(data).length;
  }
  async function listBackups() { const all = await tx('readonly', s => s.getAll()); return all.sort((a, b) => b.t - a.t).map(b => ({ day: b.day, t: b.t, n: Object.keys(b.data).length, pats: (JSON.parse(b.data['jarvisapp.patients'] || '[]')).length })); }
  async function restoreDay(day) {
    const b = await tx('readonly', s => s.get(day)); if (!b) return `${day} tarihli otomatik yedek yok. “yedekler” ile listeyi gör.`;
    if (!(await confirmAction(`${day} tarihli otomatik yedeğe dönülsün mü? Bu cihazdaki şimdiki veriler o günkü hâline döner (önce bugünkü hâl ayrıca yedeklenir). Anahtarların korunur.`))) return 'Vazgeçildi.';
    await dailyBackup(true); // bugünü koru
    for (const k of Object.keys(localStorage)) if (k.startsWith('jarvisapp.') && !SECRET.test(k) && !SKIP.test(k)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(b.data)) localStorage.setItem(k, v);
    store.set('autoBackupDay', ymd(now()));
    setTimeout(() => location.reload(), 1200); return `↩ ${day} yedeğine dönüldü; SATÜRN yeniden yükleniyor…`;
  }
  setTimeout(() => dailyBackup().catch(() => {}), 15000); setInterval(() => dailyBackup().catch(() => {}), 3 * 3600000);

  /* ================= 6) SIRADAKİ RANDEVU ÇİPİ ================= */
  const style = document.createElement('style');
  style.textContent = `#satNext{position:fixed;right:14px;bottom:242px;z-index:55;display:none;border-radius:20px;padding:7px 12px;font:600 13px system-ui;background:#5b3fa8;color:#fff;border:0;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#satSug{position:fixed;z-index:120;display:none;background:var(--panel,#0b1b28);border:1px solid var(--line-2,#2a5566);border-radius:10px;padding:4px;box-shadow:0 -8px 30px rgba(0,0,0,.45);max-width:min(94vw,560px)}
#satSug div{padding:7px 10px;border-radius:7px;cursor:pointer;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#satSug div.on,#satSug div:hover{background:rgba(95,224,234,.16)}#satSug small{opacity:.55;margin-left:8px}`;
  document.head.append(style);
  const nextBtn = el('button', { id: 'satNext', type: 'button', onclick: () => { $id('drawer')?.classList.add('open'); $id('t-tasks')?.click(); } });
  document.body.append(nextBtn);
  function nextTick() {
    const t0 = Date.now(), up = items.filter(i => i.kind === 'task' && !i.done && i.due).map(i => ({ i, t: new Date(i.due).getTime() })).filter(x => x.t > t0 - 10 * 60000 && x.t < t0 + 3 * 3600000).sort((a, b) => a.t - b.t)[0];
    if (!up) { nextBtn.style.display = 'none'; return; }
    const m = Math.round((up.t - t0) / 60000); nextBtn.style.display = 'block';
    nextBtn.textContent = `⏰ ${up.i.due.slice(11, 16)} ${short(up.i.title || up.i.text, 34)} · ${m <= 0 ? 'şimdi' : m < 60 ? m + ' dk' : Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk'}`;
  }
  nextTick(); setInterval(nextTick, 30000);

  /* ================= 1) YAZARKEN ÖNERİ ================= */
  const BASE = ['bugün ne var', 'yarın ne var', 'gün sonu', 'sabah kartı', 'haftalık özet', 'gelir hedefi', 'bırakma riski', 'kontrol çağrısı', 'takip listesi', 'nakit akışı', 'işletme analizi', 'klinik panosu',
    'kasa gelir ', 'kasa gider ', 'görev: ', 'hatırlat ', 'kapalıçarşı', 'gram altın kaç TL', 'dolar kaç TL', 'bitcoin tahmin', 'altın tahmin', 'dolar tahmin', 'BIST 100 tahmin', 'kahin tara', 'kahin karne', 'piyasa özeti', 'kripto radar',
    'hava durumu', 'hava uyarısını aç', 'deprem alarmını aç', 'namaz hatırlatıcısını aç', 'resmi tatiller', 'vergi takvimi', 'bugün ne yaptım', 'öneriler', 'yedekler', 'geri al', 'neler yeni', 'gonyometre', 'postür analizi yan', 'belge tara', 'toplantıyı kaydet', 'ekranımı incele', 'indirilenleri düzenle'];
  const PT = ad => { const f = ad.split(' ')[0]; return [`${f} 1500 ödedi`, `${f} seans yapıldı ağrı `, `${ad} için 10 seans haftada 3`, `${f} kaç seansta iyileşir`, `${ad} ilerleme`, `${f} 2000 borçlu`, `${ad} için epikriz`, `${ad} randevu öner`]; };
  const box = el('div', { id: 'satSug', role: 'listbox' }); document.body.append(box);
  let sugs = [], sel = -1;
  const prompt = $id('prompt');
  function hide() { box.style.display = 'none'; sugs = []; sel = -1; }
  function apply(s) { prompt.value = s; try { autosize(); } catch {} prompt.focus(); hide(); }
  function suggest() {
    const v = prompt.value, f = fold(v).trim();
    if (f.length < 2 || v.includes('\n') || v.length > 60) return hide();
    const out = [];
    const ws = f.split(/\s+/), first = ws[0];
    for (const p of P()) { const fa = fold(p.ad); if (fa.startsWith(f) || fa.split(' ')[0].startsWith(first) && first.length >= 2) for (const s of PT(p.ad)) if (fold(s).startsWith(f) || ws.length === 1) out.push(s); if (out.length > 8) break; }
    for (const s of BASE) if (fold(s).startsWith(f) || (f.length >= 3 && fold(s).includes(f))) out.push(s);
    sugs = [...new Set(out)].filter(s => fold(s) !== f).slice(0, 6); sel = -1;
    if (!sugs.length) return hide();
    box.replaceChildren(...sugs.map((s, i) => el('div', { role: 'option', onmousedown: e => { e.preventDefault(); apply(s); } }, s, i === 0 ? el('small', {}, 'Tab') : null)));
    const r = prompt.getBoundingClientRect(); box.style.display = 'block'; box.style.left = Math.max(6, r.left) + 'px'; box.style.bottom = (innerHeight - r.top + 6) + 'px';
  }
  prompt?.addEventListener('input', suggest);
  prompt?.addEventListener('blur', () => setTimeout(hide, 150));
  prompt?.addEventListener('keydown', e => {
    if (box.style.display !== 'block' || !sugs.length) return;
    if (e.key === 'Tab') { e.preventDefault(); apply(sugs[Math.max(0, sel)]); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + sugs.length) % sugs.length; [...box.children].forEach((c, i) => c.classList.toggle('on', i === sel)); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); apply(sugs[sel]); }
    else if (e.key === 'Escape') hide();
    else if (e.key === 'Enter') hide();
  }, true);

  /* ================= proaktif kural ================= */
  window.jarvisProaktif?.RULES.push({ id: 'kontrol', when: () => new Date().getDay() === 1, check() { const L = recallList(); return L.length ? [{ key: 'rc' + ymd(now()), icon: '📞', text: `${L.length} eski hastanın tedavisi 1,5–6 ay önce bitti (${L.slice(0, 4).map(nm).join(', ')}${L.length > 4 ? '…' : ''}). Kısa bir “nasılsınız” mesajı dönüş getirir.`, actions: [{ label: '💬 Mesajları hazırla', main: true, run: () => recall(true) }] }] : []; } });

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    geri_al: { d: 'geri_al — son kayıt işlemini (kasa, alacak, seans, hasta, görev) geri alır', run: () => undo() },
    iyilesme_tahmini: { d: 'iyilesme_tahmini|hasta adı — kaç seansta iyileşeceği: kendi ağrı eğilimi + aynı tanılı eski hastalar', run: ([a]) => eta(a) },
    kontrol_cagrisi: { d: 'kontrol_cagrisi — tedavisi 1,5–6 ay önce bitmiş hastalara kontrol mesajı düğmeleri', run: () => recall(true) },
    yedekler: { d: 'yedekler — otomatik günlük yedeklerin listesi (son 7 gün, cihaz içinde)', run: async () => { await dailyBackup(); const L = await listBackups(); return L.length ? '🗄 OTOMATİK YEDEKLER (cihaz içinde, son 7 gün)\n' + L.map(b => `• ${b.day} ${new Date(b.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} — ${b.n} kayıt, ${b.pats} hasta`).join('\n') + '\nDönmek için: “yedekten dön YYYY-MM-DD”' : 'Henüz otomatik yedek yok.'; } },
    yedekten_don: { d: 'yedekten_don|YYYY-MM-DD — o günkü otomatik yedeğe döner (onay ister)', run: ([d]) => restoreDay(String(d || '').trim()) }
  });
  WRITE_TOOLS.add('yedekten_don');
  TOOL_GROUPS.push([/geri al|iyileş|iyiles|kaç seans|kac seans|kontrol çağ|kontrol cag|eski hasta|yedek/i, /^(geri_al|iyilesme_tahmini|kontrol_cagrisi|yedekler|yedekten_don)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nZEKİ: “kaç seansta iyileşir/ne zaman biter” → iyilesme_tahmini; eski hastaları geri çağırma → kontrol_cagrisi; yanlış kaydı düzelt/geri al → geri_al.';
  const _lc = localCommand;
  localCommand = t0 => {
    const t = String(t0 || '').trim(), f = fold(t).replace(/[?!.]+$/, '');
    if (window.jarvisUltra?.guest?.()) return _lc(t0);
    let m;
    if (/^(geri al|son islemi geri al|yanlis kaydettim|iptal et son kaydi)$/.test(f)) return undo();
    if ((m = t.match(/^(.{2,40}?)\s+(?:kaç|kac)\s+seans(?:ta|da)?\s+(?:iyileşir|iyilesir|biter|düzelir|duzelir)/i)) || (m = t.match(/^(.{2,40}?)\s+(?:iyileşme|iyilesme)\s+tahmini$/i))) { const p = typeof findPatient === 'function' && findPatient(m[1].replace(/['’](n[ıiuü]n|[ıiuü]n)?$/i, '')); if (p) return eta(p.ad); }
    if (/^(kontrol cagrisi|eski hastalar|eski hastalari cagir|geri cagir)$/.test(f)) return recall(true);
    if (/^(yedekler|otomatik yedekler|yedek listesi)$/.test(f)) { TOOLS.yedekler.run([]).then(x => bubble('ai', x)); return '🗄 Yedekler listeleniyor…'; }
    if ((m = f.match(/^yedek(?:ten)? don(?:us)?\s+(\d{4}-\d\d-\d\d)$/))) { restoreDay(m[1]).then(x => bubble('ai', x)); return '…'; }
    return _lc(t0);
  };
  window.jarvisZeki = { snap, undo, eta, recall, recallList, dailyBackup, listBackups, restoreDay, suggest };
})();
