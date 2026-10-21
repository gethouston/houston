import { describe, expect, it } from "vitest";
import type { BillingChoiceSave } from "./choice";
import { choiceDone } from "./choice-done";
import { choice, INNOVA, LA_FILA, PERSONAL } from "./choice-fixtures";
import { type ChoiceModalContext, choiceModal } from "./choice-modal";
import {
  CLOSED_CHOICE_FRAME,
  closeChoiceFrame,
  closeDismisses,
  finishConfirming,
  finishPicking,
  nextChoiceModalFrame,
  startPicking,
} from "./choice-modal-frame";
import { appliedPick, canChangeChoice, choiceNotice } from "./choice-model";
import { orgLocked } from "./recovery";

/** Two days after the cutover, inside the 14-day change window. */
const AFTER = Date.parse("2026-10-25T12:00:00.000Z");
const WINDOW_END = "2026-11-06T05:00:00Z";
const CLOSED = Date.parse("2026-11-07T00:00:00.000Z");
const LOCK_AT = "2026-11-06T05:00:00Z";

const locked = (o: typeof LA_FILA) => ({ ...o, lockAt: LOCK_AT });

/** What C4 left a Plus payer who never picked: La Fila free, Innova paid. */
const provisional = choice({
  payer: "plus",
  state: "applied",
  provisional: true,
  changeableUntil: WINDOW_END,
  freeOrgSlug: LA_FILA.slug,
  paidOrgSlug: INNOVA.slug,
  orgs: [locked(PERSONAL), INNOVA, LA_FILA],
});
/** An owner who picked before the cutover, the pick now applied. */
const picked = choice({
  state: "applied",
  changeableUntil: WINDOW_END,
  freeOrgSlug: INNOVA.slug,
  orgs: [locked(PERSONAL), INNOVA, locked(LA_FILA)],
});

const at = (now: number) => ({ now, locale: "en" });
const modalAt = (patch: Partial<ChoiceModalContext> = {}) => ({
  now: AFTER,
  locale: "en",
  closedThisSession: false,
  otherDialogOpen: false,
  ...patch,
});

describe("choiceNotice after the cutover", () => {
  it("asks an owner the cutover picked for to confirm, until the window ends", () => {
    expect(choiceNotice(provisional, at(AFTER))).toEqual({
      kind: "confirm",
      until: "November 6",
    });
  });

  it("tells an owner who picked that the pick is in place", () => {
    expect(choiceNotice(picked, at(AFTER))).toEqual({
      kind: "applied",
      until: "November 6",
    });
    expect(choiceNotice(picked, at(CLOSED))).toEqual({
      kind: "applied",
      until: null,
    });
  });

  it("asks nothing once the window closed, the notice was dismissed, or one org is owned", () => {
    expect(choiceNotice(provisional, at(CLOSED))).toEqual({ kind: "hidden" });
    expect(
      choiceNotice({ ...provisional, noticeDismissed: true }, at(AFTER)),
    ).toEqual({ kind: "hidden" });
    expect(
      choiceNotice({ ...picked, noticeDismissed: true }, at(AFTER)),
    ).toEqual({ kind: "hidden" });
    const single = choice({
      needed: false,
      state: "applied",
      provisional: true,
      changeableUntil: WINDOW_END,
      freeOrgSlug: PERSONAL.slug,
      orgs: [PERSONAL],
    });
    expect(choiceNotice(single, at(AFTER))).toEqual({ kind: "hidden" });
    expect(choiceNotice({ ...single, provisional: false }, at(AFTER))).toEqual({
      kind: "hidden",
    });
  });

  it("asks nothing when no applied org is still owned", () => {
    expect(
      choiceNotice({ ...provisional, freeOrgSlug: null }, at(AFTER)),
    ).toEqual({ kind: "hidden" });
  });
});

describe("canChangeChoice after the cutover", () => {
  it("holds inside the change window only", () => {
    expect(canChangeChoice(provisional, AFTER)).toBe(true);
    expect(canChangeChoice(provisional, CLOSED)).toBe(false);
    expect(
      canChangeChoice({ ...provisional, changeableUntil: null }, AFTER),
    ).toBe(false);
    expect(canChangeChoice({ ...provisional, needed: false }, AFTER)).toBe(
      false,
    );
  });
});

describe("appliedPick", () => {
  it("repeats the applied free and paid orgs", () => {
    expect(appliedPick(provisional)).toEqual({
      freeOrgSlug: LA_FILA.slug,
      paidOrgSlug: INNOVA.slug,
    });
    expect(appliedPick(picked)).toEqual({ freeOrgSlug: INNOVA.slug });
  });

  it("sends no paid org without a subscription, and nothing without a free org", () => {
    expect(appliedPick({ ...provisional, payer: null })).toEqual({
      freeOrgSlug: LA_FILA.slug,
    });
    expect(appliedPick({ ...provisional, freeOrgSlug: null })).toBeNull();
  });
});

