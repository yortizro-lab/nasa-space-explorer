// Static file server + NASA APOD proxy. The API key stays on the server.
// Usage: NASA_API_KEY=your_key node server.js   (or put it in a .env file)
const http = require("http");
const fs = require("fs");
const path = require("path");

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
if (!API_KEY) {
  console.error("Missing NASA_API_KEY. Add it to the project-root .env file.");
  process.exit(1);
}
const ROOT = __dirname;
const ALLOWED = ["date", "start_date", "end_date", "count", "thumbs"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};
const PUBLIC_FILES = new Set(["index.html", "style.css", "script.js"]);

async function proxyApod(url, res) {
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
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(body);
  } catch {
    send(res, 502, { error: "Could not reach NASA API" });
  }
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/apod") return proxyApod(url, res);

  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const isAsset = rel.startsWith("imagenes/") && !rel.includes("..");
  if (!PUBLIC_FILES.has(rel) && !isAsset) return send(res, 404, { error: "Not found" });
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`NASA Space Explorer on http://localhost:${PORT}`));
