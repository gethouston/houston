// The download gate's registration step and the lead delivery behind it
// (src/assets/download-gate-form.js + download-gate-lead.js). Both are browser
// IIFEs that hang their API off `window`, so they are read and evaluated
// against one stub page — the way the document loads the pair — rather than
// imported.
//
// What these pin is the gate's promise to the visitor and to us during the
// dual-write window: the lead goes to the Houston gateway AND to the legacy
// mirrors at once, the download unlocks as soon as any of them stored it, and
// it stays locked only when every sink failed or the gateway called the
// details themselves invalid.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) =>
  readFileSync(join(here, "..", "src", "assets", name), "utf8");
const leadSource = asset("download-gate-lead.js");
const formSource = asset("download-gate-form.js");

const GATEWAY = "https://gateway.example.test";
const LEADS = `${GATEWAY}/v1/web/leads`;
const SUPABASE = "https://db.example.test";
const WAITLIST = `${SUPABASE}/rest/v1/waitlist`;
const SHEET = "https://sheet.example.test/exec";
const VISITOR = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "Something went wrong. Please try again.";
const BUSY_ERROR = "Too many attempts. Please wait a moment and try again.";

// The rows download-gate-dropdown.js builds from the country data.
const ROWS = [
  {
    iso: "US",
    dial: "+1",
    display: "United States",
    english: "United States",
    flag: "🇺🇸",
    haystack: "united states",
  },
  {
    iso: "MX",
    dial: "+52",
    display: "México",
    english: "Mexico",
    flag: "🇲🇽",
    haystack: "mexico méxico",
  },
];

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
}

function classList(initial = []) {
  const set = new Set(initial);
  return {
    set,
    add: (name) => set.add(name),
    remove: (name) => set.delete(name),
    contains: (name) => set.has(name),
    toggle: (name, on) => (on ? set.add(name) : set.delete(name)),
  };
}

function element(id) {
  const listeners = new Map();
  const fire = (name, event = {}) => {
    for (const handler of listeners.get(name) ?? []) handler(event);
  };
  return {
    id,
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    dataset: {},
    classList: classList(),
    addEventListener: (name, handler) => {
      const bucket = listeners.get(name) ?? [];
      bucket.push(handler);
      listeners.set(name, bucket);
    },
    dispatchEvent: (event) => fire(event.type, event),
    fire,
  };
}

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    writes: 0,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      this.writes += 1;
      map.set(key, String(value));
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** 202 from the gateway, a written row from either mirror. */
const accepting = (call) =>
  Promise.resolve(
    call.url === LEADS ? { status: 202, ok: true } : { status: 201, ok: true },
  );

/** Answers each sink with the status named for it; `null` never answers. */
const answering =
  ({ gateway, mirror }) =>
  (call) => {
    const value = call.url === LEADS ? gateway : mirror;
    if (value !== null)
      return Promise.resolve({
        status: value,
        ok: value >= 200 && value < 300,
      });
    // A real fetch rejects when its abort signal fires, which is how a sink
    // that never answers is given up on.
    return new Promise((_resolve, reject) => {
      call.init.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      );
    });
  };

/**
 * Evaluates both assets against one stub page and initialises the form the way
 * download-gate.js does. `respond` decides what each fetch answers.
 */
