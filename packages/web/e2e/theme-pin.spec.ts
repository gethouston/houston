import { expect, test } from "./support/fixtures";

/**
 * Regression: subtree theme pinning via data-theme must re-resolve Tailwind
 * colour utilities (bg-background / text-foreground) INSIDE the pinned subtree,
 * independent of the app theme on <html>.
 *
 * This is the guarantee the sign-in card relies on (it pins data-theme="dark"
 * so it looks dark in a light app). It only holds because the token→utility
 * bridge in ui/core/src/globals.css is `@theme inline`: that makes each utility
 * read var(--ht-*) directly (resolved at the consuming element). With a plain
 * `@theme` the utility reads a --color-* that resolved ONCE at :root and merely
 * inherits down, so a mid-tree pin is inert — the bug this test guards.
 *
 * We probe computed rgb() rather than screenshot: deterministic and it pins the
 * exact token values from design-tokens' tokens.css.
 */

// Token values from packages/design-tokens/dist/css/tokens.css, as computed rgb.
const LIGHT_BG = "rgb(255, 255, 255)"; // --ht-background #ffffff
const LIGHT_FG = "rgb(20, 22, 29)"; //    --ht-foreground #14161d
const DARK_BG = "rgb(30, 30, 30)"; //     --ht-background #1e1e1e
const DARK_FG = "rgb(229, 229, 229)"; //  --ht-foreground #e5e5e5

interface Probe {
  bg: string;
  fg: string;
}

/**
 * Inject a wrapper (optionally data-theme-pinned) with a `bg-background
 * text-foreground` child, read the child's computed colours, then clean up.
 * `htmlTheme` sets/removes data-theme on <html> exactly as app/src/lib/theme.ts
 * does, so the probe runs under a real app-theme baseline.
 */
async function probe(
  page: import("@playwright/test").Page,
  htmlTheme: "light" | "dark",
  pin: "dark" | "light" | null,
): Promise<Probe> {
  return page.evaluate(
    ({ htmlTheme, pin }) => {
      const html = document.documentElement;
      if (htmlTheme === "dark") html.setAttribute("data-theme", "dark");
      else html.removeAttribute("data-theme");

      const wrapper = document.createElement("div");
      if (pin) wrapper.setAttribute("data-theme", pin);
      const child = document.createElement("div");
      child.className = "bg-background text-foreground";
      wrapper.appendChild(child);
      document.body.appendChild(wrapper);

      const cs = getComputedStyle(child);
      const result = { bg: cs.backgroundColor, fg: cs.color };

      wrapper.remove();
      html.removeAttribute("data-theme");
      return result;
    },
    { htmlTheme, pin },
  );
}

test("data-theme pin re-resolves Tailwind color utilities per subtree", async ({
  page,
}) => {
  await page.goto("/");
  // Anchor: the shell is up, so globals.css (the @theme inline bridge) is loaded.
  await expect(page.getByText("Mission Control")).toBeVisible();

  // --- Light app: a data-theme="dark" pin must render DARK inside it. ---
  const lightAppUnpinned = await probe(page, "light", null);
  const lightAppDarkPin = await probe(page, "light", "dark");

  // Unpinned tracks the light app theme.
  expect(lightAppUnpinned).toEqual({ bg: LIGHT_BG, fg: LIGHT_FG });
  // The pinned subtree re-resolves to the DARK token values...
  expect(lightAppDarkPin).toEqual({ bg: DARK_BG, fg: DARK_FG });
  // ...and therefore differs from its unpinned sibling (the actual bug symptom).
  expect(lightAppDarkPin.bg).not.toBe(lightAppUnpinned.bg);
  expect(lightAppDarkPin.fg).not.toBe(lightAppUnpinned.fg);

  // --- Mirror: dark app, a data-theme="light" pin must render LIGHT inside it. ---
  const darkAppUnpinned = await probe(page, "dark", null);
  const darkAppLightPin = await probe(page, "dark", "light");

  expect(darkAppUnpinned).toEqual({ bg: DARK_BG, fg: DARK_FG });
  expect(darkAppLightPin).toEqual({ bg: LIGHT_BG, fg: LIGHT_FG });
  expect(darkAppLightPin.bg).not.toBe(darkAppUnpinned.bg);
  expect(darkAppLightPin.fg).not.toBe(darkAppUnpinned.fg);
});
