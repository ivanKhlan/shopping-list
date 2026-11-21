// Сервис-воркер: приложение открывается без интернета.
// Стратегия «сначала сеть»: с интернетом всегда свежая версия, без него — из кэша.
// Запросы к API (POST) не трогаем — их офлайн-очередь обрабатывает приложение.

const CACHE = 'shopping-list-v1';
const NETWORK_TIMEOUT_MS = 3000; // плохая связь в магазине: не ждём сеть вечно
const CACHEABLE_HOSTS = [self.location.host, 'telegram.org'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!CACHEABLE_HOSTS.includes(url.host)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Страницу с параметрами Telegram (#tgWebAppData, ?startapp) ищем без них.
      const key = req.mode === 'navigate' ? './index.html' : req;
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      });
      try {
        return await withTimeout(network, NETWORK_TIMEOUT_MS);
      } catch {
        const cached = await cache.match(key, { ignoreSearch: true });
        if (cached) return cached;
        return network; // в кэше нет — ждём сеть до конца
      }
    })(),
  );
});
