# nasa-space-explorer
 NASA Space Explorer-Discover the Universe

## Running with the NASA API (secure proxy)

The browser never sees the NASA API key. `server.js` serves the site and forwards
`/api/apod` requests to NASA, adding the key on the server.

1. Get a key at https://api.nasa.gov/ (`DEMO_KEY` works but is heavily rate-limited).
2. Create a `.env` file (git-ignored): `NASA_API_KEY=your_key_here`
3. Run `node server.js` and open http://localhost:3000

The selected date starts a nine-day gallery when those days are available. For
dates close to today, the gallery shifts back to show nine consecutive days,
while featuring the selected date. If today's APOD has not been published, the
gallery shows the nine days ending yesterday and notes that today's entry is
unavailable. An incomplete API response is reported as an error.

For hosting, deploy `server.js` (or an equivalent serverless function) and set
`NASA_API_KEY` as an environment variable in the host's dashboard.
The key previously committed in `script.js` is in git history: revoke it and request a new one.

## Publishing on GitHub Pages

The GitHub Actions workflow publishes the static site to GitHub Pages whenever
changes are pushed to `main`. In the repository settings, set **Pages > Build
and deployment > Source** to **GitHub Actions**.

GitHub Pages cannot run `server.js`, so the site uses NASA's public `DEMO_KEY`
for browser requests when opened from a `*.github.io` domain. NASA heavily
rate-limits this key; use the server setup above for a private API key and more
reliable API access.
