'use strict';
// JARVIS uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-12.1.0';
const SHELL = ['./', 'app.js?v=12.1.0', 'plus.js?v=12.1.0', 'hud.js?v=12.1.0', 'features.js?v=12.1.0', 'control.js?v=12.1.0', 'voices.js?v=12.1.0', 'social.js?v=12.1.0', 'agent.js?v=12.1.0', 'figure.js?v=12.1.0', 'sentinel.js?v=12.1.0', 'brain.js?v=12.1.0', 'pro.js?v=12.1.0', 'ultra.js?v=12.1.0', 'klinik.js?v=12.1.0', 'live.js?v=12.1.0', 'research.js?v=12.1.0', 'research2.js?v=12.1.0', 'ultron.js?v=12.1.0', 'ultron-life.js?v=12.1.0', 'voice-engine.js?v=12.1.0', 'audiohub.js?v=12.1.0', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=12.1.0'];
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
