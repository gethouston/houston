import { describe, expect, it } from "vitest";
import {
  BEFORE,
  CUTOVER,
  choice,
  INNOVA,
  LA_FILA,
  PERSONAL,
} from "./choice-fixtures";
import {
  type ChoiceModalContext,
  choiceModal,
  planDialogBlocks,
} from "./choice-modal";

const at = (patch: Partial<ChoiceModalContext> = {}): ChoiceModalContext => ({
  now: BEFORE,
  locale: "en",
  closedThisSession: false,
  otherDialogOpen: false,
  ...patch,
});

const CLOSED = { open: false, behindDialog: false };
const single = choice({ needed: false, orgs: [PERSONAL] });

describe("choiceModal", () => {
  it("asks an owner who has to pick on every app open, closing for the session", () => {
    expect(choiceModal(choice(), at())).toEqual({
      open: true,
      notice: { kind: "pick", date: "Friday, October 23", payer: false },
      close: "session",
    });
    expect(choiceModal(choice({ payer: "plus" }), at())).toMatchObject({
      open: true,
      notice: { kind: "pick", payer: true },
      close: "session",
    });
  });

  it("waits for the next app open after Maybe later", () => {
    expect(choiceModal(choice(), at({ closedThisSession: true }))).toEqual(
      CLOSED,
    );
  });

  it("still asks after a stored dismissal, since the pick is still open", () => {
    expect(choiceModal(choice({ noticeDismissed: true }), at())).toMatchObject({
      open: true,
      close: "session",
    });
  });

  it("shows a read-only notice once, closing it everywhere", () => {
    expect(choiceModal(single, at())).toEqual({
      open: true,
      notice: {
        kind: "single_org",
        date: "Friday, October 23",
        orgSlug: PERSONAL.slug,
        payer: false,
      },
      close: "everywhere",
    });
    expect(choiceModal(choice({ needed: false, orgs: [] }), at())).toEqual({
      open: true,
      notice: { kind: "member", date: "Friday, October 23" },
      close: "everywhere",
    });
    expect(choiceModal({ ...single, noticeDismissed: true }, at())).toEqual(
      CLOSED,
    );
  });

  it("stays closed for the session once a read-only notice is closed", () => {
    expect(choiceModal(single, at({ closedThisSession: true }))).toEqual(
      CLOSED,
    );
    expect(
      choiceModal(
        choice({ needed: false, orgs: [] }),
        at({ closedThisSession: true }),
      ),
    ).toEqual(CLOSED);
  });

  it("shows nothing for a stored pick the owner kept after dropping to one org", () => {
    const narrowed = choice({
      needed: false,
      orgs: [INNOVA],
      freeOrgSlug: INNOVA.slug,
    });
    expect(choiceModal(narrowed, at())).toEqual(CLOSED);
  });

  it("offers no picker once the change window has closed", () => {
    expect(
      choiceModal(
        choice({ changeableUntil: "2026-10-20T00:00:00.000Z" }),
        at(),
      ),
    ).toEqual(CLOSED);
  });

  it("shows nothing once the pick is stored", () => {
    const picked = choice({ freeOrgSlug: LA_FILA.slug });
    expect(choiceModal(picked, at())).toEqual(CLOSED);
    expect(
      choiceModal(
        choice({
          payer: "plus",
          freeOrgSlug: LA_FILA.slug,
          paidOrgSlug: INNOVA.slug,
        }),
        at(),
      ),
    ).toEqual(CLOSED);
  });

  it("never stacks on a plan dialog, and returns once it is gone", () => {
    const behind = { open: false, behindDialog: true };
    expect(choiceModal(choice(), at({ otherDialogOpen: true }))).toEqual(
      behind,
    );
    expect(choiceModal(single, at({ otherDialogOpen: true }))).toEqual(behind);
    const stored = choice({ freeOrgSlug: LA_FILA.slug });
    expect(choiceModal(stored, at({ otherDialogOpen: true }))).toEqual(behind);
    expect(choiceModal(choice(), at({ otherDialogOpen: false }))).toMatchObject(
      { open: true },
    );
  });

  it("shows nothing when applied, past the cutover, or unserved", () => {
    expect(choiceModal(choice({ state: "applied" }), at())).toEqual(CLOSED);
    expect(choiceModal(choice(), at({ now: Date.parse(CUTOVER) }))).toEqual(
      CLOSED,
    );
    expect(choiceModal(null, at())).toEqual(CLOSED);
    expect(choiceModal(undefined, at())).toEqual(CLOSED);
  });
});

describe("planDialogBlocks", () => {
  const blocks = (
    dialog: Parameters<typeof planDialogBlocks>[0],
    patch: Partial<Parameters<typeof planDialogBlocks>[1]> = {},
  ) =>
    planDialogBlocks(dialog, {
      planLoading: false,
      announcementClosed: false,
      ...patch,
    });

  it("blocks while a plan dialog shows", () => {
    expect(blocks("resume")).toBe(true);
    expect(blocks("keep")).toBe(true);
    expect(blocks("announcement")).toBe(true);
    expect(blocks(null)).toBe(false);
  });

  it("lets the modal follow the launch announcement once it is closed", () => {
    expect(blocks("announcement", { announcementClosed: true })).toBe(false);
    expect(blocks("keep", { announcementClosed: true })).toBe(true);
  });

  it("waits while the plan loads, since it may bring a dialog", () => {
    expect(blocks(null, { planLoading: true })).toBe(true);
    expect(
      blocks("announcement", { planLoading: true, announcementClosed: true }),
    ).toBe(true);
  });
});
