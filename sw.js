/* sw.js — the service worker.
 *
 * A service worker is a small script the browser keeps even after the page is
 * closed. It sits between the app and the network, so it can answer requests
 * from a cache when there is no connection. That is what lets this app work
 * offline once it has been installed.
 *
 * The strategy here is NETWORK FIRST: always try the network, and fall back to
 * the cache only when the network fails. That matters for this lab, because it
 * means every change you merge shows up the next time you open the app. A
 * cache-first worker would keep serving the old copy and your Part F changes
 * would seem to vanish.
 *
 * Every path is relative, because the app lives at
 * https://<username>.github.io/<repository>/ and not at the root of a domain.
 */
'use strict';

/* Bump this when the list of files below changes. The old cache is deleted on
 * activate, so a new version cleans up after the previous one. */
var CACHE = 'electromart-v1';

/* The app shell plus the data, so a first-time offline load still works. */
var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'ccc.js',
  'manifest.webmanifest',
  'data/electromart.csv',
  'data/assumptions.csv',
  'data/canyon_audio_supply.csv',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* Add files one at a time so a single missing file does not stop the
         whole install. */
      return Promise.all(ASSETS.map(function (asset) {
        return cache.add(new Request(asset, { cache: 'reload' })).catch(function () {
          /* ignore: the file will be cached on first use instead */
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE ? null : caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  /* Only handle plain page requests for this app. Leave anything else alone. */
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        /* Keep a fresh copy for the next time there is no network. */
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          /* Offline on a link into the app: give them the page itself. */
          if (request.mode === 'navigate') {
            return caches.match('index.html');
          }
          return Response.error();
        });
      })
  );
});
