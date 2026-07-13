import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useUIStore } from "../src/stores/ui.ts";

// Repeated identical toasts must COALESCE (one box, a ×N tally, refreshed
// countdown) instead of stacking — a repeatedly failing provider connect used
// to wall the screen with identical error boxes (the Anthropic connect 503).

const drain = () => {
  for (const t of useUIStore.getState().toasts) {
    useUIStore.getState().dismissToast(t.id);
  }
};

afterEach(drain);

describe("addToast coalescing", () => {
  it("bumps the count on an identical repeat instead of stacking", () => {
    const add = useUIStore.getState().addToast;
    add({
      title: "Couldn't open Anthropic sign-in",
      description: "x",
      variant: "error",
    });
    add({
      title: "Couldn't open Anthropic sign-in",
      description: "x",
      variant: "error",
    });
    add({
      title: "Couldn't open Anthropic sign-in",
      description: "x",
      variant: "error",
    });

    const toasts = useUIStore.getState().toasts;
    strictEqual(toasts.length, 1);
    strictEqual(toasts[0]?.count, 3);
  });

  it("keeps distinct toasts separate (different description or variant)", () => {
    const add = useUIStore.getState().addToast;
    add({ title: "T", description: "a", variant: "error" });
    add({ title: "T", description: "b", variant: "error" });
    add({ title: "T", description: "a", variant: "info" });

    strictEqual(useUIStore.getState().toasts.length, 3);
  });

  it("dismiss removes the coalesced toast (and its timer)", () => {
    const add = useUIStore.getState().addToast;
    add({ title: "T", variant: "error" });
    add({ title: "T", variant: "error" });
    const id = useUIStore.getState().toasts[0]?.id ?? "";
    useUIStore.getState().dismissToast(id);
    strictEqual(useUIStore.getState().toasts.length, 0);
  });
});
