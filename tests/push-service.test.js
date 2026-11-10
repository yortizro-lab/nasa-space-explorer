const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createPushService } = require("../push-service");

function setup(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nasa-push-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = {
    VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private",
    VAPID_SUBJECT: "mailto:test@example.com", PUSH_ADMIN_TOKEN: "test-token", PUSH_DATA_DIR: dir,
  };
  const sent = [];
  const webPush = {
    setVapidDetails() {},
    async sendNotification(subscription, payload) {
      sent.push({ subscription, payload: JSON.parse(payload) });
      if (overrides.failure) throw Object.assign(new Error("delivery failed"), { statusCode: overrides.failure });
    },
  };
  const options = {
    webPush,
    fetch: async () => ({ ok: true, json: async () => ({
      date: new Date().toISOString().slice(0, 10), title: "Test galaxy",
    }) }),
    ...overrides.options,
  };
  function service() { return createPushService(env, options); }
  async function request(instance, method, url, body, headers = {}) {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.method = method;
    req.headers = { host: "example.com", origin: "https://example.com", ...headers };
    let result;
    await instance.handle(req, {}, url, (res, status, data) => { result = { status, data }; });
    return result;
  }
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  };
  return { dir, sent, service, request, subscription };
}

test("subscriptions persist, send once daily and can be removed", async (t) => {
  const app = setup(t);
  let service = app.service();
  assert.equal((await app.request(service, "POST", "/api/push/subscription", app.subscription)).status, 200);
  service = app.service();
  assert.equal((await app.request(service, "POST", "/api/push/send", null)).status, 401);
  const headers = { authorization: "Bearer test-token" };
  assert.equal((await app.request(service, "POST", "/api/push/send", null, headers)).data.sent, 1);
  assert.equal(app.sent[0].payload.body, "Test galaxy");
  service = app.service();
  assert.equal((await app.request(service, "POST", "/api/push/send", null, headers)).data.sent, 0);
  assert.equal((await app.request(service, "DELETE", "/api/push/subscription", { endpoint: app.subscription.endpoint })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app.dir, "subscriptions.json"))).subscriptions.length, 0);
});

test("rejects foreign origins, arbitrary endpoints and malformed keys", async (t) => {
  const app = setup(t);
  const service = app.service();
  assert.equal((await app.request(service, "POST", "/api/push/subscription", app.subscription, { origin: "https://evil.example" })).status, 403);
  assert.equal((await app.request(service, "POST", "/api/push/subscription", { ...app.subscription, endpoint: "https://127.0.0.1/private" })).status, 400);
  assert.equal((await app.request(service, "POST", "/api/push/subscription", { ...app.subscription, keys: {} })).status, 400);
});

test("expired subscriptions are removed; temporary failures remain retryable", async (t) => {
  for (const status of [410, 503]) {
    const app = setup(t, { failure: status });
    const service = app.service();
    await app.request(service, "POST", "/api/push/subscription", app.subscription);
    const result = await app.request(service, "POST", "/api/push/send", null, { authorization: "Bearer test-token" });
    assert.equal(result.status, status === 410 ? 200 : 502);
    const records = JSON.parse(fs.readFileSync(path.join(app.dir, "subscriptions.json"))).subscriptions;
    assert.equal(records.length, status === 410 ? 0 : 1);
    if (records.length) assert.equal(records[0].lastSent, null);
  }
});

test("unavailable APOD returns an error and does not send notifications", async (t) => {
  const app = setup(t, { options: { fetch: async () => ({ ok: false, status: 404 }) } });
  const service = app.service();
  await app.request(service, "POST", "/api/push/subscription", app.subscription);
  const result = await app.request(service, "POST", "/api/push/send", null, { authorization: "Bearer test-token" });
  assert.equal(result.status, 502);
  assert.equal(app.sent.length, 0);
});
