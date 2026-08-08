# Web hosting (Firebase Hosting)

Two distinct properties, both on Firebase Hosting in GCP project `gethouston`: the
browser **web client** (`packages/web`) and the **marketing site** (`website/`).

## Web client

| Site ID | Domain | Role |
| --- | --- | --- |
| `houston-web` | app.gethouston.ai | production |
| `houston-web-preview` | preview.gethouston.ai (+ `*.web.app`) | staging: main-HEAD frontend + **staging gateway** / QA gate |

**Two bundles, one build-time difference: the baked gateway URL.** Production
(`build-web` in `release.yml`, gated to `v*` OR `cloud-v*` tags on
`gethouston/houston`) bakes `HOSTED_ENGINE_URL` (`https://gateway.gethouston.ai`);
preview (`web-staging.yml`) bakes `HOSTED_ENGINE_URL_STAGING` — the same secret the
desktop staging QA DMG bakes — so preview is a full staging axis and release bytes
never deploy to preview.

Everything else is runtime-derived: the environment label comes from
`window.location.hostname` (`packages/web/src/deploy-environment.ts`) —
app.gethouston.ai → `production`, preview.gethouston.ai / `*.web.app` → `preview`,
localhost → `development`. `main.tsx` publishes it on
`window.__HOUSTON_DEPLOY_ENV__` before the app graph loads; `sentry.ts` +
`analytics.ts` read it to tag their `environment`, and the web-only `PreviewBadge`
(`packages/web/src/preview-badge.tsx`) renders a small "Preview" pill only on preview.

### Flow

0. **`web-staging.yml`** (every push to `main`) rebuilds `packages/web` with the SAME
   recipe/secrets as `build-web` EXCEPT the gateway URL
   (`VITE_CONTROL_PLANE_URL` ← `HOSTED_ENGINE_URL_STAGING`; Sentry release
   `houston-app@0.0.0-main.<sha>-web`) and deploys to the preview site — **the ONLY
   writer to that site.** Production is never touched here.
1. **`build-web`** builds with the production gateway URL plus the
   `FIREBASE_API_KEY`/`FIREBASE_AUTH_DOMAIN`/`FIREBASE_PROJECT_ID` trio that
   configures GCIP sign-in (the web bundle authenticates with firebase-js-sdk's popup,
   so `FIREBASE_API_KEY` is load-bearing and has no build-time default; the
   desktop-only `GOOGLE_DESKTOP_*` / `MICROSOFT_DESKTOP_CLIENT_ID` loopback vars are
   deliberately NOT baked — that flow never runs in a browser tab) and
   `POSTHOG_*`/`SENTRY_DSN`. It injects Sentry Debug IDs, uploads sourcemaps under the
   web release **`houston-app@<version>-web`** (the `-web` suffix keeps web crashes on
   their own release; the runner stamps the real version onto
   `packages/web/package.json`, which ships a `0.0.0` placeholder), strips the `.map`
   files, tars `dist` **deterministically** into `web-dist.tar.gz`, and attaches it to
   the draft release. **It deploys to NO Firebase site.**
2. **`web-promote.yml`** (triggers: `release: published` guarded to `cloud-v*`
   (prerelease allowed — cloud releases are prereleases BY POLICY so the legacy local
   desktop app keeps "latest release") or `v*` non-prerelease, canonical repo only;
   plus `workflow_dispatch` with a `tag` input for manual promotion/rollback)
   downloads the SAME `web-dist.tar.gz` from the published release, checks out
   `firebase.json`/`.firebaserc` at the release tag, unpacks, and deploys the
   identical bytes to production. **No rebuild.** A published release with NO web
   asset (a tag predating the pipeline) is **skipped with a notice**, never red-X'd; a
   present-but-empty asset fails loudly. `concurrency: web-promote` serializes
   overlapping publishes.

### Auth, config, rollback

- **Auth**: keyless **Workload Identity Federation**, same provider as
  `engine-pod-image.yml` (`…/workloadIdentityPools/github/providers/houston`), service
  account `github-deploy-web@gethouston.iam.gserviceaccount.com`. `firebase-tools`
  reads the ADC `google-github-actions/auth` writes — no `FIREBASE_TOKEN`.
