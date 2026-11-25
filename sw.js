'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-25.0.4';
const SHELL = ['./', 'app.js?v=25.0.4', 'plus.js?v=25.0.4', 'hud.js?v=25.0.4', 'features.js?v=25.0.4', 'control.js?v=25.0.4', 'voices.js?v=25.0.4', 'social.js?v=25.0.4', 'agent.js?v=25.0.4', 'figure.js?v=25.0.4', 'sentinel.js?v=25.0.4', 'brain.js?v=25.0.4', 'pro.js?v=25.0.4', 'ultra.js?v=25.0.4', 'klinik.js?v=25.0.4', 'live.js?v=25.0.4', 'research.js?v=25.0.4', 'research2.js?v=25.0.4', 'markets.js?v=25.0.4', 'news.js?v=25.0.4', 'imagegen.js?v=25.0.4', 'visual.js?v=25.0.4', 'research3.js?v=25.0.4', 'klinik2.js?v=25.0.4', 'forecast.js?v=25.0.4', 'picks.js?v=25.0.4', 'expert.js?v=25.0.4', 'voice2.js?v=25.0.4', 'ultron.js?v=25.0.4', 'ultron-life.js?v=25.0.4', 'guardian.js?v=25.0.4', 'uretken.js?v=25.0.4', 'gunluk.js?v=25.0.4', 'pratik.js?v=25.0.4', 'izle.js?v=25.0.4', 'video.js?v=25.0.4', 'analiz.js?v=25.0.4', 'verim.js?v=25.0.4', 'ekler.js?v=25.0.4', 'kum.js', 'voice-engine.js?v=25.0.4', 'audiohub.js?v=25.0.4', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=25.0.4'];
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
