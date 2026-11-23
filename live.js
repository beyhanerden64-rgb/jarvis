'use strict';
/* JARVIS 9.3 — CANLI MOD (Gemini Live, yerel ses modeli)
 * Metni sese çevirmek yerine Gemini doğrudan konuşur: akıcı, canlı, insan gibi tonlama; sözünü kesebilirsin,
 * neredeyse beklemeden cevap verir. Ücretsiz Gemini anahtarıyla çalışır. JARVIS araçlarını (hatırlatma, takvim,
 * bilgisayar, hasta…) konuşurken kullanabilir. iPhone'da da çalışır (mikrofon + Web Audio, sessiz anahtara rağmen). */
(() => {
  const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
  const MODELS = ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-2.5-flash-native-audio-preview-09-2025', 'gemini-live-2.5-flash-preview'];
  const VOICES = [['Puck', 'Puck · erkek, neşeli ve canlı (önerilen)'], ['Fenrir', 'Fenrir · erkek, heyecanlı, enerjik'], ['Charon', 'Charon · erkek, net ve bilgilendirici'], ['Orus', 'Orus · erkek, kararlı'], ['Iapetus', 'Iapetus · erkek, berrak'], ['Algenib', 'Algenib · erkek, tok'], ['Sadachbia', 'Sadachbia · erkek, canlı'], ['Kore', 'Kore · kadın, kararlı'], ['Aoede', 'Aoede · kadın, ferah'], ['Leda', 'Leda · kadın, genç'], ['Zephyr', 'Zephyr · kadın, parlak'], ['Laomedeia', 'Laomedeia · kadın, neşeli']];
  const getKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let S = null; // aktif oturum

  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function liveInstructions() {
    let base = '';
    try { base = instructions(true); } catch {}
    return (base.slice(0, 24000) + `\n\nCANLI SESLİ SOHBET: Şu an Beyhan'la gerçek zamanlı sesli konuşuyorsun. Doğal, akıcı, canlı ve sıcak bir Türkçe ile konuş; kısa cümleler kur, gereksiz uzatma, liste okuma. Sözün kesilirse hemen dur ve dinle. Bir iş yapman gerekiyorsa jarvis_arac fonksiyonunu kullan (komut = araç biçimi, ör. "hatirlat|yarın 10:00|ilaç", "takvim_oku|bugün", "hava|Cizre"); sonucu kısaca söyle. Silme, kapatma gibi işler için Beyhan'a ekranda onay sorulur.`).trim();
  }
  const setupMsg = (model, shape) => {
    const voice = opt('liveVoice') || 'Puck';
    const speech = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }, languageCode: 'tr-TR' };
    const tools = [{ functionDeclarations: [{ name: 'jarvis_arac', description: 'JARVIS aracını çalıştırır ve sonucu döndürür (hatırlatma, takvim, hava, hesap, hasta kayıtları, kasa, bilgisayar kontrolü vb.).', parameters: { type: 'OBJECT', properties: { komut: { type: 'STRING', description: 'Araç adı ve argümanlar | ile ayrılmış, ör. "hava|Cizre"' } }, required: ['komut'] } }] }];
    const common = { model: 'models/' + model, systemInstruction: { parts: [{ text: liveInstructions() }] }, tools, inputAudioTranscription: {}, outputAudioTranscription: {} };
    return shape === 0
      ? { setup: { ...common, generationConfig: { responseModalities: ['AUDIO'], speechConfig: speech } } }
      : { setup: { ...common, responseModalities: ['AUDIO'], speechConfig: speech } };
  };

  /* ---------- ses çalma (24 kHz PCM) ---------- */
  function playPcm(bytes, rate = 24000) {
    const ctx = S.out; if (!ctx) return;
    const n = bytes.length >> 1, dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), buf = ctx.createBuffer(1, n, rate), ch = buf.getChannelData(0);
    let peak = 0; for (let i = 0; i < n; i++) { const v = dv.getInt16(i * 2, true) / 32768; ch[i] = v; peak = Math.max(peak, Math.abs(v)); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.03, S.playAt); src.start(at); S.playAt = at + buf.duration;
    S.sources.add(src); src.onended = () => { S?.sources.delete(src); if (S && !S.sources.size) { setPhase('listening', 'Canlı · dinliyorum'); window.jarvisAvatarLevel?.(0); } };
    window.jarvisAvatarLevel?.(Math.min(1, peak * 1.6));
    if (phase !== 'speaking') setPhase('speaking', 'Canlı · konuşuyor');
  }
  const stopPlayback = () => { for (const s of S?.sources || []) { try { s.stop(); } catch {} } S?.sources.clear(); if (S) S.playAt = 0; window.jarvisAvatarLevel?.(0); };

  /* ---------- mikrofon (16 kHz PCM) ---------- */
  async function startMic() {
    S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const AC = window.AudioContext || window.webkitAudioContext;
    S.inCtx = new AC();
    const src = S.inCtx.createMediaStreamSource(S.stream), proc = S.inCtx.createScriptProcessor(4096, 1, 1), ratio = S.inCtx.sampleRate / 16000;
    proc.onaudioprocess = e => {
      if (!S?.ready || S.muted) return;
      const d = e.inputBuffer.getChannelData(0), out = new Int16Array(Math.floor(d.length / ratio)); let peak = 0;
      for (let i = 0; i < out.length; i++) { const v = Math.max(-1, Math.min(1, d[Math.floor(i * ratio)])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; peak = Math.max(peak, Math.abs(v)); }
      if (!S.sources.size) window.jarvisAvatarLevel?.(Math.min(1, peak * 3));
      try { S.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(out.buffer), mimeType: 'audio/pcm;rate=16000' } } })); } catch {}
    };
    const mute = S.inCtx.createGain(); mute.gain.value = 0; // işlemcinin çalışması için hedefe bağlı ama sessiz
    src.connect(proc); proc.connect(mute); mute.connect(S.inCtx.destination);
    S.proc = proc;
  }

  /* ---------- sohbet balonları ---------- */
  const flushUser = () => { if (S?.userText.trim()) { const t = S.userText.trim(); bubble('me', t); S.lastUser = t; if (/canlı mod(?:u|dan)? (?:kapat|çık|bitir)|canlıyı kapat/i.test(t)) setTimeout(() => stop('Canlı mod kapandı.'), 300); } if (S) S.userText = ''; };
  const flushAi = () => { if (S?.aiText.trim()) { const t = S.aiText.trim(); bubble('ai', t); try { archiveTurn(S.lastUser || '(sesli)', t); } catch {} } if (S) S.aiText = ''; };

  async function onMessage(ev) {
    let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch { return; }
    if (m.setupComplete) { S.ready = true; S.okModel = S.model; store.set('liveModel', S.model); setPhase('listening', 'Canlı · dinliyorum — konuşabilirsin'); note('Canlı mod açık (' + S.model.replace(/^gemini-/, '') + ' · ' + (opt('liveVoice') || 'Puck') + '). Doğal konuş; istediğinde sözümü kesebilirsin. Kapatmak için CANLI düğmesi ya da “canlı modu kapat”.'); return; }
    const sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) { stopPlayback(); flushAi(); setPhase('listening', 'Canlı · dinliyorum'); }
      if (sc.inputTranscription?.text) { if (S.aiText) flushAi(); S.userText += sc.inputTranscription.text; }
      if (sc.outputTranscription?.text) { if (S.userText) flushUser(); S.aiText += sc.outputTranscription.text; }
      for (const p of sc.modelTurn?.parts || []) {
        if (p.inlineData?.data) { if (S.userText) flushUser(); playPcm(unb64(p.inlineData.data), Number((p.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1]) || 24000); }
        else if (p.text && !sc.outputTranscription) S.aiText += p.text;
      }
      if (sc.turnComplete) { flushUser(); flushAi(); }
    }
    if (m.toolCall?.functionCalls?.length) {
      const responses = [];
      for (const fc of m.toolCall.functionCalls) {
        let result = '';
        try { const r = await window.jarvisRunTools([String(fc.args?.komut || '')], { say: false }); result = r?.text || 'tamam'; } catch (e) { result = 'HATA: ' + e.message; }
        responses.push({ id: fc.id, name: fc.name, response: { result: short(result, 4000) } });
        logOp('canlı araç', [fc.args?.komut || ''], /BAŞARISIZ|HATA/.test(result) ? 'başarısız' : 'başarılı', short(result, 200));
      }
      try { S.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } })); } catch {}
    }
    if (m.goAway) note('Canlı oturum süresi doluyor; birazdan yeniden bağlanacağım.');
  }

  function connect(mi = 0, shape = 0) {
    const order = [...new Set([store.get('liveModel', ''), ...MODELS].filter(Boolean))];
    if (mi >= order.length) { stop('Canlı mod şu an açılamadı (ücretsiz canlı ses kotası dolmuş ya da bu anahtarda kapalı olabilir). Normal sesli moda döndüm.'); return; }
    S.model = order[mi]; S.ready = false;
    const ws = new WebSocket(WS + encodeURIComponent(getKey())); S.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify(setupMsg(S.model, shape)));
    ws.onmessage = onMessage;
    ws.onclose = e => {
      if (!S || S.ws !== ws) return;
      if (!S.ready) { // kurulum reddedildi: önce diğer biçimi, sonra diğer modeli dene
        const reason = String(e.reason || '');
        if (/quota|exhausted|429|limit/i.test(reason)) return stop('Canlı ses için bugünkü ücretsiz kota doldu. Normal sesli moda döndüm.');
        return shape === 0 ? connect(mi, 1) : connect(mi + 1, 0);
      }
      if (S.stopping) return;
      // ~10 dk bağlantı sınırı: kesintisiz yeniden bağlan
      if (Date.now() - S.started < 60 * 60000) { S.reconnects = (S.reconnects || 0) + 1; if (S.reconnects < 8) return connect(mi, shape); }
      stop('Canlı bağlantı kapandı' + (e.reason ? ' (' + short(e.reason, 80) + ')' : '') + '.');
    };
    ws.onerror = () => {};
  }

  async function start() {
    if (S) return;
    if (!getKey()) { note('Canlı mod için ücretsiz Gemini anahtarı gerekli (Bağlantı sekmesi).'); return; }
    if (!navigator.onLine) { note('Canlı mod için internet gerekli.'); return; }
    try { voiceSession.stop(''); } catch {} try { recorder?.active && recorder.stop?.(); } catch {}
    S = { sources: new Set(), playAt: 0, userText: '', aiText: '', started: Date.now() };
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch {} // iPhone: sessiz anahtara rağmen çal
    const AC = window.AudioContext || window.webkitAudioContext;
    S.out = new AC({ sampleRate: 24000 }); try { await S.out.resume(); } catch {}
    document.body.classList.add('live-on'); $('liveBtn')?.setAttribute('aria-pressed', 'true');
    setPhase('thinking', 'Canlı bağlantı kuruluyor…');
    try { await startMic(); } catch { stop('Mikrofon izni verilmedi.'); return; }
    connect();
  }
  function stop(msg) {
    if (!S) return;
    const s = S; s.stopping = true; S = null;
    try { s.ws?.close(); } catch {}
    for (const x of s.sources) { try { x.stop(); } catch {} }
    try { s.proc?.disconnect(); s.stream?.getTracks().forEach(t => t.stop()); s.inCtx?.close(); s.out?.close(); } catch {}
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch {}
    document.body.classList.remove('live-on'); $('liveBtn')?.setAttribute('aria-pressed', 'false');
    window.jarvisAvatarLevel?.(0);
    if (s.userText || s.aiText) { S = s; flushUser(); flushAi(); S = null; }
    setPhase('idle', 'Hazır.');
    if (msg) note(msg);
  }

  /* ---------- arayüz ---------- */
  const btn = el('button', { type: 'button', class: 'livebtn', id: 'liveBtn', 'aria-pressed': 'false', title: 'Canlı sohbet (Gemini Live): akıcı, doğal ses; sözünü kesebilirsin', onclick: () => { window.jarvisUnlock?.(); S ? stop('Canlı mod kapandı.') : start(); } }, el('span', { class: 'dot' }), 'CANLI');
  $('mic')?.after(btn);
  const vs = el('select', { id: 'liveVoice' }); for (const [v, t] of VOICES) vs.append(new Option(t, v));
  vs.value = store.get('set.liveVoice', 'Puck') || 'Puck'; vs.onchange = () => store.set('set.liveVoice', vs.value);
  const f = el('div', { class: 'field' }, el('label', { for: 'liveVoice' }, 'Canlı mod sesi (Gemini Live · doğal, akıcı)'), vs);
  ($('voice')?.closest('.field') || $('p-settings')).after(f);

  const _lc = localCommand;
  localCommand = text => {
    const t = text.toLocaleLowerCase('tr-TR').replace(/^\s*(?:hey\s+)?jarvis[,\s]+/, '').replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:canlı mod(?:u|a)?(?: aç| geç| başlat)?|canlı sohbet(?:e geç| başlat)?|canlı konuşalım)$/.test(t)) { setTimeout(start, 50); return 'Canlı moda geçiyorum…'; }
    if (/^canlı mod(?:u|dan)? (?:kapat|çık|bitir)$/.test(t)) { setTimeout(() => stop('Canlı mod kapandı.'), 50); return 'Tamam.'; }
    return _lc(text);
  };
  addEventListener('pagehide', () => stop());
  window.jarvisLive = { start, stop, active: () => !!S, state: () => S && { model: S.model, ready: S.ready } };
})();
