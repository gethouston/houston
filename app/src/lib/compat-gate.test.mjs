import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Tests the real shipped artifact (public/compat-gate.js) rather than a copy,
// so the gate can't drift from what runs in the browser.
const gateSource = readFileSync(
  fileURLToPath(new URL("../../public/compat-gate.js", import.meta.url)),
  "utf8",
);

// The IIFE exports its pure helpers when a `module` object is present (Node),
// and returns before touching any browser global.
function loadHelpers() {
  const fakeModule = { exports: {} };
  new Function("module", gateSource)(fakeModule);
  return fakeModule.exports;
}

// Runs the gate's browser side effect with injected globals. `module` is
// undefined here, so the IIFE skips the export branch and executes the gate.
function runGate({ navigatorLanguage, lookbehindThrows }) {
  const root = { innerHTML: "" };
  const fakeDocument = {
    getElementById: (id) => (id === "root" ? root : null),
  };
  const fakeNavigator = { language: navigatorLanguage };
  const FakeRegExp = lookbehindThrows
    ? function () {
        throw new SyntaxError("invalid group specifier name");
      }
    : RegExp;
  new Function("module", "document", "navigator", "RegExp", gateSource)(
    undefined,
    fakeDocument,
    fakeNavigator,
    FakeRegExp,
  );
  return root.innerHTML;
}

const { pickLanguage, isModernEngineSupported, MESSAGES } = loadHelpers();

test("pickLanguage maps navigator locales to a shipped language", () => {
  assert.equal(pickLanguage("es-ES"), "es");
  assert.equal(pickLanguage("ES"), "es");
  assert.equal(pickLanguage("pt-BR"), "pt");
  assert.equal(pickLanguage("en-US"), "en");
});

test("pickLanguage falls back to English for unknown or missing locales", () => {
  assert.equal(pickLanguage("fr-FR"), "en");
  assert.equal(pickLanguage(""), "en");
  assert.equal(pickLanguage(undefined), "en");
});

test("every shipped language has a non-empty title and body", () => {
  for (const lang of ["en", "es", "pt"]) {
    const message = MESSAGES[lang];
    assert.ok(message, `missing message for ${lang}`);
    assert.ok(message.title.length > 0, `empty title for ${lang}`);
    assert.ok(message.body.length > 0, `empty body for ${lang}`);
  }
});

test("gate copy contains no em dashes (i18n validator rule)", () => {
  for (const lang of ["en", "es", "pt"]) {
    const { title, body } = MESSAGES[lang];
    assert.ok(!title.includes("—"), `em dash in ${lang} title`);
    assert.ok(!body.includes("—"), `em dash in ${lang} body`);
  }
});

test("isModernEngineSupported tracks the engine's lookbehind support", () => {
  assert.equal(isModernEngineSupported(RegExp), true);
  const throwing = function () {
    throw new SyntaxError("invalid group specifier name");
  };
  assert.equal(isModernEngineSupported(throwing), false);
});

test("a modern engine leaves the root untouched for the app to mount", () => {
  assert.equal(runGate({ navigatorLanguage: "en-US", lookbehindThrows: false }), "");
});

test("an old engine renders a localized message into the root", () => {
  const es = runGate({ navigatorLanguage: "es-ES", lookbehindThrows: true });
  assert.ok(es.includes(MESSAGES.es.title));
  assert.ok(es.includes(MESSAGES.es.body));
  assert.ok(es.includes("position:fixed"), "must use self-contained inline styles");

  const pt = runGate({ navigatorLanguage: "pt-BR", lookbehindThrows: true });
  assert.ok(pt.includes(MESSAGES.pt.title));

  const en = runGate({ navigatorLanguage: "fr-FR", lookbehindThrows: true });
  assert.ok(en.includes(MESSAGES.en.title), "unknown locale falls back to English");
});

// Guards the load order, which runGate can't model: the gate paints into #root,
// so it must run AFTER #root is parsed. `defer` guarantees that while still
// running before the deferred app bundle. A parser-blocking <head> script (no
// defer) runs before <body>, finds no #root, and silently paints nothing — the
// white screen this whole gate exists to prevent.
test("index.html loads the gate as a deferred (not parser-blocking) script", () => {
  const indexHtml = readFileSync(
    fileURLToPath(new URL("../../index.html", import.meta.url)),
    "utf8",
  );
  const gateTag = indexHtml.match(/<script\b[^>]*\bsrc="\/compat-gate\.js"[^>]*>/);
  assert.ok(gateTag, "index.html must load /compat-gate.js");
  assert.match(
    gateTag[0],
    /\bdefer\b/,
    "gate script must be `defer` so #root exists when it runs",
  );
  assert.doesNotMatch(
    gateTag[0],
    /\btype="module"\b/,
    "gate must stay a classic script so it parses on the engines it detects",
  );
});
