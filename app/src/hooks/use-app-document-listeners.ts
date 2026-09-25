import { useEffect } from "react";
import { analytics } from "../lib/analytics";
import { shouldAllowNativeContextMenu } from "../lib/context-menu";
import { tauriSystem } from "../lib/tauri";

/**
 * App-wide document/window listeners: the session-end analytics signal, the
 * anchor-click safety net, and the production context-menu suppression.
 */
export function useAppDocumentListeners(): void {
  // Session-end signal: fired when the window goes hidden (cmd-tab away,
  // minimize, close). Tauri's WKWebView delivers `pagehide` reliably on
  // app close; `visibilitychange` covers the in-app cases. Used for
  // computing session-duration distribution and pairs with `session_started`.
  useEffect(() => {
    let firedThisVisibility = false;
    const onHide = () => {
      if (firedThisVisibility) return;
      firedThisVisibility = true;
      analytics.track("session_ended");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        onHide();
      } else {
        firedThisVisibility = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Safety net for any anchor nobody else handles: send it to the system
  // browser instead of letting the webview navigate away from the app.
  //
  // It must SKIP an event whose default was already prevented. `preventDefault`
  // does not stop the event bubbling up to this document-level listener, so a
  // component that already opened the URL itself (chat's `Autolink`, which
  // routes through the same `openUrl`) would otherwise have it opened a SECOND
  // time — two browser tabs for one click (PRODUCT-1231). `defaultPrevented`
  // is precisely the signal "somebody already dealt with this".
  //
  // It must also SKIP download anchors and object URLs. `saveBlob` hands a
  // Blob to browser builds via a synthetic `<a download href="blob:…">` click;
  // preventing that default kills the download and "opening" a blob: URL just
  // renders the bytes in a tab (a blob: URL is meaningless to any other
  // process anyway).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("blob:") ||
        href.startsWith("data:")
      )
        return;
      e.preventDefault();
      void tauriSystem.openUrl(href, { command: "open_anchor_href" });
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Suppress the native WebView context menu (Reload / Back / Forward) in
  // production builds — it's a developer affordance that shouldn't be exposed
  // to end users. Left enabled in dev so Inspect Element still works.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const handler = (e: MouseEvent) => {
      if (shouldAllowNativeContextMenu(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
