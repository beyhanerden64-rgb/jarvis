'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-22.5.2';
const SHELL = ['./', 'app.js?v=22.5.2', 'plus.js?v=22.5.2', 'hud.js?v=22.5.2', 'features.js?v=22.5.2', 'control.js?v=22.5.2', 'voices.js?v=22.5.2', 'social.js?v=22.5.2', 'agent.js?v=22.5.2', 'figure.js?v=22.5.2', 'sentinel.js?v=22.5.2', 'brain.js?v=22.5.2', 'pro.js?v=22.5.2', 'ultra.js?v=22.5.2', 'klinik.js?v=22.5.2', 'live.js?v=22.5.2', 'research.js?v=22.5.2', 'research2.js?v=22.5.2', 'markets.js?v=22.5.2', 'news.js?v=22.5.2', 'imagegen.js?v=22.5.2', 'visual.js?v=22.5.2', 'research3.js?v=22.5.2', 'klinik2.js?v=22.5.2', 'forecast.js?v=22.5.2', 'picks.js?v=22.5.2', 'expert.js?v=22.5.2', 'voice2.js?v=22.5.2', 'ultron.js?v=22.5.2', 'ultron-life.js?v=22.5.2', 'guardian.js?v=22.5.2', 'voice-engine.js?v=22.5.2', 'audiohub.js?v=22.5.2', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=22.5.2'];
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
