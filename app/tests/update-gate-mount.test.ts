import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Source-structure guard for the update surfaces' mount position. There is no
// React DOM harness in this suite, and the bug this prevents is purely
// structural: UpdateChecker (the gateway 426 hard floor + forced updates) once
// lived in the sidebar footer, INSIDE the shell — so a below-floor build never
// reached it. The language/disclaimer gates' own preference reads 426 on such
// a build, wedging the user in a broken first-run flow with no update screen
// (the staging 0.5.19 lockout). These assertions pin the fix: both entry trees
// mount UpdateChecker ABOVE the gates, and nowhere else.

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function mountIndex(source: string, file: string): number {
  const i = source.indexOf("<UpdateChecker />");
  ok(i >= 0, `${file} must mount <UpdateChecker />`);
  return i;
}

function gateIndex(source: string, file: string): number {
  const i = source.indexOf("<LanguageGate>");
  ok(i >= 0, `${file} must mount <LanguageGate>`);
  return i;
}

describe("update surfaces mount above the onboarding gates", () => {
  it("desktop entry (main.tsx) renders UpdateChecker before LanguageGate", () => {
    const src = readFileSync(join(appRoot, "src/main.tsx"), "utf8");
    ok(
      mountIndex(src, "main.tsx") < gateIndex(src, "main.tsx"),
      "UpdateChecker must render BEFORE (above) LanguageGate so a 426-locked " +
        "build shows the update screen instead of a wedged first-run flow",
    );
  });

  it("web entry (app-tree.tsx) mirrors the desktop mount", () => {
    const src = readFileSync(
      join(appRoot, "../packages/web/src/app-tree.tsx"),
      "utf8",
    );
    ok(
      mountIndex(src, "app-tree.tsx") < gateIndex(src, "app-tree.tsx"),
      "app-tree.tsx must mirror main.tsx: UpdateChecker above LanguageGate",
    );
  });

  it("the sidebar no longer mounts UpdateChecker (single top-level mount)", () => {
    const src = readFileSync(
      join(appRoot, "src/components/shell/sidebar.tsx"),
      "utf8",
    );
    ok(
      !src.includes("UpdateChecker"),
      "sidebar.tsx must not mount UpdateChecker: a second instance would run " +
        "the update policy twice, and the shell mount is unreachable on a " +
        "426-locked build",
    );
  });
});
