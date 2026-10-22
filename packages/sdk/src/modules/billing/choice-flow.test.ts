import { describe, expect, it } from "vitest";
import { BEFORE, choice, LA_FILA } from "./choice-fixtures";
import { choiceIntroPages, pickFlow, pickFlowProgress } from "./choice-flow";
import { type AnnouncedChoice, choiceModal } from "./choice-modal";

const notice = (patch: Parameters<typeof choice>[0]): AnnouncedChoice => {
  const modal = choiceModal(choice(patch), {
    now: BEFORE,
    locale: "en",
    closedThisSession: false,
    otherDialogOpen: false,
  });
  if (!modal.open) throw new Error("the modal is closed");
  return modal.notice;
};

describe("choiceIntroPages", () => {
  it("gives a pick two pages and every other notice one", () => {
    expect(choiceIntroPages(notice({}))).toEqual(["notice", "not_kept"]);
    expect(
      choiceIntroPages(notice({ needed: false, orgs: [LA_FILA] })),
    ).toEqual(["notice"]);
    expect(choiceIntroPages(notice({ needed: false, orgs: [] }))).toEqual([
      "notice",
    ]);
  });
});

describe("pickFlowProgress", () => {
  it("counts an owner's intro pages, the free step and done", () => {
    const flow = pickFlow(choice(), notice({}), null);
    expect(flow).toEqual({ intro: 2, payer: false });
    expect(pickFlowProgress(flow, { step: "intro", index: 0 })).toEqual({
      current: 1,
      total: 4,
    });
    expect(pickFlowProgress(flow, { step: "intro", index: 1 })).toEqual({
      current: 2,
      total: 4,
    });
    expect(pickFlowProgress(flow, { step: "free" })).toEqual({
      current: 3,
      total: 4,
    });
    expect(pickFlowProgress(flow, { step: "done" })).toEqual({
      current: 4,
      total: 4,
    });
  });

  it("puts a payer's paid step before the free one", () => {
    const flow = pickFlow(
      choice({ payer: "plus" }),
      notice({ payer: "plus" }),
      null,
    );
    expect(flow).toEqual({ intro: 2, payer: true });
    expect(pickFlowProgress(flow, { step: "paid" })).toEqual({
      current: 3,
      total: 5,
    });
    expect(pickFlowProgress(flow, { step: "free" })).toEqual({
      current: 4,
      total: 5,
    });
    expect(pickFlowProgress(flow, { step: "done" })).toEqual({
      current: 5,
      total: 5,
    });
  });

  it("counts only the picker when it opens on its own", () => {
    const payer = pickFlow(choice({ payer: "comp" }), null, null);
    expect(payer).toEqual({ intro: 0, payer: true });
    expect(pickFlowProgress(payer, { step: "paid" })).toEqual({
      current: 1,
      total: 3,
    });
    const owner = pickFlow(choice(), null, null);
    expect(pickFlowProgress(owner, { step: "free" })).toBeNull();
    expect(pickFlowProgress(owner, { step: "done" })).toBeNull();
  });
});

describe("pickFlow after a refused paid pick", () => {
  const refused = {
    step: "free" as const,
    free: LA_FILA.slug,
    paid: null,
    paidRefused: true,
  };

  it("drops the paid step while the choice still names a payer", () => {
    const flow = pickFlow(
      choice({ payer: "plus" }),
      notice({ payer: "plus" }),
      refused,
    );
    expect(flow).toEqual({ intro: 2, payer: false });
    expect(pickFlowProgress(flow, { step: "intro", index: 1 })).toEqual({
      current: 2,
      total: 4,
    });
    expect(pickFlowProgress(flow, { step: "free" })).toEqual({
      current: 3,
      total: 4,
    });
    expect(pickFlowProgress(flow, { step: "done" })).toEqual({
      current: 4,
      total: 4,
    });
  });

  it("leaves the Settings picker a single step with no progress", () => {
    const flow = pickFlow(choice({ payer: "comp" }), null, refused);
    expect(flow).toEqual({ intro: 0, payer: false });
    expect(pickFlowProgress(flow, { step: "free" })).toBeNull();
    expect(pickFlowProgress(flow, { step: "done" })).toBeNull();
  });

  it("keeps the paid step for an unrefused draft", () => {
    const draft = { ...refused, paidRefused: false };
    expect(pickFlow(choice({ payer: "plus" }), null, draft)).toEqual({
      intro: 0,
      payer: true,
    });
  });
});
