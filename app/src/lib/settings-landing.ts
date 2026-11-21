const SLACK_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

export type SlackCompletion =
  | { kind: "ticket"; ticket: string }
  | { kind: "invalid" };

export type SettingsLanding =
  | { kind: "absent" }
  | { kind: "settings"; section: "channels"; slack: SlackCompletion | null }
  | { kind: "linkedin"; completion: SlackCompletion };

function linkedInLanding(values: string[]): SettingsLanding {
  const completion = slackCompletion(values);
  return completion ? { kind: "linkedin", completion } : { kind: "absent" };
}

export function settingsLanding(search: string): SettingsLanding {
  const params = new URLSearchParams(search);
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
  if (values.length !== 1 || !SLACK_TICKET.test(values[0]))
    return { kind: "invalid" };
  return { kind: "ticket", ticket: values[0] };
}

export function withoutTicket(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("slack");
  url.searchParams.delete("linkedin");
  if (url.searchParams.getAll("settings").includes("linkedin"))
    url.searchParams.delete("settings");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function captureSettingsLanding(
  href: string,
  clean: (url: string) => void,
): SettingsLanding {
  const { search, searchParams } = new URL(href);
  if (searchParams.has("slack") || searchParams.has("linkedin"))
    clean(withoutTicket(href));
  return settingsLanding(search);
}

let boot: { landing: SettingsLanding } | "handled" | null = null;

export function captureBootLanding(
  href: string,
  clean: (url: string) => void,
): void {
  if (boot === null) boot = { landing: captureSettingsLanding(href, clean) };
}

export function peekBootLanding(
  href: string,
  clean: (url: string) => void,
): SettingsLanding {
  captureBootLanding(href, clean);
  if (boot === null || boot === "handled") return { kind: "absent" };
  return boot.landing;
}

export function ackBootLanding(): void {
  boot = "handled";
}

export function carriesTicket(landing: SettingsLanding): boolean {
  return (
    landing.kind === "linkedin" ||
    (landing.kind === "settings" && landing.slack !== null)
  );
}

export interface SettingsLandingPorts {
  open: (section: "channels") => void;
  hand: (completion: SlackCompletion) => void;
  linkedIn: (completion: SlackCompletion) => void;
}

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
