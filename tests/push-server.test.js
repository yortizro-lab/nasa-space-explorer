const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const webPush = require("web-push");

test("configured server exposes push configuration and persists an opted-in subscription", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nasa-push-server-"));
  const keys = webPush.generateVAPIDKeys();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NASA_API_KEY: "", PORT: "0", PUSH_DATA_DIR: dir,
      VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:test@example.com", PUSH_ADMIN_TOKEN: "test-token" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const port = await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/listening on 0\.0\.0\.0:(\d+)/);
      if (match) resolve(match[1]);
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Server exited: ${code}`)));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  const config = await fetch(`${base}/api/push/config`);
  assert.equal(config.status, 200);
  assert.equal((await config.json()).publicKey, keys.publicKey);
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/testing",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  };
  const response = await fetch(`${base}/api/push/subscription`, {
    method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify(subscription),
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "subscriptions.json"))).subscriptions.length, 1);
  assert.equal((await fetch(`${base}/api/push/send`, { method: "POST" })).status, 401);
});
