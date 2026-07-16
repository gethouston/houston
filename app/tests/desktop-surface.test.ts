import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { markDesktopSurface } from "../src/lib/desktop-surface.ts";

describe("markDesktopSurface", () => {
  it("stamps data-desktop on the root inside the Tauri shell", () => {
    const root = { dataset: {} as { desktop?: string } };
    markDesktopSurface(root, true);
    strictEqual(root.dataset.desktop, "true");
  });

  it("leaves a plain browser unstamped (web keeps the frosted glass)", () => {
    const root = { dataset: {} as { desktop?: string } };
    markDesktopSurface(root, false);
    strictEqual("desktop" in root.dataset, false);
  });

  it("clears a stale stamp when not on desktop", () => {
    const root = { dataset: { desktop: "true" } as { desktop?: string } };
    markDesktopSurface(root, false);
    strictEqual("desktop" in root.dataset, false);
  });
});
