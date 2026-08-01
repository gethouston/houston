import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The component showcase — the local review surface for every `@houston-ai/*`
 * package. Never shipped and never built: it is served, eyeballed in both
 * themes, and closed.
 *
 * `root` is the package itself (`index.html` sits next to this file) so a
 * specimen can import package source directly, with no aliases.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    // Fail loudly instead of drifting to 5200 — the port is documented.
    strictPort: true,
  },
});
