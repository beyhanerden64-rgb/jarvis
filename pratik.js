'use strict';
/* SATÜRN 23.2 — PRATİK: işi ve günü hızlandıran araçlar (çoğu internetsiz)
 *  1) Hazır metinler — adres, IBAN, çalışma saatleri… kaydet; “adresimi gönder” → kopyala / WhatsApp
 *  2) Boş randevu saatleri — günün boşlukları; hastaya 3 seçenekli randevu önerisi (WhatsApp)
 *  3) Mesai takibi — başla/bitir, bugün ve hafta toplamı, fazla mesai
 *  4) Fiş tara — fişin fotoğrafı → firma, tarih, toplam, kategori → onayla, kasaya gider yaz
 *  5) Pratik hesaplar — KDV ekle/çıkar, indirim, yüzde değişim, kredi taksiti, birikim
 *  6) Günün 3 önceliği — sabah belirle, akşam bak
 *  7) Kategori bütçeleri — “market bütçem 5000” → kasadaki giderlerle izle, %80 ve %100’de uyar
 */
(() => {
  const DAY = 86400000;
  const guest = () => !!window.jarvisUltra?.guest?.();
  const today = () => isoLocal(now()).slice(0, 10);
  const nowMin = () => { const s = isoLocal(now()); return +s.slice(11, 13) * 60 + +s.slice(14, 16); };
  const tl = n => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' TL';
  const num = s => Number(String(s ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const toMin = s => { const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const show = (text, links) => { const n = bubble('ai', text); answerTools?.(n.el, text); if (links?.length) addLinks?.(n.el, links); return n; };
  const kasaAmt = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const waNum = tel => { let d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '9' + d; else if (d.length === 10 && d.startsWith('5')) d = '90' + d; return d; };
  const hitap = p => { const f = String(p?.ad || '').split(/\s+/)[0]; return f + (p.cinsiyet === 'k' ? ' Hanım' : p.cinsiyet === 'e' ? ' Bey' : ''); };
  const brand = () => store.get('set.brandName', '') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
  const gemKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  async function gemini(parts, json = false) {
    const key = gemKey(); if (!key) throw Error('Gemini anahtarı gerekli');
    let last = '';
    for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite']) {
      try {
        const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) }) }), 60000, 'zaman aşımı');
        if (!r.ok) { last = m + ': HTTP ' + r.status; continue; }
        const raw = await r.text();
        const objs = /^\s*data:/.test(raw) ? raw.split(/\n/).filter(l => l.startsWith('data:')).map(l => { try { return JSON.parse(l.slice(5)); } catch { return null; } }).filter(Boolean) : [JSON.parse(raw)];
        const t = objs.flatMap(o => o.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (t) return t; last = 'boş yanıt';
      } catch (e) { last = e.message; }
    }
    throw Error(last || 'yanıt yok');
  }

  /* ================= 1) HAZIR METİNLER ================= */
  const snips = () => store.get('snippets', {});
  const snipKey = s => fold(String(s)).replace(/['’]/g, '').replace(/(imi|ımı|umu|ümü|imiz|ımız|ini|ını|unu|ünü|i|ı|u|ü|m)$/u, '').trim();
  // Türkçe iyelik + belirtme: adres → adresimi, iban → ibanımı, saatler → saatlerimi, not → notumu, ütü → ütümü, kahve → kahvemi
  const poss = w => { const s = String(w).trim(), v = (s.match(/[aeıioöuüAEIİOÖUÜ](?=[^aeıioöuüAEIİOÖUÜ]*$)/) || ['e'])[0].toLocaleLowerCase('tr'), h = /[aı]/.test(v) ? 'ı' : /[ei]/.test(v) ? 'i' : /[ou]/.test(v) ? 'u' : 'ü'; return /[aeıioöuü]$/i.test(s) ? s + 'm' + h : s + h + 'm' + h; };
  function snipSave(name, text) { const k = snipKey(name); if (!k || !String(text).trim()) throw Error('Örnek: “kaydet adres: Nur Mah. … Cizre”'); const S = snips(); S[k] = { ad: String(name).trim(), t: String(text).trim().slice(0, 1500) }; store.set('snippets', S); return `✓ “${S[k].ad}” kaydedildi. Göndermek için: “${poss(S[k].ad)} gönder” ya da “${S[k].ad} kopyala”.`; }
  function snipFind(name) { const S = snips(), k = snipKey(name); return S[k] || Object.values(S).find(x => fold(x.ad).includes(k) || k.includes(fold(x.ad))); }
  function snipSend(name) {
    const s = snipFind(name); if (!s) return null;
    const n = show(`📋 ${s.ad}:\n${s.t}`);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: async e => { try { await navigator.clipboard.writeText(s.t); e.target.textContent = '✓ Kopyalandı'; } catch { e.target.textContent = 'Kopyalanamadı'; } } }, '📋 Kopyala'), el('a', { class: 'btn ghost', href: 'https://wa.me/?text=' + encodeURIComponent(s.t), target: '_blank', rel: 'noopener' }, '💬 WhatsApp’la gönder')));
    return `${s.ad} hazır.`;
  }
  const snipList = () => { const S = Object.values(snips()); return S.length ? '📋 HAZIR METİNLER\n' + S.map(x => `• ${x.ad}: ${x.t.slice(0, 60)}${x.t.length > 60 ? '…' : ''}`).join('\n') : 'Hazır metin yok. Örnek: “kaydet adres: …”, “kaydet iban: TR…”, “kaydet çalışma saatleri: Hafta içi 09-19”.'; };

  /* ================= 2) BOŞ RANDEVU SAATLERİ ================= */
  const dayOf = q => { const f = fold(q || ''); if (/yarin/.test(f)) return isoLocal(new Date(Date.now() + DAY)).slice(0, 10); if (/obur gun/.test(f)) return isoLocal(new Date(Date.now() + 2 * DAY)).slice(0, 10); const m = f.match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : today(); };
  function freeSlots(date, len = +store.get('set.slotLen', 45) || 45) {
    const start = toMin(store.get('set.workStart', '09:00')) ?? 540, end = toMin(store.get('set.workEnd', '19:00')) ?? 1140, l0 = toMin(store.get('set.lunch', '12:30')) ?? 750;
    const busy = items.filter(i => i.kind === 'task' && !i.done && (i.due || '').startsWith(date) && /T\d{2}:\d{2}/.test(i.due)).map(i => [toMin(i.due.slice(11)), toMin(i.due.slice(11)) + len]);
    busy.push([l0, l0 + 60]); busy.sort((a, b) => a[0] - b[0]);
    const out = []; let cur = date === today() ? Math.max(start, Math.ceil((nowMin() + 30) / 15) * 15) : start;
    while (cur + len <= end) { const c = busy.find(([s, e]) => cur < e && cur + len > s); if (c) { cur = c[1]; continue; } out.push(cur); cur += len; }
    return out;
  }
  const dayName = d => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  function slotsText(q) { const d = dayOf(q), s = freeSlots(d); return s.length ? `🕒 ${dayName(d)} boş saatler (${+store.get('set.slotLen', 45) || 45} dk): ${s.map(hm).join(' · ')}` : `${dayName(d)} için boş saat kalmadı.`; }
  function offer(name, q = '') {
    const p = typeof findPatient === 'function' ? findPatient(name) : null; if (!p) return { text: `“${name}” adlı hasta bulunamadı.` };
    const opts = []; for (let k = /yarin/.test(fold(q)) ? 1 : 0; k < 7 && opts.length < 3; k++) { const d = isoLocal(new Date(Date.now() + k * DAY)).slice(0, 10); if (new Date(d + 'T12:00:00').getDay() === 0) continue; const s = freeSlots(d); const pick = [s[0], s[Math.floor(s.length / 2)], s.at(-1)].filter((v, i, a) => v != null && a.indexOf(v) === i); for (const x of pick) if (opts.length < 3 && !opts.some(o => o.d === d && Math.abs(o.m - x) < 120)) opts.push({ d, m: x }); }
    if (!opts.length) return { text: 'Önümüzdeki 7 günde boş saat bulamadım.' };
    const msg = `Merhaba ${hitap(p)}, ${brand()} olarak bir sonraki seansınız için uygun saatlerimiz:\n${opts.map((o, i) => `${i + 1}) ${dayName(o.d)} ${hm(o.m)}`).join('\n')}\nSize uyan seçeneğin numarasını yazmanız yeterli. Sağlıklı günler!`;
    return { text: `${p.ad} için 3 randevu seçeneği: ${opts.map(o => dayName(o.d) + ' ' + hm(o.m)).join(' · ')}. Cevap gelince “görev: ${p.ad} seansı <tarih> <saat>” de.`, links: [{ url: `https://wa.me/${waNum(p.tel)}?text=${encodeURIComponent(msg)}`, title: `📅 ${p.ad} — randevu seçenekleri (WhatsApp)` }] };
  }

  /* ================= 3) MESAİ ================= */
  const work = () => store.get('worklog', []);
  function shift(op) {
    const W = work(), open = W.find(x => !x.end);
    if (op === 'basla') { if (open) return `Mesai zaten ${isoLocal(new Date(open.start)).slice(11, 16)}’den beri açık.`; W.push({ start: Date.now(), d: today() }); store.set('worklog', W.slice(-400)); return `🕘 Mesai başladı (${isoLocal(now()).slice(11, 16)}). Bitince “mesai bitti” de.`; }
    if (op === 'bitir') { if (!open) return 'Açık mesai yok. Başlarken “mesaiye başladım” de.'; open.end = Date.now(); store.set('worklog', W); const m = Math.round((open.end - open.start) / 60000); return `🏁 Mesai bitti: ${Math.floor(m / 60)} sa ${m % 60} dk. ` + shiftReport(true); }
    return shiftReport();
  }
  function shiftReport(short = false) {
    const W = work(), mins = x => Math.round(((x.end || Date.now()) - x.start) / 60000), t = today();
    const td = W.filter(x => x.d === t).reduce((a, x) => a + mins(x), 0);
    const wk0 = (() => { const d = new Date(t + 'T00:00:00'); const dow = (d.getDay() + 6) % 7; return new Date(d.getTime() - dow * DAY).getTime(); })();
    const wk = W.filter(x => x.start >= wk0).reduce((a, x) => a + mins(x), 0), target = (+store.get('set.weekHours', 45) || 45) * 60;
    const f = m => `${Math.floor(m / 60)} sa ${m % 60} dk`;
    return `Bugün ${f(td)} · bu hafta ${f(wk)}${wk > target ? ` (hedefin ${f(wk - target)} üstünde — dinlenmeyi unutma)` : ` (hedef ${target / 60} sa, kalan ${f(target - wk)})`}${short ? '' : W.some(x => !x.end) ? ' · mesai şu an açık' : ''}.`;
  }

  /* ================= 4) FİŞ TARA ================= */
  const CATS = ['market', 'yakıt', 'fatura', 'kira', 'malzeme', 'yemek', 'ulaşım', 'sağlık', 'giyim', 'diğer'];
  const fisIn = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  document.body.append(fisIn);
  async function readReceipt(img) {
    const t = await gemini([{ inlineData: { mimeType: img.type || 'image/jpeg', data: img.data } }, { text: `Bu bir alışveriş fişi/faturası. YALNIZ JSON döndür: {"firma":"","tarih":"YYYY-MM-DD","toplam":sayı,"kdv":sayı,"kategori":"${CATS.join('|')}","kalemler":["en çok 5 kalem"]}. Toplam genel TOPLAM/ÖDENECEK tutardır. Okuyamadığın alanı boş bırak; uydurma.` }], true);
    let j; try { j = JSON.parse((t.match(/\{[\s\S]*\}/) || [t])[0]); } catch { throw Error('Fiş okunamadı — daha net bir fotoğraf dene'); }
    j.toplam = num(j.toplam); if (!(j.toplam > 0)) throw Error('Toplam tutar okunamadı — fişin altı görünsün');
    j.kategori = CATS.includes(fold(j.kategori || '').replace('yakit', 'yakıt').replace('ulasim', 'ulaşım').replace('saglik', 'sağlık').replace('diger', 'diğer')) ? fold(j.kategori).replace('yakit', 'yakıt').replace('ulasim', 'ulaşım').replace('saglik', 'sağlık').replace('diger', 'diğer') : 'diğer';
    return j;
  }
  function receiptCard() {
    const n = show('🧾 FİŞ TARA — fişin fotoğrafını çek; firma, tarih, toplam ve kategoriyi okuyayım, onaylarsan kasaya gider yazayım.');
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: () => { fisIn.onchange = async () => { const f = fisIn.files[0]; fisIn.value = ''; if (!f) return; setPhase('thinking', 'Fiş okunuyor…'); try { const img = await prepareImage(f); const j = await readReceipt(img); receiptConfirm(j); } catch (e) { note(e.message); } finally { setPhase('idle', 'Hazır.'); } }; fisIn.click(); } }, '📷 Fişi çek / seç')));
    return 'Fiş tarama kartı açıldı.';
  }
  function receiptConfirm(j) {
    const n = show(`🧾 ${j.firma || 'Fiş'} — ${j.tarih || 'tarih yok'}\nToplam: ${tl(j.toplam)}${j.kdv ? ' (KDV ' + tl(num(j.kdv)) + ')' : ''} · kategori: ${j.kategori}${j.kalemler?.length ? '\nKalemler: ' + j.kalemler.slice(0, 5).join(', ') : ''}`);
    n.el.append(el('div', { class: 'tool' }, el('button', { type: 'button', onclick: e => { try { TOOLS.kasa.run(['gider', kasaAmt(j.toplam), `[${j.kategori}] ${j.firma || 'fiş'}`]); e.target.disabled = true; e.target.textContent = '✓ Kasaya gider yazıldı'; budgetCheck(j.kategori); } catch (x) { note(x.message); } } }, '✓ Kasaya gider yaz')));
    return n;
  }

  /* ================= 5) PRATİK HESAPLAR ================= */
  function calc(t) {
    const f = fold(t); let m;
    if ((m = f.match(/^(\d[\d.,]*)\s*(?:tl)?\s*(?:\+|e|a|ye|ya)?\s*kdv\s*(?:ekle|dahil)?\s*%?\s*(\d{1,2})?(?:\s*kdv)?$/)) || (m = f.match(/^kdv\s*(?:ekle)?\s*(\d[\d.,]*)\s*(?:tl)?\s*%?\s*(\d{1,2})?$/))) { const a = num(m[1]), r = +(m[2] || 20); return `🧾 ${tl(a)} + %${r} KDV (${tl(a * r / 100)}) = ${tl(a * (1 + r / 100))}`; }
    if ((m = f.match(/^(\d[\d.,]*)\s*(?:tl)?\s*kdv(?:den| haric| haric hali)?\s*(?:cikar|haric|ayir)\s*%?\s*(\d{1,2})?$/)) || (m = f.match(/^kdv\s*haric\s*(\d[\d.,]*)\s*(?:tl)?\s*%?\s*(\d{1,2})?$/))) { const a = num(m[1]), r = +(m[2] || 20), net = a / (1 + r / 100); return `🧾 KDV dahil ${tl(a)} → KDV hariç ${tl(Math.round(net * 100) / 100)} + %${r} KDV ${tl(Math.round((a - net) * 100) / 100)}`; }
    if ((m = f.match(/^(\d[\d.,]*)\s*(?:tl)?(?:'?[nd][ie]?n?)?\s*%\s*(\d{1,2}(?:[.,]\d+)?)\s*indirim(?:li)?(?: hali)?$/))) { const a = num(m[1]), r = num(m[2]); return `🏷 ${tl(a)} − %${r} = ${tl(Math.round(a * (1 - r / 100) * 100) / 100)} (indirim ${tl(Math.round(a * r) / 100)})`; }
    if ((m = f.match(/^(\d[\d.,]*)\s*(?:tl)?\s*['’]?(?:den|dan|ten|tan)\s*(\d[\d.,]*)\s*(?:tl)?\s*['’]?(?:ye|ya|e|a)\s*(?:degisim|artis|dusus|ne kadar degisti|yuzde kac)/))) { const a = num(m[1]), b = num(m[2]); const r = (b / a - 1) * 100; return `📈 ${tl(a)} → ${tl(b)}: %${r.toFixed(1).replace('.', ',')} ${r >= 0 ? 'artış' : 'düşüş'}`; }
    if ((m = f.match(/(\d[\d.,]*)\s*(?:tl)?\s*(?:kredi|borc)\s*(\d{1,3})\s*ay\s*(?:vade)?\s*%?\s*(\d{1,2}(?:[.,]\d+)?)/)) || (m = f.match(/(\d[\d.,]*)\s*(?:tl)?\s*(?:kredi|borc)?\s*(\d{1,3})\s*ay\s*(?:vade)?\s*%?\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:faiz)?.*(?:taksit|kredi)/)) || (m = f.match(/^kredi\s*(\d[\d.,]*)\s*(?:tl)?\s*(\d{1,3})\s*ay\s*%?\s*(\d{1,2}(?:[.,]\d+)?)/))) {
      const P = num(m[1]), n = +m[2], r = num(m[3]) / 100; const pay = r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
      return `🏦 ${tl(P)} · ${n} ay · aylık %${String(num(m[3])).replace('.', ',')}\nAylık taksit: ${tl(Math.round(pay * 100) / 100)} · toplam geri ödeme ${tl(Math.round(pay * n))} · toplam faiz ${tl(Math.round(pay * n - P))}\n(Vergiler/masraflar hariç tahmini hesap.)`;
    }
    if ((m = f.match(/^(?:ayda|aylik)\s*(\d[\d.,]*)\s*(?:tl)?\s*(?:biriktir\w*|yatir\w*)?\s*(\d{1,3})\s*(?:ay|yil)\s*%?\s*(\d{1,2}(?:[.,]\d+)?)?/))) {
      const A = num(m[1]), n = /yil/.test(f) ? +m[2] * 12 : +m[2], r = num(m[3] || 0) / 100; const fv = r ? A * (Math.pow(1 + r, n) - 1) / r : A * n;
      return `💰 Ayda ${tl(A)} × ${n} ay${r ? ` (aylık %${String(num(m[3])).replace('.', ',')} getiri)` : ''} → ${tl(Math.round(fv))} (yatırılan ${tl(A * n)}${r ? ', getiri ' + tl(Math.round(fv - A * n)) : ''})`;
    }
    return null;
  }

  /* ================= 6) GÜNÜN 3 ÖNCELİĞİ ================= */
  const prio = () => { const P = store.get('prio', null); return P?.d === today() ? P : null; };
  function prioSet(txt) { const list = String(txt).split(/\s*(?:,|;|\bve\b|\d\))\s*/).map(x => x.trim()).filter(Boolean).slice(0, 3); if (!list.length) throw Error('Örnek: “bugünün öncelikleri: rapor, Ayşe’nin programı, vergi”'); store.set('prio', { d: today(), list: list.map(t => ({ t, ok: false })) }); return `🎯 Bugünün öncelikleri:\n${list.map((x, i) => `${i + 1}. ${x}`).join('\n')}\nBitirince “1. öncelik tamam” de.`; }
  function prioDone(i) { const P = prio(); if (!P) return 'Bugün için öncelik belirlenmedi.'; const x = P.list[i - 1]; if (!x) return 'Böyle bir öncelik yok.'; x.ok = true; store.set('prio', P); const left = P.list.filter(y => !y.ok); return `✓ “${x.t}” tamam. ${left.length ? 'Kalan: ' + left.map(y => y.t).join(', ') : 'Üç öncelik de bitti — harika bir gün! 🎉'}`; }
  const prioShow = () => { const P = prio(); return P ? '🎯 BUGÜNÜN ÖNCELİKLERİ\n' + P.list.map((x, i) => `${x.ok ? '☑' : '☐'} ${i + 1}. ${x.t}`).join('\n') : 'Bugün için öncelik yok. “bugünün öncelikleri: …, …, …” de.'; };
  function prioNudge() {
    if (guest() || document.hidden) return; const h = Math.floor(nowMin() / 60), s = store.get('prioNudge', {});
    if (h >= 9 && h < 11 && !prio() && s.am !== today()) { s.am = today(); store.set('prioNudge', s); note('🎯 Günaydın! Bugünün en önemli 3 işi ne? “bugünün öncelikleri: …, …, …” de.'); }
    if (h >= 18 && prio() && s.pm !== today()) { s.pm = today(); store.set('prioNudge', s); const P = prio(), d = P.list.filter(x => x.ok).length; note(`🎯 Gün değerlendirmesi: ${d}/${P.list.length} öncelik tamam.${d < P.list.length ? ' Kalanlar: ' + P.list.filter(x => !x.ok).map(x => x.t).join(', ') : ' Tebrikler!'}`); }
  }

  /* ================= 7) KATEGORİ BÜTÇELERİ ================= */
  const budgets = () => store.get('budgets', {});
  const spent = cat => { const m = today().slice(0, 7), f = fold(cat); return store.get('ledger', []).filter(x => x.type === 'gider' && x.d.startsWith(m) && fold(x.desc || '').includes(f)).reduce((a, x) => a + x.amt, 0); };
  function budgetSet(cat, amt) { const a = num(amt); if (!cat || !(a > 0)) throw Error('Örnek: “market bütçem 5000”'); const B = budgets(); B[fold(cat)] = { ad: String(cat).trim(), limit: a }; store.set('budgets', B); return `💼 ${cat} bütçesi: aylık ${tl(a)}. Bu ay harcanan: ${tl(spent(cat))}. %80 ve %100’de uyarırım. (Fiş tarattığında ya da kasaya “[${cat}] …” diye gider yazdığında sayılır.)`; }
  function budgetShow() { const B = Object.values(budgets()); if (!B.length) return 'Bütçe yok. Örnek: “market bütçem 5000”, “yakıt bütçem 3000”.'; return '💼 BU AYIN BÜTÇELERİ\n' + B.map(b => { const s = spent(b.ad), p = Math.round(s / b.limit * 100); return `${p >= 100 ? '🔴' : p >= 80 ? '🟠' : '🟢'} ${b.ad}: ${tl(s)} / ${tl(b.limit)} (%${p}) · kalan ${tl(Math.max(0, b.limit - s))}`; }).join('\n'); }
  function budgetCheck(cat) {
    const b = budgets()[fold(cat || '')]; if (!b) return; const p = spent(b.ad) / b.limit, k = today().slice(0, 7) + ':' + fold(cat) + ':' + (p >= 1 ? 100 : 80), sent = store.get('budgetSent', {});
    if (p < 0.8 || sent[k]) return; sent[k] = 1; store.set('budgetSent', sent); note(`💼 ${b.ad} bütçesinin %${Math.round(p * 100)}’i doldu (${tl(spent(b.ad))} / ${tl(b.limit)}).`);
  }

  setInterval(prioNudge, 10 * 60000); setTimeout(prioNudge, 80000);

  /* ================= araçlar ================= */
  const res = r => (typeof r === 'string' ? r : r.text + (r.links?.length ? '\n' + r.links.map(l => l.title + ': ' + l.url).join('\n') : ''));
  Object.assign(TOOLS, {
    hazir_metin: { d: 'hazir_metin|kaydet|ad|metin · hazir_metin|gonder|ad · hazir_metin|liste — adres/IBAN/çalışma saatleri gibi sık gönderilen metinler', run: ([op, a, b]) => /kaydet/.test(op || '') ? snipSave(a, b) : /gonder|gönder/.test(op || '') ? (snipSend(a) || 'Bulunamadı.') : snipList() },
    bos_saat: { d: 'bos_saat|bugün/yarın/YYYY-MM-DD — günün boş randevu saatleri', run: ([q]) => slotsText(q || '') },
    randevu_oner: { d: 'randevu_oner|hasta adı — hastaya 3 seçenekli randevu önerisi (WhatsApp)', run: ([a, q]) => res(offer(a, q || '')) },
    mesai: { d: 'mesai|basla/bitir/rapor — çalışma süresi takibi', run: ([op]) => shift(fold(op || 'rapor').replace('ş', 's')) },
    fis_tara: { d: 'fis_tara — fiş fotoğrafından gider kaydı (onaylı)', run: () => receiptCard() },
    pratik_hesap: { d: 'pratik_hesap|ifade — KDV ekle/çıkar, indirim, yüzde değişim, kredi taksiti, birikim (ör. "1000 + kdv %20", "50000 kredi 12 ay %3 taksit")', run: ([q]) => calc(q || '') || 'Anlaşılmadı. Örnekler: “1000 + kdv”, “1200 kdv hariç”, “2500 %15 indirim”, “50000 kredi 12 ay %3 taksit”, “ayda 2000 biriktir 24 ay %2”.' },
    oncelik: { d: 'oncelik|belirle|a, b, c · oncelik|tamam|1-3 · oncelik|goster — günün 3 önceliği', run: ([op, a]) => /belirle/.test(op || '') ? prioSet(a) : /tamam/.test(op || '') ? prioDone(+a) : prioShow() },
    butce: { d: 'butce|kategori|aylık tutar · butce|goster — kategori bütçeleri (kasa giderlerinden)', run: ([c, a]) => (c && a ? budgetSet(c, a) : budgetShow()) }
  });
  TOOL_GROUPS.push([/adres|iban|metin|şablon|boş saat|randevu öner|mesai|fiş|kdv|indirim|kredi|taksit|biriktir|öncelik|bütçe/i, /^(hazir_metin|bos_saat|randevu_oner|mesai|fis_tara|pratik_hesap|oncelik|butce)$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nPRATİK: kayıtlı adres/IBAN gibi metin → hazir_metin; boş randevu saati → bos_saat; hastaya randevu teklifi → randevu_oner; mesai → mesai; fiş → fis_tara; KDV/indirim/kredi/birikim → pratik_hesap; günün öncelikleri → oncelik; bütçe → butce.';

  /* ================= doğal dil ================= */
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''); let m;
    const out = r => { if (typeof r === 'string') return r; setTimeout(() => show(r.text, r.links), 20); return r.text; };
    if (guest()) return _lc(text0);
    try {
      if ((m = t.match(/^kaydet ([\p{L} ]{2,30}):\s*([\s\S]{2,1500})$/iu))) return snipSave(m[1], m[2]);
      if ((m = t.match(/^([\p{L} '’]{2,30}?)(?:[ıiuü]m[ıiuü]|m[ıiuü]|[ıiuü]n[ıiuü]|n[ıiuü])? (?:gönder|kopyala|paylaş)$/iu)) && snipFind(m[1])) { setTimeout(() => snipSend(m[1]), 20); return snipFind(m[1]).ad + ' hazır.'; }
      if (/^(hazır metinler|hazır metinlerim|kayıtlı metinler)$/i.test(t)) return snipList();
      if ((m = t.match(/^(bugün|yarın|öbür gün)?\s*(?:boş saatler(?:im)?|boş randevu saatleri|ne zaman boşum|boş saat var mı)\s*(bugün|yarın|öbür gün)?$/i))) return slotsText(m[1] || m[2] || '');
      if ((m = t.match(/^(.{2,40}?)(?:['’]?(?:ya|ye|a|e|na|ne))? randevu (?:öner|teklif et|seçenekleri gönder)$/i))) return out(offer(m[1]));
      if (/^(mesaiye başladım|mesai başla|işe başladım|mesai başladı)$/i.test(t)) return shift('basla');
      if (/^(mesai bitti|mesaiyi bitir|işten çıktım|mesai bitir)$/i.test(t)) return shift('bitir');
      if (/^(mesai(?: durumu| raporu)?|bu hafta kaç saat çalıştım|ne kadar çalıştım)$/i.test(t)) return shift('rapor');
      if (/^(fiş tara|fiş oku|fişi kaydet|fiş ekle)$/i.test(t)) return receiptCard();
      if ((m = t.match(/^(?:bugünün|günün) öncelikleri[: ]+(.{3,300})$/i))) return prioSet(m[1]);
      if ((m = t.match(/^(\d)\.? öncelik (?:tamam|bitti)$/i))) return prioDone(+m[1]);
      if (/^(önceliklerim|bugünün öncelikleri|öncelikler)$/i.test(t)) return prioShow();
      if ((m = t.match(/^([\p{L} ]{2,25}?) bütçe(?:m|si|mi)? (\d[\d.,]*)(?: ?tl)?$/iu))) return budgetSet(m[1], m[2]);
      if (/^(bütçelerim|bütçe durumu|bütçem)$/i.test(t)) return budgetShow();
      const c = t.length < 90 ? calc(t) : null; if (c) return c;
      if (/^(pratik araçlar|iş araçları)$/i.test(t)) return '⚙️ PRATİK ARAÇLAR\n• “kaydet adres: …” → “adresimi gönder” (IBAN, çalışma saatleri…)\n• “yarın boş saatlerim”, “Ayşe Yılmaz’a randevu öner”\n• “mesaiye başladım” → “mesai bitti” → “mesai raporu”\n• “fiş tara” → fotoğraf → kasaya gider\n• “1000 + kdv”, “1200 kdv hariç”, “2500 %15 indirim”, “50000 kredi 12 ay %3 taksit”, “ayda 2000 biriktir 24 ay %2”, “800’den 1000’e değişim”\n• “bugünün öncelikleri: rapor, sipariş, vergi” → “1. öncelik tamam”\n• “market bütçem 5000” → “bütçelerim”';
    } catch (e) { return e.message; }
    return _lc(text0);
  };
  window.jarvisPratik = { snipSave, snipFind, snipSend, freeSlots, slotsText, offer, shift, shiftReport, readReceipt, receiptConfirm, receiptCard, calc, prioSet, prioDone, prioShow, prioNudge, budgetSet, budgetShow, budgetCheck, spent };
})();
