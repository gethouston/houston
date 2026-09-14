// First-party funnel capture (src/assets/houston-analytics.js). The asset is a
// browser IIFE that hangs its API off `window`, so it is read and evaluated
// against a stub window rather than imported. Everything it touches
// (navigator, document, localStorage, crypto, Blob, fetch) is reached through
// that stub, which is what makes these paths testable in node.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "..", "src", "assets", "houston-analytics.js"),
  "utf8",
);

const GATEWAY = "https://gateway.example.test";
const ENDPOINT = `${GATEWAY}/v1/web/events`;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class FakeBlob {
  constructor(parts, options) {
    this.text = parts.join("");
    this.type = options?.type;
  }
}

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

/** Evaluates the asset against a stub window and returns the seam. */
function load(options = {}) {
  const requests = [];
  const storage = options.storage ?? memoryStorage(options.stored);
  const navigator = {
    doNotTrack: options.doNotTrack ?? null,
  };
  if (!options.noBeacon) {
    navigator.sendBeacon = (url, blob) => {
      requests.push({ transport: "beacon", url, blob });
      return options.beaconFails !== true;
    };
  }
  const window = {
    HOUSTON_ANALYTICS: {
      gatewayUrl: GATEWAY,
      landing: options.landing === true,
    },
    navigator,
    document: {
      referrer: options.referrer ?? "",
      documentElement: {
        getAttribute: (name) =>
          name === "lang" ? (options.lang ?? "en") : null,
      },
    },
    location: {
      pathname: options.pathname ?? "/",
      search: options.search ?? "",
    },
    localStorage: storage,
    crypto: options.crypto ?? globalThis.crypto,
    Blob: FakeBlob,
    TextEncoder,
    URL,
    URLSearchParams,
    fetch: (url, init) => {
      requests.push({ transport: "fetch", url, init });
      return Promise.resolve({ ok: true });
    },
  };
  new Function("window", source)(window);
  const events = () =>
    requests.flatMap((request) => {
      const body =
        request.transport === "beacon" ? request.blob.text : request.init.body;
      return JSON.parse(body).events;
    });
  return { window, api: window.HoustonAnalytics, requests, storage, events };
}

test("sends nothing when the visitor has Do Not Track enabled", async () => {
  const site = load({ doNotTrack: "1", landing: true });
  await site.api.track("download_started", { os: "mac" });
  assert.equal(site.requests.length, 0);
  assert.equal(site.storage.map.size, 0);
});

test("ignores event names outside the closed list", async () => {
  const site = load();
  await site.api.track("something_else", {});
  assert.equal(site.requests.length, 0);
});

test("mints the visitor id once and reuses it across events and loads", async () => {
  const first = load();
  await first.api.track("download_started", { os: "mac" });
  await first.api.track("download_started", { os: "linux" });
  const [a, b] = first.events();
  assert.match(a.visitor_id, UUID_V4);
  assert.equal(a.visitor_id, b.visitor_id);
  assert.notEqual(a.id, b.id, "each event carries its own id");
  assert.equal(first.storage.map.get("houston_visitor_id"), a.visitor_id);

  // A later page load reads the stored id rather than minting a second one.
  const second = load({ storage: first.storage });
  await second.api.track("landing_viewed");
  assert.equal(second.events()[0].visitor_id, a.visitor_id);
});

test("landing_viewed reports path, locale, utm terms and the referrer host", () => {
  const site = load({
    landing: true,
    lang: "pt-BR",
    pathname: "/pt/",
    search: "?utm_source=newsletter&utm_medium=email&utm_campaign=launch&x=1",
    referrer: "https://news.example.com/deep/link?secret=token",
  });
  const [event] = site.events();
  assert.equal(event.name, "landing_viewed");
  assert.equal(event.path, "/pt/");
  assert.equal(event.locale, "pt");
  assert.equal(event.referrer_host, "news.example.com");
  assert.equal(event.utm_source, "newsletter");
  assert.equal(event.utm_medium, "email");
  assert.equal(event.utm_campaign, "launch");
  // Neither the full referring URL nor the rest of the query string travels.
  const wire = JSON.stringify(event);
  assert.ok(!wire.includes("secret"));
  assert.ok(!wire.includes("/deep/link"));
});

