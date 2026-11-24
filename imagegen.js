'use strict';
/* SATÜRN 16 — GÖRSEL STÜDYOSU: yazıdan görsel üretir.
 *  1) Gemini görsel modeli (anahtarın izin veriyorsa; en kaliteli)  2) Pollinations (ücretsiz, anahtarsız, sınırsıza yakın) — yedek
 *  Türkçe isteği önce kısa, ayrıntılı İngilizce görsel istemine çevirir (kişi/hasta adları çıkarılır), stil ve oran seçilir.
 *  Sohbette görüntülenir, indirilebilir, galeride son 30 görsel saklanır. */
(() => {
  const getKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const IMG_MODELS = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'];
  const SIZES = { kare: [1024, 1024], dikey: [832, 1216], hikaye: [768, 1344], yatay: [1216, 832], afis: [896, 1280] };
  const STYLES = { gercekci: 'photorealistic, natural light, high detail', illustrasyon: 'clean flat vector illustration, soft colors', infografik: 'clean medical infographic style, white background, clear icons, minimal text', '3d': '3D render, soft studio lighting', suluboya: 'watercolor painting', sinematik: 'cinematic, dramatic lighting, shallow depth of field' };
  let gallery = store.get('imgGallery', []);
  const saveG = () => { store.set('imgGallery', gallery.slice(0, 30)); renderG(); };

  async function toPrompt(text, style) {
    try {
      const t = await window.jarvisResearch.ask('Kullanıcının Türkçe görsel isteğini görsel üretim modeli için TEK paragraf, ayrıntılı İNGİLİZCE isteme çevir (konu, kompozisyon, ışık, renk, ortam). Gerçek kişi ve hasta adlarını, telefon/adres gibi kişisel bilgileri ÇIKAR. Görselde yazı istenmişse kısa ve tırnak içinde yaz. Yalnız istemi yaz.', text + (style ? `\nStil: ${STYLES[style] || style}` : ''), 'quick');
      const p = String(t || '').replace(/^["'`]+|["'`]+$/g, '').trim();
      if (p.length > 10) return p.slice(0, 900);
    } catch {}
    return (text + (style ? ', ' + (STYLES[style] || style) : '')).slice(0, 600);
  }
  async function viaGemini(prompt, signal) {
    const key = getKey(); if (!key) throw Error('anahtar yok');
    let last = '';
    for (const m of IMG_MODELS) {
      try {
        const r = await withTimeout(fetch(GEMINI + m + ':generateContent', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) }), 35000, 'zaman aşımı');
        if (!r.ok) { last = 'HTTP ' + r.status; if (r.status === 429 || r.status === 403 || r.status === 400) break; continue; } // kota/izin yok → diğer modelleri bekleme
        const parts = (await r.json()).candidates?.[0]?.content?.parts || [];
        const im = parts.find(p => p.inlineData?.data);
        if (im) return { src: `data:${im.inlineData.mimeType || 'image/png'};base64,${im.inlineData.data}`, via: 'Gemini' };
        last = 'görsel dönmedi';
      } catch (e) { last = e.message; }
    }
    throw Error(last);
  }
  function pollUrl(prompt, [w, h], seed) { return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`; }
  const loadImg = (src, ms = 90000) => new Promise((res, rej) => { const im = new Image(); const t = setTimeout(() => { im.src = ''; rej(Error('görsel servisi geç yanıt verdi')); }, ms); im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); rej(Error('görsel yüklenemedi')); }; im.src = src; });

  async function generate(text, { style = '', size = 'kare', engine = opt('imgEngine') || 'auto' } = {}) {
    text = String(text || '').trim(); if (text.length < 3) throw Error('Ne çizeyim? Ör: “görsel oluştur: diz egzersizi yapan yaşlı kadın, infografik”');
    if (window.jarvisUltra?.guest?.()) throw Error('Misafir modunda kapalı.');
    setPhase('thinking', 'Görsel istemini hazırlıyorum…');
    const prompt = await toPrompt(text, style);
    const dims = SIZES[size] || SIZES.kare;
    let out = null, why = '';
    if (engine !== 'pollinations') { setPhase('thinking', 'Görseli çiziyorum (Gemini)…'); try { out = await viaGemini(prompt + `, aspect ratio ${dims[0]}:${dims[1]}`); } catch (e) { why = e.message; } }
    if (!out) {
      setPhase('thinking', 'Görseli çiziyorum…');
      const seed = Math.floor(Math.random() * 1e9), src = pollUrl(prompt, dims, seed);
      await loadImg(src);
      out = { src, via: 'Pollinations (ücretsiz)', seed };
    }
    const rec = { id: uid('img'), t: Date.now(), text, prompt, via: out.via, src: out.src.startsWith('data:') ? '' : out.src, size };
    gallery.unshift(rec); saveG();
    logOp('görsel oluştur', [short(text, 60)], 'başarılı', out.via + (why ? ' (Gemini: ' + why + ')' : ''));
    setPhase('idle', 'Hazır.');
    return { ...rec, src: out.src };
  }
  function show(r) {
    window.jarvisStage?.show({ src: r.src, title: '🎨 ' + short(r.text, 60), text: r.via, source: 'SATÜRN görsel' });
    const n = bubble('ai', `🎨 ${r.text}\n(${r.via})`);
    const im = el('img', { src: r.src, alt: r.text, class: 'genimg', loading: 'lazy' });
    n.el.append(im, el('div', { class: 'tool' },
      el('button', { type: 'button', onclick: () => download(r) }, '⬇ İndir'),
      el('button', { type: 'button', onclick: () => run(r.text, { size: r.size }) }, '↻ Yeni varyasyon'),
      el('button', { type: 'button', onclick: async () => { try { const b = await (await fetch(r.src)).blob(); await navigator.share?.({ files: [new File([b], 'saturn-gorsel.png', { type: b.type || 'image/png' })] }); } catch { note('Paylaşım bu cihazda desteklenmiyor; indirip paylaşabilirsin.'); } } }, 'Paylaş')));
    $('feed').scrollTop = $('feed').scrollHeight;
  }
  async function download(r) {
    try { const b = await (await fetch(r.src)).blob(); const a = el('a', { href: URL.createObjectURL(b), download: `saturn-gorsel-${Date.now()}.png` }); document.body.append(a); a.click(); a.remove(); }
    catch { window.open(r.src, '_blank', 'noopener'); }
  }
  async function run(text, o = {}) {
    try { const r = await generate(text, o); show(r); return r; }
    catch (e) { setPhase('idle', 'Hazır.'); note('Görsel oluşturulamadı: ' + e.message + '. İnternet bağlantısını kontrol edip tekrar dene.'); }
  }
  const pickStyle = s => { const f = fold(s); return /infografik/.test(f) ? 'infografik' : /illustrasyon|cizim|vektor|cizgi/.test(f) ? 'illustrasyon' : /3d|uc boyut/.test(f) ? '3d' : /suluboya/.test(f) ? 'suluboya' : /sinematik|film/.test(f) ? 'sinematik' : /gercekci|fotograf/.test(f) ? 'gercekci' : ''; };
  const pickSize = s => { const f = fold(s); return /hikaye|story|reels/.test(f) ? 'hikaye' : /afis|poster/.test(f) ? 'afis' : /dikey|instagram/.test(f) ? 'dikey' : /yatay|kapak|youtube|banner/.test(f) ? 'yatay' : 'kare'; };

  Object.assign(TOOLS, {
    gorsel_olustur: { d: 'gorsel_olustur|ne çizileceği (Türkçe, ayrıntılı)|stil (gercekci/illustrasyon/infografik/3d/suluboya/sinematik, boş olabilir)|boyut (kare/dikey/hikaye/yatay/afis) — yazıdan görsel/resim/afiş/infografik üretir ve sohbette gösterir', run: async ([t, st, sz]) => { const r = await generate(t, { style: pickStyle(st || t), size: pickSize(sz || t) }); setTimeout(() => show(r), 30); return `Görsel oluşturuldu ve ekranda (${r.via}). Kısaca ne çizdiğini söyle.`; } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGÖRSEL: “resim/görsel/afiş/infografik/logo taslağı çiz, oluştur, yap” isteklerinde gorsel_olustur kullan; görseli metinle tarif etmeye kalkma, üret.';
  const _lc = localCommand;
  localCommand = text => {
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '');
    let m;
    if ((m = t.match(/^(?:görsel|resim|afiş|poster|infografik|çizim|fotoğraf)\s*(?:oluştur|yap|çiz|üret|hazırla)\s*[:,-]?\s*(.{3,})$/i)) || (m = t.match(/^(.{3,}?)\s+(?:görseli|görselini|resmi|resmini|afişi|afişini|infografiği|infografiğini|çizimi|fotoğrafı)\s+(?:oluştur|yap|çiz|üret|hazırla)\.?$/i)) || (m = t.match(/^bana\s+(.{3,}?)\s+(?:çiz|resmet|çizer misin)\.?\??$/i))) {
      const what = m[1]; setTimeout(() => run(what, { style: pickStyle(t), size: pickSize(t) }), 30); return '🎨 Çiziyorum… (10-40 saniye sürebilir)';
    }
    return _lc(text);
  };

  /* ---------- panel ---------- */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-img', 'aria-selected': 'false', 'data-p': 'img' }, 'GÖRSEL');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
  const q = el('textarea', { id: 'imgQ', rows: 3, placeholder: 'Ne çizeyim? Ör: Diz egzersizi yapan yaşlı kadın, sıcak renkler, FİZYOVİTA Instagram gönderisi' });
  const st = el('select', { id: 'imgStyle', 'aria-label': 'Stil' }); st.append(new Option('Stil: otomatik', '')); for (const k of Object.keys(STYLES)) st.append(new Option({ gercekci: 'Gerçekçi fotoğraf', illustrasyon: 'İllüstrasyon', infografik: 'İnfografik', '3d': '3B', suluboya: 'Suluboya', sinematik: 'Sinematik' }[k], k));
  const sz = el('select', { id: 'imgSize', 'aria-label': 'Boyut' }); for (const [k, l] of [['kare', 'Kare (gönderi)'], ['dikey', 'Dikey 4:5'], ['hikaye', 'Hikâye 9:16'], ['yatay', 'Yatay (kapak)'], ['afis', 'Afiş']]) sz.append(new Option(l, k));
  const eng = el('select', { id: 'imgEngine' }); eng.append(new Option('Otomatik — önce Gemini, olmazsa ücretsiz servis', 'auto'), new Option('Yalnız ücretsiz servis (kotasız)', 'pollinations')); eng.value = store.get('set.imgEngine', 'auto'); eng.onchange = () => store.set('set.imgEngine', eng.value);
  const gl = el('div', { class: 'imggrid', id: 'imgGallery' });
  const p = el('div', { class: 'pane', id: 'p-img', role: 'tabpanel' },
    el('h3', {}, 'GÖRSEL STÜDYOSU'),
    el('p', { class: 'muted' }, 'Yazdığını görsele çevirir: sosyal medya gönderisi, afiş, hasta bilgilendirme infografiği… Hasta adı yazma; istem otomatik temizlenir.'),
    q, el('div', { class: 'row' }, st, sz),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { const v = q.value.trim(); if (!v) return note('Ne çizeyim?'); $('drawer').classList.remove('open'); run(v, { style: st.value, size: sz.value }); } }, '🎨 Oluştur')),
    el('div', { class: 'field' }, el('label', { for: 'imgEngine' }, 'Görsel motoru'), eng),
    el('h3', {}, 'GALERİ'), gl);
  p.hidden = true; $('p-settings').before(p);
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(x => x.hidden = x.id !== 'p-img'); renderG(); };
  function renderG() { gl.replaceChildren(...(gallery.filter(g => g.src).length ? gallery.filter(g => g.src).map(g => el('button', { type: 'button', class: 'imgthumb', title: g.text, onclick: () => { $('drawer').classList.remove('open'); show(g); } }, el('img', { src: g.src, alt: g.text, loading: 'lazy' }))) : [el('p', { class: 'muted' }, 'Henüz görsel yok.')])); }
  window.jarvisImage = { generate, run, show, toPrompt, pollUrl, gallery: () => gallery };
})();
