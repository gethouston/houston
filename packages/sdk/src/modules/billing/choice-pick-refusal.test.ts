import { describe, expect, it } from "vitest";
import { BEFORE, choice, INNOVA, LA_FILA, PERSONAL } from "./choice-fixtures";
import { pickFlowProgress } from "./choice-flow";
import { choiceModal } from "./choice-modal";
import {
  CLOSED_CHOICE_FRAME,
  nextChoiceModalFrame,
} from "./choice-modal-frame";
import {
  choiceFrameFlow,
  choiceFramePick,
  choiceIntroProgress,
  nextChoicePage,
  previousChoicePage,
  withChoicePick,
} from "./choice-modal-pages";
import {
  type PickerState,
  pickerBack,
  pickerSubmission,
  pickRefused,
  reconcilePick,
} from "./choice-picker";

const ctx = {
  now: BEFORE,
  locale: "en",
  closedThisSession: false,
  otherDialogOpen: false,
};
const payer = choice({ payer: "plus" });
// A non-payer's draft: the same shape a refusal used to leave behind.
const unmarked: PickerState = {
  step: "free",
  free: INNOVA.slug,
  paid: null,
  paidRefused: false,
};
const refused: PickerState = { ...unmarked, paidRefused: true };

describe("a draft whose choice turns payer", () => {
  it("returns an unmarked free-only draft to the paid step", () => {
    expect(reconcilePick(payer, unmarked)).toEqual({
      step: "paid",
      free: INNOVA.slug,
      paid: LA_FILA.slug,
      paidRefused: false,
    });
    expect(reconcilePick(choice({ payer: "comp" }), unmarked).step).toBe(
      "paid",
    );
  });

  it("keeps a refused draft free-only", () => {
    expect(reconcilePick(payer, refused)).toEqual(refused);
  });

  it("goes Back from the reconciled free step to the paid one", () => {
    const draft = reconcilePick(payer, { ...unmarked, paid: PERSONAL.slug });
    expect(draft.step).toBe("free");
    expect(pickerBack(draft)).toEqual({
      step: "paid",
      free: INNOVA.slug,
      paid: PERSONAL.slug,
      paidRefused: false,
    });
    expect(pickerBack(reconcilePick(payer, unmarked))).toBeNull();
    expect(pickerBack(reconcilePick(payer, refused))).toBeNull();
  });

  it("sends both picks unless the paid pick was refused", () => {
    expect(pickerSubmission(reconcilePick(payer, unmarked))).toBeNull();
    expect(
      pickerSubmission(
        reconcilePick(payer, { ...unmarked, paid: PERSONAL.slug }),
      ),
    ).toEqual({ freeOrgSlug: INNOVA.slug, paidOrgSlug: PERSONAL.slug });
    expect(pickerSubmission(reconcilePick(payer, refused))).toEqual({
      freeOrgSlug: INNOVA.slug,
    });
  });
});

describe("the modal after a refused paid pick", () => {
  // The refetch lags: the choice still names a payer.
  const refusedFrame = () => {
    const opened = nextChoiceModalFrame(
      CLOSED_CHOICE_FRAME,
      choiceModal(payer, ctx),
    );
    let frame = nextChoicePage(nextChoicePage(opened));
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

  it("counts no paid step anywhere in the flow", () => {
    const frame = refusedFrame();
    const flow = choiceFrameFlow(frame, payer);
    expect(flow).toEqual({ intro: 2, payer: false });
    expect(pickFlowProgress(flow, { step: "free" })).toEqual({
      current: 3,
      total: 4,
    });
    expect(pickFlowProgress(flow, { step: "done" })).toEqual({
      current: 4,
      total: 4,
    });
    const back = previousChoicePage(frame);
    expect(back.phase).toEqual({ step: "intro", page: "not_kept" });
    expect(choiceIntroProgress(back, payer, "not_kept")).toEqual({
      current: 2,
      total: 4,
    });
  });

  it("leaves the picker for the intro on Back and resends the free pick alone", () => {
    const frame = refusedFrame();
    const draft = choiceFramePick(frame, payer);
    expect(draft).toEqual(refused);
    expect(pickerBack(draft)).toBeNull();
    const again = nextChoicePage(previousChoicePage(frame));
    expect(choiceFramePick(again, payer)).toEqual(refused);
    expect(pickerSubmission(choiceFramePick(again, payer))).toEqual({
      freeOrgSlug: INNOVA.slug,
    });
  });

  it("counts the paid step for a payer who was never refused", () => {
    const opened = nextChoiceModalFrame(
      CLOSED_CHOICE_FRAME,
      choiceModal(payer, ctx),
    );
    expect(choiceFrameFlow(opened, payer)).toEqual({ intro: 2, payer: true });
    expect(choiceIntroProgress(opened, payer, "notice")).toEqual({
      current: 1,
      total: 5,
    });
  });
});
