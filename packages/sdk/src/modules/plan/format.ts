/**
 * Display formatting for C19 plan values. Amounts arrive in Stripe minor units
 * and dates as ISO instants; every function takes the app language so the copy
 * around them and the values themselves read in one language.
 */

/**
 * The zone that defines the C19 launch instants (`limitsStartAt`, the early
 * offer's `coversFrom`, `coversUntil`, `endsAt`): midnight in San Francisco.
 * Formatting them in the viewer's zone would show "September 30" west of it.
 */
export const LAUNCH_TIME_ZONE = "America/Los_Angeles";

/** Stripe's zero-decimal currencies: `unit_amount` is already whole units. */
const STRIPE_ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

/** Stripe's three-decimal currencies. */
const STRIPE_THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

/**
 * Decimal places Stripe uses for `currency`'s minor units. Everything outside
 * the two lists is two-decimal, INCLUDING currencies ICU formats with zero
 * decimals (ISK, HUF, TWD, IDR…): Stripe still expects those amounts times
 * 100, so reading the digits from `Intl` would show them 100 times too large.
 */
export function stripeCurrencyDecimals(currency: string): number {
  const code = currency.toLowerCase();
  if (STRIPE_ZERO_DECIMAL.has(code)) return 0;
  if (STRIPE_THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/** A Stripe minor-unit amount as currency; whole amounts drop the decimals. */
export function formatPlanAmount(
  amount: number,
  currency: string,
  locale?: string,
): string {
  const decimals = stripeCurrencyDecimals(currency);
  const value = amount / 10 ** decimals;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : decimals,
    maximumFractionDigits: whole ? 0 : decimals,
  }).format(value);
}

/** A launch instant as a medium date in its defining zone ("Oct 1, 2026"). */
export function formatLaunchDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: LAUNCH_TIME_ZONE,
  }).format(new Date(value));
}

/** A launch instant as month and day in its defining zone ("October 1"). */
export function formatLaunchMonthDay(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    timeZone: LAUNCH_TIME_ZONE,
  }).format(new Date(value));
}

/** A personal instant (renewal) as a medium date in the viewer's zone. */
export function formatLocalDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

/** A personal instant (usage reset) as date and time in the viewer's zone. */
export function formatLocalDateTime(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
