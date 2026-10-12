// Clave Salsa : fonctionnement hors ligne.
// Code et données : réseau d'abord, copie locale si le réseau ne répond pas.
// Polices, icônes et bibliothèque de carte : copie locale d'abord.
const VERSION = 'clave-2026-10-12b';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest',
  'vendor/leaflet.js', 'vendor/leaflet.css',
  'fonts/archivo-latin.woff2', 'fonts/archivo-latin-ext.woff2',
  'fonts/figtree-400.woff2', 'fonts/figtree-500.woff2', 'fonts/figtree-600.woff2', 'fonts/figtree-700.woff2',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'data/events.json', 'data/meta.json', 'data/communes.json', 'data/depts.geo.json'
];
const STATIC = /\/(fonts|icons|vendor)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(p, ms){ return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); }); }

async function networkFirst(req){
  const cache = await caches.open(VERSION);
  const key = req.mode === 'navigate' ? 'index.html' : req.url.split('?')[0];
  try{
    const res = await withTimeout(fetch(req), 5000);
    if(res && res.ok) cache.put(key, res.clone());
    return res;
  }catch(err){
    const hit = await cache.match(key, {ignoreSearch: true});
    if(hit) return hit;
    throw err;
  }
}
async function cacheFirst(req){
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, {ignoreSearch: true});
  if(hit) return hit;
  const res = await fetch(req);
  if(res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  e.respondWith(STATIC.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
