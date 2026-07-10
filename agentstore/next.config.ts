import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace UI + contract packages ship TypeScript source (no prebuilt dist),
  // so Next must transpile them itself.
  transpilePackages: [
    "@houston/agentstore-contract",
    "@houston/design-tokens",
    "@houston-ai/core",
  ],
};

// Binds Cloudflare resources (env, KV, etc.) into `next dev`. No-op in production
// builds — OpenNext handles the Worker build separately.
initOpenNextCloudflareForDev();

export default nextConfig;
