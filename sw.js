'use strict';
// SATÜRN uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-28.0.2';
const SHELL = ['./', 'app.js?v=28.0.2', 'plus.js?v=28.0.2', 'kaynak.js?v=28.0.2', 'hud.js?v=28.0.2', 'features.js?v=28.0.2', 'control.js?v=28.0.2', 'voices.js?v=28.0.2', 'social.js?v=28.0.2', 'agent.js?v=28.0.2', 'figure.js?v=28.0.2', 'sentinel.js?v=28.0.2', 'brain.js?v=28.0.2', 'pro.js?v=28.0.2', 'ultra.js?v=28.0.2', 'klinik.js?v=28.0.2', 'live.js?v=28.0.2', 'research.js?v=28.0.2', 'research2.js?v=28.0.2', 'markets.js?v=28.0.2', 'news.js?v=28.0.2', 'imagegen.js?v=28.0.2', 'visual.js?v=28.0.2', 'research3.js?v=28.0.2', 'klinik2.js?v=28.0.2', 'forecast.js?v=28.0.2', 'picks.js?v=28.0.2', 'expert.js?v=28.0.2', 'voice2.js?v=28.0.2', 'ultron.js?v=28.0.2', 'ultron-life.js?v=28.0.2', 'guardian.js?v=28.0.2', 'uretken.js?v=28.0.2', 'gunluk.js?v=28.0.2', 'pratik.js?v=28.0.2', 'izle.js?v=28.0.2', 'video.js?v=28.0.2', 'analiz.js?v=28.0.2', 'verim.js?v=28.0.2', 'ekler.js?v=28.0.2', 'yeni.js?v=28.0.2', 'entegre.js?v=28.0.2', 'yeni2.js?v=28.0.2', 'yeni3.js?v=28.0.2', 'kahin.js?v=28.0.2', 'kum.js', 'voice-engine.js?v=28.0.2', 'audiohub.js?v=28.0.2', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=28.0.2'];
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
