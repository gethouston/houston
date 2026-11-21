import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gateSource = readFileSync(
  fileURLToPath(new URL("../../public/compat-gate.js", import.meta.url)),
  "utf8",
);

function loadHelpers() {
  const fakeModule = { exports: {} };
  new Function("module", gateSource)(fakeModule);
  return fakeModule.exports;
}

function runGate({ navigatorLanguage, lookbehindThrows, hasWindow = false }) {
  const root = {
    innerHTML: "",
    childElementCount: 0,
    querySelector: () => null,
  };
  const fakeDocument = {
    getElementById: (id) => (id === "root" ? root : null),
  };
  const fakeNavigator = { language: navigatorLanguage };
  const FakeRegExp = lookbehindThrows
    ? () => {
        throw new SyntaxError("invalid group specifier name");
      }
    : RegExp;
  const fakeWindow = hasWindow ? undefined : undefined;
  new Function(
    "module",
    "document",
    "navigator",
    "RegExp",
    "window",
    gateSource,
  )(undefined, fakeDocument, fakeNavigator, FakeRegExp, fakeWindow);
  return root.innerHTML;
}

const {
  pickLanguage,
  isModernEngineSupported,
  MESSAGES,
  CRASH_MESSAGES,
  rootHasMounted,
  captureDiagnostics,
  renderCrashScreen,
  errorFromErrorEvent,
  errorFromRejectionEvent,
  MOUNT_TIMEOUT_MS,
} = loadHelpers();

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

test("every shipped language has a non-empty Monterey title and body", () => {
  for (const lang of ["en", "es", "pt"]) {
    const message = MESSAGES[lang];
    assert.ok(message, `missing message for ${lang}`);
    assert.ok(message.title.length > 0, `empty title for ${lang}`);
    assert.ok(message.body.length > 0, `empty body for ${lang}`);
  }
});

test("every shipped language has full crash-screen copy", () => {
  for (const lang of ["en", "es", "pt"]) {
    const message = CRASH_MESSAGES[lang];
    assert.ok(message, `missing crash message for ${lang}`);
    for (const key of ["title", "body", "reload", "copy", "copied"]) {
      assert.ok(
        typeof message[key] === "string" && message[key].length > 0,
        `${lang}.${key} must be a non-empty string`,
      );
    }
  }
});

test("gate copy contains no em dashes (i18n validator rule)", () => {
  for (const lang of ["en", "es", "pt"]) {
    const monterey = MESSAGES[lang];
    assert.ok(
      !monterey.title.includes("—"),
      `em dash in Monterey ${lang} title`,
    );
    assert.ok(!monterey.body.includes("—"), `em dash in Monterey ${lang} body`);
    const crash = CRASH_MESSAGES[lang];
    for (const key of ["title", "body", "reload", "copy", "copied"]) {
      assert.ok(!crash[key].includes("—"), `em dash in crash ${lang}.${key}`);
    }
  }
});

test("isModernEngineSupported tracks the engine's lookbehind support", () => {
  assert.equal(isModernEngineSupported(RegExp), true);
  const throwing = () => {
    throw new SyntaxError("invalid group specifier name");
  };
  assert.equal(isModernEngineSupported(throwing), false);
});

test("a modern engine leaves the root untouched for the app to mount", () => {
  assert.equal(
    runGate({ navigatorLanguage: "en-US", lookbehindThrows: false }),
    "",
  );
});

test("an old engine renders a localized message into the root", () => {
  const es = runGate({ navigatorLanguage: "es-ES", lookbehindThrows: true });
  assert.ok(es.includes(MESSAGES.es.title));
  assert.ok(es.includes(MESSAGES.es.body));
  assert.ok(
    es.includes("position:fixed"),
    "must use self-contained inline styles",
  );

  const pt = runGate({ navigatorLanguage: "pt-BR", lookbehindThrows: true });
  assert.ok(pt.includes(MESSAGES.pt.title));

  const en = runGate({ navigatorLanguage: "fr-FR", lookbehindThrows: true });
  assert.ok(
    en.includes(MESSAGES.en.title),
    "unknown locale falls back to English",
  );
});

