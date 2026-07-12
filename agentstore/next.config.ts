import type { NextConfig } from "next";

// Baseline security headers applied to every response (pages and API routes
// alike). Next merges these with any headers a route handler sets itself; these
// keys are disjoint from the wildcard CORS the public artifact routes set (see
// lib/proxy-headers.ts), so neither overrides the other. Kept intentionally
// minimal: no CSP here, since the app has no inline-script story to lock down yet.
const securityHeaders = [
  // Never let the browser MIME-sniff a response into a different type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin on cross-origin navigations; full URL same-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The store is never meant to be framed — clickjacking defense.
  { key: "X-Frame-Options", value: "DENY" },
  // Deny powerful browser features the store does not use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A self-contained server bundle (server.js + minimal node_modules) so the
  // Docker image runs `node server.js` on GKE without the full workspace.
  output: "standalone",
  // The standalone tracer must resolve files from the pnpm-workspace root (the
  // houston repo root, one level up from this package), not just this package,
  // so workspace deps (@houston-ai/core, contract, tokens) are traced and copied
  // into the bundle — and the traced tree is rooted there, putting the server
  // entry at agentstore/server.js as the Docker runtime stage expects.
  outputFileTracingRoot: `${import.meta.dirname}/..`,
  // Workspace UI + contract packages ship TypeScript source (no prebuilt dist),
  // so Next must transpile them itself.
  transpilePackages: [
    "@houston/agentstore-contract",
    "@houston/design-tokens",
    "@houston-ai/core",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
