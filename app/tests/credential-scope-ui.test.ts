import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const CREDENTIAL_SURFACES = [
  "../src/components/shell/provider-error-cards/auth.tsx",
  "../src/components/shell/provider-error-cards/limits.tsx",
  "../src/components/shell/provider-error-cards/quota.tsx",
  "../src/components/shell/provider-reconnect-card.tsx",
  "../src/components/ai-hub/ai-hub-view.tsx",
  "../src/components/ai-hub/provider-modal.tsx",
  "../src/components/ai-hub/provider-modal-footer.tsx",
  "../src/components/ai-hub/provider-modal-connect-button.tsx",
];

describe("no surface offers another account", () => {
  it("the connect / reconnect / limit surfaces name no account to switch to", () => {
    for (const rel of CREDENTIAL_SURFACES) {
      const src = read(rel);
      ok(
        !/continueOnTeam|teamFallback|credentialPin/.test(src),
        `${rel}: still references a team-account fallback or pin`,
      );
    }
  });

  it("no credential call carries a scope argument", () => {
    for (const rel of CREDENTIAL_SURFACES) {
      const src = read(rel);
      ok(
        !/credentialScope\s*:/.test(src),
        `${rel}: passes a credentialScope on a credential call`,
      );
    }
  });
});

describe("a member with nothing connected can serve themselves", () => {
  it("the picker's team empty state points at the viewer, never at an admin", () => {
    const labels = read("../src/components/chat-model-selector-labels.ts");
    ok(
      !/teamAskAdmin|teamCanConnect/.test(labels),
      "no role-shaped empty-state variants remain",
    );
    const chat = JSON.parse(read("../src/locales/en/chat.json")) as {
      modelSelector: {
        picker: {
          noProviders: Record<string, { title: string; hint: string }>;
        };
      };
    };
    const noProviders = chat.modelSelector.picker.noProviders;
    ok(noProviders.team, "a team space has its own empty-state copy");
    ok(
      /your own AI account/i.test(noProviders.team.hint),
      "and it tells the viewer to connect their OWN account",
    );
    ok(
      !/admin|owner/i.test(
        `${noProviders.team.title} ${noProviders.team.hint}`,
      ),
      "with nobody else to go ask",
    );
  });

  it("the hub never labels its rows as anyone else's accounts", () => {
    const view = read("../src/components/ai-hub/ai-hub-view.tsx");
    ok(
      !view.includes("accounts.title"),
      "the retired note must not quietly return",
    );
  });
});

describe("designed states", () => {
  it("every RowCard action slot collapses to undefined, never to a fragment or false", () => {
    for (const file of ["limits.tsx", "quota.tsx"]) {
      const src = read(`../src/components/shell/provider-error-cards/${file}`);
      const slots = src
        .split("action={")
        .slice(1)
        .map((rest) => rest.slice(0, rest.indexOf("\n        }")));
      ok(slots.length > 0, `${file}: has action slots to check`);
      for (const slot of slots) {
        const conditional = slot.includes("? (");
        ok(
          conditional
            ? slot.includes(": undefined")
            : slot.trimStart()[0] === "<",
          `${file}: an action slot may only be a plain element or a \`… ? … : undefined\` (got: ${slot.trim().slice(0, 60)})`,
        );
      }
    }
  });
});
