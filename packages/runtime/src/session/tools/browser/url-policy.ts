import { BrowserToolError } from "./errors";
import {
  blockedAddress,
  type PrivateNetworks,
  privateNetworksFor,
} from "./ip-ranges";

const WEB_SCHEMES = new Set(["http:", "https:"]);

const processPrivateNetworks = (): PrivateNetworks =>
  privateNetworksFor(process.env);

type BlockedKind = "this_machine" | "link_local" | "private_network";

export function blockedHost(
  hostname: string,
  privateNetworks: PrivateNetworks = processPrivateNetworks(),
): BlockedKind | null {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost"))
    return "this_machine";
  if (host === "metadata" || host.endsWith(".internal")) return "link_local";
  return blockedAddress(host, privateNetworks);
}

export function isBlockedHost(
  hostname: string,
  privateNetworks: PrivateNetworks = processPrivateNetworks(),
): boolean {
  return blockedHost(hostname, privateNetworks) !== null;
}

export const BLOCKED_ON_PURPOSE =
  "It is blocked on purpose: do not fetch it another way, such as with the shell, curl or code.";

export function refusalText(lead: string, host: string): string {
  return blockedHost(host) === "this_machine"
    ? THIS_MACHINE
    : `${lead} ${BLOCKED_ON_PURPOSE}`;
}

const THIS_MACHINE =
  "That address points at this computer itself, so the browser will not open it.";

const REFUSALS = {
  this_machine: THIS_MACHINE,
  link_local: `That address is not on the public web, so the browser will not open it. ${BLOCKED_ON_PURPOSE}`,
  private_network: `That address is on a private network, not the public web, so the browser will not open it. ${BLOCKED_ON_PURPOSE}`,
} as const satisfies Record<BlockedKind, string>;

export function checkBrowserUrl(
  raw: string,
  privateNetworks: PrivateNetworks = processPrivateNetworks(),
): URL {
  const trimmed = raw.trim();
  if (!trimmed)
    throw new BrowserToolError("invalid_action", "Give the page's address.");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch (error) {
    throw new BrowserToolError(
      "invalid_action",
      `'${raw}' is not a web address.`,
      { cause: error },
    );
  }
  if (!WEB_SCHEMES.has(url.protocol))
    throw new BrowserToolError(
      "url_refused",
      `The browser only opens web pages (http or https), not '${url.protocol}' addresses. Use the file tools for files on disk.`,
    );
  const blocked = blockedHost(url.hostname, privateNetworks);
  if (blocked) throw new BrowserToolError("url_refused", REFUSALS[blocked]);
  return url;
}

export function landedSafely(
  current: string,
  privateNetworks: PrivateNetworks = processPrivateNetworks(),
): boolean {
  if (current === "about:blank") return true;
  if (!URL.canParse(current)) return false;
  const url = new URL(current);
  return (
    WEB_SCHEMES.has(url.protocol) &&
    !isBlockedHost(url.hostname, privateNetworks)
  );
}