function openGate({
  respond = accepting,
  storage = memoryStorage(),
  locale = "en",
  identity = true,
  dnt = undefined,
  source = "hero",
  config = {},
  translations = null,
  abortController = globalThis.AbortController,
  onSubmitted = null,
} = {}) {
  const elements = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  };
  const document = { getElementById: byId };

  const menus = [];
  const calls = [];
  const timers = [];
  const cleared = [];
  const warnings = [];
  const submitted = [];

  const window = {
    HOUSTON_LOCALE: locale,
    HOUSTON_COUNTRIES: [],
    __houstonDNT: dnt,
    HoustonDropdown: {
      countryRows: () => ROWS.map((row) => ({ ...row })),
      create: (opts) => {
        const menu = {
          opts,
          select: (id) =>
            opts.onSelect(opts.items.find((item) => item.id === id)),
        };
        menus.push(menu);
        return menu;
      },
    },
    HoustonAnalyticsIdentity: identity
      ? {
          isUuidV4: (value) =>
            typeof value === "string" && UUID_V4.test(value.trim()),
        }
      : undefined,
    houstonT: translations
      ? (path, fallback) => translations[path] ?? fallback
      : undefined,
    localStorage: storage,
    console: { warn: (...args) => warnings.push(args) },
    AbortController: abortController,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: (id) => cleared.push(id),
    fetch: (url, init) => {
      const call = {
        url,
        init,
        body: init.body ? JSON.parse(init.body) : null,
      };
      calls.push(call);
      return respond(call);
    },
  };

  new Function("window", leadSource)(window);
  new Function("window", "document", "Event", formSource)(
    window,
    document,
    FakeEvent,
  );

  byId("dl-form-err").textContent = GENERIC_ERROR;
  window.HoustonDLForm.init({
    config: {
      gatewayUrl: GATEWAY,
      supabaseUrl: SUPABASE,
      supabaseAnonKey: "anon-key",
      sheetEndpoint: SHEET,
      ...config,
    },
    source: () => source,
    onSubmitted: (payload) => {
      submitted.push(payload);
      if (onSubmitted) onSubmitted(payload);
    },
  });

  return {
    el: byId,
    menus,
    calls,
    timers,
    cleared,
    warnings,
    submitted,
    storage,
    error: () => byId("dl-form-err"),
    submitButton: () => byId("dl-submit"),
  };
}

/** Fills every field the way a visitor would, firing the events the page does. */
function fill(gate, values = {}) {
  const entered = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "555 123 4567",
    linkedin: "https://www.linkedin.com/in/ada",
    ...values,
  };
  for (const [field, value] of Object.entries(entered)) {
    const input = gate.el(`dl-${field}`);
    input.value = value;
    input.fire("input");
  }
  // The country menu is the only way the hidden country input is filled.
  if (values.country !== null) gate.menus[1].select(values.country ?? "MX");
}

async function submitGate(gate, values) {
  fill(gate, values);
  gate.el("dl-form").fire("submit", { preventDefault: () => {} });
  await settle();
}

test("posts the lead to the gateway in the shape the route accepts", async () => {
  const gate = openGate({
    locale: "es",
    storage: memoryStorage({ houston_visitor_id: VISITOR }),
    source: "footer-os",
  });
  await submitGate(gate);

  const [lead] = gate.calls;
  assert.equal(lead.url, LEADS);
  assert.equal(lead.init.method, "POST");
  assert.equal(lead.init.headers["Content-Type"], "application/json");
  // The page stays open until the answer arrives, so this is not a keepalive
  // send and must not inherit its body cap.
  assert.equal(lead.init.keepalive, false);
  assert.deepEqual(lead.body, {
    email: "ada@example.com",
    full_name: "Ada Lovelace",
    phone: "+1 555 123 4567",
    phone_country_code: "+1",
    linkedin: "https://www.linkedin.com/in/ada",
    country: "Mexico",
    source: "footer-os",
    locale: "es",
    visitor_id: VISITOR,
  });
});

test("writes every sink at once, without waiting on any answer", async () => {
  // Nothing answers: the three requests are still out, which is what makes the
  // mirrors able to catch a lead the gateway drops.
  const gate = openGate({ respond: () => new Promise(() => {}) });
  fill(gate);
  gate.el("dl-form").fire("submit", { preventDefault: () => {} });

  assert.deepEqual(
    gate.calls.map((call) => call.url),
    [LEADS, WAITLIST, SHEET],
  );
  assert.equal(gate.submitted.length, 0, "and nothing unlocks yet");
});

test("the mirrors carry the constant source column they have always written", async () => {
  const gate = openGate();
  await submitGate(gate);

  const [, supabase, sheet] = gate.calls;
  assert.equal(supabase.body.source, "download_gate");
  assert.equal(supabase.body.full_name, "Ada Lovelace");
  assert.equal(supabase.body.phone_country_code, "+1");
  assert.equal(supabase.init.headers.apikey, "anon-key");
  assert.equal(sheet.body.source, "download_gate");
  assert.equal(sheet.init.mode, "no-cors");
  assert.equal(gate.submitted.length, 1, "the download unlocked once");
  assert.equal(gate.submitted[0].email, "ada@example.com");
});

test("a gateway that never answers still unlocks once the mirror stored the lead", async () => {
  const gate = openGate({
    respond: answering({ gateway: null, mirror: 201 }),
  });
  await submitGate(gate);
  assert.equal(
    gate.submitted.length,
    0,
    "not before the gateway is given up on",
  );

  // The gateway's own abort is what ends the wait; the row is already written.
  for (const timer of gate.timers) timer.fn();
  await settle();
  assert.equal(gate.submitted.length, 1, "the download unlocked");
  assert.equal(gate.error().hidden, true);
});

