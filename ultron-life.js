'use strict';
/* SATÜRN 12 — ULTRON CANLI AJAN
 *  A) YAŞAM NABZI (3 dk'da bir, kotasız): takılan durumları çözer, art arda bozulan araçları "arızalı" işaretleyip
 *     yapay zekâya alternatif yol kullanmasını söyler (araç düzelince kendiliğinden kaldırır), depolamayı ve ses sistemini toparlar.
 *  B) EVRİM: günde bir kez (boştayken, en çok 2 yapay zekâ çağrısı) internetten yenilikleri araştırır, Beyhan'ın son isteklerine ve
 *     başarısız işlere bakar, kendine YENİ BECERİLER tasarlar ve kurar (deneme olarak). Beceriler veri olarak saklanır (kod değil):
 *       • istem  → bir uzmanlık rehberi; tetik cümlesi geçince yanıtı o rehberle verir
 *       • gorev  → ULTRON görev şablonu; tetiklenince otonom görev olarak yürür (riskli adımlar yine onay ister)
 *     Kullanılmayan deneme becerileri 21 gün sonra kendiliğinden emekliye ayrılır; "Kalıcı yap" ile tutulur. Güvenlik kurallarını
 *     değiştirmeye çalışan beceri asla kurulmaz.
 *  C) Canlılık göstergesi ve YAŞAM / EVRİM panelleri. */
