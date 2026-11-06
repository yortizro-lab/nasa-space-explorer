# NASA Space Explorer

Explore NASA's Astronomy Picture of the Day (APOD) images and videos.

## How the API key works

Your browser asks `server.js` for discoveries. The server adds your NASA API key
when it requests data from NASA, then sends the results back to the browser.
Keep the key private: do not put it in `script.js`, share it, or commit it to Git.

An earlier key was committed to this repository's Git history. Revoke that key
and get a new one from [NASA](https://api.nasa.gov/); removing it from the
current files does not remove it from history.

## Run locally

1. Install Node.js 22 or later.
2. Get a NASA API key from https://api.nasa.gov/.
3. In the project folder, create a file named `.env` containing this line,
   replacing the example with your key:

   ```text
   NASA_API_KEY=your_key_here
   ```

   The `.env` file is ignored by Git. Never commit or share it.
4. In the project folder, run `node server.js`. Open
   http://localhost:3000, or use the forwarded port 3000 in VS Code Codespaces.
   Leave the terminal running; press Ctrl+C to stop the server.

The gallery normally starts at the selected date and shows nine consecutive
days. Near today, the range shifts backward to include nine days. If today's
APOD is not yet available, the app shows the nine days ending yesterday and
displays a notice. An incomplete API response is shown as an error.

## Publish on Fly.io

Fly.io runs the server and stores the NASA key as a secret. Its public `fly.dev`
address is separate from GitHub Pages. **Fly.io may charge for hosting**: review
its [pricing](https://fly.io/docs/about/pricing/) and account requirements
before creating or deploying an app.

1. Create a [Fly.io account](https://fly.io/) and
   [install flyctl](https://fly.io/docs/flyctl/install/) in your Codespace or
   computer. Follow the installer's instructions to add it to your PATH, then
   run `fly auth login`.
2. In this project's folder, run:

   ```bash
   fly launch --no-deploy
   ```

   Follow the prompts to choose an app name, organization, and region. No
   database is required. Review the machine size and costs. Fly generates a
   `fly.toml` file; confirm its HTTP service `internal_port` is `3000`, matching
   the Dockerfile. The app name must be unique.
3. Add your **new** NASA key as a Fly secret before deploying. In a Bash
   terminal, run the following; enter the key at the prompt. It will not be
   displayed as you type or placed in your shell history:

   ```bash
   read -rs -p "NASA API key: " NASA_KEY; printf '\n'
   printf 'NASA_API_KEY=%s\n' "$NASA_KEY" | fly secrets import --stage
   unset NASA_KEY
   ```

   Fly encrypts the secret and supplies it to the server at runtime. Do not put
   the key in `fly.toml` or the Dockerfile. `fly secrets list` shows the names
   of configured secrets, not their values.
4. Deploy and open the app:

   ```bash
   fly deploy --ha=false
   fly apps open
   ```

   `--ha=false` avoids automatically creating a spare machine on the first
   deployment; check your Fly dashboard for actual machine count and charges.
   If deployment fails, check `fly logs` and confirm `NASA_API_KEY` is set.
   A NASA key can still be rate-limited; if this happens, wait for the limit to
   reset.

The Dockerfile copies only the files needed to run the site. `.dockerignore`
keeps `.env` and other unneeded files out of the build context.

## GitHub Pages

The GitHub Actions workflow also publishes the static site to GitHub Pages.
Pages cannot run `server.js`, so the GitHub Pages version uses NASA's public,
heavily rate-limited `DEMO_KEY` and does not use your Fly secret. Share the
Fly.io address instead when you want visitors to use the server-backed version.

## Tests

Run `node --test tests/gallery.test.js` to check gallery date and loading logic.
