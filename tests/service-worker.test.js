const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");

function createWorker(scope = "https://example.test/project/") {
  const handlers = {};
  const stores = new Map();
  const messages = [];
  const notifications = [];
  const opened = [];
  let online = true;
  let status = 200;
  let claimed = false;
  const keyOf = (request) => typeof request === "string" ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(urls) { for (const url of urls) store.set(url, new Response(`precache:${url}`)); },
        async match(request) { return store.get(keyOf(request))?.clone(); },
        async delete(request) { return store.delete(keyOf(request)); },
        async put(request, response) { store.set(keyOf(request), response.clone()); },
        async keys() { return [...store.keys()]; },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    registration: { scope, async showNotification(title, options) { notifications.push({ title, options }); } },
    addEventListener(name, callback) { handlers[name] = callback; },
    clients: {
      async claim() { claimed = true; },
      async get() { return { postMessage(message) { messages.push(message); } }; },
      async matchAll() { return []; },
      async openWindow(url) { opened.push(url); },
    },
  };
  vm.runInNewContext(source, {
    self, caches, URL, console,
    async fetch() {
      if (!online) throw new Error("offline");
      return new Response("live", { status });
    },
  });
  async function lifecycle(name) {
    const tasks = [];
    handlers[name]({ waitUntil(task) { tasks.push(task); } });
    await Promise.all(tasks);
  }
  async function request(url, options = {}) {
    const tasks = [];
    let response;
    handlers.fetch({
      request: { url, method: "GET", cache: "default", destination: "", mode: "cors", ...options },
      clientId: "client",
      waitUntil(task) { tasks.push(task); },
      respondWith(task) { response = task; },
    });
    if (!response) return undefined;
    try {
      const result = await response;
      await Promise.all(tasks);
      return result;
    } finally {
      await Promise.all(tasks);
    }
  }
  return {
    stores, messages, notifications, opened, lifecycle, request,
    async dispatch(name, event) {
      const tasks = [];
      handlers[name]({ ...event, waitUntil(task) { tasks.push(task); } });
      await Promise.all(tasks);
    },
    setOnline(value) { online = value; },
    setStatus(value) { status = value; },
    get claimed() { return claimed; },
  };
}

test("push notification opens the date in the app and rejects external destinations", async () => {
  const worker = createWorker();
  await worker.dispatch("push", { data: { json: () => ({ title: "Discovery", body: "Galaxy", date: "2020-01-01" }) } });
  assert.equal(worker.notifications[0].title, "Discovery");
  assert.equal(worker.notifications[0].options.body, "Galaxy");
  const data = worker.notifications[0].options.data;
  assert.equal(data.url, "https://example.test/project/?date=2020-01-01");
  let closed = false;
  await worker.dispatch("notificationclick", { notification: { data, close() { closed = true; } } });
  assert.equal(closed, true);
  assert.equal(worker.opened[0], data.url);
  await worker.dispatch("notificationclick", { notification: { data: { url: "https://evil.example/" }, close() {} } });
  assert.equal(worker.opened.length, 1);
});

test("installs scoped shell and removes only old app caches", async () => {
  const worker = createWorker();
  await worker.lifecycle("install");
  const shell = worker.stores.get("nasa-space-explorer-shell-v3");
  assert.ok(shell.has("https://example.test/project/index.html"));
  assert.ok(shell.has("https://example.test/project/manifest.json"));
  assert.ok(shell.has("https://example.test/project/install.js"));
  assert.ok(shell.has("https://example.test/project/imagenes/icon-192.png"));
  worker.stores.set("nasa-space-explorer-shell-old", new Map());
  worker.stores.set("nasa-space-explorer-data-v1", new Map());
  worker.stores.set("another-app", new Map());
  await worker.lifecycle("activate");
  assert.equal(worker.stores.has("nasa-space-explorer-shell-old"), false);
  assert.equal(worker.stores.has("another-app"), true);
  assert.equal(worker.stores.has("nasa-space-explorer-data-v1"), true);
  assert.equal(worker.claimed, true);
});

test("offline navigation returns the saved shell at root and nested scopes", async () => {
  for (const scope of ["https://example.test/", "https://example.test/project/"]) {
    const worker = createWorker(scope);
    await worker.lifecycle("install");
    worker.setOnline(false);
    const response = await worker.request(scope, { mode: "navigate" });
    assert.match(await response.text(), /precache:.*index\.html/);
  }
});

test("saved NASA data and NASA images work offline and notify the page", async () => {
  const worker = createWorker();
  await worker.lifecycle("install");
  const data = "https://science.nasa.gov/wp-json/wp/v2/apod-basic/200101";
  const image = "https://assets.science.nasa.gov/image.jpg";
  assert.equal(await (await worker.request(data)).text(), "live");
  assert.equal(await (await worker.request(image, { destination: "image" })).text(), "live");
  worker.setOnline(false);
  assert.equal(await (await worker.request(data)).text(), "live");
  assert.equal(await (await worker.request(image, { destination: "image" })).text(), "live");
  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[0].type, "CACHED_CONTENT");
  await assert.rejects(worker.request("https://science.nasa.gov/wp-json/wp/v2/apod-basic/200102"), /offline/);
});

test("does not cache failed responses, private API keys, or non-NASA images", async () => {
  const worker = createWorker();
  const data = "https://science.nasa.gov/wp-json/wp/v2/apod-basic/200101";
  worker.setStatus(503);
  assert.equal((await worker.request(data)).status, 503);
  worker.setOnline(false);
  await assert.rejects(worker.request(data), /offline/);
  assert.equal(await worker.request("https://api.nasa.gov/planetary/apod?api_key=private"), undefined);
  assert.equal(await worker.request("https://example.test/api/apod?api_key=private"), undefined);
  assert.equal(await worker.request("https://other.example/image.jpg", { destination: "image" }), undefined);
  assert.equal(await worker.request(data, { method: "POST" }), undefined);
});

test("limits the number of saved data responses", async () => {
  const worker = createWorker();
  for (let i = 0; i < 105; i++) {
    await worker.request(`https://science.nasa.gov/wp-json/wp/v2/apod-basic/${i}`);
  }
  const cache = worker.stores.get("nasa-space-explorer-data-v1");
  assert.equal(cache.size, 100);
  assert.equal(cache.has("https://science.nasa.gov/wp-json/wp/v2/apod-basic/0"), false);
  assert.equal(cache.has("https://science.nasa.gov/wp-json/wp/v2/apod-basic/104"), true);
});
