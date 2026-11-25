const env = process.env;

export const config = {
  host: env.SANDBOX_HOST || "0.0.0.0",
  port: Number(env.PORT || env.SANDBOX_PORT || 8080),
  // WHY: Cloud Run IAM consumes Authorization, so the app token rides X-Sandbox-Token. ADR-0082
  token: env.SANDBOX_TOKEN || "",
  allowUnauthenticated: env.SANDBOX_ALLOW_UNAUTHENTICATED === "1",
  maxBodyBytes: Number(env.SANDBOX_MAX_BODY_BYTES || 32 * 1024 * 1024),
};
