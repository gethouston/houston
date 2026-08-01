import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * HOU-976 personal-only — the RENDERING contracts the pure decisions cannot
 * cover. The node runner has no DOM, so (per the repo's React-test idiom) these
 * assert on component source.
 *
 * The model: a TEAM space has no shared AI account. Every agent runs on the AI
 * account of whoever messages it, so the hub a member opens manages THEIR
 * accounts, an empty picker is theirs to fix, and no surface may offer to
 * continue on somebody else's account or send them off to find an admin.
 */

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
    // There is nothing to switch to: the sender's own account is the only one a
    // team space has. A CTA that promised otherwise could only fail.
    for (const rel of CREDENTIAL_SURFACES) {
      const src = read(rel);
      ok(
        !/continueOnTeam|teamFallback|credentialPin/.test(src),
        `${rel}: still references a team-account fallback or pin`,
      );
    }
  });

  it("no credential call carries a scope argument", () => {
    // WHOSE account a write lands on is the server's call, derived from the
    // space it is made in. A client-sent scope could only restate that or
    // contradict it.
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
    // The one copy path a team space has. If a role-shaped variant ever returns,
    // the ask-your-admin dead end comes back with it.
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

  it("the hub says whose accounts these are, in a team space only", () => {
    // A member opening the hub must not read these rows as the team's shared
    // connections — there are none. One heading carries that, and only where
    // there is more than one person in the space to confuse it with.
    const view = read("../src/components/ai-hub/ai-hub-view.tsx");
    ok(view.includes("isTeamWorkspace"), "the note is gated on a team space");
    ok(view.includes('t("accounts.title")'), "and renders the heading");
    ok(view.includes("<h2"), "as a real heading, not body text");
  });
});

describe("designed states", () => {
  it("every RowCard action slot collapses to undefined, never to a fragment or false", () => {
    // `RowCard` tests its action slot with `!= null`, so BOTH an empty fragment
    // and `false` mount the action <span> and its `gap-2`: a phantom button
    // column on a card that has no buttons. The only two safe shapes are a plain
    // element and a ternary whose else-branch is `undefined`.
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
