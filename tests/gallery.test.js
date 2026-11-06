const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const DAY_MS = 86400000;

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  set innerHTML(value) {
    this.children = [];
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setAttribute() {}
  removeAttribute() {}
  focus() {}
}

function entries(start, end) {
  const result = [];
  for (let time = Date.parse(`${start}T00:00:00Z`);
    time <= Date.parse(`${end}T00:00:00Z`); time += DAY_MS) {
    const date = new Date(time).toISOString().slice(0, 10);
    result.push({
      date, title: date, explanation: "Explanation",
      media_type: "image", url: "https://example.com/image.jpg",
    });
  }
  return result;
}

async function setup() {
  const elements = new Map();
  const calls = [];
  let handler = (params) => ({ status: 200, data: entries(params.start_date, params.end_date) });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement() { return new Element(); },
    addEventListener() {},
    body: new Element(),
  };
  const context = vm.createContext({
    window: { location: { hostname: "example.github.io" } },
    document, HTMLElement: Element, URL, URLSearchParams, Date, Math, Set,
    console: { error() {} },
    async fetch(url) {
      const params = Object.fromEntries(new URL(url).searchParams);
      calls.push(params);
      const result = await handler(params);
      return { ok: result.status === 200, status: result.status, json: async () => result.data };
    },
  });
  vm.runInContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));
  calls.length = 0;
  return {
    elements, calls, context,
    setHandler(value) { handler = value; },
    load(start, focus = start) {
      return vm.runInContext(`loadDiscoveries(${JSON.stringify(start)}, ${JSON.stringify(focus)})`, context);
    },
    today: vm.runInContext("todayString", context),
  };
}

function offset(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

test("historical and earliest selections request exactly nine days", async () => {
  const app = await setup();
  for (const date of ["2020-01-01", "1995-06-16"]) {
    await app.load(date);
    const request = app.calls.at(-1);
    assert.equal(request.start_date, date);
    assert.equal(request.end_date, offset(date, 8));
    assert.equal(app.elements.get("galleryContainer").children.length, 9);
    assert.equal(app.elements.get("loadingMessage").textContent, "");
  }
});

test("recent selections shift the range back and feature the selected day", async () => {
  const app = await setup();
  for (const daysAgo of [0, 1, 7, 8]) {
    const selected = offset(app.today, -daysAgo);
    await app.load(selected);
    const request = app.calls.at(-1);
    assert.equal(request.end_date, app.today);
    assert.equal(request.start_date, offset(app.today, -8));
    assert.equal(app.elements.get("galleryContainer").children.length, 9);
    const featuredInfo = app.elements.get("featured").children[1];
    assert.equal(featuredInfo.children[0].textContent, selected);
  }
});

test("unpublished today retries the previous nine days after a 400 response", async () => {
  const app = await setup();
  app.setHandler((params) => params.end_date === app.today
    ? { status: 400, data: { msg: "Not available" } }
    : { status: 200, data: entries(params.start_date, params.end_date) });
  await app.load(app.today);
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].start_date, offset(app.today, -9));
  assert.equal(app.calls[1].end_date, offset(app.today, -1));
  assert.equal(app.elements.get("galleryContainer").children.length, 9);
  assert.match(app.elements.get("errorMessage").textContent, /not available yet/);
});

test("a successful response omitting today also retries the previous nine days", async () => {
  const app = await setup();
  app.setHandler((params) => ({
    status: 200,
    data: entries(params.start_date, params.end_date === app.today
      ? offset(app.today, -1) : params.end_date),
  }));
  await app.load(app.today);
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].start_date, offset(app.today, -9));
  assert.equal(app.elements.get("galleryContainer").children.length, 9);
});

test("loading is visible during a request and incomplete results show an error", async () => {
  const app = await setup();
  let finish;
  app.setHandler(() => new Promise((resolve) => { finish = resolve; }));
  const pending = app.load("2020-01-01");
  assert.notEqual(app.elements.get("loadingMessage").textContent, "");
  assert.equal(app.elements.get("searchButton").disabled, true);
  finish({ status: 200, data: entries("2020-01-01", "2020-01-07") });
  await pending;
  assert.equal(app.elements.get("galleryContainer").children.length, 0);
  assert.equal(app.elements.get("loadingMessage").textContent, "");
  assert.match(app.elements.get("errorMessage").textContent, /nine consecutive/);
  assert.equal(app.elements.get("searchButton").disabled, false);
});

test("gallery hover and keyboard focus apply the image zoom", () => {
  assert.match(css, /\.space-card:hover img,\s*\.space-card:focus-visible img\s*\{\s*transform:\s*scale\(1\.08\)/);
  assert.match(css, /\.space-card img\s*\{\s*transition:\s*transform/);
});
