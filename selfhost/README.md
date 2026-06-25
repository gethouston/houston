# Self-host Houston on a VPS (single user)

Run the whole Houston product on your own server: the **same engine** the desktop
app and the cloud run, in its local single-user profile, behind automatic HTTPS.
One machine, one user, your data on your disk. No Postgres, Redis, GCS, or
Kubernetes — those are the cloud profile's machinery and none of it is needed
here.

> How this works: the **host** (`packages/control-plane/src/local/main.ts`) is
> already a server — the desktop just spawns it as a loopback sidecar. Self-host
> is the same binary with `HOUSTON_HOST_BIND=0.0.0.0`, a persistent volume, and a
> TLS reverse proxy in front. It lazily spawns one `pi` runtime per agent **inside
> the container** over loopback, exactly like the desktop. That's the convergence
> paying off: "local = the cloud shrunk to one machine" is literally the same code.

## Prerequisites

- A Linux VPS with Docker + the Docker Compose plugin.
- A domain name with an **A/AAAA record pointing at the VPS** (Caddy needs it to
  issue the TLS cert on first boot).
- Ports **80** and **443** open to the internet.

## 1. Configure

```sh
git clone https://github.com/gethouston/houston-web
cd houston-web/selfhost
cp .env.example .env
```

Edit `.env`:

- `HOUSTON_DOMAIN` — your hostname (e.g. `houston.example.com`).
- `HOUSTON_HOST_TOKEN` — the shared secret on every request. Generate one:
  ```sh
  openssl rand -hex 32
  ```
  Keep it; you enter it once in the client. **This token is the only thing
  between the internet and your agents — treat it like a password.**

## 2. Launch

```sh
docker compose up -d --build
docker compose logs -f
```

The first build installs the host + runtime dependencies (a few minutes). Caddy
then gets a Let's Encrypt cert for `HOUSTON_DOMAIN`. When it's up:

```sh
curl https://$HOUSTON_DOMAIN/engine/health        # → {"status":"ok"}  (public, no token)
curl -H "Authorization: Bearer $HOUSTON_HOST_TOKEN" \
     https://$HOUSTON_DOMAIN/engine/v1/capabilities  # → {"profile":"local",...}
```

The engine is now live at **`https://$HOUSTON_DOMAIN/engine`**.

## Local container smoke test (no Caddy)

Use this for local testing on your laptop. It runs the engine container directly,
without TLS and without the web app:

```sh
docker build -f Dockerfile -t houston/self-host:local ..
docker run --rm -d --name houston-selfhost -p 4318:4318 -e HOUSTON_HOST_TOKEN=test -v houston-data:/data houston/self-host:local
curl http://127.0.0.1:4318/health
curl -H "Authorization: Bearer test" http://127.0.0.1:4318/v1/capabilities
```

For this direct-container mode, the engine URL is `http://127.0.0.1:4318` and
the token is `test`. Stop it with:

```sh
docker stop houston-selfhost
```

## 3. Connect clients

The engine is the backend; you point a Houston frontend at it.

### Desktop app as client

For remote compose, the desktop engine URL is:

```text
https://$HOUSTON_DOMAIN/engine
```

For direct-container local testing, the desktop engine URL is:

```text
http://127.0.0.1:4318
```

In development, set attach vars in repo-root `.env.local` (not `app/.env.local`).
`cd app && pnpm start` loads `../.env.local`, and the Tauri Rust shell needs the
same vars as Vite so it skips the bundled Rust engine:

```env
VITE_NEW_ENGINE_URL=https://your-domain.example/engine
VITE_NEW_ENGINE_TOKEN=your-token
```

```sh
cd app
pnpm start
```

For local direct-container testing, use this instead:

```env
VITE_NEW_ENGINE_URL=http://127.0.0.1:4318
VITE_NEW_ENGINE_TOKEN=test
```

You can also run without a file:

```sh
cd app
VITE_NEW_ENGINE_URL=https://your-domain.example/engine \
VITE_NEW_ENGINE_TOKEN=your-token \
pnpm start
```

Restart the desktop app after changing vars. On boot, the terminal should say it
is in `VITE_NEW_ENGINE_URL` host mode and is skipping the Rust sidecar.

### Web app as client, served from the VPS

Build the SPA and drop it next to the proxy; Caddy serves it at `/` and proxies
the engine at `/engine` (one origin, so no CORS, no mixed content):

```sh
# from the repo root
VITE_NEW_ENGINE=1 pnpm --filter houston-web build
mkdir -p selfhost/web && cp -R packages/web/dist/. selfhost/web/
docker compose restart caddy
```

Open `https://$HOUSTON_DOMAIN`. On first visit the app asks for the engine URL
and token — enter `https://$HOUSTON_DOMAIN/engine` and your `HOUSTON_HOST_TOKEN`
(stored in the browser, asked once). Building with `VITE_NEW_ENGINE=1` and no
baked URL keeps the token out of the JS bundle — you type it in instead.

### Web app as local dev client

To run the browser UI on your laptop against a local or remote Docker engine:

```sh
cd packages/web
VITE_NEW_ENGINE=1 \
VITE_NEW_ENGINE_URL=https://your-domain.example/engine \
VITE_NEW_ENGINE_TOKEN=your-token \
pnpm dev
```

Open the Vite URL it prints. For local direct-container testing, replace the URL
with `http://127.0.0.1:4318` and token with `test`.

## 4. Sign in to your AI provider

Open an agent and run the "connect" flow. Self-host keeps **Anthropic + OpenAI
(Codex)** OAuth — it's your own machine and your own subscription, so no resale
concern (cloud is Codex-only by ToS). The host owns the connect-once flow and
serves short-lived access tokens to each runtime; the long-lived refresh token
never sits in a runtime's environment.

## Operating it

| Task | Command |
|---|---|
| Logs | `docker compose logs -f host` |
| Update | `git pull && docker compose up -d --build` |
| Back up | snapshot the `houston-data` volume (`docker run --rm -v selfhost_houston-data:/d -v "$PWD":/b alpine tar czf /b/houston-backup.tgz -C /d .`) |
| Stop | `docker compose down` (keeps volumes) |
| Delete containers + images | `docker compose down && docker rmi houston/self-host:local` |

All state lives in the `houston-data` volume. Back that up and you can move the
whole instance to another box.

## Migrating from the desktop app

Copy desktop `~/.houston` into the `houston-data` volume before first boot
(`workspaces/` and optionally `db/houston.db`). The host runs the same
idempotent, copy-never-move chat migration on boot.

## Security notes (read before exposing it)

- **The token gates everything.** Every route except `/engine/health` requires
  `Authorization: Bearer <HOUSTON_HOST_TOKEN>`. There is no second user, no
  sign-up — one token, one owner.
- **TLS is terminated by Caddy**, never in the engine. Don't publish port 4318
  directly; the compose file deliberately doesn't.
- **The agent's `bash` runs with the container's authority** inside the
  `houston-data` volume — the container is the trust boundary, same as the
  desktop's is your user account. Don't bind-mount sensitive host paths in.
- Runtime children stay on `127.0.0.1` inside the container; only Caddy's 80/443
  reach the outside.
