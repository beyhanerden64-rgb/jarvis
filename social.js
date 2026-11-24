'use strict';
/* SATÜRN 5.2 — sosyal medya: YouTube kanalı (anahtarsız: herkese açık akış + kanal sayfası) ve Instagram (resmî API, erişim anahtarıyla).
 * Günlük anlık görüntü ile büyüme takibi, SOSYAL paneli, araçlar: youtube, instagram, sosyal_rapor. */
(() => {
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const txt = (id, ph, type = 'text') => el('input', { id, placeholder: ph, type, autocomplete: 'off', spellcheck: 'false' });
  const proxy = (u, fmt = 'html') => withTimeout(fetch('https://r.jina.ai/' + u, { headers: { 'X-Return-Format': fmt } }), 20000, 'YouTube yanıt vermedi');
  const n = x => Number(x || 0).toLocaleString('tr-TR');
  if (!store.get('set.ytChannel', '')) store.set('set.ytChannel', 'UCKm59sazrexGNvR-85-4zWQ');
  if (!store.get('set.igProfile', '')) store.set('set.igProfile', 'https://www.instagram.com/fizyo_vitaaa/');
  const channelId = () => { const v = opt('ytChannel'); const m = v.match(/UC[\w-]{22}/); return m ? m[0] : v.trim(); };

  /* ================= YouTube ================= */
  let yt = store.get('ytCache', null), ytHist = store.get('ytHist', []);
  async function ytLoad(force) {
    if (!force && yt && Date.now() - yt.t < 20 * 60000) return yt;
    const id = channelId(); if (!/^UC[\w-]{22}$/.test(id)) throw Error('YouTube kanal kimliği geçersiz (UC ile başlar)');
    const [feed, about] = await Promise.all([proxy('https://www.youtube.com/feeds/videos.xml?channel_id=' + id).then(r => r.text()), proxy(`https://www.youtube.com/channel/${id}/about`, 'text').then(r => r.text()).catch(() => '')]);
    const d = new DOMParser().parseFromString(feed, 'text/xml');
    const name = d.querySelector('feed > title')?.textContent || 'Kanal';
    const videos = [...d.getElementsByTagName('entry')].map(e => ({
      id: e.getElementsByTagNameNS('*', 'videoId')[0]?.textContent, title: e.getElementsByTagName('title')[0]?.textContent || '',
      date: e.getElementsByTagName('published')[0]?.textContent || '', views: +(e.getElementsByTagNameNS('*', 'statistics')[0]?.getAttribute('views') || 0),
      likes: +(e.getElementsByTagNameNS('*', 'starRating')[0]?.getAttribute('count') || 0), short: /#shorts/i.test(e.getElementsByTagName('title')[0]?.textContent || '')
    }));
    if (!videos.length && !/<feed/.test(feed)) throw Error('Kanal akışı okunamadı');
    const num = re => { const m = about.match(re); if (!m) return null; const s = m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'); return /k|b/i.test(m[2] || '') ? Math.round(parseFloat(s) * 1000) : /m|mn/i.test(m[2] || '') ? Math.round(parseFloat(s) * 1e6) : +s; };
    const subs = num(/([\d.,]+)\s*(K|B|M|Mn)?\s*(?:subscribers|abone)/i), count = num(/([\d.,]+)\s*(K|B)?\s*(?:videos|video)/i);
    const handle = (about.match(/@[\w.-]+/) || [''])[0];
    yt = { t: Date.now(), id, name, handle, subs, count, videos };
    store.set('ytCache', yt);
    const day = isoLocal(now()).slice(0, 10);
    if (!ytHist.length || ytHist.at(-1).d !== day) { ytHist.push({ d: day, subs, views: videos.reduce((s, v) => s + v.views, 0) }); ytHist = ytHist.slice(-120); store.set('ytHist', ytHist); }
    renderSocial();
    return yt;
  }
  function ytSummary(c) {
    const vs = c.videos, tot = vs.reduce((s, v) => s + v.views, 0), likes = vs.reduce((s, v) => s + v.likes, 0);
    const best = [...vs].sort((a, b) => b.views - a.views)[0];
    const sh = vs.filter(v => v.short), lg = vs.filter(v => !v.short), avg = a => a.length ? Math.round(a.reduce((s, v) => s + v.views, 0) / a.length) : 0;
    const first = ytHist.find(h => h.subs != null), growth = first && c.subs != null && first.d !== ytHist.at(-1).d ? ` (${first.d} tarihinden beri ${c.subs - first.subs >= 0 ? '+' : ''}${c.subs - first.subs})` : '';
    return `YouTube kanalı “${c.name}” ${c.handle}: ${c.subs != null ? n(c.subs) + ' abone' + growth : 'abone sayısı okunamadı'}, ${c.count ?? vs.length} video. Son ${vs.length} videoda toplam ${n(tot)} izlenme, ${n(likes)} beğeni (beğeni oranı %${tot ? (likes / tot * 100).toFixed(1) : 0}). Shorts ortalaması ${n(avg(sh))} izlenme (${sh.length} video), uzun video ortalaması ${n(avg(lg))} (${lg.length} video). En iyi: “${best?.title}” (${n(best?.views)}). Videolar: ` + vs.map(v => `“${v.title}” ${v.date.slice(0, 10)} · ${n(v.views)} izlenme · ${v.likes} beğeni`).join(' | ');
  }

  /* ================= Instagram (resmî API; erişim anahtarı gerekir) ================= */
  let ig = store.get('igCache', null);
  async function igLoad(force) {
    const tok = opt('igToken'); if (!tok) throw Error('Instagram bağlı değil (Bağlantı → Instagram erişim anahtarı).');
    if (!force && ig && Date.now() - ig.t < 20 * 60000) return ig;
    const get = async u => { const r = await withTimeout(fetch('https://graph.instagram.com/v22.0/' + u + (u.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(tok)), 15000, 'Instagram yanıt vermedi'); const d = await r.json(); if (d.error) throw Error('Instagram: ' + d.error.message); return d; };
    const me = await get('me?fields=user_id,username,name,account_type,followers_count,follows_count,media_count');
    const media = (await get('me/media?fields=id,caption,media_type,timestamp,like_count,comments_count,permalink&limit=20')).data || [];
    ig = { t: Date.now(), me, media }; store.set('igCache', ig); renderSocial(); return ig;
  }
  const igSummary = c => `Instagram @${c.me.username} (${c.me.account_type || ''}): ${n(c.me.followers_count)} takipçi, ${n(c.me.follows_count)} takip, ${n(c.me.media_count)} gönderi. Son gönderiler: ` + c.media.map(m => `${m.timestamp?.slice(0, 10)} ${m.media_type} · ${m.like_count ?? '?'} beğeni · ${m.comments_count ?? '?'} yorum · “${short(m.caption || '', 80)}”`).join(' | ');

  /* ================= araçlar ================= */
  Object.assign(TOOLS, {
    youtube: { d: 'youtube|durum veya yenile — Beyhan’ın YouTube kanalı: abone, video sayısı, son videoların izlenme/beğeni verisi, Shorts–uzun video karşılaştırması, büyüme', run: async ([a]) => ytSummary(await ytLoad(/yenile/i.test(a || ''))) },
    instagram: { d: 'instagram|durum veya yenile — Beyhan’ın Instagram hesabı: takipçi, gönderiler, beğeni/yorum (bağlıysa)', run: async ([a]) => igSummary(await igLoad(/yenile/i.test(a || ''))) },
    sosyal_rapor: { d: 'sosyal_rapor — YouTube ve Instagram verilerini birlikte getirir (rapor ve içerik planı için)', run: async () => { const parts = []; try { parts.push(ytSummary(await ytLoad())); } catch (e) { parts.push('YouTube: ' + e.message); } try { parts.push(igSummary(await igLoad())); } catch (e) { parts.push('Instagram: ' + e.message); } return parts.join('\n'); } }
  });
  const _tp = toolsPrompt;
  toolsPrompt = () => _tp() + `\nSOSYAL MEDYA: Beyhan’ın YouTube kanalı bağlı (${yt?.name || 'Beyhan Erden'}${yt?.handle ? ' ' + yt.handle : ''}; bilim/uzay Shorts ve FİZYOVİTA içerikleri). Kanal sorularında youtube aracını kullan; veriye dayanarak somut öneri ver (hangi konu/format daha iyi, yayın sıklığı, başlık). Instagram ${opt('igToken') ? 'bağlı (instagram aracı)' : 'henüz bağlı değil'}. Paylaşım yapmadan önce Beyhan’ın onayını al.`;

  /* ================= SOSYAL paneli ================= */
  (() => {
    const tabs = document.querySelector('.tabs'), tb = el('button', { role: 'tab', id: 't-social', 'aria-selected': 'false', 'data-p': 'social' }, 'SOSYAL');
    tabs.insertBefore(tb, tabs.querySelector('[data-p="settings"]'));
    tb.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === tb))); document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'p-social'); ytLoad().catch(e => note(e.message)); };
    const ask = q => { $('drawer').classList.remove('open'); typedTurn(q, false); };
    const p = el('div', { class: 'pane', id: 'p-social', role: 'tabpanel' },
      el('h3', {}, 'YOUTUBE'), el('div', { class: 'kvs', id: 'ytStats' }), el('canvas', { id: 'ytChart', width: 360, height: 110, class: 'ytchart', 'aria-label': 'Son videoların izlenmeleri' }),
      el('ul', { class: 'list', id: 'ytList' }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn', onclick: () => ytLoad(true).then(() => note('YouTube verisi yenilendi.'), e => note(e.message)) }, 'Yenile'),
        el('button', { type: 'button', class: 'btn', onclick: () => ask('YouTube kanalımı analiz et: youtube aracıyla veriyi al; hangi videolar ve formatlar daha iyi, neden; büyümek için 5 somut öneri ve önümüzdeki 2 hafta için yayın planı.') }, 'Kanalı analiz et'),
        el('button', { type: 'button', class: 'btn', onclick: () => ask('Kanalımın en iyi performans gösteren konularına göre 5 yeni Shorts fikri yaz: başlık, ilk 2 saniyelik kanca, 45 saniyelik senaryo, açıklama ve etiketler.') }, 'Video fikirleri'),
        el('button', { type: 'button', class: 'btn', onclick: () => { $('prompt').value = 'Şu konu için YouTube Shorts senaryosu, başlık, açıklama ve etiket hazırla: …'; autosize(); $('drawer').classList.remove('open'); } }, 'Senaryo yaz')),
      el('h3', {}, 'INSTAGRAM'), el('div', { class: 'kvs', id: 'igStats' }), el('ul', { class: 'list', id: 'igList' }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', onclick: () => ask('Sosyal medya raporu hazırla: sosyal_rapor aracını kullan; YouTube ve Instagram performansını karşılaştır, bu hafta için çapraz paylaşım planı öner.') }, 'Sosyal medya raporu')));
    p.hidden = true; $('p-settings').before(p);
    const d = el('button', { type: 'button', 'data-open': 'social', onclick: () => { openDrawer('social'); } }, 'SOSYAL');
    document.querySelector('.dockbar').insertBefore(d, document.querySelector('.dockbar [data-open="settings"]'));
  })();
  function renderSocial() {
    if (!$('ytStats')) return;
    if (yt) {
      const tot = yt.videos.reduce((s, v) => s + v.views, 0);
      $('ytStats').replaceChildren(...[['Kanal', `${yt.name} ${yt.handle}`], ['Abone', yt.subs != null ? n(yt.subs) : '?'], ['Video', yt.count ?? yt.videos.length], ['Son videolar izlenme', n(tot)], ['Güncelleme', dateTR(yt.t)]].flatMap(([k, v]) => [el('span', {}, k), el('b', {}, String(v))]));
      $('ytList').replaceChildren(...yt.videos.map(v => el('li', { class: 'item' }, el('span', {}, v.short ? '▮' : '▶'), el('div', {}, el('p', {}, el('a', { href: 'https://www.youtube.com/watch?v=' + v.id, target: '_blank', rel: 'noopener' }, v.title)), el('small', {}, `${v.date.slice(0, 10)} · ${n(v.views)} izlenme · ${v.likes} beğeni`)))));
      const c = $('ytChart'), g = c.getContext('2d'), vs = [...yt.videos].reverse(), max = Math.max(1, ...vs.map(v => v.views)), bw = c.width / Math.max(1, vs.length);
      const colr = getComputedStyle(document.documentElement).getPropertyValue('--holo').trim() || '#57d3ff';
      g.clearRect(0, 0, c.width, c.height); g.font = '10px "Share Tech Mono", monospace';
      vs.forEach((v, i) => { const h = (v.views / max) * (c.height - 22); g.fillStyle = v.short ? colr : '#ffb547'; g.globalAlpha = 0.85; g.fillRect(i * bw + 4, c.height - 14 - h, bw - 8, h); g.globalAlpha = 0.8; g.fillStyle = colr; g.fillText(String(v.views), i * bw + 4, c.height - 17 - h); g.fillText(v.date.slice(5, 10), i * bw + 4, c.height - 2); });
      g.globalAlpha = 1;
    }
    if (ig) {
      $('igStats').replaceChildren(...[['Hesap', '@' + ig.me.username], ['Takipçi', n(ig.me.followers_count)], ['Gönderi', n(ig.me.media_count)]].flatMap(([k, v]) => [el('span', {}, k), el('b', {}, String(v))]));
      $('igList').replaceChildren(...ig.media.slice(0, 10).map(m => el('li', { class: 'item' }, el('span', {}, '◆'), el('div', {}, el('p', {}, el('a', { href: m.permalink, target: '_blank', rel: 'noopener' }, short(m.caption || m.media_type, 70))), el('small', {}, `${m.timestamp?.slice(0, 10)} · ${m.like_count ?? '?'} beğeni · ${m.comments_count ?? '?'} yorum`)))));
    } else $('igStats').replaceChildren(el('span', {}, 'Durum'), el('b', {}, opt('igToken') ? 'yükleniyor' : 'bağlı değil · Bağlantı sekmesi'));
  }

  /* ================= Bağlantı ayarları ================= */
  $('p-link').append(el('h3', {}, 'YOUTUBE KANALI'),
    field('ytChannel', 'Kanal kimliği veya linki', txt('ytChannel', 'UC… veya https://www.youtube.com/channel/UC…')),
    el('p', { class: 'muted' }, 'Anahtarsız bağlantı: abone, video sayısı ve son videoların izlenme/beğeni verisi. Gizli analizler (izlenme süresi, gelir) için ileride Google girişi eklenebilir.'),
    el('h3', {}, 'INSTAGRAM'),
    field('igProfile', 'Profil linki', txt('igProfile', 'https://www.instagram.com/…')),
    field('igToken', 'Instagram erişim anahtarı (Meta geliştirici sayfasından)', txt('igToken', 'IG…', 'password')),
    el('p', { class: 'muted' }, 'Hesap Profesyonel (İşletme/İçerik üreticisi) olmalı. Anahtar yalnız bu cihazda saklanır; eşitleme açıksa şifreli taşınır.'));
  for (const id of ['ytChannel', 'igProfile', 'igToken']) { const v = store.get('set.' + id, null), el2 = $(id); if (v !== null) el2.value = v; el2.addEventListener('change', () => { store.set('set.' + id, el2.value.trim()); if (id === 'ytChannel') { yt = null; ytLoad(true).then(() => note('YouTube kanalı bağlandı: ' + yt.name), e => note(e.message)); } if (id === 'igToken' && el2.value.trim()) igLoad(true).then(() => note('Instagram bağlandı: @' + ig.me.username), e => note(e.message)); }); }

  // ticker + skills
  const _rt = window.jarvisTickerExtra;
  window.jarvisTickerExtra = (prev => () => [...(prev?.() || []), ...[yt?.subs != null ? `YOUTUBE ${n(yt.subs)} ABONE · ${n(yt.videos[0]?.views)} SON VİDEO` : '', ig ? `INSTAGRAM ${n(ig.me.followers_count)} TAKİPÇİ` : '', ...(_rt?.() || [])].filter(Boolean)])(window.jarvisTickerExtra);
  SKILLS.yt = { label: 'YouTube', run: () => { window.jarvisUnlock(); typedTurn('YouTube kanalım nasıl gidiyor? youtube aracıyla bak, kısa özetle ve bir öneri ver.', opt('speakOn') === '1'); } };
  $('mobileSkills').append(el('button', { type: 'button', onclick: SKILLS.yt.run }, 'YouTube'));
  setTimeout(() => ytLoad().catch(() => {}), 5000);
  setInterval(() => { if (!document.hidden) ytLoad().catch(() => {}); }, 60 * 60000);
  renderSocial();
})();
