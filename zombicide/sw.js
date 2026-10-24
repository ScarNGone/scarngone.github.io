// Carnet de survie Zombicide : fonctionnement hors ligne.
// Code : réseau d'abord, copie locale si le réseau ne répond pas.
// Polices et icônes : copie locale d'abord.
const VERSION = 'zombicide-2026-10-24c';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'data.js', 'manifest.webmanifest',
  'fonts/saira-stencil-one.woff2', 'fonts/atkinson-400.woff2', 'fonts/atkinson-700.woff2',
  'fonts/saira-condensed-500.woff2', 'fonts/saira-condensed-700.woff2',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
const STATIC = /\/(fonts|icons)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('zombicide-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(p, ms){
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); });
  });
}
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
  if(url.origin !== self.location.origin || !url.pathname.includes('/zombicide/')) return;
  e.respondWith(STATIC.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
