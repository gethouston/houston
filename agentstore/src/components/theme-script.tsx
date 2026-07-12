/**
 * Blocking theme boot script. Runs before first paint so the correct palette is
 * applied with no flash: it reads the saved preference ('light' | 'dark') and
 * otherwise follows the OS via `prefers-color-scheme`, then stamps
 * `data-theme` on <html> (which is what @houston/design-tokens keys off of).
 *
 * The catch is boot code, not a swallowed user action: if storage is blocked it
 * still resolves a usable theme instead of leaving the page unstyled.
 */

export const THEME_STORAGE_KEY = "agentstore-theme";

const SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(p==='dark'||p==='light')?p:(d?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}})();`;

export function ThemeScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a static, self-authored boot script that must run before hydration
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
