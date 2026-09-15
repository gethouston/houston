// The download modal: every trigger, the backdrop, the close button and Escape.
// The asset is a browser IIFE, so it is read and evaluated against stub window
// and document objects rather than imported.
//
// What these pin is the gate's independence from its neighbours: the buttons
// inside the download step ship as a SEPARATE asset (download-gate-buttons.js),
// and a browser that never ran it must still open the modal — an inert download
// button on every page is the one failure this gate cannot afford.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "..", "src", "assets", "download-gate.js"),
  "utf8",
);

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
  return {
    id,
    hidden: false,
    classList: classList(),
    getAttribute: () => null,
    addEventListener: (name, handler) => {
      const bucket = listeners.get(name) ?? [];
      bucket.push(handler);
      listeners.set(name, bucket);
    },
    focus: () => {},
    fire: (name, event = {}) => {
      for (const handler of listeners.get(name) ?? []) handler(event);
    },
  };
}

/** A trigger as the markup declares it: `data-dl-source` + `data-dl-os`. */
function trigger(source, os) {
  const el = element("trigger");
  el.getAttribute = (name) =>
    name === "data-dl-source" ? source : name === "data-dl-os" ? os : null;
  return el;
}

/**
 * Evaluates the gate against a stub page. `buttons` left out, or `form: false`,
 * stands for that neighbouring asset never having run (blocked, 404, a syntax
 * error in a browser the bundle does not target).
 */
function openPage({
  buttons,
  form = true,
  hash = "",
  registered = false,
  triggers = [trigger("nav", null)],
} = {}) {
  const tracked = [];
  const elements = new Map(
    [
      "dl-overlay",
      "dl-close",
      "dl-step-form",
      "dl-step-download",
      "dl-name",
    ].map((id) => [id, element(id)]),
  );
  const documentListeners = new Map();
  const document = {
    documentElement: {
      classList: classList(),
      clientWidth: 1280,
      style: { setProperty: () => {} },
    },
    getElementById: (id) => elements.get(id) ?? null,
    // No dropdown is ever open in these cases.
    querySelector: () => null,
    querySelectorAll: (selector) =>
      selector === "[data-dl-trigger]" ? triggers : [],
    addEventListener: (name, handler) => {
      const bucket = documentListeners.get(name) ?? [];
      bucket.push(handler);
      documentListeners.set(name, bucket);
    },
  };
  const store = new Map(registered ? [["houston_dl_registered", "1"]] : []);
  const window = {
    HoustonDLButtons: buttons,
    HoustonDLForm: form
      ? { init: (opts) => (window.formOpts = opts) }
      : undefined,
    HOUSTON_DL_CONFIG: {},
    innerWidth: 1280,
    scrollY: 0,
    scrollTo: () => {},
    location: { hash },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  };

  new Function("window", "document", "track", "detectOs", source)(
    window,
    document,
    (name, props) => tracked.push({ name, props }),
    () => "mac",
  );

  return {
    window,
    tracked,
    overlay: elements.get("dl-overlay"),
    formStep: elements.get("dl-step-form"),
    downloadStep: elements.get("dl-step-download"),
    close: elements.get("dl-close"),
    triggers,
    open: () => elements.get("dl-overlay").classList.contains("open"),
    press: (key) => {
      for (const handler of documentListeners.get("keydown") ?? [])
        handler({ key });
    },
  };
}

/** A stub of the handle `window.HoustonDLButtons.init` returns. */
function fakeButtons() {
  let current = "other";
  const applied = [];
  return {
    applied,
    init: () => ({
      applyOs: (os) => {
        if (os) current = os;
        applied.push(os);
        return current;
      },
      os: () => current,
    }),
  };
}

test("opens the modal from a trigger when the buttons asset never loaded", () => {
  const page = openPage();
  page.triggers[0].fire("click", { preventDefault: () => {} });
  assert.equal(page.overlay.classList.contains("open"), true);
  assert.equal(page.formStep.hidden, false, "an unregistered visitor is gated");
  assert.deepEqual(
    page.tracked.map((event) => event.name),
    ["app_download_clicked", "download_clicked"],
  );
  // The OS still reaches analytics: it is the page's own detection, not the
  // missing asset's, that answers it.
  assert.equal(page.tracked[0].props.os, "mac");
  assert.equal(page.tracked[1].props.source, "nav");
});

test("closes on the close button and on Escape without the buttons asset", () => {
  const page = openPage();
  page.triggers[0].fire("click", { preventDefault: () => {} });
  page.close.fire("click");
  assert.equal(page.overlay.classList.contains("open"), false);

  page.triggers[0].fire("click", { preventDefault: () => {} });
  page.press("Escape");
  assert.equal(page.overlay.classList.contains("open"), false);
});

test("still gates the form, and shows the download step on submit", () => {
  const page = openPage();
  page.triggers[0].fire("click", { preventDefault: () => {} });
  page.window.formOpts.onSubmitted({ email: "ada@example.com" });
  assert.equal(page.downloadStep.hidden, false);
  assert.equal(page.formStep.hidden, true);
  assert.deepEqual(
    page.tracked.slice(2).map((event) => event.name),
    ["download_form_submitted", "download_unlocked"],
  );
});

test("keeps the modal working when the form asset never loaded", () => {
  // download-gate-form.js is the registration step's own asset. Without it
  // there is nothing to submit — but the modal, the OS detection and every way
  // out of it are this file's job and must not go down with it.
  const page = openPage({ form: false });
  page.triggers[0].fire("click", { preventDefault: () => {} });
  assert.equal(page.open(), true);
  assert.equal(page.formStep.hidden, false, "the gate still gates");
  assert.equal(page.window.formOpts, undefined, "nothing was wired to submit");

  page.press("Escape");
  assert.equal(page.open(), false, "Escape");

  page.triggers[0].fire("click", { preventDefault: () => {} });
  page.overlay.fire("click", { target: page.overlay });
  assert.equal(page.open(), false, "the backdrop");

  page.triggers[0].fire("click", { preventDefault: () => {} });
  page.close.fire("click");
  assert.equal(page.open(), false, "the close button");
});

test("still honours the #download deep link without the form asset", () => {
  // The deep link is the LAST thing this file runs, so anything that throws
  // above it takes the link with it — silently, for every /?#download visitor.
  assert.equal(openPage({ hash: "#download" }).open(), true);
  assert.equal(openPage({ hash: "#download", form: false }).open(), true);
});

test("a returning visitor still reaches the download step with no form asset", () => {
  // Registration is remembered in localStorage, so this visitor never needed
  // the form asset at all — they must land straight on the buttons.
  const buttons = fakeButtons();
  const page = openPage({ buttons, form: false, registered: true });
  page.triggers[0].fire("click", { preventDefault: () => {} });
  assert.equal(page.downloadStep.hidden, false);
  assert.equal(page.formStep.hidden, true);
});

test("drives the buttons asset when it is there", () => {
  const buttons = fakeButtons();
  const page = openPage({
    buttons,
    triggers: [trigger("hero", "windows")],
  });
  page.triggers[0].fire("click", { preventDefault: () => {} });
  assert.deepEqual(buttons.applied, ["windows"]);
  assert.equal(page.tracked[0].props.os, "windows");
  page.window.formOpts.onSubmitted({ email: "ada@example.com" });
  // applyOs() with no argument re-pins the group as the download step appears.
  assert.deepEqual(buttons.applied, ["windows", undefined]);
});
