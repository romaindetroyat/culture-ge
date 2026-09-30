/* Service worker : tout le jeu est mis en cache pour fonctionner hors ligne. */
const VERSION = 'culturege-v15';
const FICHIERS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'reponse.js',
  'quotidien.js',
  'profil.js',
  'soiree.js',
  'vendor/supabase.js',
  'cartes.json',
  'manifest.webmanifest',
  'icons/logo.webp',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(c => c !== VERSION).map(c => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord (pour recevoir les mises à jour), cache en secours hors ligne.
self.addEventListener('fetch', event => {
  const req = event.request;
  // Seulement les fichiers du jeu : pas Supabase, ni les fichiers audio de la voix (…/culture-ge-voix/).
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    fetch(req)
      .then(rep => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(VERSION).then(cache => cache.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});

// Rappel de la carte du jour (voir quotidien.js et supabase/functions/rappels).
self.addEventListener('push', event => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = { corps: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(m.titre || 'Culture Gé', {
    body: m.corps || 'La carte du jour vous attend.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: m.tag || 'trivial1000',
    data: { url: new URL(m.url || './?jour', self.registration.scope).href },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenetres => {
    const ouverte = fenetres.find(f => f.url.startsWith(self.registration.scope));
    if (ouverte) return ouverte.navigate(url).then(f => (f || ouverte).focus()).catch(() => ouverte.focus());
    return self.clients.openWindow(url);
  }));
});
