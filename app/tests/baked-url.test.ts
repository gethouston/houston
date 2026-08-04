import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { bakedUrl } from "../src/lib/baked-url.ts";

const PROD = "https://gateway.gethouston.ai";

describe("bakedUrl", () => {
  it("uses the baked value when the build set one", () => {
    strictEqual(
      bakedUrl("https://staging-gateway.gethouston.ai", PROD),
      "https://staging-gateway.gethouston.ai",
    );
  });

  it("falls back when the var was never defined", () => {
    strictEqual(bakedUrl(undefined, PROD), PROD);
  });

  // The regression this helper exists for. GitHub Actions cannot omit a
  // job-level env key, so a flavor-split expression sets it to "" on the legs
  // that shouldn't carry it. `??` would have let that empty string through and
  // produced a relative fetch (dead under tauri://localhost) or a store publish
  // aimed at the local sidecar.
  it("treats an empty bake as absent, not as an empty URL", () => {
    strictEqual(bakedUrl("", PROD), PROD);
    strictEqual(bakedUrl("   ", PROD), PROD);
  });

  it("trims trailing slashes so callers can concatenate paths", () => {
    strictEqual(
      bakedUrl("https://gw.example.com///", PROD),
      "https://gw.example.com",
    );
    strictEqual(
      bakedUrl(undefined, "https://gw.example.com/"),
      "https://gw.example.com",
    );
  });

  it("trims surrounding whitespace off a real value", () => {
    strictEqual(
      bakedUrl("  https://gw.example.com/  ", PROD),
      "https://gw.example.com",
    );
  });
});
