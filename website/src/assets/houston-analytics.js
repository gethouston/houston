// First-party funnel capture for gethouston.ai: posts a closed set of four
// conversion events to the Houston gateway (POST /v1/web/events), so the funnel
// has a source of truth that ad blockers and cookie policy cannot erase.
// PostHog and GA4 are untouched. No raw email leaves the browser (the download
// gate's address is hashed here), identity is a uuid v4 in localStorage rather
// than a cookie, Do Not Track silences it as it does the base.njk snippets, and
// nothing may throw into the page: every API is optional, every failure silent.
(() => {
  const config = window.HOUSTON_ANALYTICS || {};
  const endpoint = config.gatewayUrl
    ? `${String(config.gatewayUrl).replace(/\/+$/, "")}/v1/web/events`
    : "";

  const NAMES = [
    "landing_viewed",
    "download_form_completed",
    "download_started",
    "welcome_bridged",
  ];
  const LOCALES = ["en", "es", "pt"];
  const PLATFORMS = ["mac", "windows", "linux", "other"];
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // The app's install id is not required to be v4, so it gets the loose shape.
  const UUID_ANY = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const VISITOR_KEY = "houston_visitor_id";
  const MAX_PATH = 256;
  const MAX_HOST = 128;
  const MAX_UTM = 128;

  const nav = window.navigator || {};
  const doc = window.document || {};
  const webCrypto = window.crypto || {};
  let cachedVisitor = null;

  // Same posture as respect_dnt (PostHog) and consent mode (GA) in base.njk: a
  // visitor opted out of one sink is opted out of all three.
  const DNT = [nav.doNotTrack, window.doNotTrack, nav.msDoNotTrack];
  const doNotTrack = () => DNT.includes("1");

  const hex = (bytes) =>
    Array.from(bytes, (b) => (b + 0x100).toString(16).slice(1)).join("");

  // Null when the browser offers no usable randomness — the event is then
  // dropped rather than sent with a fabricated id.
  function uuid() {
    try {
      if (typeof webCrypto.randomUUID === "function") {
        const direct = webCrypto.randomUUID();
        if (UUID_V4.test(direct)) return direct;
      }
      const bytes = webCrypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return hex(bytes).replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
    } catch (_error) {
      return null;
    }
  }

  function visitorId() {
    if (cachedVisitor) return cachedVisitor;
    let store = null;
    let stored = null;
    try {
      store = window.localStorage;
      stored = store.getItem(VISITOR_KEY);
    } catch (_error) {}
    if (stored && UUID_V4.test(stored)) {
      cachedVisitor = stored;
      return cachedVisitor;
    }
    const minted = uuid();
    if (!minted) return null;
    try {
      store?.setItem(VISITOR_KEY, minted);
    } catch (_error) {}
    // Cached even when the write failed, so a private-mode visit still reports
    // one id per page load rather than one per event.
    cachedVisitor = minted;
    return cachedVisitor;
  }

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

  // Resolves to null (never rejects) when SubtleCrypto is missing — an insecure
  // origin, an old browser — so the event still lands, just without the hash.
  function sha256Hex(value) {
    try {
      const encoded = new window.TextEncoder().encode(value);
      return Promise.resolve(webCrypto.subtle.digest("SHA-256", encoded))
        .then((buffer) => hex(new Uint8Array(buffer)))
        .catch(() => null);
    } catch (_error) {
      return Promise.resolve(null);
    }
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
      if (!endpoint || doNotTrack() || !NAMES.includes(name)) {
        return Promise.resolve();
      }
      const visitor = visitorId();
      const id = uuid();
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
      if (PLATFORMS.includes(input.os)) event.os = input.os;
      const install = String(input.install_id || "").toLowerCase();
      if (UUID_ANY.test(install)) event.install_id = install;
      if (typeof input.email === "string" && input.email.trim()) {
        // The raw address is consumed here and never reaches the wire.
        return sha256Hex(input.email.trim().toLowerCase()).then((hash) => {
          if (hash) event.email_hash = hash;
          send(event);
        });
      }
      send(event);
    } catch (_error) {}
    return Promise.resolve();
  }

  window.HoustonAnalytics = { track, visitorId };

  // Landing pages are the funnel's entry. Driven by the layout flag rather than
  // a path match, so adding a locale directory needs no change here.
  if (config.landing) track("landing_viewed");
})();
