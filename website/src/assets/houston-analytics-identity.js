// The ids the first-party funnel sends, and the one-way hash of the address the
// download form collects (assets/houston-analytics.js is what sends them).
//
// Identity is a uuid v4 in localStorage, never a cookie: one id per browser,
// nothing personal in it. The shape is canonical v4 because that is the only
// shape the gateway stores — it refuses anything else, and refuses the whole
// event along with it. Nothing here may throw into the page.
//
// Modern syntax (const, arrow functions, optional chaining) is deliberate: the
// site has no ES5 floor, and the older `var`/`function` assets beside this one
// are history, not a rule.
(() => {
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const VISITOR_KEY = "houston_visitor_id";

  const webCrypto = window.crypto || {};
  let cachedVisitor = null;

  const hex = (bytes) =>
    Array.from(bytes, (b) => (b + 0x100).toString(16).slice(1)).join("");

  /** The shape the gateway accepts for every id on the wire. */
  const isUuidV4 = (value) =>
    typeof value === "string" && UUID_V4.test(value.trim());

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

  window.HoustonAnalyticsIdentity = { uuid, visitorId, isUuidV4, sha256Hex };
})();
