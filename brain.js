'use strict';
/* SATÜRN 7.1 — BEYİN: SATÜRN'ü onaran ve yeniden yapılandıran akıllı ajanlar.
 * Kota harcamazlar: ölçer, öğrenir ve kurallarla karar verirler (yapay zekâ çağrısı yok).
 * Tek istisna MİMAR: günde en çok 1 kısa çağrı ile tüm ölçümleri okuyup ayar önerir; güvenli olanları uygular (geri alınabilir).
 * Ajanlar: model yönlendirici, kota koruyucu, ses yönlendirici, tekrar önleyici, araç doktoru, performans ayarcısı,
 * ayar doktoru, öz-test + yumuşak yeniden başlatma, güncelleyici, istem ölçer, mimar. */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const NOW = () => Date.now(), MIN = 60000, HOUR = 60 * MIN;
  // Gemini ücretsiz kotası Pasifik gece yarısında sıfırlanır.
  const ptDay = () => new Date(NOW() - 8 * HOUR).toISOString().slice(0, 10);
  const nextPtMidnight = () => { const d = new Date(NOW() - 8 * HOUR); d.setUTCHours(24, 0, 0, 0); return d.getTime() + 8 * HOUR; };
  const B = Object.assign({ models: {}, learn: [], arch: null, perf: null, tools: {}, saved: 0 }, store.get('brain', {}) || {});
  let dirty = false; const save = () => { dirty = true; };
  setInterval(() => { if (dirty) { dirty = false; store.set('brain', B); render(); } }, 3000);
  const learn = (ajan, mesaj) => { B.learn.push({ t: NOW(), ajan, mesaj }); B.learn = B.learn.slice(-60); save(); };
  const ST = {}; // ajan durumları (ekrana)
  const mark = (id, durum, mesaj) => { ST[id] = { durum, mesaj, t: NOW() }; };
  let lastAct = NOW();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { lastAct = NOW(); }, { passive: true });
  const idle = ms => NOW() - lastAct > ms && phase === 'idle' && !answering;

  /* ========== 1-3) MODEL YÖNLENDİRİCİ + KOTA KORUYUCU + SES YÖNLENDİRİCİ ========== */
  const mh = m => { const h = B.models[m] ||= { ok: 0, fail: 0, lat: 0, cool: 0, strikes: 0, day: '', used: 0, limit: 0 }; if (h.day !== ptDay()) { h.day = ptDay(); h.used = 0; h.strikes = 0; if (h.cool > NOW() && h.coolWhy === 'kota') h.cool = 0; } return h; };
  const cooled = m => mh(m).cool > NOW();
  const isTts = m => /tts/.test(m);
  const economy = () => Object.entries(B.models).some(([m, h]) => !isTts(m) && h.limit && h.day === ptDay() && h.used >= h.limit * 0.8);
  window.jarvisModelGate = {
    order(list, tier) {
      if (tier === 'tts') { const live = list.filter(m => !cooled(m)); if (live.length < list.length) B.saved++; return live; }
      let live = list.filter(m => !cooled(m)); const dead = list.filter(cooled);
      if (dead.length) B.saved += dead.length;
      // ölçüme dayalı sıralama: ardışık hatası olan sona; yeterli örnek varsa yavaş olan geriye (ilk sıradaki ancak belirgin yavaşsa değişir)
      const score = m => { const h = mh(m); return (h.strikes >= 2 ? 1e6 : 0) + (h.ok >= 5 ? h.lat : 0); };
      if (live.length > 1 && tier !== 'complex') { const first = live[0], best = [...live].sort((a, b) => score(a) - score(b))[0]; if (best !== first && score(first) > score(best) * 1.6 + 400) live = [best, ...live.filter(m => m !== best)]; }
      // kota koruyucu: günlük sınıra yaklaşıldıysa karmaşık işler de hafif modelle yapılır
      if (tier === 'complex' && economy()) live = [...live.filter(m => /lite/.test(m)), ...live.filter(m => !/lite/.test(m))];
      return [...live, ...dead];
    },
    report(model, status, ms) {
      const h = mh(model), t = NOW();
      if (status >= 200 && status < 300) { h.ok++; h.used++; h.strikes = 0; if (ms) h.lat = h.lat ? Math.round(h.lat * 0.8 + ms * 0.2) : Math.round(ms); }
      else if (status === 429) {
        h.strikes++; h.fail++;
        if (h.used > 10 && (!h.limit || h.used < h.limit)) { h.limit = h.used; learn('Kota koruyucu', `${model} günlük sınırı yaklaşık ${h.used} istek olarak öğrenildi.`); }
        const until = h.strikes >= 3 ? nextPtMidnight() : t + [5, 15, 60][h.strikes - 1] * MIN;
        h.cool = until; h.coolWhy = 'kota';
        learn(isTts(model) ? 'Ses yönlendirici' : 'Model yönlendirici', `${model} kotası doldu → ${h.strikes >= 3 ? 'yarın sıfırlanana kadar' : Math.round((until - t) / MIN) + ' dk'} dinlenmeye alındı; istekler diğer modellere gidiyor.`);
      } else if ([403, 404].includes(status)) { h.fail++; h.cool = t + 24 * HOUR; h.coolWhy = 'yok'; learn('Model yönlendirici', `${model} bu anahtarla kullanılamıyor → 1 gün atlanacak.`); }
      else { h.fail++; h.strikes++; if (h.strikes >= 2) { h.cool = t + 2 * MIN; h.coolWhy = 'yoğun'; } }
      save();
    }
  };

  /* ========== 4) TEKRAR ÖNLEYİCİ (aynı istek 2 dk içinde gelirse kotayı yemeden aynı yanıt) ========== */
  const cache = new Map();
  const _api = api;
  api = async (path, options = {}) => {
    if (!String(path).includes('/api/chat') || options.method !== 'POST' || typeof options.body !== 'string') return _api(path, options);
    const k = options.body.length + ':' + hash(options.body), c = cache.get(k);
    if (c && NOW() - c.t < 2 * MIN) { B.saved++; save(); mark('tekrar', 'onarıldı', 'yinelenen istek önbellekten yanıtlandı'); return new Response(c.text, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    const r = await _api(path, options);
    if (r.ok) { r.clone().text().then(text => { if (text && !text.includes('\u0000ERR')) { cache.set(k, { t: NOW(), text }); if (cache.size > 20) cache.delete(cache.keys().next().value); } }).catch(() => {}); }
    return r;
  };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /* ========== 5) ARAÇ DOKTORU (sık bozulan aracı tanır, SATÜRN'e alternatif kullandırır) ========== */
  function toolDoctor() {
    const by = {};
    for (const o of opLog.slice(-120)) { if (!['başarılı', 'başarısız'].includes(o.status)) continue; (by[o.tool] ||= []).push(o); }
    const bad = {};
    for (const [tool, arr] of Object.entries(by)) { const last = arr.slice(-5), f = last.filter(o => o.status === 'başarısız').length; if (last.length >= 3 && f >= 3 && last.at(-1).status === 'başarısız') bad[tool] = short(last.at(-1).result || 'hata', 90); }
    for (const t of Object.keys(bad)) if (!B.tools[t]) learn('Araç doktoru', `“${t}” aracı üst üste bozuluyor; SATÜRN artık alternatif yol deneyecek.`);
    for (const t of Object.keys(B.tools)) if (!bad[t]) learn('Araç doktoru', `“${t}” aracı yeniden çalışıyor.`);
    const changed = JSON.stringify(bad) !== JSON.stringify(B.tools); B.tools = bad; if (changed) save();
    return Object.keys(bad).length ? 'sorun' : 'ok';
  }
  const _tp = toolsPrompt;
  toolsPrompt = () => { const t = Object.entries(B.tools); return _tp() + (t.length ? `\nARIZALI ARAÇLAR (araç doktoru): ${t.map(([k, v]) => `${k} — son hata: ${v}`).join('; ')}. Bunları yalnız gerekirse bir kez dene; başarısız olursa alternatif araç/yol kullan ve Beyhan’a kısaca söyle.` : '') + (economy() ? '\nKOTA TASARRUFU: Günlük ücretsiz kota azaldı; kısa yanıt ver, gereksiz araç turu yapma.' : ''); };

  /* ========== 6) PERFORMANS AYARCISI (akıcılık düşerse görüntüyü hafifletir, düzelince geri alır) ========== */
  function fps(ms = 2000) { return new Promise(res => { if (document.hidden) return res(null); let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); }); }
  const P = B.perf ||= { low: 0, high: 0, auto: false, last: 0 };
  async function perfTuner() {
    const f = await fps(); if (f == null) return 'atla';
    P.last = f; const pw = $('power');
    if (!pw) return 'atla';
    if (f < 24 && pw.value === 'auto') { if (++P.low >= 2) { pw.value = 'eco'; pw.dispatchEvent(new Event('change')); P.auto = true; P.low = 0; learn('Performans ayarcısı', `Ekran ${f} FPS'ye düştü → tasarruf görünümü açıldı.`); note('Akıcılık düştü; görüntüyü hafiflettim.', () => { pw.value = 'auto'; pw.dispatchEvent(new Event('change')); P.auto = false; save(); }); } }
    else P.low = 0;
    if (P.auto && f >= 50) { if (++P.high >= 10) { pw.value = 'auto'; pw.dispatchEvent(new Event('change')); P.auto = false; P.high = 0; learn('Performans ayarcısı', 'Akıcılık düzeldi → tam görüntüye dönüldü.'); } } else P.high = 0;
    save(); return f < 24 ? 'sorun' : 'ok';
  }

  /* ========== 7) AYAR DOKTORU (bozuk/geçersiz ayarları varsayılana çeker) ========== */
  const VALID = {
    power: ['auto', 'eco', 'full'], autonomy: ['0', '1', '2'], dryRun: ['0', '1'], budget: ['0', '100', '250', '500'], keepDays: ['0', '30', '90', '365'],
    pGlobe: ['0', '1'], pRadar: ['0', '1'], pTicker: ['0', '1'], pEdges: ['0', '1'], pBoot: ['0', '1'], ttsStyle: ['jarvis', 'sakin', 'sicak', 'resmi', 'enerjik', '']
  };
  const DEF = { power: 'auto', autonomy: '1', dryRun: '0', budget: '0', keepDays: '0', pGlobe: '1', pRadar: '1', pTicker: '1', pEdges: '1', pBoot: '1', ttsStyle: 'jarvis' };
  function configDoctor() {
    const fixed = [];
    for (const [k, vals] of Object.entries(VALID)) {
      const v = store.get('set.' + k, null); if (v === null || vals.includes(String(v))) continue;
      store.set('set.' + k, DEF[k]); const n = $(k); if (n) n.value = DEF[k]; fixed.push(k);
    }
    const tv = store.get('set.ttsVoice', null); if (tv && !/^[A-Z][a-z]+$/.test(tv)) { store.set('set.ttsVoice', 'Charon'); fixed.push('ttsVoice'); }
    const pt = store.get('set.pcToken', ''); if (pt && /\s/.test(pt)) { store.set('set.pcToken', pt.replace(/\s+/g, '').toUpperCase()); fixed.push('pcToken'); }
    if (fixed.length) { learn('Ayar doktoru', 'Geçersiz ayar düzeltildi: ' + fixed.join(', ')); return 'onarıldı'; }
    return 'ok';
  }

  /* ========== 8) ÖZ-TEST + YUMUŞAK YENİDEN BAŞLATMA ========== */
  let fails = 0;
  const TESTS = [
    ['depolama', () => { localStorage.setItem('jarvisapp.__t', '"1"'); return localStorage.getItem('jarvisapp.__t') === '"1"'; }],
    ['arayüz', () => ['prompt', 'send', 'mic', 'feed', 'drawer'].every(id => $(id))],
    ['çekirdek işlevler', () => [think, api, localCommand, instructions, setPhase, pcCall, typedTurn].every(f => typeof f === 'function')],
    ['ses motoru', () => typeof voiceSession?.stop === 'function'],
    ['istem üretimi', () => { const s = instructions(false); B.promptLen = s.length; return typeof s === 'string' && s.length > 200; }],
    ['metin işleme', () => fold('İŞLEM') === 'islem']
  ];
  function selfTest() {
    const bad = TESTS.filter(([, f]) => { try { return !f(); } catch { return true; } }).map(([n]) => n);
    B.lastTest = { t: NOW(), bad }; save();
    if (!bad.length) { fails = 0; return 'ok'; }
    fails++;
    if (fails >= 2 && idle(3 * MIN)) {
      const lastR = Number(sessionStorage.getItem('jarvis.healReloadAt') || 0);
      if (NOW() - lastR > HOUR) { sessionStorage.setItem('jarvis.healReloadAt', String(NOW())); sessionStorage.setItem('jarvis.healReason', bad.join(', ')); learn('Öz-test', 'Bozuk: ' + bad.join(', ') + ' → SATÜRN kendini yeniden başlattı.'); store.set('brain', B); location.reload(); }
    }
    return 'sorun';
  }
  const why = sessionStorage.getItem('jarvis.healReason');
  if (why) { sessionStorage.removeItem('jarvis.healReason'); setTimeout(() => note('Kendimi yeniden başlattım (bozuk bulunan: ' + why + '). Her şey yeniden yüklendi.'), 3000); }

  /* ========== 9) GÜNCELLEYİCİ (yeni sürüm yayınlanınca boştayken kendini yeniler) ========== */
  const myV = (document.querySelector('script[src*="brain.js"]')?.src.match(/v=([\w.]+)/) || [])[1] || '';
  async function updater() {
    if (!myV || !navigator.onLine) return 'atla';
    const html = await fetch('index.html?u=' + NOW(), { cache: 'no-store' }).then(r => (r.ok ? r.text() : ''));
    const v = (html.match(/brain\.js\?v=([\w.]+)/) || [])[1];
    if (!v || v === myV) return 'ok';
    if (sessionStorage.getItem('jarvis.updTried') === v) return 'sorun';
    if (!idle(2 * MIN)) { mark('guncelle', 'sorun', `yeni sürüm ${v} hazır; boşta kalınca kurulacak`); return 'sorun'; }
    sessionStorage.setItem('jarvis.updTried', v); learn('Güncelleyici', `${myV} → ${v} sürümüne geçildi.`); store.set('brain', B);
    try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch {}
    location.reload(); return 'ok';
  }

  /* ========== 10) MİMAR (günde en çok 1 yapay zekâ çağrısı) ========== */
  const SAFE = { power: VALID.power, pGlobe: ['0', '1'], pRadar: ['0', '1'], pTicker: ['0', '1'], pEdges: ['0', '1'], pBoot: ['0', '1'], ttsStyle: VALID.ttsStyle.filter(Boolean), budget: VALID.budget };
  function telemetry() {
    const met = store.get('metrics', {}), errs = (store.get('appErrors', []) || []).slice(-8).map(e => e.m), heal = (store.get('healLog', []) || []).slice(-8).map(h => h.ajan + ': ' + h.mesaj);
    return {
      cihaz: /iphone|ipad|android/i.test(navigator.userAgent) ? 'telefon' : 'bilgisayar', surum: myV,
      modeller: Object.fromEntries(Object.entries(B.models).map(([m, h]) => [m, { basarili: h.ok, hata: h.fail, gecikme_ms: h.lat, bugun: h.used, ogrenilen_sinir: h.limit || null, dinlenmede: h.cool > NOW() }])),
      bugunku_istek: met.calls, ort_yanit_ms: met.ms?.length ? Math.round(met.ms.reduce((a, b) => a + b, 0) / met.ms.length) : null,
      arizali_araclar: B.tools, fps: P.last, istem_uzunlugu: B.promptLen, oz_test: B.lastTest?.bad, uygulama_hatalari: errs, onarimlar: heal,
      ayarlar: Object.fromEntries(Object.keys(SAFE).map(k => [k, store.get('set.' + k, DEF[k])])), nobet: window.jarvisNobet || null, ogrenilenler: B.learn.slice(-10).map(l => l.ajan + ': ' + l.mesaj)
    };
  }
  async function architect(force) {
    if (!force && (store.get('set.brainAi', '1') === '0' || (B.arch && B.arch.day === ptDay()) || !idle(MIN))) return B.arch ? 'ok' : 'atla';
    const sys = 'Sen SATÜRN uygulamasının MİMAR ajanısın. Ölçümleri incele; sorunları bul ve uygulamayı daha hızlı, kararlı ve kotaya dayanıklı yapmak için ayar öner. YALNIZCA JSON yaz: {"ozet":"2 cümle Türkçe durum","oneriler":[{"ayar":"...","deger":"...","neden":"kısa"}],"ipuclari":["Beyhan için en fazla 3 kısa öneri"]}. Ayar yalnız şunlardan olabilir: ' + JSON.stringify(SAFE) + '. Gereksiz değişiklik önerme; her şey iyiyse oneriler boş olsun.';
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ tier: 'quick', system: sys, messages: [{ role: 'user', content: JSON.stringify(telemetry()) }] }) });
    if (!r.ok) throw Error('mimar yanıt alamadı (' + r.status + ')');
    const text = (await r.text()).replace(/\u0000[^\n]*$/s, '');
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    const applied = [];
    for (const o of (j.oneriler || []).slice(0, 4)) {
      const k = String(o.ayar || ''), v = String(o.deger ?? '');
      if (!SAFE[k]?.includes(v)) continue;
      const old = String(store.get('set.' + k, DEF[k])); if (old === v) continue;
      const n = $(k); store.set('set.' + k, v); if (n) { n.value = v; n.dispatchEvent(new Event('change')); }
      applied.push({ k, v, old, neden: short(o.neden || '', 120) });
    }
    B.arch = { day: ptDay(), t: NOW(), ozet: short(j.ozet || '', 400), ipuclari: (j.ipuclari || []).slice(0, 3).map(x => short(x, 200)), applied };
    learn('Mimar', (B.arch.ozet || 'Analiz tamam.') + (applied.length ? ' Uygulanan: ' + applied.map(a => `${a.k}=${a.v}`).join(', ') : ''));
    if (applied.length) note('Mimar ajanı ayarları yeniden yapılandırdı: ' + applied.map(a => `${a.k} → ${a.v} (${a.neden})`).join('; '), () => { for (const a of applied) { store.set('set.' + a.k, a.old); const n = $(a.k); if (n) { n.value = a.old; n.dispatchEvent(new Event('change')); } } });
    save(); return 'ok';
  }

  /* ========== zamanlayıcı ========== */
  const AGENTS = [
    { id: 'yonlendirici', ad: 'Model yönlendirici', her: 30000, run: () => { const live = Object.entries(B.models).filter(([m]) => !isTts(m)); const c = live.filter(([m]) => cooled(m)).length; mark('yonlendirici', c ? 'sorun' : 'ok', live.length ? `${live.length} model izleniyor${c ? ', ' + c + ' dinlenmede' : ''}` : 'ilk istek bekleniyor'); } },
    { id: 'kota', ad: 'Kota koruyucu', her: 30000, run: () => { const e = economy(); mark('kota', e ? 'sorun' : 'ok', e ? 'sınır yakın: tasarruf modu' : `bugün ${Object.values(B.models).filter(h => h.day === ptDay()).reduce((s, h) => s + h.used, 0)} istek · ${B.saved} istek kurtarıldı`); } },
    { id: 'ses', ad: 'Ses yönlendirici', her: 30000, run: () => { const t = Object.entries(B.models).filter(([m]) => isTts(m)); const c = t.filter(([m]) => cooled(m)).length; mark('ses', c && c === t.length ? 'sorun' : 'ok', t.length ? `${t.length} ses modeli${c ? ', ' + c + ' dinlenmede (cihaz sesi devrede)' : ''}` : 'ilk ses bekleniyor'); } },
    { id: 'tekrar', ad: 'Tekrar önleyici', her: 30000, run: () => { if (ST.tekrar?.durum !== 'onarıldı' || NOW() - ST.tekrar.t > 5 * MIN) mark('tekrar', 'ok', `${cache.size} yanıt 2 dk tutuluyor`); } },
    { id: 'arac', ad: 'Araç doktoru', her: 60000, run: () => { const s = toolDoctor(); mark('arac', s, s === 'ok' ? 'bütün araçlar sağlıklı' : 'arızalı: ' + Object.keys(B.tools).join(', ')); } },
    { id: 'performans', ad: 'Performans ayarcısı', her: 60000, run: async () => { const s = await perfTuner(); mark('performans', s, P.last ? P.last + ' FPS' + (P.auto ? ' · tasarruf görünümü' : '') : 'ekran gizli'); } },
    { id: 'ayar', ad: 'Ayar doktoru', her: 5 * MIN, run: () => { const s = configDoctor(); mark('ayar', s, s === 'ok' ? 'ayarlar geçerli' : 'düzeltildi'); } },
    { id: 'oztest', ad: 'Öz-test', her: 5 * MIN, run: () => { const s = selfTest(); mark('oztest', s, s === 'ok' ? `${TESTS.length}/${TESTS.length} test geçti` : 'bozuk: ' + B.lastTest.bad.join(', ')); } },
    { id: 'istem', ad: 'İstem ölçer', her: 10 * MIN, run: () => { const n = B.promptLen || 0; mark('istem', n > 30000 ? 'sorun' : 'ok', n ? `${Math.round(n / 1000)} bin karakter${n > 30000 ? ' — hafıza çok büyüdü, eski kayıtları arşivle' : ''}` : '—'); } },
    { id: 'guncelle', ad: 'Güncelleyici', her: 3 * HOUR, run: async () => { const s = await updater(); if (s !== 'sorun') mark('guncelle', s, s === 'ok' ? 'güncel · ' + myV : 'çevrimdışı'); } },
    { id: 'mimar', ad: 'Mimar (günde 1 yapay zekâ çağrısı)', her: 30 * MIN, run: async () => { const s = await architect(); mark('mimar', s, B.arch ? `son analiz ${dateTR(B.arch.t)}` : store.get('set.brainAi', '1') === '0' ? 'kapalı' : 'bugün boşta kalınca çalışacak'); } }
  ];
  const last = {};
  async function tick() {
    for (const a of AGENTS) {
      if (NOW() - (last[a.id] || 0) < a.her) continue;
      last[a.id] = NOW();
      try { await a.run(); } catch (e) { mark(a.id, 'atla', 'çalışamadı: ' + short(e.message, 80)); }
    }
    render();
  }
  setTimeout(tick, 9000); setInterval(tick, 15000);

  /* ========== NÖBET panelinde BEYİN bölümü ========== */
  const aiSel = el('select', { id: 'brainAi' }); aiSel.append(new Option('Açık · günde en çok 1 kısa yapay zekâ çağrısı', '1'), new Option('Kapalı · yalnız kural tabanlı ajanlar', '0'));
  aiSel.value = store.get('set.brainAi', '1') || '1'; aiSel.onchange = () => store.set('set.brainAi', aiSel.value);
  const box = el('div', { id: 'brainBox', class: 'brainbox' },
    el('h3', {}, 'BEYİN · SATÜRN’İ ONARAN AJANLAR'), el('p', { class: 'muted' }, 'Bu ajanlar kota harcamaz: ölçer, öğrenir, kurallarla karar verir. Yalnız Mimar günde bir kez yapay zekâya danışır.'),
    el('ul', { class: 'list', id: 'brAgents' }),
    el('h3', {}, 'MODEL SAĞLIĞI'), el('div', { class: 'kvs', id: 'brModels' }),
    el('h3', {}, 'MİMAR RAPORU'), el('div', { id: 'brArch', class: 'muted' }),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: async e => { e.target.disabled = true; try { await architect(true); note('Mimar analizi tamam: ' + (B.arch?.ozet || '')); } catch (x) { note(x.message); } e.target.disabled = false; render(); } }, 'Mimarı şimdi çalıştır'),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => { for (const h of Object.values(B.models)) { h.cool = 0; h.strikes = 0; } save(); note('Bütün modeller dinlenmeden çıkarıldı.'); } }, 'Modelleri sıfırla')),
    el('h3', {}, 'ÖĞRENİLENLER'), el('ul', { class: 'list', id: 'brLearn' }),
    field('brainAi', 'Mimar ajanı', aiSel));
  ($('p-nobet') || $('p-settings')).prepend(box);
  const IC = { ok: ['✓', 'ok'], sorun: ['!', 'bad'], atla: ['–', 'off'], 'onarıldı': ['↻', 'ok'] };
  function render() {
    if (!$('brAgents')) return;
    $('brAgents').replaceChildren(...AGENTS.map(a => { const s = ST[a.id] || { durum: 'atla', mesaj: 'bekliyor' }; const [i, c] = IC[s.durum] || IC.atla; return el('li', { class: 'item' }, el('span', { class: 'nbd ' + c }, i), el('div', {}, el('p', {}, a.ad), el('small', {}, s.mesaj || s.durum)), el('span')); }));
    const ms = Object.entries(B.models);
    $('brModels').replaceChildren(...(ms.length ? ms.flatMap(([m, h]) => [el('span', {}, m.replace('gemini-', '')), el('b', {}, `${h.cool > NOW() ? '⏸ ' + (h.coolWhy || '') + ' · ' : ''}${h.ok}✓ ${h.fail}✗ · ${h.lat || '—'} ms · bugün ${h.day === ptDay() ? h.used : 0}${h.limit ? '/' + h.limit : ''}`)]) : [el('span', {}, 'Henüz ölçüm yok'), el('b', {}, '—')]));
    $('brArch').replaceChildren(B.arch ? el('div', {}, el('p', {}, B.arch.ozet || '—'), ...(B.arch.ipuclari || []).map(x => el('p', {}, '• ' + x)), B.arch.applied?.length ? el('small', {}, 'Uygulanan: ' + B.arch.applied.map(a => `${a.k} ${a.old}→${a.v}`).join(', ')) : null) : 'Henüz çalışmadı.');
    $('brLearn').replaceChildren(...(B.learn.length ? [...B.learn].reverse().slice(0, 15).map(l => el('li', { class: 'item' }, el('span', {}, '◆'), el('div', {}, el('p', {}, el('b', {}, l.ajan + ': '), l.mesaj), el('small', {}, dateTR(l.t))), el('span'))) : [el('li', { class: 'muted' }, 'Henüz bir şey öğrenilmedi.')]));
  }
  const _rt = window.jarvisTickerExtra;
  window.jarvisTickerExtra = (prev => () => [...(prev?.() || []), ...[`BEYİN ${AGENTS.length} AJAN · ${B.saved} İSTEK KURTARILDI${economy() ? ' · KOTA TASARRUFU' : ''}`, ...(_rt?.() || [])]])(window.jarvisTickerExtra);
  window.jarvisBrain = { B, AGENTS, ST, tick, architect, economy };
  render();
})();
