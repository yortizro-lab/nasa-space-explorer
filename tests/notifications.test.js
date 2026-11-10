const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "notifications.js"), "utf8");

async function setup({ permission = "granted", configured = true, github = false } = {}) {
  const elements = {};
  for (const id of ["enableNotifications", "disableNotifications", "notificationStatus"]) {
    elements[id] = { hidden: id === "disableNotifications", disabled: id === "enableNotifications",
      addEventListener(name, fn) { this[name] = fn; } };
  }
  const requests = [];
  let current = null;
  let permissions = 0;
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "key", auth: "auth" } }; },
    async unsubscribe() { current = null; return true; },
  };
  const pushManager = {
    async getSubscription() { return current; },
    async subscribe() { current = subscription; return subscription; },
  };
  const notification = { permission: "default", async requestPermission() { permissions++; return permission; } };
  const context = {
    document: { getElementById(id) { return elements[id]; } },
    window: { PushManager: {}, Notification: notification, location: { hostname: github ? "test.github.io" : "app.fly.dev" } },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
    Notification: notification,
    atob, Uint8Array, console: { error() {} },
    async fetch(url, options = {}) {
      requests.push({ url, options });
      return { ok: configured, async json() { return { publicKey: "QUJD", error: "Not configured" }; } };
    },
  };
  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, requests, get permissions() { return permissions; } };
}

test("permission is requested only after clicking enable, and unsubscribe removes the device", async () => {
  const app = await setup();
  assert.equal(app.permissions, 0);
  assert.equal(app.elements.enableNotifications.disabled, false);
  await app.elements.enableNotifications.click();
  assert.equal(app.permissions, 1);
  assert.equal(app.requests.at(-1).options.method, "POST");
  assert.equal(app.elements.disableNotifications.hidden, false);
  await app.elements.disableNotifications.click();
  assert.equal(app.requests.at(-1).options.method, "DELETE");
  assert.match(app.elements.notificationStatus.textContent, /off/);
});

test("denied permission does not subscribe", async () => {
  const app = await setup({ permission: "denied" });
  await app.elements.enableNotifications.click();
  assert.equal(app.requests.length, 1);
  assert.match(app.elements.notificationStatus.textContent, /not allowed/);
});

test("unconfigured and static deployments do not offer enabling notifications", async () => {
  for (const options of [{ configured: false }, { github: true }]) {
    const app = await setup(options);
    assert.equal(app.elements.enableNotifications.disabled, true);
    assert.equal(app.permissions, 0);
  }
});
