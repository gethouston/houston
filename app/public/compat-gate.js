// Compatibility gate — runs BEFORE the app bundle.
//
// index.html loads this as a classic (non-module) <script> in <head>. Classic
// parser-blocking scripts execute before any deferred module script by spec, so
// this runs ahead of the app bundle regardless of where Vite injects it. It
// lives in public/ so Vite copies it verbatim and never bundles it — keeping it
// free of the modern syntax that the app bundle ships.
//
// Why it exists: Tauri renders through the *system* WKWebView. macOS Monterey
// commonly ships WebKit < 16.4, which predates regex lookbehind. Our markdown
// stack (streamdown -> remark-gfm -> mdast-util-gfm-autolink-literal) contains a
// top-level lookbehind regex *literal*, so the engine throws
// "SyntaxError: invalid group specifier name" while *evaluating* the app bundle,
// before React mounts. Nothing renders and no error boundary can run, so the
// user just sees a white screen (issue #102).
//
// Lookbehind can't be transpiled away (esbuild emits regex literals verbatim)
// and the rest of the stack (Tailwind v4's modern CSS included) also needs a
// recent engine, so instead of a silent white screen we detect the unsupported
// engine up front and replace it with a clear, localized message.
//
// Written in conservative ES2015 (no optional chaining / nullish coalescing)
// because this file is shipped as-authored, never run through esbuild.
(function () {
  "use strict";

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

  // Expose the pure helpers when loaded by the unit test (Node passes a
  // `module` object). In the browser `module` is undefined, so we skip this and
  // run the gate.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      MESSAGES: MESSAGES,
      pickLanguage: pickLanguage,
      isModernEngineSupported: isModernEngineSupported,
      renderUnsupportedScreen: renderUnsupportedScreen,
    };
    return;
  }

  if (typeof document !== "undefined" && !isModernEngineSupported(RegExp)) {
    var root = document.getElementById("root");
    if (root) {
      renderUnsupportedScreen(root, MESSAGES[pickLanguage(navigator.language)]);
    }
  }
})();
