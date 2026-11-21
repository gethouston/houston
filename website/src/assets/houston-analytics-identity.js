(() => {
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const VISITOR_KEY = "houston_visitor_id";

  const webCrypto = window.crypto || {};
  let cachedVisitor = null;

  const hex = (bytes) =>
    Array.from(bytes, (b) => (b + 0x100).toString(16).slice(1)).join("");

  const isUuidV4 = (value) =>
    typeof value === "string" && UUID_V4.test(value.trim());

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
    cachedVisitor = minted;
    return cachedVisitor;
  }

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
