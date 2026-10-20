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

test("store jobs run in protected environments, dispatched only from main", () => {
  const updates = readFileSync(
    "../../.github/workflows/mobile-updates.yml",
    "utf8",
  );
  const publish = updates.split("\n  publish:\n")[1]?.split("    steps:")[0];
  expect(publish).toContain("environment: mobile-updates");
  expect(publish).toContain(
    "(github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main')",
  );
  const release = readFileSync(
    "../../.github/workflows/mobile-release.yml",
    "utf8",
  );
  for (const job of ["ios", "android"]) {
    const header = release.split(`\n  ${job}:\n`)[1]?.split("    steps:")[0];
    expect(header).toContain("environment: mobile-release");
    expect(header).toContain("github.ref == 'refs/heads/main'");
  }
});
