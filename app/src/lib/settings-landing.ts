/**
 * The public Slack callback: `?settings=channels&slack=<ticket>`. It carries
 * navigation and a ONE-TIME completion ticket, never credentials — Slack's
 * approval proves only that someone finished in Slack, so the gateway binds
 * nothing until this ticket comes back on an authenticated call from a signed-in
 * user. The ticket is therefore taken straight out of the URL as it is read,
 * held in memory, and handed over once.
 *
 * A LinkedIn connect comes back the same way, on
 * `?settings=linkedin&linkedin=<ticket>`: no section opens for it, the ticket
 * is redeemed and the connection lands wherever the share dialog waits.
 */

/** The shape the gateway mints, mirrored by the engine client's wire guard. */
const SLACK_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

export type SlackCompletion =
  | { kind: "ticket"; ticket: string }
  | { kind: "invalid" };

export type SettingsLanding =
  | { kind: "absent" }
  | { kind: "settings"; section: "channels"; slack: SlackCompletion | null }
  | { kind: "linkedin"; completion: SlackCompletion };

/** A LinkedIn return, or absent when it carries no ticket at all. */
function linkedInLanding(values: string[]): SettingsLanding {
  const completion = slackCompletion(values);
  return completion ? { kind: "linkedin", completion } : { kind: "absent" };
}

export function settingsLanding(search: string): SettingsLanding {
  const params = new URLSearchParams(search);
  // An assistant link is a different landing with its own authorization
  // (`assistant-landing.ts`). A URL claiming to be both is neither.
  if (params.has("assistant")) return { kind: "absent" };
  const values = params.getAll("settings");
  if (values.length === 1 && values[0] === "linkedin")
    return linkedInLanding(params.getAll("linkedin"));
  if (values.length !== 1 || values[0] !== "channels")
    return { kind: "absent" };
  return {
    kind: "settings",
    section: "channels",
    slack: slackCompletion(params.getAll("slack")),
  };
}

/**
 * The desktop return of a desktop-started Slack connect: the gateway's
 * callback page opens `houston://settings/channels?slack=<ticket>`, the same
 * landing the web callback carries in its query.
 */
export function settingsLandingFromDeepLink(value: string): SettingsLanding {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "absent" };
  }
  if (url.protocol !== "houston:" || url.hostname !== "settings")
    return { kind: "absent" };
  if (/^\/linkedin\/?$/.test(url.pathname))
    return linkedInLanding(url.searchParams.getAll("linkedin"));
  if (!/^\/channels\/?$/.test(url.pathname)) return { kind: "absent" };
  return {
    kind: "settings",
    section: "channels",
    slack: slackCompletion(url.searchParams.getAll("slack")),
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

/**
 * The URL a captured landing leaves behind: the same page minus the landing
 * (`settings`, and the `slack` or `linkedin` ticket), which lives in memory
 * from then on.
 */
export function withoutLanding(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("settings");
  url.searchParams.delete("slack");
  url.searchParams.delete("linkedin");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Read the callback and take it out of the address bar in the same pass,
 * holding it in memory from here on. Reading and stripping are ONE step on
 * purpose: applying the landing waits for sign-in and workspace loading, and
 * a bearer secret sitting in `window.location` for that long is one that
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
  if (landing.kind !== "absent") clean(withoutLanding(href));
  return landing;
}

/** The page's landing: not read yet, read and held, or handled. */
let boot: { landing: SettingsLanding } | "handled" | null = null;

/**
 * Capture the page's landing at boot, before analytics and Sentry start: the
 * first event (`session_started`, with PostHog's `$current_url`) and Sentry's
 * navigation breadcrumbs would otherwise carry the ticket. Runs once; a
 * later call is a no-op. The web entry calls it before the app loads.
 */
export function captureBootLanding(
  href: string,
  clean: (url: string) => void,
): void {
  if (boot === null) boot = { landing: captureSettingsLanding(href, clean) };
}

/**
 * The landing the page booted with, held in memory until a consumer applies
 * it (`ackBootLanding`): a shell that remounts before sign-in finishes reads
 * it again, as it once re-read the URL. `absent` once handled. An entry that
 * never captured one (the desktop app) captures it now.
 */
export function peekBootLanding(
  href: string,
  clean: (url: string) => void,
): SettingsLanding {
  captureBootLanding(href, clean);
  if (boot === null || boot === "handled") return { kind: "absent" };
  return boot.landing;
}

/** The boot landing was applied: no later mount sees it again. */
export function ackBootLanding(): void {
  boot = "handled";
}

/** Whether applying `landing` spends a one-time ticket. */
export function carriesTicket(landing: SettingsLanding): boolean {
  return (
    landing.kind === "linkedin" ||
    (landing.kind === "settings" && landing.slack !== null)
  );
}

export interface SettingsLandingPorts {
  open: (section: "channels") => void;
  /** Queue the completion for the Channels section, which redeems it once. */
  hand: (completion: SlackCompletion) => void;
  /** Queue a LinkedIn completion, redeemed once wherever the app is. */
  linkedIn: (completion: SlackCompletion) => void;
}

/** Apply one captured callback: open the section, hand the completion over. */
export function applySettingsLanding(
  landing: SettingsLanding,
  ports: SettingsLandingPorts,
): void {
  if (landing.kind === "linkedin") {
    ports.linkedIn(landing.completion);
    return;
  }
  if (landing.kind !== "settings") return;
  ports.open(landing.section);
  if (landing.slack) ports.hand(landing.slack);
}
