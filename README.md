# nasa-space-explorer
 NASA Space Explorer-Discover the Universe

## Running with the NASA API (secure proxy)

The browser never sees the NASA API key. `server.js` serves the site and forwards
`/api/apod` requests to NASA, adding the key on the server.

1. Get a key at https://api.nasa.gov/ (`DEMO_KEY` works but is heavily rate-limited).
2. Create a `.env` file (git-ignored): `NASA_API_KEY=your_key_here`
3. Run `node server.js` and open http://localhost:3000

For hosting, deploy `server.js` (or an equivalent serverless function) and set
`NASA_API_KEY` as an environment variable in the host's dashboard.
The key previously committed in `script.js` is in git history: revoke it and request a new one.
