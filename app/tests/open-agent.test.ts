import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { useTeamSettingsNav } from "../src/components/team-view/team-settings-nav-store.ts";

/**
 * The two dishonest fallbacks in `lib/open-agent.ts`, and the one-shot it used
 * to leave armed.
 *
 * `open-agent.ts` is the IMPERATIVE half of the agent-nav rules (the pure half
 * is `lib/agent-nav.ts`, covered in `agent-nav.test.ts`). It cannot be imported
 * here: its store chain reaches `lib/tauri.ts` → `@houston-ai/engine-client`,
 * whose parameter properties Node's strip-only TypeScript refuses, and
 * `lib/i18n.ts`, whose locale JSON is imported without an import attribute.
 * Both are Vite's job, not Node's. So the store primitive this module now leans
 * on is exercised for real, the wiring that calls it is pinned against the
 * source (the same idiom as `ai-hub-review-fixes.test.ts` /
 * `provider-statuses-gate.test.ts`), and the copy is pinned against the
 * locale files.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/** One exported function with its doc comment, up to the next export. */
function fnSource(source: string, name: string): string {
  const decl = source.indexOf(`export function ${name}(`);
  ok(decl !== -1, `${name} must exist in lib/open-agent.ts`);
  const doc = source.lastIndexOf("/**", decl);
  const next = source.indexOf("\nexport function ", decl + 1);
  return source.slice(
    doc === -1 ? decl : doc,
    next === -1 ? source.length : next,
  );
}

const OPEN_AGENT = read("../src/lib/open-agent.ts");

describe("openAgentSection's no-team fallback", () => {
  // "Take me to this agent's Routines" with no team to open has exactly one
  // honest answer, and it is the app's ONE home rule. Naming a view here would
  // be a second, unexplained fallback beside the one `home-nav.ts` documents.
  const body = fnSource(OPEN_AGENT, "openAgentSection");

  it("routes an unclaimed agent through openAgentBoard, the one justified fallback", () => {
    ok(
      body.includes("openAgentBoard(agentId)"),
      "the no-team branch must delegate to openAgentBoard",
    );
  });

  it("never names a view of its own", () => {
    ok(
      !body.includes("setViewMode("),
      "a Routines/Files request must not set a view directly",
    );
  });

  it("explains why the board is the honest landing spot", () => {
    // Rule 0: the next reader must not "simplify" this back into a setViewMode.
    ok(/board/i.test(body) && /fallback/i.test(body));
  });
});

describe("openAgentBoard's no-team fallback", () => {
  const body = fnSource(OPEN_AGENT, "openAgentBoard");

  it("goes through the ONE shared home rule, never a view id", () => {
    // There is no global mission board any more, so an agent no team claims
    // has to land wherever every other missed nav lands: `lib/home-nav.ts`.
    ok(body.includes("openHome()"), "the no-team branch must call openHome");
    ok(
      !body.includes("setViewMode("),
      "the fallback must not name a view of its own",
    );
  });
});

describe("openAgentSettings's failure path", () => {
  const body = fnSource(OPEN_AGENT, "openAgentSettings");
  const failure = body.slice(0, body.indexOf("requestAgentDetail"));

  it("clears any pending one-shot before returning", () => {
    // The early return happens BEFORE `requestAgentDetail`, so a request left
    // by an EARLIER call survived and fired the next time the user opened Team
    // Settings by hand, drilling them into an agent they never asked for.
    ok(
      failure.includes("clearRequested()"),
      "the no-team branch must clear the one-shot",
    );
  });

  it("toasts a title AND a body", () => {
    ok(failure.includes("teams:teamView.settings.navUnavailable"));
    ok(failure.includes("teams:teamView.settings.navUnavailableBody"));
    ok(failure.includes('variant: "error"'));
  });
});

describe("useTeamSettingsNav.clearRequested", () => {
  it("really drops a pending agent + section request", () => {
    // The primitive the failure path above depends on, executed rather than
    // read: a half-clear (agent dropped, section kept) would still mis-drill.
    const nav = useTeamSettingsNav.getState();
    nav.requestAgentDetail("agent-1", "skills");
    strictEqual(useTeamSettingsNav.getState().requestedAgentId, "agent-1");

    useTeamSettingsNav.getState().clearRequested();

    strictEqual(useTeamSettingsNav.getState().requestedAgentId, null);
    strictEqual(useTeamSettingsNav.getState().requestedSection, null);
  });
});

describe("navUnavailable copy", () => {
  // The whole reason we toast is that NO team claims the agent, so the old
  // "open it from the team it belongs to" told the user to do the very thing
  // that just failed. Title names the failure, body says what to actually do.
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} ships a title and a body that is not the old advice`, () => {
      const teams = JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../src/locales/${locale}/teams.json`),
          "utf8",
        ),
      ) as {
        teamView?: { settings?: Record<string, unknown> };
      };
      const settings = teams.teamView?.settings ?? {};
      for (const key of ["navUnavailable", "navUnavailableBody"]) {
        const value = settings[key];
        strictEqual(typeof value, "string", `${key} must be a string`);
        const text = value as string;
        ok(text.length > 0, `${key} must not be empty`);
        ok(!text.includes("—"), `${key}: no em dashes in user-facing copy`);
      }
      const title = settings.navUnavailable as string;
      ok(
        !/\.\s/.test(title.trim()) && !title.trim().endsWith("."),
        "the title is one clause, not the old two-sentence instruction",
      );
    });
  }
});
