'use strict';
/* SATÜRN 17 — SAHNE + TASARIM STÜDYOSU (üretken görsel zekâ)
 *  SAHNE: ana ekranın ortasında, hologramın önünde açılan görsel alan. Ne konuşuluyorsa onu GÖSTERİR:
 *    • bilgi sorularında (nedir/kimdir/nerede/göster…) Vikipedi + Openverse görselleri anında (yapay zekâ kotası harcamaz)
 *    • haberlerde haber fotoğrafları slayt olarak, piyasa/grafiklerde grafik, üretilen görseller ve tasarımlar
 *    • kaydır/oklar, tam ekran, indir, kapat; küçültülünce köşede küçük önizleme kalır
 *  TASARIM: yapay zekâ ölçülü vektör tasarım (SVG) üretir: Instagram gönderisi, hikâye, afiş, infografik, sunum slaytı,
 *    akış şeması/diyagram, egzersiz kartı, logo taslağı. İstenirse yapay zekâ fotoğrafı arka plana yerleştirir.
 *    Tasarım sahnede anında görünür; “başlığı büyüt, rengi maviye çevir” gibi düzeltmelerle revize edilir; PNG/SVG indirilir.
 *    Güvenlik: tasarım yalnız resim olarak çizilir (içindeki hiçbir kod çalışmaz); dış bağlantı ve betikler ayıklanır. */
