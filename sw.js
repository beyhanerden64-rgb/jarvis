'use strict';
// JARVIS uygulama kabuğu: arayüz çevrimdışı da açılır; /api/ istekleri asla önbelleğe alınmaz.
const CACHE = 'jarvis-app-12.1.1';
const SHELL = ['./', 'app.js?v=12.1.1', 'plus.js?v=12.1.1', 'hud.js?v=12.1.1', 'features.js?v=12.1.1', 'control.js?v=12.1.1', 'voices.js?v=12.1.1', 'social.js?v=12.1.1', 'agent.js?v=12.1.1', 'figure.js?v=12.1.1', 'sentinel.js?v=12.1.1', 'brain.js?v=12.1.1', 'pro.js?v=12.1.1', 'ultra.js?v=12.1.1', 'klinik.js?v=12.1.1', 'live.js?v=12.1.1', 'research.js?v=12.1.1', 'research2.js?v=12.1.1', 'ultron.js?v=12.1.1', 'ultron-life.js?v=12.1.1', 'voice-engine.js?v=12.1.1', 'audiohub.js?v=12.1.1', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'direct.js?v=12.1.1'];
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
