// Static file server + NASA APOD proxy. The API key stays on the server.
// Usage: NASA_API_KEY=your_key node server.js   (or put it in a .env file)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createPushService } = require("./push-service");

const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.NASA_API_KEY || "").trim();
let pushService;
try {
  pushService = createPushService(process.env);
} catch (error) {
  console.error(`Push notifications disabled: configuration or storage error (${error.name}).`);
}
if (!API_KEY) {
  console.error("NASA_API_KEY is missing. The site will start, but APOD requests will be unavailable.");
}
const ROOT = __dirname;
const ALLOWED = ["date", "start_date", "end_date", "count", "thumbs"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/manifest+json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};
const PUBLIC_FILES = new Set(["index.html", "manifest.json", "style.css", "script.js", "install.js", "notifications.js", "service-worker.js"]);

async function proxyApod(url, res) {
  if (!API_KEY) {
    return send(res, 503, { error: "NASA API key is not configured on the server." });
  }
  const params = new URLSearchParams();
  for (const key of ALLOWED) {
    const value = url.searchParams.get(key);
    if (value === null) continue;
    const valid = key === "count" ? /^\d{1,2}$/.test(value)
      : key === "thumbs" ? /^(true|false)$/.test(value)
      : DATE_RE.test(value);
    if (!valid) return send(res, 400, { error: `Invalid ${key}` });
    params.set(key, value);
  }
  params.set("api_key", API_KEY);
  try {
    const upstream = await fetch(`https://api.nasa.gov/planetary/apod?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    try {
      JSON.parse(body);
    } catch {
      console.error(`NASA API returned an unreadable response (HTTP ${upstream.status}).`);
      return send(res, upstream.ok ? 502 : upstream.status, {
        error: `NASA API returned an unreadable response (HTTP ${upstream.status}).`,
      });
    }
    res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch (error) {
    console.error(`NASA API request failed (${error.name || "Error"}).`);
    send(res, 502, { error: "Could not reach NASA API" });
  }
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/apod") return proxyApod(url, res);
  if (url.pathname.startsWith("/api/push/")) {
    if (!pushService) return send(res, 503, { error: "Push notifications are not configured on this server." });
    try {
      return await pushService.handle(req, res, url.pathname, send);
    } catch (error) {
      console.error("Push service error:", error.message);
      return send(res, 500, { error: "Push notification service failed." });
    }
  }

  let rel;
  try {
    rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return send(res, 400, { error: "Invalid URL encoding" });
  }
  const isAsset = rel.startsWith("imagenes/") && !rel.includes("..");
  if (!PUBLIC_FILES.has(rel) && !isAsset) return send(res, 404, { error: "Not found" });
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", function () {
  console.log(`NASA Space Explorer listening on 0.0.0.0:${this.address().port}`);
});