- **Config**: `packages/web/firebase.json` + `.firebaserc` (targets
  `production`→`houston-web`, `preview`→`houston-web-preview`). SPA rewrite
  all→`/index.html`; hashed `/assets/**` get `immutable` 1-year cache, everything else
  `no-cache`; security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY` + CSP
  `frame-ancestors 'none'`) on both; **preview** additionally serves
  `X-Robots-Tag: noindex`. Header differences live in per-target config, never in the
  bundle.
- **Rollback**: re-publish an older release (re-runs `web-promote` with that
  release's tarball), or roll back in the Firebase Hosting console
  (`firebase hosting:clone` / version pinning).
- **Secrets** are all pre-existing, reused from the desktop jobs: `HOSTED_ENGINE_URL`,
  `HOSTED_ENGINE_URL_STAGING`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
  `FIREBASE_PROJECT_ID`, `POSTHOG_KEY`, `POSTHOG_HOST`, `SENTRY_DSN`,
  `SENTRY_AUTH_TOKEN`. The one prerequisite is the GCP-side WIF binding for
  `github-deploy-web@` (Firebase Hosting Admin) — infra, not a repo secret.

## Marketing site (`website/`, Eleventy → gethouston.ai)

**Mid-cutover from Cloudflare Pages to Firebase Hosting** — both receive every
deploy until the DNS flip, and the live apex still resolves to Cloudflare.

**Deploy** — `.github/workflows/website-deploy.yml`, on every push to `main` under
`website/**` (or manual `workflow_dispatch`):

1. Build with `npx @11ty/eleventy` (output `_site`). Build-time env:
   - Download gate: `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `WAITLIST_SHEET_ENDPOINT`
     — the gate's lead-form writes **deliberately stay on Supabase** (the same
     `waitlist` table the retired waitlist page used; see [auth.md](auth.md)).
   - `POSTHOG_KEY` / `POSTHOG_HOST` — `POSTHOG_KEY` is guarded: missing → the job
     fails loudly rather than shipping a blind site.
   - Certificates: secret `CERTS_EXPORT_TOKEN` (bearer for the gateway's
     `GET /v1/certs/export`; the token IS the switch and is deliberately NOT guarded —
     absent, the data layer warns and yields an empty certificate set so the rest of
     the site still ships) and the literal
     `CERTS_GATEWAY_URL: https://gateway.gethouston.ai` (also read client-side via
     `_data/env.js` for claim/verify fetches). Full picture:
     [website-certificates.md](website-certificates.md).
2. Deploy to **Firebase Hosting** site `gethouston-site` (project `gethouston`) →
   https://gethouston-site.web.app. Keyless WIF, same SA and provider as the web
   client.
3. **Dual-deploy** to **Cloudflare Pages** (project `houston-site`, `wrangler pages
   deploy _site`, secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`). This step
   is **temporary** and explicitly marked to be deleted once the DNS flip lands.

- **Certificate imports need a MANUAL dispatch.** The push trigger path-filters on
  `website/**`, and certificates are pre-rendered at build time from the gateway
  export — so an attendee import that touches only the cloud database changes no file
  here and never fires a deploy. New codes stay invisible (their `/c/<CODE>` pages
  404) until someone runs
  `gh -R gethouston/houston workflow run website-deploy.yml --ref main`.
  `make certs-import` prints that exact line on success; it is the one step whose
  omission silently fails the attendee.
- **DNS state (in progress).** The apex / www records for `gethouston.ai` still point
  at Cloudflare Pages; Firebase serves only `gethouston-site.web.app`. Human cutover:
  verify the Firebase deploy (redirects, headers, URL shape) → add the custom domain
  in Firebase Hosting → flip apex/www DNS → retire the Cloudflare Pages project AND
  delete the dual-deploy step.
- **Config** is `website/firebase.json` + `website/.firebaserc` (project
  `gethouston`, single site `gethouston-site`, public `_site`, `cleanUrls`). It is the
  **source of truth** for redirects (`/pricing/` → `/#pricing`) and headers (HSTS,
  `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `X-Robots-Tag: noindex`
  on `/early-access|auth|slack`, `max-age=60` HTML/CSS cache). The legacy Cloudflare
  `website/src/_headers` + `_redirects` still exist but are **ignored on Firebase**
  (`firebase.json` `ignore` list); they stay in the repo, harmless, until the
  Cloudflare retirement.
