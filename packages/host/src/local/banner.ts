/**
 * The `HOUSTON_HOST_LISTENING` startup banner.
 *
 * This ONE line serves two very different deployments of the same local host:
 *
 *  - **Desktop sidecar** — the host mints a random per-boot token and the Tauri
 *    supervisor parses the token back out of this banner
 *    (`app/src-tauri/src/engine_supervisor.rs::parse_banner`). Here the full
 *    `token=<value>` field is a real handshake channel and MUST be printed.
 *
 *  - **Managed cloud pod / self-host** — the token is injected via env
 *    (`HOUSTON_HOST_TOKEN`) by an orchestrator that already knows it. Nothing
 *    in-cluster reads it back from the log (readiness is an HTTP `/health`
 *    probe), so echoing the full credential just leaks it into plaintext pod
 *    logs. We redact it to a short, non-reversible fingerprint instead.
 *
 * Both forms keep the `HOUSTON_HOST_LISTENING port=<p>` prefix intact, which is
 * all the readiness greps (build-host-sidecar.sh, the parent-watchdog test, the
 * parity checklist) match on. The redacted form deliberately uses `token_fp=` /
 * `token_len=` field names — NOT `token=` — so no consumer can mistake the
 * fingerprint for a usable token.
 */
export function formatHostListeningBanner(args: {
  port: number;
  token: string;
  /** Redact the token to a fingerprint (env/orchestrator-supplied token). */
  redactToken: boolean;
}): string {
  const base = `HOUSTON_HOST_LISTENING port=${args.port}`;
  if (!args.redactToken) return `${base} token=${args.token}`;
  return `${base} token_fp=${tokenFingerprint(args.token)} token_len=${args.token.length}`;
}

/** First 8 chars of the token — enough to correlate logs, useless as a credential. */
function tokenFingerprint(token: string): string {
  return token.slice(0, 8);
}
