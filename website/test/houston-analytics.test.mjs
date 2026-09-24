// First-party funnel capture (src/assets/houston-analytics.js). The asset is a
// pair of browser IIFEs that hang their API off `window`, so they are read and
// evaluated against a stub window rather than imported. Everything it touches
// (navigator, document, localStorage, crypto, Blob, fetch) is reached through
// that stub, which is what makes these paths testable in node.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) =>
  readFileSync(join(here, "..", "src", "assets", name), "utf8");
// The page loads the pair in this order (base.njk): the ids and the hashing
// first, then the sink that sends them.
const source = asset("houston-analytics.js");
const identitySource = asset("houston-analytics-identity.js");

/** Evaluates both assets against one stub window, the way the page does. */
function evaluate(window) {
  new Function("window", identitySource)(window);
  new Function("window", source)(window);
}

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
    __houstonDNT: options.dntGlobal,
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
  evaluate(window);
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

test("honours a Do Not Track signal the browser reports as a number", async () => {
  // navigator.doNotTrack is `1` (a number) in some browsers; the site's own
  // snippets compare loosely, so this asset must opt out on it too.
  const site = load({ doNotTrack: 1, landing: true });
  await site.api.track("download_started", { os: "mac" });
  assert.equal(site.requests.length, 0);
});

test("follows the site's one Do Not Track answer when the page set it", async () => {
  const optedOut = load({ dntGlobal: true, landing: true });
  await optedOut.api.track("download_started", { os: "mac" });
  assert.equal(optedOut.requests.length, 0);

  // An explicit "not opted out" is honoured too, even against a stale signal.
  const optedIn = load({ dntGlobal: false, doNotTrack: "1" });
  await optedIn.api.track("download_started", { os: "mac" });
  assert.equal(optedIn.requests.length, 1);
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

test("welcome_bridged keeps a canonical v4 install id and drops anything else", async () => {
  const site = load();
  await site.api.track("welcome_bridged", {
    install_id: "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
  });
  await site.api.track("welcome_bridged", { install_id: "not-a-uuid" });
  // A non-v4 uuid would cost the WHOLE event: the gateway requires canonical
  // v4 and rejects the event rather than dropping the field.
  await site.api.track("welcome_bridged", {
    install_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  });
  const [good, bad, v1] = site.events();
  assert.equal(good.install_id, "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.equal(bad.install_id, undefined);
  assert.equal(v1.install_id, undefined);
});

test("carries each field only on the events allowed to have it", async () => {
  const site = load();
  // The gateway gates these by name and REJECTS the whole event on a field
  // that does not belong, so the browser must not send one.
  await site.api.track("landing_viewed", {
    os: "mac",
    install_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  });
  await site.api.track("download_started", {
    os: "mac",
    install_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  });
  const [landing, download] = site.events();
  assert.equal(landing.os, undefined);
  assert.equal(landing.install_id, undefined);
  assert.equal(download.os, "mac", "download_started is where os belongs");
  assert.equal(download.install_id, undefined);
});

test("publishes the install-id shape the gateway accepts", () => {
  const site = load();
  assert.equal(
    site.api.isInstallId("3F2504E0-4F89-41D3-9A0C-0305E82C3301"),
    true,
  );
  assert.equal(
    site.api.isInstallId("3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
    false,
  );
  assert.equal(site.api.isInstallId("not-a-uuid"), false);
  assert.equal(site.api.isInstallId(null), false);
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
  evaluate(window);
  await window.HoustonAnalytics.track("landing_viewed");
  assert.equal(requests.length, 0);
});

test("the page answers Do Not Track once, above every sink", () => {
  const base = readFileSync(
    join(here, "..", "src", "_includes", "base.njk"),
    "utf8",
  );
  const answer = base.indexOf("window.__houstonDNT =");
  const consent = base.indexOf("analytics_storage: window.__houstonDNT");
  assert.ok(answer > 0, "base.njk no longer answers Do Not Track");
  assert.ok(consent > answer, "the GA consent default reads that one answer");
  assert.equal(
    base.split("window.doNotTrack ==").length - 1,
    1,
    "one expression, so the sinks cannot disagree",
  );

  // The ids must exist before the sink that sends them runs.
  const identity = base.indexOf("/assets/houston-analytics-identity.js");
  const sink = base.indexOf('src="/assets/houston-analytics.js"');
  assert.ok(identity > 0 && sink > identity, "the pair loads in order");
});

const VISITOR = "2b0f7a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c";

test("hands the web app this browser's visitor id in the link", () => {
  const site = load({ stored: { houston_visitor_id: VISITOR } });
  // The app is on another origin, so its localStorage is not this one's: the
  // id can only travel in the link (app/src/lib/web-visitor-landing.ts reads
  // it back out).
  assert.equal(
    site.api.appLink("https://app.gethouston.ai/"),
    `https://app.gethouston.ai/?hv=${VISITOR}`,
  );
});

test("keeps the rest of the app link intact", () => {
  const site = load({ stored: { houston_visitor_id: VISITOR } });
  const link = site.api.appLink("https://app.gethouston.ai/home?plan=pro#top");
  assert.equal(
    link,
    `https://app.gethouston.ai/home?plan=pro&hv=${VISITOR}#top`,
  );
});

test("links to the app unchanged when there is no id to carry", () => {
  // Do Not Track: the link still works, only the attribution is dropped.
  const optedOut = load({
    doNotTrack: "1",
    stored: { houston_visitor_id: VISITOR },
  });
  assert.equal(
    optedOut.api.appLink("https://app.gethouston.ai/"),
    "https://app.gethouston.ai/",
  );
  assert.equal(optedOut.storage.map.get("houston_visitor_id"), VISITOR);

  // A browser with no usable randomness mints no id in the first place.
  const anonymous = load({ crypto: {} });
  assert.equal(
    anonymous.api.appLink("https://app.gethouston.ai/"),
    "https://app.gethouston.ai/",
  );
});

test("gives back the link it was handed rather than throwing into the page", () => {
  const site = load({ stored: { houston_visitor_id: VISITOR } });
  assert.equal(site.api.appLink("not a url"), "not a url");
});