test("a repeated address in the mirror unlocks the download the same as a new one", async () => {
  // Supabase answers 409 for an address it already holds, which is not a
  // failure: the visitor is registered.
  const gate = openGate({
    respond: answering({ gateway: 503, mirror: 409 }),
  });
  await submitGate(gate);
  assert.equal(gate.submitted.length, 1);
  assert.equal(gate.error().hidden, true);
});

test("a rate-limited gateway never costs a visitor the download the mirror paid for", async () => {
  // Everyone behind one shared address hits the gateway's limit together; the
  // Supabase row still holds the lead, so the download opens.
  const gate = openGate({
    respond: answering({ gateway: 429, mirror: 201 }),
  });
  await submitGate(gate);
  assert.equal(gate.submitted.length, 1);
  assert.equal(gate.error().hidden, true);
});

test("invalid details are shown to the visitor even when a mirror took the row", async () => {
  // 400 is the one refusal about the details themselves, which the visitor can
  // fix. A mirror that accepts anything must not hide it.
  const gate = openGate({
    respond: answering({ gateway: 400, mirror: 201 }),
  });
  await submitGate(gate);

  assert.equal(gate.submitted.length, 0, "the download stayed locked");
  assert.equal(gate.error().hidden, false);
  assert.equal(gate.error().textContent, GENERIC_ERROR);
  assert.equal(gate.submitButton().disabled, false);
  assert.equal(gate.submitButton().textContent, "Continue to download");
  assert.equal(gate.submitButton().classList.contains("btn-disabled"), false);
});

test("a lead no sink stored keeps the download locked", async () => {
  const gate = openGate({
    respond: answering({ gateway: 503, mirror: 500 }),
  });
  await submitGate(gate);

  assert.equal(gate.submitted.length, 0);
  assert.equal(gate.error().hidden, false);
  assert.equal(gate.error().textContent, GENERIC_ERROR);
  assert.equal(gate.submitButton().disabled, false);
});

test("the busy message is the answer only when nothing stored the lead and the gateway said 429", async () => {
  const gate = openGate({
    respond: answering({ gateway: 429, mirror: 500 }),
    translations: { "gate.formErrorBusy": "Demasiados intentos." },
  });
  await submitGate(gate);

  assert.equal(gate.submitted.length, 0);
  assert.equal(gate.error().textContent, "Demasiados intentos.");

  // Without the page's i18n block the English literal is the answer.
  const plain = openGate({ respond: answering({ gateway: 429, mirror: 500 }) });
  await submitGate(plain);
  assert.equal(plain.error().textContent, BUSY_ERROR);
});

test("both failure messages come from the page's own translations", async () => {
  // One mechanism for both: the generic message is a translation too, not the
  // text the markup happened to be rendered with.
  const gate = openGate({
    respond: answering({ gateway: 503, mirror: 500 }),
    translations: { "gate.formError": "Algo salió mal." },
  });
  await submitGate(gate);
  assert.equal(gate.error().textContent, "Algo salió mal.");
});

test("the generic message returns after a rate-limited attempt", async () => {
  let gateway = 429;
  const gate = openGate({
    respond: (call) =>
      Promise.resolve(
        call.url === LEADS
          ? { status: gateway, ok: false }
          : { status: 500, ok: false },
      ),
  });
  await submitGate(gate);
  assert.equal(gate.error().textContent, BUSY_ERROR);

  gateway = 503;
  gate.el("dl-form").fire("submit", { preventDefault: () => {} });
  await settle();
  assert.equal(gate.error().textContent, GENERIC_ERROR);
  assert.equal(gate.submitted.length, 0);
});

test("a network failure keeps the download locked", async () => {
  const gate = openGate({
    respond: () => Promise.reject(new Error("offline")),
  });
  await submitGate(gate);

  assert.equal(gate.submitted.length, 0);
  assert.equal(gate.error().hidden, false);
  assert.equal(gate.submitButton().disabled, false);
});

