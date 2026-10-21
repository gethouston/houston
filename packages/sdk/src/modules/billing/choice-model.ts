import type {
  BillingChoice,
  BillingChoiceOrg,
  BillingChoicePick,
} from "@houston/wire-types";

/**
 * Where the person stands on the change. `pick`: an owner of several orgs who
 * has not picked and still may (`payer`: their subscription also moves to an
 * org they pick); it stays until they pick, whatever `noticeDismissed` says.
 * `picked`: a pick of an org they still own is stored, even if they own one
 * org now. `single_org`: the one org they own stays free (or, for a
 * subscriber, is what the subscription pays for). `member`: they own no org,
 * so each org's owner decides. `hidden`: past the cutover with nothing
 * applied, past the change window with nothing picked, or a read-only notice
 * that was dismissed.
 *
 * After the cutover applies a pick (`state` `applied`): `confirm` asks an
 * owner of several orgs whose orgs the cutover chose for them (`provisional`)
 * to confirm or change them, until `until` (the change window's last day).
 * `applied`: an owner who picked before the cutover reads once that the pick
 * is in place; `until` is the window's last day while it is open. Both stay
 * until the notice is dismissed, which confirming or changing the pick also
 * does, and neither shows to someone who owns a single org.
 *
 * Nothing here reads the active space: the notice is dismissed once for the
 * account, so the space it happens to show in must not decide what it says.
 */
export type ChoiceNotice =
  | { kind: "hidden" }
  | { kind: "pick"; date: string; payer: boolean }
  | { kind: "picked"; freeOrgSlug: string; paidOrgSlug: string | null }
  | { kind: "single_org"; date: string; orgSlug: string; payer: boolean }
  | { kind: "member"; date: string }
  | { kind: "confirm"; until: string }
  | { kind: "applied"; until: string | null };

export interface ChoiceContext {
  now: number;
  locale?: string;
}

/**
 * Every billing-choice date reads as its UTC calendar day. The cutover is
 * seeded at midnight in the Americas (`05:00Z`), which is still that day in
 * UTC but the day before in the launch zone, and the grace end arrives as a
 * bare `YYYY-MM-DD`, which parses as UTC midnight.
 */
const DAY_ZONE = "UTC";

/** A cutover instant as weekday, month and day ("Friday, October 23"). */
export function formatCutoverDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DAY_ZONE,
  }).format(new Date(value));
}

/** A cutover instant or a calendar day as month and day ("October 23"). */
export function formatCutoverDay(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    timeZone: DAY_ZONE,
  }).format(new Date(value));
}

/**
 * The instant the pick stops changing: the cutover (or a later stored
 * deadline) before it, the end of the change window after it. Null once
 * applied with no window.
 */
function changeDeadline(choice: BillingChoice): number | null {
  if (choice.state === "pending")
    return Date.parse(choice.changeableUntil ?? choice.cutoverAt);
  return choice.changeableUntil ? Date.parse(choice.changeableUntil) : null;
}

/**
 * True while the person may still pick, or change, their free org: an owner
 * of several orgs, before the cutover or inside the change window after it.
 */
export function canChangeChoice(
  choice: BillingChoice | null | undefined,
  now: number,
): choice is BillingChoice {
  if (!choice?.needed) return false;
  const deadline = changeDeadline(choice);
  return deadline !== null && now < deadline;
}

/** A subscriber whose subscription moves to one org they choose. */
export function choosesPaidOrg(choice: BillingChoice): boolean {
  return (
    (choice.payer === "plus" || choice.payer === "comp") &&
    choice.orgs.length > 1
  );
}

export function choiceNotice(
  choice: BillingChoice | null | undefined,
  context: ChoiceContext,
): ChoiceNotice {
  if (choice?.state === "applied") return appliedNotice(choice, context);
  if (!choice || context.now >= Date.parse(choice.cutoverAt))
    return { kind: "hidden" };
  const date = formatCutoverDate(choice.cutoverAt, context.locale);
  const stored = choice.orgs.find((org) => org.slug === choice.freeOrgSlug);
  if (stored)
    return {
      kind: "picked",
      freeOrgSlug: stored.slug,
      paidOrgSlug: choice.paidOrgSlug,
    };
  // Never offer a picker the gateway would refuse.
  if (choice.needed)
    return canChangeChoice(choice, context.now)
      ? { kind: "pick", date, payer: choosesPaidOrg(choice) }
      : { kind: "hidden" };
  if (choice.noticeDismissed) return { kind: "hidden" };
  const [only] = choice.orgs;
  if (!only) return { kind: "member", date };
  return {
    kind: "single_org",
    date,
    orgSlug: only.slug,
    payer: choice.payer === "plus" || choice.payer === "comp",
  };
}

/** The notice once the cutover applied a pick ({@link ChoiceNotice}). */
function appliedNotice(
  choice: BillingChoice,
  context: ChoiceContext,
): ChoiceNotice {
  const kept = choice.orgs.some((org) => org.slug === choice.freeOrgSlug);
  if (!choice.needed || choice.noticeDismissed || !kept)
    return { kind: "hidden" };
  const open = canChangeChoice(choice, context.now);
  const until =
    open && choice.changeableUntil
      ? formatCutoverDay(choice.changeableUntil, context.locale)
      : null;
  if (!choice.provisional) return { kind: "applied", until };
  return until ? { kind: "confirm", until } : { kind: "hidden" };
}

/**
 * The pick that confirms what the cutover applied: the same free org, and
 * the same paid org for a subscriber. Null when nothing was applied.
 */
export function appliedPick(choice: BillingChoice): BillingChoicePick | null {
  if (!choice.orgs.some((org) => org.slug === choice.freeOrgSlug)) return null;
  const free = choice.freeOrgSlug as string;
  const paid = choosesPaidOrg(choice) ? choice.paidOrgSlug : null;
  return paid
    ? { freeOrgSlug: free, paidOrgSlug: paid }
    : { freeOrgSlug: free };
}

export interface PickerRow {
  org: BillingChoiceOrg;
  /** The busiest org with any messages: the one most people keep free. */
  mostActive: boolean;
}

const lastActive = (org: BillingChoiceOrg) =>
  org.lastActiveOn ? Date.parse(org.lastActiveOn) : Number.NEGATIVE_INFINITY;

/**
 * Every owned org, busiest first: 30-day messages, then the latest activity,
 * then the personal org, then the slug, so equal orgs always list the same way.
 */
export function pickerRows(choice: BillingChoice): PickerRow[] {
  const sorted = [...choice.orgs].sort(
    (a, b) =>
      b.messages30d - a.messages30d ||
      lastActive(b) - lastActive(a) ||
      Number(b.personal) - Number(a.personal) ||
      a.slug.localeCompare(b.slug),
  );
  return sorted.map((org, index) => ({
    org,
    mostActive: index === 0 && org.messages30d > 0,
  }));
}
