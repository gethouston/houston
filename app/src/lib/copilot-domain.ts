/**
 * Resolve what the user typed into the Copilot connect dialog's "company GitHub
 * domain" field into the login target (2026-07 provider QA: "Copilot Business
 * fails where personal works").
 *
 * GitHub Copilot has three commercial shapes but only TWO login paths:
 *  - personal AND Copilot Business both sign in at github.com — a Business
 *    seat is paid by the org, but the org has NO GitHub domain of its own;
 *  - only GitHub Enterprise with data residency runs a custom domain
 *    (company.ghe.com), which reroutes the whole device-code flow.
 *
 * The failure this fixes: a Copilot Business user reads "Copilot your company
 * provides", picks Company, and types their company's WEBSITE domain — the
 * device flow then POSTs to `https://acme.com/login/device/code`, which is not
 * GitHub, and the connect dies with an opaque error. So:
 *  - anything that resolves to github.com collapses to the github.com path
 *    (same as Personal — entitlement follows the signed-in account);
 *  - a dotted host passes through as the enterprise domain;
 *  - anything unparseable, or a single label that can never be a real GitHub
 *    Enterprise host, is rejected AT THE DIALOG with actionable copy instead
 *    of failing later inside the device flow.
 *
 * The hostname extraction mirrors pi-ai's `normalizeDomain` (utils/oauth/
 * github-copilot.ts) so what we validate here is exactly what pi will use.
 */
export type CopilotLoginTarget =
  | { kind: "github_com" }
  | { kind: "enterprise"; domain: string }
  | { kind: "invalid" };

export function resolveCopilotDomain(input: string): CopilotLoginTarget {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };
  let hostname: string;
  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    hostname = url.hostname;
  } catch {
    return { kind: "invalid" };
  }
  if (hostname === "github.com" || hostname === "www.github.com")
    return { kind: "github_com" };
  // A real GitHub Enterprise host is always dotted (company.ghe.com /
  // github.acme.com); a bare label is a typo that would only fail later.
  if (!hostname.includes(".")) return { kind: "invalid" };
  return { kind: "enterprise", domain: hostname };
}