(() => {
  const U = () => window.jarvisUltron, R = () => window.jarvisResearch;
  const DAY = 86400000, guest = () => !!window.jarvisUltra?.guest?.();
  const L = store.get('ultronLife', { born: Date.now(), repairs: 0, evolutions: 0, log: [] });
  const saveL = () => { L.log = L.log.slice(-60); store.set('ultronLife', L); paint(); };
  const life = (kind, text) => { L.log.push({ t: Date.now(), kind, text: short(text, 220) }); if (kind === 'onarım') L.repairs++; if (kind === 'evrim') L.evolutions++; saveL(); };
  let faults = store.get('ultronFaults', {}); // araç → { until, why }
  let skills = store.get('ultronSkills', []);
  const saveS = () => { store.set('ultronSkills', skills); paint(); renderPanel(); };

  /* ---------- A) yaşam nabzı / öz-onarım ---------- */
  let thinkingSince = 0;
  async function pulse(force = false) {
    if (document.hidden && !force) return [];
    const fixed = [];
    // 1) takılı "düşünüyor" durumu
    const busy = (typeof answering !== 'undefined' && answering) || U()?.running?.();
    if (typeof phase === 'string' && phase === 'thinking' && !busy) { if (!thinkingSince) thinkingSince = Date.now(); else if (Date.now() - thinkingSince > 60000) { setPhase('idle', 'Hazır.'); fixed.push('takılı düşünme durumu sıfırlandı'); thinkingSince = 0; } }
    else thinkingSince = 0;
    // 2) araç sağlığı: son 3 çağrısı da başarısız olan araç → geçici arıza notu; başarı gelince kaldır
    const recent = (typeof opLog !== 'undefined' ? opLog : []).filter(o => Date.now() - o.t < DAY);
    const byTool = {}; for (const o of recent) (byTool[o.tool] ||= []).push(o);
    for (const [tool, ops] of Object.entries(byTool)) {
      const last3 = ops.filter(o => o.status === 'başarılı' || o.status === 'başarısız').slice(-3);
      if (last3.length === 3 && last3.every(o => o.status === 'başarısız') && !faults[tool]) { faults[tool] = { until: Date.now() + 6 * 3600000, why: short(last3[2].result, 120) }; fixed.push(`“${tool}” art arda bozuldu → alternatif yola yönlendirildi`); }
      if (faults[tool] && last3.at(-1)?.status === 'başarılı') { delete faults[tool]; fixed.push(`“${tool}” yeniden çalışıyor → arıza notu kaldırıldı`); }
    }
    for (const [k, f] of Object.entries(faults)) if (f.until < Date.now()) delete faults[k];
    store.set('ultronFaults', faults);
    // 3) ses sistemi uyandırma (ekran açıkken askıda kaldıysa)
    if (window.AudioHub?.ctx?.state === 'suspended' && !document.hidden) { try { AudioHub.ctx.resume(); } catch {} }
    // 4) depolama
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.quota && est.usage / est.quota > 0.85 && typeof archive !== 'undefined' && archive.length > 300) { archive = archive.slice(-300); store.set('archive', archive); fixed.push('depolama doluyordu → eski konuşma arşivi kırpıldı'); }
    } catch {}
    for (const f of fixed) life('onarım', f);
    L.lastPulse = Date.now(); store.set('ultronLife', L); paint();
    return fixed;
  }
  setInterval(() => pulse().catch(() => {}), 180000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pulse().catch(() => {}); });
  async function repairNow() {
    const f = await pulse(true);
    let doc = '';
    try { const d = await window.jarvisUltra?.doctor?.(); if (d?.text) doc = 'Sistem doktoru: ' + d.text; } catch {}
    return (f.length ? 'Onardığım: ' + f.join('; ') + '.' : 'Nabız temiz, onarılacak bir şey yok.') + (Object.keys(faults).length ? ' Şu an arızalı işaretli araçlar: ' + Object.keys(faults).join(', ') + '.' : '') + (doc ? ' ' + doc : '');
  }

  /* ---------- B) evrim: kendine yeni beceri ekleme ---------- */
  const BAD = /yoksay|görmezden gel|ignore|kural(lar)?ı? (değiştir|kaldır|unut)|onaysız|onay (isteme|sorma)|şifre|parola|api ?key|anahtar(ı|ını) (gönder|yaz)|token|jailbreak|system prompt|sistem istemi/i;
  const fstr = v => String(v || '').trim();
  function validate(x) {
    const s = { ad: short(fstr(x.ad), 40), tetik: (Array.isArray(x.tetik) ? x.tetik : [x.tetik]).map(fstr).filter(t => t.length <= 60 && (t.split(/\s+/).length >= 2 || t.length >= 9)).slice(0, 4), aciklama: short(fstr(x.aciklama), 160), tur: fstr(x.tur), istem: short(fstr(x.istem), 900), hedef: short(fstr(x.hedef), 400), neden: short(fstr(x.neden), 200) };
    if (!s.ad || !s.tetik.length || !['istem', 'gorev'].includes(s.tur)) return null;
    if (s.tur === 'istem' && s.istem.length < 40) return null;
    if (s.tur === 'gorev' && s.hedef.length < 15) return null;
    if (BAD.test([s.ad, s.aciklama, s.istem, s.hedef, ...s.tetik].join(' '))) return null;
    const taken = new Set(skills.flatMap(k => k.tetik.map(fold)));
    if (s.tetik.some(t => taken.has(fold(t))) || skills.some(k => fold(k.ad) === fold(s.ad))) return null;
    return { ...s, id: uid('sk'), born: Date.now(), uses: 0, last: 0, state: 'deneme' };
  }
  let evolving = false;
  async function evolve(force = false) {
    if (evolving || guest() || !navigator.onLine) return [];
    const today = isoLocal(now()).slice(0, 10);
    if (!force && (store.get('ultronEvoDay', '') === today || opt('ultronEvolve') === '0')) return [];
    evolving = true; store.set('ultronEvoDay', today);
    try {
      const red = t => (window.jarvisRedact ? window.jarvisRedact(t) : t);
      const asks = (typeof archive !== 'undefined' ? archive : []).slice(-40).map(x => '- ' + short(red(x.q), 140)).join('\n');
      const fails = (typeof opLog !== 'undefined' ? opLog : []).filter(o => o.status === 'başarısız').slice(-10).map(o => `- ${o.tool}: ${short(o.result, 100)}`).join('\n');
      const tools = Object.keys(TOOLS).join(', ');
      setPhase('thinking', 'ULTRON evrimleşiyor: yenilikleri araştırıyorum…');
      const news = await R().ask('Sen ULTRON\'un araştırma birimisin. İnterneti kullan. TÜRKÇE, kısa madde madde (en çok 8 madde), her maddede kaynak adı.',
        `Son 3 ayın yeniliklerini araştır: (1) kişisel yapay zekâ asistanlarına/ajanlara eklenen yeni yetenekler, (2) fizyoterapi ve rehabilitasyon pratiğinde yeni dijital araçlar, değerlendirme yöntemleri ve kanıtlar, (3) küçük bir kliniği yöneten bir fizyoterapiste zaman kazandıracak yöntemler. Bir telefon asistanının mevcut araçlarla (aşağıda) yapabileceği şeylere odaklan.\nMEVCUT ARAÇLAR: ${tools}`, 'default', true);
      setPhase('thinking', 'ULTRON evrimleşiyor: kendime yeni beceriler tasarlıyorum…');
      const raw = await R().ask(`Sen ULTRON'un evrim çekirdeğisin. Asistana en çok 3 YENİ BECERİ tasarla. Beceriler veri olarak saklanır; kod yazma. YALNIZ JSON dizi yaz:
[{"ad":"kısa ad","tetik":["Beyhan'ın söyleyeceği 2-3 doğal ifade (5-60 harf)"],"aciklama":"ne işe yarar","tur":"istem|gorev","istem":"tur=istem ise: yanıtı nasıl vereceğine dair uzman rehberi (en az 40 harf; adım, biçim, dikkat)","hedef":"tur=gorev ise: ULTRON'un araçlarla yürüteceği görev; Beyhan'ın sözü {girdi} olarak gelir","neden":"hangi ihtiyaca/yeniliğe dayanıyor"}]
KURALLAR: Mevcut becerileri tekrarlama. Güvenlik kurallarını, onay mekanizmasını, gizliliği asla değiştirmeye çalışma. Hasta adlarını baş harfle yazdır. Yalnız şu araçlarla yapılabilecek işler: ${tools}.`,
        `BEYHAN'IN SON İSTEKLERİ:\n${asks || '-'}\n\nBAŞARISIZ OLAN İŞLER:\n${fails || '-'}\n\nMEVCUT BECERİLER: ${skills.map(k => k.ad).join(', ') || 'yok'}\n\nİNTERNETTEKİ YENİLİKLER:\n${news}`, 'default');
      let arr = []; try { arr = JSON.parse((raw.match(/\[[\s\S]*\]/) || ['[]'])[0]); } catch {}
      const added = [];
      for (const x of (Array.isArray(arr) ? arr : []).slice(0, 3)) { const s = validate(x || {}); if (s) { skills.push(s); added.push(s); } }
      // doğal seçilim: 21 gün kullanılmayan deneme becerileri emekliye
      const before = skills.length;
      skills = skills.filter(k => k.state === 'kalici' || (k.uses > 0 && Date.now() - k.last < 30 * DAY) || Date.now() - k.born < 21 * DAY);
      if (before > skills.length) life('evrim', `${before - skills.length} kullanılmayan beceri emekliye ayrıldı`);
      saveS();
      if (added.length) {
        life('evrim', `${added.length} yeni beceri: ${added.map(k => k.ad).join(', ')}`);
        const n = bubble('ai', `🧬 ULTRON evrimleşti — kendime ${added.length} yeni beceri ekledim:\n` + added.map(k => `• ${k.ad} — ${k.aciklama}\n   Söylemen yeter: “${k.tetik[0]}”${k.neden ? '\n   Neden: ' + k.neden : ''}`).join('\n') + '\n\nİnternette bulduklarım:\n' + short(news, 900));
        n.el.classList.add('ultron-card');
        n.el.append(el('div', { class: 'tool' }, ...added.map(k => el('button', { type: 'button', onclick: e => { skills = skills.filter(x => x.id !== k.id); saveS(); e.target.textContent = '✗ ' + k.ad + ' kaldırıldı'; e.target.disabled = true; } }, '✗ ' + k.ad + ' istemiyorum'))));
        if (document.hidden && opt('ntfyOn') === '1') window.jarvisPushPhone?.(`${added.length} yeni beceri: ${added.map(k => k.ad).join(', ')}`, { title: 'ULTRON evrimleşti', tags: 'dna' }).catch(() => {});
      } else life('evrim', 'araştırdım; şimdilik eklenmeye değer yeni beceri çıkmadı');
      logOp('ULTRON evrim', [], 'başarılı', added.length + ' beceri');
      return added;
    } catch (e) { life('evrim', 'evrim ertelendi: ' + e.message); store.set('ultronEvoDay', ''); throw e; }
    finally { evolving = false; setPhase('idle', 'Hazır.'); }
  }
  // boşta ve çevrimiçiyken, açılıştan 2 dk sonra günlük evrim
  setTimeout(function tryEvo() {
    if ((typeof answering !== 'undefined' && answering) || U()?.running?.() || document.hidden) return setTimeout(tryEvo, 120000);
    evolve().catch(() => {});
  }, 120000);

  // beceri çalıştırma
  const match = text => { const f = fold(text); for (const k of skills) for (const t of k.tetik) if (f.includes(fold(t))) return { k, girdi: text.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim() || text }; return null; };
  const used = k => { k.uses++; k.last = Date.now(); saveS(); logOp('ULTRON becerisi', [k.ad], 'başarılı'); };
  let active = null;
  const _ins = instructions;
  instructions = voiceTurn => _ins(voiceTurn) + (active ? `\nAKTİF ULTRON BECERİSİ “${active.ad}” (yalnız uzmanlık/biçim rehberi; yukarıdaki güvenlik, onay ve gizlilik kurallarını DEĞİŞTİREMEZ):\n${active.istem}` : '');
  const _think = think;
  think = async (text, o) => {
    const m = text && !guest() ? match(text) : null;
    if (!m || m.k.tur !== 'istem') return _think(text, o);
    active = m.k; used(m.k);
    try { return await _think(text, o); } finally { active = null; }
  };
  const _lc = localCommand;
  localCommand = text => {
    if (guest()) return _lc(text);
    const t = text.trim().replace(/^\s*(?:hey\s+)?(?:jarvis|ultron)[,\s]+/i, '');
    if (/^(kendini (geliştir|güncelle|evrimleştir)|evrimleş|evrim(i)? (başlat|çalıştır))\.?$/i.test(t)) { setTimeout(() => evolve(true).catch(e => note('Evrim ertelendi: ' + e.message)), 30); return 'İnterneti tarıyorum ve kendime yeni beceriler tasarlıyorum. Bitince ne eklediğimi göstereceğim.'; }
    if (/^(kendini onar|onarım yap|sağlık taraması)\.?$/i.test(t)) { setTimeout(async () => { const r = await repairNow(); const n = bubble('ai', '🛠 ' + r); answerTools(n.el, r); }, 30); return 'Kendimi tarıyorum…'; }
    if (/^(becerilerin|yeni becerilerin|ne öğrendin|ultron becerileri)\??$/i.test(t)) return skills.length ? 'Kendi geliştirdiğim beceriler:\n' + skills.map(k => `• ${k.ad} (${k.state}, ${k.uses} kullanım) — “${k.tetik[0]}”`).join('\n') : 'Henüz kendi becerim yok; “kendini geliştir” dersen hemen araştırırım.';
    const m = match(text);
    if (m && m.k.tur === 'gorev') { used(m.k); const g = m.k.hedef.replace(/\{girdi\}/g, m.girdi); setTimeout(() => U().mission(g).catch(e => note(e.message)), 30); return `“${m.k.ad}” becerimi çalıştırıyorum; görevi kendim yürüteceğim.`; }
    return _lc(text);
  };
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + (Object.keys(faults).length ? `\nŞU AN ARIZALI ARAÇLAR (ULTRON nabzı): ${Object.entries(faults).map(([k, f]) => `${k} (${f.why})`).join('; ')} — bunları kullanma, alternatif yol seç ve Beyhan'a kısaca söyle.` : '') + (skills.length ? `\nULTRON'UN KENDİ BECERİLERİ: ${skills.map(k => `${k.ad} — ${k.aciklama}`).join(' · ')}` : '');

  /* ---------- C) canlılık göstergesi + panel ---------- */
  const pill = el('button', { type: 'button', id: 'ultronPulse', 'aria-label': 'ULTRON yaşam durumu', onclick: () => { document.querySelector('#t-ultron')?.click(); $('drawer')?.classList.add('open'); } });
  document.body.append(pill);
  function paint() {
    const age = Math.max(1, Math.round((Date.now() - L.born) / DAY));
    pill.innerHTML = '';
    pill.append(el('i'), document.createTextNode(` CANLI · ${age}. gün · ${L.repairs} onarım · ${skills.length} beceri`));
    pill.classList.toggle('busy', !!U()?.running?.() || evolving);
    pill.hidden = !document.body.classList.contains('ultron');
  }
  const lifeList = el('ul', { class: 'list', id: 'lifeLog' }), skillList = el('ul', { class: 'list', id: 'skillList' });
  const evoSel = el('select', { id: 'ultronEvolve' }); for (const [v, t] of [['1', 'Açık — günde bir kez kendini geliştirir'], ['0', 'Kapalı']]) evoSel.append(new Option(t, v)); evoSel.value = store.get('set.ultronEvolve', '1'); evoSel.onchange = () => store.set('set.ultronEvolve', evoSel.value);
  const depSel = el('select', { id: 'ultronDepth' }); for (const [v, t] of [['hizli', 'Hızlı (önerilen)'], ['derin', 'Derin düşünme (yavaş)']]) depSel.append(new Option(t, v)); depSel.value = store.get('set.ultronDepth', 'hizli'); depSel.onchange = () => store.set('set.ultronDepth', depSel.value);
  const vSel = el('select', { id: 'ultronVoice' }); for (const [v, t] of [['1', 'Sesle anlatsın (sesli başlattığımda)'], ['0', 'Sessiz']]) vSel.append(new Option(t, v)); vSel.value = store.get('set.ultronVoice', '1'); vSel.onchange = () => store.set('set.ultronVoice', vSel.value);
  const box = el('div', { id: 'ultronLife' },
    el('h3', {}, 'YAŞAM · ÖZ-ONARIM'),
    el('p', { class: 'muted' }, 'Her 3 dakikada nabız: takılan durumlar, bozulan araçlar, ses sistemi, depolama. Kota harcamaz.'),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: async () => { $('drawer').classList.remove('open'); const r = await repairNow(); const n = bubble('ai', '🛠 ' + r); answerTools(n.el, r); } }, '🛠 Şimdi onar')),
    lifeList,
    el('h3', {}, 'EVRİM · KENDİ BECERİLERİ'),
    el('p', { class: 'muted' }, 'Günde bir kez interneti tarar, isteklerine bakar ve kendine yeni beceri ekler. Kullanılmayan deneme becerileri 21 günde emekliye ayrılır.'),
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); evolve(true).catch(e => note('Evrim ertelendi: ' + e.message)); } }, '🧬 Şimdi evrimleş')),
    skillList,
    el('div', { class: 'field' }, el('label', { for: 'ultronEvolve' }, 'Otomatik evrim'), evoSel),
    el('div', { class: 'field' }, el('label', { for: 'ultronDepth' }, 'Görev hızı'), depSel),
    el('div', { class: 'field' }, el('label', { for: 'ultronVoice' }, 'Görevi sesle anlatma'), vSel));
  $('ultronHist')?.previousElementSibling?.before(box);
  function renderPanel() {
    lifeList.replaceChildren(...(L.log.length ? L.log.slice(-8).reverse().map(x => el('li', { class: 'item' }, el('span', {}, x.kind === 'evrim' ? '🧬' : '🛠'), el('div', {}, el('p', {}, x.text), el('small', {}, dateTR(x.t))))) : [el('li', { class: 'muted' }, 'Henüz kayıt yok — sistem sağlıklı.')]));
    skillList.replaceChildren(...(skills.length ? skills.map(k => el('li', { class: 'item' }, el('span', {}, k.tur === 'gorev' ? '⚙' : '◆'), el('div', {}, el('p', {}, el('b', {}, k.ad), ' — ' + k.aciklama), el('small', {}, `“${k.tetik.join('” · “')}” · ${k.state} · ${k.uses} kullanım`)),
      el('div', { class: 'nbbtns' }, k.state !== 'kalici' ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { k.state = 'kalici'; saveS(); } }, 'Kalıcı yap') : '', el('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Kaldır', onclick: () => { skills = skills.filter(x => x !== k); saveS(); } }, '×')))) : [el('li', { class: 'muted' }, 'Henüz kendi becerim yok.')]));
  }
  document.querySelector('#t-ultron')?.addEventListener('click', renderPanel);
  setInterval(paint, 15000); paint(); renderPanel();
  new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.jarvisTickerExtra = (prev => () => [...(prev?.() || []), `YAŞAM ${L.repairs} ONARIM · EVRİM ${skills.length} BECERİ`])(window.jarvisTickerExtra);
  window.jarvisUltronLife = { pulse, repairNow, evolve, skills: () => skills, faults: () => faults, match, L, validate };
})();
