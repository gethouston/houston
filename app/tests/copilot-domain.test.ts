import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveCopilotDomain } from "../src/lib/copilot-domain.ts";

/**
 * The Copilot connect dialog's domain resolver (2026-07 provider QA: "Copilot
 * Business fails where personal works"). Personal AND Copilot Business sign in
 * at github.com; only GitHub Enterprise data residency has a custom domain. A
 * typed github.com must collapse to the no-domain path, and unusable input must
 * fail at the dialog, never inside the device-code flow.
 */
describe("resolveCopilotDomain", () => {
  it("collapses github.com in every common spelling to the github.com path", () => {
    for (const input of [
      "github.com",
      "GitHub.com",
      "www.github.com",
      "https://github.com",
      "https://github.com/orgs/acme",
      "  github.com  ",
    ]) {
      deepStrictEqual(
        resolveCopilotDomain(input),
        { kind: "github_com" },
        `expected "${input}" to resolve to github.com`,
      );
    }
  });

  it("passes a dotted enterprise host through, normalized to its hostname", () => {
    deepStrictEqual(resolveCopilotDomain("acme.ghe.com"), {
      kind: "enterprise",
      domain: "acme.ghe.com",
    });
    // URL forms and paths normalize to the bare hostname pi-ai will use.
    deepStrictEqual(resolveCopilotDomain("https://acme.ghe.com/login"), {
      kind: "enterprise",
      domain: "acme.ghe.com",
    });
    deepStrictEqual(resolveCopilotDomain("github.acme.com"), {
      kind: "enterprise",
      domain: "github.acme.com",
    });
  });

  it("rejects empty, unparseable, and single-label input at the dialog", () => {
    for (const input of ["", "   ", "not a domain", "acme"]) {
      deepStrictEqual(
        resolveCopilotDomain(input),
        { kind: "invalid" },
        `expected "${input}" to be invalid`,
      );
    }
  });
});