test("landing_viewed does not fire on a page that is not a landing page", () => {
  const site = load({ landing: false });
  assert.equal(site.requests.length, 0);
});

test("download_form_completed carries a hashed email and never the address", async () => {
  const site = load({ pathname: "/es/" });
  await site.api.track("download_form_completed", {
    email: "  Ada@Example.COM ",
    os: "mac",
  });
  const [event] = site.events();
  const expected = createHash("sha256").update("ada@example.com").digest("hex");
  assert.equal(event.email_hash, expected);
  assert.match(event.email_hash, /^[0-9a-f]{64}$/);
  assert.equal(event.os, "mac");
  assert.equal(event.email, undefined);
  assert.ok(!JSON.stringify(event).toLowerCase().includes("ada@example.com"));
});

test("welcome_bridged keeps a uuid install id and drops anything else", async () => {
  const site = load();
  await site.api.track("welcome_bridged", {
    install_id: "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
  });
  await site.api.track("welcome_bridged", { install_id: "not-a-uuid" });
  const [good, bad] = site.events();
  assert.equal(good.install_id, "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.equal(bad.install_id, undefined);
});

test("prefers sendBeacon and falls back to fetch with keepalive", async () => {
  // Both transports must stay a CORS simple request: a JSON content type would
  // force an OPTIONS preflight, which sendBeacon cannot recover from.
  const beaconed = load();
  await beaconed.api.track("download_started", { os: "windows" });
  assert.equal(beaconed.requests[0].transport, "beacon");
  assert.equal(beaconed.requests[0].url, ENDPOINT);
  assert.equal(beaconed.requests[0].blob.type, "text/plain");
  assert.deepEqual(JSON.parse(beaconed.requests[0].blob.text).events.length, 1);

  const refused = load({ beaconFails: true });
  await refused.api.track("download_started", { os: "windows" });
  const [, fallback] = refused.requests;
  assert.equal(fallback.transport, "fetch");
  assert.equal(fallback.url, ENDPOINT);
  assert.equal(fallback.init.method, "POST");
  assert.equal(fallback.init.keepalive, true);
  assert.equal(fallback.init.headers["Content-Type"], "text/plain");

  const missing = load({ noBeacon: true });
  await missing.api.track("download_started", { os: "windows" });
  assert.equal(missing.requests[0].transport, "fetch");
});

test("a localStorage that throws never propagates into the page", async () => {
  const hostile = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    map: new Map(),
  };
  const site = load({ storage: hostile, landing: true });
  await site.api.track("download_started", { os: "linux" });
  const events = site.events();
  assert.equal(events.length, 2);
  assert.match(events[0].visitor_id, UUID_V4);
  // One id for the page load even though nothing could be persisted.
  assert.equal(events[0].visitor_id, events[1].visitor_id);
});

test("sends the event unhashed when SubtleCrypto is unavailable", async () => {
  const site = load({
    crypto: { randomUUID: () => globalThis.crypto.randomUUID() },
  });
  await site.api.track("download_form_completed", {
    email: "ada@example.com",
    os: "windows",
  });
  const [event] = site.events();
  assert.equal(event.email_hash, undefined);
  assert.equal(event.name, "download_form_completed");
  assert.equal(event.os, "windows");
});

test("never throws and sends nothing when the gateway origin is missing", async () => {
  const requests = [];
  const window = {
    HOUSTON_ANALYTICS: {},
    navigator: {
      sendBeacon: (url) => {
        requests.push(url);
        return true;
      },
    },
    document: { referrer: "", documentElement: { getAttribute: () => "en" } },
    location: { pathname: "/", search: "" },
    localStorage: memoryStorage(),
    crypto: globalThis.crypto,
    Blob: FakeBlob,
    TextEncoder,
    URL,
    URLSearchParams,
  };
  new Function("window", source)(window);
  await window.HoustonAnalytics.track("landing_viewed");
  assert.equal(requests.length, 0);
});
