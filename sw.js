const SHELL = 'lxx-shell-v7';
const DATA = 'lxx-data-v4';
const SHELL_FILES = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'assets/wood.jpg', 'assets/wood-dark.jpg', 'assets/parchment.jpg', 'assets/vellum-dark.jpg',
  'fonts/cardo-greek-400-normal.woff2', 'fonts/cardo-greek-400-italic.woff2', 'fonts/cardo-greek-700-normal.woff2',
  'fonts/cardo-greek-ext-400-normal.woff2', 'fonts/cardo-greek-ext-400-italic.woff2', 'fonts/cardo-greek-ext-700-normal.woff2',
  'fonts/cardo-latin-400-normal.woff2', 'fonts/cardo-latin-400-italic.woff2', 'fonts/cardo-latin-700-normal.woff2',
  'fonts/cardo-latin-ext-400-normal.woff2',
  'data/books.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Book text, word data and the dictionary don't change between releases: cache first.
  if (/\/data\/[A-Za-z0-9]+\.json$/.test(url.pathname) && !url.pathname.endsWith('/books.json')) {
    e.respondWith(
      caches.open(DATA).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // App shell: serve the saved copy immediately, refresh it in the background.
  e.respondWith(
    caches.open(SHELL).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { net.catch(() => {}); return hit; }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') return c.match('index.html');
      return new Response('', { status: 504 });
    })
  );
});
