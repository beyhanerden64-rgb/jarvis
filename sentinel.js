'use strict';
/* JARVIS 7 — NÖBET: kendi kendini onaran ajanlar.
 * 1) Uygulama içi nöbetçiler (uygulama açıkken 20 sn'de bir): hata yakalama, takılan düşünme/konuşma/dinleme,
 *    bozuk kayıt, depolama doluluğu, servis çalışanı, ağ, yardımcı bağlantısı, ekran şişmesi — güvenli olanı kendisi onarır.
 * 2) Bilgisayar nöbetçileri (yardımcıda 7/24, uygulama kapalıyken de): NÖBET sekmesinde durum, olaylar, onay/ret.
 * Diğer dosyalarla aynı genel kapsamı paylaşır. */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const HEAL = []; // {t, ajan, mesaj, durum}
  const healLog = (ajan, mesaj, durum = 'onarıldı') => { HEAL.push({ t: Date.now(), ajan, mesaj, durum }); if (HEAL.length > 80) HEAL.shift(); store.set('healLog', HEAL.slice(-40)); render(); };
  try { HEAL.push(...(store.get('healLog', []) || []).filter(x => Date.now() - x.t < 3 * 86400000)); } catch {}
  let pc = null, pcErr = '', pcAt = 0;

  /* ---------- 1) uygulama içi nöbetçiler ---------- */
  const errs = [];
  const onErr = (msg, src) => {
    const m = short(String(msg || 'bilinmeyen hata'), 160);
    if (/ResizeObserver|Script error\.?$|AbortError|aborted/i.test(m)) return; // zararsız tarayıcı gürültüsü
    errs.push({ t: Date.now(), m, src }); if (errs.length > 50) errs.shift();
    store.set('appErrors', errs.slice(-30));
  };
  window.addEventListener('error', e => onErr(e.message, (e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', e => onErr(e.reason?.message || e.reason, 'söz'));

  const since = { phase: 'idle', t: Date.now() };
  const AGENTS = [
    { id: 'hata', ad: 'Hata yakalayıcı', run: () => { const recent = errs.filter(e => Date.now() - e.t < 60000); if (recent.length >= 5) { healLog('Hata yakalayıcı', `Son 1 dakikada ${recent.length} hata: ${recent.at(-1).m}`, 'izleniyor'); errs.length = 0; return 'sorun'; } return 'ok'; } },
    { id: 'dusunme', ad: 'Takılan düşünme', run: () => {
      if (phase === 'thinking' && !answering && Date.now() - since.t > 45000) { setPhase('idle', 'Hazır.'); healLog('Takılan düşünme', 'Ekran “düşünüyorum”da kalmıştı; sıfırlandı.'); return 'onarıldı'; }
      if (answering && Date.now() - since.t > 300000 && phase === 'thinking') { try { controller?.abort(); } catch {} answering = false; setPhase('idle', 'Hazır.'); healLog('Takılan düşünme', '5 dakikadır yanıt gelmedi; istek durduruldu. Yarım görev KAYIT’ta.'); return 'onarıldı'; }
      return 'ok';
    } },
    { id: 'konusma', ad: 'Takılan konuşma', run: () => {
      if (phase === 'speaking' && Date.now() - since.t > 150000 && !(window.speechSynthesis?.speaking) && ![...document.querySelectorAll('audio')].some(a => !a.paused)) { try { voiceSession.stop(''); } catch {} setPhase('idle', 'Hazır.'); healLog('Takılan konuşma', 'Ses bitmiş ama ekran konuşuyor görünüyordu; sıfırlandı.'); return 'onarıldı'; }
      if (window.speechSynthesis?.paused && phase !== 'speaking') { try { speechSynthesis.cancel(); } catch {} healLog('Takılan konuşma', 'Askıda kalan cihaz sesi temizlendi.'); return 'onarıldı'; }
      return 'ok';
    } },
    { id: 'dinleme', ad: 'Takılan mikrofon', run: () => {
      if (phase === 'starting' && Date.now() - since.t > 20000) { try { voiceSession.stop(''); } catch {} setPhase('idle', 'Mikrofon açılamadı; tekrar dokun.'); healLog('Takılan mikrofon', 'Mikrofon açılışta takıldı; sıfırlandı.'); return 'onarıldı'; }
      return 'ok';
    } },
    { id: 'kayit', ad: 'Kayıt bütünlüğü', every: 300000, run: () => {
      let fixed = 0;
      const RAW = new Set(['jarvisapp.geminiModel', 'jarvisapp.ttsModel']); // düz metin olarak saklanan kayıtlar (bozuk değil)
      const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      // 7.0'daki hatanın bıraktığı gereksiz yedekleri temizle; bozuk yedekleri en fazla 5 tut
      const junk = keys.filter(k => /^jarvisapp\.bozuk\.(?:geminiModel|ttsModel)\./.test(k)); junk.forEach(k => localStorage.removeItem(k));
      keys.filter(k => k?.startsWith('jarvisapp.bozuk.') && !junk.includes(k)).sort().slice(0, -5).forEach(k => localStorage.removeItem(k));
      for (const k of keys) {
        if (!k?.startsWith('jarvisapp.') || k.startsWith('jarvisapp.bozuk.') || RAW.has(k)) continue;
        const v = localStorage.getItem(k); if (v === null) continue;
        try { JSON.parse(v); } catch { try { localStorage.setItem('jarvisapp.bozuk.' + k.slice(10) + '.' + Date.now(), v); localStorage.removeItem(k); fixed++; } catch {} }
      }
      if (fixed) { healLog('Kayıt bütünlüğü', `${fixed} bozuk kayıt ayrıldı (yedeği “bozuk.” adıyla saklandı).`); return 'onarıldı'; }
      return 'ok';
    } },
    { id: 'depo', ad: 'Depolama doluluğu', every: 600000, run: async () => {
      const est = await navigator.storage?.estimate?.(); if (!est?.quota) return 'atla';
      const r = est.usage / est.quota;
      if (r > 0.85) {
        const before = archive.length; archive = archive.slice(-Math.floor(archive.length * 0.7)); store.set('archive', archive);
        opLog = opLog.slice(-100); store.set('oplog', opLog);
        try { for (const k of await caches.keys()) if (!k.includes(window.JARVIS_V || '')) await caches.delete(k); } catch {}
        healLog('Depolama doluluğu', `Depolama %${Math.round(r * 100)} doluydu; en eski ${before - archive.length} arşiv kaydı ve eski önbellek temizlendi (eşitleme açıksa bulutta duruyor).`); return 'onarıldı';
      }
      return 'ok';
    } },
    { id: 'sw', ad: 'Çevrimdışı çalışma (servis çalışanı)', every: 600000, run: async () => {
      if (!('serviceWorker' in navigator)) return 'atla';
      const reg = await navigator.serviceWorker.getRegistration(); if (reg) return 'ok';
      await navigator.serviceWorker.register('sw.js'); healLog('Çevrimdışı çalışma', 'Servis çalışanı yeniden kaydedildi.'); return 'onarıldı';
    } },
    { id: 'ag', ad: 'İnternet', run: () => (navigator.onLine ? 'ok' : 'sorun') },
    { id: 'ekran', ad: 'Ekran şişmesi', every: 120000, run: () => {
      const feed = document.querySelectorAll('#feed .msg'); if (feed.length <= 300) return 'ok';
      [...feed].slice(0, feed.length - 200).forEach(n => n.remove()); healLog('Ekran şişmesi', `${feed.length - 200} eski mesaj ekrandan kaldırıldı (kayıtlar duruyor).`); return 'onarıldı';
    } },
    { id: 'yardimci', ad: 'Bilgisayar yardımcısı', every: 120000, run: async () => {
      if (!opt('pcToken') || /iphone|ipad|android/i.test(navigator.userAgent)) return 'atla';
      try { const ok = await pcPing(); if (ok) return 'ok'; } catch {}
      return 'sorun';
    } }
  ];
  const state = {}; AGENTS.forEach(a => state[a.id] = { durum: 'bekliyor', son: 0 });
  let lastPhase = phase;
  async function tick() {
    if (phase !== lastPhase) { lastPhase = phase; since.phase = phase; since.t = Date.now(); }
    for (const a of AGENTS) {
      const s = state[a.id]; if (Date.now() - s.son < (a.every || 20000)) continue;
      s.son = Date.now();
      try { s.durum = await a.run(); } catch (e) { s.durum = 'atla'; onErr('nöbetçi ' + a.id + ': ' + e.message, 'nöbet'); }
    }
    render();
  }
  setInterval(() => { if (phase !== lastPhase) { lastPhase = phase; since.t = Date.now(); } }, 1000);
  setInterval(tick, 20000); setTimeout(tick, 6000);
  window.addEventListener('online', () => { healLog('İnternet', 'Bağlantı geri geldi.', 'düzeldi'); });

  /* ---------- 2) bilgisayar nöbetçileri ---------- */
  PC_READONLY.add('nobet'); PC_READONLY.add('nobet_tara'); PC_RISKY.add('nobet_onay'); PC_RISKY.add('kendini_guncelle');
  async function loadPc(force) {
    if (!force && Date.now() - pcAt < 50000) return pc;
    pcAt = Date.now();
    try { const d = await pcCall('nobet', [], false); pc = d.data || null; pcErr = ''; } catch (e) { pcErr = e.message; }
    render(); return pc;
  }
  async function decide(inc, yes) {
    try { const d = await pcCall('nobet_onay', [inc.id, yes ? 'evet' : 'hayir'], true); logOp('nöbet onarımı', [inc.ad, yes ? 'onaylandı' : 'reddedildi'], 'başarılı', d.text); note(d.text); }
    catch (e) { logOp('nöbet onarımı', [inc.ad], 'başarısız', e.message); note('Yapılamadı: ' + e.message); }
    loadPc(true);
  }

  /* ---------- NÖBET paneli ---------- */
  const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-nobet', 'aria-selected': 'false', 'data-p': 'nobet' }, 'NÖBET');
  tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
  tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-nobet'); loadPc(); };
  const aiSel = el('select', { id: 'nobetAi' }); aiSel.append(new Option('Kapalı', '0'), new Option('Açık · gerçek sorunda Gemini kısa teşhis yazar (günde en çok 30)', '1'));
  aiSel.value = store.get('set.nobetAi', '0') || '0';
  aiSel.onchange = async () => {
    store.set('set.nobetAi', aiSel.value);
    let key = ''; try { key = JSON.parse(localStorage.getItem('jarvisapp.key') || '""'); } catch {}
    try { await fetch(PC + '/eslestir', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': opt('pcToken') || '' }, body: JSON.stringify(aiSel.value === '1' ? { gemini: key, nobet_ai: true } : { nobet_ai: false }) }); note(aiSel.value === '1' ? 'Nöbetçi yapay zekâ teşhisi açıldı. Gemini anahtarın yalnız bu bilgisayardaki yardımcıya verildi.' : 'Nöbetçi yapay zekâ teşhisi kapatıldı.'); }
    catch { note('Yardımcıya ulaşılamadı; bu ayarı yardımcının kurulu olduğu bilgisayardan yap.'); }
  };
  const p = el('div', { class: 'pane', id: 'p-nobet', role: 'tabpanel' },
    el('h3', {}, 'BİLGİSAYAR NÖBETÇİLERİ · 7/24'), el('div', { class: 'kvs', id: 'nbStats' }),
    el('div', { class: 'nbgroups', id: 'nbGroups' }),
    el('h3', {}, 'OLAYLAR'), el('ul', { class: 'list', id: 'nbInc' }),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', onclick: () => loadPc(true) }, 'Yenile'),
      el('button', { type: 'button', class: 'btn', onclick: async () => { try { const d = await pcCall('nobet_tara', [], false); note(d.text); setTimeout(() => loadPc(true), 60000); } catch (e) { note(e.message); } } }, 'Şimdi tara'),
      el('button', { type: 'button', class: 'btn', onclick: async () => { if (!(await confirmAction('Bilgisayar yardımcısı en son sürüme güncellensin mi?'))) return; try { const d = await pcCall('kendini_guncelle', [], true); note(d.text); setTimeout(() => { pcPing(); loadPc(true); }, 12000); } catch (e) { note('Güncellenemedi: ' + e.message + ' (eski yardımcıda bu düğme yok; bir kez PowerShell komutuyla kur).'); } } }, 'Yardımcıyı güncelle'),
      el('button', { type: 'button', class: 'btn', onclick: () => { $('drawer').classList.remove('open'); typedTurn('Nöbetçi raporunu ver: pc|nobet ile bak; sorunları önem sırasıyla, ne yapıldığını ve benim ne yapmam gerektiğini kısaca söyle.', false); } }, 'Rapor iste')),
    el('details', {}, el('summary', {}, 'Tüm bilgisayar ajanları'), el('ul', { class: 'list', id: 'nbAgents' })),
    el('h3', {}, 'UYGULAMA NÖBETÇİLERİ'), el('ul', { class: 'list', id: 'nbApp' }),
    el('h3', {}, 'ONARIM GÜNLÜĞÜ'), el('ul', { class: 'list', id: 'nbHeal' }),
    field('nobetAi', 'Nöbetçi yapay zekâ teşhisi', aiSel),
    el('p', { class: 'muted' }, 'Bilgisayar nöbetçileri yardımcının içinde uygulama kapalıyken de çalışır: güvenli sorunları kendileri onarır (servis yeniden başlatma, DNS, saat, virüs tanımları, Gezgin, yardımcının kendisi), riskli onarımları burada onayına sunar ve telefona bildirir. Yardımcı kapanırsa bekçi görevi 10 dakika içinde yeniden başlatır.'));
  p.hidden = true; $('p-settings').before(p);
  const d = el('button', { type: 'button', 'data-open': 'nobet', onclick: () => openDrawer('nobet') }, 'NÖBET');
  document.querySelector('.dockbar').insertBefore(d, document.querySelector('.dockbar [data-open="settings"]'));

  const DUR = { ok: ['✓', 'ok'], sorun: ['!', 'bad'], atla: ['–', 'off'], bekliyor: ['…', 'off'], 'onarıldı': ['↻', 'ok'] };
  const ago = t => { const s = Math.round((Date.now() - t * (t < 1e12 ? 1000 : 1)) / 1000); return s < 60 ? s + ' sn önce' : s < 3600 ? Math.round(s / 60) + ' dk önce' : Math.round(s / 3600) + ' sa önce'; };
  function render() {
    if (!$('nbStats')) return;
    if (pc) {
      $('nbStats').replaceChildren(...[['Ajan', `${pc.ajan} (${pc.calisan} etkin)`], ['Şu an sorun', pc.sorun], ['Yapılan denetim', Number(pc.tur).toLocaleString('tr-TR')], ['Çalışma süresi', ago(pc.baslangic).replace(' önce', '')], ['Yapay zekâ teşhisi (bugün)', pc.ai_kullanim]].flatMap(([k, v]) => [el('span', {}, k), el('b', {}, String(v))]));
      $('nbGroups').replaceChildren(...Object.entries(pc.gruplar).map(([g, x]) => el('span', { class: 'nbg ' + (x.sorun ? 'bad' : 'ok'), title: `${x.toplam} ajan, ${x.sorun} sorun, ${x.atla} geçerli değil` }, `${g} ${x.toplam - x.atla}${x.sorun ? ' · ' + x.sorun + '!' : ''}`)));
      const inc = [...pc.olaylar].reverse().slice(0, 30);
      $('nbInc').replaceChildren(...(inc.length ? inc.map(i => el('li', { class: 'item nbinc ' + (i.durum === 'onay bekliyor' ? 'wait' : i.durum === 'açık' ? 'bad' : 'ok') },
        el('span', {}, i.onem === 'kritik' ? '⚠' : i.durum === 'onarıldı' ? '↻' : '•'),
        el('div', {}, el('p', {}, el('b', {}, i.ad + ': '), i.mesaj), el('small', {}, `${ago(i.zaman)} · ${i.durum.toLocaleUpperCase('tr-TR')}${i.onarim ? ' · onarım: ' + i.onarim : ''}${i.sonuc ? ' · ' + short(i.sonuc, 120) : ''}`), i.teshis ? el('small', { class: 'nbdx' }, 'Teşhis: ' + i.teshis) : null),
        i.durum === 'onay bekliyor' ? el('div', { class: 'nbbtns' }, el('button', { type: 'button', class: 'btn', onclick: () => decide(i, true) }, 'Onar'), el('button', { type: 'button', class: 'btn ghost', onclick: () => decide(i, false) }, 'Reddet')) : el('span'))) : [el('li', { class: 'muted' }, 'Kayıtlı olay yok — her şey yolunda.')]));
      $('nbAgents').replaceChildren(...pc.ajanlar.map(a => el('li', { class: 'item' }, el('span', { class: 'nbd ' + (DUR[a.durum] || DUR.bekliyor)[1] }, (DUR[a.durum] || DUR.bekliyor)[0]), el('div', {}, el('p', {}, a.ad), el('small', {}, `${a.grup} · ${a.mesaj || a.durum}${a.son ? ' · ' + ago(a.son) : ''}`)), el('span'))));
    } else {
      $('nbStats').replaceChildren(el('span', {}, 'Durum'), el('b', {}, pcErr ? 'yardımcıya ulaşılamadı' : 'yükleniyor…'));
      $('nbGroups').replaceChildren(el('p', { class: 'muted' }, pcErr ? 'Bilgisayar nöbetçileri için JARVIS-PC yardımcısını (v7) kur ya da güncelle: BAĞLANTI → Bilgisayar yardımcısını indir. Telefondan bakmak için eşitleme açık olmalı. (' + short(pcErr, 100) + ')' : ''));
      $('nbInc').replaceChildren(); $('nbAgents').replaceChildren();
    }
    $('nbApp').replaceChildren(...AGENTS.map(a => { const s = state[a.id]; const [ic, cl] = DUR[s.durum] || DUR.bekliyor; return el('li', { class: 'item' }, el('span', { class: 'nbd ' + cl }, ic), el('div', {}, el('p', {}, a.ad), el('small', {}, s.son ? s.durum + ' · ' + ago(s.son) : 'bekliyor')), el('span')); }));
    const h = [...HEAL].reverse().slice(0, 20);
    $('nbHeal').replaceChildren(...(h.length ? h.map(x => el('li', { class: 'item' }, el('span', {}, '↻'), el('div', {}, el('p', {}, el('b', {}, x.ajan + ': '), x.mesaj), el('small', {}, dateTR(x.t) + ' · ' + x.durum)), el('span'))) : [el('li', { class: 'muted' }, 'Henüz onarım gerekmedi.')]));
    const nAg = (pc?.ajan || 0) + AGENTS.length, bad = (pc?.sorun || 0) + AGENTS.filter(a => state[a.id].durum === 'sorun').length;
    d.textContent = bad ? `NÖBET ${bad}!` : 'NÖBET'; d.classList.toggle('alert', !!bad); tb.classList.toggle('alert', !!bad); tb.textContent = d.textContent;
    window.jarvisNobet = { ajan: nAg, sorun: bad };
  }

  // ticker + yapay zekâya bilgi
  const _rt = window.jarvisTickerExtra;
  window.jarvisTickerExtra = () => [window.jarvisNobet ? `NÖBET ${window.jarvisNobet.ajan} AJAN · ${window.jarvisNobet.sorun ? window.jarvisNobet.sorun + ' SORUN' : 'HER ŞEY YOLUNDA'}` : '', ...(_rt?.() || [])].filter(Boolean);
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `\nNÖBETÇİLER: Bilgisayar yardımcısında 7/24 çalışan ${pc?.ajan || 'yüzü aşkın'} izleme ajanı var (servisler, diskler, bellek, işlemci, ağ, Defender, güvenlik duvarı, hosts, başlangıç programları, hata kayıtları, çökmeler, disk sağlığı, saat, güncellemeler, yazıcı, pil, yedek, yardımcının kendisi). pc|nobet → durum ve açık olaylar (olay kimlikleriyle); pc|nobet_onay|olayKimliği|evet/hayir → bekleyen onarımı uygula/reddet (önce Beyhan’a sor); pc|nobet_tara → hepsini hemen yeniden denetle. “Bilgisayarım nasıl, sorun var mı” gibi sorularda önce pc|nobet kullan.${HEAL.length ? ' Uygulama içi son onarım: ' + HEAL.at(-1).ajan + ' — ' + HEAL.at(-1).mesaj : ''}`;
  setTimeout(() => { if (opt('pcToken') && !/iphone|ipad|android/i.test(navigator.userAgent)) loadPc(); }, 8000);
  setInterval(() => { if (!document.hidden && opt('pcToken') && !/iphone|ipad|android/i.test(navigator.userAgent)) loadPc(); }, 5 * 60000);
  render();
})();
