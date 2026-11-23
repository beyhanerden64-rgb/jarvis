"use strict";
/* ---- JARVIS 0.39.0 · voice-core.js ---- */

class JarvisVoice {
  constructor({
    Recognition,
    synth,
    Utterance,
    onText,
    onState,
    onTranscript = () => {},
    onLatency = () => {},
    loop = () => true,
    voice = () => null,
    rate = () => 1,
    onMicrophoneError = () => {},
    timers = {
      set: (callback, ms) => globalThis.setTimeout(callback, ms),
      clear: id => globalThis.clearTimeout(id)
    }
  }) {
    Object.assign(this, {
      Recognition,
      synth,
      Utterance,
      onText,
      onState,
      onTranscript,
      onLatency,
      onMicrophoneError,
      loop,
      voice,
      rate,
      timers
    });
    this.active = false;
    this.generation = 0;
    this.recognition = null;
    this.timer = null;
  }
  state(phase, message) {
    this.phase = phase;
    this.onState(phase, message);
  }
  clearTimer() {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }
  guard(ms, message) {
    this.clearTimer();
    const generation = this.generation;
    this.timer = this.timers.set(() => {
      if (this.active && generation === this.generation) this.stop(message);
    }, ms);
    this.timer?.unref?.();
  }
  start() {
    if (this.active) return;
    if (!this.Recognition || !this.synth || !this.Utterance) {
      this.state('error', 'Bu tarayıcı sesli konuşmayı desteklemiyor.');
      return;
    }
    this.oneShot = false;
    this.active = true;
    this.quiet = 0;
    this.generation++;
    this.listen();
  }
  stop(message = 'Mikrofon kapalı. Hazır olduğunda tekrar konuşabiliriz.') {
    globalThis.jarvisAvatarSpeech?.(false);
    this.active = false;
    this.generation++;
    this.clearTimer();
    const r = this.recognition;
    this.recognition = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      r.onstart = null;
      try {
        r.abort();
      } catch {}
    }
    try {
      this.synth?.cancel();
    } catch {}
    this.state('idle', message);
  }
  read(text, onComplete = () => {}) {
    this.stop();
    this.responseStartedAt = Date.now();
    this.audibleReported = false;
    this.onReadComplete = onComplete;
    if (!this.synth || !this.Utterance) {
      this.state('error', 'Sesli okuma desteklenmiyor. Yanıt ekranda.');
      return;
    }
    this.oneShot = true;
    this.active = true;
    this.generation++;
    this.speak(text, this.generation);
  }
  readStream(onComplete = () => {}) {
    this.stop();
    this.oneShot = true;
    this.onReadComplete = onComplete;
    this.responseStartedAt = Date.now();
    this.audibleReported = false;
    this.latencyLabel = 'Ses gönderiminden ses başlangıcına';
    this.active = true;
    this.generation++;
    this.state('thinking', 'Yanıt akışı bekleniyor…');
    this.guard(45000, 'Yanıt akışı zamanında gelmedi.');
    return this.stream(this.generation);
  }
  interrupt() {
    if (!this.active || !['speaking', 'thinking'].includes(this.phase)) return;
    this.stop();
    this.start();
  }
  listen() {
    if (!this.active) return;
    this.latencyLabel = 'Metin tanımadan ses başlangıcına';
    const generation = this.generation;
    let r;
    try {
      r = new this.Recognition();
    } catch {
      this.stop('Mikrofon hizmeti başlatılamadı.');
      return;
    }
    this.recognition = r;
    r.lang = 'tr-TR';
    r.continuous = false;
    r.interimResults = true;
    let submitted = false,
      lastInterim = '',
      heard = false;
    r.onstart = () => {
      if (this.active && generation === this.generation) {
        this.state('listening', 'Seni dinliyorum.');
        this.guard(45000, 'Dinleme zaman aşımına uğradı. Yeniden başlatabilirsin.');
      }
    };
    r.onresult = event => {
      if (!this.active || generation !== this.generation || submitted) return;
      let final = '',
        interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      if (interim.trim() || final.trim()) heard = true;
      if (!final.trim()) {
        lastInterim = interim.trim();
        this.onTranscript(interim, false);
        return;
      }
      submit(final.trim());
    };
    // Shared by a final result and by an end-of-speech that only produced interim text (iOS Safari often
    // ends the session without ever marking the last result final; dropping it would lose the sentence).
    const submit = text => {
      submitted = true;
      this.quiet = 0;
      this.responseStartedAt = Date.now();
      this.audibleReported = false;
      this.onTranscript(text, true);
      r.onend = null;
      r.onerror = null;
      r.onstart = null;
      try {
        r.abort();
      } catch {}
      this.recognition = null;
      if (/^(jarvis[ ,]*)?(dur|sus|sesli modu kapat|konuşmayı bitir)[.!?]*$/i.test(text)) {
        this.stop();
        return;
      }
      const stream = this.stream(generation);
      this.state('thinking', 'Yanıtını hazırlıyorum…');
      this.guard(130000, 'Yanıt zamanında gelmedi. Model bağlantısını kontrol et.');
      Promise.resolve()
        .then(() =>
          this.active && generation === this.generation
            ? this.onText(text, delta => stream.push(delta))
            : null
        )
        .then(reply => {
          if (!this.active || generation !== this.generation) return;
          if (!reply) {
            this.stop('Yanıt alınamadı. Tekrar başlatabilirsin.');
            return;
          }
          if (stream.received) stream.finish();
          else this.speak(reply, generation);
        })
        .catch(() => {
          if (this.active && generation === this.generation)
            this.stop('Yanıt alınamadı. Bağlantıyı kontrol edip tekrar başlat.');
        });
    };
    r.onerror = e => {
      if (!this.active || generation !== this.generation) return;
      if (e.error === 'no-speech' && this.relisten(r, generation)) return;
      const messages = {
        'not-allowed': 'Mikrofon izni verilmedi. Tarayıcının site izinlerinden mikrofonu aç.',
        'service-not-allowed': 'Tarayıcı konuşma hizmetine izin vermiyor.',
        'audio-capture': 'Mikrofon bulunamadı veya başka bir uygulama kullanıyor.',
        network: 'Konuşma hizmetine ulaşılamadı. İnternet bağlantını kontrol et.',
        'no-speech': 'Ses algılanmadı. Hazır olduğunda yeniden başlat.',
        'language-not-supported': 'Türkçe konuşma tanıma bu ortamda desteklenmiyor.'
      };
      this.stop(messages[e.error] || 'Ses tanıma durdu. Yeniden başlatabilirsin.');
      if (e.error === 'not-allowed') this.onMicrophoneError('access-denied');
    };
    r.onspeechend = () => {
      if (this.active && generation === this.generation && !submitted) {
        try {
          r.stop();
        } catch {}
      }
    };
    r.onend = () => {
      if (!this.active || generation !== this.generation || submitted) return;
      if (lastInterim.split(/\s+/).filter(Boolean).length >= 2) {
        submit(lastInterim);
        return;
      }
      if (!heard && this.relisten(r, generation)) return;
      this.stop('Dinleme sona erdi. Yeniden başlatabilirsin.');
    };
    this.state('starting', 'Mikrofon açılıyor…');
    this.clearTimer();
    this.timer = this.timers.set(() => {
      if (this.active && generation === this.generation) {
        this.timer = null;
        this.state(
          'starting',
          'Tarayıcının mikrofon yanıtı bekleniyor. İzin görünmüyorsa Mikrofon yardımı düğmesini kullan; durdur düğmesiyle iptal edebilirsin.'
        );
      }
    }, 15000);
    this.timer?.unref?.();
    try {
      r.start();
    } catch {
      this.stop('Mikrofon başlatılamadı. Yeniden dene.');
    }
  }
  // In a continuing conversation a short silence must not end the session: reopen the recognizer a few
  // times (bounded) before giving up. Single-shot sessions keep the old behaviour.
  relisten(r, generation) {
    if (this.oneShot || !this.loop() || this.phase !== 'listening') return false;
    if ((this.quiet = (this.quiet || 0) + 1) > 3) {
      this.quiet = 0;
      return false;
    }
    r.onend = r.onresult = r.onerror = r.onstart = r.onspeechend = null;
    try {
      r.abort();
    } catch {}
    if (this.recognition === r) this.recognition = null;
    this.timers.set(() => {
      if (this.active && generation === this.generation && !this.recognition) this.listen();
    }, 250);
    return true;
  }
  stream(generation) {
    const owner = this,
      queue = [];
    let buffer = '',
      speaking = false,
      ended = false,
      received = false,
      emitted = 0;
    const live = () => owner.active && generation === owner.generation;
    function pump() {
      if (!live() || speaking) return;
      if (!queue.length) {
        if (ended) {
          owner.clearTimer();
          if (owner.loop() && !owner.oneShot) owner.listen();
          else {
            const done = owner.oneShot ? owner.onReadComplete : null;
            owner.onReadComplete = null;
            owner.stop('Yanıt tamamlandı.');
            done?.();
          }
        } else {
          owner.state('thinking', 'Yanıtın devamı hazırlanıyor…');
          owner.guard(130000, 'Yanıt akışı durdu. Tekrar deneyebilirsin.');
        }
        return;
      }
      speaking = true;
      owner.state('speaking', 'Konuşuyorum. Araya girmek için “Sözümü dinle”ye dokun.');
      const u = new owner.Utterance(queue.shift());
      u.onstart = () => {
        if (live()) {
          owner.markAudible();
          globalThis.dispatchEvent?.(new CustomEvent('jarvis-speech', { detail: u.text }));
        }
      };
      u.onboundary = () => globalThis.jarvisAvatarBoundary?.();
      u.lang = 'tr-TR';
      u.voice = owner.voice();
      u.rate = owner.rate();
      let settled = false;
      u.onend = () => {
        globalThis.jarvisAvatarSpeech?.(false);
        if (settled || !live()) return;
        settled = true;
        speaking = false;
        owner.clearTimer();
        pump();
      };
      u.onerror = () => {
        if (!settled && live()) {
          settled = true;
          owner.stop('Sesli okuma durdu. Yanıt konuşma kaydında.');
        }
      };
      owner.guard(owner.synth?.natural ? 75000 : 45000, 'Sesli okuma takıldı.');
      try {
        owner.synth.speak(u);
        owner.synth.prepare?.(queue[0]);
      } catch {
        owner.stop('Sesli okuma başlatılamadı.');
      }
    }
    return {
      get received() {
        return received;
      },
      push(delta) {
        if (!live() || ended || typeof delta !== 'string' || !delta) return;
        received = true;
        buffer += delta;
        let match;
        while ((match = JarvisVoice.take(buffer, !!owner.synth?.natural && emitted > 0))) {
          queue.push(...JarvisVoice.chunks(match, JarvisVoice.limit(owner.synth)));
          emitted++;
          buffer = buffer.slice(match.length);
        }
        if (speaking) owner.synth.prepare?.(queue[0]);
        pump();
      },
      finish() {
        if (!live()) return;
        ended = true;
        queue.push(...JarvisVoice.chunks(buffer, JarvisVoice.limit(owner.synth)));
        buffer = '';
        if (speaking) owner.synth.prepare?.(queue[0]);
        pump();
      }
    };
  }
  markAudible() {
    globalThis.jarvisAvatarSpeech?.(true);
    if (!this.audibleReported && this.responseStartedAt) {
      this.audibleReported = true;
      this.onLatency(Date.now() - this.responseStartedAt);
    }
  }
  // Natural (cloud) voices: shorter pieces start faster and stay well inside the synthesis timeout.
  // Device voices: Chrome silently stops remote voices after ~15 s, so keep them short.
  static limit(synth) {
    return synth?.natural ? 320 : 170;
  }
  // Returns the next speakable prefix of a streaming buffer, or null if more text is needed.
  // A sentence ends at . ! ? … or a newline that is FOLLOWED by whitespace; the end of the buffer is
  // never treated as a boundary because "1." or "Dr." may still be continued by the next delta.
  static take(buffer, batch = false) {
    const min = batch ? 130 : 1;
    const re = /[.!?…]+(?=\s)|\n/g;
    let m;
    while ((m = re.exec(buffer))) {
      const end = m.index + m[0].length;
      if (m[0] !== '\n' && JarvisVoice.abbreviation(buffer.slice(0, m.index))) continue;
      if (end < min) continue;
      const after = buffer.slice(end).match(/^\s*/)[0].length;
      const piece = buffer.slice(0, end + after);
      if (piece.trim()) return piece;
    }
    const soft = batch ? 420 : 180,
      hard = batch ? 260 : 100;
    if (buffer.length < soft) return null;
    const window = buffer.slice(0, soft);
    const clause = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    if (clause >= hard) return buffer.slice(0, clause + 2);
    const space = window.lastIndexOf(' ');
    return space >= hard ? buffer.slice(0, space + 1) : null;
  }
  static abbreviation(before) {
    const word = (before.match(/(\S+)$/) || [''])[0].toLocaleLowerCase('tr-TR');
    if (/^\d{1,2}$/.test(word)) return true; // "1. adım", "3. seans"
    if (/^\d+$/.test(word)) return false;
    if (/^[a-zçğıöşü]$/.test(word)) return true; // tek harf kısaltma: "A. Yılmaz"
    return /^(?:dr|doç|prof|uzm|fzt|op|av|vb|vs|örn|bkz|no|sn|st|mah|cad|sok|apt|tel|yy|bknz|hz|ltd|şti|a\.ş|t\.c|e\.g|i\.e|mr|mrs)$/.test(
      word.replace(/^[(\["'«]+/, '')
    );
  }
  // Text → what a voice should actually say: no markdown, links, emoji or symbols read as words.
  static speechText(text) {
    return String(text)
      .replace(/```[\s\S]*?(?:```|$)/g, ' Kod örneği ekranda. ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]*\)/g, '$1')
      .replace(/(?:https?:\/\/|www\.)\S+/g, ' bağlantı ekranda ')
      .replace(/^\s{0,3}(?:#{1,6}|[-*•+]|>)\s+/gm, '')
      .replace(/^\s*\|.*\|\s*$/gm, ' ')
      .replace(/[*_~#]+/g, '')
      .replace(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu, ' ')
      .replace(/[\u{1F1E6}-\u{1F1FF}️‍]/gu, '')
      .replace(/(\d)\s*[x×]\s*(\d)/g, '$1 kere $2')
      .replace(/%\s*(\d+(?:[.,]\d+)?)/g, 'yüzde $1')
      .replace(/(\d+(?:[.,]\d+)?)\s*%/g, 'yüzde $1')
      .replace(/(\d)\s*(?:₺|TL\b)/g, '$1 lira')
      .replace(/₺\s*(\d)/g, '$1 lira ')
      .replace(/(\d)\s*°\s*C\b/g, '$1 derece')
      .replace(/(\d)\s*°/g, '$1 derece')
      .replace(/(?<![\d.\-/])(\d{1,3})\s*-\s*(\d{1,3})(?![\d.\-/])/g, '$1 ile $2')
      .replace(/\s*&\s*/g, ' ve ')
      .replace(/\s+\/\s+/g, ' ya da ')
      .replace(/\b(?:örn|Örn)\.\s*/g, 'örneğin ')
      .replace(/\bvb\./g, 've benzeri')
      .replace(/\bvs\./g, 'vesaire')
      .replace(/\bbkz\./gi, 'bakınız')
      .replace(/\bDoç\.\s*Dr\.\s*/g, 'Doçent Doktor ')
      .replace(/\bProf\.\s*Dr\.\s*/g, 'Profesör Doktor ')
      .replace(/\bUzm\.\s*/g, 'Uzman ')
      .replace(/\bDr\.\s*/g, 'Doktor ')
      .replace(/\bFzt\.\s*/g, 'Fizyoterapist ')
      .replace(/\s*[([{]\s*/g, ', ')
      .replace(/\s*[)\]}]\s*([.!?;:]?)/g, (m, p) => p || ', ')
      .replace(/[<>"“”«»]/g, ' ')
      .replace(/,\s*(?=[.!?;:,])/g, '')
      .replace(/^\s*,\s*/gm, '')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n+\s*/g, '. ')
      .replace(/([.!?])\.+/g, '$1')
      .trim();
  }
  static chunks(text, limit = 220) {
    const words = JarvisVoice.speechText(text)
      .replace(/^[.\s]+/, '')
      .split(/\s+/)
      .filter(Boolean);
    const chunks = [];
    let chunk = '';
    for (const word of words) {
      if (chunk.length + word.length > limit && chunk) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk += (chunk ? ' ' : '') + word;
      // Prefer ending a piece at punctuation once it is reasonably long: more natural prosody.
      if (chunk.length >= limit * 0.6 && /[.!?;:]$/.test(word)) {
        chunks.push(chunk);
        chunk = '';
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }
  speak(text, generation) {
    this.clearTimer();
    const chunks = JarvisVoice.chunks(text, JarvisVoice.limit(this.synth));
    let index = 0;
    const next = () => {
      if (!this.active || generation !== this.generation) return;
      if (index >= chunks.length) {
        if (this.loop() && !this.oneShot) this.listen();
        else {
          const done = this.oneShot ? this.onReadComplete : null;
          this.onReadComplete = null;
          this.stop('Yanıt tamamlandı.');
          done?.();
        }
        return;
      }
      this.state('speaking', 'Konuşuyorum. Araya girmek için “Sözümü dinle”ye dokun.');
      const utterance = new this.Utterance(chunks[index++]);
      utterance.onstart = () => {
        if (this.active && generation === this.generation) {
          this.markAudible();
          globalThis.dispatchEvent?.(new CustomEvent('jarvis-speech', { detail: utterance.text }));
        }
      };
      utterance.onboundary = () => globalThis.jarvisAvatarBoundary?.();
      utterance.lang = 'tr-TR';
      utterance.voice = this.voice();
      utterance.rate = this.rate();
      let settled = false;
      utterance.onend = () => {
        globalThis.jarvisAvatarSpeech?.(false);
        if (settled) return;
        settled = true;
        if (this.active && generation === this.generation) {
          this.clearTimer();
          next();
        }
      };
      utterance.onerror = () => {
        if (settled) return;
        settled = true;
        if (this.active && generation === this.generation)
          this.stop('Sesli yanıt okunamadı. Yanıtı konuşma kaydında görebilirsin.');
      };
      this.guard(this.synth?.natural ? 75000 : 45000, 'Sesli okuma takıldı. Yanıt konuşma kaydında duruyor.');
      try {
        this.synth.speak(utterance);
        this.synth.prepare?.(chunks[index]);
      } catch {
        this.stop('Sesli okuma başlatılamadı.');
      }
    };
    next();
  }
}
if (typeof module !== 'undefined') module.exports = JarvisVoice;

/* ---- JARVIS 0.39.0 · voice-recovery.js ---- */

// Local recovery policy; contains no transcript, audio, key or model call.
class JarvisVoiceRecovery {
  constructor({ clock = () => Date.now(), load = () => null, save = () => {}, changed = () => {} } = {}) {
    Object.assign(this, { clock, save, changed });
    let data;
    try {
      data = load();
    } catch {}
    const now = clock();
    this.until =
      Number.isFinite(data?.until) && data.until > now && data.until <= now + 3600000 ? data.until : 0;
    this.failures = Number.isInteger(data?.failures) ? Math.max(0, Math.min(6, data.failures)) : 0;
    this.reason =
      this.until && ['quota', 'network', 'configuration'].includes(data?.reason) ? data.reason : null;
    this.lastEvent = 'ready';
  }
  get ready() {
    return this.clock() >= this.until;
  }
  fail(reason = 'network', seconds) {
    this.failures = Math.min(6, this.failures + 1);
    const base = reason === 'quota' ? 300 : reason === 'configuration' ? 600 : 30;
    const wait = Math.max(
      reason === 'quota' ? 60 : 10,
      Math.min(3600, Number.isFinite(seconds) && seconds > 0 ? seconds : base * 2 ** (this.failures - 1))
    );
    this.until = this.clock() + wait * 1000;
    this.reason = reason;
    this.lastEvent = 'fallback';
    this.publish();
    return wait;
  }
  available() {
    this.until = 0;
    this.failures = 0;
    this.reason = null;
    this.lastEvent = 'probe_ready';
    this.publish();
  }
  success() {
    this.until = 0;
    this.failures = 0;
    this.reason = null;
    this.lastEvent = 'natural_playing';
    this.publish();
  }
  event(value) {
    this.lastEvent = value;
    this.publish();
  }
  snapshot() {
    return {
      naturalReady: this.ready,
      retryAfter: Math.max(0, Math.ceil((this.until - this.clock()) / 1000)),
      reason: this.reason,
      event: this.lastEvent,
      guards: [
        { id: 'quota_guard', state: this.ready ? 'ready' : 'waiting' },
        { id: 'playback_guard', state: this.lastEvent },
        { id: 'privacy_guard', state: 'metadata_only' }
      ]
    };
  }
  publish() {
    try {
      this.save({ until: this.until, failures: this.failures, reason: this.reason });
    } catch {}
    this.changed(this.snapshot());
  }
}
if (typeof module !== 'undefined') module.exports = JarvisVoiceRecovery;

/* ---- JARVIS 0.39.0 · speech-player.js ---- */

class JarvisSpeechPlayer {
  constructor({
    synth,
    fetcher = (...args) => fetch(...args),
    AudioClass = Audio,
    URLApi = URL,
    AudioContextClass = window.AudioContext || window.webkitAudioContext,
    UtteranceClass = globalThis.SpeechSynthesisUtterance,
    mode = () => true,
    voice = () => 'Charon',
    status = () => {},
    timers = globalThis,
    recovery = null,
    fetchTimeout = 8500
  }) {
    Object.assign(this, {
      synth,
      fetcher,
      AudioClass,
      URLApi,
      AudioContextClass,
      UtteranceClass,
      mode,
      voice,
      status,
      timers,
      recovery,
      fetchTimeout
    });
    this.serial = 0;
    this.playSerial = 0;
    this.pending = new Map();
    this.coolUntil = 0;
    this.audio = null;
    this.frame = null;
    this.context = null;
    this.speaking = false;
  }
  get natural() {
    return this.mode() && Date.now() > this.coolUntil && (!this.recovery || this.recovery.ready);
  }
  async recheck() {
    await this.unlock();
    try {
      const response = await this.fetcher('/api/speech', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw Error();
      const state = await response.json();
      if (state.naturalReady) {
        this.coolUntil = 0;
        this.recovery?.available();
        this.status('Doğal ses bağlantısı denemeye hazır; çalma henüz doğrulanmadı.');
      } else {
        this.recovery?.fail(
          state.lastFailure === 'speech_quota_exceeded'
            ? 'quota'
            : state.configured
              ? 'network'
              : 'configuration',
          state.retryAfter || 600
        );
        this.status('Doğal ses beklemede. Cihaz sesiyle konuşma sürdürülebilir.');
      }
      return state;
    } catch {
      this.status('Ses bağlantısı kontrol edilemedi. Cihaz sesi kullanılabilir.');
      return null;
    }
  }
  health() {
    return this.recovery?.snapshot() || { naturalReady: Date.now() > this.coolUntil };
  }
  async unlock() {
    try {
      if (!this.context && this.AudioContextClass) this.context = new this.AudioContextClass();
      if (this.context?.state === 'suspended') await this.context.resume();
    } catch {}
  }
  prepare(text, force = false) {
    if (!this.natural || !text) return;
    const key = this.voice() + '|' + text;
    if (this.pending.has(key)) return this.pending.get(key).promise;
    // Prefetch is capped, but the utterance that must play now is never refused (that used to look like a
    // synthesis failure and pushed the whole session to the device voice for a cooldown).
    if (this.pending.size >= 3 && !force) return;
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = this.timers.setTimeout(() => {
        controller.abort();
        reject(Object.assign(Error('Ses hazırlama zaman aşımı.'), { code: 'speech_timeout' }));
      }, this.fetchTimeout + Math.min(12000, text.length * 25));
      timer?.unref?.();
    });
    const operation = (() => {
      try {
        return Promise.resolve(
          this.fetcher('/api/speech', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: this.voice() }),
            signal: controller.signal
          })
        );
      } catch (e) {
        return Promise.reject(e);
      }
    })().then(async r => {
      if (!r.ok) {
        let d = {};
        try {
          d = await r.json();
        } catch {}
        const error = Object.assign(Error(d.error || 'Doğal ses kullanılamıyor.'), {
          public: true,
          status: r.status,
          code: d.code,
          retryAfter: Number(r.headers?.get('Retry-After') || d.retryAfter) || undefined
        });
        throw error;
      }
      if (!/^audio\/(?:wav|mpeg)/.test(r.headers.get('content-type') || ''))
        throw Error('Ses yanıtı geçersiz.');
      const blob = await r.blob();
      blob.jarvisVoice = [r.headers.get('X-Jarvis-Speech'), r.headers.get('X-Jarvis-Voice')]
        .filter(Boolean)
        .map(value => {
          try {
            return decodeURIComponent(value);
          } catch {
            return value;
          }
        })
        .join(' · ');
      return blob;
    });
    const promise = Promise.race([operation, deadline]).finally(() => this.timers.clearTimeout(timer));
    promise.catch(() => {});
    this.pending.set(key, { promise, controller });
    return promise;
  }
  clearWatch() {
    if (this.watch) this.timers.clearTimeout(this.watch);
    this.watch = null;
  }
  cancel() {
    this.stopKeepAlive();
    this.serial++;
    this.playSerial++;
    this.clearWatch();
    for (const p of this.pending.values()) p.controller.abort();
    this.pending.clear();
    this.releaseAudio();
    try {
      this.synth?.cancel();
    } catch {}
    this.speaking = false;
    this.recovery?.event('cancelled');
    globalThis.jarvisAvatarSpeech?.(false);
    globalThis.jarvisAvatarLevel?.(0);
  }
  resume() {
    this.synth?.resume();
    this.unlock();
  }
  speak(utterance) {
    this.clearWatch();
    const id = this.serial,
      play = ++this.playSerial,
      live = () => id === this.serial && play === this.playSerial;
    this.speaking = true;
    if (!this.natural) {
      this.browserSpeak(utterance, live);
      return;
    }
    const key = this.voice() + '|' + utterance.text,
      pending = this.prepare(utterance.text, true);
    let started = false,
      finished = false;
    const end = error => {
      if (!live() || finished) return;
      finished = true;
      this.clearWatch();
      this.releaseAudio();
      this.speaking = false;
      if (error) {
        this.recovery?.event('playback_failed');
        utterance.onerror?.(error);
      } else utterance.onend?.();
    };
    const fallback = error => {
      if (!live() || finished) return;
      finished = true;
      this.clearWatch();
      this.releaseAudio();
      const wait =
        this.recovery?.fail(
          error.status === 429 ? 'quota' : [401, 403].includes(error.status) ? 'configuration' : 'network',
          error.retryAfter
        ) || (error.status === 429 ? 300 : 30);
      this.coolUntil = Date.now() + wait * 1000;
      for (const p of this.pending.values()) p.controller.abort();
      this.pending.clear();
      this.status((error.public ? error.message : 'Doğal ses hazırlanamadı.') + ' Cihaz sesine geçildi.');
      this.browserSpeak(utterance, live);
    };
    Promise.resolve(pending)
      .then(async blob => {
        this.pending.delete(key);
        if (!live() || finished) return;
        if (!blob) throw Error('Ses hazırlanamadı.');
        this.watch = this.timers.setTimeout(() => {
          if (!started) fallback(Error('Ses çıkışı başlamadı.'));
          else end(Error('Ses çalma tamamlanmadı.'));
        }, 8000);
        this.watch?.unref?.();
        await this.unlock();
        if (!live() || finished) return;
        const audible = () => {
          if (!live() || finished || started) return;
          started = true;
          this.clearWatch();
          this.recovery?.success();
          this.status('Doğal Türkçe ses · ' + (blob.jarvisVoice || this.voice()));
          this.watch = this.timers.setTimeout(() => end(Error('Ses çalma tamamlanmadı.')), 90000);
          this.watch?.unref?.();
          utterance.onstart?.();
        };
        const rate = Math.max(0.8, Math.min(1.2, Number(utterance.rate) || 1));
        // AudioBufferSource.playbackRate also shifts pitch ("chipmunk" voice). Only use Web Audio at normal
        // speed; otherwise the media element keeps the voice's pitch while changing tempo.
        if (Math.abs(rate - 1) < 0.01 && this.context?.state === 'running' && this.context.createBufferSource) {
          const buffer = await this.context.decodeAudioData(await blob.arrayBuffer());
          if (!live() || finished) return;
          const source = this.context.createBufferSource(),
            analyser = this.context.createAnalyser();
          this.source = source;
          this.analyser = analyser;
          analyser.fftSize = 256;
          source.buffer = buffer;
          source.connect(analyser);
          analyser.connect(this.context.destination);
          const samples = new Float32Array(analyser.fftSize);
          this.frame = this.timers.setInterval(() => {
            if (!live() || !this.analyser) return;
            analyser.getFloatTimeDomainData(samples);
            globalThis.jarvisAvatarLevel?.(
              Math.min(1, Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length) * 7)
            );
          }, 45);
          source.onended = () => end();
          source.start();
          audible();
          return;
        }
        const url = this.URLApi.createObjectURL(blob);
        this.url = url;
        const audio = new this.AudioClass(url);
        this.audio = audio;
        audio.preservesPitch = audio.mozPreservesPitch = audio.webkitPreservesPitch = true;
        audio.playbackRate = rate;
        audio.onplaying = audible;
        audio.onended = () => end();
        audio.onerror = () =>
          started ? end(Error('Ses çalma kesildi.')) : fallback(Error('Ses çıkışı açılamadı.'));
        await audio.play();
      })
      .catch(error => {
        this.pending.delete(key);
        if (!live() || finished) return;
        if (started) end(error);
        else fallback(error);
      });
  }
  browserSpeak(original, live = () => true) {
    this.clearWatch();
    const callbacks = {
      end: original.onend,
      error: original.onerror,
      start: original.onstart,
      boundary: original.onboundary
    };
    let started = false,
      finished = false,
      retried = false,
      current = original;
    const done = error => {
      if (!live() || finished) return;
      finished = true;
      this.stopKeepAlive();
      this.clearWatch();
      this.speaking = false;
      if (error) {
        try {
          this.synth?.cancel();
        } catch {}
        this.recovery?.event('device_failed');
        this.status('Cihaz sesi çalınamadı. Yanıt ekranda; dinleme oturumu devam edebilir.');
        callbacks.error?.(error);
      } else callbacks.end?.();
    };
    const choose = excluded => {
      const voices = this.synth?.getVoices?.() || [];
      return (
        voices
          .filter(v => /^tr(?:-|$)/i.test(v.lang) && v.voiceURI !== excluded?.voiceURI)
          .sort((a, b) => {
            return JarvisSpeechPlayer.voiceScore(b) - JarvisSpeechPlayer.voiceScore(a);
          })[0] || null
      );
    };
    const send = u => {
      if (!live() || finished) return;
      const initialStart = callbacks.start,
        initialBoundary = callbacks.boundary;
      u.lang = 'tr-TR';
      if (!u.voice || !/^tr(?:-|$)/i.test(u.voice.lang)) u.voice = choose(null);
      u.onstart = (...args) => {
        if (!live() || finished || started) return;
        started = true;
        this.clearWatch();
        this.recovery?.event('device_playing');
        this.status(
          (u.voice && /^tr(?:-|$)/i.test(u.voice.lang) ? 'Cihaz Türkçe sesi · ' : 'Cihaz sesi · ') +
            (u.voice?.name || 'sistem varsayılanı')
        );
        this.watch = this.timers.setTimeout(
          () => done(Error('Cihaz sesi takıldı.')),
          Math.max(
            15000,
            Math.min(120000, (String(u.text).length * 150) / Math.max(0.7, Number(u.rate) || 1) + 8000)
          )
        );
        this.watch?.unref?.();
        initialStart?.(...args);
      };
      u.onboundary = (...args) => {
        if (live() && !finished) initialBoundary?.(...args);
      };
      u.onend = () => {
        this.stopKeepAlive();
        done();
      };
      u.onerror = e => {
        if (!live() || finished) return;
        const alternate = choose(u.voice);
        if (
          !started &&
          !retried &&
          alternate &&
          this.UtteranceClass &&
          !['not-allowed', 'canceled', 'interrupted'].includes(e?.error)
        ) {
          retried = true;
          this.clearWatch();
          const next = new this.UtteranceClass(original.text);
          next.rate = original.rate;
          next.voice = alternate;
          current = next;
          this.recovery?.event('voice_reselected');
          send(next);
        } else done(e || Error('Cihaz sesi kullanılamadı.'));
      };
      this.watch = this.timers.setTimeout(() => done(Error('Cihaz sesi başlamadı.')), 5000);
      this.watch?.unref?.();
      try {
        if (!this.synth?.speak) throw Error('Sesli okuma desteklenmiyor.');
        this.synth.resume?.();
        this.synth.speak(u);
        this.startKeepAlive(u);
      } catch (e) {
        done(e);
      }
    };
    send(current);
  }
  // Higher is better: neural/online voices sound far more natural than legacy offline ones.
  static voiceScore(v) {
    return (
      (/natural|neural|online|premium|enhanced|geliştirilmiş/i.test(v.name) ? 50 : 0) +
      (/google|microsoft|siri/i.test(v.name) ? 20 : 0) +
      (/^tr-TR$/i.test(v.lang) ? 5 : 0) +
      (v.default ? 10 : 0)
    );
  }
  // Desktop Chrome stops remote (non-local) voices after ~15 s without firing onend. A pause/resume pulse
  // keeps them alive. Not used on Android, where pause() ends the utterance.
  startKeepAlive(u) {
    this.stopKeepAlive();
    const agent = globalThis.navigator?.userAgent || '';
    if (!u.voice || u.voice.localService !== false || /android/i.test(agent) || !/chrome/i.test(agent)) return;
    this.keepAlive = this.timers.setInterval(() => {
      if (!this.synth?.speaking) return this.stopKeepAlive();
      try {
        this.synth.pause();
        this.synth.resume();
      } catch {}
    }, 10000);
  }
  stopKeepAlive() {
    if (this.keepAlive) this.timers.clearInterval(this.keepAlive);
    this.keepAlive = null;
  }
  releaseAudio() {
    this.clearWatch();
    if (this.frame) this.timers.clearInterval(this.frame);
    this.frame = null;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop?.();
      } catch {}
      this.source.disconnect?.();
    }
    this.source = null;
    this.analyser = null;
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.onplaying = null;
      try {
        this.audio.pause();
        this.audio.src = '';
      } catch {}
    }
    this.audio = null;
    if (this.url) this.URLApi.revokeObjectURL(this.url);
    this.url = null;
    globalThis.jarvisAvatarLevel?.(0);
  }
}
if (typeof module !== 'undefined') module.exports = JarvisSpeechPlayer;

/* ---- JARVIS 0.39.0 · live-dictation.js ---- */

// One recognition generation at a time. Interim text is display-only.
class JarvisLiveDictation {
  constructor({
    Recognition,
    onPartial = () => {},
    onFinal = () => {},
    onFailure = () => {},
    onReady = () => {},
    pause = () => 900,
    timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) }
  }) {
    Object.assign(this, { Recognition, onPartial, onFinal, onFailure, onReady, pause, timers });
    this.enabled = false;
    this.serial = 0;
  }
  listening(value) {
    if (!value) {
      if (this.enabled || this.recognition) this.stop();
      return;
    }
    if (this.enabled) return;
    this.enabled = true;
    this.open();
  }
  clear() {
    for (const key of ['timer', 'guard', 'restart']) {
      this.timers.clear(this[key]);
      this[key] = null;
    }
  }
  stop() {
    this.enabled = false;
    this.serial++;
    this.clear();
    const r = this.recognition;
    this.recognition = null;
    if (r) {
      r.onresult = r.onend = r.onerror = r.onstart = null;
      try {
        r.abort();
      } catch {}
    }
    this.onPartial('');
  }
  fail(code) {
    this.stop();
    this.onFailure(code);
  }
  open() {
    if (!this.enabled) return;
    const serial = ++this.serial,
      live = () => this.enabled && serial === this.serial;
    let r;
    try {
      r = new this.Recognition();
    } catch {
      this.fail('unavailable');
      return;
    }
    this.recognition = r;
    r.lang = 'tr-TR';
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;
    let finalText = '',
      interim = '',
      closing = false;
    const deliver = () => {
      if (!live()) return;
      const text = finalText.trim();
      this.stop();
      if (text) this.onFinal(text);
    };
    r.onstart = () => {
      if (live()) {
        this.timers.clear(this.guard);
        this.guard = null;
        this.onReady();
      }
    };
    r.onresult = e => {
      if (!live()) return;
      finalText = '';
      interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i],
          text = (result[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) finalText = JarvisLiveDictation.merge(finalText, text);
        else interim = JarvisLiveDictation.merge(interim, text);
      }
      this.onPartial([finalText, interim].filter(Boolean).join(' '));
      this.timers.clear(this.timer);
      if (finalText.trim() || interim.trim())
        this.timer = this.timers.set(
          () => {
            if (!live() || closing) return;
            closing = true;
            try {
              r.stop();
            } catch {
              deliver();
              return;
            }
            this.guard = this.timers.set(() => {
              if (!live()) return;
              if (finalText.trim()) deliver();
              else this.fail('network');
            }, 1800);
          },
          JarvisLiveDictation.endPause(Number(this.pause()) || 900, interim || finalText)
        );
    };
    r.onend = () => {
      if (!live()) return;
      this.clear();
      if (finalText.trim()) {
        deliver();
        return;
      }
      if (interim.trim()) {
        this.fail('incomplete');
        return;
      }
      r.onresult = r.onend = r.onerror = r.onstart = null;
      this.recognition = null;
      this.onPartial('');
      this.restart = this.timers.set(() => {
        if (live()) this.open();
      }, 700);
    };
    r.onerror = e => {
      if (!live()) return;
      if (e.error === 'no-speech') return;
      this.fail(e.error || 'unavailable');
    };
    this.guard = this.timers.set(() => {
      if (live()) this.fail('network');
    }, 12000);
    try {
      r.start();
    } catch {
      this.fail('unavailable');
    }
  }
  // Android Chrome in continuous mode repeats earlier words inside later results
  // ("merhaba", "merhaba nasılsın"). Keep the longer cumulative text instead of doubling it.
  static merge(previous, next) {
    if (!previous) return next;
    const fold = t => t.toLocaleLowerCase('tr-TR').replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
    const a = fold(previous),
      b = fold(next);
    if (b.startsWith(a)) return next;
    if (a.endsWith(b)) return previous;
    return previous + ' ' + next;
  }
  // People pause mid-sentence after "ve", "ama", "şey"... Waiting a little longer there avoids cutting
  // the user off; a finished-sounding sentence keeps the configured pause.
  static endPause(base, text) {
    const pause = Math.max(650, base);
    const last = String(text)
      .trim()
      .toLocaleLowerCase('tr-TR')
      .split(/\s+/)
      .at(-1)
      ?.replace(/[^\p{L}]/gu, '');
    const open =
      /^(?:ve|veya|ya|yada|ama|fakat|ancak|çünkü|yani|şey|ee+|ıı+|hmm+|mesela|ki|ile|eğer|sonra|için|gibi|da|de|bir|hem|ne|bu|şu|o)$/.test(
        last || ''
      );
    return open ? Math.min(pause * 1.8, pause + 1400) : pause;
  }
}
if (typeof module !== 'undefined') module.exports = JarvisLiveDictation;

