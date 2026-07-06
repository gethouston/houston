import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// HOU-698 — an in-flight provider sign-in must always offer a way out.
//
// The AI-hub grid card used to render a *disabled* Connect button with a bare
// spinner while `connecting`, so a user who closed the OAuth tab was stuck
// watching it forever (the modal header had a Cancel, the grid card did not).
// These are source contracts: the card must swap Connect for a Cancel action
// while connecting, and the grid must wire that action to the connections
// hook's `cancel` (which aborts the engine-side login so a retry isn't
// rejected as "already pending").
// ---------------------------------------------------------------------------
describe("ai-hub provider card offers cancel while connecting (HOU-698)", () => {
  const card = read("../src/components/ai-hub/provider-card.tsx");

  it("swaps the Connect pill for a Cancel button during an in-flight login", () => {
    ok(
      card.includes("onCancel(provider)"),
      "connecting state must invoke onCancel",
    );
    ok(
      card.includes('t("card.cancel")'),
      "cancel affordance must carry a visible localized label, not just a spinner",
    );
  });

  it("never renders a disabled dead-end while connecting", () => {
    ok(
      !card.includes("disabled={connecting}"),
      "the connecting state must not disable the only actionable button",
    );
  });

  it("grid wires the card's onCancel to the connections hook", () => {
    const grid = read("../src/components/ai-hub/provider-grid.tsx");
    ok(
      grid.includes("onCancel={connections.cancel}"),
      "ProviderGrid must pass connections.cancel to ProviderCard",
    );
  });
});
