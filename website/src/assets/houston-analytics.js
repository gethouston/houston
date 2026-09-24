// First-party funnel capture for gethouston.ai: posts a closed set of four
// conversion events to the Houston gateway (POST /v1/web/events), so the funnel
// has a source of truth that ad blockers and cookie policy cannot erase.
// PostHog and GA4 are untouched. No raw email leaves the browser (the download
// gate's address is hashed before it is sent), Do Not Track silences this as it
// does the base.njk snippets, and nothing may throw into the page: every API is
// optional, every failure silent. The ids and the hashing live in the sibling
// asset `houston-analytics-identity.js`, which must load first.
//
// It also publishes `HoustonAnalytics.appLink(baseUrl)`, the link to the web
// app carrying this browser's visitor id (`?hv=`), so the app's own analytics
// batches join the funnel back to the visit that sent them.
//
// Modern syntax (const, arrow functions, optional chaining) is deliberate: the
// site has no ES5 floor, and the older `var`/`function` assets beside this one
// are history, not a rule.
(() => {
  const config = window.HOUSTON_ANALYTICS || {};
  const endpoint = config.gatewayUrl
    ? `${String(config.gatewayUrl).replace(/\/+$/, "")}/v1/web/events`
    : "";

  // Which optional fields each event may carry: the gateway's own
  // `nameGatedFields`, mirrored. It REJECTS the whole event when a field
  // arrives on a name that may not have it (an email hash on a page view is a
  // bug worth hearing about, not one to absorb), so a field that does not
  // belong is dropped here before it can cost the event.
  const FIELDS_BY_NAME = {
    landing_viewed: [],
    download_form_completed: ["email_hash", "os"],
    download_started: ["os"],
    welcome_bridged: ["install_id"],
  };
  const LOCALES = ["en", "es", "pt"];
  const PLATFORMS = ["mac", "windows", "linux", "other"];
  const MAX_PATH = 256;
  const MAX_HOST = 128;
  const MAX_UTM = 128;

  const nav = window.navigator || {};
  const doc = window.document || {};
  // The ids and the email hash (`houston-analytics-identity.js`). Absent means
  // that asset was blocked or failed to load, and this one sends nothing: an
  // event with no visitor id has nothing to join the funnel on.
  const identity = window.HoustonAnalyticsIdentity;

  // Same posture as respect_dnt (PostHog) and consent mode (GA) in base.njk: a
  // visitor opted out of one sink is opted out of all three. base.njk answers
  // the question once for the whole page (`window.__houstonDNT`, hoisted above
  // every sink); the expression below is the fallback for a page that loads
  // this asset without that snippet, and matches it signal for signal —
  // `String(...)` because a browser may report the flag as the NUMBER 1.
  const doNotTrack = () =>
    typeof window.__houstonDNT === "boolean"
      ? window.__houstonDNT
      : [nav.doNotTrack, window.doNotTrack, nav.msDoNotTrack].some(
          (signal) => String(signal) === "1",
        );

  /** The install-id shape the gateway accepts, published on the API below so
   *  the /welcome bridge judges the app's id by this one rule. */
  const isInstallId = (value) => identity?.isUuidV4(value) === true;

  function trimTo(value, max) {
    if (typeof value !== "string") return null;
    const out = value.trim();
    if (!out) return null;
    return out.length > max ? out.slice(0, max) : out;
  }

  // Hostname only, never the full referring URL.
  function referrerHost() {
    try {
      return trimTo(new window.URL(doc.referrer).hostname, MAX_HOST);
    } catch (_error) {
      return null;
    }
  }

  function pageLocale() {
    const lang = doc.documentElement?.getAttribute("lang");
    // <html lang> carries region tags ("pt-BR"); the column holds the language.
    const code = lang ? String(lang).slice(0, 2).toLowerCase() : "";
    return LOCALES.includes(code) ? code : null;
  }

  // text/plain, not application/json: that keeps this a CORS simple request, so
  // there is no OPTIONS preflight (which sendBeacon cannot recover from). The
  // body is JSON and the route parses it as JSON whatever the header says.
  function send(event) {
    const body = JSON.stringify({ events: [event] });
    try {
      const blob = new window.Blob([body], { type: "text/plain" });
      if (nav.sendBeacon(endpoint, blob)) return;
    } catch (_error) {}
    const init = {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
      body,
    };
    try {
      window.fetch(endpoint, init).catch(() => {});
    } catch (_error) {}
  }

  // Acquisition context belongs to the entry event; the rest of the funnel
  // joins back to it through visitor_id.
  function addEntryContext(event, search) {
    const host = referrerHost();
    if (host) event.referrer_host = host;
    let params = null;
    try {
      params = new window.URLSearchParams(search || "");
    } catch (_error) {
      return;
    }
    for (const key of ["source", "medium", "campaign"]) {
      const value = trimTo(params.get(`utm_${key}`), MAX_UTM);
      if (value) event[`utm_${key}`] = value;
    }
  }

  // Fire and forget. The returned promise always resolves; nothing in the UI
  // awaits it, but the hashed-email path is observable to tests.
  function track(name, fields) {
    try {
      const allowed = FIELDS_BY_NAME[name];
      if (!endpoint || doNotTrack() || !allowed) return Promise.resolve();
      const visitor = identity?.visitorId();
      const id = identity?.uuid();
      if (!visitor || !id) return Promise.resolve();
      const input = fields || {};
      const loc = window.location || {};
      const path = trimTo(loc.pathname, MAX_PATH) || "/";
      const event = {
        id,
        visitor_id: visitor,
        name,
        ts: new Date().toISOString(),
        path: path.startsWith("/") ? path : `/${path}`,
      };
      const lang = pageLocale();
      if (lang) event.locale = lang;
      if (name === "landing_viewed") addEntryContext(event, loc.search);
      if (allowed.includes("os") && PLATFORMS.includes(input.os)) {
        event.os = input.os;
      }
      if (allowed.includes("install_id") && isInstallId(input.install_id)) {
        event.install_id = String(input.install_id).trim().toLowerCase();
      }
      if (
        allowed.includes("email_hash") &&
        typeof input.email === "string" &&
        input.email.trim()
      ) {
        // The raw address is consumed here and never reaches the wire.
        return identity
          .sha256Hex(input.email.trim().toLowerCase())
          .then((hash) => {
            if (hash) event.email_hash = hash;
            send(event);
          });
      }
      send(event);
    } catch (_error) {}
    return Promise.resolve();
  }

  /**
   * The web app's link with this browser's visitor id on it (`?hv=`). The app
   * runs on another origin, so that id can reach it no other way, and it is
   * what joins the app's own analytics back to this visit.
   *
   * Returns `baseUrl` untouched whenever there is no id to carry — Do Not
   * Track, a browser with no usable randomness, a blocked identity asset. The
   * link always works; only the attribution is optional.
   */
  const appLink = (baseUrl) => {
    try {
      if (doNotTrack()) return baseUrl;
      const visitor = identity?.visitorId();
      if (!visitor) return baseUrl;
      const url = new window.URL(baseUrl, window.location?.href);
      url.searchParams.set("hv", visitor);
      return url.toString();
    } catch (_error) {
      return baseUrl;
    }
  };

  window.HoustonAnalytics = {
    track,
    visitorId: () => identity?.visitorId() ?? null,
    isInstallId,
    appLink,
  };

  // Landing pages are the funnel's entry. Driven by the layout flag rather than
  // a path match, so adding a locale directory needs no change here.
  if (config.landing) track("landing_viewed");
})();
