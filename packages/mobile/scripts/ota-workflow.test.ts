import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const updates = () =>
  readFileSync("../../.github/workflows/mobile-updates.yml", "utf8");

test("automatic publishes and rollbacks carry the live required floor, never the repo's", () => {
  const yaml = updates();
  const select = yaml
    .split("- name: Select bundle version and compatibility")[1]
    ?.split("- name: Sign manifest")[0];
  expect(select).toContain(
    "current_required=$(jq -r '.required_native_build' packages/mobile/current-manifest.json)",
  );
  expect(select).toContain("required=$current_required");
  expect(select).not.toMatch(/required_native_build[^\n]*native-compat\.json/);
  expect(select).not.toContain("cp packages/mobile/native-compat.json");
  expect(select).toContain("required=$RAISE_REQUIRED");
  expect(select).toContain('test "$RAISE_REQUIRED" -gt "$current_required"');
  expect(yaml).toContain("options: [rollback, raise-required-native-build]");
});

test("only cloud-v releases of main commits no older than the live bundle publish", () => {
  const yaml = updates();
  const release = readFileSync(
    "../../.github/workflows/mobile-release.yml",
    "utf8",
  );
  for (const source of [yaml, release]) {
    expect(source).toContain(
      "startsWith(github.event.release.tag_name, 'cloud-v')",
    );
    expect(source).not.toContain(
      "startsWith(github.event.release.tag_name, 'v')",
    );
  }
  expect(yaml).toContain("fetch-depth: 0");
  expect(yaml).toContain(
    'packages/mobile/scripts/ota-commit-guard.sh origin/main HEAD "$live_sha"',
  );
  expect(yaml.indexOf("- name: Refuse off-main or older commits")).toBeLessThan(
    yaml.indexOf("- name: Build mobile bundle"),
  );
});

test("an immutable bundle object is never overwritten with different bytes", () => {
  const yaml = updates();
  const upload = yaml.split("- name: Upload zip, then manifest")[1] ?? "";
  expect(upload).toContain('if [ "$upload_zip" = true ]; then');
  expect(upload).toContain("--if-generation-match=0");
  expect(upload).toContain("max-age=31536000,immutable");
  expect(yaml).toContain(
    'gcloud storage cp "gs://houston-mobile-updates/$CHANNEL/$built.zip" packages/mobile/update.zip',
  );
});
