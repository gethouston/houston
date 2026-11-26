import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { landingScreen } from "../src/lib/perf-span-board.ts";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("landingScreen", () => {
  const ui = { viewMode: "agent", agentSection: null, chatAgentId: null };

  it("names an employee's Tasks section the board, on either breakpoint", () => {
    strictEqual(landingScreen(ui, false), "board");
    strictEqual(
      landingScreen({ ...ui, agentSection: "mission-control" }, true),
      "board",
    );
  });

  it("names any other screen by its view", () => {
    strictEqual(
      landingScreen({ ...ui, viewMode: "agents-home" }, true),
      "agents-home",
    );
    strictEqual(
      landingScreen({ ...ui, agentSection: "files" }, false),
      "agent",
    );
  });

  it("names the phone's pushed chat the chat, over whatever is under it", () => {
    strictEqual(landingScreen({ ...ui, chatAgentId: "a" }, true), "chat");
    strictEqual(landingScreen({ ...ui, chatAgentId: "a" }, false), "board");
  });
});

// The marks are plain calls from screens whose hooks need a live engine to
// render, so the wiring is pinned on the source, like the first-run placement.
describe("app_to_board mark wiring", () => {
  it("the sign-in screen marks itself shown on mount", () => {
    const src = read("../src/components/auth/sign-in-screen.tsx");
    const body = src.slice(src.indexOf("export function SignInScreen"));
    strictEqual(
      /useEffect\(\(\) => perfSpans\.signInShown\(\), \[\]\);/.test(body),
      true,
    );
  });

  it("the first-run lifecycle marks the onboarding shown on mount", () => {
    const src = read(
      "../src/components/assistant/onboarding/manager-onboarding-host.tsx",
    );
    const body = src.slice(src.indexOf("function FirstRunLifecycle"));
    strictEqual(
      /useEffect\(\(\) => perfSpans\.onboardingShown\(\), \[\]\);/.test(body),
      true,
    );
  });

  it("the shell reports its landing once the boot landing settles", () => {
    const shell = read("../src/components/shell/workspace-shell.tsx");
    strictEqual(
      /const landing = useWorkspaceViewGuards\([\s\S]*?\);\s*usePerfSpanLanding\(landing\);/.test(
        shell,
      ),
      true,
    );
    const hook = read("../src/hooks/use-perf-span-landing.ts");
    strictEqual(
      /if \(done\)\s*perfSpans\.landedOn\(\s*landingScreen\(useUIStore\.getState\(\), isMobileViewport\(\)\)/.test(
        hook,
      ),
      true,
    );
  });

  it("the full-screen gates before the shell report themselves as the landing", () => {
    strictEqual(
      read(
        "../src/components/onboarding/migration-reconnect-screen.tsx",
      ).includes('perfSpans.landedOn("migration_reconnect")'),
      true,
    );
    strictEqual(
      read(
        "../src/components/onboarding/cloud-migration/cloud-migration-gate.tsx",
      ).includes('perfSpans.landedOn("cloud_migration")'),
      true,
    );
  });
});
