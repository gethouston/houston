import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const step = read("../src/components/portable/import-name-step.tsx");
const form = read("../src/components/shell/agent-identity-form.tsx");

describe("the import wizard's name step", () => {
  it("renders the shared AgentIdentityForm", () => {
    ok(step.includes("AgentIdentityForm"), "renders the shared identity form");
    ok(
      step.includes('from "../shell/agent-identity-form"'),
      "imports it from the shell, not a local copy",
    );
  });

  it("hand-rolls none of the fields the shared form owns", () => {
    ok(!step.includes("<Input"), "no second name input");
    ok(!step.includes("ColorPalette"), "no second colour palette");
    ok(!step.includes("HoustonAvatar"), "no second helmet preview");
  });

  it("states its own copy through the form's header slot", () => {
    ok(/header=\{/.test(step), "passes the header slot");
  });

  it("is strict mobile-first", () => {
    ok(!step.includes("max-md:"), "no max-md: (unprefixed IS the phone layer)");
  });
});

describe("the shared identity form's name field", () => {
  it("keeps a 44px touch target on a phone", () => {
    ok(/className="h-11 rounded-full px-4 text-center md:h-10"/.test(form));
  });

  it("is labelled for screen readers", () => {
    ok(/aria-label=\{t\("naming\.dialogTitle"\)\}/.test(form));
  });
});
