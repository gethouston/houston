// Compatibility gate — runs BEFORE the app bundle.
//
// index.html loads this as a classic (non-module) <script defer> in <head>.
// `defer` scripts and module scripts execute in document order after the
// document is parsed, so this runs ahead of the deferred app bundle (it comes
// first in the document) AND after #root exists. It must NOT be parser-blocking:
// a parser-blocking <head> script runs before <body> is parsed, so
// getElementById("root") would return null and nothing would paint. It lives in
// public/ so Vite copies it verbatim and never bundles it — keeping it free of
// the modern syntax that the app bundle ships.
//
// Two jobs:
//
// 1. Old-WebKit detection. macOS Monterey commonly ships WebKit < 16.4, which
//    predates regex lookbehind. Our markdown stack contains a top-level
//    lookbehind regex *literal*, so the engine throws "SyntaxError: invalid
//    group specifier name" while *evaluating* the app bundle, before React
//    mounts. Nothing renders and no error boundary can run, so the user just
//    sees a white screen (issue #102). We feature-test lookbehind via the
//    RegExp constructor and paint a localized "update macOS" message.
//
// 2. Generic crash safety net for modern engines. The Monterey gate only
//    catches one specific cause of white screen. Anything else (a Tahoe-only
//    WebKit regression, a CSP block, a third-party script failing to load, a
//    synchronous throw inside React.render) still produced a silent blank
//    screen with nothing in the user-visible UI. Install a window error and
//    unhandledrejection listener up front, plus a watchdog timer: if #root
//    is still empty after MOUNT_TIMEOUT_MS, paint a localized "couldn't start"
//    message with the captured error + diagnostics and a Copy button so the
//    user has something to send to support@gethouston.ai instead of a blank.
//
// Written in conservative ES2015 (no optional chaining / nullish coalescing)
// because this file is shipped as-authored, never run through esbuild.
(() => {
  // How long to wait for React to mount into #root before declaring a silent
  // crash. Cold start with HMR off is typically well under 2s; 8s leaves slack
  // for slow disks without making the user stare at white for a minute.
  var MOUNT_TIMEOUT_MS = 8000;

  // Mirrors the app's shipped locales (en / es / pt). This runs before
  // react-i18next exists, so the strings live here. Keep them in the product
  // voice: no mention of WebKit/Safari, no em dashes.
  var MESSAGES = {
    en: {
      title: "Houston needs a newer version of macOS",
      body: "Please update your Mac to macOS Ventura (13) or later, then open Houston again.",
    },
    es: {
      title: "Houston necesita una versión más reciente de macOS",
      body: "Actualiza tu Mac a macOS Ventura (13) o una versión posterior y vuelve a abrir Houston.",
    },
    pt: {
      title: "O Houston precisa de uma versão mais recente do macOS",
      body: "Atualize seu Mac para o macOS Ventura (13) ou mais recente e abra o Houston novamente.",
    },
  };

  // Used when the watchdog or an early error fires. Same language matrix.
  var CRASH_MESSAGES = {
    en: {
      title: "Houston couldn't start",
      body: "Try opening Houston again. If this keeps happening, copy the details below and send them to hello@gethouston.ai so we can fix it.",
      reload: "Reopen Houston",
      copy: "Copy details",
      copied: "Copied",
    },
    es: {
      title: "Houston no pudo iniciar",
      body: "Intenta abrir Houston de nuevo. Si el problema continúa, copia los detalles y envíalos a hello@gethouston.ai para que podamos resolverlo.",
      reload: "Volver a abrir Houston",
      copy: "Copiar detalles",
      copied: "Copiado",
    },
    pt: {
      title: "O Houston não conseguiu iniciar",
      body: "Tente abrir o Houston novamente. Se o problema continuar, copie os detalhes e envie para hello@gethouston.ai para que possamos resolver.",
      reload: "Reabrir o Houston",
      copy: "Copiar detalhes",
      copied: "Copiado",
    },
  };

  function pickLanguage(navigatorLanguage) {
    var lang = (navigatorLanguage || "").toLowerCase();
    if (lang.indexOf("es") === 0) return "es";
    if (lang.indexOf("pt") === 0) return "pt";
    return "en";
  }

  // Probes the one feature whose absence blanks the screen: regex lookbehind
  // (WebKit 16.4+). Built with the RegExp *constructor* so this file itself
  // parses on every engine — a regex literal here would fail to parse on
  // exactly the engines we are detecting. The catch is feature detection, not a
  // swallowed failure.
  function isModernEngineSupported(RegExpCtor) {
    try {
      new RegExpCtor("(?<=a)b");
      return true;
    } catch (e) {
      return false;
    }
  }

  function renderUnsupportedScreen(root, message) {
    // Inline styles only — the app stylesheet may not parse on the unsupported
    // engine, and explicit colors cover the viewport regardless.
    root.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#0d0d0f;color:#e8e8ea;font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">' +
      '<div style="max-width:30rem;text-align:center;">' +
      '<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;line-height:1.3;">' +
      message.title +
      "</h1>" +
      '<p style="margin:0;font-size:15px;line-height:1.5;color:#a1a1aa;">' +
      message.body +
      "</p></div></div>";
  }

  function rootHasMounted(doc) {
    var root = doc.getElementById("root");
    return !!root && root.childElementCount > 0;
  }

  // Builds a plain-text diagnostics blob the user can copy. No structured
  // payload — the goal is something a non-technical user can paste into an
  // email. Stays robust when `error` is null (silent stall) or partial.
  function captureDiagnostics(error, info) {
    var lines = [];
    lines.push(`Time: ${new Date().toISOString()}`);
    if (info?.userAgent) lines.push(`User agent: ${info.userAgent}`);
    if (info?.url) lines.push(`URL: ${info.url}`);
    if (error) {
      if (error.message) lines.push(`Error: ${error.message}`);
      if (error.filename) {
        lines.push(
          "Where: " +
            error.filename +
            ":" +
            (error.lineno || "?") +
            ":" +
            (error.colno || "?"),
        );
      }
      if (error.stack) lines.push(`Stack:\n${error.stack}`);
    } else {
      lines.push(`Error: app did not mount within ${MOUNT_TIMEOUT_MS}ms`);
    }
    return lines.join("\n");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCrashScreen(root, message, diagnostics) {
    root.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#0d0d0f;color:#e8e8ea;font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow:auto;">' +
      '<div style="max-width:36rem;width:100%;">' +
      '<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;line-height:1.3;text-align:center;">' +
      escapeHtml(message.title) +
      "</h1>" +
      '<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#a1a1aa;text-align:center;">' +
      escapeHtml(message.body) +
      "</p>" +
      '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;flex-wrap:wrap;">' +
      '<button id="houston-gate-reload" type="button" style="padding:8px 16px;font:inherit;font-size:14px;background:#3b82f6;color:#fff;border:0;border-radius:6px;cursor:pointer;">' +
      escapeHtml(message.reload) +
      "</button>" +
      '<button id="houston-gate-copy" type="button" style="padding:8px 16px;font:inherit;font-size:14px;background:#1f1f23;color:#e8e8ea;border:1px solid #2e2e33;border-radius:6px;cursor:pointer;">' +
      escapeHtml(message.copy) +
      "</button>" +
      "</div>" +
      '<pre id="houston-gate-diagnostics" style="margin:0;padding:12px;background:#1a1a1c;color:#a1a1aa;border:1px solid #2e2e33;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;">' +
      escapeHtml(diagnostics) +
      "</pre>" +
      "</div></div>";

    var reloadBtn = root.querySelector("#houston-gate-reload");
    var copyBtn = root.querySelector("#houston-gate-copy");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", () => {
        try {
          window.location.reload();
        } catch (e) {
          /* nothing better we can do from inside the crash screen */
        }
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        var done = () => {
          copyBtn.textContent = message.copied;
        };
        try {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(diagnostics).then(done, done);
            return;
          }
        } catch (e) {
          /* fall through to selection fallback */
        }
        var pre = root.querySelector("#houston-gate-diagnostics");
        if (
          pre &&
          typeof getSelection === "function" &&
          typeof document.createRange === "function"
        ) {
          var range = document.createRange();
          range.selectNodeContents(pre);
          var sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }
  }

  // Normalizes the two browser error shapes (`ErrorEvent`, `PromiseRejectionEvent`)
  // into a flat record the diagnostics formatter consumes. Returns null when the
  // event carries nothing useful so callers can ignore it.
  function errorFromErrorEvent(event) {
    if (!event) return null;
    var nested = event.error;
    if (nested && (nested.message || nested.stack)) {
      return {
        message: nested.message || String(nested),
        stack: nested.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      };
    }
    if (event.message || event.filename) {
      return {
        message: event.message || "Script error",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      };
    }
    return null;
  }

  function errorFromRejectionEvent(event) {
    if (!event) return null;
    var reason = event.reason;
    if (reason && (reason.message || reason.stack)) {
      return { message: reason.message || String(reason), stack: reason.stack };
    }
    if (typeof reason !== "undefined" && reason !== null) {
      return { message: String(reason) };
    }
    return { message: "Unhandled promise rejection" };
  }

  // Expose the pure helpers when loaded by the unit test (Node passes a
  // `module` object). In the browser `module` is undefined, so we skip this and
  // run the gate.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      MOUNT_TIMEOUT_MS: MOUNT_TIMEOUT_MS,
      MESSAGES: MESSAGES,
      CRASH_MESSAGES: CRASH_MESSAGES,
      pickLanguage: pickLanguage,
      isModernEngineSupported: isModernEngineSupported,
      renderUnsupportedScreen: renderUnsupportedScreen,
      rootHasMounted: rootHasMounted,
      captureDiagnostics: captureDiagnostics,
      renderCrashScreen: renderCrashScreen,
      errorFromErrorEvent: errorFromErrorEvent,
      errorFromRejectionEvent: errorFromRejectionEvent,
    };
    return;
  }

  if (typeof document === "undefined") return;

  // 1) Monterey path — paint and stop. Skips the crash watchdog because #root
  //    is already painted (rootHasMounted would short-circuit anyway, but this
  //    also saves the listeners and timer).
  if (!isModernEngineSupported(RegExp)) {
    var unsupportedRoot = document.getElementById("root");
    if (unsupportedRoot) {
      renderUnsupportedScreen(
        unsupportedRoot,
        MESSAGES[pickLanguage(navigator.language)],
      );
    }
    return;
  }

  // 2) Modern engine — install the crash safety net. window/setTimeout may not
  //    exist in non-browser hosts (Node SSR test harness); degrade silently.
  if (typeof window === "undefined" || typeof setTimeout === "undefined")
    return;

  var firstError = null;
  function rememberError(err) {
    if (firstError || !err) return;
    firstError = err;
  }
  window.addEventListener(
    "error",
    (event) => {
      rememberError(errorFromErrorEvent(event));
    },
    true, // capture, so we see errors from inline scripts even if they stopPropagation
  );
  window.addEventListener("unhandledrejection", (event) => {
    rememberError(errorFromRejectionEvent(event));
  });

  setTimeout(() => {
    if (rootHasMounted(document)) return;
    var crashRoot = document.getElementById("root");
    if (!crashRoot) return;
    var lang = pickLanguage(navigator.language);
    var diagnostics = captureDiagnostics(firstError, {
      userAgent: navigator.userAgent,
      url: typeof location !== "undefined" ? location.href : "",
    });
    renderCrashScreen(crashRoot, CRASH_MESSAGES[lang], diagnostics);
  }, MOUNT_TIMEOUT_MS);
})();
