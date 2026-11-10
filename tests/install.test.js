const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "install.js"), "utf8");

function setup({ installed = false, userAgent = "", platform = "", maxTouchPoints = 0, loading = false, secure = true } = {}) {
  const windowListeners = {};
  const documentListeners = {};
  const button = {
    hidden: false, disabled: false, textContent: "",
    addEventListener(name, callback) { this[name] = callback; },
  };
  const status = { hidden: true, textContent: "" };
  const window = {
    isSecureContext: secure,
    matchMedia() { return { matches: installed }; },
    addEventListener(name, callback) { windowListeners[name] = callback; },
  };
  vm.runInNewContext(source, {
    window,
    navigator: { userAgent, platform, maxTouchPoints },
    document: {
      readyState: loading ? "loading" : "complete",
      addEventListener(name, callback) { documentListeners[name] = callback; },
      getElementById(id) { return id === "installButton" ? button : status; },
    },
    console: { error() {} },
  });
  return { button, status, windowListeners, documentListeners };
}

test("install button opens the browser prompt and handles acceptance", async () => {
  const app = setup();
  assert.equal(app.button.textContent, "Install Options");
  let prevented = false;
  let prompted = 0;
  app.windowListeners.beforeinstallprompt({
    preventDefault() { prevented = true; },
    async prompt() { prompted++; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  assert.equal(app.button.textContent, "Install App");
  await app.button.click();
  assert.equal(prevented, true);
  assert.equal(prompted, 1);
  assert.match(app.status.textContent, /accepted/);
  assert.equal(app.button.disabled, false);
  app.windowListeners.appinstalled();
  assert.equal(app.button.hidden, true);
  assert.match(app.status.textContent, /installed/);
});

test("captures the install prompt before the page finishes loading", async () => {
  const app = setup({ loading: true });
  let prompted = 0;
  app.windowListeners.beforeinstallprompt({
    preventDefault() {},
    async prompt() { prompted++; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  app.documentListeners.DOMContentLoaded();
  assert.equal(app.button.textContent, "Install App");
  await app.button.click();
  assert.equal(prompted, 1);
});

test("installation event is not overwritten by a pending prompt result", async () => {
  const app = setup();
  let resolveChoice;
  app.windowListeners.beforeinstallprompt({
    preventDefault() {},
    async prompt() {},
    userChoice: new Promise((resolve) => { resolveChoice = resolve; }),
  });
  const pending = app.button.click();
  app.windowListeners.appinstalled();
  resolveChoice({ outcome: "accepted" });
  await pending;
  assert.equal(app.button.hidden, true);
  assert.match(app.status.textContent, /has been installed/);
});

test("installation before page initialization is reflected in the UI", () => {
  const app = setup({ loading: true });
  app.windowListeners.appinstalled();
  app.documentListeners.DOMContentLoaded();
  assert.equal(app.button.hidden, true);
  assert.match(app.status.textContent, /has been installed/);
});

test("dismissed and failed prompts give usable instructions", async () => {
  for (const fails of [false, true]) {
    const app = setup();
    app.windowListeners.beforeinstallprompt({
      preventDefault() {},
      async prompt() { if (fails) throw new Error("blocked"); },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    await app.button.click();
    assert.match(app.status.textContent, fails ? /Could not open/ : /canceled/);
    assert.equal(app.button.disabled, false);
  }
});

test("iOS and unsupported browsers show manual installation instructions", async () => {
  for (const device of [{ userAgent: "iPhone" }, { platform: "MacIntel", maxTouchPoints: 5 }]) {
    const app = setup(device);
    assert.equal(app.button.textContent, "Install on Home Screen");
    assert.equal(app.status.hidden, false);
    assert.match(app.status.textContent, /Safari.*Share.*Add to Home Screen.*Edit Actions.*Open as Web App.*tap Add/);
    await app.button.click();
    assert.match(app.status.textContent, /Safari.*Share.*Add to Home Screen.*Edit Actions/);
    const installedApp = setup({ ...device, installed: true });
    assert.equal(installedApp.button.hidden, true);
    assert.equal(installedApp.status.hidden, true);
  }
  const desktop = setup();
  await desktop.button.click();
  assert.match(desktop.status.textContent, /browser menu/);
  const insecure = setup({ secure: false });
  await insecure.button.click();
  assert.match(insecure.status.textContent, /requires HTTPS or localhost/);
  const insecureIphone = setup({ userAgent: "iPhone", secure: false });
  assert.equal(insecureIphone.status.hidden, true);
  await insecureIphone.button.click();
  assert.match(insecureIphone.status.textContent, /requires HTTPS or localhost/);
});

test("the install button is hidden in standalone mode", () => {
  const app = setup({ installed: true });
  assert.equal(app.button.hidden, true);
});

test("manifest icons have correct dimensions and are present", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
    assert.ok(icon);
    const data = fs.readFileSync(path.join(root, icon.src));
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});

test("install listener loads in the document head before page scripts", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /<head>[\s\S]*<script src="install\.js"><\/script>[\s\S]*<\/head>/);
  assert.equal((html.match(/<script src="install\.js"><\/script>/g) || []).length, 1);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
});
