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
