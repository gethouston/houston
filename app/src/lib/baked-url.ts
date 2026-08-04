/**
 * Resolve a build-time baked URL (a `VITE_*` constant) against its fallback.
 *
 * Why this is not a plain `??`: GitHub Actions cannot conditionally OMIT a
 * job-level `env:` key. A flavor-split expression like
 * `${{ startsWith(ref, 'cloud-') && secrets.X || '' }}` therefore SETS the
 * variable to an EMPTY STRING on the legs that shouldn't have it, and Vite's
 * `loadEnv` copies every `VITE_`-prefixed `process.env` key through verbatim,
 * empty values included. `??` only catches `null`/`undefined`, so an empty bake
 * would win over the production fallback and collapse the URL to `""` — a
 * relative fetch against `tauri://localhost` (silently dead) or a store publish
 * aimed at the local sidecar, which serves no `/v1/agentstore` routes.
 *
 * Treat "set but blank" as "not set", and trim the trailing slash so callers can
 * concatenate paths.
 */
export function bakedUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return (trimmed || fallback).replace(/\/+$/, "");
}
