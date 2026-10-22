import { describe, expect, it } from "vitest";
import { BEFORE, choice, INNOVA, LA_FILA, PERSONAL } from "./choice-fixtures";
import { choiceModal } from "./choice-modal";
import {
  type ChoiceModalFrame,
  CLOSED_CHOICE_FRAME,
  closeChoiceFrame,
  nextChoiceModalFrame,
} from "./choice-modal-frame";
import {
  choiceFramePick,
  choiceIntroProgress,
  nextChoicePage,
  previousChoicePage,
  withChoicePick,
} from "./choice-modal-pages";
import { pickerBack, pickerSubmission, toFreeStep } from "./choice-picker";

const ctx = {
  now: BEFORE,
  locale: "en",
  closedThisSession: false,
  otherDialogOpen: false,
};
const owner = choice();
const payer = choice({ payer: "plus" });
const open = (data = owner) =>
  nextChoiceModalFrame(CLOSED_CHOICE_FRAME, choiceModal(data, ctx));
const toPicker = (frame: ChoiceModalFrame) =>
  nextChoicePage(nextChoicePage(frame));

describe("the picker's draft in the modal frame", () => {
  it("starts where the picker starts", () => {
    expect(choiceFramePick(toPicker(open()), owner)).toEqual({
      step: "free",
      free: LA_FILA.slug,
      paid: null,
    });
  });

  it("keeps an owner's pick through Back into the intro and Next again", () => {
    let frame = toPicker(open());
    frame = withChoicePick(frame, {
      ...choiceFramePick(frame, owner),
      free: PERSONAL.slug,
    });
    frame = previousChoicePage(frame);
    expect(frame.phase).toEqual({ step: "intro", page: "not_kept" });
    frame = nextChoicePage(frame);
    expect(frame.phase).toEqual({ step: "picking" });
    const draft = choiceFramePick(frame, owner);
    expect(draft).toEqual({ step: "free", free: PERSONAL.slug, paid: null });
    expect(pickerSubmission(draft)).toEqual({ freeOrgSlug: PERSONAL.slug });
  });

  it("keeps both of a payer's picks through Back into the intro", () => {
    let frame = toPicker(open(payer));
    const paid = { ...choiceFramePick(frame, payer), paid: INNOVA.slug };
    frame = withChoicePick(frame, toFreeStep(payer, paid));
    frame = withChoicePick(frame, {
      ...choiceFramePick(frame, payer),
      free: PERSONAL.slug,
    });
    // Back from the free step stays in the picker, then leaves it.
    const back = pickerBack(choiceFramePick(frame, payer));
    expect(back).toEqual({
      step: "paid",
      free: PERSONAL.slug,
      paid: INNOVA.slug,
    });
    frame = withChoicePick(frame, back ?? choiceFramePick(frame, payer));
    expect(pickerBack(choiceFramePick(frame, payer))).toBeNull();
    frame = nextChoicePage(previousChoicePage(frame));
    const draft = choiceFramePick(frame, payer);
    expect(draft).toEqual({
      step: "paid",
      free: PERSONAL.slug,
      paid: INNOVA.slug,
    });
    expect(pickerSubmission(toFreeStep(payer, draft))).toEqual({
      freeOrgSlug: PERSONAL.slug,
      paidOrgSlug: INNOVA.slug,
    });
  });

  it("drops the draft on a fresh open, never on a refetch", () => {
    const frame = withChoicePick(toPicker(open()), {
      step: "free",
      free: PERSONAL.slug,
      paid: null,
    });
    const refetched = nextChoiceModalFrame(
      frame,
      choiceModal(choice({ freeOrgSlug: null }), ctx),
    );
    expect(refetched.pick).toEqual({
      step: "free",
      free: PERSONAL.slug,
      paid: null,
    });
    const reopened = nextChoiceModalFrame(
      closeChoiceFrame(frame),
      choiceModal(owner, ctx),
    );
    expect(reopened.pick).toBeNull();
    expect(choiceFramePick(reopened, owner)).toEqual({
      step: "free",
      free: LA_FILA.slug,
      paid: null,
    });
  });

  it("reconciles the draft against the latest choice", () => {
    const frame = withChoicePick(toPicker(open()), {
      step: "free",
      free: PERSONAL.slug,
      paid: null,
    });
    const left = choice({ orgs: [LA_FILA, INNOVA] });
    expect(choiceFramePick(frame, left)).toEqual({
      step: "free",
      free: LA_FILA.slug,
      paid: null,
    });
  });
});

describe("choiceIntroProgress", () => {
  it("counts a pick's intro pages into the flow", () => {
    const notice = choiceModal(owner, ctx);
    if (!notice.open) throw new Error("the modal is closed");
    expect(choiceIntroProgress(owner, notice.notice, "notice")).toEqual({
      current: 1,
      total: 4,
    });
    expect(choiceIntroProgress(owner, notice.notice, "not_kept")).toEqual({
      current: 2,
      total: 4,
    });
    const paying = choiceModal(payer, ctx);
    if (!paying.open) throw new Error("the modal is closed");
    expect(choiceIntroProgress(payer, paying.notice, "not_kept")).toEqual({
      current: 2,
      total: 5,
    });
  });

  it("answers null for any notice but a pick", () => {
    const single = choice({ needed: false, payer: "plus", orgs: [LA_FILA] });
    const modal = choiceModal(single, ctx);
    if (!modal.open) throw new Error("the modal is closed");
    expect(modal.notice.kind).toBe("single_org");
    expect(choiceIntroProgress(single, modal.notice, "notice")).toBeNull();
  });
});