test("gives up on a sink that never answers, after ten seconds", async () => {
  const gate = openGate({
    respond: (call) =>
      new Promise((_resolve, reject) => {
        call.init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  });
  await submitGate(gate);

  // Both gating sinks are on the same clock; the sheet is opaque and gates
  // nothing, so it runs without one.
  assert.equal(gate.timers.length, 2);
  assert.deepEqual(
    gate.timers.map((timer) => timer.ms),
    [10000, 10000],
  );
  assert.equal(gate.submitted.length, 0, "nothing unlocks while they hang");

  for (const timer of gate.timers) timer.fn();
  await settle();
  assert.equal(gate.submitted.length, 0);
  assert.equal(gate.error().hidden, false);
  assert.equal(gate.submitButton().disabled, false);
});

test("gives up on a hung sink even where the browser cannot abort it", async () => {
  // A browser without AbortController cannot cancel the request, but the wait
  // still ends: the attempt is given up on as a failure so the visitor is not
  // left watching "Preparing your download…" forever.
  const gate = openGate({
    // A browser that has no AbortController at all.
    abortController: null,
    respond: () => new Promise(() => {}),
  });
  await submitGate(gate);

  assert.equal(gate.timers.length, 2, "both gating sinks are still on a clock");
  assert.equal(gate.calls[0].init.signal, undefined, "nothing to abort with");

  for (const timer of gate.timers) timer.fn();
  await settle();
  assert.equal(gate.submitted.length, 0);
  assert.equal(gate.error().hidden, false);
  assert.equal(gate.submitButton().disabled, false);
  assert.equal(gate.submitButton().textContent, "Continue to download");
});

test("a step that throws after the lead is stored never reads as a failure", async () => {
  // Everything after delivery — analytics, showing the download — runs on a
  // lead the gateway already accepted. A throw there is ours to log, not a
  // reason to tell the visitor their registration went wrong.
  const gate = openGate({
    onSubmitted: () => {
      throw new Error("analytics blew up");
    },
  });
  await submitGate(gate);

  assert.equal(gate.submitted.length, 1, "the lead was delivered");
  assert.equal(gate.error().hidden, true, "and no failure was shown");
  assert.equal(gate.error().textContent, GENERIC_ERROR, "message untouched");
  // The unlock stands: the button is not returned to its ready state behind
  // the download step the visitor is now looking at.
  assert.equal(gate.submitButton().disabled, true);
  assert.equal(gate.submitButton().textContent, "Preparing your download…");
  assert.equal(gate.submitButton().classList.contains("btn-disabled"), true);
  assert.equal(gate.warnings.length, 1, "the throw was reported to us");
});

test("clears each timeout once its sink has answered", async () => {
  const gate = openGate();
  await submitGate(gate);
  assert.equal(gate.cleared.length, 2);
});

test("a mirror that fails never costs the visitor the download", async () => {
  const gate = openGate({
    respond: (call) => {
      if (call.url === LEADS) return Promise.resolve({ status: 202, ok: true });
      if (call.url === SHEET) return Promise.reject(new Error("blocked"));
      return Promise.resolve({ status: 500, ok: false });
    },
  });
  await submitGate(gate);
  await settle();

  assert.equal(gate.submitted.length, 1, "the download still unlocked");
  assert.equal(gate.error().hidden, true);
  assert.equal(gate.warnings.length, 2, "both failures were only warnings");
});

test("a repeated address is accepted, same as a first-time one", async () => {
  // The gateway answers 202 for an address it already holds; the visitor must
  // not be told to try again.
  const gate = openGate();
  await submitGate(gate);
  assert.equal(gate.submitted.length, 1);
  assert.equal(gate.error().hidden, true);
});

test("reads the visitor id, never mints one, and drops what it cannot vouch for", async () => {
  const empty = openGate();
  await submitGate(empty);
  assert.equal(empty.calls[0].body.visitor_id, undefined);
  assert.equal(empty.storage.writes, 0, "the gate mints no id of its own");
  assert.equal(empty.submitted.length, 1, "and the lead still lands");

  const junk = openGate({
    storage: memoryStorage({ houston_visitor_id: "not-a-uuid" }),
  });
  await submitGate(junk);
  assert.equal(junk.calls[0].body.visitor_id, undefined);

  // A blocked analytics asset takes the id with it: the shape it vouches for is
  // the only one the gateway accepts, and a bad one would cost the whole lead.
  const blocked = openGate({
    identity: false,
    storage: memoryStorage({ houston_visitor_id: VISITOR }),
  });
  await submitGate(blocked);
  assert.equal(blocked.calls[0].body.visitor_id, undefined);
});

test("a visitor who opted out of tracking sends no id, and still gets the app", async () => {
  const optedOut = openGate({
    dnt: true,
    storage: memoryStorage({ houston_visitor_id: VISITOR }),
  });
  await submitGate(optedOut);
  assert.equal(optedOut.calls[0].body.visitor_id, undefined);
  assert.equal(optedOut.submitted.length, 1, "the lead still lands");

  const optedIn = openGate({
    dnt: false,
    storage: memoryStorage({ houston_visitor_id: VISITOR }),
  });
  await submitGate(optedIn);
  assert.equal(optedIn.calls[0].body.visitor_id, VISITOR);
});

test("reports the entry point in the shape the gateway accepts", async () => {
  // The buttons name their entry points for people, not for a regex.
  const cased = openGate({ source: "Hero" });
  await submitGate(cased);
  assert.equal(cased.calls[0].body.source, "hero");

  const refused = openGate({ source: "Hero Section!" });
  await submitGate(refused);
  assert.equal(refused.calls[0].body.source, "unknown");
});

test("sends no locale the route does not know", async () => {
  const gate = openGate({ locale: "de" });
  await submitGate(gate);
  assert.equal(gate.calls[0].body.locale, undefined);
});

test("an incomplete form never reaches the gateway", async () => {
  const gate = openGate();
  await submitGate(gate, { email: "ada@example" });
  assert.equal(gate.calls.length, 0);
  assert.equal(gate.submitted.length, 0);
});

test("nothing escapes into the page when the browser refuses the request", async () => {
  const gate = openGate({
    respond: () => {
      throw new Error("blocked by the browser");
    },
  });
  await submitGate(gate);

  assert.equal(gate.submitted.length, 0);
  assert.equal(gate.error().hidden, false);
  assert.equal(gate.submitButton().disabled, false);
});

test("a localStorage that throws never propagates into the page", async () => {
  const hostile = {
    map: new Map(),
    writes: 0,
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  const gate = openGate({ storage: hostile });
  await submitGate(gate);

  assert.equal(gate.calls[0].body.visitor_id, undefined);
  assert.equal(gate.submitted.length, 1);
});

test("holds the download when the lead transport asset never loaded", async () => {
  // download-gate-lead.js is where a lead is registered. Without it there is
  // nowhere to store the visitor, so the gate fails closed rather than handing
  // out a download it can never follow up on.
  const elements = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  };
  const submitted = [];
  const window = {
    HOUSTON_LOCALE: "en",
    HoustonDropdown: {
      countryRows: () => ROWS.map((row) => ({ ...row })),
      create: (opts) => ({
        opts,
        select: (id) => opts.onSelect(opts.items.find((i) => i.id === id)),
      }),
    },
    fetch: () => assert.fail("no request may be made without the transport"),
  };
  new Function("window", "document", "Event", formSource)(
    window,
    { getElementById: byId },
    FakeEvent,
  );
  byId("dl-form-err").textContent = GENERIC_ERROR;
  window.HoustonDLForm.init({
    config: { gatewayUrl: GATEWAY },
    source: () => "nav",
    onSubmitted: (payload) => submitted.push(payload),
  });
  byId("dl-name").value = "Ada Lovelace";
  byId("dl-email").value = "ada@example.com";
  byId("dl-phone").value = "555 123 4567";
  byId("dl-linkedin").value = "https://www.linkedin.com/in/ada";
  byId("dl-country").value = "Mexico";
  byId("dl-form").fire("submit", { preventDefault: () => {} });
  await settle();

  assert.equal(submitted.length, 0);
  assert.equal(byId("dl-form-err").hidden, false);
  assert.equal(byId("dl-submit").disabled, false);
});

test("the page loads the transport before the form that uses it", () => {
  const include = readFileSync(
    join(here, "..", "src", "_includes", "landing", "scripts-download.njk"),
    "utf8",
  );
  // One gateway origin for the whole site: the same `api.gatewayUrl` the
  // analytics beacon and the developer docs render.
  assert.match(include, /gatewayUrl: "\{\{ api\.gatewayUrl \}\}"/);
  const lead = include.indexOf("/assets/download-gate-lead.js");
  const form = include.indexOf("/assets/download-gate-form.js");
  assert.ok(lead > 0 && form > lead, "the pair loads in order");
});
