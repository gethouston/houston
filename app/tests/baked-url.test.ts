import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { bakedUrl } from "../src/lib/baked-url.ts";

describe("bakedUrl", () => {
  it("uses the baked value when the build set one", () => {
    strictEqual(
      bakedUrl("https://staging-gateway.example.com"),
      "https://staging-gateway.example.com",
    );
  });

  it("is undefined when the var was never defined", () => {
    strictEqual(bakedUrl(undefined), undefined);
  });

  // The regression this helper exists for. GitHub Actions cannot omit a
  // job-level env key, so a flavor-split expression sets it to "" on the legs
  // that shouldn't carry it. `??` would have let that empty string read as
  // "configured" and produced a relative fetch (dead under tauri://localhost)
  // or a store publish aimed at the local sidecar.
  it("treats an empty bake as absent, never as an empty URL", () => {
    strictEqual(bakedUrl(""), undefined);
    strictEqual(bakedUrl("   "), undefined);
  });

  it("trims trailing slashes so callers can concatenate paths", () => {
    strictEqual(
      bakedUrl("https://gw.example.com///"),
      "https://gw.example.com",
    );
  });

  it("trims surrounding whitespace off a real value", () => {
    strictEqual(
      bakedUrl("  https://gw.example.com/  "),
      "https://gw.example.com",
    );
  });
});