test("index.html loads the gate as a deferred (not parser-blocking) script", () => {
  const indexHtml = readFileSync(
    fileURLToPath(new URL("../../index.html", import.meta.url)),
    "utf8",
  );
  const gateTag = indexHtml.match(
    /<script\b[^>]*\bsrc="\/compat-gate\.js"[^>]*>/,
  );
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

test("rootHasMounted is true exactly when #root has child elements", () => {
  const empty = { getElementById: () => ({ childElementCount: 0 }) };
  const full = { getElementById: () => ({ childElementCount: 3 }) };
  const missing = { getElementById: () => null };
  assert.equal(rootHasMounted(empty), false);
  assert.equal(rootHasMounted(full), true);
  assert.equal(rootHasMounted(missing), false);
});

test("captureDiagnostics formats an error event into a copyable blob", () => {
  const out = captureDiagnostics(
    {
      message: "Boom",
      stack: "Error: Boom\n    at app.js:1:1",
      filename: "app.js",
      lineno: 1,
      colno: 5,
    },
    { userAgent: "TestAgent/1.0", url: "tauri://app/index.html" },
  );
  assert.match(out, /User agent: TestAgent\/1\.0/);
  assert.match(out, /URL: tauri:\/\/app\/index\.html/);
  assert.match(out, /Error: Boom/);
  assert.match(out, /Where: app\.js:1:5/);
  assert.match(out, /Stack:\nError: Boom/);
  assert.match(out, /^Time: \d{4}-\d{2}-\d{2}T/m);
});

test("captureDiagnostics names the silent-stall case when no error fired", () => {
  const out = captureDiagnostics(null, { userAgent: "UA", url: "u" });
  assert.match(out, new RegExp(`did not mount within ${MOUNT_TIMEOUT_MS}ms`));
});

test("errorFromErrorEvent prefers the nested Error then falls back to the event", () => {
  assert.deepEqual(
    errorFromErrorEvent({
      error: { message: "nested", stack: "S" },
      filename: "a.js",
      lineno: 2,
      colno: 3,
    }),
    { message: "nested", stack: "S", filename: "a.js", lineno: 2, colno: 3 },
  );
  assert.deepEqual(
    errorFromErrorEvent({
      message: "Script error",
      filename: "x.js",
      lineno: 1,
      colno: 1,
    }),
    { message: "Script error", filename: "x.js", lineno: 1, colno: 1 },
  );
  assert.equal(errorFromErrorEvent(null), null);
  assert.equal(errorFromErrorEvent({}), null);
});

test("errorFromRejectionEvent unwraps Error reasons and stringifies plain values", () => {
  assert.deepEqual(
    errorFromRejectionEvent({ reason: { message: "nope", stack: "T" } }),
    { message: "nope", stack: "T" },
  );
  assert.deepEqual(errorFromRejectionEvent({ reason: "weird string" }), {
    message: "weird string",
  });
  assert.deepEqual(errorFromRejectionEvent({ reason: undefined }), {
    message: "Unhandled promise rejection",
  });
});

test("renderCrashScreen embeds title, body, buttons, diagnostics, and wires Reload/Copy", () => {
  const handlers = { reload: null, copy: null };
  const reloadBtn = {
    addEventListener: (type, fn) => {
      if (type === "click") handlers.reload = fn;
    },
  };
  const copyBtn = {
    addEventListener: (type, fn) => {
      if (type === "click") handlers.copy = fn;
    },
    textContent: "",
  };
  const root = {
    innerHTML: "",
    querySelector: (sel) => {
      if (sel === "#houston-gate-reload") return reloadBtn;
      if (sel === "#houston-gate-copy") return copyBtn;
      return null;
    },
  };

  renderCrashScreen(root, CRASH_MESSAGES.en, "Time: ...\nError: Boom");

  assert.ok(root.innerHTML.includes(CRASH_MESSAGES.en.title));
  assert.ok(root.innerHTML.includes(CRASH_MESSAGES.en.body));
  assert.ok(root.innerHTML.includes(CRASH_MESSAGES.en.reload));
  assert.ok(root.innerHTML.includes(CRASH_MESSAGES.en.copy));
  assert.ok(
    root.innerHTML.includes("Error: Boom"),
    "diagnostics body must be embedded",
  );
  assert.ok(root.innerHTML.includes('id="houston-gate-diagnostics"'));
  assert.ok(
    root.innerHTML.includes("position:fixed"),
    "must use self-contained inline styles",
  );
  assert.equal(
    typeof handlers.reload,
    "function",
    "Reload button must have a click handler",
  );
  assert.equal(
    typeof handlers.copy,
    "function",
    "Copy button must have a click handler",
  );
  assert.doesNotThrow(() => handlers.copy());
});

test("renderCrashScreen escapes HTML in the diagnostics so an error message can't break out", () => {
  const root = {
    innerHTML: "",
    querySelector: () => ({ addEventListener: () => {}, textContent: "" }),
  };
  renderCrashScreen(root, CRASH_MESSAGES.en, '<script>alert("x")</script>');
  assert.ok(
    !root.innerHTML.includes('<script>alert("x")</script>'),
    "diagnostics must be HTML-escaped before being embedded",
  );
  assert.ok(root.innerHTML.includes("&lt;script&gt;"));
});

function runGateWithWatchdog({ rootChildren, fireError, navigatorLanguage }) {
  const eventListeners = {};
  const root = {
    innerHTML: "",
    childElementCount: rootChildren,
    querySelector: () => ({ addEventListener: () => {}, textContent: "" }),
  };
  const fakeDocument = {
    getElementById: (id) => (id === "root" ? root : null),
  };
  const fakeNavigator = {
    language: navigatorLanguage,
    userAgent: "Watchdog/1.0",
  };
  let scheduled = null;
  const fakeWindow = {
    addEventListener: (type, fn) => {
      eventListeners[type] = fn;
    },
    location: { href: "tauri://app", reload: () => {} },
  };
  const fakeSetTimeout = (fn, _ms) => {
    scheduled = fn;
    return 1;
  };
  new Function(
    "module",
    "document",
    "navigator",
    "RegExp",
    "window",
    "setTimeout",
    "location",
    gateSource,
  )(
    undefined,
    fakeDocument,
    fakeNavigator,
    RegExp,
    fakeWindow,
    fakeSetTimeout,
    fakeWindow.location,
  );

  if (fireError && eventListeners.error) {
    eventListeners.error({
      error: { message: "Bundle blew up", stack: "stack here" },
      filename: "main.tsx",
      lineno: 42,
      colno: 7,
    });
  }
  if (scheduled) scheduled();
  return root.innerHTML;
}

test("watchdog stays quiet when React has mounted into #root", () => {
  const html = runGateWithWatchdog({
    rootChildren: 1,
    fireError: false,
    navigatorLanguage: "en-US",
  });
  assert.equal(html, "", "must not repaint over a successfully mounted app");
});

test("watchdog paints a localized crash screen when #root is still empty", () => {
  const en = runGateWithWatchdog({
    rootChildren: 0,
    fireError: false,
    navigatorLanguage: "en-US",
  });
  assert.ok(en.includes(CRASH_MESSAGES.en.title));
  assert.ok(en.includes(`did not mount within ${MOUNT_TIMEOUT_MS}ms`));

  const es = runGateWithWatchdog({
    rootChildren: 0,
    fireError: false,
    navigatorLanguage: "es-ES",
  });
  assert.ok(es.includes(CRASH_MESSAGES.es.title));

  const pt = runGateWithWatchdog({
    rootChildren: 0,
    fireError: false,
    navigatorLanguage: "pt-BR",
  });
  assert.ok(pt.includes(CRASH_MESSAGES.pt.title));
});

test("watchdog surfaces the first captured error in the diagnostics blob", () => {
  const html = runGateWithWatchdog({
    rootChildren: 0,
    fireError: true,
    navigatorLanguage: "en-US",
  });
  assert.ok(html.includes("Error: Bundle blew up"));
  assert.ok(html.includes("Where: main.tsx:42:7"));
  assert.ok(html.includes("User agent: Watchdog/1.0"));
});
