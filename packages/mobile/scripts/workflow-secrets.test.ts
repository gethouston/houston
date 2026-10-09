import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("mobile workflows scope credentials away from dependency installation", () => {
  for (const name of ["mobile-updates", "mobile-release"]) {
    const yaml = readFileSync(`../../.github/workflows/${name}.yml`, "utf8");
    const jobHeaders = yaml.split(/\n {2}(?:publish|ios|android):\n/).slice(1);
    for (const job of jobHeaders) {
      expect(job.split("    steps:")[0]).not.toMatch(/secrets\./);
    }
  }
});

test("OTA publication checks the current channel sequence before overwriting", () => {
  const yaml = readFileSync(
    "../../.github/workflows/mobile-updates.yml",
    "utf8",
  );
  expect(yaml).toContain("OTA sequence must increase for this channel");
  expect(yaml).toContain('"$HOUSTON_MOBILE_UPDATE_SEQUENCE" -gt "$current"');
});
