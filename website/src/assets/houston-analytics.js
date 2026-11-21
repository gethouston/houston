(() => {
  const config = window.HOUSTON_ANALYTICS || {};
  const endpoint = config.gatewayUrl
    ? `${String(config.gatewayUrl).replace(/\/+$/, "")}/v1/web/events`
    : "";

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
  const identity = window.HoustonAnalyticsIdentity;

  const doNotTrack = () =>
    typeof window.__houstonDNT === "boolean"
      ? window.__houstonDNT
      : [nav.doNotTrack, window.doNotTrack, nav.msDoNotTrack].some(
          (signal) => String(signal) === "1",
        );

  const isInstallId = (value) => identity?.isUuidV4(value) === true;

  function trimTo(value, max) {
    if (typeof value !== "string") return null;
    const out = value.trim();
    if (!out) return null;
    return out.length > max ? out.slice(0, max) : out;
  }

  function referrerHost() {
    try {
      return trimTo(new window.URL(doc.referrer).hostname, MAX_HOST);
    } catch (_error) {
      return null;
    }
  }

  function pageLocale() {
    const lang = doc.documentElement?.getAttribute("lang");
    const code = lang ? String(lang).slice(0, 2).toLowerCase() : "";
    return LOCALES.includes(code) ? code : null;
  }

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

  if (config.landing) track("landing_viewed");
})();
