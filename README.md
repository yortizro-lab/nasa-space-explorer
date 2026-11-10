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

If the older APOD API is unavailable, rate-limited, or returns NASA's logo
instead of a discovery, the browser retrieves the matching dates from NASA
Science's public APOD service instead, including the title, explanation, and
image together. If both services fail, the gallery displays an error. Image
and video entries without usable media show a link to the original discovery.

The Mars section loads NASA Image and Video Library search results about the
Curiosity rover on demand. Each card uses the image and description from the
same library record; the library date is not necessarily the date a photo was
taken. This public library does not use a NASA API key. The former Mars Rover
Photos API is unavailable, so these records use image links rather than its
`img_src` field.

## Offline access

After you visit the site online, its service worker saves the website files and
previously requested NASA data and NASA-hosted images. When a network request
fails, saved responses may be shown with a notice that they can be out of date.
Only previously requested data and images are available offline; videos,
external images, and uncached dates still require a connection. Loading images
and data online first does not guarantee permanent storage: browsers can remove
cached content. Data and image caches are each limited to 100 entries.

Offline access requires HTTPS (or localhost) and a browser that supports service
workers. The first visit must be online. After the worker installs, reload the
page online so the worker can save the discovery requests. Updates to the worker
take effect after older open tabs close. To test, visit some discoveries online,
wait for them to load, then disconnect and reload the same site and date range.

## Install on your home screen

Open the site over HTTPS or localhost. When your browser offers a native install
prompt, select **Install App** and follow the prompt. Otherwise, select
**Install Options** for instructions. On iPhone or iPad, open the site in Safari,
tap **Share**, then **Add to Home Screen**. On other browsers, look for
**Install app** or **Add to Home screen** in the browser menu. Browser support
and install eligibility vary, and the native prompt may not appear immediately,
after dismissal, or if the app is already installed. An installed app uses the
same offline cache described above.

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
   Review the machine size and costs. Fly generates a
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
4. If using the daily notifications feature, configure the volume and secrets
   described in [Daily notifications](#daily-notifications) before deploying.
   The configured volume is required by `fly.toml`.
5. Deploy and open the app:

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

## Daily notifications

The Fly-hosted site can send an opt-in push notification with the NASA
Astronomy Picture of the Day title at approximately **14:00 UTC**. The welcome
section has buttons to enable or turn off notifications for the current device.
Permission is requested only when the visitor clicks enable. Browser support
varies; on iPhone/iPad, use a supported iOS version and add the app to the home
screen first. GitHub Pages cannot send these notifications by itself.

Push subscriptions contain browser push endpoints and keys. They are stored on
the Fly volume until the visitor turns notifications off or the push service
reports the subscription expired. Volume snapshots and backups may retain old
subscriptions. The configuration below uses a **single Fly machine** and volume;
do not scale it to multiple machines without shared storage and coordination.
Provisioning and storage may incur charges. Back up the volume if you need to
preserve subscriptions.

1. Install dependencies locally with `npm ci`. Generate VAPID keys locally
   with `npx web-push generate-vapid-keys`. Treat the private key as a secret.
2. Before deploying, create the volume in the Fly app's region:

   ```bash
   fly volumes create push_data --region lax --size 1 -a nasa-space-explorer
   ```

3. Configure Fly secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, and `PUSH_ADMIN_TOKEN`. `VAPID_SUBJECT` must be a `mailto:`
   address or an HTTPS contact URL. Generate a long random admin token (for
   example, `openssl rand -hex 32`). Use Fly's secret management UI or
   `fly secrets import --stage` with secure input; never commit or post secret
   values. Keep the VAPID key pair stable or existing subscriptions must opt in
   again.
4. Add the **same** `PUSH_ADMIN_TOKEN` as a GitHub Actions repository secret
   under **Settings → Secrets and variables → Actions**. The workflow sends an
   authenticated request to the Fly app daily. GitHub may delay scheduled
   runs; the workflow can also be started manually from the Actions tab. It
   sends each stored subscription at most once per UTC date on successful
   delivery; failed deliveries can be retried by running the workflow again.
5. Deploy with `fly deploy --ha=false`, then verify the app and the workflow.
   If today's APOD is not yet available, the workflow reports a failure rather
   than sending incorrect information; retry after publication. If the Fly
   secrets or push storage are misconfigured, the rest of the website still
   works but push is disabled; check the server logs.

Avoid entering private keys in browser code or `fly.toml`. On local development,
push can be configured through the same environment variables with
`PUSH_DATA_DIR=.push-data`; the directory is git-ignored.

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
