const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const root = path.join(__dirname, "..");

async function startServer(t, key) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nasa-server-test-"));
  fs.copyFileSync(path.join(root, "server.js"), path.join(dir, "server.js"));
  fs.copyFileSync(path.join(root, "index.html"), path.join(dir, "index.html"));
  const env = { ...process.env, NASA_API_KEY: key, PORT: "0" };
  delete env.NODE_OPTIONS;
  const child = spawn(process.execPath, [
    "--require", path.join(__dirname, "mock-nasa.js"), path.join(dir, "server.js"),
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stderr.on("data", (chunk) => { output += chunk; });
  const listening = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/listening on 0\.0\.0\.0:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Server exited before listening: ${code}\n${output}`)));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${await listening}`;
}

test("server starts without a key and reports a clear API error", async (t) => {
  const base = await startServer(t, "");
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /NASA Space Explorer/);
  const response = await fetch(`${base}/api/apod?date=2000-01-01`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});

test("proxy returns NASA data, rate limit errors and network errors without crashing", async (t) => {
  const base = await startServer(t, "test-key");
  let response = await fetch(`${base}/api/apod?date=2000-01-01`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { date: "2000-01-01" });
  response = await fetch(`${base}/api/apod?date=2000-01-02`);
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /unreadable response/);
  response = await fetch(`${base}/api/apod?date=2000-01-03`);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "Could not reach NASA API");
  assert.equal((await fetch(`${base}/api/apod?date=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/%zz`)).status, 400);
  assert.equal((await fetch(base)).status, 200);
});
