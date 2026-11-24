'use strict';
/* SATÜRN 9.3 — CANLI MOD (Gemini Live, yerel ses modeli)
 * Metni sese çevirmek yerine Gemini doğrudan konuşur: akıcı, canlı, insan gibi tonlama; sözünü kesebilirsin,
 * neredeyse beklemeden cevap verir. Ücretsiz Gemini anahtarıyla çalışır. SATÜRN araçlarını (hatırlatma, takvim,
 * bilgisayar, hasta…) konuşurken kullanabilir. iPhone'da da çalışır (mikrofon + Web Audio, sessiz anahtara rağmen). */
(() => {
  const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
  // Google 17 Kasım 2026'da 3.1-live-preview ve 2.5-native-audio modellerini kapattı → yeni model gemini-3.8-live (kararlı) ilk sırada.
  const MODELS = ['gemini-3.8-live'];
  const DEAD = /^(gemini-2\.0-flash-live-001|gemini-live-2\.5-flash-preview|gemini-2\.5-flash-native-audio-preview-(09|12)-2025|gemini-3\.1-flash-live-preview)$/;
  // hatırlanan model kapatılmış ya da listede yoksa unut (ölü modeli her seferinde ilk denemek bağlantıyı geciktiriyordu)
  try { const lm = JSON.parse(localStorage.getItem('jarvisapp.liveModel') || '""'); if (lm && (DEAD.test(lm) || !MODELS.includes(lm))) localStorage.removeItem('jarvisapp.liveModel'); } catch { localStorage.removeItem('jarvisapp.liveModel'); }
  const liveOrder = () => { const lm = store.get('liveModel', ''); return lm === MODELS[0] || !MODELS.includes(lm) ? MODELS : [...new Set([MODELS[0], lm, ...MODELS])]; };
  const SHAPES = 3; // 0: tam (araç+döküm), 1: sade, 2: üst düzey alanlar
  const VOICES = [['Puck', 'Puck · erkek, neşeli ve canlı (önerilen)'], ['Fenrir', 'Fenrir · erkek, heyecanlı, enerjik'], ['Charon', 'Charon · erkek, net ve bilgilendirici'], ['Orus', 'Orus · erkek, kararlı'], ['Iapetus', 'Iapetus · erkek, berrak'], ['Algenib', 'Algenib · erkek, tok'], ['Sadachbia', 'Sadachbia · erkek, canlı'], ['Kore', 'Kore · kadın, kararlı'], ['Aoede', 'Aoede · kadın, ferah'], ['Leda', 'Leda · kadın, genç'], ['Zephyr', 'Zephyr · kadın, parlak'], ['Laomedeia', 'Laomedeia · kadın, neşeli']];
  const getKey = () => { try { return JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch { return ''; } };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let S = null; // aktif oturum

  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function liveInstructions() {
    let base = '';
    const prevQ = window.jarvisCurText; window.jarvisCurText = ''; // CANLI'da her konu konuşulabilir: tüm araçlar ayrıntılı
    try { base = instructions(true); } catch {}
    window.jarvisCurText = prevQ;
    if (window.jarvisKlinik2?.interp?.()) return base; // canlı tercüman: yalnız çeviri talimatı
    return (base.slice(0, 38000) + `\n\nSİSTEM TARAMASI KURALI: “sistemi tara / tam sistem taraması / kendini kontrol et” denirse bilgisayar GEREKMEZ — jarvis_arac ile sistem_tarama aracını çalıştır ve sonucu kısaca söyle (kaç kaynak çalışıyor, ne bozuk, ne onarıldı).\n\nTAHMİN KURALI: Beyhan geleceğe dair bir şey sorarsa (fiyat, kur, maç, ekonomi, “ne olacak / yükselir mi”) ASLA “tahmin yapamam” deme; jarvis_arac ile senaryo_tahmin aracını çalıştır ve senaryoları olasılıklarıyla kısaca söyle.` + `\n\nCANLI SESLİ SOHBET: Şu an Beyhan'la gerçek zamanlı sesli konuşuyorsun. Doğal, akıcı, canlı ve sıcak bir Türkçe ile konuş; kısa cümleler kur, gereksiz uzatma, liste okuma. Sözün kesilirse hemen dur ve dinle. Bir iş yapman gerekiyorsa jarvis_arac fonksiyonunu kullan (komut = araç biçimi, ör. "hatirlat|yarın 10:00|ilaç", "takvim_oku|bugün", "hava|Cizre"); sonucu kısaca söyle. Silme, kapatma gibi işler için Beyhan'a ekranda onay sorulur.`).trim();
  }
  const setupMsg = (model, shape) => {
    const voice = opt('liveVoice') || 'Puck';
    const speech = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
    const tools = [{ functionDeclarations: [{ name: 'jarvis_arac', description: 'SATÜRN aracını çalıştırır ve sonucu döndürür (hatırlatma, takvim, hava, hesap, hasta kayıtları, kasa, bilgisayar kontrolü vb.).', parameters: { type: 'OBJECT', properties: { komut: { type: 'STRING', description: 'Araç adı ve argümanlar | ile ayrılmış, ör. "hava|Cizre"' } }, required: ['komut'] }, ...(/^gemini-3\.8/.test(model) ? { behavior: 'BLOCKING' } : {}) }] }]; /* 3.8: araç sonucu gelmeden konuşmasın */
    const sys = { parts: [{ text: liveInstructions() }] };
    if (shape === 0) return { setup: { model: 'models/' + model, generationConfig: { responseModalities: ['AUDIO'], speechConfig: speech }, systemInstruction: sys, tools, inputAudioTranscription: {}, outputAudioTranscription: {} } };
    if (shape === 1) return { setup: { model: 'models/' + model, generationConfig: { responseModalities: ['AUDIO'], speechConfig: speech }, systemInstruction: sys } };
    return { setup: { model: 'models/' + model, responseModalities: ['AUDIO'], speechConfig: speech, systemInstruction: sys, inputAudioTranscription: {}, outputAudioTranscription: {} } };
  };
  const explain = a => {
    const r = String(a?.reason || '');
    if (/insecure|SecurityError/i.test(r)) return 'tarayıcı güvenlik kuralı bağlantıyı engelledi (uygulamayı güncelle)';
    if (/api key not valid|API_KEY_INVALID|permission|PERMISSION_DENIED|unregistered callers/i.test(r) || a?.code === 1008) return 'anahtar bu özelliğe izin vermiyor';
    if (/quota|exhaust|RESOURCE_EXHAUSTED|429|rate/i.test(r)) return 'ücretsiz canlı ses kotası doldu';
    if (/not found|not supported|NOT_FOUND|is not found/i.test(r)) return 'model bu anahtarda yok';
    if (/invalid|unknown name|Cannot find field|INVALID_ARGUMENT/i.test(r) || a?.code === 1007) return 'istek biçimi kabul edilmedi';
    if (a?.code === 'timeout') return 'sunucu cevap vermedi';
    if (a?.code === 1006) return 'bağlantı kurulamadı (ağ/engel)';
    return r ? short(r, 80) : 'kod ' + a?.code;
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
    const stream = await AudioHub.mic();
    if (!S) return;
    S.cap = AudioHub.capture(stream, (f, rate) => {
      if (!S?.ready || S.muted) return;
      S.lastFrame = Date.now();
      const out = AudioHub.to16k(f, rate); let peak = 0; for (let i = 0; i < f.length; i += 32) peak = Math.max(peak, Math.abs(f[i]));
      if (!S.sources.size) window.jarvisAvatarLevel?.(Math.min(1, peak * 3));
      try { S.ws?.send(JSON.stringify({ realtimeInput: { audio: { data: b64(out.buffer), mimeType: 'audio/pcm;rate=16000' } } })); } catch {}
    });
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
    const order = liveOrder();
    if (mi >= order.length) {
      const a = S.attempts, why = [...new Set(a.map(explain))];
      return stop('CANLI mod açılamadı: ' + why.join('; ') + '. ' + (why.some(w => /kota/.test(w)) ? 'Google’ın ücretsiz kotası yenilenince (TSİ 11:00) tekrar dene.' : why.some(w => /anahtar/.test(w)) ? 'Gemini anahtarının Live API iznini aistudio.google.com’da kontrol et.' : 'Ayarlar → “Ses ve CANLI testi” ile ayrıntı alabilirsin.'));
    }
    if (shape >= SHAPES) return connect(mi + 1, 0);
    S.model = order[mi]; S.ready = false;
    setPhase('thinking', `Canlı bağlantı kuruluyor… (${mi * SHAPES + shape + 1}/${order.length * SHAPES})`);
    let ws;
    try { ws = new WebSocket(WS + encodeURIComponent(getKey())); } catch (e) { S.attempts.push({ model: S.model, shape, code: 'ws', reason: e.message }); return connect(mi + 1, 0); }
    S.ws = ws;
    const next = rec => { if (!S || S.ws !== ws || S.ready) return; S.ws = null; clearTimeout(S.dog); S.attempts.push({ model: S.model, shape, ...rec }); try { ws.close(); } catch {}
      const why = explain(rec);
      if (/kota|anahtar/.test(why)) return connect(order.length, 0);           // tüm modellerde aynı olur: boşa deneme
      if (/model bu anahtarda yok|bağlantı kurulamadı/.test(why)) return connect(mi + 1, 0); // bu model yok → sonraki model
      return connect(mi, shape + 1); };
    S.dog = setTimeout(() => next({ code: 'timeout', reason: 'setupComplete gelmedi' }), 9000);
    ws.onopen = () => { try { ws.send(JSON.stringify(setupMsg(S.model, shape))); } catch {} };
    ws.onmessage = ev => { if (S && S.ws === ws) { if (!S.ready) clearTimeout(S.dog); onMessage(ev); } };
    ws.onclose = e => {
      if (!S || S.ws !== ws) return;
      if (!S.ready) return next({ code: e.code, reason: e.reason });
      if (S.stopping) return;
      if (Date.now() - S.started < 60 * 60000 && (S.reconnects = (S.reconnects || 0) + 1) < 8) { S.ready = false; return connect(mi, shape); } // ~10 dk sınırı: sessizce yeniden bağlan
      stop('Canlı bağlantı kapandı (' + explain({ code: e.code, reason: e.reason }) + ').');
    };
    ws.onerror = () => {};
  }

  /* ---------- tanılama: doğal ses + CANLI ---------- */
  async function diag() {
    const lines = [];
    // doğal ses
    try {
      for (const [m, h] of Object.entries(window.jarvisBrain?.B?.models || {})) if (/tts/.test(m)) { h.cool = 0; h.strikes = 0; }
      const r = await authFetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Merhaba Beyhan, doğal sesim çalışıyor.' }) });
      if (r.ok && /audio/.test(r.headers.get('content-type') || '')) {
        const u = URL.createObjectURL(await r.blob()); const a = player.sharedAudio || new Audio(); a.src = u; a.play().catch(() => {});
        lines.push('✓ Doğal ses (Gemini TTS): çalışıyor · ' + (r.headers.get('X-Jarvis-Speech') || ''));
      } else { let d = {}; try { d = await r.json(); } catch {} lines.push(`✗ Doğal ses (Gemini TTS): ${r.status} · ${d.error || ''}${r.status === 429 ? ' → Google’ın ücretsiz TTS kotası doldu (TSİ 11:00’de yenilenir).' : ''}`); }
    } catch (e) { lines.push('✗ Doğal ses: ' + e.message); }
    // canlı
    if (S) lines.push('• CANLI şu an açık: ' + (S.ready ? 'bağlı (' + S.model + ')' : 'bağlanıyor'));
    else {
      const order = liveOrder();
      let okModel = null; const tried = [];
      for (const model of order) {
        for (let shape = 0; shape < SHAPES && !okModel; shape++) {
          const res = await new Promise(res => {
            let ws; try { ws = new WebSocket(WS + encodeURIComponent(getKey())); } catch (e) { return res({ code: 'ws', reason: e.message }); }
            const dog = setTimeout(() => { try { ws.close(); } catch {} res({ code: 'timeout' }); }, 9000);
            ws.onopen = () => ws.send(JSON.stringify(setupMsg(model, shape)));
            ws.onmessage = async ev => { let m = {}; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch {} if (m.setupComplete) { clearTimeout(dog); ws.close(); res({ ok: true }); } };
            ws.onclose = e => { clearTimeout(dog); res({ code: e.code, reason: e.reason }); };
          });
          if (res.ok) { okModel = model; store.set('liveModel', model); tried.push(`✓ ${model} (biçim ${shape + 1})`); break; }
          tried.push(`✗ ${model} (biçim ${shape + 1}): ${explain(res)}${res.reason ? ' — ' + short(res.reason, 90) : ''}`);
          if (/kota|anahtar|model bu anahtarda yok|bağlantı kurulamadı|güvenlik kuralı/.test(explain(res))) break;
        }
        if (okModel || /kota|anahtar|güvenlik kuralı/.test(tried.at(-1) || '')) break;
      }
      lines.push(okModel ? '✓ CANLI mod: çalışıyor · ' + okModel : '✗ CANLI mod: açılamadı', ...tried.map(x => '   ' + x));
    }
    lines.push(`• Mikrofon yöntemi: ${setting('micMode') === 'record' ? 'kayıt → Gemini yazıya çevirir' : 'tarayıcı tanıma'} · Cihaz: ${isIOS ? 'iPhone/iPad' : 'diğer'} · Sürüm: ${(document.querySelector('script[src*="live.js"]')?.src.match(/v=([\w.]+)/) || [])[1]}`);
    const t = 'SES VE CANLI TESTİ\n' + lines.join('\n');
    const n = bubble('ai', t); answerTools(n.el, t);
    logOp('ses testi', [], lines.some(l => l.startsWith('✗')) ? 'başarısız' : 'başarılı', short(lines.join(' | '), 300));
    return t;
  }

  async function start() {
    if (S) return;
    if (!getKey()) { note('Canlı mod için ücretsiz Gemini anahtarı gerekli (Bağlantı sekmesi).'); return; }
    if (!navigator.onLine) { note('Canlı mod için internet gerekli.'); return; }
    try { voiceSession.stop(''); } catch {} try { recorder?.active && recorder.stop?.(); } catch {}
    S = { sources: new Set(), playAt: 0, userText: '', aiText: '', started: Date.now(), attempts: [] };
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch {} // iPhone: sessiz anahtara rağmen çal
    AudioHub.prime(); S.out = AudioHub.ctx; // dokunuş anında uyandırılmış tek ses bağlamı (iPhone kuralı)
    document.body.classList.add('live-on'); $('liveBtn')?.setAttribute('aria-pressed', 'true');
    setPhase('thinking', 'Canlı bağlantı kuruluyor…');
    connect(); // bağlantı mikrofon izniyle paralel kurulur (daha hızlı)
    try { await withTimeout(startMic(), 15000, 'mikrofon'); } catch (e) { stop(/mikrofon/.test(e.message) ? 'Mikrofon açılamadı (izin penceresi cevaplanmadı).' : 'Mikrofon izni verilmedi. iPhone: Ayarlar → Safari → Mikrofon → İzin Ver.'); return; }
    // bağlandıktan sonra 4 sn içinde mikrofondan ses gelmezse sessizce beklemek yerine söyle
    setTimeout(() => { if (S?.ready && !S.lastFrame) { AudioHub.ctx?.resume?.().catch(() => {}); note('Mikrofondan ses gelmiyor; CANLI düğmesine bir kez dokun.'); } }, 6000);
  }
  function stop(msg) {
    if (!S) return;
    const s = S; s.stopping = true; S = null;
    try { s.ws?.close(); } catch {}
    for (const x of s.sources) { try { x.stop(); } catch {} }
    try { s.cap?.stop(); AudioHub.releaseMic(); } catch {} // ortak ses bağlamı kapatılmaz
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch {}
    document.body.classList.remove('live-on'); $('liveBtn')?.setAttribute('aria-pressed', 'false');
    window.jarvisAvatarLevel?.(0);
    if (s.userText || s.aiText) { S = s; flushUser(); flushAi(); S = null; }
    setPhase('idle', 'Hazır.');
    if (msg) note(msg);
  }

  /* ---------- arayüz ---------- */
  const btn = el('button', { type: 'button', class: 'livebtn', id: 'liveBtn', 'aria-pressed': 'false', title: 'Canlı sohbet (Gemini Live): akıcı, doğal ses; sözünü kesebilirsin', onclick: () => { window.jarvisUnlock?.(); AudioHub.prime(); if (S && !S.ready) return stop('Canlı mod iptal edildi.'); if (S && S.ready && !S.lastFrame && !S.woke) { S.woke = 1; AudioHub.ctx?.resume?.().catch(() => {}); note('Mikrofon sesi uyandırıldı — konuşabilirsin. Kapatmak için bir kez daha dokun.'); return; } S ? stop('Canlı mod kapandı.') : start(); } }, el('span', { class: 'dot' }), 'CANLI');
  $('mic')?.after(btn);
  const vs = el('select', { id: 'liveVoice' }); for (const [v, t] of VOICES) vs.append(new Option(t, v));
  vs.value = store.get('set.liveVoice', 'Puck') || 'Puck'; vs.onchange = () => store.set('set.liveVoice', vs.value);
  const f = el('div', { class: 'field' }, el('label', { for: 'liveVoice' }, 'Canlı mod sesi (Gemini Live · doğal, akıcı)'), vs);
  ($('voice')?.closest('.field') || $('p-settings')).after(f);
  const lt = el('select', { id: 'liveTts' }); lt.append(new Option('Açık — doğal ses kotası dolunca canlı hatla seslendir (önerilen)', '1'), new Option('Kapalı', '0'));
  lt.value = store.get('set.liveTts', '1'); lt.onchange = () => store.set('set.liveTts', lt.value);
  f.after(el('div', { class: 'field' }, el('label', { for: 'liveTts' }, 'Kota dolunca kaliteli ses'), lt));

  const _lc = localCommand;
  localCommand = text => {
    const t = text.toLocaleLowerCase('tr-TR').replace(/^\s*(?:hey\s+)?jarvis[,\s]+/, '').replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:canlı mod(?:u|a)?(?: aç| geç| başlat)?|canlı sohbet(?:e geç| başlat)?|canlı konuşalım)$/.test(t)) { setTimeout(start, 50); return 'Canlı moda geçiyorum…'; }
    if (/^canlı mod(?:u|dan)? (?:kapat|çık|bitir)$/.test(t)) { setTimeout(() => stop('Canlı mod kapandı.'), 50); return 'Tamam.'; }
    return _lc(text);
  };
  addEventListener('pagehide', () => stop());
  $('voiceDiag') && ($('voiceDiag').onclick = () => { window.jarvisUnlock?.(); $('drawer').classList.remove('open'); note('Ses ve CANLI testi yapılıyor (10-30 sn)…'); diag().catch(e => note(e.message)); });
  /* ---------- CANLI HAT ÜZERİNDEN SESLENDİRME (Gemini TTS kotası dolunca) ----------
   * Doğal ses (TTS) kotası ayrı, canlı ses modelinin kotası ayrıdır. TTS 429 verince metin, canlı ses modeline
   * "kelimesi kelimesine oku" talimatıyla gönderilir; gelen 24 kHz ses WAV'a çevrilip normal oynatıcıda çalınır.
   * Bağlantı açık tutulur (60 sn boşta kalırsa kapanır), istekler sıraya girer, 8 turda bir oturum tazelenir (sapma olmasın). */
  const TTS_SYS = 'Sen bir seslendirme motorusun. Sana gönderilen her Türkçe metni KELİMESİ KELİMESİNE, eksiksiz ve aynen oku. Hiçbir şey ekleme, çıkarma, yorumlama; soru sorma, cevap verme, selam verme. Doğal, akıcı, canlı, sıcak ve kendinden emin bir tonla, uygun vurgu ve duraklamalarla konuş.';
  let T = null, tq = Promise.resolve(), tFail = 0;
  const tClose = () => { try { T?.ws.close(); } catch {} T = null; };
  function tOpen() {
    return new Promise((res, rej) => {
      const model = MODELS.includes(store.get('liveModel', '')) ? store.get('liveModel', '') : MODELS[0];
      let ws; try { ws = new WebSocket(WS + encodeURIComponent(getKey())); } catch (e) { return rej(e); }
      const o = { ws, model, turns: 0, cur: null, idle: 0 };
      const dog = setTimeout(() => { try { ws.close(); } catch {} rej(Error('canlı ses hattı cevap vermedi')); }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/' + model, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opt('liveVoice') || 'Puck' } } } }, systemInstruction: { parts: [{ text: TTS_SYS }] } } }));
      ws.onmessage = async ev => {
        let m = {}; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch {}
        if (m.setupComplete) { clearTimeout(dog); res(o); return; }
        const c = o.cur; if (!c) return;
        for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) { c.chunks.push(unb64(p.inlineData.data)); c.rate = Number((p.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1]) || 24000; c.last = Date.now(); }
        if (m.serverContent?.turnComplete || m.serverContent?.generationComplete) c.done();
      };
      ws.onclose = e => { clearTimeout(dog); if (T === o) T = null; o.cur?.fail(Error('canlı ses hattı kapandı (' + e.code + ')')); rej(Error('kapandı ' + e.code + ' ' + (e.reason || ''))); };
    });
  }
  function liveTts(text, signal) {
    const run = async () => {
      if (!getKey()) throw Error('anahtar yok');
      if (S) throw Error('CANLI sohbet açık'); // sohbet sırasında ikinci hat açma
      if (!T || T.turns >= 8) { tClose(); T = await tOpen(); }
      clearTimeout(T.idle);
      const o = T;
      const out = await new Promise((res, rej) => {
        const c = { chunks: [], rate: 24000, last: Date.now() };
        const dog = setInterval(() => { if (Date.now() - c.last > 8000) { clearInterval(dog); c.chunks.length ? c.done() : c.fail(Error('ses gelmedi')); } }, 500);
        c.done = () => { clearInterval(dog); o.cur = null; res(c); };
        c.fail = e => { clearInterval(dog); o.cur = null; rej(e); };
        signal?.addEventListener?.('abort', () => c.fail(Object.assign(Error('durduruldu'), { name: 'AbortError' })));
        o.cur = c;
        o.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Aynen oku: ' + String(text).slice(0, 1500) }] }], turnComplete: true } }));
      });
      o.turns++;
      o.idle = setTimeout(() => { if (T === o) tClose(); }, 60000);
      const n = out.chunks.reduce((a, b) => a + b.length, 0); if (n < 2000) throw Error('ses çok kısa');
      const bytes = new Uint8Array(n); let k = 0; for (const b of out.chunks) { bytes.set(b, k); k += b.length; }
      tFail = 0;
      return { bytes, rate: out.rate, model: o.model };
    };
    const p = tq.then(run, run); tq = p.catch(() => { tFail++; });
    return p;
  }
  window.jarvisLiveTts = (text, signal) => (opt('liveTts') === '0' || tFail >= 3 ? Promise.reject(Error('kapalı')) : liveTts(text, signal));
  window.jarvisLive = { diag, start, stop, active: () => !!S, state: () => S && { model: S.model, ready: S.ready } };
})();
