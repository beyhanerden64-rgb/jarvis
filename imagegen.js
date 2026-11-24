'use strict';
/* SATÜRN 19 — GÖRSEL STÜDYOSU PRO
 *  • Profesyonel istem mühendisliği: Türkçe istek → konu, kompozisyon, kamera/lens ya da sanat tekniği, ışık, renk paleti, ruh hâli,
 *    kalite ifadeleri içeren ayrıntılı İngilizce istem (FLUX için). Telifli karakter / gerçek kişi istenirse özgün karaktere dönüştürülür.
 *  • Tek seferde 4 VARYASYON (farklı tohumlar) → 2×2 seçim ızgarası; seçileni büyüt, geliştir (“daha sıcak ışık, kamera daha yakın”),
 *    büyük boyutta yeniden üret, indir, paylaş, tasarıma arka plan yap.
 *  • Fotoğraf düzenleme: fotoğraf ekleyip “arka planı klinik yap / çizgi film stiline çevir” → Gemini görsel modeli (anahtar izin verirse).
 *  • Motorlar: Gemini görsel (en kalite, kotalı) → ücretsiz FLUX (Pollinations, kotasız). Galeride son 30 görsel. */
(() => {
  const getKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
  // 22.5: kapanan önizleme modelleri çıkarıldı (2.5-preview Ocak 2026, 2.0 Kasım 2025); Google'ın önerdiği yeniler eklendi
  const IMG_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-2.5-flash-image'];
  const SIZES = { kare: [1024, 1024], dikey: [896, 1120], hikaye: [768, 1344], yatay: [1344, 768], afis: [896, 1280] };
  const STYLES = {
    gercekci: 'professional photograph, shot on full-frame camera, 50mm lens, natural soft light, shallow depth of field, true-to-life colors, high detail',
    illustrasyon: 'modern editorial flat illustration, clean vector shapes, soft harmonious palette, subtle grain texture',
    infografik: 'clean medical infographic style, white background, clear simple icons, balanced layout, minimal text',
    '3d': 'high-quality 3D render, soft global illumination, studio lighting, smooth materials, octane render look',
    suluboya: 'delicate watercolor painting, soft washes, visible paper texture, gentle color bleeding',
    sinematik: 'cinematic still, dramatic lighting, anamorphic lens, color graded, atmospheric depth',
    anime: 'high-quality anime illustration, clean line art, vibrant cel shading',
    yagliboya: 'classical oil painting, rich impasto brushstrokes, museum quality',
    minimal: 'minimalist composition, lots of negative space, two-tone palette, elegant'
  };
  const STYLE_TR = { gercekci: 'Gerçekçi fotoğraf', illustrasyon: 'İllüstrasyon', infografik: 'İnfografik', '3d': '3B', suluboya: 'Suluboya', sinematik: 'Sinematik', anime: 'Anime', yagliboya: 'Yağlı boya', minimal: 'Minimal' };
  let gallery = store.get('imgGallery', []);
  const saveG = () => { store.set('imgGallery', gallery.slice(0, 30)); renderG(); };
  const seedNew = () => Math.floor(Math.random() * 1e9);
  const jsonOf = t => { try { return JSON.parse((String(t).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch { return null; } };

  /* ---------- istem mühendisliği ---------- */
  const PROMPT_SYS = `Sen dünya çapında bir görsel yönetmen ve FLUX istem mühendisisin. Kullanıcının Türkçe isteğini en yüksek kalitede görsel üretecek İNGİLİZCE isteme çevir.
İstem 60-120 kelime olsun ve şu sırayı izlesin: ana konu ve eylem (net, somut) → ortam/arka plan → kompozisyon ve çekim açısı (ör. rule of thirds, close-up, eye-level) → fotoğrafsa kamera/lens/diyafram, değilse sanat tekniği → ışık (yön, sıcaklık) → renk paleti → ruh hâli → kalite ifadeleri (highly detailed, sharp focus, professional).
KURALLAR: Gerçek/ünlü kişi, telifli karakter, marka logosu istenirse benzemeyen ÖZGÜN bir karakter/nesne kullan ve adını yazma. Kişisel bilgi (hasta adı, telefon) yazma. Görselde yazı gerekiyorsa en fazla 3 kelime ve tırnak içinde. Anatomi/egzersiz görsellerinde doğru vücut duruşu iste.
YALNIZ JSON: {"prompt":"…","title":"kısa Türkçe başlık (en çok 6 kelime)"}`;
  async function toPrompt(text, style, base = '') {
    try {
      const t = await window.jarvisResearch.ask(PROMPT_SYS, (base ? `MEVCUT İSTEM: ${base}\nİSTENEN DEĞİŞİKLİK (kompozisyonu koru, yalnız bunu uygula): ${text}` : `İSTEK: ${text}`) + (style && STYLES[style] ? `\nSTİL: ${STYLES[style]}` : ''), 'quick');
      const j = jsonOf(t);
      const p = String(j?.prompt || t || '').replace(/^["'`]+|["'`]+$/g, '').trim();
      if (p.length > 15 && !/^\s*[{[]/.test(p)) return { prompt: p.slice(0, 1200), title: String(j?.title || '').slice(0, 60) };
    } catch {}
    return { prompt: ((base ? base + ', ' : '') + text + (style && STYLES[style] ? ', ' + STYLES[style] : ', highly detailed, professional quality')).slice(0, 800), title: '' };
  }

  /* ---------- motorlar ---------- */
  async function viaGemini(parts) {
    const key = getKey(); if (!key) throw Error('anahtar yok');
    let last = '';
    for (const m of IMG_MODELS) {
      try {
        const r = await withTimeout(fetch(GEMINI + m + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) }), 40000, 'zaman aşımı');
        if (!r.ok) { last = m + ': HTTP ' + r.status; continue; } // her modelin kotası/izni ayrı → sıradakini dene (hepsi düşerse Pollinations)
        const ps = (await r.json()).candidates?.[0]?.content?.parts || [];
        const im = ps.find(p => p.inlineData?.data);
        if (im) return { src: `data:${im.inlineData.mimeType || 'image/png'};base64,${im.inlineData.data}`, via: 'Gemini' };
        last = 'görsel dönmedi';
      } catch (e) { last = e.message; }
    }
    throw Error(last);
  }
  function pollUrl(prompt, [w, h], seed) { return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux&enhance=false`; }
  const loadImg = (src, ms = 120000) => new Promise((res, rej) => { const im = new Image(); const t = setTimeout(() => { im.src = ''; rej(Error('görsel servisi geç yanıt verdi')); }, ms); im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); rej(Error('görsel yüklenemedi')); }; im.src = src; });

  /* ---------- üretim ---------- */
  async function generate(text, { style = '', size = 'kare', engine = opt('imgEngine') || 'auto', count = Number(opt('imgCount')) || 4, base = null } = {}) {
    text = String(text || '').trim(); if (text.length < 3) throw Error('Ne çizeyim? Ör: “görsel oluştur: sahilde yürüyüş yapan yaşlı çift, gün batımı”');
    if (window.jarvisUltra?.guest?.()) throw Error('Misafir modunda kapalı.');
    setPhase('thinking', base ? 'İstemi geliştiriyorum…' : 'Görsel yönetmen istemi hazırlıyor…');
    const P = await toPrompt(text, style || base?.style, base?.prompt || '');
    const dims = SIZES[size || base?.size] || SIZES.kare;
    const outs = []; let why = '';
    if (engine !== 'pollinations' && !base?.seed) { setPhase('thinking', 'Çiziyorum (Gemini)…'); try { outs.push({ ...(await viaGemini([{ text: P.prompt + `. Aspect ratio ${dims[0]}:${dims[1]}.` }])), seed: null }); } catch (e) { why = e.message; } }
    if (!outs.length || count > 1) {
      const n = Math.max(1, Math.min(4, base?.seed ? 1 : count - outs.length));
      setPhase('thinking', `${n} varyasyon çiziyorum…`);
      const seeds = base?.seed ? [base.seed] : Array.from({ length: n }, seedNew);
      const res = await Promise.allSettled(seeds.map(async s => { const src = pollUrl(P.prompt, dims, s); await loadImg(src); return { src, via: 'FLUX (ücretsiz)', seed: s }; }));
      for (const r of res) if (r.status === 'fulfilled') outs.push(r.value);
    }
    if (!outs.length) throw Error('görsel servisleri yanıt vermedi' + (why ? ' (Gemini: ' + why + ')' : ''));
    const set = { id: uid('img'), t: Date.now(), text, title: P.title || short(text, 40), prompt: P.prompt, style, size: size || base?.size || 'kare', variants: outs.map(o => ({ src: o.src.startsWith('data:') ? '' : o.src, data: o.src.startsWith('data:') ? o.src : '', seed: o.seed, via: o.via })) };
    gallery.unshift({ id: set.id, t: set.t, text, title: set.title, prompt: P.prompt, size: set.size, style, src: set.variants.find(v => v.src)?.src || '', seed: set.variants.find(v => v.src)?.seed || null, via: set.variants[0].via });
    saveG();
    logOp('görsel oluştur', [short(text, 60)], 'başarılı', `${outs.length} varyasyon · ${outs[0].via}${why ? ' (Gemini: ' + why + ')' : ''}`);
    setPhase('idle', 'Hazır.');
    return set;
  }
  const srcOf = v => v.data || v.src;
  function show(set) {
    if (!set.variants) set = { ...set, variants: [{ src: set.src, seed: set.seed, via: set.via }] }; // eski galeri kaydı
    const vs = set.variants.filter(v => srcOf(v));
    window.jarvisStage?.show(vs.map((v, i) => ({ src: srcOf(v), title: `🎨 ${set.title || short(set.text, 50)}${vs.length > 1 ? ' · ' + (i + 1) : ''}`, text: v.via + (v.seed ? ' · tohum ' + v.seed : ''), source: 'SATÜRN görsel' })));
    const n = bubble('ai', `🎨 ${set.title || set.text}\n${vs.length > 1 ? `${vs.length} varyasyon — birine dokun, büyüt ve geliştir.` : '(' + vs[0].via + ')'}`);
    let sel = 0;
    const big = el('img', { src: srcOf(vs[0]), alt: set.text, class: 'genimg' });
    const grid = el('div', { class: 'vgrid' + (vs.length > 1 ? '' : ' one') }, ...vs.map((v, i) => el('button', { type: 'button', class: 'vthumb' + (i ? '' : ' on'), 'aria-label': 'Varyasyon ' + (i + 1), onclick: e => { sel = i; big.src = srcOf(v); grid.querySelectorAll('.vthumb').forEach((b, k) => b.classList.toggle('on', k === i)); window.jarvisStage?.show({ src: srcOf(v), title: '🎨 ' + (set.title || ''), text: v.via, source: 'SATÜRN görsel' }); } }, el('img', { src: srcOf(v), alt: '' }))));
    const ref = el('input', { class: 'vref', placeholder: 'Geliştir: ör. ışık daha sıcak, kamera daha yakın, arka plan bulanık' });
    n.el.append(vs.length > 1 ? grid : '', big, el('div', { class: 'row vrow' }, ref, el('button', { type: 'button', class: 'btn', onclick: () => { const v = ref.value.trim(); if (!v) return ref.focus(); refine(set, vs[sel], v); ref.value = ''; } }, '✦ Geliştir')),
      el('div', { class: 'tool' },
        el('button', { type: 'button', onclick: () => download(srcOf(vs[sel])) }, '⬇ İndir'),
        el('button', { type: 'button', onclick: () => share(srcOf(vs[sel])) }, '📤 Paylaş'),
        vs[sel]?.seed ? el('button', { type: 'button', onclick: () => upscale(set, vs[sel]) }, '⤢ Büyük boyut') : '',
        el('button', { type: 'button', onclick: () => run(set.text, { style: set.style, size: set.size }) }, '↻ 4 yeni'),
        el('button', { type: 'button', onclick: () => window.jarvisStage?.runDesign?.(`${set.text} — bu fotoğrafı arka plan olarak kullan, üzerine kısa başlık`, { format: set.size === 'hikaye' ? 'hikaye' : 'gonderi' }) }, '✦ Tasarıma dönüştür')));
    $('feed').scrollTop = $('feed').scrollHeight;
  }
  async function refine(set, v, instruction) {
    try { const r = await generate(instruction, { style: set.style, size: set.size, base: { prompt: set.prompt, seed: v.seed, size: set.size, style: set.style }, count: v.seed ? 1 : 2 }); r.title = (set.title || '') + ' · geliştirildi'; show(r); }
    catch (e) { setPhase('idle', 'Hazır.'); note('Geliştirilemedi: ' + e.message); }
  }
  async function upscale(set, v) {
    try {
      setPhase('thinking', 'Büyük boyutta çiziyorum…');
      const [w, h] = SIZES[set.size] || SIZES.kare, k = 1.5, src = pollUrl(set.prompt, [Math.round(w * k / 64) * 64, Math.round(h * k / 64) * 64], v.seed);
      await loadImg(src); setPhase('idle', 'Hazır.');
      show({ ...set, title: (set.title || '') + ' · büyük', variants: [{ src, seed: v.seed, via: 'FLUX büyük boyut' }] });
    } catch (e) { setPhase('idle', 'Hazır.'); note('Büyütülemedi: ' + e.message); }
  }
  async function editPhoto(image, instruction) {
    setPhase('thinking', 'Fotoğrafı düzenliyorum…');
    try {
      const out = await viaGemini([{ inlineData: { mimeType: image.type || 'image/jpeg', data: image.data } }, { text: `Bu fotoğrafı şu isteğe göre düzenle, geri kalanını olabildiğince koru: ${instruction}` }]);
      setPhase('idle', 'Hazır.');
      const set = { id: uid('img'), t: Date.now(), text: instruction, title: 'Düzenlenen fotoğraf', prompt: instruction, size: 'kare', variants: [{ data: out.src, src: '', via: 'Gemini düzenleme' }] };
      show(set); logOp('fotoğraf düzenle', [short(instruction, 60)], 'başarılı'); return true;
    } catch (e) {
      setPhase('idle', 'Hazır.');
      note('Fotoğraf düzenleme için Gemini görsel modeli gerekiyor ve anahtarın şu an izin vermiyor (' + e.message + '). Yerine benzer yeni bir görsel çizebilirim: “görsel oluştur: …” de.');
      return false;
    }
  }
  async function download(src) {
    try { const b = await (await fetch(src)).blob(); const a = el('a', { href: URL.createObjectURL(b), download: `saturn-gorsel-${Date.now()}.${(b.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}` }); document.body.append(a); a.click(); a.remove(); }
    catch { window.open(src, '_blank', 'noopener'); }
  }
  async function share(src) {
    try { const b = await (await fetch(src)).blob(); const f = new File([b], 'saturn-gorsel.' + ((b.type.split('/')[1] || 'png').replace('jpeg', 'jpg')), { type: b.type || 'image/png' }); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f] }); else download(src); }
    catch { note('Paylaşılamadı; indirip paylaşabilirsin.'); }
  }
  async function run(text, o = {}) {
    try { const r = await generate(text, o); show(r); return r; }
    catch (e) { setPhase('idle', 'Hazır.'); note('Görsel oluşturulamadı: ' + e.message + '. İnternet bağlantısını kontrol edip tekrar dene.'); }
  }
  const pickStyle = s => { const f = fold(s); return /infografik/.test(f) ? 'infografik' : /anime|manga/.test(f) ? 'anime' : /yagli ?boya|tablo/.test(f) ? 'yagliboya' : /minimal/.test(f) ? 'minimal' : /illustrasyon|cizim|vektor|cizgi/.test(f) ? 'illustrasyon' : /3d|uc boyut/.test(f) ? '3d' : /suluboya/.test(f) ? 'suluboya' : /sinematik|film/.test(f) ? 'sinematik' : /gercekci|fotograf/.test(f) ? 'gercekci' : ''; };
  const pickSize = s => { const f = fold(s); return /hikaye|story|reels/.test(f) ? 'hikaye' : /afis|poster/.test(f) ? 'afis' : /dikey|instagram/.test(f) ? 'dikey' : /yatay|kapak|youtube|banner|manzara/.test(f) ? 'yatay' : 'kare'; };

  // fotoğraf ekleyip düzenleme isteği
  const EDIT = /(düzenle|değiştir|arka plan|arkaplan|stiline çevir|çizgi film|anime yap|renklendir|siyah beyaz|temizle|kaldır|ekle|güzelleştir|iyileştir|retuş)/i;
  const _think = think;
  think = async (text, o = {}) => {
    if (o.image?.data && text && EDIT.test(text) && !/(ne görüyorsun|nedir|açıkla|yorumla|oku|incele|analiz)/i.test(text) && !window.jarvisUltra?.guest?.()) {
      bubble('me', text, { image: o.image.url });
      await editPhoto(o.image, text); return '';
    }
    return _think(text, o);
  };

  Object.assign(TOOLS, {
    gorsel_olustur: { d: 'gorsel_olustur|ne çizileceği (Türkçe, ayrıntılı)|stil (gercekci/illustrasyon/infografik/3d/suluboya/sinematik/anime/yagliboya/minimal, boş olabilir)|boyut (kare/dikey/hikaye/yatay/afis) — yazıdan 4 varyasyonlu profesyonel görsel üretir ve gösterir', run: async ([t, st, sz]) => { const r = await generate(t, { style: pickStyle(st || t), size: pickSize(sz || t) }); setTimeout(() => show(r), 30); return `${r.variants.length} görsel ekranda (${r.variants[0].via}). Kısaca ne çizdiğini söyle.`; } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nGÖRSEL: “resim/görsel/fotoğraf/çizim oluştur, yap, çiz” isteklerinde gorsel_olustur kullan (yazılı afiş/gönderi/infografik için tasarim_yap); görseli metinle tarif etmeye kalkma, üret.';
  const _lc = localCommand;
  localCommand = text => {
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '');
    let m;
    if ((m = t.match(/^(?:görsel|resim|afiş|poster|infografik|çizim|fotoğraf|illüstrasyon)\s*(?:oluştur|yap|çiz|üret|hazırla)\s*[:,-]?\s*(.{3,})$/i)) || (m = t.match(/^(.{3,}?)\s+(?:görseli|görselini|resmi|resmini|afişi|afişini|infografiği|infografiğini|çizimi|fotoğrafı|illüstrasyonu)\s+(?:oluştur|yap|çiz|üret|hazırla)\.?$/i)) || (m = t.match(/^bana\s+(.{3,}?)\s+(?:çiz|resmet|çizer misin)\.?\??$/i))) {
      const what = m[1]; setTimeout(() => run(what, { style: pickStyle(t), size: pickSize(t) }), 30); return '🎨 Görsel yönetmen devrede: 4 varyasyon çiziyorum… (15-60 saniye)';
    }
    return _lc(text);
  };

  /* ---------- panel ---------- */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-img', 'aria-selected': 'false', 'data-p': 'img' }, 'GÖRSEL');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
  const q = el('textarea', { id: 'imgQ', rows: 3, placeholder: 'Ne çizeyim? Ör: Sahilde yürüyüş yapan mutlu yaşlı çift, gün batımı, sıcak ışık' });
  const st = el('select', { id: 'imgStyle', 'aria-label': 'Stil' }); st.append(new Option('Stil: otomatik', '')); for (const k of Object.keys(STYLES)) st.append(new Option(STYLE_TR[k], k));
  const sz = el('select', { id: 'imgSize', 'aria-label': 'Boyut' }); for (const [k, l] of [['kare', 'Kare (gönderi)'], ['dikey', 'Dikey 4:5'], ['hikaye', 'Hikâye 9:16'], ['yatay', 'Yatay (kapak)'], ['afis', 'Afiş']]) sz.append(new Option(l, k));
  const eng = el('select', { id: 'imgEngine' }); eng.append(new Option('Otomatik — Gemini + ücretsiz FLUX varyasyonları', 'auto'), new Option('Yalnız ücretsiz FLUX (kotasız)', 'pollinations')); eng.value = store.get('set.imgEngine', 'auto'); eng.onchange = () => store.set('set.imgEngine', eng.value);
  const cnt = el('select', { id: 'imgCount' }); for (const [v, l] of [['4', '4 varyasyon (önerilen)'], ['2', '2 varyasyon'], ['1', 'Tek görsel (hızlı)']]) cnt.append(new Option(l, v)); cnt.value = store.get('set.imgCount', '4'); cnt.onchange = () => store.set('set.imgCount', cnt.value);
  const gl = el('div', { class: 'imggrid', id: 'imgGallery' });
  const p = el('div', { class: 'pane', id: 'p-img', role: 'tabpanel' },
    el('h3', {}, 'GÖRSEL STÜDYOSU'),
    el('p', { class: 'muted' }, 'Yazdığını profesyonel görsele çevirir; her seferinde 4 varyasyon, seç → geliştir → büyüt. Fotoğraf ekleyip “arka planı değiştir” dersen düzenler. Hasta adı yazma.'),
    q, el('div', { class: 'row' }, st, sz),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { const v = q.value.trim(); if (!v) return note('Ne çizeyim?'); $('drawer').classList.remove('open'); run(v, { style: st.value, size: sz.value }); } }, '🎨 Oluştur')),
    el('div', { class: 'field' }, el('label', { for: 'imgEngine' }, 'Görsel motoru'), eng),
    el('div', { class: 'field' }, el('label', { for: 'imgCount' }, 'Varyasyon'), cnt),
    el('h3', {}, 'GALERİ'), gl);
  p.hidden = true; $('p-settings').before(p);
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(x => x.hidden = x.id !== 'p-img'); renderG(); };
  function renderG() { gl.replaceChildren(...(gallery.filter(g => g.src).length ? gallery.filter(g => g.src).map(g => el('button', { type: 'button', class: 'imgthumb', title: g.text, onclick: () => { $('drawer').classList.remove('open'); show(g); } }, el('img', { src: g.src, alt: g.text, loading: 'lazy' }))) : [el('p', { class: 'muted' }, 'Henüz görsel yok.')])); }
  window.jarvisImage = { generate, run, show, toPrompt, pollUrl, refine, upscale, editPhoto, gallery: () => gallery, STYLES };
})();
