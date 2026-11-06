# NASA Space Explorer

Explore NASA's Astronomy Picture of the Day (APOD) images and videos.

## Choose how to run the app

- **Try it in your Codespace:** Follow [Run locally](#run-locally).
- **Share a public website using your NASA key:** Follow
  [Publish on Fly.io](#publish-on-flyio). Hosting may cost money.
- **Use the existing GitHub Pages site:** See [GitHub Pages](#github-pages).
  It uses a rate-limited demo key, not your personal key.

## Keep your NASA key private

The browser asks `server.js` for discoveries. The server adds the key to its
request to NASA and sends the results back to the browser without exposing the
key. Never put your key in `script.js`, commit it, or share it.

**Important:** An earlier key was committed to this repository's Git history.
Revoke that key and get a new one from [NASA](https://api.nasa.gov/). Removing
the old key from the current files does not remove it from Git history.

## Run locally

1. Open a terminal in VS Code and check Node.js:

   ```bash
   node --version
   ```

   Use Node.js 22 or later. If Node is missing or older, install a current
   version from [nodejs.org](https://nodejs.org/).
2. Get a NASA API key from [api.nasa.gov](https://api.nasa.gov/).
3. In the project folder, create a file named `.env`, or open it if it already
   exists. Add or update this line, replacing `your_key_here` with your key:

   ```text
   NASA_API_KEY=your_key_here
   ```

   The `.env` file is ignored by Git. Never commit or share it. Restart the
   server after changing the key. If the key is missing, the website still
   starts, but APOD requests return an error until a key is configured.
4. In the project folder, start the server:

   ```bash
   node server.js
   ```

5. On your computer, open http://localhost:3000. In a Codespace, open VS Code's
   **Ports** tab and click the forwarded address for port **3000**, or choose
   **Open in Browser** when prompted.

Leave the terminal running while you use the app. Press **Ctrl+C** in that
terminal to stop the server.

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
   computer. Follow the installer's instructions to add it to your PATH.
   Sign in from the terminal:

   ```bash
   fly auth login
   ```

   Complete the sign-in in your browser.
2. In this project's folder, run:

   ```bash
   fly launch --no-deploy
   ```

   Follow the prompts to choose an app name, organization, and region. No
   database is required. Review the machine size and costs. Fly generates a
   `fly.toml` file; confirm its HTTP service `internal_port` is `3000`, matching
   the Dockerfile. If a `PORT` environment variable is set, it must match
   `internal_port`. The app name must be unique.
3. Add your **new** NASA key as a Fly secret before deploying. In a Bash
   terminal, run the following; enter the key at the prompt. It will not be
   displayed as you type or placed in your shell history:

   ```bash
   read -rs -p "NASA API key: " NASA_KEY; printf '\n'
   printf 'NASA_API_KEY=%s\n' "$NASA_KEY" | fly secrets import --stage
   unset NASA_KEY
   ```

   If the import reports an error, resolve it and repeat this step before
   deploying. Fly encrypts the secret and supplies it to the server at runtime.
   Do not put the key in `fly.toml` or the Dockerfile. `fly secrets list` shows
   the names of configured secrets, not their values.
4. Deploy and open the app:

   ```bash
   fly deploy --ha=false
   fly apps open
   ```

   `--ha=false` avoids automatically creating a spare machine on the first
   deployment; check your Fly dashboard for actual machine count and charges.
   The second command opens the new Fly website in your browser. Share that
   address with others; it is different from your GitHub Pages address.

The Dockerfile copies only the files needed to run the site. `.dockerignore`
keeps `.env` and other unneeded files out of the build context.

## GitHub Pages

The GitHub Actions workflow also publishes the static site to GitHub Pages.
Pages cannot run `server.js`, so the GitHub Pages version uses NASA's public,
heavily rate-limited `DEMO_KEY` and does not use your Fly secret. Share the
Fly.io address instead when you want visitors to use the server-backed version.

## Troubleshooting

- **Missing NASA_API_KEY:** Check the `.env` line for local use, or run
  `fly secrets list` for Fly.io. Restart the local server after editing `.env`.
- **Rate limit exceeded:** Wait for NASA's limit to reset. GitHub Pages always
  uses `DEMO_KEY`, even if you have configured a key locally or on Fly.io.
- **Fly deployment fails:** Run `fly logs` and check that `NASA_API_KEY` is
  configured and that `internal_port` in `fly.toml` matches `PORT` (normally
  `3000`). A startup message reports the actual address and port.
- **The Codespace page does not open:** Make sure `node server.js` is still
  running, then open the forwarded port **3000** in the **Ports** tab.

## Tests

Run `node --test tests/*.test.js` to check gallery and server behavior.
