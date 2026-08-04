/**
 * Read a build-time baked URL (a `VITE_*` constant), or `undefined` if this
 * build has none.
 *
 * There is deliberately NO hardcoded fallback host anywhere behind this. A
 * gateway hostname is deployment configuration: it differs per environment
 * (prod vs staging vs the local dev gateway) and can be moved at any time, so
 * the only place it may live is the build that bakes it — CI from a secret,
 * `.env.development` for the dev loop. A literal in the source silently wins
 * over an environment that forgot to set it, which is exactly how the staging
 * QA DMG ended up publishing agents into the production catalog.
 *
 * Why this is not a plain `??`: GitHub Actions cannot conditionally OMIT a
 * job-level `env:` key. A flavor-split expression like
 * `${{ startsWith(ref, 'cloud-') && secrets.X || '' }}` therefore SETS the
 * variable to an EMPTY STRING on the legs that shouldn't have it, and Vite's
 * `loadEnv` copies every `VITE_`-prefixed `process.env` key through verbatim,
 * empty values included. `??` only catches `null`/`undefined`, so a blank bake
 * would read as configured and collapse the URL to `""` — a relative fetch
 * against `tauri://localhost`, or a store publish aimed at the local sidecar,
 * which serves no `/v1/agentstore` routes.
 *
 * Treat "set but blank" as "not set", and trim the trailing slash so callers
 * can concatenate paths.
 */
export function bakedUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || undefined;
}