(() => {
  const ask = (s, u, tier = 'default') => window.jarvisResearch.ask(s, u, tier);
  const guest = () => !!window.jarvisUltra?.guest?.();

  /* ================= SAHNE ================= */
  const img = el('img', { class: 'st-img', alt: '' });
  const cap = el('div', { class: 'st-cap' }), ttl = el('div', { class: 'st-ttl' }), cnt = el('span', { class: 'st-cnt' });
  const btn = (label, aria, fn) => el('button', { type: 'button', 'aria-label': aria, title: aria, onclick: fn }, label);
  const stage = el('section', { id: 'stage', 'aria-label': 'Sahne', hidden: true },
    el('header', {}, ttl, el('div', { class: 'st-btns' }, cnt, btn('‹', 'Önceki', () => go(-1)), btn('›', 'Sonraki', () => go(1)), btn('⤢', 'Tam ekran', () => stage.classList.toggle('full')), btn('⬇', 'İndir', () => save()), btn('–', 'Küçült', () => mini(true)), btn('×', 'Kapat', () => close()))),
    el('div', { class: 'st-body' }, img), cap);
  const pip = el('button', { type: 'button', id: 'stagePip', hidden: true, 'aria-label': 'Sahneyi aç', onclick: () => mini(false) }, el('img', { alt: '' }), el('span', {}, 'SAHNE'));
  document.body.append(stage, pip);
  let items = [], idx = 0, auto = 0;
  function render() {
    const it = items[idx]; if (!it) return close();
    img.src = it.src; img.alt = it.title || '';
    ttl.textContent = it.title || ''; cnt.textContent = items.length > 1 ? `${idx + 1}/${items.length}` : '';
    cap.replaceChildren(...[it.text ? el('span', {}, short(it.text, 220)) : '', it.source ? el(it.url ? 'a' : 'span', it.url && /^https?:\/\//.test(it.url) ? { href: it.url, target: '_blank', rel: 'noopener' } : {}, ' · ' + it.source) : ''].filter(Boolean));
    stage.querySelectorAll('.st-btns button')[0].hidden = stage.querySelectorAll('.st-btns button')[1].hidden = items.length < 2;
    pip.querySelector('img').src = it.src;
  }
  function show(list, { slide = false } = {}) {
    list = (Array.isArray(list) ? list : [list]).filter(x => x?.src); if (!list.length) return false;
    items = list.slice(0, 12); idx = 0; stage.hidden = false; pip.hidden = true; stage.classList.remove('full');
    render(); clearInterval(auto);
    if (slide && items.length > 1) auto = setInterval(() => { if (!stage.matches(':hover')) go(1); }, 6000);
    return true;
  }
  const go = d => { if (!items.length) return; idx = (idx + d + items.length) % items.length; render(); };
  function mini(on) { if (!items.length) return; stage.hidden = on; pip.hidden = !on; }
  function close() { stage.hidden = true; pip.hidden = true; clearInterval(auto); }
  async function save() {
    const it = items[idx]; if (!it) return;
    if (it.svg) return exportPng(it.svg, (it.title || 'tasarim').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '-'));
    try { const b = await (await fetch(it.src)).blob(); dl(b, 'saturn-' + Date.now() + '.' + ((b.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg'))); }
    catch { window.open(it.url || it.src, '_blank', 'noopener'); }
  }
  const dl = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  // kaydırma ile geçiş
  let sx = 0; stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }, { passive: true });
  document.addEventListener('keydown', e => { if (stage.hidden || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return; if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); });

  /* ================= ANINDA GÖRSEL ARAMA (kotasız) ================= */
  const getJ = async (u, ms = 9000) => { const r = await withTimeout(fetch(u), ms, 'zaman aşımı'); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  async function wiki(q, lang) {
    const d = await getJ(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=6&prop=pageimages|extracts|info&piprop=thumbnail&pithumbsize=900&exintro=1&explaintext=1&exsentences=2&inprop=url`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.thumbnail?.source).map(p => ({ src: p.thumbnail.source, title: p.title, text: p.extract || '', source: 'Vikipedi', url: p.fullurl }));
  }
  async function openverse(q) {
    const d = await getJ(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&mature=false`);
    return (d.results || []).filter(r => r.thumbnail || r.url).map(r => ({ src: r.thumbnail || r.url, title: r.title || q, text: [r.creator && '© ' + r.creator, r.license && 'Lisans: ' + String(r.license).toUpperCase()].filter(Boolean).join(' · '), source: 'Openverse', url: r.foreign_landing_url }));
  }
  async function findImages(q) {
    q = String(q || '').trim(); if (q.length < 2) return [];
    const res = await Promise.allSettled([wiki(q, 'tr'), wiki(q, 'en'), openverse(q)]);
    const all = res.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const seen = new Set();
    return all.filter(x => { const k = x.src.replace(/\/\d+px-/, '/'); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  }
  async function showSearch(q, { quiet = false } = {}) {
    const list = await findImages(q).catch(() => []);
    if (!list.length) { if (!quiet) note(`“${q}” için görsel bulamadım.`); return 0; }
    show(list.map(x => ({ ...x, title: x.title || q })), { slide: true });
    logOp('sahne', [q], 'başarılı', list.length + ' görsel');
    return list.length;
  }
  // bilgi sorusu → konu
  const PERSONAL = /\b(hasta|seans|kasa|randevu|görev|not al|hatırlat|sayaç|alarm|takvim|yedek|şifre|ayar|beceri|otomasyon|bilgisayar|telefon|whatsapp|mesaj|ara\b|fener|ışık|klima|ultron|konsey|tasarım|görsel oluştur|çiz)/i;
  function topicOf(text) {
    const t = String(text || '').trim().replace(/^\s*(?:hey\s+)?(?:s[aâ]t[uüıi]r[uüı]?n|jarvis)(?![\s,]*gezegen)\s*[,:!.]?\s+/iu, '');
    if (t.length < 4 || t.length > 140 || PERSONAL.test(t)) return '';
    if (!/(nedir|kimdir|neresi|nerede|nasıl bir|ne demek|hakkında|tarihçesi|göster|resmi|resmini|fotoğraf|görünüm|haritası|anlat|tanıt|bilgi ver|araştır|kim|ne zaman)/i.test(t)) return '';
    return t.replace(/[?!.]+$/g, '')
      .replace(/\b(bana|lütfen|biraz|kısaca|hakkında|ile ilgili|bilgi ver|anlat|tanıt|nedir|kimdir|neresi|nerede|nasıl bir yer|nasıl bir|ne demek|ne zaman|kim|göster|bul|araştır|tarihçesi|resmini|resmi|fotoğrafını|fotoğrafları|fotoğrafı|görselini|görselleri|görüntüsü|haritasını|haritası)\b/gi, ' ')
      .replace(/['’](n?[iıuü]n|n?[iıuü]|d[ae]|t[ae]|n?[ae])\b/gi, '').replace(/\s+/g, ' ').trim()
      .replace(/(\S{4,}?)(n[ıiuü]n)$/u, '$1'); // “Eyfel kulesinin (resmi)” → “Eyfel kulesi”
  }
  const _think = think;
  think = async (text, o = {}) => {
    try {
      const tp = !guest() && opt('stageAuto') !== '0' && !o.image ? topicOf(text) : '';
      if (tp && tp.length >= 2) showSearch(tp, { quiet: true });
    } catch {}
    return _think(text, o);
  };

  /* ================= GRAFİK → SAHNE ================= */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function chartSvg(title, pairs, type = 'bar') {
    const W = 900, H = 560, P = { l: 70, r: 30, t: 70, b: 90 }, vals = pairs.map(p => +p[1] || 0), mx = Math.max(0, ...vals), mn = Math.min(0, ...vals), rng = mx - mn || 1;
    const y = v => P.t + (H - P.t - P.b) * (1 - (v - mn) / rng), bw = (W - P.l - P.r) / Math.max(1, pairs.length);
    const bars = pairs.map((p, i) => { const v = +p[1] || 0, x = P.l + i * bw + bw * 0.15, top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0)); return type === 'cizgi' ? '' : `<rect x="${x}" y="${top}" width="${bw * 0.7}" height="${Math.max(1, h)}" rx="4" fill="${v >= 0 ? '#57d3ff' : '#ff6b6b'}"/><text x="${x + bw * 0.35}" y="${v >= 0 ? top - 8 : top + h + 20}" text-anchor="middle" font-size="18" fill="#dff6ff">${esc(v)}</text>`; }).join('');
    const line = type === 'cizgi' ? `<polyline fill="none" stroke="#57d3ff" stroke-width="4" points="${pairs.map((p, i) => `${P.l + i * bw + bw / 2},${y(+p[1] || 0)}`).join(' ')}"/>` + pairs.map((p, i) => `<circle cx="${P.l + i * bw + bw / 2}" cy="${y(+p[1] || 0)}" r="6" fill="#ffb547"/>`).join('') : '';
    const labels = pairs.map((p, i) => `<text x="${P.l + i * bw + bw / 2}" y="${H - P.b + 30}" text-anchor="middle" font-size="16" fill="#9fc3d4">${esc(short(String(p[0]), 12))}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#06131c"/><text x="${P.l}" y="44" font-size="28" font-weight="700" fill="#dff6ff" font-family="system-ui,sans-serif">${esc(title)}</text><line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="#2a4a5a" stroke-width="2"/><g font-family="system-ui,sans-serif">${bars}${line}${labels}</g></svg>`;
  }
  const svgSrc = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  function chart(title, pairs, type) { if (!pairs?.length) return; const svg = chartSvg(title, pairs, type); show({ src: svgSrc(svg), svg, title, source: 'SATÜRN grafik' }); }

  /* ================= TASARIM STÜDYOSU ================= */
  const FORMATS = {
    gonderi: ['Instagram gönderisi', 1080, 1080], hikaye: ['Instagram hikâyesi', 1080, 1920], afis: ['Afiş', 1240, 1754], infografik: ['İnfografik', 1080, 1620],
    slayt: ['Sunum slaytı', 1920, 1080], sema: ['Akış şeması / diyagram', 1600, 1000], kart: ['Egzersiz kartı', 1080, 1350], logo: ['Logo taslağı', 1000, 1000], kapak: ['YouTube kapak', 1280, 720]
  };
  const formatOf = s => { const f = fold(s); return /hikaye|story|reels/.test(f) ? 'hikaye' : /afis|poster|brosur/.test(f) ? 'afis' : /infografi/.test(f) ? 'infografik' : /slayt|sunum/.test(f) ? 'slayt' : /sema|diyagram|akis|harita|surec|organizasyon/.test(f) ? 'sema' : /egzersiz kart|kart/.test(f) ? 'kart' : /logo/.test(f) ? 'logo' : /kapak|youtube|thumbnail/.test(f) ? 'kapak' : 'gonderi'; };
  const brand = () => ({ ad: opt('brandName') || 'FİZYOVİTA', alt: opt('brandSub') || 'Fizik Tedavi ve Rehabilitasyon Merkezi · Cizre', renk: opt('brandColors') || '#0e7c86, #0b2530, #f5a623, #ffffff', iletisim: opt('brandContact') || '' });
  function sanitize(raw) {
    const m = String(raw || '').match(/<svg[\s\S]*<\/svg>/i); if (!m) throw Error('tasarım üretilemedi');
    const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw Error('tasarım bozuk geldi');
    const svg = doc.documentElement;
    doc.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, animate[attributeName="href"], set').forEach(n => n.remove());
    for (const n of doc.querySelectorAll('*')) for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      if (/(^|:)href$/i.test(a.name) && !/^(#|data:image\/)/i.test(a.value) && a.value !== '{{FOTO}}') n.removeAttribute(a.name);
      if (/url\(\s*['"]?(?!#)/i.test(a.value)) n.removeAttribute(a.name);
    }
    for (const s of doc.querySelectorAll('style')) s.textContent = s.textContent.replace(/@import[^;]+;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }
  async function photoData(prompt, w, h) {
    try {
      const u = window.jarvisImage?.pollUrl?.(prompt, [Math.min(1216, w), Math.min(1216, h)], Math.floor(Math.random() * 1e9)); if (!u) return '';
      const b = await withTimeout(fetch(u).then(r => r.blob()), 90000, 'zaman aşımı');
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(b); });
    } catch { return ''; }
  }
  const DESIGN_SYS = (fmt, W, H, b) => `Sen ödüllü bir grafik tasarımcı ve bilgi tasarımcısısın. İsteğe göre ${fmt} için TEK bir SVG tasarım üret.
KESİN KURALLAR:
- Yalnız <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"> … </svg> yaz; açıklama, kod bloğu işareti yok.
- Betik, foreignObject, dış bağlantı, dış font, dış resim YOK. Yazı tipi: font-family="Inter, 'Segoe UI', Roboto, Arial, sans-serif".
- Tüm metinler TÜRKÇE ve yazım hatasız; metin kutuları taşmasın (uzun satırları <tspan> ile böl, satır başına ~${Math.round(W / 34)} karakter).
- Profesyonel düzen: güçlü hiyerarşi (büyük başlık, alt başlık, gövde), hizalı ızgara, bol boşluk, en fazla 3-4 renk, yüksek kontrast, yuvarlatılmış kartlar, basit vektör ikonlar (path/circle/rect ile).
- Marka: ${b.ad} — ${b.alt}. Renkler: ${b.renk}. ${b.iletisim ? 'İletişim: ' + b.iletisim + ' (altta küçük).' : ''} Logo yerine şık bir yazı-logo kullan.
- Sağlık içeriğinde doğru ve abartısız bilgi; tıbbi iddia uydurma. Gerçek kişi/hasta adı yazma.
- Akış şeması/diyagramda kutular ve oklar (marker ile) düzgün hizalı, kesişmeyen.
- Fotoğraf gerçekten yararlıysa en fazla bir tane <image href="{{FOTO}}" x=".." y=".." width=".." height=".." preserveAspectRatio="xMidYMid slice"/> kullan ve SVG'nin EN BAŞINA <!-- FOTO: kısa İngilizce görsel istemi --> yorumu ekle; değilse hiç kullanma.`;
  let designs = store.get('designs', []);
  const saveD = () => { try { store.set('designs', designs.slice(0, 12)); } catch { designs = designs.slice(0, 6); try { store.set('designs', designs); } catch {} } renderD(); };
  async function design(request, { format = '', revise = null } = {}) {
    request = String(request || '').trim(); if (request.length < 3) throw Error('Ne tasarlayayım? Ör: “tasarım yap: bel ağrısı için 5 egzersiz infografiği”');
    if (guest()) throw Error('Misafir modunda kapalı.');
    const key = revise?.format || format || formatOf(request), [fmt, W, H] = FORMATS[key] || FORMATS.gonderi, b = brand();
    setPhase('thinking', revise ? 'Tasarımı düzeltiyorum…' : `${fmt} tasarlıyorum…`);
    let raw;
    try {
      raw = await ask(DESIGN_SYS(fmt, W, H, b), revise ? `MEVCUT TASARIM (SVG):\n${revise.svg.replace(/data:image\/[^"']+/g, '{{FOTO}}').slice(0, 30000)}\n\nİSTENEN DEĞİŞİKLİK: ${request}\n\nDeğişikliği uygulayıp TAM SVG'yi yeniden yaz.` : `İSTEK: ${request}`, 'complex');
    } catch (e) { setPhase('idle', 'Hazır.'); throw e; }
    let svg = sanitize(raw), photo = '';
    const fp = (String(raw).match(/<!--\s*FOTO:\s*([\s\S]*?)-->/) || [])[1]?.trim();
    if (svg.includes('{{FOTO}}')) {
      const keep = revise?.photo || '';
      setPhase('thinking', 'Tasarıma fotoğraf çiziyorum…');
      const data = keep || (fp ? await photoData(fp, W, H) : '');
      svg = data ? svg.split('{{FOTO}}').join(data) : svg.replace(/<image[^>]*\{\{FOTO\}\}[^>]*\/?>(<\/image>)?/g, '');
      photo = data;
    }
    const rec = { id: uid('ds'), t: Date.now(), request: revise ? revise.request + ' → ' + request : request, format: key, svg, photo: photo || revise?.photo || '' };
    designs.unshift(rec); saveD();
    logOp('tasarım', [fmt, short(request, 60)], 'başarılı');
    setPhase('idle', 'Hazır.');
    return rec;
  }
  function showDesign(d) {
    show({ src: svgSrc(d.svg), svg: d.svg, title: FORMATS[d.format]?.[0] || 'Tasarım', text: d.request, source: 'SATÜRN tasarım' });
    const n = bubble('ai', `🎨 ${FORMATS[d.format]?.[0] || 'Tasarım'} hazır — ana ekranda (SAHNE) gösteriyorum.\nDüzeltmek için: “tasarımı değiştir: başlığı büyüt, rengi maviye çevir”.`);
    n.el.append(el('img', { src: svgSrc(d.svg), alt: d.request, class: 'genimg' }), el('div', { class: 'tool' },
      el('button', { type: 'button', onclick: () => exportPng(d.svg, 'saturn-tasarim') }, '⬇ PNG'),
      el('button', { type: 'button', onclick: () => dl(new Blob([d.svg], { type: 'image/svg+xml' }), 'saturn-tasarim.svg') }, '⬇ SVG'),
      el('button', { type: 'button', onclick: () => showDesign(d) }, 'Sahnede aç')));
  }
  async function exportPng(svg, name) {
    try {
      const vb = (svg.match(/viewBox="0 0 (\d+) (\d+)"/) || [0, 1080, 1080]), W = +vb[1], H = +vb[2];
      const im = new Image(); im.decoding = 'sync';
      await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(Error('çizilemedi')); im.src = svgSrc(svg); });
      const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(im, 0, 0, W, H);
      c.toBlob(b => b ? dl(b, name + '.png') : dl(new Blob([svg], { type: 'image/svg+xml' }), name + '.svg'), 'image/png');
    } catch { dl(new Blob([svg], { type: 'image/svg+xml' }), name + '.svg'); }
  }
  async function runDesign(request, o = {}) {
    try { const d = await design(request, o); showDesign(d); return d; }
    catch (e) { setPhase('idle', 'Hazır.'); note('Tasarım yapılamadı: ' + e.message); }
  }

  /* ================= araçlar + komutlar ================= */
  Object.assign(TOOLS, {
    tasarim_yap: { d: 'tasarim_yap|ne tasarlanacak (içerik ve metinlerle)|format (gonderi/hikaye/afis/infografik/slayt/sema/kart/logo/kapak) — profesyonel vektör tasarım üretir, ana ekranda gösterir (PNG/SVG indirilebilir)', run: async ([r, f]) => { const d = await design(r, { format: FORMATS[fold(f || '')] ? fold(f) : '' }); setTimeout(() => showDesign(d), 30); return 'Tasarım ana ekranda gösteriliyor. Kısaca ne yaptığını söyle.'; } },
    tasarim_duzelt: { d: 'tasarim_duzelt|değişiklik — son tasarımı istenen değişiklikle revize eder', run: async ([r]) => { if (!designs[0]) return 'Düzeltilecek tasarım yok.'; const d = await design(r, { revise: designs[0] }); setTimeout(() => showDesign(d), 30); return 'Düzeltilmiş tasarım ana ekranda.'; } },
    goster: { d: 'goster|konu — konu hakkında gerçek fotoğraf/görselleri (Vikipedi, Openverse) ANA EKRANDA gösterir; bir yer, kişi, nesne, hayvan, anatomi, cihaz anlatırken kullan', run: async ([q]) => { const n = await showSearch(q, { quiet: true }); return n ? `${n} görsel ana ekranda gösteriliyor.` : 'Görsel bulunamadı.'; } },
    sahne: { d: 'sahne|kapat veya aç — ana ekrandaki görsel alanı', run: ([o]) => { /kapat/i.test(o || '') ? close() : mini(false); return 'tamam'; } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nSAHNE/TASARIM: Ana ekranda görsel bir alan (SAHNE) var. Bir şeyi anlatırken görmek faydalıysa goster aracıyla gerçek görselleri getir. Afiş, gönderi, infografik, slayt, şema, kart, logo isteklerinde tasarim_yap; düzeltmede tasarim_duzelt; yapay zekâ fotoğrafı/çizim isteğinde gorsel_olustur.';
  const _lc = localCommand;
  localCommand = text => {
    if (guest()) return _lc(text);
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '');
    let m;
    if ((m = t.match(/^(?:tasarımı|tasarımda)\s+(?:değiştir|düzelt|güncelle|revize et)\s*[:,-]?\s*(.{3,})$/i))) { if (!designs[0]) return 'Önce bir tasarım yapalım: “tasarım yap: …”'; setTimeout(() => runDesign(m[1], { revise: designs[0] }), 30); return '🎨 Tasarımı düzeltiyorum…'; }
    if ((m = t.match(/^(?:tasarım|tasarla|tasarım yap|tasarla(?:r mısın)?)\s*[:,-]\s*(.{3,})$/i)) || (m = t.match(/^(.{4,}?)\s+(?:tasarla|tasarımı yap|tasarımını yap|infografiği yap|şemasını çiz|şeması çiz|diyagramını çiz|slaytı hazırla|sunumu hazırla)\.?$/i)) || (m = t.match(/^(?:(?:akış\s+)?şema|diyagram|infografik|afiş|slayt|egzersiz kartı)\s+(?:yap|çiz|hazırla|tasarla)\s*[:,-]?\s*(.{3,})$/i))) {
      setTimeout(() => runDesign(m[1] + (/(şema|diyagram|infografik|afiş|slayt|kart|logo|hikaye|hikâye|kapak)/i.test(t) && !/(şema|diyagram|infografik|afiş|slayt|kart|logo)/i.test(m[1]) ? ' (' + t.match(/(şema|diyagram|infografik|afiş|slayt|kart|logo|hikaye|hikâye|kapak)/i)[1] + ')' : '')), 30);
      return '🎨 Tasarlıyorum… (20-60 saniye) — bitince ana ekranda göreceksin.';
    }
    if ((m = t.match(/^(?:göster|bana göster|görselini göster|resmini göster|fotoğrafını göster)\s*[:,-]?\s*(.{2,})$/i)) || (m = t.match(/^(.{2,60}?)['’]?(?:n[ıiuü]n|[ıiuü]n)?\s+(?:resmini|resimlerini|fotoğrafını|fotoğraflarını|görselini|görsellerini|haritasını)\s+göster\.?$/i))) {
      setTimeout(() => showSearch(m[1]), 30); return `“${m[1]}” görsellerini ana ekrana getiriyorum…`;
    }
    if (/^(sahneyi|ekranı)\s+(kapat|temizle)$/i.test(t)) { close(); return 'Sahneyi kapattım.'; }
    return _lc(text);
  };

  /* ================= panel (GÖRSEL sekmesine TASARIM bölümü) ================= */
  const dq = el('textarea', { id: 'designQ', rows: 3, placeholder: 'Ne tasarlayayım? Ör: Bel ağrısında 5 ev egzersizi — infografik · Kış kampanyası %20 indirim — Instagram gönderisi · Hasta kabul süreci — akış şeması' });
  const df = el('select', { id: 'designFmt', 'aria-label': 'Format' }); df.append(new Option('Format: otomatik', '')); for (const [k, [l]] of Object.entries(FORMATS)) df.append(new Option(l, k));
  const dg = el('div', { class: 'imggrid', id: 'designGallery' });
  const field = (id, label, ph) => { const i = el('input', { id, placeholder: ph }); i.value = store.get('set.' + id, ''); i.onchange = () => store.set('set.' + id, i.value.trim()); return el('div', { class: 'field' }, el('label', { for: id }, label), i); };
  const auto2 = el('select', { id: 'stageAuto' }); auto2.append(new Option('Açık — bilgi sorularında ilgili görselleri ana ekranda göster', '1'), new Option('Kapalı', '0')); auto2.value = store.get('set.stageAuto', '1'); auto2.onchange = () => store.set('set.stageAuto', auto2.value);
  const box = el('div', { id: 'designBox' },
    el('h3', {}, 'TASARIM STÜDYOSU'),
    el('p', { class: 'muted' }, 'Yapay zekâ ölçülü, düzenlenebilir vektör tasarım yapar ve ana ekranda gösterir. Sonra “tasarımı değiştir: …” diyerek düzelttirebilirsin.'),
    dq, el('div', { class: 'row' }, df, el('button', { type: 'button', class: 'btn', onclick: () => { const v = dq.value.trim(); if (!v) return note('Ne tasarlayayım?'); $('drawer').classList.remove('open'); runDesign(v, { format: df.value }); } }, '✦ Tasarla')),
    field('brandName', 'Marka adı', 'FİZYOVİTA'), field('brandSub', 'Alt yazı', 'Fizik Tedavi ve Rehabilitasyon Merkezi · Cizre'), field('brandColors', 'Marka renkleri', '#0e7c86, #0b2530, #f5a623, #ffffff'), field('brandContact', 'İletişim (isteğe bağlı)', 'telefon / Instagram'),
    el('h3', {}, 'TASARIMLARIM'), dg,
    el('h3', {}, 'SAHNE'), el('div', { class: 'field' }, el('label', { for: 'stageAuto' }, 'Anında görsel'), auto2));
  ($('p-img') || $('p-settings'))?.prepend(box);
  function renderD() { dg.replaceChildren(...(designs.length ? designs.map(d => el('button', { type: 'button', class: 'imgthumb', title: d.request, onclick: () => { $('drawer').classList.remove('open'); showDesign(d); } }, el('img', { src: svgSrc(d.svg), alt: d.request, loading: 'lazy' }))) : [el('p', { class: 'muted' }, 'Henüz tasarım yok.')])); }
  renderD();
  window.jarvisStage = { show, close, mini, go, chart, chartSvg, findImages, showSearch, topicOf, design, runDesign, showDesign, sanitize, exportPng, items: () => items, designs: () => designs };
})();
