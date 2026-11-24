'use strict';
/* SATÜRN 24 — VİDEO STÜDYOSU: konu → senaryo → sahne görselleri → yazılı, hareketli kısa video (Reels/Shorts/YouTube)
 *  • Senaryo: Gemini (sahne metni ≤ 12 kelime + İngilizce görsel istemi); yapay zekâ yoksa satır satır kendi metnin
 *  • Görseller: Pollinations (ücretsiz, anahtarsız); gelmezse marka renklerinde degrade
 *  • Hareket: yavaş yakınlaşma (Ken Burns), yumuşak geçiş, alt yazı bandı, ilerleme çubuğu, marka imzası, kapanış kartı
 *  • Çıktı: telefonda tarayıcının kaydedebildiği biçim (iPhone: MP4, Android/PC: WebM) — indir / paylaş
 *  • Biçim: dikey 9:16 (Reels/Shorts), kare 1:1, yatay 16:9
 */
(() => {
  const SIZES = { dikey: [720, 1280], kare: [960, 960], yatay: [1280, 720] };
  const brand = () => store.get('set.brandName', '') || 'FİZYOVİTA';
  const colors = () => { const c = String(store.get('set.brandColors', '') || '').match(/#[0-9a-f]{6}/gi) || []; return [c[0] || '#0e7c86', c[1] || '#f59e0b']; };
  const SCRIPT_SYS = `Sen kısa video (Instagram Reels / YouTube Shorts) senaristisin. Türkçe, akıcı, merak uyandıran, doğru bilgi.
YALNIZ JSON döndür: {"baslik":"en çok 6 kelime","sahneler":[{"metin":"ekranda görünecek en çok 12 kelimelik cümle","gorsel":"English FLUX prompt, cinematic, photorealistic, no text, no letters"}],"kapanis":"en çok 8 kelimelik çağrı (takip et / randevu al vb.)"}
5-7 sahne. İlk sahne güçlü bir kanca olsun. Sağlık konularında güvenli ve genel bilgi ver, tanı koyma.`;
  async function script(topic, n = 6) {
    try {
      const t = await window.jarvisResearch.ask(SCRIPT_SYS, `Konu: ${topic}\nSahne sayısı: ${n}`, 'quick');
      const j = JSON.parse((String(t).match(/\{[\s\S]*\}/) || ['{}'])[0]);
      const sc = (j.sahneler || []).filter(s => s?.metin).slice(0, 8).map(s => ({ text: String(s.metin).slice(0, 110), prompt: String(s.gorsel || topic).slice(0, 300) }));
      if (sc.length >= 2) return { title: String(j.baslik || topic).slice(0, 60), scenes: sc, cta: String(j.kapanis || 'Takip et, kaydet, paylaş!').slice(0, 70) };
    } catch {}
    // yedek: kullanıcının kendi satırları / cümleleri
    const parts = String(topic).replace(/([.!?])\s+/g, '$1\n').split(/\n/).map(x => x.trim()).filter(x => x.length > 3).slice(0, 7);
    return { title: parts[0]?.slice(0, 60) || topic, scenes: (parts.length ? parts : [topic]).map(x => ({ text: x.slice(0, 110), prompt: topic })), cta: 'Takip et, kaydet, paylaş!' };
  }
  const loadImg = (src, ms = 30000) => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; const to = setTimeout(() => res(null), ms); im.onload = () => { clearTimeout(to); res(im); }; im.onerror = () => { clearTimeout(to); res(null); }; im.src = src; });
  const pickMime = () => { const R = window.MediaRecorder; if (!R) return ''; for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) { try { if (R.isTypeSupported(m)) return m; } catch {} } return ''; };
  function wrap(ctx, text, maxW) { const words = String(text).split(/\s+/), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines.slice(0, 5); }
  function drawCover(ctx, img, W, H, z, panX) {
    if (!img) return;
    const s = Math.max(W / img.width, H / img.height) * z, w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (W - w) / 2 + panX * (w - W) * 0.5, (H - h) / 2, w, h);
  }
  function frame(ctx, W, H, plan, t) {
    const { scenes, sec, imgs, title, cta } = plan, total = scenes.length + 1, idx = Math.min(total - 1, Math.floor(t / sec)), lt = (t - idx * sec) / sec;
    const [c1, c2] = colors();
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H);
    if (idx < scenes.length) {
      const img = imgs[idx];
      if (img) drawCover(ctx, img, W, H, 1 + 0.08 * lt, (idx % 2 ? -1 : 1) * 0.15 * lt);
      else { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, '#0b1220'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      // geçiş: sahne başında kararmadan açılma
      if (lt < 0.12) { ctx.fillStyle = `rgba(0,0,0,${1 - lt / 0.12})`; ctx.fillRect(0, 0, W, H); }
      // alt yazı bandı
      const g2 = ctx.createLinearGradient(0, H * 0.5, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.82)'); ctx.fillStyle = g2; ctx.fillRect(0, H * 0.5, W, H * 0.5);
      const fs = Math.round(Math.min(W, H) * 0.062); ctx.font = `800 ${fs}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const lines = wrap(ctx, scenes[idx].text, W * 0.86), lh = fs * 1.22, y0 = H * 0.84 - (lines.length - 1) * lh;
      const a = Math.min(1, lt / 0.18); ctx.globalAlpha = a;
      lines.forEach((l, i) => { const y = y0 + i * lh + (1 - a) * 20; ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(l, W / 2, y); ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, y); });
      ctx.globalAlpha = 1;
      if (idx === 0) { ctx.font = `700 ${Math.round(fs * 0.62)}px system-ui, sans-serif`; ctx.fillStyle = c2; ctx.fillText(title.toUpperCase(), W / 2, H * 0.12); }
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, '#0b1220'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const fs = Math.round(Math.min(W, H) * 0.075); ctx.textAlign = 'center';
      ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; wrap(ctx, cta, W * 0.84).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.45 + i * fs * 1.2));
      ctx.font = `700 ${Math.round(fs * 0.55)}px system-ui, sans-serif`; ctx.fillStyle = c2; ctx.fillText(brand(), W / 2, H * 0.62);
      const ct = store.get('set.brandContact', ''); if (ct) { ctx.font = `500 ${Math.round(fs * 0.42)}px system-ui, sans-serif`; ctx.fillStyle = '#e5e7eb'; ctx.fillText(ct, W / 2, H * 0.68); }
    }
    // marka imzası + ilerleme
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.028)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(brand(), W * 0.05, H * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, H - 8, W, 8); ctx.fillStyle = c2; ctx.fillRect(0, H - 8, W * Math.min(1, t / (total * sec)), 8);
  }
  async function render(plan, { size = 'dikey', onProgress } = {}) {
    const [W, H] = SIZES[size] || SIZES.dikey, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), total = (plan.scenes.length + 1) * plan.sec, mime = pickMime();
    frame(ctx, W, H, plan, 0);
    if (!mime || !cv.captureStream) throw Error('Bu tarayıcı video kaydını desteklemiyor (iPhone için iOS 14.5+ gerekir).');
    const stream = cv.captureStream(30), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 }), chunks = [];
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(500); const t0 = performance.now();
    await new Promise(res => { const iv = setInterval(() => { const t = (performance.now() - t0) / 1000; frame(ctx, W, H, plan, Math.min(t, total - 0.001)); onProgress?.(Math.min(1, t / total)); if (t >= total) { clearInterval(iv); res(); } }, 1000 / 30); });
    rec.stop(); stream.getTracks().forEach(x => x.stop()); await done;
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (blob.size < 2000) throw Error('Video kaydı boş çıktı — tekrar dene.');
    return { blob, mime: mime.split(';')[0], ext: /mp4/.test(mime) ? 'mp4' : 'webm', poster: cv.toDataURL('image/jpeg', 0.7), W, H, dur: total };
  }
  let busy = false;
  async function make(topic, { size = 'dikey', sec = +store.get('set.videoSec', 3.2) || 3.2, scenes = 6 } = {}) {
    if (busy) throw Error('Bir video zaten hazırlanıyor.'); busy = true;
    const n = bubble('ai', `🎬 Video hazırlanıyor: “${String(topic).slice(0, 80)}” — senaryo yazılıyor…`), st = el('small', { class: 'muted' }); n.el.append(st);
    try {
      setPhase('thinking', 'Video: senaryo…');
      const S = await script(topic, scenes);
      const [W, H] = SIZES[size] || SIZES.dikey;
      st.textContent = `Senaryo hazır (${S.scenes.length} sahne). Görseller üretiliyor…`;
      setPhase('thinking', 'Video: görseller…');
      const seed = Math.floor(Math.random() * 1e6);
      const imgs = await Promise.all(S.scenes.map((s, i) => loadImg(window.jarvisImage?.pollUrl ? window.jarvisImage.pollUrl(s.prompt + ', vertical composition, high detail', [W, H], seed + i) : `https://image.pollinations.ai/prompt/${encodeURIComponent(s.prompt)}?width=${W}&height=${H}&seed=${seed + i}&nologo=true`)));
      const got = imgs.filter(Boolean).length;
      st.textContent = `${got}/${S.scenes.length} görsel hazır${got < S.scenes.length ? ' (gelmeyenler marka renginde)' : ''}. Video kaydediliyor…`;
      setPhase('thinking', 'Video: kaydediliyor…');
      const out = await render({ ...S, imgs, sec }, { size, onProgress: p => { st.textContent = `Video kaydediliyor… %${Math.round(p * 100)}`; } });
      const url = URL.createObjectURL(out.blob), name = (S.title || 'satürn-video').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) + '.' + out.ext;
      st.textContent = `✓ ${Math.round(out.dur)} sn · ${out.W}×${out.H} · ${(out.blob.size / 1048576).toFixed(1)} MB · ${out.ext.toUpperCase()}`;
      n.el.append(el('video', { src: url, poster: out.poster, controls: '', playsinline: '', style: `width:${size === 'yatay' ? 100 : 60}%;max-width:100%;border-radius:12px;display:block;margin:8px 0` }),
        el('div', { class: 'tool' },
          el('a', { class: 'btn', href: url, download: name }, '⬇ Videoyu indir'),
          el('button', { type: 'button', onclick: async () => { try { const f = new File([out.blob], name, { type: out.mime }); if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: S.title }); else note('Paylaşım bu cihazda yok; indirip paylaşabilirsin.'); } catch {} } }, '📤 Paylaş (Instagram/WhatsApp)'),
          el('button', { type: 'button', onclick: () => make(topic, { size: size === 'dikey' ? 'kare' : size === 'kare' ? 'yatay' : 'dikey', sec, scenes }).catch(e => note(e.message)) }, '🔁 Başka biçimde yap')),
        el('p', { class: 'muted' }, `Senaryo: ${S.scenes.map((s, i) => `${i + 1}) ${s.text}`).join(' ')} · Kapanış: ${S.cta}. Müzik/seslendirmeyi Instagram’da ekleyebilirsin.`));
      window.jarvisVideoLast = { ...S, blob: out.blob };
      return `Video hazır: ${S.title} (${Math.round(out.dur)} sn).`;
    } catch (e) { st.textContent = '✗ ' + e.message; throw e; }
    finally { busy = false; setPhase('idle', 'Hazır.'); }
  }

  Object.assign(TOOLS, { video_olustur: { d: 'video_olustur|konu veya metin|dikey/kare/yatay — senaryo + görseller + yazılı hareketli kısa video (Reels/Shorts), indir/paylaş', run: async ([topic, size]) => { setTimeout(() => make(topic, { size: /kare/.test(size || '') ? 'kare' : /yatay|youtube/.test(size || '') ? 'yatay' : 'dikey' }).catch(e => note('Video: ' + e.message)), 30); return 'Video hazırlanıyor (yaklaşık 30-60 sn); hazır olunca sohbette görünecek.'; } } });
  TOOL_GROUPS.push([/video|reels|shorts|klip|tiktok/i, /^video_olustur$/]);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + '\nVİDEO: “video yap / reels hazırla / kısa video” → video_olustur (dikey Reels varsayılan; YouTube için yatay).';
  const _lc = localCommand;
  localCommand = text0 => {
    const t = text0.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|satürn|saturn)[,\s]+/i, '').replace(/[?.!]+$/, ''); let m;
    if (window.jarvisUltra?.guest?.()) return _lc(text0);
    if ((m = t.match(/^(?:(kare|yatay|dikey|youtube) )?(?:video|reels|kısa video|shorts)(?: (?:yap|oluştur|hazırla|üret))?[: ]+(.{3,600})$/i)) || (m = t.match(/^(?:(kare|yatay|dikey|youtube) )?(.{3,300}?) (?:hakkında|için|konulu) (?:bir )?(?:video|reels|kısa video)(?: (?:yap|oluştur|hazırla|üret))?$/i))) {
      const size = /kare/i.test(m[1] || '') ? 'kare' : /yatay|youtube/i.test(m[1] || '') || /youtube/i.test(t) ? 'yatay' : 'dikey';
      make(m[2], { size }).catch(e => note('Video: ' + e.message));
      return `🎬 “${m[2].slice(0, 60)}” için ${size} video hazırlıyorum (30-60 sn)…`;
    }
    return _lc(text0);
  };
  window.jarvisVideo = { script, render, make, frame, pickMime, SIZES };
})();
