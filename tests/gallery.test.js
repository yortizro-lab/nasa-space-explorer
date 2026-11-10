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
    this.hidden = false;
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
  replaceWith(element) { this.replacement = element; }
}

class TestDOMParser {
  parseFromString(html) {
    const source = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    return {
      body: { textContent: html.replace(/<[^>]*>/g, "") },
      querySelector: () => source ? { getAttribute: () => source } : null,
    };
  }
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

async function setup(navigator) {
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
    document, navigator, HTMLElement: Element, DOMParser: TestDOMParser, URL, URLSearchParams, Date, Math, Set,
    console: { error() {}, warn() {} },
    async fetch(url) {
      const parsed = new URL(url);
      const params = Object.fromEntries(parsed.searchParams);
      if (parsed.hostname === "science.nasa.gov") params.scienceDate = parsed.pathname.split("/").pop();
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

test("gallery, featured image and modal use each discovery's corresponding image", async () => {
  const app = await setup();
  app.setHandler((params) => ({
    status: 200,
    data: entries(params.start_date, params.end_date).map((entry) => ({
      ...entry, url: `https://example.com/${entry.date}.jpg`,
      hdurl: `https://example.com/${entry.date}-hd.jpg`,
    })),
  }));
  await app.load("2020-01-01");
  const card = app.elements.get("galleryContainer").children[0];
  assert.equal(card.children[0].src, "https://example.com/2020-01-01.jpg");
  assert.equal(app.elements.get("featured").children[0].src, "https://example.com/2020-01-01-hd.jpg");
  card.listeners.click({ target: { closest: () => null } });
  assert.equal(app.elements.get("modalImage").src, "https://example.com/2020-01-01-hd.jpg");
  assert.equal(app.elements.get("modalTitle").textContent, "2020-01-01");
  app.elements.get("modalImage").onerror();
  assert.equal(app.elements.get("modalImage").src, "https://example.com/2020-01-01.jpg");
  app.elements.get("modalImage").onerror();
  assert.equal(app.elements.get("modalImage").hidden, true);
  assert.equal(app.elements.get("modalMediaError").hidden, false);
});

test("broken or absent image URLs show a discovery-specific fallback, not a NASA logo", async () => {
  const app = await setup();
  const discovery = {
    date: "2020-01-01", title: "Test", media_type: "image",
    url: "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png",
    hdurl: "https://example.com/real.jpg",
  };
  app.context.testDiscovery = discovery;
  const image = vm.runInContext("createMedia(testDiscovery, false)", app.context);
  assert.equal(image.src, "https://example.com/real.jpg");
  image.listeners.error();
  assert.match(image.replacement.children[0].href, /ap200101\.html$/);
  assert.match(image.replacement.children[0].textContent, /Image unavailable/);
  discovery.hdurl = "";
  const fallback = vm.runInContext("createMedia(testDiscovery, false)", app.context);
  assert.match(fallback.children[0].textContent, /Image unavailable/);
});

test("NASA logo responses are replaced with matching NASA Science APOD records", async () => {
  const app = await setup();
  app.setHandler((params) => {
    if (params.scienceDate) {
      const date = `20${params.scienceDate.slice(0, 2)}-${params.scienceDate.slice(2, 4)}-${params.scienceDate.slice(4, 6)}`;
      return { status: 200, data: {
        date, title: `Title ${date}`, explanation: "<strong>Explanation:</strong> Space",
        media_type: "image", hdurl: `https://assets.science.nasa.gov/${date}.jpg`,
        permalink: `https://science.nasa.gov/${date}`,
      } };
    }
    return { status: 200, data: entries(params.start_date, params.end_date).map((entry) => ({
      ...entry, title: "NASA Science",
      url: "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png",
    })) };
  });
  await app.load("2020-01-01");
  const cards = app.elements.get("galleryContainer").children;
  assert.equal(cards.length, 9);
  assert.equal(cards[0].children[0].src, "https://assets.science.nasa.gov/2020-01-01.jpg");
  assert.equal(cards[0].children[1].children[1].textContent, "Title 2020-01-01");
  cards[0].listeners.click({ target: { closest: () => null } });
  assert.equal(app.elements.get("modalLink").href, "https://science.nasa.gov/2020-01-01");
  assert.equal(app.elements.get("modalExplanation").textContent, "Explanation: Space");
  assert.equal(app.calls.length, 10);
});

test("NASA Science displays nine discoveries when the APOD API is rate-limited or unavailable", async () => {
  const app = await setup();
  for (const status of [429, 503, 403]) {
    app.setHandler((params) => {
      if (!params.scienceDate) return { status, data: { error: "APOD unavailable" } };
      const date = `20${params.scienceDate.slice(0, 2)}-${params.scienceDate.slice(2, 4)}-${params.scienceDate.slice(4, 6)}`;
      return { status: 200, data: {
        date, title: `Title ${date}`, explanation: "Details",
        media_type: "image", hdurl: `https://assets.science.nasa.gov/${date}.jpg`,
      } };
    });
    await app.load("2020-01-01");
    assert.equal(app.elements.get("galleryContainer").children.length, 9);
    assert.equal(app.elements.get("errorMessage").textContent, "");
    assert.equal(app.elements.get("loadingMessage").textContent, "");
  }
});

test("NASA Science is used when the APOD request fails at the network layer", async () => {
  const app = await setup();
  app.setHandler((params) => {
    if (!params.scienceDate) throw new Error("Network unavailable");
    const date = `20${params.scienceDate.slice(0, 2)}-${params.scienceDate.slice(2, 4)}-${params.scienceDate.slice(4, 6)}`;
    return { status: 200, data: { date, title: date, media_type: "image", hdurl: "https://example.com/image.jpg" } };
  });
  await app.load("2020-01-01");
  assert.equal(app.elements.get("galleryContainer").children.length, 9);
});

test("unavailable today in NASA Science retries with nine previous days", async () => {
  const app = await setup();
  app.setHandler((params) => {
    if (!params.scienceDate) return { status: 429, data: { error: "Rate limit" } };
    const date = `20${params.scienceDate.slice(0, 2)}-${params.scienceDate.slice(2, 4)}-${params.scienceDate.slice(4, 6)}`;
    if (date === app.today) return { status: 404, data: {} };
    return { status: 200, data: { date, title: date, media_type: "image", hdurl: "https://example.com/image.jpg" } };
  });
  await app.load(app.today);
  assert.equal(app.elements.get("galleryContainer").children.length, 9);
  assert.match(app.elements.get("errorMessage").textContent, /not available yet/);
});

test("offline startup retries the prior nine saved days when today's discovery is not cached", async () => {
  const app = await setup({ onLine: false });
  app.setHandler((params) => {
    if (!params.scienceDate) return { status: 429, data: { error: "Rate limit" } };
    const date = `20${params.scienceDate.slice(0, 2)}-${params.scienceDate.slice(2, 4)}-${params.scienceDate.slice(4, 6)}`;
    if (date === app.today) throw new Error("offline");
    return { status: 200, data: { date, title: date, media_type: "image", hdurl: "https://example.com/image.jpg" } };
  });
  await app.load(app.today);
  assert.equal(app.elements.get("galleryContainer").children.length, 9);
  assert.match(app.elements.get("errorMessage").textContent, /not available offline/);
});

test("failure of both services is displayed instead of an empty gallery", async () => {
  const app = await setup();
  app.setHandler((params) => params.scienceDate
    ? { status: 503, data: {} }
    : { status: 429, data: { error: "Rate limit" } });
  await app.load("2020-01-01");
  assert.equal(app.elements.get("galleryContainer").children.length, 0);
  assert.match(app.elements.get("errorMessage").textContent, /Both NASA discovery services failed/);
  assert.equal(app.elements.get("loadingMessage").textContent, "");
  assert.equal(app.elements.get("searchButton").disabled, false);
});

test("NASA Science video records keep the video, thumbnail and article together", async () => {
  const app = await setup();
  app.setHandler((params) => {
    if (params.scienceDate) {
      return { status: 200, data: {
        date: "2020-01-01", title: "Video", media_type: "video",
        hdurl: "https://assets.science.nasa.gov/video-thumb.jpg",
        permalink: "https://science.nasa.gov/video-article/",
        explanation: "<p>Watch space</p>",
        basic_html: '<iframe src="//www.youtube.com/embed/example"></iframe>',
      } };
    }
    return { status: 200, data: [{
      date: "2020-01-01", url: "https://science.nasa.gov/images/nasa-logo.png",
    }] };
  });
  const results = await vm.runInContext(
    'fetchApod({ start_date: "2020-01-01", end_date: "2020-01-01" })', app.context
  );
  assert.equal(results[0].url, "https://www.youtube.com/embed/example");
  assert.equal(results[0].thumbnail_url, "https://assets.science.nasa.gov/video-thumb.jpg");
  assert.equal(results[0].permalink, "https://science.nasa.gov/video-article/");
});

test("video thumbnails use the associated image and fall back when broken", async () => {
  const app = await setup();
  app.context.testDiscovery = {
    date: "2020-01-01", title: "Video", media_type: "video",
    url: "https://www.youtube.com/embed/example",
    thumbnail_url: "https://example.com/thumb.jpg",
  };
  const image = vm.runInContext("createMedia(testDiscovery, false)", app.context);
  assert.equal(image.src, "https://example.com/thumb.jpg");
  image.listeners.error();
  assert.equal(image.replacement.children[0].href, "https://www.youtube.com/embed/example");
});

test("HTTP image URLs are upgraded to HTTPS and unsafe URLs are not used", async () => {
  const app = await setup();
  app.context.testDiscovery = {
    date: "2020-01-01", title: "Test", media_type: "image",
    url: "http://example.com/image.jpg", hdurl: "javascript:alert(1)",
  };
  const image = vm.runInContext("createMedia(testDiscovery, true)", app.context);
  assert.equal(image.src, "https://example.com/image.jpg");
  image.listeners.error();
  assert.match(image.replacement.children[0].textContent, /Image unavailable/);
});

test("Mars gallery uses each NASA library record's image and matching details", async () => {
  const app = await setup();
  app.setHandler(() => ({ status: 200, data: { collection: { items: [
    { data: [{ nasa_id: "PIA123", title: "Rover view", date_created: "2020-05-01T00:00:00Z", description: "A Mars view" }],
      links: [{ rel: "alternate", render: "image", href: "https://images-assets.nasa.gov/small.jpg" },
        { rel: "canonical", render: "image", href: "https://images-assets.nasa.gov/original.jpg" }] },
    { data: [{ nasa_id: "PIA456", title: "Second view", date_created: "2021-01-01T00:00:00Z", description: "Another view" }],
      links: [] },
  ] } } }));
  await app.elements.get("marsButton").listeners.click();
  const cards = app.elements.get("marsGallery").children;
  assert.equal(cards.length, 2);
  assert.equal(cards[0].children[0].src, "https://images-assets.nasa.gov/small.jpg");
  assert.match(cards[1].children[0].children[0].textContent, /Image unavailable/);
  cards[0].listeners.click({ target: { closest: () => null } });
  assert.equal(app.elements.get("modalImage").src, "https://images-assets.nasa.gov/original.jpg");
  assert.equal(app.elements.get("modalTitle").textContent, "Rover view");
  assert.equal(app.elements.get("modalExplanation").textContent, "A Mars view");
  assert.equal(app.elements.get("modalDate").textContent, "Library date: 2020-05-01");
  assert.equal(app.elements.get("modalLink").href, "https://images.nasa.gov/details-PIA123");
  assert.equal(app.elements.get("marsLoading").textContent, "");
  assert.equal(app.elements.get("marsButton").disabled, false);
});

test("Mars gallery reports API errors and clears loading state", async () => {
  const app = await setup();
  app.setHandler(() => ({ status: 429, data: {} }));
  await app.elements.get("marsButton").listeners.click();
  assert.match(app.elements.get("marsError").textContent, /HTTP 429/);
  assert.equal(app.elements.get("marsGallery").children.length, 0);
  assert.equal(app.elements.get("marsLoading").textContent, "");
  assert.equal(app.elements.get("marsButton").disabled, false);
});
