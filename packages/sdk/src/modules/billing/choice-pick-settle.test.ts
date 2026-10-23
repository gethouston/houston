import type { BillingChoice } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import {
  choicePickerPick,
  openChoicePicker,
  withPickerDraft,
} from "./choice-done";
import { BEFORE, choice, INNOVA, LA_FILA, PERSONAL } from "./choice-fixtures";
import { pickFlow, pickFlowProgress } from "./choice-flow";
import { choiceModal } from "./choice-modal";
import {
  type ChoiceModalFrame,
  CLOSED_CHOICE_FRAME,
  nextChoiceModalFrame,
} from "./choice-modal-frame";
import {
  choiceFrameFlow,
  choiceFramePick,
  nextChoicePage,
  withChoicePick,
} from "./choice-modal-pages";
import { settleChoicePick, settlePick } from "./choice-pick-settle";
import {
  type PickerState,
  pickerSubmission,
  pickRefused,
  toFreeStep,
} from "./choice-picker";

const ctx = {
  now: BEFORE,
  locale: "en",
  closedThisSession: false,
  otherDialogOpen: false,
};
const none = choice();
const refused: PickerState = {
  step: "free",
  free: INNOVA.slug,
  paid: null,
  paidRefused: true,
};

describe("settlePick", () => {
  it("keeps a refusal while the choice still names a Plus or comp payer", () => {
    expect(settlePick(refused, choice({ payer: "plus" }))).toBe(refused);
    expect(settlePick(refused, choice({ payer: "comp" }))).toBe(refused);
    // One org left gives no paid step, but the payer still stands.
    const single = choice({ payer: "plus", orgs: [INNOVA] });
    expect(settlePick(refused, single)).toBe(refused);
  });

  it("clears a refusal once a choice names no payer", () => {
    expect(settlePick(refused, none)).toEqual({
      step: "free",
      free: INNOVA.slug,
      paid: null,
      paidRefused: false,
    });
    expect(
      settlePick(refused, choice({ payer: "sponsored" })).paidRefused,
    ).toBe(false);
  });

  it("answers the same draft and frame when nothing changes", () => {
    const open = { ...refused, paidRefused: false };
    expect(settlePick(open, none)).toBe(open);
    expect(settleChoicePick(CLOSED_CHOICE_FRAME, none)).toBe(
      CLOSED_CHOICE_FRAME,
    );
    const frame = withChoicePick(CLOSED_CHOICE_FRAME, refused);
    expect(settleChoicePick(frame, choice({ payer: "plus" }))).toBe(frame);
  });
});

describe.each([
  "plus",
  "comp",
] as const)("a %s payer refused in one open", (kind) => {
  const payer = choice({ payer: kind });
  // One render: the modal's frame for the latest choice, its draft settled.
  const render = (frame: ChoiceModalFrame, latest: BillingChoice) =>
    settleChoicePick(
      nextChoiceModalFrame(frame, choiceModal(latest, ctx)),
      latest,
    );
  const refusedFrame = () => {
    let frame = render(CLOSED_CHOICE_FRAME, payer);
    frame = nextChoicePage(nextChoicePage(frame));
    frame = withChoicePick(frame, {
      step: "free",
      free: INNOVA.slug,
      paid: LA_FILA.slug,
      paidRefused: false,
    });
    return withChoicePick(
      frame,
      pickRefused(choiceFramePick(frame, payer), { kind: "not_payer" }),
    );
  };

  it("stays free-only while the refetch lags and still names the payer", () => {
    const frame = render(refusedFrame(), payer);
    expect(frame.pick).toEqual(refused);
    expect(choiceFrameFlow(frame, payer)).toEqual({ intro: 2, payer: false });
    expect(pickerSubmission(choiceFramePick(frame, payer))).toEqual({
      freeOrgSlug: INNOVA.slug,
    });
  });

  it("brings the paid step back after no payer, then a payer again", () => {
    const cleared = render(refusedFrame(), none);
    expect(cleared.pick?.paidRefused).toBe(false);
    expect(choiceFrameFlow(cleared, none)).toEqual({ intro: 2, payer: false });
    const renewed = render(cleared, payer);
    const draft = choiceFramePick(renewed, payer);
    expect(draft).toEqual({
      step: "paid",
      free: INNOVA.slug,
      paid: LA_FILA.slug,
      paidRefused: false,
    });
    const flow = choiceFrameFlow(renewed, payer);
    expect(flow).toEqual({ intro: 2, payer: true });
    expect(pickFlowProgress(flow, { step: "paid" })).toEqual({
      current: 3,
      total: 5,
    });
    expect(pickerSubmission(toFreeStep(payer, draft))).toEqual({
      freeOrgSlug: INNOVA.slug,
      paidOrgSlug: LA_FILA.slug,
    });
  });

  it("does the same in the Settings picker", () => {
    const frame = withPickerDraft(openChoicePicker(), refused);
    expect(settleChoicePick(frame, payer)).toBe(frame);
    const renewed = settleChoicePick(settleChoicePick(frame, none), payer);
    expect(pickFlow(payer, null, renewed.pick)).toEqual({
      intro: 0,
      payer: true,
    });
    const draft = choicePickerPick(renewed, payer);
    expect(draft.step).toBe("paid");
    expect(
      pickerSubmission(toFreeStep(payer, { ...draft, paid: PERSONAL.slug })),
    ).toEqual({ freeOrgSlug: INNOVA.slug, paidOrgSlug: PERSONAL.slug });
  });
});
