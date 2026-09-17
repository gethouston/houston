/**
 * The public Slack callback: `?settings=channels&slack=<ticket>`. It carries
 * navigation and a ONE-TIME completion ticket, never credentials — Slack's
 * approval proves only that someone finished in Slack, so the gateway binds
 * nothing until this ticket comes back on an authenticated call from a signed-in
 * user. The ticket is therefore taken straight out of the URL as it is read,
 * held in memory, and handed over once.
 */

/** The shape the gateway mints, mirrored by the engine client's wire guard. */
const SLACK_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

export type SlackCompletion =
  | { kind: "ticket"; ticket: string }
  | { kind: "invalid" };

export type SettingsLanding =
  | { kind: "absent" }
  | { kind: "settings"; section: "channels"; slack: SlackCompletion | null };

export function settingsLanding(search: string): SettingsLanding {
  const params = new URLSearchParams(search);
  // An assistant link is a different landing with its own authorization
  // (`assistant-landing.ts`). A URL claiming to be both is neither.
  if (params.has("assistant")) return { kind: "absent" };
  const values = params.getAll("settings");
  if (values.length !== 1 || values[0] !== "channels")
    return { kind: "absent" };
  return {
    kind: "settings",
    section: "channels",
    slack: slackCompletion(params.getAll("slack")),
  };
}

function slackCompletion(values: string[]): SlackCompletion | null {
  if (!values.length) return null;
  // A truncated, duplicated or rewritten ticket can never be redeemed, and
  // saying so beats landing on Channels as if nothing had been attempted.
  if (values.length !== 1 || !SLACK_TICKET.test(values[0]))
    return { kind: "invalid" };
  return { kind: "ticket", ticket: values[0] };
}

/** The URL a consumed callback leaves behind: the same page, minus the ticket. */
export function withoutSlackTicket(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("slack");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Read the callback and take the ticket out of the address bar in the same
 * pass, holding it in memory from here on. Reading and stripping are ONE step
 * on purpose: applying the landing waits for sign-in and workspace loading,
 * and a bearer secret sitting in `window.location` for that long is one that
 * analytics, session replay and the next crash report can all capture.
 *
 * `clean` receives the URL to put in place of the current one; anything shaped
 * like a ticket is stripped, redeemable or not.
 */
export function captureSettingsLanding(
  href: string,
  clean: (url: string) => void,
): SettingsLanding {
  const landing = settingsLanding(new URL(href).search);
  if (landing.kind === "settings" && landing.slack)
    clean(withoutSlackTicket(href));
  return landing;
}

export interface SettingsLandingPorts {
  open: (section: "channels") => void;
  /** Queue the completion for the Channels section, which redeems it once. */
  hand: (completion: SlackCompletion) => void;
}

/** Apply one captured callback: open the section, hand the completion over. */
export function applySettingsLanding(
  landing: SettingsLanding,
  ports: SettingsLandingPorts,
): void {
  if (landing.kind !== "settings") return;
  ports.open(landing.section);
  if (landing.slack) ports.hand(landing.slack);
}
