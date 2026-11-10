const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_BODY_BYTES = 16384;
const MAX_SUBSCRIPTIONS = 10000;

function createPushService(env, options = {}) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_ADMIN_TOKEN, PUSH_DATA_DIR } = env;
  const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT && PUSH_ADMIN_TOKEN && PUSH_DATA_DIR);
  if (!configured) {
    console.warn("Push notifications disabled: VAPID keys, subject, admin token, or data directory missing.");
    return null;
  }
  const webPush = options.webPush || require("web-push");
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  fs.mkdirSync(PUSH_DATA_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(PUSH_DATA_DIR, "subscriptions.json");
  let state = { subscriptions: [] };
  if (fs.existsSync(file)) {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(state.subscriptions)) throw new Error("Invalid push subscription store.");
  }
  let sending = false;

  function persist() {
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  function trustedEndpoint(endpoint) {
    try {
      const url = new URL(endpoint);
      return url.protocol === "https:" && !url.port && !url.username && !url.password &&
        (url.hostname === "fcm.googleapis.com" ||
         url.hostname === "updates.push.services.mozilla.com" ||
         url.hostname.endsWith(".push.apple.com") ||
         url.hostname.endsWith(".notify.windows.com"));
    } catch {
      return false;
    }
  }

  function sameOrigin(req) {
    if (!req.headers.origin || !req.headers.host) return false;
    try {
      const origin = new URL(req.headers.origin);
      return origin.host === req.headers.host &&
        (origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)));
    } catch {
      return false;
    }
  }

  async function readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new Error("Request too large.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  function authorized(req) {
    const actual = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${PUSH_ADMIN_TOKEN}`);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  async function handle(req, res, pathname, send) {
    if (pathname === "/api/push/config" && req.method === "GET") {
      return send(res, 200, { publicKey: VAPID_PUBLIC_KEY });
    }
    if (pathname === "/api/push/subscription" && ["POST", "DELETE"].includes(req.method)) {
      if (!sameOrigin(req)) return send(res, 403, { error: "Origin not allowed." });
      let body;
      try {
        body = await readBody(req);
      } catch {
        return send(res, 400, { error: "Invalid subscription request." });
      }
      if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 4096 || !trustedEndpoint(body.endpoint)) {
        return send(res, 400, { error: "Invalid push endpoint." });
      }
      if (req.method === "DELETE") {
        state.subscriptions = state.subscriptions.filter((item) => item.subscription.endpoint !== body.endpoint);
      } else {
        if (!body.keys || typeof body.keys.p256dh !== "string" || typeof body.keys.auth !== "string" ||
            !/^[A-Za-z0-9_-]{80,100}$/.test(body.keys.p256dh) ||
            !/^[A-Za-z0-9_-]{20,30}$/.test(body.keys.auth)) {
          return send(res, 400, { error: "Invalid subscription keys." });
        }
        const index = state.subscriptions.findIndex((item) => item.subscription.endpoint === body.endpoint);
        if (index < 0 && state.subscriptions.length >= MAX_SUBSCRIPTIONS) return send(res, 503, { error: "Subscription limit reached." });
        const item = { subscription: { endpoint: body.endpoint, keys: body.keys }, lastSent: index < 0 ? null : state.subscriptions[index].lastSent };
        if (index < 0) state.subscriptions.push(item);
        else state.subscriptions[index] = item;
      }
      persist();
      return send(res, 200, { ok: true });
    }
    if (pathname === "/api/push/send" && req.method === "POST") {
      if (!authorized(req)) return send(res, 401, { error: "Unauthorized." });
      if (sending) return send(res, 409, { error: "Notification delivery is already running." });
      sending = true;
      try {
        const date = new Date().toISOString().slice(0, 10);
        const url = `https://science.nasa.gov/wp-json/wp/v2/apod-basic/${date.slice(2).replace(/-/g, "")}`;
        const response = await (options.fetch || fetch)(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`NASA APOD service returned HTTP ${response.status}.`);
        const entry = await response.json();
        if (entry.date !== date || typeof entry.title !== "string" || !entry.title.trim()) {
          throw new Error("NASA APOD response has an invalid date or title.");
        }
        const payload = JSON.stringify({ title: "Today's Space Discovery", body: entry.title.slice(0, 180), date });
        let failed = 0;
        let sent = 0;
        for (const item of [...state.subscriptions]) {
          if (!state.subscriptions.includes(item) || item.lastSent === date) continue;
          try {
            await webPush.sendNotification(item.subscription, payload, { TTL: 86400 });
            if (state.subscriptions.includes(item)) item.lastSent = date;
            sent++;
          } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              state.subscriptions = state.subscriptions.filter((current) => current !== item);
            } else {
              failed++;
              console.error(`Push delivery failed (HTTP ${error.statusCode || "unknown"}).`);
            }
          }
          persist();
        }
        if (failed) return send(res, 502, { error: "Some notifications could not be delivered.", sent, failed });
        return send(res, 200, { ok: true, sent });
      } catch (error) {
        console.error("Daily notification delivery failed:", error.message);
        return send(res, 502, { error: "Daily notification delivery failed. Check server logs." });
      } finally {
        sending = false;
      }
    }
    return send(res, 404, { error: "Not found." });
  }
  return { handle };
}

module.exports = { createPushService };
