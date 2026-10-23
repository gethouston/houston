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
      paidRefused: false,
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
    expect(draft).toEqual({
      step: "free",
      free: PERSONAL.slug,
      paid: null,
      paidRefused: false,
    });
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
      paidRefused: false,
    });
    frame = withChoicePick(frame, back ?? choiceFramePick(frame, payer));
    expect(pickerBack(choiceFramePick(frame, payer))).toBeNull();
    frame = nextChoicePage(previousChoicePage(frame));
    const draft = choiceFramePick(frame, payer);
    expect(draft).toEqual({
      step: "paid",
      free: PERSONAL.slug,
      paid: INNOVA.slug,
      paidRefused: false,
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
      paidRefused: false,
    });
    const refetched = nextChoiceModalFrame(
      frame,
      choiceModal(choice({ freeOrgSlug: null }), ctx),
    );
    expect(refetched.pick).toEqual({
      step: "free",
      free: PERSONAL.slug,
      paid: null,
      paidRefused: false,
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
      paidRefused: false,
    });
  });

  it("reconciles the draft against the latest choice", () => {
    const frame = withChoicePick(toPicker(open()), {
      step: "free",
      free: PERSONAL.slug,
      paid: null,
      paidRefused: false,
    });
    const left = choice({ orgs: [LA_FILA, INNOVA] });
    expect(choiceFramePick(frame, left)).toEqual({
      step: "free",
      free: LA_FILA.slug,
      paid: null,
      paidRefused: false,
    });
  });
});

describe("choiceIntroProgress", () => {
  it("counts a pick's intro pages into the flow", () => {
    const frame = open();
    expect(choiceIntroProgress(frame, owner, "notice")).toEqual({
      current: 1,
      total: 4,
    });
    expect(choiceIntroProgress(frame, owner, "not_kept")).toEqual({
      current: 2,
      total: 4,
    });
    expect(choiceIntroProgress(open(payer), payer, "not_kept")).toEqual({
      current: 2,
      total: 5,
    });
  });

  it("answers null for any notice but a pick", () => {
    const single = choice({ needed: false, payer: "plus", orgs: [LA_FILA] });
    const frame = open(single);
    expect(frame.shown?.notice.kind).toBe("single_org");
    expect(choiceIntroProgress(frame, single, "notice")).toBeNull();
  });
});
