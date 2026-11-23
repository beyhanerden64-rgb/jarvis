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
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.mediaType) || typeof image.data !== 'string' || image.data.length > 7_000_000 || !/^[A-Za-z0-9+/]+=*$/.test(image.data))
      throw Object.assign(Error('Görsel okunamadı.'), { status: 400 });
    const last = out.at(-1);
    last.content = [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text: last.content }];
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
  const provider = () => (/^AIza[\w-]{30,}$/.test(getKey()) ? 'gemini' : /^sk-ant-[\w-]{20,}$/.test(getKey()) ? 'claude' : null);
  // Gemini free tier. Model names change between releases: try in order, remember the one that answers.
  const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const geminiOrder = () => { const ok = localStorage.getItem('jarvisapp.geminiModel'); return ok ? [ok, ...GEMINI_MODELS.filter(m => m !== ok)] : GEMINI_MODELS; };
  function geminiBody(body) {
    const msgs = normalizeMessages(body.messages, body.image);
    const contents = msgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content.map(c => (c.type === 'image' ? { inlineData: { mimeType: c.source.media_type, data: c.source.data } } : { text: c.text }))
    }));
    const tier = ['quick', 'default', 'complex'].includes(body.tier) ? body.tier : 'default';
    return { systemInstruction: { parts: [{ text: String(body.system || '').slice(0, 40000) }] }, contents, generationConfig: { maxOutputTokens: MAX_TOKENS[tier] * 2 } };
  }
  async function gemini(body, signal) {
    let last;
    for (const model of geminiOrder()) {
      const r = await fetch(GEMINI + model + ':streamGenerateContent?alt=sse', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() }, body: JSON.stringify(geminiBody(body)) });
      if (r.status === 404 || (r.status === 400 && /model/i.test(await r.clone().text()))) { last = r; continue; }
      if (r.ok) localStorage.setItem('jarvisapp.geminiModel', model);
      return r;
    }
    return last;
  }
  function geminiStream(upstream) {
    const reader = upstream.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
    let buffer = '';
    return new ReadableStream({
      async pull(ctrl) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) { ctrl.close(); return; }
            buffer += dec.decode(value, { stream: true });
            let at, out = '';
            while ((at = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1);
              if (!line.startsWith('data:')) continue;
              let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
              if (ev.error) out += '\u0000ERR:' + (ev.error.code === 429 ? 'Ücretsiz kota doldu; biraz sonra dene.' : 'Yanıt yarıda kesildi.');
              for (const part of ev.candidates?.[0]?.content?.parts || []) if (typeof part.text === 'string' && !part.thought) out += part.text;
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
      if (!provider()) return json(401, { error: 'Geçerli bir anahtar gir: ücretsiz Gemini (AIza…) veya Claude (sk-ant-…).' });
      if (provider() === 'gemini') {
        if (route === '/api/status') {
          const validate = new Headers(options.headers || {}).get('x-validate');
          if (validate || !sessionStorage.getItem('jarvisapp.ok')) {
            const r = await fetch(GEMINI.replace(/models\/$/, 'models?pageSize=5'), { headers: { 'x-goog-api-key': getKey() } });
            if (!r.ok) return explainGemini(r);
            sessionStorage.setItem('jarvisapp.ok', '1');
          }
          return json(200, { ok: true, brain: true, speech: false, stt: false, sync: false, direct: true, provider: 'gemini' });
        }
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
          return json(200, { ok: true, brain: true, speech: false, stt: false, sync: false, direct: true });
        }
        if (route === '/api/chat') {
          const body = JSON.parse(options.body || '{}');
          const tier = ['quick', 'default', 'complex'].includes(body.tier) ? body.tier : 'default';
          const model = MODELS[tier];
          const r = await anthropic({ model, max_tokens: MAX_TOKENS[tier], system: String(body.system || '').slice(0, 40000), messages: normalizeMessages(body.messages, body.image), stream: true }, options.signal);
          if (!r.ok) return explain(r, model);
          return new Response(textStream(r), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
        if (route === '/api/speech') return options.method === 'POST' ? json(503, { error: 'Doğal ses bu sürümde yok; cihaz sesi kullanılır.', code: 'speech_not_configured' }) : json(200, { configured: false, naturalReady: false, retryAfter: 0 });
        return json(503, { error: 'Bu özellik GitHub sürümünde yok.' });
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        return json(e?.status || 502, { error: e?.status ? e.message : 'Claude’a ulaşılamadı. İnternet bağlantını kontrol et.' });
      }
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const p = document.querySelector('#gateForm .muted');
    if (p) p.textContent = 'Ücretsiz kullanım: aistudio.google.com → “Get API key” ile aldığın Gemini anahtarını (AIza… ile başlar) gir. Claude anahtarı (sk-ant-…) da olur ama ücretlidir. Anahtar yalnızca bu cihazda saklanır.';
    const i = document.getElementById('gateKey');
    if (i) { i.placeholder = 'AIza… (ücretsiz Gemini) veya sk-ant-…'; i.setAttribute('aria-label', 'Yapay zekâ anahtarı'); i.autocomplete = 'off'; }
    const out = document.getElementById('logout');
    if (out) out.textContent = 'Bu cihazdan anahtarı sil';
  });
})();
