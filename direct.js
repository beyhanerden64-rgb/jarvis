'use strict';
/* GitHub Pages sürümü: sunucu yok. Uygulamanın /api uçları tarayıcıda taklit edilir ve Claude API'ye doğrudan bağlanılır.
 * Claude API anahtarı yalnızca bu cihazın tarayıcısında saklanır; depoda veya kodda anahtar yoktur. */
(() => {
  const getKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  const MODELS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };
  const MAX_TOKENS = { quick: 1024, default: 2048, complex: 4096 };
  const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  function normalizeMessages(input, image) {
  if (!Array.isArray(input) || !input.length || input.length > 40) throw Object.assign(Error('Sohbet geçmişi geçersiz.'), { status: 400 });
  const out = [];
  let total = 0;
  for (const m of input) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim()) continue;
    const content = m.content.slice(0, 20000);
    total += content.length;
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += '\n\n' + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out.at(-1).role !== 'user' || total > 150000) throw Object.assign(Error('Sohbet geçmişi geçersiz veya çok uzun.'), { status: 400 });
  if (image) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(image.mediaType) || typeof image.data !== 'string' || image.data.length > 7_000_000 || !/^[A-Za-z0-9+/]+=*$/.test(image.data))
      throw Object.assign(Error('Görsel okunamadı.'), { status: 400 });
    const last = out.at(-1);
    last.content = [{ type: image.mediaType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text: last.content }];
  }
  return out;
}
  function textStream(upstream) {
  const reader = upstream.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
  let buffer = '';
  return new ReadableStream({
    async pull(ctrl) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            ctrl.close();
            return;
          }
          buffer += dec.decode(value, { stream: true });
          let at, out = '';
          while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at).trim();
            buffer = buffer.slice(at + 1);
            if (!line.startsWith('data:')) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') out += ev.delta.text;
            else if (ev.type === 'error') out += '\u0000ERR:' + (ev.error?.type === 'overloaded_error' ? 'Claude şu an yoğun; tekrar dene.' : 'Yanıt yarıda kesildi.');
          }
          if (out) {
            ctrl.enqueue(enc.encode(out));
            return;
          }
        }
      } catch {
        ctrl.enqueue(enc.encode('\u0000ERR:Bağlantı kesildi.'));
        ctrl.close();
      }
    },
    cancel() { return reader.cancel().catch(() => {}); }
  });
}
  // Claude keys start with sk-ant-. Google keys come in several formats (AIza…, AQ.…), so anything else that looks like a key is Gemini.
  const provider = () => { const k = getKey(); return /^sk-ant-[\w-]{20,}$/.test(k) ? 'claude' : /^[\w.\-]{30,200}$/.test(k) ? 'gemini' : null; };
  // Gemini free tier. Model names change between releases: try in order, remember the one that answers.
  // Lite first: fastest answers for a voice assistant and the most generous free quota.
  const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'];
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
  // Automatic model choice: quick/default questions → fastest lite model; complex ones (analysis, planning, maths) → stronger flash model first.
  const geminiOrder = tier => {
    if (tier === 'complex') return ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
    const ok = localStorage.getItem('jarvisapp.geminiModel'); return ok ? [ok, ...GEMINI_MODELS.filter(m => m !== ok)] : GEMINI_MODELS;
  };
  // Akıllı yönlendirici (brain.js) varsa: soğumadaki modelleri atlar, sağlıklı/hızlı olanı öne alır, sonuçları öğrenir.
  const gate = () => window.jarvisModelGate;
  const routed = (list, tier) => { try { return gate()?.order(list, tier) || list; } catch { return list; } };
  const report = (model, status, ms) => { try { gate()?.report(model, status, ms); } catch {} };
  // Optional natural voice: ElevenLabs with the user's own (free-tier) key.
  const setv = k => { try { return JSON.parse(localStorage.getItem('jarvisapp.set.' + k) || '""'); } catch { return ''; } };
  async function eleven(text, signal) {
    const voice = setv('elevenVoice') || 'pNInz6obpgDQGcFmaJgB';
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voice + '?output_format=mp3_44100_64', { method: 'POST', signal, headers: { 'xi-api-key': setv('elevenKey'), 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text: String(text).slice(0, 2500), model_id: 'eleven_flash_v2_5', language_code: 'tr', voice_settings: { stability: 0.45, similarity_boost: 0.8 } }) });
    if (!r.ok) { const quota = r.status === 401 || r.status === 429 || r.status === 402; return json(quota ? 429 : 503, { error: quota ? 'ElevenLabs kotası doldu veya anahtar geçersiz.' : 'Doğal ses alınamadı.', code: quota ? 'speech_quota_exceeded' : 'speech_failed', retryAfter: quota ? 3600 : 60 }); }
    return new Response(await r.blob(), { headers: { 'Content-Type': 'audio/mpeg', 'X-Jarvis-Speech': 'ElevenLabs' } });
  }
  // Natural voice with the user's own free Gemini key (Gemini TTS). Newer models take voiceConfig.voice + speech_metadata.style;
  // older preview models take prebuiltVoiceConfig.voiceName. The model that works is remembered.
  const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
  const STYLES = { jarvis: 'lively, fluent, confident and warm male AI assistant; natural conversational Turkish with expressive intonation; brisk, engaging pace, never robotic or monotone', sakin: 'calm, soft and reassuring', enerjik: 'energetic, upbeat and friendly', resmi: 'formal, precise and professional', sicak: 'warm, gentle and caring' };
  const ttsOrder = () => { const ok = localStorage.getItem('jarvisapp.ttsModel'); return routed(ok ? [ok, ...TTS_MODELS.filter(m => m !== ok)] : TTS_MODELS, 'tts'); };
  const b64bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  function wav(pcm, rate = 24000) { // 16-bit mono PCM → WAV
    const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
    h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
    return new Blob([h.buffer, pcm], { type: 'audio/wav' });
  }
  async function geminiTts(text, voice, signal) {
    const v = /^[A-Z][a-z]+$/.test(voice || '') ? voice : setv('ttsVoice') || 'Charon', style = STYLES[setv('ttsStyle')] || STYLES.jarvis;
    let last = null;
    for (const model of ttsOrder()) {
      const modern = /^gemini-3\.8/.test(model);
      const bodies = modern
        ? [{ contents: [{ role: 'user', parts: [{ text, speech_metadata: { style } }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice: v } } } },
           { contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } } } }]
        : [{ contents: [{ role: 'user', parts: [{ text: `Şu metni ${style} bir tonla, doğal Türkçe ile seslendir: ${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } } } }];
      for (const body of bodies) {
        let r;
        try { r = await fetch(GEMINI + model + ':generateContent', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() }, body: JSON.stringify(body) }); }
        catch (e) { if (signal?.aborted) throw e; last = { status: 503 }; continue; }
        if (r.status === 400) { last = r; continue; }            // request shape not accepted by this model: try the other shape / model
        report(model, r.status, 0);
        if ([403, 404].includes(r.status)) { last = r; break; } // model not available for this key
        if (r.status === 429) return json(429, { error: 'Doğal ses kotası doldu; cihaz sesine geçiyorum.', code: 'speech_quota_exceeded', retryAfter: 900 });
        if (!r.ok) { last = r; break; }
        const d = await r.json();
        const part = d.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
        if (!part) { last = { status: 502 }; break; }
        localStorage.setItem('jarvisapp.ttsModel', model);
        const mime = part.inlineData.mimeType || '', bytes = b64bytes(part.inlineData.data);
        const blob = /wav/i.test(mime) || (bytes[0] === 0x52 && bytes[1] === 0x49) ? new Blob([bytes], { type: 'audio/wav' }) : wav(bytes, Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000);
        return new Response(blob, { headers: { 'Content-Type': 'audio/wav', 'X-Jarvis-Speech': 'Gemini ' + model.replace('gemini-', ''), 'X-Jarvis-Voice': v } });
      }
    }
    return json(503, { error: 'Doğal ses şu an alınamadı (' + (last?.status || '?') + ').', code: 'speech_failed', retryAfter: 120 });
  }

  // ---- Konuşmayı yazıya çevirme (Gemini): iPhone ana ekran uygulamasında tarayıcı tanıması çalışmadığında ----
  async function toWav16k(bytes) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw Error('ses çözülemedi');
    const ctx = new AC();
    try {
      const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(bytes.buffer.slice(0), res, rej); p?.then?.(res, rej); });
      const ch = buf.numberOfChannels, n = buf.length, src = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) src[i] += d[i] / ch; }
      const rate = 16000, ratio = buf.sampleRate / rate, out = new Int16Array(Math.floor(n / ratio));
      for (let i = 0; i < out.length; i++) { const v = Math.max(-1, Math.min(1, src[Math.floor(i * ratio)])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      return wav(new Uint8Array(out.buffer), rate);
    } finally { ctx.close?.().catch?.(() => {}); }
  }
  async function geminiStt(options) {
    const body = JSON.parse(options.body || '{}'), raw = b64bytes(body.data || '');
    if (raw.length < 1500) return json(400, { error: 'Ses algılanmadı.' });
    let mime = String(body.mimeType || 'audio/webm').split(';')[0], data = body.data;
    if (!/^audio\/(?:wav|mp3|mpeg|aac|ogg|flac|aiff)$/.test(mime)) { // iPhone: audio/mp4, Chrome: audio/webm → WAV
      try { const w = await toWav16k(raw); data = await blobToB64(w); mime = 'audio/wav'; } catch {}
    }
    const lang = ({ 'ar-SA': 'Arapça', 'en-US': 'İngilizce', 'ku': 'Kürtçe' })[setv('listenLang')] || 'Türkçe';
    const req = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: `Bu ses kaydındaki konuşmayı ${lang} olarak kelimesi kelimesine yazıya dök. Yalnızca söylenen metni yaz; yorum, açıklama, tırnak ekleme. Konuşma yoksa veya anlaşılmıyorsa tek kelime yaz: BOŞ` }] }], generationConfig: { temperature: 0, maxOutputTokens: 400 } };
    let last = null;
    for (const model of routed(['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'], 'quick')) {
      const t0 = performance.now();
      try {
        const r = await fetch(GEMINI + model + ':generateContent', { method: 'POST', signal: options.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() }, body: JSON.stringify(req) });
        report(model, r.status, performance.now() - t0);
        if (!r.ok) { last = r.status; continue; }
        const d = await r.json();
        const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim().replace(/^["“]|["”]$/g, '');
        if (!text || /^BOŞ\.?$/i.test(text)) return json(200, { text: '', error: 'Konuşma anlaşılamadı, tekrar söyler misin?' });
        return json(200, { text, model });
      } catch (e) { if (options.signal?.aborted) throw e; last = e.message; }
    }
    return json(503, { error: 'Ses yazıya çevrilemedi (' + last + ').' });
  }
  const blobToB64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });

  // ---- kısa ifadelerin doğal sesi önbellekte tutulur (aynı “Tamam.”, “Hazırım.” için kota harcanmaz) ----
  const TTS_CACHE = 'jarvis-tts-v1';
  async function cachedTts(text, voice, signal) {
    const key = new Request('https://tts.jarvis/' + encodeURIComponent([voice || setv('ttsVoice') || 'Charon', setv('ttsStyle') || 'jarvis', text.trim()].join('|')));
    const short = text.trim().length <= 160;
    if (short && window.caches) { try { const c = await caches.open(TTS_CACHE); const hit = await c.match(key); if (hit) { const h = new Headers(hit.headers); h.set('X-Jarvis-Speech', (h.get('X-Jarvis-Speech') || 'Gemini') + ' · önbellek'); return new Response(await hit.blob(), { headers: h }); } } catch {} }
    const r = await geminiTts(text, voice, signal);
    if (short && r.ok && window.caches) { try { const c = await caches.open(TTS_CACHE); await c.put(key, r.clone()); const ks = await c.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - 300))) await c.delete(k); } catch {} }
    return r;
  }
  const engine = () => (setv('ttsEngine') === 'eleven' && setv('elevenKey') ? 'eleven' : provider() === 'gemini' ? 'gemini' : setv('elevenKey') ? 'eleven' : null);
  const speechRoute = options => {
    const e = engine();
    if (options.method !== 'POST') return Promise.resolve(json(200, { configured: !!e, naturalReady: !!e, retryAfter: 0, engine: e }));
    const body = JSON.parse(options.body || '{}');
    if (e === 'gemini') return cachedTts(String(body.text || '').slice(0, 3000), body.voice, options.signal);
    if (e === 'eleven') return eleven(body.text, options.signal);
    return Promise.resolve(json(503, { error: 'Doğal ses ayarlı değil.', code: 'speech_not_configured' }));
  };
  function geminiBody(body) {
    const msgs = normalizeMessages(body.messages, body.image);
    const contents = msgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content.map(c => (c.type === 'image' || c.type === 'document' ? { inlineData: { mimeType: c.source.media_type, data: c.source.data } } : { text: c.text }))
    }));
    const tier = ['quick', 'default', 'complex'].includes(body.tier) ? body.tier : 'default';
    const out = { systemInstruction: { parts: [{ text: String(body.system || '').slice(0, 40000) }] }, contents, generationConfig: { maxOutputTokens: MAX_TOKENS[tier] * 2 } };
    if (body.search) out.tools = [{ google_search: {} }];
    return out;
  }
  async function gemini(body, signal) {
    let last = null;
    for (const model of routed(geminiOrder(body.tier), body.tier)) {
      const t0 = performance.now();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      // Each model gets 20 s to start answering; a busy model is skipped instead of hanging the app.
      const ac = new AbortController(), stop = () => ac.abort();
      signal?.addEventListener('abort', stop, { once: true });
      const timer = setTimeout(stop, 20000);
      let r;
      try {
        r = await fetch(GEMINI + model + ':streamGenerateContent?alt=sse', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() }, body: JSON.stringify(geminiBody(body)) });
      } catch (e) {
        clearTimeout(timer); signal?.removeEventListener('abort', stop);
        if (signal?.aborted) throw e;
        report(model, 504, performance.now() - t0);
        last = json(503, { error: { message: 'timeout' } });
        continue;
      }
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      // Missing model, its free quota used up, or the model is overloaded: try the next one.
      if (r.status === 400 && body.search) { body = { ...body, search: false }; return gemini(body, signal); } // model without search tool support
      report(model, r.status, performance.now() - t0);
      if ([404, 429, 500, 503].includes(r.status) || (r.status === 400 && /model/i.test(await r.clone().text()))) { last = r; continue; }
      if (r.ok && body.tier !== 'complex') localStorage.setItem('jarvisapp.geminiModel', model);
      if (r.ok) window.jarvisLastModel = model;
      return r;
    }
    return last;
  }
  function geminiStream(upstream) {
    const reader = upstream.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
    let buffer = '';
    const sources = new Map();
    return new ReadableStream({
      async pull(ctrl) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              if (sources.size) ctrl.enqueue(enc.encode('\u0000SRC:' + JSON.stringify([...sources].map(([url, title]) => ({ url, title })))));
              ctrl.close(); return;
            }
            buffer += dec.decode(value, { stream: true });
            let at, out = '';
            while ((at = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1);
              if (!line.startsWith('data:')) continue;
              let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
              if (ev.error) out += '\u0000ERR:' + (ev.error.code === 429 ? 'Ücretsiz kota doldu; biraz sonra dene.' : 'Yanıt yarıda kesildi.');
              for (const part of ev.candidates?.[0]?.content?.parts || []) if (typeof part.text === 'string' && !part.thought) out += part.text;
              for (const ch of ev.candidates?.[0]?.groundingMetadata?.groundingChunks || []) if (ch.web?.uri) sources.set(ch.web.uri, ch.web.title || '');
            }
            if (out) { ctrl.enqueue(enc.encode(out)); return; }
          }
        } catch { ctrl.enqueue(enc.encode('\u0000ERR:Bağlantı kesildi.')); ctrl.close(); }
      },
      cancel() { return reader.cancel().catch(() => {}); }
    });
  }
  async function explainGemini(r) {
    let d = {}; try { d = await r.json(); } catch {}
    const m = d?.error?.message || '';
    if (r.status === 400 && /api key/i.test(m) || r.status === 401 || r.status === 403) return json(401, { error: 'Gemini anahtarı geçersiz. aistudio.google.com → Get API key bölümünden kontrol et.' });
    if (r.status === 429) return json(429, { error: 'Ücretsiz Gemini kotası şu an doldu; bir dakika sonra tekrar dene.' });
    if (r.status === 404) return json(502, { error: 'Gemini modeli bulunamadı; uygulamanın güncellenmesi gerekiyor.' });
    if (r.status >= 500) return json(503, { error: 'Gemini şu an çok yoğun; birkaç saniye sonra tekrar dene.' });
    return json(502, { error: 'Gemini yanıt veremedi (' + r.status + ').' });
  }
  const anthropic = (body, signal) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': getKey(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body)
  });
  async function explain(r, model) {
    let d = {};
    try { d = await r.json(); } catch {}
    const m = d?.error?.message || '';
    if (r.status === 401 || r.status === 403) return json(401, { error: 'Claude API anahtarı geçersiz. console.anthropic.com → API Keys bölümünden kontrol et.' });
    if (/credit|billing/i.test(m)) return json(402, { error: 'Claude hesabında kredi yok. console.anthropic.com → Billing bölümünden kredi yükle.' });
    if (r.status === 429) return json(429, { error: 'Claude kullanım sınırı doldu; biraz sonra dene.' });
    if (r.status === 529) return json(503, { error: 'Claude şu an yoğun; tekrar dene.' });
    if (r.status === 404) return json(502, { error: 'Model bulunamadı: ' + model });
    return json(502, { error: 'Claude yanıt veremedi (' + r.status + ').' });
  }
  window.jarvisDirect = {
    async fetch(path, options = {}) {
      const url = new URL(String(path), location.href);
      const at = url.pathname.indexOf('/api/');
      if (at < 0) return fetch(path, options);
      const route = url.pathname.slice(at);
      if (!provider()) return json(401, { error: 'Geçerli bir anahtar gir: ücretsiz Gemini anahtarı veya Claude anahtarı (sk-ant-…).' });
      if (provider() === 'gemini') {
        if (route === '/api/status') {
          const validate = new Headers(options.headers || {}).get('x-validate');
          if (validate || !sessionStorage.getItem('jarvisapp.ok')) {
            const r = await fetch(GEMINI.replace(/models\/$/, 'models?pageSize=5'), { headers: { 'x-goog-api-key': getKey() } });
            if (!r.ok) return explainGemini(r);
            sessionStorage.setItem('jarvisapp.ok', '1');
          }
          return json(200, { ok: true, brain: true, speech: true, stt: true, sync: false, direct: true, provider: 'gemini' });
        }
        if (route === '/api/speech') return speechRoute(options);
        if (route === '/api/stt') return geminiStt(options);
        if (route === '/api/chat') {
          const r = await gemini(JSON.parse(options.body || '{}'), options.signal);
          if (!r.ok) return explainGemini(r);
          return new Response(geminiStream(r), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      }
      try {
        if (route === '/api/status') {
          const validate = new Headers(options.headers || {}).get('x-validate');
          if (validate || !sessionStorage.getItem('jarvisapp.ok')) {
            const r = await anthropic({ model: MODELS.quick, max_tokens: 1, messages: [{ role: 'user', content: '.' }] });
            if (!r.ok && r.status !== 429 && r.status !== 529) return explain(r, MODELS.quick);
            sessionStorage.setItem('jarvisapp.ok', '1');
          }
          return json(200, { ok: true, brain: true, speech: !!setv('elevenKey'), stt: false, sync: false, direct: true });
        }
        if (route === '/api/chat') {
          const body = JSON.parse(options.body || '{}');
          const tier = ['quick', 'default', 'complex'].includes(body.tier) ? body.tier : 'default';
          const model = MODELS[tier];
          const r = await anthropic({ model, max_tokens: MAX_TOKENS[tier], system: String(body.system || '').slice(0, 40000), messages: normalizeMessages(body.messages, body.image), stream: true }, options.signal);
          if (!r.ok) return explain(r, model);
          return new Response(textStream(r), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
        if (route === '/api/speech') return speechRoute(options);
        return json(503, { error: 'Bu özellik GitHub sürümünde yok.' });
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        return json(e?.status || 502, { error: e?.status ? e.message : 'Claude’a ulaşılamadı. İnternet bağlantını kontrol et.' });
      }
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const p = document.querySelector('#gateForm .muted');
    if (p) p.textContent = 'Ücretsiz kullanım: aistudio.google.com → “Get API key” ile aldığın Gemini anahtarını gir. Claude anahtarı (sk-ant-…) da olur ama ücretlidir. Anahtar yalnızca bu cihazda saklanır.';
    const i = document.getElementById('gateKey');
    if (i) { i.placeholder = 'Gemini API anahtarı'; i.setAttribute('aria-label', 'Yapay zekâ anahtarı'); i.autocomplete = 'off'; }
    const out = document.getElementById('logout');
    if (out) out.textContent = 'Bu cihazdan anahtarı sil';
  });
})();
