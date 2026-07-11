# Deploy Houston on Railway

Railway can build the Houston self-host image directly from this repository. The
service is single-user. `HOUSTON_HOST_TOKEN` is the only credential protecting
your workspaces and agents, so treat it like a password.

The published `ghcr.io/gethouston/houston-engine-pod` image targets managed pods
and enables managed code-execution flags. For a self-hosted Railway service,
build the final `selfhost` target from `selfhost/Dockerfile` with the repository
root as the build context.

## Deploy

1. Create a Railway project and choose **Deploy from GitHub repo**. Select the
   Houston repository.

2. Configure the service to use `selfhost/Dockerfile`. Keep the build context at
   the repository root. Set this service variable, or set the same Dockerfile
   path in the service settings:

   ```env
   RAILWAY_DOCKERFILE_PATH=selfhost/Dockerfile
   ```

3. Add a Railway Volume and mount it at `/data`. Every workspace, credential,
   routine, and other persistent file lives under this path. A deployment
   without the volume loses its state when the container is replaced.

4. Generate a token locally:

   ```sh
   openssl rand -hex 32
   ```

   Add the result as the required `HOUSTON_HOST_TOKEN` service variable. Add
   `COMPOSIO_API_KEY` only if you want platform-mode app integrations.

5. In Railway networking settings, generate a public domain and set the target
   port to `4318`. The image listens on `0.0.0.0` and uses port `4318` by default.
   Alternatively, set `HOUSTON_HOST_PORT` to Railway's injected `PORT` value and
   expose that port.

6. Deploy the service. Railway terminates TLS, so this setup does not need Caddy
   or open ports `80` and `443` in the container. Server-Sent Events work through
   Railway's proxy, including the `/v1/events` stream.

## Verify

Replace the URL and token below with your Railway values:

```sh
curl https://your-service.up.railway.app/health
curl -H "Authorization: Bearer <token>" \
  https://your-service.up.railway.app/v1/capabilities
```

The health response should report `{"status":"ok"}`. If `integrations` is an
empty array in the capabilities response, no integration provider is configured.

Connect a client with the Railway HTTPS URL and the same token. The web client
prompts for both values. A desktop client built from source reads them from the
repo-root `.env.local` as `VITE_NEW_ENGINE_URL` and `VITE_NEW_ENGINE_TOKEN`.

## Troubleshooting

- **Certificate or DNS is pending:** ACME is not part of the normal Railway
  setup because Railway terminates TLS. For a Railway custom domain, wait for
  its DNS records to propagate and check the domain status in Railway.
- **A request returns 401:** the bearer token does not match
  `HOUSTON_HOST_TOKEN`. Update the client or service variable so they match.
- **The integrations list is empty:** set `COMPOSIO_API_KEY` and redeploy. Leave
  it unset when integrations should remain disabled.
