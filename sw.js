'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-25.0.1';
const SHELL = ['./', 'app.js?v=25.0.1', 'plus.js?v=25.0.1', 'hud.js?v=25.0.1', 'features.js?v=25.0.1', 'control.js?v=25.0.1', 'voices.js?v=25.0.1', 'social.js?v=25.0.1', 'agent.js?v=25.0.1', 'figure.js?v=25.0.1', 'sentinel.js?v=25.0.1', 'brain.js?v=25.0.1', 'pro.js?v=25.0.1', 'ultra.js?v=25.0.1', 'klinik.js?v=25.0.1', 'live.js?v=25.0.1', 'research.js?v=25.0.1', 'research2.js?v=25.0.1', 'markets.js?v=25.0.1', 'news.js?v=25.0.1', 'imagegen.js?v=25.0.1', 'visual.js?v=25.0.1', 'research3.js?v=25.0.1', 'klinik2.js?v=25.0.1', 'forecast.js?v=25.0.1', 'picks.js?v=25.0.1', 'expert.js?v=25.0.1', 'voice2.js?v=25.0.1', 'ultron.js?v=25.0.1', 'ultron-life.js?v=25.0.1', 'guardian.js?v=25.0.1', 'uretken.js?v=25.0.1', 'gunluk.js?v=25.0.1', 'pratik.js?v=25.0.1', 'izle.js?v=25.0.1', 'video.js?v=25.0.1', 'analiz.js?v=25.0.1', 'verim.js?v=25.0.1', 'ekler.js?v=25.0.1', 'kum.js', 'voice-engine.js?v=25.0.1', 'audiohub.js?v=25.0.1', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=25.0.1'];
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