describe("choiceModal after the cutover", () => {
  it("asks to confirm on every app open, closing for the session", () => {
    expect(choiceModal(provisional, modalAt())).toEqual({
      open: true,
      notice: { kind: "confirm", until: "November 6" },
      close: "session",
    });
    expect(
      choiceModal(provisional, modalAt({ closedThisSession: true })),
    ).toEqual({ open: false, behindDialog: false });
  });

  it("shows the applied note once, closing it everywhere", () => {
    expect(choiceModal(picked, modalAt())).toEqual({
      open: true,
      notice: { kind: "applied", until: "November 6" },
      close: "everywhere",
    });
  });
});

describe("the confirm frame", () => {
  const confirm = choiceModal(provisional, modalAt());
  const intro = nextChoiceModalFrame(CLOSED_CHOICE_FRAME, confirm);
  const changed = choice({
    ...provisional,
    provisional: false,
    freeOrgSlug: PERSONAL.slug,
    orgs: [PERSONAL, INNOVA, locked(LA_FILA)],
  });
  const saved: BillingChoiceSave = { kind: "saved", choice: changed };

  it("moves Change on to the picker", () => {
    expect(startPicking(intro).phase).toEqual({ step: "picking" });
  });

  it("closes on a stored confirmation and settles the notice", () => {
    const confirmed: BillingChoiceSave = {
      kind: "saved",
      choice: provisional,
    };
    expect(finishConfirming(intro, confirmed)).toEqual({
      frame: { ...intro, open: false, hold: "none" },
      dismiss: true,
    });
  });

  it("keeps the frame on a refusal, settling nothing", () => {
    const refused: BillingChoiceSave = { kind: "choice_closed" };
    expect(finishConfirming(intro, refused)).toEqual({
      frame: intro,
      dismiss: false,
    });
  });

  it("confirms nothing for a notice that is not a confirm", () => {
    const note = nextChoiceModalFrame(
      CLOSED_CHOICE_FRAME,
      choiceModal(picked, modalAt()),
    );
    expect(finishConfirming(note, saved).dismiss).toBe(false);
  });

  it("holds the picker when a stored change turns the notice into applied", () => {
    const picking = startPicking(intro);
    const applied = choiceModal(changed, modalAt());
    const held = nextChoiceModalFrame(picking, applied);
    expect(held).toMatchObject({
      phase: { step: "picking" },
      hold: "until_answer",
    });
    expect(finishPicking(held, saved).phase).toMatchObject({ step: "done" });
  });

  it("holds the confirm intro when its own confirmation turns the notice into applied", () => {
    const confirmed = choice({ ...provisional, provisional: false });
    const held = nextChoiceModalFrame(intro, choiceModal(confirmed, modalAt()));
    expect(held).toMatchObject({
      open: true,
      phase: { step: "intro" },
      hold: "until_answer",
      shown: { notice: { kind: "confirm" } },
    });
    expect(
      finishConfirming(held, { kind: "saved", choice: confirmed }),
    ).toEqual({
      frame: { ...held, open: false, hold: "none" },
      dismiss: true,
    });
  });

  it("settles the notice when the success step of a change closes", () => {
    const done = finishPicking(startPicking(intro), saved);
    expect(closeDismisses(done)).toBe(true);
    expect(closeDismisses(intro)).toBe(false);
    expect(closeDismisses(closeChoiceFrame(done))).toBe(true);
  });
});

describe("choiceDone after the cutover", () => {
  it("shows what each org is now, with the lock the cutover scheduled", () => {
    expect(choiceDone(provisional)).toEqual({
      free: LA_FILA,
      paid: INNOVA,
      applied: true,
      changeableUntil: WINDOW_END,
      cutoverAt: provisional.cutoverAt,
      orgs: [
        { org: LA_FILA, status: "free" },
        { org: INNOVA, status: "subscription" },
        { org: locked(PERSONAL), status: "locks" },
      ],
    });
  });
});

describe("orgLocked", () => {
  it("holds only for a locked org", () => {
    const billing = {
      tier: "free" as const,
      status: "locked" as const,
      lockAt: LOCK_AT,
      lockReason: "migration" as const,
      freeSlot: false,
      isBillingOwner: true,
      seats: 1,
      seatPriceCents: 1500,
      seatGraceEndsAt: null,
      usage: null,
      routines: null,
    };
    expect(orgLocked(billing)).toBe(true);
    expect(orgLocked({ ...billing, status: "past_due" })).toBe(false);
    expect(orgLocked({ ...billing, status: "active" })).toBe(false);
    expect(orgLocked(null)).toBe(false);
    expect(orgLocked(undefined)).toBe(false);
  });
});
