const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "install.js"), "utf8");

function setup({ installed = false, userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  const windowListeners = {};
  const button = {
    hidden: false, disabled: false,
    addEventListener(name, callback) { this[name] = callback; },
  };
  const status = { hidden: true, textContent: "" };
  const window = {
    matchMedia() { return { matches: installed }; },
    addEventListener(name, callback) { windowListeners[name] = callback; },
  };
  vm.runInNewContext(source, {
    window,
    navigator: { userAgent, platform, maxTouchPoints },
    document: { getElementById(id) { return id === "installButton" ? button : status; } },
    console: { error() {} },
  });
  return { button, status, windowListeners };
}

test("install button opens the browser prompt and handles acceptance", async () => {
  const app = setup();
  let prevented = false;
  let prompted = 0;
  app.windowListeners.beforeinstallprompt({
    preventDefault() { prevented = true; },
    async prompt() { prompted++; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  await app.button.click();
  assert.equal(prevented, true);
  assert.equal(prompted, 1);
  assert.match(app.status.textContent, /accepted/);
  assert.equal(app.button.disabled, false);
  app.windowListeners.appinstalled();
  assert.equal(app.button.hidden, true);
  assert.match(app.status.textContent, /installed/);
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
    await app.button.click();
    assert.match(app.status.textContent, /Safari.*Share.*Add to Home Screen/);
  }
  const desktop = setup();
  await desktop.button.click();
  assert.match(desktop.status.textContent, /browser menu/);
});

test("the install button is hidden in standalone mode", () => {
  const app = setup({ installed: true });
  assert.equal(app.button.hidden, true);
});

test("manifest icons have correct dimensions and are present", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
    assert.ok(icon);
    const data = fs.readFileSync(path.join(root, icon.src));
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});
