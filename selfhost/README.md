# Run Houston Engine With Docker

This image runs the Houston host in its local profile and spawns pi runtimes in
the same container. Use it two ways:

| Use | Engine URL | Token |
|---|---|---|
| Local Docker on your machine | `http://127.0.0.1:4318` | whatever you pass as `HOUSTON_HOST_TOKEN` |
| Remote VPS with Caddy TLS | `https://your-domain.example/engine` | `HOUSTON_HOST_TOKEN` from `selfhost/.env` |

> How this works: the **host** (`packages/host/src/local/main.ts`) is
> already a server — the desktop just spawns it as a loopback sidecar. Self-host
> is the same binary with `HOUSTON_HOST_BIND=0.0.0.0`, a persistent volume, and a
> TLS reverse proxy in front. It lazily spawns one `pi` runtime per agent **inside
> the container** over loopback, exactly like the desktop. That's the convergence
> paying off: "local = the cloud shrunk to one machine" is literally the same code.

Do not publish port `4318` on a remote VPS. The compose setup keeps it private
and exposes only Caddy on ports `80` and `443`.

## Local Usage

Run these from the repo root, for example `~/dev/houston-web`.

```sh
docker build -f selfhost/Dockerfile -t houston/self-host:local .

docker run --rm -d --name houston-engine \
  -p 4318:4318 \
  -e HOUSTON_HOST_TOKEN=test \
  -v houston-data:/data \
  houston/self-host:local
```

Verify the engine:

```sh
curl http://127.0.0.1:4318/health
curl -H "Authorization: Bearer test" http://127.0.0.1:4318/v1/capabilities
```

## Managed Engine Pod Target

Kubernetes hosted POC uses the same open host/runtime stack without Caddy and
with local process code execution disabled:

```sh
docker build \
  -f selfhost/Dockerfile \
  --target engine-pod \
  -t houston/engine-pod:local .
```

Run it locally like the pod template does:

```sh
docker run --rm -d --name houston-engine-pod \
  -p 4318:4318 \
  -e HOUSTON_HOST_TOKEN=test \
  -v houston-engine-pod-data:/data \
  houston/engine-pod:local
```

Verify:

```sh
curl http://127.0.0.1:4318/health
curl -H "Authorization: Bearer test" http://127.0.0.1:4318/v1/capabilities
```

Expected capabilities include `"codeExecution":"disabled"`,
`"amazon-bedrock"` in `providers`, and `"composio"` in `integrations`. The
private gateway supplies `HOUSTON_HOST_TOKEN`, mounts `/data` on the user's PVC,
and fronts the pod with Supabase-authenticated proxying.

Watch live engine logs:

```sh
docker logs -f --tail=200 houston-engine
```

Stop local Docker engine:

```sh
docker stop houston-engine
```

Clean slate: `docker rmi houston/self-host:local && docker volume rm houston-data`.

### Local Desktop Client

Create or edit repo-root `.env.local`:

```env
VITE_NEW_ENGINE_URL=http://127.0.0.1:4318
VITE_NEW_ENGINE_TOKEN=test
```

Run desktop from `app/`:

```sh
cd app
pnpm start
```

Restart the desktop app after editing `.env.local`. The terminal should say it is
in `VITE_NEW_ENGINE_URL` host mode and is skipping the Rust sidecar.

### Local Web Client

Run from `packages/web/`:

```sh
cd packages/web
VITE_NEW_ENGINE=1 \
VITE_NEW_ENGINE_URL=http://127.0.0.1:4318 \
VITE_NEW_ENGINE_TOKEN=test \
pnpm dev
```

Open the Vite URL it prints.

## Remote VPS Usage

Prereqs:

- Linux VPS with Docker and Docker Compose plugin.
- Domain A/AAAA record pointing at the VPS.
- Ports `80` and `443` open.

Run these on the VPS:

```sh
git clone https://github.com/gethouston/houston-web
cd houston-web/selfhost
cp .env.example .env
```

Edit `selfhost/.env`:

```env
HOUSTON_DOMAIN=houston.example.com
HOUSTON_HOST_TOKEN=<run openssl rand -hex 32>
```

Start the engine and Caddy:

```sh
docker compose up -d --build
```

Watch live engine logs from `houston-web/selfhost`:

```sh
docker compose logs -f --tail=200 host
```

If you are not in `houston-web/selfhost`, pass the compose file:

```sh
docker compose -f /path/to/houston-web/selfhost/docker-compose.yml logs -f --tail=200 host
```

Verify from any machine:

```sh
curl https://houston.example.com/engine/health
curl -H "Authorization: Bearer <token>" https://houston.example.com/engine/v1/capabilities
```

### Remote Desktop Client

On the machine running the desktop app, edit repo-root `.env.local`:

```env
VITE_NEW_ENGINE_URL=https://houston.example.com/engine
VITE_NEW_ENGINE_TOKEN=<token>
```

Run desktop from `app/`:

```sh
cd app
pnpm start
```

### Remote Web Client, Served From The VPS

Run on the VPS from repo root `houston-web/`:

```sh
pnpm install
VITE_NEW_ENGINE=1 pnpm --filter houston-web build
mkdir -p selfhost/web
cp -R packages/web/dist/. selfhost/web/
cd selfhost
docker compose restart caddy
```

Open `https://houston.example.com`. Enter:

```text
Engine URL: https://houston.example.com/engine
Token: <token>
```

### Remote Web Client, Run Locally

Run on your local machine from `packages/web/`:

```sh
cd packages/web
VITE_NEW_ENGINE=1 \
VITE_NEW_ENGINE_URL=https://houston.example.com/engine \
VITE_NEW_ENGINE_TOKEN=<token> \
pnpm dev
```

Open the Vite URL it prints.

## Operations

Run compose commands from `houston-web/selfhost` on the VPS.

| Task | Command |
|---|---|
| Logs | `docker compose logs -f --tail=200 host` |
| Stop | `docker compose down` |
| Update | `git pull && docker compose up -d --build` |
| Backup | `docker run --rm -v selfhost_houston-data:/d -v "$PWD":/b alpine tar czf /b/houston-backup.tgz -C /d .` |

All state lives in the Docker volume mounted at `/data`: workspaces, agents,
skills, routines, and provider credentials.

Security: token gates every route except `/engine/health`; treat it like a
password. On a VPS, expose Caddy only, never port `4318` directly.
