/**
 * The web app's half of the acquisition join: `?hv=<visitor id>`.
 *
 * The marketing site mints a first-party visitor id per browser and keeps it in
 * its own localStorage (`website/src/assets/houston-analytics-identity.js`).
 * The app lives on another origin, so that storage is invisible here and the id
 * can only travel in the link the site builds (`HoustonAnalytics.appLink`).
 * Carrying it on every batch's context is what lets the funnel read one visit
 * from the landing page through to the signed-in session.
 *
 * It is a plain anonymous id, never a credential — but it is still taken out of
 * the address bar as it is read, for the reason every one-time parameter is
 * (`settings-landing.ts`): a link that keeps it is a link that gets copied,
 * pasted and shared, and a shared id joins two people's visits into one.
 *
 * Kept for the tab, not the browser: `sessionStorage` survives a reload — which
 * would otherwise lose the id the moment the app navigated — and a new tab
 * starts empty, so only the visit that actually arrived from the site counts.
 */

/** The shape the gateway stores, mirrored from the website's identity asset. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The query parameter the website's `appLink` appends. */
export const WEB_VISITOR_PARAM = "hv";

/** Where the captured id lives for the rest of this tab's life. */
export const WEB_VISITOR_KEY = "houston.web_visitor_id";

export interface WebVisitorPorts {
  /** The URL this tab booted on (`window.location.href`). */
  href: string;
  /** Puts the URL minus the parameter in place of the current one. */
  clean(url: string): void;
  /** This tab's remembered id, null when there is none or storage is closed. */
  readStored(): string | null;
  /** Remembers the id for the rest of this tab's life. */
  writeStored(id: string): void;
}

/** The id the link carries, or null when it carries none the gateway accepts. */
export function webVisitorParam(search: string): string | null {
  const values = new URLSearchParams(search).getAll(WEB_VISITOR_PARAM);
  // A duplicated parameter is a rewritten link: neither value is trustworthy.
  if (values.length !== 1) return null;
  const value = values[0].trim().toLowerCase();
  return UUID_V4.test(value) ? value : null;
}

/** The URL a consumed link leaves behind: the same page, minus the id. */
export function withoutWebVisitorParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(WEB_VISITOR_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Read the link and take the id out of the address bar in the same pass. The
 * parameter is stripped whenever it is present, usable or not, so a mangled id
 * is not left behind to be copied out of the address bar either.
 *
 * A link with no usable id falls back to what this tab already captured, which
 * is what makes a reload — and every in-app navigation after it — keep the id
 * the visit arrived with.
 */
export function captureWebVisitorId(ports: WebVisitorPorts): string | null {
  const url = new URL(ports.href);
  const present = url.searchParams.has(WEB_VISITOR_PARAM);
  const fresh = present ? webVisitorParam(url.search) : null;
  if (present) ports.clean(withoutWebVisitorParam(ports.href));
  if (!fresh) {
    const stored = ports.readStored();
    return stored !== null && UUID_V4.test(stored) ? stored : null;
  }
  ports.writeStored(fresh);
  return fresh;
}

/**
 * The browser's ports. Storage is best-effort: a private window or blocked
 * site data costs the id on the next reload and nothing else, so those paths
 * stay quiet rather than reporting a browser setting as a fault.
 */
function browserPorts(): WebVisitorPorts {
  return {
    href: window.location.href,
    // The nav stack owns navigation; this rewrites only the query of the entry
    // already on screen, passing its state through, so the stack's index
    // survives and no entry is pushed or dropped.
    clean: (url) => window.history.replaceState(window.history.state, "", url),
    readStored: () => {
      try {
        return window.sessionStorage.getItem(WEB_VISITOR_KEY);
      } catch {
        return null; /* closed storage — the id lasts until the next reload */
      }
    },
    writeStored: (id) => {
      try {
        window.sessionStorage.setItem(WEB_VISITOR_KEY, id);
      } catch {
        /* closed or full storage — only the reload's memory is lost */
      }
    },
  };
}

let captured: string | null = null;
let capturedOnce = false;

/**
 * This tab's visitor id, or null on a visit that did not come from the site.
 * Synchronous and cached, so the first batch of a launch carries it like the
 * rest — unlike the install id, which is a hop away through the engine.
 *
 * The first call is the one that captures and strips; every call after it
 * answers from memory. Desktop never calls this: there is no link to land on.
 */
export function readWebVisitorId(): string | null {
  if (capturedOnce) return captured;
  capturedOnce = true;
  captured = captureWebVisitorId(browserPorts());
  return captured;
}
