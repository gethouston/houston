import { describe, expect, it } from "vitest";
import type { BillingChoiceSave } from "./choice";
import {
  CLOSED_CHOICE_PICKER,
  choiceDone,
  choicePickerEntry,
  choicePickerPick,
  choicePickerSaved,
  closeChoicePicker,
  openChoicePicker,
  withPickerDraft,
} from "./choice-done";
import {
  BEFORE,
  CUTOVER,
  choice,
  INNOVA,
  LA_FILA,
  PERSONAL,
} from "./choice-fixtures";

const saved = (patch: Parameters<typeof choice>[0]): BillingChoiceSave => ({
  kind: "saved",
  choice: choice(patch),
});

describe("choiceDone", () => {
  it("lists every owned org, busiest first: the free one, the rest need a plan", () => {
    expect(choiceDone(choice({ freeOrgSlug: INNOVA.slug }))).toEqual({
      free: INNOVA,
      paid: null,
      applied: false,
      changeableUntil: null,
      cutoverAt: CUTOVER,
      orgs: [
        { org: LA_FILA, status: "needs_plan" },
        { org: INNOVA, status: "free" },
        { org: PERSONAL, status: "needs_plan" },
      ],
    });
  });

  it("marks the org a payer's subscription pays for", () => {
    const stored = choice({
      payer: "plus",
      freeOrgSlug: LA_FILA.slug,
      paidOrgSlug: INNOVA.slug,
    });
    expect(choiceDone(stored)?.orgs).toEqual([
      { org: LA_FILA, status: "free" },
      { org: INNOVA, status: "subscription" },
      { org: PERSONAL, status: "needs_plan" },
    ]);
  });

  it("leaves nothing needing a plan for a payer with two orgs", () => {
    const stored = choice({
      payer: "comp",
      freeOrgSlug: PERSONAL.slug,
      paidOrgSlug: LA_FILA.slug,
      orgs: [PERSONAL, LA_FILA],
    });
    expect(choiceDone(stored)?.orgs).toEqual([
      { org: LA_FILA, status: "subscription" },
      { org: PERSONAL, status: "free" },
    ]);
  });

  it("never names a paid org for someone with no subscription to move", () => {
    // A paid org left on the record from an earlier subscription.
    const stored = choice({
      payer: null,
      freeOrgSlug: LA_FILA.slug,
      paidOrgSlug: INNOVA.slug,
    });
    expect(choiceDone(stored)?.orgs).toEqual([
      { org: LA_FILA, status: "free" },
      { org: INNOVA, status: "needs_plan" },
      { org: PERSONAL, status: "needs_plan" },
    ]);
  });

  it("never pays for the free org, even if the record names it twice", () => {
    const stored = choice({
      payer: "plus",
      freeOrgSlug: INNOVA.slug,
      paidOrgSlug: INNOVA.slug,
      orgs: [INNOVA, LA_FILA],
    });
    expect(choiceDone(stored)?.orgs).toEqual([
      { org: LA_FILA, status: "needs_plan" },
      { org: INNOVA, status: "free" },
    ]);
  });

  it("lists only the free org when it is the only one left", () => {
    const stored = choice({ freeOrgSlug: PERSONAL.slug, orgs: [PERSONAL] });
    expect(choiceDone(stored)?.orgs).toEqual([
      { org: PERSONAL, status: "free" },
    ]);
  });

  it("has no success step without a stored free pick", () => {
    expect(choiceDone(choice())).toBeNull();
    expect(choiceDone(choice({ freeOrgSlug: "gone" }))).toBeNull();
  });
});

describe("the picker opened from Settings", () => {
  it("moves to the success step after a stored pick, until closed", () => {
    const frame = choicePickerSaved(
      openChoicePicker(),
      saved({ freeOrgSlug: INNOVA.slug }),
    );
    expect(frame).toMatchObject({
      open: true,
      done: { free: INNOVA },
    });
    // Closing keeps the step for the close animation; reopening drops it.
    expect(closeChoicePicker(frame)).toEqual({ ...frame, open: false });
    expect(openChoicePicker()).toEqual({ open: true, done: null, pick: null });
  });

  it("holds the draft for this open and drops it on the next", () => {
    const owner = choice({ freeOrgSlug: INNOVA.slug });
    const open = openChoicePicker();
    expect(choicePickerPick(open, owner)).toEqual({
      step: "free",
      free: INNOVA.slug,
      paid: null,
      paidRefused: false,
    });
    const changed = withPickerDraft(open, {
      ...choicePickerPick(open, owner),
      free: PERSONAL.slug,
    });
    expect(choicePickerPick(changed, owner).free).toBe(PERSONAL.slug);
    // Closing and opening again starts from the stored pick.
    closeChoicePicker(changed);
    expect(choicePickerPick(openChoicePicker(), owner).free).toBe(INNOVA.slug);
  });

  it("keeps a refused draft through the success step", () => {
    const payer = choice({ payer: "plus" });
    const refused = withPickerDraft(openChoicePicker(), {
      step: "free",
      free: INNOVA.slug,
      paid: null,
      paidRefused: true,
    });
    expect(choicePickerPick(refused, payer).step).toBe("free");
    const done = choicePickerSaved(
      refused,
      saved({ freeOrgSlug: INNOVA.slug }),
    );
    expect(done.pick?.paidRefused).toBe(true);
    expect(done.done?.free).toEqual(INNOVA);
  });

  it("never shows the success step for a refusal or a closed picker", () => {
    const open = openChoicePicker();
    expect(choicePickerSaved(open, { kind: "not_owner" })).toBe(open);
    const stored = saved({ freeOrgSlug: INNOVA.slug });
    expect(choicePickerSaved(CLOSED_CHOICE_PICKER, stored)).toBe(
      CLOSED_CHOICE_PICKER,
    );
  });
});

describe("the Settings entry", () => {
  // A save just before the window closes: the stored pick, and a later now.
  const stored = choice({
    freeOrgSlug: INNOVA.slug,
    changeableUntil: "2026-10-21T00:00:00.000Z",
  });
  const after = Date.parse("2026-10-21T00:00:01.000Z");
  const doneFrame = choicePickerSaved(openChoicePicker(), {
    kind: "saved",
    choice: stored,
  });

  it("offers the picker while the pick may still change", () => {
    expect(choicePickerEntry(stored, BEFORE, CLOSED_CHOICE_PICKER)).toBe("row");
    expect(choicePickerEntry(stored, BEFORE, doneFrame)).toBe("row");
  });

  it("keeps an open confirmation past the deadline, until it is closed", () => {
    expect(doneFrame.done).not.toBeNull();
    expect(choicePickerEntry(stored, after, doneFrame)).toBe("frame");
    const shut = closeChoicePicker(doneFrame);
    expect(choicePickerEntry(stored, after, shut)).toBe("none");
  });

  it("offers nothing past the deadline, or without a choice", () => {
    expect(choicePickerEntry(stored, after, CLOSED_CHOICE_PICKER)).toBe("none");
    expect(choicePickerEntry(null, BEFORE, openChoicePicker())).toBe("none");
  });
});
