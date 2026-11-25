'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-25.0.3';
const SHELL = ['./', 'app.js?v=25.0.3', 'plus.js?v=25.0.3', 'hud.js?v=25.0.3', 'features.js?v=25.0.3', 'control.js?v=25.0.3', 'voices.js?v=25.0.3', 'social.js?v=25.0.3', 'agent.js?v=25.0.3', 'figure.js?v=25.0.3', 'sentinel.js?v=25.0.3', 'brain.js?v=25.0.3', 'pro.js?v=25.0.3', 'ultra.js?v=25.0.3', 'klinik.js?v=25.0.3', 'live.js?v=25.0.3', 'research.js?v=25.0.3', 'research2.js?v=25.0.3', 'markets.js?v=25.0.3', 'news.js?v=25.0.3', 'imagegen.js?v=25.0.3', 'visual.js?v=25.0.3', 'research3.js?v=25.0.3', 'klinik2.js?v=25.0.3', 'forecast.js?v=25.0.3', 'picks.js?v=25.0.3', 'expert.js?v=25.0.3', 'voice2.js?v=25.0.3', 'ultron.js?v=25.0.3', 'ultron-life.js?v=25.0.3', 'guardian.js?v=25.0.3', 'uretken.js?v=25.0.3', 'gunluk.js?v=25.0.3', 'pratik.js?v=25.0.3', 'izle.js?v=25.0.3', 'video.js?v=25.0.3', 'analiz.js?v=25.0.3', 'verim.js?v=25.0.3', 'ekler.js?v=25.0.3', 'kum.js', 'voice-engine.js?v=25.0.3', 'audiohub.js?v=25.0.3', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=25.0.3'];
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
