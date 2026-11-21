(() => {
  var MOUNT_TIMEOUT_MS = 8000;

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

  function isModernEngineSupported(RegExpCtor) {
    try {
      new RegExpCtor("(?<=a)b");
      return true;
    } catch (_e) {
      return false;
    }
  }

  function renderUnsupportedScreen(root, message) {
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
        } catch (_e) {}
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        var done = () => {
          copyBtn.textContent = message.copied;
        };
        var pre;
        var range;
        var sel;
        try {
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(diagnostics).then(done, done);
            return;
          }
        } catch (_e) {}
        pre = root.querySelector("#houston-gate-diagnostics");
        if (
          pre &&
          typeof getSelection === "function" &&
          typeof document.createRange === "function"
        ) {
          range = document.createRange();
          range.selectNodeContents(pre);
          sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }
  }

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

  var unsupportedRoot;
  if (!isModernEngineSupported(RegExp)) {
    unsupportedRoot = document.getElementById("root");
    if (unsupportedRoot) {
      renderUnsupportedScreen(
        unsupportedRoot,
        MESSAGES[pickLanguage(navigator.language)],
      );
    }
    return;
  }

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
    true,
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
