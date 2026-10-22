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
  defaultFreeOrg,
  defaultPaidOrg,
  nextChoiceDeadline,
  pickerBack,
  pickerSubmission,
  pickRefused,
  reconcilePick,
  startPick,
  toFreeStep,
} from "./choice-picker";

const payer = choice({ payer: "plus" });

describe("the picker's starting point", () => {
  it("starts a payer on the paid step, everyone else on the free one", () => {
    expect(startPick(payer)).toEqual({
      step: "paid",
      free: null,
      paid: LA_FILA.slug,
    });
    expect(startPick(choice())).toEqual({
      step: "free",
      free: LA_FILA.slug,
      paid: null,
    });
  });

  it("starts the paid step on the stored paid org, else the busiest", () => {
    expect(defaultPaidOrg(payer)).toBe(LA_FILA.slug);
    expect(defaultPaidOrg(choice({ paidOrgSlug: PERSONAL.slug }))).toBe(
      PERSONAL.slug,
    );
    expect(defaultPaidOrg(choice({ paidOrgSlug: "gone" }))).toBe(LA_FILA.slug);
  });

  it("starts the free step on the stored pick, else the busiest, never the paid org", () => {
    expect(defaultFreeOrg(choice(), null)).toBe(LA_FILA.slug);
    expect(defaultFreeOrg(choice(), LA_FILA.slug)).toBe(INNOVA.slug);
    expect(
      defaultFreeOrg(choice({ freeOrgSlug: PERSONAL.slug }), LA_FILA.slug),
    ).toBe(PERSONAL.slug);
    expect(
      defaultFreeOrg(choice({ freeOrgSlug: LA_FILA.slug }), LA_FILA.slug),
    ).toBe(INNOVA.slug);
  });
});

describe("toFreeStep", () => {
  it("keeps the free pick unless it became the paid org", () => {
    expect(
      toFreeStep(payer, {
        step: "paid",
        free: PERSONAL.slug,
        paid: INNOVA.slug,
      }),
    ).toEqual({ step: "free", free: PERSONAL.slug, paid: INNOVA.slug });
    expect(
      toFreeStep(payer, { step: "paid", free: INNOVA.slug, paid: INNOVA.slug }),
    ).toEqual({ step: "free", free: LA_FILA.slug, paid: INNOVA.slug });
    expect(
      toFreeStep(payer, { step: "paid", free: null, paid: LA_FILA.slug }),
    ).toEqual({ step: "free", free: INNOVA.slug, paid: LA_FILA.slug });
  });
});

describe("reconcilePick", () => {
  const freeStep = {
    step: "free" as const,
    free: INNOVA.slug,
    paid: LA_FILA.slug,
  };

  it("keeps a valid payer state as it is", () => {
    expect(reconcilePick(payer, freeStep)).toEqual(freeStep);
    const paidStep = { step: "paid" as const, free: null, paid: INNOVA.slug };
    expect(reconcilePick(payer, paidStep)).toEqual(paidStep);
  });

  it("drops to the free step alone once the subscription is gone", () => {
    expect(reconcilePick(choice(), freeStep)).toEqual({
      step: "free",
      free: INNOVA.slug,
      paid: null,
    });
    expect(
      reconcilePick(choice(), { step: "paid", free: null, paid: INNOVA.slug }),
    ).toEqual({ step: "free", free: LA_FILA.slug, paid: null });
  });

  it("goes back to the paid step when the paid org is dropped", () => {
    const left = choice({ payer: "plus", orgs: [PERSONAL, INNOVA] });
    // The free pick stays on the paid step; the free step settles the collision.
    expect(reconcilePick(left, freeStep)).toEqual({
      step: "paid",
      free: INNOVA.slug,
      paid: INNOVA.slug,
    });
    const keepsFree = { ...freeStep, free: PERSONAL.slug };
    expect(reconcilePick(left, keepsFree)).toEqual({
      step: "paid",
      free: PERSONAL.slug,
      paid: INNOVA.slug,
    });
  });

  it("stays on the free step with its default when only the free org is dropped", () => {
    const left = choice({ payer: "plus", orgs: [PERSONAL, LA_FILA] });
    expect(reconcilePick(left, freeStep)).toEqual({
      step: "free",
      free: PERSONAL.slug,
      paid: LA_FILA.slug,
    });
  });

  it("replaces a non-payer's dropped free org with the busiest", () => {
    const left = choice({ orgs: [PERSONAL, INNOVA] });
    expect(
      reconcilePick(left, { step: "free", free: LA_FILA.slug, paid: null }),
    ).toEqual({ step: "free", free: INNOVA.slug, paid: null });
  });
});