/* ---- JARVIS 0.39.0 · handsfree-core.js ---- */

class JarvisHandsFree {
  constructor({
    capture,
    transcribe,
    ask,
    output,
    cancel = () => {},
    command = () => null,
    onState = () => {},
    onLevel = () => {},
    onTranscript = () => {},
    acceptText = text => text,
    clock = () => performance.now(),
    pause = () => 1100,
    sensitivity = () => 0.012,
    barge = () => false,
    timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) }
  }) {
    Object.assign(this, {
      capture,
      transcribe,
      ask,
      output,
      cancel,
      command,
      onState,
      onLevel,
      onTranscript,
      acceptText,
      clock,
      pause,
      sensitivity,
      barge,
      timers
    });
    this.active = false;
    this.generation = 0;
    this.turn = 0;
    this.pre = [];
    this.noise = 0.003;
    this.phase = 'idle';
    this.failures = 0;
  }
  state(phase, message) {
    this.phase = phase;
    this.onState(phase, message);
  }
  reset() {
    this.pre = [];
    this.preSize = 0;
    this.frames = [];
    this.framesSize = 0;
    this.heardMs = 0;
    this.onset = 0;
    this.recording = false;
    this.lastVoice = 0;
    this.bargeMs = 0;
  }
  async start() {
    if (this.active) return;
    this.active = true;
    const g = ++this.generation;
    this.reset();
    this.noise = 0.003;
    this.floor = { blocks: [], min: Infinity, ms: 0 };
    this.state('starting', 'Mikrofon açılıyor. İlk kullanımda tarayıcı iznini onayla.');
    this.controller = new AbortController();
    try {
      const device = await this.capture(
        this.controller.signal,
        (s, r) => this.frame(s, r),
        () => this.stop('Mikrofon bağlantısı kesildi. Cihazını kontrol edip yeniden başlat.')
      );
      if (!this.active || g !== this.generation) {
        device.release();
        return;
      }
      this.device = device;
      this.state('listening', 'Seni dinliyorum. Konuşman bitince otomatik yanıtlayacağım.');
    } catch (e) {
      if (g === this.generation && this.active) this.stop(e.message || 'Mikrofon açılamadı.');
    }
  }
  stop(message = 'Konuşma oturumu kapalı. Mikrofon serbest bırakıldı.') {
    if (!this.active && !this.device && !this.controller && !this.currentOutput) {
      this.state('idle', message);
      return;
    }
    this.active = false;
    this.generation++;
    this.turn++;
    this.controller?.abort();
    this.controller = null;
    this.timers.clear(this.timer);
    this.timer = null;
    this.device?.release();
    this.device = null;
    this.currentOutput?.stop();
    this.currentOutput = null;
    this.cancel();
    this.reset();
    this.onLevel(0);
    this.state('idle', message);
  }
  // Minimum-statistics noise floor: the quietest moment of each 300 ms block, minimum over ~1.5 s.
  // Speech always has short gaps, steady room noise (fan, street, AC) does not, so the floor follows
  // the room in both directions without ever learning the user's voice as "noise".
  track(rms, duration) {
    const f = (this.floor ||= { blocks: [], min: Infinity, ms: 0 });
    f.min = Math.min(f.min, rms);
    f.ms += duration;
    if (f.ms < 300) return;
    f.blocks.push(f.min);
    if (f.blocks.length > 5) f.blocks.shift();
    f.min = Infinity;
    f.ms = 0;
    if (f.blocks.length >= 3) this.noise = Math.max(0.002, Math.min(0.03, Math.min(...f.blocks) * 1.1));
  }
  rolling(samples, rate) {
    this.pre.push(samples);
    this.preSize += samples.length;
    while (this.pre.length > 1 && this.preSize - this.pre[0].length > rate * 0.45)
      this.preSize -= this.pre.shift().length;
  }
  frame(samples, rate) {
    if (!this.active || !samples?.length || !Number.isFinite(rate) || rate < 8000) return;
    const now = this.clock(),
      duration = (samples.length / rate) * 1000;
    let sum = 0;
    for (const x of samples) sum += Number.isFinite(x) ? x * x : 0;
    const rms = Math.sqrt(sum / samples.length);
    this.onLevel(Math.min(1, rms * 12));
    this.track(rms, duration);
    const threshold = Math.max(this.sensitivity(), this.noise * 2.8);
    if (this.phase !== 'listening') {
      if (this.phase === 'speaking' && this.barge()) {
        this.rolling(samples, rate);
        this.bargeMs = rms > Math.max(0.035, threshold * 2) ? this.bargeMs + duration : 0;
        if (this.bargeMs >= 380 && now - this.outputAt > 600) {
          this.turn++;
          this.currentOutput?.stop();
          this.currentOutput = null;
          this.cancel();
          this.frames = this.pre.slice();
          this.framesSize = this.preSize;
          this.recording = true;
          this.started = now;
          this.lastVoice = now;
          this.heardMs = 380;
          this.onset = 0;
          this.state('listening', 'Söz sende. Seni dinliyorum.');
        }
      } else {
        this.pre = [];
        this.preSize = 0;
        this.bargeMs = 0;
      }
      return;
    }
    if (!this.recording) {
      this.rolling(samples, rate);
      if (rms > threshold) this.onset += duration;
      else this.onset = 0;
      if (this.onset < 130) return;
      this.recording = true;
      this.frames = this.pre.slice();
      this.framesSize = this.preSize;
      this.started = now;
      this.lastVoice = now;
      this.heardMs = this.onset;
      this.state('listening', 'Duyuyorum… cümleni bitirmeni bekliyorum.');
      return;
    }
    this.frames.push(samples);
    this.framesSize += samples.length;
    if (rms > threshold) {
      this.lastVoice = now;
      this.heardMs += duration;
    }
    if (now - this.lastVoice >= Math.max(650, Number(this.pause()) || 1100) || this.framesSize / rate >= 25) {
      const frames = this.frames;
      const heard = this.heardMs;
      this.reset();
      if (heard < 240) {
        this.state('listening', 'Seni dinliyorum.');
        return;
      }
      this.process(frames, rate);
    }
  }
  outputState(phase) {
    if (!this.active) return;
    if (phase === 'speaking') {
      if (this.phase !== 'speaking') this.outputAt = this.clock();
      this.state(
        'speaking',
        this.barge()
          ? 'Konuşuyorum. Kulaklık modunda sesinle araya girebilirsin.'
          : 'Konuşuyorum. Bitince otomatik olarak seni dinleyeceğim.'
      );
    } else if (phase === 'thinking') this.state('thinking', 'Yanıtın devamı hazırlanıyor…');
  }
  submitText(text) {
    if (!this.active || this.phase !== 'listening' || typeof text !== 'string' || !text.trim()) return false;
    this.reset();
    this.process(null, null, text);
    return true;
  }
  async process(frames, rate, directText) {
    if (!this.active) return;
    const g = this.generation,
      t = ++this.turn,
      live = () => this.active && g === this.generation && t === this.turn;
    if (directText === undefined) this.state('transcribing', 'Sözlerin yazıya çevriliyor…');
    else this.state('thinking', 'Söylediklerini aldım. Yanıtlıyorum…');
    try {
      const transcript =
        directText === undefined
          ? await this.transcribe(JarvisHandsFree.wav(frames, rate), this.controller.signal)
          : directText;
      if (!live()) return;
      const heardText = String(transcript || '').trim();
      // Speech-to-text models invent stock phrases on noise/silence ("İzlediğiniz için teşekkürler").
      // Answering those would make JARVIS talk to an empty room.
      const text = JarvisHandsFree.hallucination(heardText)
        ? ''
        : String(this.acceptText(heardText) || '').trim();
      if (!text) {
        this.resume(g, t);
        return;
      }
      this.onTranscript(text);
      const folded = text
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/[.!?,]/g, '')
        .trim();
      if (
        /^(?:(?:hey\s+)?(?:j|c)[ae]rvi[sz]\s+)?(?:dur|sus|konusmayi bitir|sesli modu kapat|mikrofonu kapat|dinlemeyi durdur)$/.test(
          folded
        )
      ) {
        this.stop('Sesli komutla oturum kapatıldı. Mikrofon kapalı.');
        return;
      }
      this.state('thinking', 'Yanıtını hazırlıyorum…');
      const playback = this.output(p => {
        if (live()) this.outputState(p);
      });
      this.currentOutput = playback;
      const local = this.command(text);
      const reply =
        local ||
        (await this.ask(
          text,
          delta => {
            if (live()) playback.push(delta);
          },
          this.controller.signal
        ));
      if (!live()) return;
      if (!reply) {
        playback.stop();
        throw Error('Yanıt alınamadı. Bağlantını kontrol et.');
      }
      playback.finish(reply);
      const played = await playback.done;
      if (!live()) return;
      this.currentOutput = null;
      if (!played) {
        this.state('settling', 'Yanıt ekranda. Ses çalınamadı; seni dinlemeye devam edeceğim.');
      }
      this.failures = 0;
      this.resume(g, t);
    } catch (e) {
      if (!live()) return;
      this.currentOutput?.stop();
      this.currentOutput = null;
      if (e.code === 'no_speech') {
        this.resume(g, t);
        return;
      }
      if (
        e.fatal ||
        [401, 403].includes(e.status) ||
        ['invalid_api_key', 'not_configured', 'audio_provider_missing'].includes(e.code) ||
        ++this.failures >= 3
      ) {
        this.stop(e.message || 'Bağlantı kurulamadı. Yeniden başlat.');
        return;
      }
      const delay = e.status === 429 ? 60000 : 2500;
      this.state(
        'recovering',
        e.status === 429
          ? 'İstek kotası doldu. Bir dakika bekleyip yeni konuşmanı dinleyeceğim.'
          : (e.message || 'Bağlantı kesildi.') +
              ' Birazdan yeniden dinleyeceğim. Gönderilmiş kayıt otomatik tekrarlanmaz.'
      );
      this.timer = this.timers.set(() => {
        if (live()) {
          this.reset();
          this.state('listening', 'Seni dinliyorum.');
        }
      }, delay);
    }
  }
  static hallucination(text) {
    const t = String(text || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .trim();
    if (!t || /^[\s♪♫.…,!?*\-–—()[\]]*$/.test(t)) return true;
    if (/^[([*]?\s*(?:muzik|alkis|gulusmeler|gurultu|sessizlik|music|applause|silence)\s*[)\]*]?[.!]*$/.test(t)) return true;
    return /(?:^alt ?yazi|izlediginiz icin tesekkur|abone ol(?:mayi|un|abilirsiniz)|kanalima abone|bir sonraki videoda|videoyu begen|subtitles by|thanks for watching|amara\.org)/.test(
      t
    );
  }
  resume(g, t) {
    if (!this.active || g !== this.generation || t !== this.turn) return;
    this.state('settling', 'Yeniden dinlemeye geçiyorum…');
    this.timer = this.timers.set(() => {
      if (this.active && g === this.generation && t === this.turn) {
        this.reset();
        this.state('listening', 'Seni dinliyorum. Yeni bir düğmeye basmana gerek yok.');
      }
    }, 350);
  }
  static wav(frames, rate) {
    const total = frames.reduce((n, a) => n + a.length, 0);
    if (!total || total > rate * 27) throw Error('Ses kaydı sınırı aşıldı.');
    const data = new Float32Array(total);
    let at = 0;
    for (const a of frames) {
      data.set(a, at);
      at += a.length;
    }
    const target = Math.min(16000, rate),
      count = Math.floor((total * target) / rate),
      result = new Uint8Array(44 + count * 2),
      view = new DataView(result.buffer),
      write = (at, s) => result.set(new TextEncoder().encode(s), at);
    write(0, 'RIFF');
    view.setUint32(4, result.length - 8, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, target, true);
    view.setUint32(28, target * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, count * 2, true);
    let previous = 0;
    for (let i = 0; i < count; i++) {
      const end = Math.min(total, Math.max(previous + 1, Math.round(((i + 1) * rate) / target)));
      let sum = 0;
      for (let j = previous; j < end; j++) sum += Number.isFinite(data[j]) ? data[j] : 0;
      const x = Math.max(-1, Math.min(1, sum / (end - previous)));
      view.setInt16(44 + i * 2, Math.round(x * (x < 0 ? 32768 : 32767)), true);
      previous = end;
    }
    return result;
  }
}
if (typeof module !== 'undefined') module.exports = JarvisHandsFree;

