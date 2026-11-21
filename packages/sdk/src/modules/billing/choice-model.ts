import type {
  BillingChoice,
  BillingChoiceOrg,
  BillingChoicePick,
} from "@houston/wire-types";

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

const DAY_ZONE = "UTC";

export function formatCutoverDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DAY_ZONE,
  }).format(new Date(value));
}

export function formatCutoverDay(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    timeZone: DAY_ZONE,
  }).format(new Date(value));
}

function changeDeadline(choice: BillingChoice): number | null {
  if (choice.state === "pending")
    return Date.parse(choice.changeableUntil ?? choice.cutoverAt);
  return choice.changeableUntil ? Date.parse(choice.changeableUntil) : null;
}

export function canChangeChoice(
  choice: BillingChoice | null | undefined,
  now: number,
): choice is BillingChoice {
  if (!choice?.needed) return false;
  const deadline = changeDeadline(choice);
  return deadline !== null && now < deadline;
}

export function namesPayer(choice: BillingChoice): boolean {
  return choice.payer === "plus" || choice.payer === "comp";
}

export function choosesPaidOrg(choice: BillingChoice): boolean {
  return namesPayer(choice) && choice.orgs.length > 1;
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
    payer: namesPayer(choice),
  };
}

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
  mostActive: boolean;
}

const lastActive = (org: BillingChoiceOrg) =>
  org.lastActiveOn ? Date.parse(org.lastActiveOn) : Number.NEGATIVE_INFINITY;

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
