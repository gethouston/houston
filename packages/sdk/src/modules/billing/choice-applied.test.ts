import { describe, expect, it } from "vitest";
import type { BillingChoiceSave } from "./choice";
import { choiceDone, saveSettlesNotice } from "./choice-done";
import { choice, INNOVA, LA_FILA, org, PERSONAL } from "./choice-fixtures";
import { type ChoiceModalContext, choiceModal } from "./choice-modal";
import {
  CLOSED_CHOICE_FRAME,
  closeChoiceFrame,
  closeDismisses,
  finishConfirming,
  finishPicking,
  nextChoiceModalFrame,
} from "./choice-modal-frame";
import { nextChoicePage } from "./choice-modal-pages";
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
    expect(nextChoicePage(intro).phase).toEqual({ step: "picking" });
  });

  it("closes for the session on a stored confirmation", () => {
    const confirmed: BillingChoiceSave = {
      kind: "saved",
      choice: provisional,
    };
    expect(finishConfirming(intro, confirmed)).toEqual({
      frame: { ...intro, open: false, hold: "none" },
      closed: true,
    });
  });

  it("keeps the frame on a refusal", () => {
    const refused: BillingChoiceSave = { kind: "choice_closed" };
    expect(finishConfirming(intro, refused)).toEqual({
      frame: intro,
      closed: false,
    });
  });

  it("confirms nothing for a notice that is not a confirm", () => {
    const note = nextChoiceModalFrame(
      CLOSED_CHOICE_FRAME,
      choiceModal(picked, modalAt()),
    );
    expect(finishConfirming(note, saved).closed).toBe(false);
  });

  it("holds the picker when a stored change turns the notice into applied", () => {
    const picking = nextChoicePage(intro);
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
      closed: true,
    });
  });

  it("stores no second dismissal when a change's success step closes: the save settled it", () => {
    const done = finishPicking(nextChoicePage(intro), saved);
    expect(closeDismisses(done)).toBe(false);
    expect(closeDismisses(intro)).toBe(false);
    const note = nextChoiceModalFrame(
      CLOSED_CHOICE_FRAME,
      choiceModal(picked, modalAt()),
    );
    expect(closeDismisses(note)).toBe(true);
    expect(closeDismisses(closeChoiceFrame(note))).toBe(true);
  });
});

describe("saveSettlesNotice", () => {
  it("settles the notice on any pick stored after the cutover, a confirmation or a change", () => {
    expect(saveSettlesNotice({ kind: "saved", choice: provisional })).toBe(
      true,
    );
    expect(saveSettlesNotice({ kind: "saved", choice: picked })).toBe(true);
  });

  it("settles nothing before the cutover, once dismissed, or on a refusal", () => {
    expect(
      saveSettlesNotice({
        kind: "saved",
        choice: choice({ freeOrgSlug: LA_FILA.slug }),
      }),
    ).toBe(false);
    expect(
      saveSettlesNotice({
        kind: "saved",
        choice: { ...picked, noticeDismissed: true },
      }),
    ).toBe(false);
    expect(saveSettlesNotice({ kind: "choice_closed" })).toBe(false);
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

  it("reads an unlocked org that is neither the free nor the subscription's as paying on its own", () => {
    const team = org({ slug: "4444444444444444", name: "Acme" });
    const withTeam = choice({
      ...provisional,
      orgs: [...provisional.orgs, team],
    });
    expect(choiceDone(withTeam)?.orgs).toContainEqual({
      org: team,
      status: "paid",
    });
    expect(choiceDone({ ...withTeam, state: "pending" })?.orgs).toContainEqual({
      org: team,
      status: "needs_plan",
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
      interval: null,
      seatPriceCents: 2000,
      seatPrices: { monthlyCents: 2000, annualCents: 18000 },
      seatGraceEndsAt: null,
      renewsAt: null,
      priceNotice: null,
      nextAdjustment: null,
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
