import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  projects: [
    {
      name: "webkit",
      testIgnore: "**/visual/**",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
