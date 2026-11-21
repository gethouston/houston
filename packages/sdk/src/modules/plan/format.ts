export const LAUNCH_TIME_ZONE = "America/Los_Angeles";

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

const STRIPE_THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function stripeCurrencyDecimals(currency: string): number {
  const code = currency.toLowerCase();
  if (STRIPE_ZERO_DECIMAL.has(code)) return 0;
  if (STRIPE_THREE_DECIMAL.has(code)) return 3;
  return 2;
}

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

export function formatLaunchDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: LAUNCH_TIME_ZONE,
  }).format(new Date(value));
}

export function formatLaunchMonthDay(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    timeZone: LAUNCH_TIME_ZONE,
  }).format(new Date(value));
}

export function formatLocalDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatLocalDateTime(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
