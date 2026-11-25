'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-26.0';
const SHELL = ['./', 'app.js?v=26.0', 'plus.js?v=26.0', 'hud.js?v=26.0', 'features.js?v=26.0', 'control.js?v=26.0', 'voices.js?v=26.0', 'social.js?v=26.0', 'agent.js?v=26.0', 'figure.js?v=26.0', 'sentinel.js?v=26.0', 'brain.js?v=26.0', 'pro.js?v=26.0', 'ultra.js?v=26.0', 'klinik.js?v=26.0', 'live.js?v=26.0', 'research.js?v=26.0', 'research2.js?v=26.0', 'markets.js?v=26.0', 'news.js?v=26.0', 'imagegen.js?v=26.0', 'visual.js?v=26.0', 'research3.js?v=26.0', 'klinik2.js?v=26.0', 'forecast.js?v=26.0', 'picks.js?v=26.0', 'expert.js?v=26.0', 'voice2.js?v=26.0', 'ultron.js?v=26.0', 'ultron-life.js?v=26.0', 'guardian.js?v=26.0', 'uretken.js?v=26.0', 'gunluk.js?v=26.0', 'pratik.js?v=26.0', 'izle.js?v=26.0', 'video.js?v=26.0', 'analiz.js?v=26.0', 'verim.js?v=26.0', 'ekler.js?v=26.0', 'ek26.js?v=26.0', 'kum.js', 'voice-engine.js?v=26.0', 'audiohub.js?v=26.0', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=26.0'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'saturn-share').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // “Paylaş → SATÜRN”: Android paylaşım menüsünden gelen metin/link/dosya önbelleğe yazılır, uygulama ?share=1 ile açılır
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const f = await e.request.formData(), c = await caches.open('saturn-share');
        for (const k of await c.keys()) await c.delete(k);
        const meta = { title: String(f.get('title') || ''), text: String(f.get('text') || ''), url: String(f.get('url') || ''), t: Date.now(), files: [] };
        let i = 0;
        for (const file of f.getAll('files')) {
          if (!file || typeof file === 'string' || !file.size || file.size > 25e6 || i >= 10) continue;
          const k = 'f' + i++;
          await c.put('./__share/' + k, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Name': encodeURIComponent(file.name || k) } }));
          meta.files.push(k);
        }
        await c.put('./__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
      } catch {}
      return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return r; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