describe("changing the paid pick after Back", () => {
  it("keeps the free pick while it is still owned", () => {
    // Paid La Fila, free Innova, Back, Innova as paid, La Fila again, Next.
    let state = toFreeStep(payer, {
      step: "paid",
      free: null,
      paid: LA_FILA.slug,
    });
    state = { ...state, free: INNOVA.slug };
    state = pickerBack(state) ?? state;
    state = reconcilePick(payer, { ...state, paid: INNOVA.slug });
    expect(state).toEqual({
      step: "paid",
      free: INNOVA.slug,
      paid: INNOVA.slug,
    });
    state = reconcilePick(payer, { ...state, paid: LA_FILA.slug });
    expect(toFreeStep(payer, state)).toEqual({
      step: "free",
      free: INNOVA.slug,
      paid: LA_FILA.slug,
    });
  });
});

describe("pickRefused", () => {
  const freeStep = {
    step: "free" as const,
    free: INNOVA.slug,
    paid: LA_FILA.slug,
  };

  it("drops the paid pick on not_payer and stays on the free step", () => {
    const refused = pickRefused(freeStep, { kind: "not_payer" });
    expect(refused).toEqual({ step: "free", free: INNOVA.slug, paid: null });
    // A refetch that lags or fails still names a payer: nothing is resent.
    expect(reconcilePick(payer, refused)).toEqual(refused);
    expect(pickerSubmission(reconcilePick(payer, refused))).toEqual({
      freeOrgSlug: INNOVA.slug,
    });
    expect(pickerBack(refused)).toBeNull();
  });

  it("keeps the picker on any other answer", () => {
    expect(pickRefused(freeStep, { kind: "not_owner" })).toBe(freeStep);
    expect(pickRefused(freeStep, { kind: "saved", choice: payer })).toBe(
      freeStep,
    );
  });
});

describe("pickerBack", () => {
  it("returns a payer's free step to the paid one, else leaves the picker", () => {
    expect(
      pickerBack({ step: "free", free: INNOVA.slug, paid: LA_FILA.slug }),
    ).toEqual({ step: "paid", free: INNOVA.slug, paid: LA_FILA.slug });
    expect(
      pickerBack({ step: "paid", free: null, paid: LA_FILA.slug }),
    ).toBeNull();
    expect(pickerBack({ step: "free", free: INNOVA.slug, paid: null })).toBe(
      null,
    );
  });
});

describe("pickerSubmission", () => {
  it("sends the free pick, with the paid one for a payer", () => {
    expect(
      pickerSubmission({ step: "free", free: INNOVA.slug, paid: null }),
    ).toEqual({ freeOrgSlug: INNOVA.slug });
    expect(
      pickerSubmission({ step: "free", free: INNOVA.slug, paid: LA_FILA.slug }),
    ).toEqual({ freeOrgSlug: INNOVA.slug, paidOrgSlug: LA_FILA.slug });
  });

  it("sends nothing without a free pick or before the free step", () => {
    expect(pickerSubmission({ step: "free", free: null, paid: null })).toBe(
      null,
    );
    expect(
      pickerSubmission({ step: "paid", free: INNOVA.slug, paid: LA_FILA.slug }),
    ).toBeNull();
  });
});

describe("nextChoiceDeadline", () => {
  it("counts down to the change window, then the cutover", () => {
    const cutover = Date.parse(CUTOVER);
    expect(nextChoiceDeadline(choice(), BEFORE)).toBe(cutover - BEFORE);
    const window = choice({ changeableUntil: "2026-10-21T00:00:00Z" });
    expect(nextChoiceDeadline(window, BEFORE)).toBe(
      Date.parse("2026-10-21T00:00:00Z") - BEFORE,
    );
    expect(nextChoiceDeadline(choice(), cutover)).toBeNull();
    expect(nextChoiceDeadline(null, BEFORE)).toBeNull();
  });
});
