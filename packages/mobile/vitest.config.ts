import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@houston/app": path.resolve(__dirname, "../../app/src"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
