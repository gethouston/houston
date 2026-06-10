const env = process.env;

/**
 * The code-execution sandbox is a stateless HTTP service deployed to Cloud Run
 * (gen2, `--concurrency=1`). One request = one program run in a fresh, isolated
 * working directory that is wiped when the request returns. It holds NO secrets
 * and NO persistent state — the isolation boundary is Cloud Run's per-instance
 * microVM plus the fresh-workdir-per-request discipline below.
 */
export const config = {
  host: env.SANDBOX_HOST || "0.0.0.0",
  // Cloud Run injects PORT (8080 by default); honor it first.
  port: Number(env.PORT || env.SANDBOX_PORT || 8080),
  /**
   * App-layer token the caller (the runtime) must present in X-Sandbox-Token.
   * Empty means open — only acceptable for local dev on loopback. In Cloud Run
   * this is set from Secret Manager and the service is deployed
   * `--no-allow-unauthenticated` on top, so there are two independent gates:
   * Cloud Run IAM consumes Authorization (Google-signed ID token), this token
   * rides its own header.
   */
  token: env.SANDBOX_TOKEN || "",
  /** Reject request bodies larger than this (input files are base64, so this caps the upload). */
  maxBodyBytes: Number(env.SANDBOX_MAX_BODY_BYTES || 32 * 1024 * 1024),
};
