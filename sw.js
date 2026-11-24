'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-23.2.0';
const SHELL = ['./', 'app.js?v=23.2.0', 'plus.js?v=23.2.0', 'hud.js?v=23.2.0', 'features.js?v=23.2.0', 'control.js?v=23.2.0', 'voices.js?v=23.2.0', 'social.js?v=23.2.0', 'agent.js?v=23.2.0', 'figure.js?v=23.2.0', 'sentinel.js?v=23.2.0', 'brain.js?v=23.2.0', 'pro.js?v=23.2.0', 'ultra.js?v=23.2.0', 'klinik.js?v=23.2.0', 'live.js?v=23.2.0', 'research.js?v=23.2.0', 'research2.js?v=23.2.0', 'markets.js?v=23.2.0', 'news.js?v=23.2.0', 'imagegen.js?v=23.2.0', 'visual.js?v=23.2.0', 'research3.js?v=23.2.0', 'klinik2.js?v=23.2.0', 'forecast.js?v=23.2.0', 'picks.js?v=23.2.0', 'expert.js?v=23.2.0', 'voice2.js?v=23.2.0', 'ultron.js?v=23.2.0', 'ultron-life.js?v=23.2.0', 'guardian.js?v=23.2.0', 'uretken.js?v=23.2.0', 'gunluk.js?v=23.2.0', 'pratik.js?v=23.2.0', 'voice-engine.js?v=23.2.0', 'audiohub.js?v=23.2.0', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=23.2.0'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
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
