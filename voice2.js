'use strict';
/* SATÜRN 15 — AKICI SES
 *  1) Ana konuşma modu = CANLI: mikrofon düğmesi doğrudan Gemini Live açar (tek akış: dinler + düşünür + doğal sesle konuşur,
 *     sözünü kesebilirsin). Klasik yol 3 ayrı kotalı istek harcıyordu (yazıya çevirme + cevap + seslendirme); CANLI tek oturum.
 *     CANLI açılamazsa o oturum için kendiliğinden klasik moda döner ve nedenini söyler.
 *  2) Kotasız cihaz sesi iyileştirme: konuşmadan önce metni Türkçe konuşma diline çevirir (%, TL, $, kısaltmalar, birimler,
 *     emoji/bağlantı/işaret temizliği), en kaliteli Türkçe sesi seçer (Gelişmiş/Premium/Google), biraz daha akıcı hız.
 *  3) "Doğal ses kullanılamazsa" → Otomatik: cihazda kaliteli ses varsa onunla oku, yoksa ekranda göster. */
(() => {
  /* ---------- 2) cihaz sesi: metin → konuşma dili ---------- */
  const ABBR = [[/\bvb\./gi, 've benzeri'], [/\bvs\./gi, 've saire'], [/\börn\./gi, 'örneğin'], [/\byak\./gi, 'yaklaşık'], [/\bDr\./g, 'Doktor'], [/\bFzt\./g, 'Fizyoterapist'], [/\bProf\./g, 'Profesör'], [/\bDoç\./g, 'Doçent'], [/\bUzm\./g, 'Uzman'], [/\bTSİ\b/g, 'Türkiye saatiyle'],
    [/\bAI\b/g, 'yapay zekâ'], [/\bMR\b/g, 'em ar'], [/\bRKÇ\b/g, 'randomize kontrollü çalışma'], [/\bDSÖ\b/g, 'Dünya Sağlık Örgütü'], [/\bABD\b/g, 'A Be De'], [/\bAB\b/g, 'Avrupa Birliği'], [/\bTCMB\b/g, 'Merkez Bankası'], [/\bBIST\b/g, 'Borsa İstanbul'], [/\bVKİ\b/g, 'vücut kitle indeksi']];
  const UNIT = { km: 'kilometre', m: 'metre', cm: 'santimetre', mm: 'milimetre', kg: 'kilogram', g: 'gram', mg: 'miligram', ml: 'mililitre', lt: 'litre', dk: 'dakika', sn: 'saniye', sa: 'saat', kcal: 'kalori', bpm: 'atım', 'km/s': 'kilometre saat' };
  function speakable(s) {
    let t = String(s || '');
    t = t.replace(/https?:\/\/\S+/g, 'bağlantı').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\u{FE0F}/gu, '').replace(/[*_#`>|~•▸⟶→←✓✗◆◈■]+/g, ' ');
    t = t.replace(/%\s?(\d[\d.,]*)/g, 'yüzde $1').replace(/(\d[\d.,]*)\s?%/g, 'yüzde $1');
    t = t.replace(/(\d[\d.,]*)\s?(?:₺|TL)\b/g, '$1 lira').replace(/₺\s?(\d[\d.,]*)/g, '$1 lira').replace(/\$\s?(\d[\d.,]*)/g, '$1 dolar').replace(/(\d[\d.,]*)\s?\$/g, '$1 dolar').replace(/€\s?(\d[\d.,]*)/g, '$1 euro').replace(/(\d[\d.,]*)\s?€/g, '$1 euro');
    t = t.replace(/(\d)\s?°C\b/g, '$1 derece').replace(/(\d)\s?[x×]\s?(\d)/g, '$1 kere $2').replace(/(\d)\s?[–-]\s?(\d)/g, '$1 ile $2 arası ');
    t = t.replace(/\b(\d{1,3})\.(\d{1,2})\b(?!\.\d)/g, (m, a, b) => (a.length <= 2 ? a + ',' + b : m)); // 6.1 → 6,1 (binlik ayırıcıya dokunma)
    t = t.replace(/(\d)\s?(km\/s|kcal|bpm|km|cm|mm|kg|mg|ml|lt|dk|sn|sa|m|g)\b/g, (m, d, u) => d + ' ' + UNIT[u]);
    for (const [re, v] of ABBR) t = t.replace(re, v);
    t = t.replace(/\s*\n+\s*/g, '. ').replace(/\(([^)]{0,80})\)/g, ', $1,').replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/([.!?]){2,}/g, '$1');
    return t.trim();
  }
  const trVoices = () => (window.speechSynthesis?.getVoices?.() || []).filter(v => /^tr/i.test(v.lang || ''));
  const good = v => /enhanced|premium|gelişmiş|geliştirilmiş|neural|natural|online|google/i.test(v?.name || '');
  const goodDeviceVoice = () => trVoices().find(good) || null;
  window.jarvisGoodDeviceVoice = goodDeviceVoice;
  try {
    const synth = window.speechSynthesis;
    if (synth?.speak) {
      const sp = synth.speak.bind(synth);
      synth.speak = u => {
        try {
          if (u && typeof u.text === 'string' && (!u.lang || /^tr/i.test(u.lang))) {
            u.text = speakable(u.text);
            if (!u.voice) { const b = (typeof bestVoice === 'function' && bestVoice()) || goodDeviceVoice(); if (b) u.voice = b; }
            const boost = Number(opt('devRate')) || 1.06; if (u.rate && boost !== 1) u.rate = Math.min(1.6, u.rate * boost);
          }
        } catch {}
        return sp(u);
      };
    }
  } catch {}

  /* ---------- 3) otomatik cihaz sesi kararı ---------- */
  const fb = $('deviceFallback');
  if (fb && ![...fb.options].some(o => o.value === 'auto')) {
    fb.prepend(new Option('Otomatik — telefonda kaliteli Türkçe ses varsa onunla oku, yoksa ekranda', 'auto'));
    const saved = store.get('set.deviceFallback', null);
    fb.value = saved === null || saved === '0' && !store.get('voice2Migrated', false) ? 'auto' : saved;
    store.set('set.deviceFallback', fb.value); store.set('voice2Migrated', true);
  }

  /* ---------- 1) mikrofon = CANLI ---------- */
  const isApple = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent);
  let liveBroken = '', watching = 0, userClosing = false;
  const hasKey = () => { try { return typeof getKey === 'function' ? !!getKey() : !!store.get('key', ''); } catch { return false; } };
  const useLive = () => opt('talkMode') !== 'klasik' && !liveBroken && hasKey() && !!window.jarvisLive && !!$('liveBtn') && !(typeof recorder !== 'undefined' && recorder.active) && !(typeof voiceSession !== 'undefined' && voiceSession.active);
  document.addEventListener('click', e => {
    if (!e.target?.closest?.('#mic') || !useLive()) return;
    e.stopImmediatePropagation(); e.preventDefault();
    userClosing = !!window.jarvisLive.active();
    $('liveBtn').click(); // aynı dokunuş içinde: iPhone ses kuralı korunur
    if (!userClosing) watch();
  }, true);
  function watch() {
    clearInterval(watching); const t0 = Date.now();
    watching = setInterval(() => {
      const st = window.jarvisLive.state?.(), act = window.jarvisLive.active();
      if (act && st?.ready) { clearInterval(watching); return; }
      if (act && Date.now() - t0 < 12000) return; // hâlâ bağlanıyor
      clearInterval(watching);
      if (!act && userClosing) return; // kullanıcı kendisi kapattı
      liveBroken = 'açılamadı';
      try { if (act) window.jarvisLive.stop(); } catch {}
      note('CANLI ses şu an açılamadı; mikrofon düğmesi bu oturumda klasik dinlemeye döndü — tekrar dokun. (Nedenini görmek için: Ayarlar → “Ses ve CANLI testi”.)');
      logOp('akıcı ses', ['CANLI → klasik'], 'başarısız', 'canlı bağlantı kurulamadı');
    }, 500);
  }
  // canlı mod açıkken mikrofon düğmesi de "açık" görünsün
  setInterval(() => { const m = $('mic'); if (m && opt('talkMode') !== 'klasik' && window.jarvisLive?.active?.()) m.dataset.on = '1'; }, 700);

  /* ---------- ayarlar ---------- */
  const tm = el('select', { id: 'talkMode' });
  tm.append(new Option('CANLI — akıcı doğal ses, tek dokunuş, sözünü kesebilirsin (önerilen)', 'canli'), new Option('Klasik — dinle → yaz → cevapla → seslendir', 'klasik'));
  tm.value = store.get('set.talkMode', 'canli'); tm.onchange = () => { store.set('set.talkMode', tm.value); liveBroken = ''; };
  const dr = el('select', { id: 'devRate' }); for (const [v, t] of [['1', 'Normal'], ['1.06', 'Biraz akıcı (önerilen)'], ['1.15', 'Hızlı']]) dr.append(new Option(t, v));
  dr.value = store.get('set.devRate', '1.06'); dr.onchange = () => store.set('set.devRate', dr.value);
  const tip = el('p', { class: 'muted', id: 'voiceTip' });
  const anchor = fb?.closest('.field');
  anchor?.before(el('div', { class: 'field' }, el('label', { for: 'talkMode' }, 'Mikrofon düğmesi'), tm));
  anchor?.after(el('div', { class: 'field' }, el('label', { for: 'devRate' }, 'Cihaz sesi hızı'), dr), tip);
  function paintTip() {
    const v = goodDeviceVoice();
    tip.textContent = v ? `Kotasız cihaz sesi: ${v.name} (kaliteli).` : isApple
      ? 'Kotasız ve daha doğal cihaz sesi için: iPhone Ayarlar → Erişilebilirlik → Okunan İçerik → Sesler → Türkçe → Yelda → “Gelişmiş” sürümü indir. SATÜRN onu kendiliğinden kullanır.'
      : 'Kotasız daha doğal ses için Chrome’da “Google Türkçe” sesi kullanılır; cihazın metin okuma ayarından Türkçe yüksek kaliteli sesi indirebilirsin.';
  }
  paintTip(); try { speechSynthesis.addEventListener?.('voiceschanged', paintTip); } catch {}

  const _lc = localCommand;
  localCommand = text => {
    const t = fold(text).replace(/[.!?,]/g, '').replace(/^(jarvis|ultron)\s+/, '').trim();
    if (/^(canli mod(u)? varsayilan yap|mikrofon(u)? canli yap|akici konus)$/.test(t)) { tm.value = 'canli'; tm.onchange(); return 'Tamam: mikrofon düğmesi artık doğrudan CANLI açıyor — akıcı, doğal sesle konuşacağız.'; }
    if (/^(guncelle|uygulamayi guncelle|guncellemeleri? (kontrol et|denetle)|surum kac|hangi surumdesin)$/.test(t)) { setTimeout(() => window.jarvisCheckUpdate?.(true), 30); return 'Sürümü denetliyorum; yeni sürüm varsa hemen kurup yeniden açacağım (notların ve ayarların silinmez).'; }
    if (/^(klasik (moda gec|dinleme)|mikrofon(u)? klasik yap)$/.test(t)) { tm.value = 'klasik'; tm.onchange(); return 'Klasik dinleme moduna geçtim.'; }
    return _lc(text);
  };
  window.jarvisVoice2 = { speakable, goodDeviceVoice, useLive, broken: () => liveBroken, reset: () => { liveBroken = ''; } };
})();
