'use strict';
/* JARVIS 9.1 — KLİNİK ASİSTANI (FİZYOVİTA'nın günlük işini kısaltan, yapay zekâ kotası harcamayan araçlar)
 *  1) Hasta randevu hatırlatması: yarınki hastalara tek dokunuşla WhatsApp mesajı (Beyhan gönderir)
 *  2) Seans paketi takibi: 10'luk paket → kalan seans; bitene yakın uyarı
 *  3) Kayıp hasta takibi: 14+ gündür gelmeyen ve paketi bitmemiş hastalar + arama/WhatsApp bağlantısı
 *  4) İyileşme raporu ve ağrı (VAS) grafiği: ilk/son ağrı, % iyileşme, seans seyri
 *  5) Ev egzersiz programını yazdır / WhatsApp ile hastaya gönder
 *  6) Kasa grafiği: son 6 ayın gelir-gider-net çizelgesi
 *  7) Gün sonu raporu: bugünkü seanslar, kasa, görevler, yarının randevuları, paketi bitenler — tek dokunuş ya da her akşam otomatik
 * Gizlilik: yapay zekâya giden sonuçlarda hasta adı yerine baş harfler (aiName) kullanılır; gerçek ad yalnız bağlantılarda ve ekranda kalır. */
(() => {
  const DAY = 86400000, OFF = 3 * 3600000;
  const dayStr = (t = Date.now()) => new Date(t + OFF).toISOString().slice(0, 10);
  const tl = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' TL';
  const hitap = p => { const first = p.ad.split(/\s+/)[0]; return p.cinsiyet === 'k' ? first + ' Hanım' : p.cinsiyet === 'e' ? first + ' Bey' : first; };
  const waNum = tel => { let d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '9' + d; else if (d.length === 10 && d.startsWith('5')) d = '90' + d; return d; };
  const wa = (tel, text) => { const n = waNum(tel); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`; };
  const clinicName = () => opt('clinicName') || 'FİZYOVİTA Fizik Tedavi ve Rehabilitasyon Merkezi';
  const sessions = p => p.seanslar || [];
  const matchPatient = text => patients.find(x => { const f = fold(text), parts = fold(x.ad).split(/\s+/); return parts.length > 1 ? f.includes(parts[0]) && f.includes(parts.at(-1)) : f.includes(parts[0]); });
  const dayOf = w => { const f = fold(w || 'yarin'); if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w; return dayStr(Date.now() + (/bugun/.test(f) ? 0 : /obur|ertesi/.test(f) ? 2 : 1) * DAY); };
  const appts = d => items.filter(i => i.kind === 'task' && !i.done && i.due && i.due.slice(0, 10) === d).sort((a, b) => a.due.localeCompare(b.due)).map(i => ({ i, p: matchPatient(i.text), saat: i.due.includes('T') ? i.due.slice(11, 16) : '' }));

  /* 1) randevu hatırlatması */
  function remind(w) {
    const d = dayOf(w), list = appts(d).filter(a => a.p);
    if (!list.length) return { text: `${d} için hastaya bağlı randevu bulunamadı (randevuyu “Yarın 10:00 Ayşe Yılmaz seansı” gibi görev olarak ekle).`, n: 0 };
    const gun = d === dayStr() ? 'bugün' : d === dayStr(Date.now() + DAY) ? 'yarın' : new Date(d + 'T12:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
    let n = 0;
    for (const a of list) {
      const msg = `Merhaba ${hitap(a.p)}, ${gun}${a.saat ? ' saat ' + a.saat : ''} ${clinicName()}’ndeki seansınızı hatırlatmak isteriz. Gelemeyecekseniz lütfen haber veriniz. Geçmiş olsun, sağlıklı günler dileriz.`;
      pendingLinks.push({ url: wa(a.p.tel, msg), title: `💬 ${a.p.ad}${a.saat ? ' · ' + a.saat : ''}${a.p.tel ? '' : ' (telefon kayıtlı değil)'}` }); n++;
    }
    return { text: `${d}: ${n} hastaya hatırlatma mesajı hazır (${list.map(a => aiName(a.p) + (a.saat ? ' ' + a.saat : '')).join(', ')}). Beyhan her bağlantıya dokunup gönderecek.`, n };
  }

  /* 2) seans paketi */
  const left = p => (p.paket ? p.paket - sessions(p).filter(s => s.t >= (p.paketBas || 0)).length : null);
  function setPackage(q, n) {
    const p = findPatient(q); if (!p) throw Error('Hasta bulunamadı: ' + q);
    const k = Number(n); if (!(k > 0 && k <= 60)) throw Error('Paket seans sayısı 1–60 olmalı');
    p.paket = k; p.paketBas = Date.now(); savePatients();
    return `${aiName(p)} için ${k} seanslık paket başladı.`;
  }
  // seans eklenince paket uyarısı
  const _se = TOOLS.seans_ekle.run;
  TOOLS.seans_ekle.run = (args, ctx) => { const r = _se(args, ctx); const p = findPatient(args[0]); const l = p && left(p); return r + (l === null ? '' : l <= 0 ? ` Paket bitti (${p.paket} seans) — yeni paket konuşulmalı.` : l <= 2 ? ` Pakette ${l} seans kaldı.` : ` Pakette ${l} seans kaldı.`); };

  /* 3) kayıp hasta takibi */
  function lostList(days = 14) {
    const now = Date.now();
    return patients.filter(p => { const last = sessions(p).at(-1)?.t || p.created; const l = left(p); return now - last > days * DAY && (l === null ? sessions(p).length > 0 && sessions(p).length < 10 : l > 0) && !p.taburcu; })
      .map(p => ({ p, gun: Math.round((now - (sessions(p).at(-1)?.t || p.created)) / DAY), l: left(p) }));
  }
  function followUp(days) {
    const list = lostList(Number(days) || 14);
    if (!list.length) return `${Number(days) || 14} günden uzun süredir gelmeyen, tedavisi yarım kalmış hasta yok.`;
    for (const x of list) {
      pendingLinks.push({ url: wa(x.p.tel, `Merhaba ${hitap(x.p)}, ${clinicName()}’nden arıyoruz. Bir süredir seansınıza gelemediniz; nasılsınız, ağrınız ne durumda? Tedavinize kaldığımız yerden devam etmek isterseniz size uygun bir gün ayarlayalım.`), title: `💬 ${x.p.ad} · ${x.gun} gün` });
      if (x.p.tel) pendingLinks.push({ url: 'tel:' + String(x.p.tel).replace(/[^\d+]/g, ''), title: `📞 ${x.p.ad}` });
    }
    return `Takip edilecek ${list.length} hasta: ` + list.map(x => `${aiName(x.p)} (${x.gun} gündür gelmedi${x.l ? ', pakette ' + x.l + ' seans var' : ''})`).join('; ') + '. Mesaj ve arama bağlantıları hazır.';
  }

  /* 4) iyileşme raporu + VAS grafiği */
  function progress(q, draw = true) {
    const p = findPatient(q); if (!p) throw Error('Hasta bulunamadı: ' + q);
    const s = sessions(p), v = s.filter(x => Number.isFinite(x.vas));
    if (!s.length) return `${aiName(p)}: henüz seans kaydı yok.`;
    const first = v[0]?.vas, last = v.at(-1)?.vas, pct = v.length > 1 && first > 0 ? Math.round((first - last) / first * 100) : null;
    const uy = s.filter(x => x.uyum).map(x => x.uyum), uyTam = uy.filter(x => x === 'tam').length;
    if (draw && v.length >= 2 && window.jarvisUltra) window.jarvisUltra.drawChart(`${p.ad} · ağrı (VAS) seyri`, v.slice(-20).map((x, i) => [new Date(x.t + OFF).toISOString().slice(5, 10).replace('-', '.'), x.vas]), 'line');
    return `${aiName(p)}${p.tani ? ' (' + p.tani + ')' : ''}: ${s.length} seans, ilk seans ${dateTR(s[0].t)}, son seans ${dateTR(s.at(-1).t)}.` +
      (v.length ? ` Ağrı ${first}/10 → ${last}/10${pct !== null ? ` (%${pct} ${pct >= 0 ? 'azalma' : 'artış'})` : ''}.` : ' Ağrı puanı kaydı yok.') +
      (uy.length ? ` Ev programına tam uyum: ${uyTam}/${uy.length} seans.` : '') + (p.paket ? ` Paket: ${p.paket} seans, kalan ${Math.max(0, left(p))}.` : '') + (p.program ? ' Ev programı kayıtlı.' : ' Ev programı yok.');
  }

  /* 5) ev programı yazdır / paylaş */
  let lastHtml = '';
  function programShare(q, how = 'ikisi') {
    const p = findPatient(q); if (!p) throw Error('Hasta bulunamadı: ' + q);
    if (!p.program) throw Error(aiName(p) + ' için kayıtlı ev egzersiz programı yok (program_kaydet ile ekle)');
    const text = `${clinicName()}\nEV EGZERSİZ PROGRAMI — ${p.ad}\n${new Date().toLocaleDateString('tr-TR')}\n\n${p.program}\n\nEgzersiz sırasında keskin veya artan ağrı olursa durun ve fizyoterapistinize haber verin.\nFzt. Beyhan Erden`;
    if (how !== 'yazdir') pendingLinks.push({ url: wa(p.tel, text), title: `💬 Programı ${p.ad}’a WhatsApp’tan gönder` });
    if (how !== 'whatsapp') {
      const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Ev Egzersiz Programı — ${esc(p.ad)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;color:#555;font-weight:500;margin:4px 0 20px}.prog{white-space:pre-wrap;border-top:2px solid #0a7ea4;padding-top:16px}.warn{margin-top:24px;padding:10px 12px;background:#fff6e5;border-left:4px solid #f0a000;font-size:14px}footer{margin-top:32px;font-size:13px;color:#555}@media print{button{display:none}}</style><h1>${esc(clinicName())}</h1><h2>Ev Egzersiz Programı · ${esc(p.ad)} · ${new Date().toLocaleDateString('tr-TR')}</h2><div class="prog">${esc(p.program)}</div><div class="warn">Egzersiz sırasında keskin veya artan ağrı olursa durun ve fizyoterapistinize haber verin.</div><footer>Fzt. Beyhan Erden</footer><p class="hint" style="margin-top:28px;font-size:13px;color:#777">Yazdırmak veya PDF olarak kaydetmek için: bilgisayarda Ctrl+P, telefonda Paylaş → Yazdır.</p></html>`;
      lastHtml = html;
      pendingLinks.push({ url: URL.createObjectURL(new Blob([html], { type: 'text/html' })), title: `🖨 ${p.ad} programını yazdır / PDF` });
    }
    return `${aiName(p)} ev programı hazır: ${how === 'yazdir' ? 'yazdırma sayfası' : how === 'whatsapp' ? 'WhatsApp mesajı' : 'yazdırma sayfası ve WhatsApp mesajı'} bağlantısı eklendi.`;
  }

  /* 6) kasa grafiği */
  function cashChart(n = 6) {
    const ledger = store.get('ledger', []), now = new Date(Date.now() + OFF), months = [];
    for (let i = Number(n) - 1; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
    const sum = (m, t) => ledger.filter(x => x.d.startsWith(m) && x.type === t).reduce((s, x) => s + x.amt, 0);
    const net = months.map(m => [m.slice(5) + '.' + m.slice(2, 4), Math.round(sum(m, 'gelir') - sum(m, 'gider'))]);
    if (!ledger.length) throw Error('Kasada kayıt yok');
    window.jarvisUltra?.drawChart(`Son ${n} ay net kazanç (TL)`, net, 'bar');
    const g = months.reduce((s, m) => s + sum(m, 'gelir'), 0), c = months.reduce((s, m) => s + sum(m, 'gider'), 0);
    return `Son ${n} ay: gelir ${tl(g)}, gider ${tl(c)}, net ${tl(g - c)}. Aylık net: ${net.map(([k, v]) => k + ' ' + tl(v)).join(', ')}. Grafik sohbette çizildi.`;
  }

  /* 7) gün sonu raporu */
  function dayEnd() {
    const d = dayStr(), d0 = Date.parse(d + 'T00:00:00Z') - OFF;
    const today = patients.flatMap(p => sessions(p).filter(s => s.t >= d0 && s.t < d0 + DAY).map(s => ({ p, s })));
    const ledger = store.get('ledger', []).filter(x => x.d === d), g = ledger.filter(x => x.type === 'gelir').reduce((s, x) => s + x.amt, 0), c = ledger.filter(x => x.type === 'gider').reduce((s, x) => s + x.amt, 0);
    const done = items.filter(i => i.kind === 'task' && i.done && i.due && i.due.slice(0, 10) === d).length, open = items.filter(i => i.kind === 'task' && !i.done && i.due && i.due.slice(0, 10) <= d).length;
    const tomorrow = appts(dayStr(Date.now() + DAY));
    const ending = patients.filter(p => p.paket && left(p) !== null && left(p) <= 1 && !p.taburcu);
    const vasDown = today.filter(x => Number.isFinite(x.s.vas)).map(x => { const v = sessions(x.p).filter(s => Number.isFinite(s.vas)); return v.length > 1 ? v[0].vas - x.s.vas : null; }).filter(x => x !== null);
    return `GÜN SONU · ${new Date(d0 + OFF).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}\n` +
      `• Seans: ${today.length}${today.length ? ' (' + [...new Set(today.map(x => aiName(x.p)))].join(', ') + ')' : ''}${vasDown.length ? `; ortalama ağrı düşüşü ${(vasDown.reduce((a, b) => a + b, 0) / vasDown.length).toFixed(1)} puan` : ''}\n` +
      `• Kasa: gelir ${tl(g)}, gider ${tl(c)}, net ${tl(g - c)}\n` +
      `• Görev: ${done} tamamlandı, ${open} açık/gecikmiş\n` +
      `• Yarın: ${tomorrow.length ? tomorrow.map(a => (a.saat ? a.saat + ' ' : '') + (a.p ? aiName(a.p) : short(a.i.text, 40))).join(', ') : 'randevu yok'}` +
      (ending.length ? `\n• Paketi biten/bitmek üzere: ${ending.map(p => aiName(p) + ' (' + Math.max(0, left(p)) + ' kaldı)').join(', ')}` : '') +
      (lostList().length ? `\n• Takip edilecek ${lostList().length} hasta (“takip listesi” de)` : '');
  }

  /* araçlar */
  Object.assign(TOOLS, {
    hasta_hatirlat: { d: 'hasta_hatirlat|yarın/bugün/YYYY-MM-DD — o günün randevulu hastalarına WhatsApp hatırlatma mesajları hazırlar (Beyhan gönderir)', pending: true, run: ([w]) => remind(w).text },
    paket: { d: 'paket|hasta adı|seans sayısı — hastaya seans paketi başlatır (kalan seans takibi)', run: ([q, n]) => setPackage(q, n) },
    takip_listesi: { d: 'takip_listesi|gün (varsayılan 14) — uzun süredir gelmeyen, tedavisi yarım kalan hastalar + mesaj/arama bağlantıları', pending: true, run: ([d]) => followUp(d) },
    iyilesme: { d: 'iyilesme|hasta adı — hastanın iyileşme raporu (ilk/son ağrı, % değişim, uyum, paket) ve ağrı grafiği', run: ([q]) => progress(q) },
    program_paylas: { d: 'program_paylas|hasta adı|yazdir/whatsapp/ikisi — kayıtlı ev egzersiz programını yazdırılabilir sayfa ve/veya WhatsApp mesajı olarak hazırlar', pending: true, run: ([q, h]) => programShare(q, fold(h || 'ikisi')) },
    kasa_grafik: { d: 'kasa_grafik|ay sayısı (varsayılan 6) — aylık net kazanç grafiği', run: ([n]) => cashChart(Math.min(24, Math.max(2, Number(n) || 6))) },
    gun_sonu: { d: 'gun_sonu — bugünün klinik özeti: seanslar, kasa, görevler, yarının randevuları, paketi bitenler', run: () => dayEnd() }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nKLİNİK ASİSTANI: randevu hatırlatması için hasta_hatirlat, seans paketi için paket, gelmeyen hastalar için takip_listesi, hasta ilerlemesi için iyilesme, ev programını göndermek/yazdırmak için program_paylas, kasa trendi için kasa_grafik, akşam özeti için gun_sonu kullan.';

  /* sesli kısa komutlar (yapay zekâsız) */
  const _lc = localCommand;
  localCommand = text => {
    if (window.jarvisUltra?.guest?.()) return _lc(text);
    const t = text.toLocaleLowerCase('tr-TR').replace(/^\s*(?:hey\s+)?jarvis[,\s]+/, '').replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
    let m;
    try {
      if (/^(?:gün sonu(?: raporu)?|günü kapat|bugünün özeti)$/.test(t)) return dayEnd();
      if ((m = t.match(/^(yarınki|bugünkü|yarın|bugün)?\s*hastalara hatırlatma (?:gönder|hazırla|yap)$/))) { const r = remind(/bug/.test(m[1] || '') ? 'bugün' : 'yarın'); if (pendingLinks.length) setTimeout(() => { const n = bubble('ai', 'Hatırlatma mesajları:'); addLinks(n.el, pendingLinks.splice(0)); }, 30); return r.text.replace(/\(.*?\)\. /, '. '); }
      if (/^(?:takip listesi|gelmeyen hastalar|kayıp hastalar)$/.test(t)) { const r = followUp(14); if (pendingLinks.length) setTimeout(() => { const n = bubble('ai', 'Takip bağlantıları:'); addLinks(n.el, pendingLinks.splice(0)); }, 30); return r; }
      if (/^(?:kasa grafiği|kazanç grafiği|gelir grafiği)$/.test(t)) return cashChart(6);
    } catch (e) { return e.message; }
    return _lc(text);
  };

  /* panel: HASTALAR sekmesine hızlı düğmeler + hasta kartına paket bilgisi */
  const runShow = (fn, label) => { try { const r = fn(); const n = bubble('ai', r); if (pendingLinks.length) addLinks(n.el, pendingLinks.splice(0)); $('drawer').classList.remove('open'); logOp(label, [], 'başarılı'); } catch (e) { note(e.message); } };
  const bar = el('div', { class: 'row klinikbar' },
    el('button', { type: 'button', class: 'btn', onclick: () => runShow(() => remind('yarın').text, 'hasta hatırlatma') }, 'Yarınki hastalara hatırlat'),
    el('button', { type: 'button', class: 'btn', onclick: () => runShow(() => followUp(14), 'takip listesi') }, 'Takip listesi'),
    el('button', { type: 'button', class: 'btn', onclick: () => runShow(dayEnd, 'gün sonu') }, 'Gün sonu raporu'),
    el('button', { type: 'button', class: 'btn', onclick: () => runShow(() => cashChart(6), 'kasa grafiği') }, 'Kasa grafiği'),
    el('button', { type: 'button', class: 'btn ghost', onclick: () => { const j = window.jarvisPro?.parseJob('her gün 20:00 gün sonu raporunu ver'); if (!j) return note('Otomasyon modülü yok'); if (window.jarvisPro.jobs().some(x => /gün sonu/.test(x.cmd))) return note('Gün sonu raporu zaten her akşam 20:00’de.'); window.jarvisPro.addJob(j); note('Her akşam 20:00’de gün sonu raporu verilecek (OTOMASYON sekmesinden değiştirilebilir).'); } }, 'Her akşam 20:00 otomatik'));
  $('patSearch')?.before(bar);
  const _rp = renderPatients;
  renderPatients = () => {
    _rp();
    for (const li of document.querySelectorAll('#patList > *')) {
      const name = li.querySelector('summary b')?.textContent?.trim();
      const p = name && patients.find(x => x.ad === name); if (!p || li.querySelector('.pkt')) continue;
      const l = left(p);
      li.querySelector('summary')?.append(el('span', { class: 'pkt ' + (p.paket && l <= 1 ? 'bad' : 'muted') }, p.paket ? ` · paket ${Math.max(0, l)}/${p.paket}` : ''));
      li.querySelector('.tool')?.append(
        el('button', { type: 'button', onclick: () => { const n = prompt(p.ad + ' — kaç seanslık paket?', '10'); if (n) { try { note(setPackage(p.ad, n)); } catch (e) { note(e.message); } } } }, 'Paket başlat'),
        el('button', { type: 'button', onclick: () => runShow(() => progress(p.ad), 'iyileşme') }, 'İyileşme grafiği'),
        p.program ? el('button', { type: 'button', onclick: () => runShow(() => programShare(p.ad), 'program paylaş') }, 'Programı gönder/yazdır') : null);
    }
  };
  renderPatients();
  window.jarvisKlinik = { lastHtml: () => lastHtml, remind, setPackage, followUp, lostList, progress, programShare, cashChart, dayEnd, waNum };
})();
