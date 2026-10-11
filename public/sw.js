// Permite abrir la app sin señal (portería con mala señal). Solo guarda archivos de la propia app:
// los datos de Supabase nunca pasan por aquí (los maneja la app con su propia copia local).
const VERSION = 'porteria-v3';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(['./', './casa/', './manifest.webmanifest', './casa/manifest.webmanifest', './logo.png', './icono-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas (Portería en la raíz, Mi Casa en /casa/): primero la red; sin señal, la última guardada.
  if (req.mode === 'navigate') {
    const pagina = url.pathname.includes('/casa/') ? './casa/' : './';
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put(pagina, copia));
          return r;
        })
        .catch(() => caches.match(pagina)),
    );
    return;
  }

  // Archivos con hash en el nombre (/assets/): nunca cambian, se sirven desde la copia.
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (guardado) =>
          guardado ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copia = r.clone();
              caches.open(VERSION).then((c) => c.put(req, copia));
            }
            return r;
          }),
      ),
    );
    return;
  }

  // Resto (logo, íconos, manifiesto): la copia al instante y se actualiza en segundo plano.
  e.respondWith(
    caches.match(req).then((guardado) => {
      const red = fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return r;
        })
        .catch(() => guardado);
      return guardado || red;
    }),
  );
});
