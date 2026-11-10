const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "notifications.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const permissionSource = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<script src="notifications\.js">/)[1];
const previousSource = source
  .replace('    if (typeof window.updateNotificationPermission === "function") window.updateNotificationPermission();\n', "")
  .replace('    enableNotifications.disabled = Notification.permission === "denied";', "    enableNotifications.disabled = false;");

async function setup({ permission = "granted", initialPermission = "default", configured = true, github = false, supported = true, secure = true, permissionError = false, oldPage = false, oldScript = false } = {}) {
  const elements = {};
  for (const id of ["enableNotifications", "disableNotifications", "notificationStatus", "requestNotificationPermission", "notificationPermissionStatus"]) {
    elements[id] = { hidden: id === "disableNotifications", disabled: id === "enableNotifications" || id === "requestNotificationPermission",
      addEventListener(name, fn) { this[name] = fn; } };
  }
  if (oldPage) {
    delete elements.requestNotificationPermission;
    delete elements.notificationPermissionStatus;
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
  const notification = {
    permission: initialPermission,
    async requestPermission() {
      permissions++;
      if (permissionError) throw new Error("Permission request failed");
      this.permission = permission;
      return permission;
    },
  };
  const context = {
    document: { getElementById(id) { return elements[id]; } },
    window: { PushManager: {}, isSecureContext: secure, location: { hostname: github ? "test.github.io" : "app.fly.dev" } },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
    atob, Uint8Array, console: { error() {} },
    async fetch(url, options = {}) {
      requests.push({ url, options });
      return { ok: configured, async json() { return { publicKey: "QUJD", error: "Not configured" }; } };
    },
  };
  if (supported) {
    context.window.Notification = notification;
    context.Notification = notification;
  }
  vm.createContext(context);
  if (!oldPage) vm.runInContext(permissionSource, context);
  vm.runInContext(oldScript ? previousSource : source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, requests, notification, get permissions() { return permissions; } };
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
  assert.equal(app.elements.enableNotifications.disabled, true);
});

test("permission can be requested without a configured push service", async () => {
  for (const options of [{ configured: false }, { github: true }]) {
    const app = await setup(options);
    assert.equal(app.elements.enableNotifications.disabled, true);
    assert.equal(app.permissions, 0);
    assert.equal(app.elements.requestNotificationPermission.disabled, false);
    const requestCount = app.requests.length;
    const pending = app.elements.requestNotificationPermission.click();
    assert.equal(app.permissions, 1);
    await pending;
    assert.equal(app.requests.length, requestCount);
    assert.equal(app.elements.requestNotificationPermission.disabled, true);
    assert.match(app.elements.notificationPermissionStatus.textContent, /allowed.*does not enable daily reminders/);
  }
});

test("notification permission handles denial, dismissal, and errors", async () => {
  for (const [options, message, disabled] of [
    [{ permission: "denied" }, /blocked/, true],
    [{ permission: "default" }, /not granted.*try again/, false],
    [{ permissionError: true }, /Could not request/, false],
  ]) {
    const app = await setup(options);
    await app.elements.requestNotificationPermission.click();
    assert.equal(app.permissions, 1);
    assert.equal(app.elements.requestNotificationPermission.disabled, disabled);
    assert.match(app.elements.notificationPermissionStatus.textContent, message);
    assert.equal(app.requests.length, 1);
  }
});

test("existing permission and unsupported environments are reflected without prompting", async () => {
  for (const [options, message, disabled] of [
    [{ initialPermission: "granted" }, /allowed/, true],
    [{ initialPermission: "denied" }, /blocked/, true],
    [{ supported: false }, /not supported.*home screen/, true],
    [{ secure: false }, /HTTPS or localhost/, true],
  ]) {
    const app = await setup(options);
    assert.equal(app.permissions, 0);
    assert.equal(app.elements.requestNotificationPermission.disabled, disabled);
    assert.match(app.elements.notificationPermissionStatus.textContent, message);
  }
});

test("daily notification permission updates the separate permission control", async () => {
  const app = await setup();
  await app.elements.enableNotifications.click();
  assert.equal(app.elements.requestNotificationPermission.disabled, true);
  assert.match(app.elements.notificationPermissionStatus.textContent, /allowed/);
});

test("blocking permission prevents enabling daily reminders", async () => {
  const app = await setup({ permission: "denied" });
  assert.equal(app.elements.enableNotifications.disabled, false);
  await app.elements.requestNotificationPermission.click();
  assert.equal(app.elements.enableNotifications.disabled, true);
  assert.match(app.elements.notificationStatus.textContent, /blocked/);
});

test("page exposes the permission control and status", () => {
  assert.match(html, /<button id="requestNotificationPermission"[^>]*aria-describedby="notificationPermissionStatus"[^>]*disabled>/);
  assert.match(html, /<p id="notificationPermissionStatus"[^>]*role="status">/);
});

test("new notification script works with an older cached page", async () => {
  const app = await setup({ oldPage: true });
  assert.equal(app.elements.enableNotifications.disabled, false);
  await app.elements.enableNotifications.click();
  assert.equal(app.permissions, 1);
  assert.equal(app.requests.at(-1).options.method, "POST");
  assert.equal(app.elements.disableNotifications.hidden, false);
  await app.elements.disableNotifications.click();
  assert.equal(app.requests.at(-1).options.method, "DELETE");
});

test("permission control works with an older cached notification script", async () => {
  const app = await setup({ oldScript: true });
  assert.equal(app.elements.requestNotificationPermission.disabled, false);
  await app.elements.requestNotificationPermission.click();
  assert.equal(app.permissions, 1);
  assert.match(app.elements.notificationPermissionStatus.textContent, /allowed/);
  assert.equal(app.requests.length, 1);
  await app.elements.enableNotifications.click();
  assert.equal(app.requests.at(-1).options.method, "POST");
});