/* ---- JARVIS 0.39.0 · wake-core.js ---- */

class JarvisWakeGate {
  constructor({ enabled = () => true, clock = () => Date.now(), windowMs = 60000 } = {}) {
    Object.assign(this, { enabled, clock, windowMs });
    this.awakeUntil = 0;
  }
  reset() {
    this.awakeUntil = 0;
  }
  touch() {
    this.awakeUntil = this.clock() + this.windowMs;
  }
  accept(input) {
    const text = String(input || '').trim();
    if (!this.enabled()) return text;
    const t = text.toLocaleLowerCase('tr-TR');
    if (
      /^(?:(?:(?:j[ae]rv[ıi][sz]|[cç][ae]rv[ıi][sz]|jarviz|ceyvis))[\s,:.!-]*)?(?:dur|sus|konuşmayı bitir|sesli modu kapat|mikrofonu kapat|dinlemeyi durdur)[.!?]*$/u.test(
        t
      )
    )
      return text;
    if (/^(?:hey[\s,]+|hey\s*)?(?:j[ae]rv[ıi][sz]|[cç][ae]rv[ıi][sz]|jarviz|ceyvis)(?:[\s,:.!-]|$)/u.test(t)) {
      this.touch();
      return text.replace(/^(?:hey[\s,]+|hey\s*)?(?:j[ae]rv[ıiİ][sz]|[cç][ae]rv[ıiİ][sz]|jarviz|ceyvis)[\s,:.!-]*/iu, '').trim() || null;
    }
    if (this.clock() < this.awakeUntil) {
      this.touch();
      return text;
    }
    return null;
  }
}
if (typeof module !== 'undefined') module.exports = JarvisWakeGate;
