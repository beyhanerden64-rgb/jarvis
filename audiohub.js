'use strict';
/* SES MERKEZİ (AudioHub) — SATÜRN'ün tek ses motoru.
 * iPhone/Safari kuralı: ses sistemi (AudioContext) yalnız dokunuş ANINDA başlatılabilir; bir "await"ten sonra
 * oluşturulursa askıda kalır ve mikrofon açık görünse de hiç ses gelmez. Bu yüzden:
 *  - her dokunuşta (yakalama aşamasında, her şeyden önce) tek bir AudioContext oluşturulur/uyandırılır,
 *  - mikrofon akışı oturum boyunca bir kez alınır ve kayıt + CANLI mod aynı bağlamı kullanır,
 *  - ses verisi doğrudan PCM olarak toplanır (MediaRecorder/kodek belirsizliği yok) ve WAV'a çevrilir. */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const hub = {
    ctx: null, stream: null, lastError: '', primedAt: 0,
    get running() { return this.ctx?.state === 'running'; },
    prime() { // dokunuş içinde çağrılmalı (eşzamanlı)
      if (!AC) return;
      try {
        if (!this.ctx || this.ctx.state === 'closed') { try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { this.ctx = new AC(); } }
        if (this.ctx.state !== 'running') this.ctx.resume?.().catch(() => {});
        if (Date.now() - this.primedAt > 1000) { // iOS: 1 örneklik sessiz ses → ses yolu gerçekten açılır
          const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
          this.primedAt = Date.now();
        }
      } catch (e) { this.lastError = e.message; }
    },
    async mic() {
      if (this.stream?.getAudioTracks().some(t => t.readyState === 'live')) return this.stream;
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Bu tarayıcı mikrofona izin vermiyor (Safari/Chrome kullan).');
      try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
      catch (e) { this.lastError = e.name; throw Error(e.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi. iPhone: Ayarlar → Safari → Mikrofon → İzin Ver (ana ekrandaki uygulamada ilk açılışta sorulur).' : e.name === 'NotFoundError' ? 'Mikrofon bulunamadı.' : 'Mikrofon açılamadı: ' + e.message); }
      this.stream.getAudioTracks().forEach(t => { t.onended = () => { this.stream = null; }; });
      return this.stream;
    },
    releaseMic() { try { this.stream?.getTracks().forEach(t => t.stop()); } catch {} this.stream = null; },
    // PCM yakalama: onFrame(Float32Array, sampleRate) ~85 ms'de bir
    capture(stream, onFrame) {
      this.prime();
      const ctx = this.ctx, src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
      mute.gain.value = 0;
      let frames = 0;
      proc.onaudioprocess = e => { frames++; onFrame(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate); };
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      return { get frames() { return frames; }, stop() { try { proc.onaudioprocess = null; src.disconnect(); proc.disconnect(); mute.disconnect(); } catch {} } };
    },
    // Float32 parçaları → 16 kHz mono 16-bit WAV (Blob)
    wav(chunks, rate, outRate = 16000) {
      const total = chunks.reduce((s, c) => s + c.length, 0), ratio = rate / outRate, n = Math.floor(total / ratio);
      const all = new Float32Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) { // basit ortalama ile örnek azaltma (kenar yumuşatma)
        const a = Math.floor(i * ratio), b = Math.min(total, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b; j++) s += all[j]; const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
        pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      const h = new DataView(new ArrayBuffer(44)), w = (p, s) => [...s].forEach((c, i) => h.setUint8(p + i, c.charCodeAt(0)));
      w(0, 'RIFF'); h.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
      h.setUint32(24, outRate, true); h.setUint32(28, outRate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.byteLength, true);
      return new Blob([h.buffer, pcm.buffer], { type: 'audio/wav' });
    },
    // Float32 → 16 kHz Int16 (CANLI mod akışı için)
    to16k(f, rate) { const ratio = rate / 16000, n = Math.floor(f.length / ratio), out = new Int16Array(n); for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, f[Math.floor(i * ratio)])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return out; }
  };
  // Her dokunuşta, uygulamanın kendi kodundan ÖNCE (yakalama aşaması) ses sistemini uyandır.
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, () => hub.prime(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && hub.ctx?.state === 'suspended') hub.ctx.resume?.().catch(() => {}); });
  window.AudioHub = hub;
})();
