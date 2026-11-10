const CACHE_PREFIX = "nasa-space-explorer-";
const CACHE_VERSION = "v1";
const SHELL_CACHE = `${CACHE_PREFIX}shell-v3`;
const DATA_CACHE = `${CACHE_PREFIX}data-${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}images-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, DATA_CACHE, IMAGE_CACHE];
const SHELL_FILES = ["index.html", "style.css", "script.js", "install.js", "notifications.js", "manifest.json", "imagenes/galaxy.jpg", "imagenes/icon-192.png", "imagenes/icon-512.png"];
const SCOPE = new URL(self.registration.scope);
const shellUrls = new Set(SHELL_FILES.map((file) => new URL(file, SCOPE).href));
const cacheQueues = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll([...shellUrls])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) =>
      name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(name)
    ).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isPublicData(url) {
  if ([...url.searchParams.keys()].some((key) => /key|token|secret|auth/i.test(key) &&
      !(url.hostname === "api.nasa.gov" && key === "api_key" && url.searchParams.getAll(key).every((value) => value === "DEMO_KEY")))) {
    return false;
  }
  return (url.origin === SCOPE.origin && url.pathname === "/api/apod") ||
    (url.origin === "https://api.nasa.gov" && url.pathname === "/planetary/apod") ||
    (url.origin === "https://science.nasa.gov" && url.pathname.startsWith("/wp-json/wp/v2/apod-basic/")) ||
    (url.origin === "https://images-api.nasa.gov" && url.pathname === "/search");
}

function isNasaImage(request, url) {
  return request.destination === "image" && url.protocol === "https:" &&
    (url.hostname === "nasa.gov" || url.hostname.endsWith(".nasa.gov")) &&
    ![...url.searchParams.keys()].some((key) => /key|token|secret|auth/i.test(key));
}

function saveResponse(cacheName, request, response, limit) {
  const previous = cacheQueues.get(cacheName) || Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const cache = await caches.open(cacheName);
    await cache.delete(request);
    await cache.put(request, response);
    if (limit) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
    }
  });
  cacheQueues.set(cacheName, pending);
  return pending.catch((error) => console.warn("Offline cache update failed:", error));
}

async function notifyCachedContent(clientId) {
  if (!clientId) return;
  const client = await self.clients.get(clientId);
  if (client) client.postMessage({ type: "CACHED_CONTENT" });
}

async function networkFirst(event, cacheName, limit, fallbackUrl) {
  try {
    const response = await fetch(event.request);
    if (response.ok || (cacheName === IMAGE_CACHE && response.type === "opaque")) {
      event.waitUntil(saveResponse(cacheName, event.request, response.clone(), limit));
    }
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(fallbackUrl || event.request);
    if (!cached) throw error;
    if (cacheName !== SHELL_CACHE) {
      event.waitUntil(notifyCachedContent(event.clientId).catch((notificationError) =>
        console.warn("Could not notify the page about cached content:", notificationError)
      ));
    }
    return cached;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.cache === "no-store") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === SCOPE.origin &&
      (url.pathname === SCOPE.pathname || url.pathname === new URL("index.html", SCOPE).pathname)) {
    event.respondWith(networkFirst(event, SHELL_CACHE, 0, new URL("index.html", SCOPE).href));
  } else if (shellUrls.has(url.href)) {
    event.respondWith(networkFirst(event, SHELL_CACHE));
  } else if (isPublicData(url)) {
    event.respondWith(networkFirst(event, DATA_CACHE, 100));
  } else if (isNasaImage(request, url)) {
    event.respondWith(networkFirst(event, IMAGE_CACHE, 100));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    const data = event.data.json();
    const date = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : "";
    const url = new URL(SCOPE.href);
    if (date) url.searchParams.set("date", date);
    await self.registration.showNotification(
      typeof data.title === "string" ? data.title : "Space Discovery",
      {
        body: typeof data.body === "string" ? data.body : "Explore today's discovery.",
        icon: new URL("imagenes/icon-192.png", SCOPE).href,
        tag: date ? `apod-${date}` : "apod",
        data: { url: url.href },
      }
    );
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || SCOPE.href);
    if (target.origin !== SCOPE.origin || target.pathname !== SCOPE.pathname) return;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => client.url === target.href);
    if (existing) return existing.focus();
    await self.clients.openWindow(target.href);
  })());
});
