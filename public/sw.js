/* Only the public offline shell and versioned application assets are cached.
 * Authenticated HTML and API responses are never stored here. */
const CACHE = 'alma-shell-v1';
const SHELL = '/sin-conexion';
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const visited = new Set();
    async function load(path) {
      const url = new URL(path, self.location.origin);
      if (url.origin !== self.location.origin || visited.has(url.href)) return;
      if (url.pathname !== SHELL && !url.pathname.startsWith('/_astro/')) return;
      visited.add(url.href);
      const response = await fetch(url.href, { cache: 'reload' });
      if (!response.ok || response.redirected) throw new Error('Offline shell unavailable');
      await cache.put(url.href, response.clone());
      if (!url.pathname.endsWith('.js') && !url.pathname.endsWith('.css') && url.pathname !== SHELL) return;
      const source = await response.text();
      const refs = [...source.matchAll(/["'`](\/_astro\/[\w./-]+|\.\/[\w./-]+\.(?:js|css))["'`]/g)].map((match) => new URL(match[1], url).href);
      await Promise.all(refs.map(load));
    }
    await load(SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('alma-shell-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(SHELL).then((response) => response || Response.error())));
  } else if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
      if (response.ok) { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
      return response;
    })));
  }
});
