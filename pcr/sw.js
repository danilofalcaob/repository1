/* Service worker — cache do app shell para uso offline (offline-first) */
var CACHE = 'pcr-manejo-v5';
var ASSETS = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).then(function (resp) {
        return resp;
      }).catch(function () { return cached; });
    })
  );
});

/* ---- Web Push (pager Código Azul, opcional) ---- */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: '🔵 CÓDIGO AZUL', body: event.data ? event.data.text() : '' }; }
  var title = data.title || '🔵 CÓDIGO AZUL';
  var roles = Array.isArray(data.roles) && data.roles.length ? ('\n' + data.roles.join('\n')) : '';
  var body = (data.body || 'Acionamento da equipe') + roles;
  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    tag: 'codigo-azul',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 300],
    data: data
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
      for (var i = 0; i < cl.length; i++) { if ('focus' in cl[i]) return cl[i].focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
