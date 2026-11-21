import { expect, test } from "./support/fixtures";

import { workspaceMenuTrigger } from "./support/workspace-menu";

const LIGHT_BG = "rgb(252, 252, 252)";
const LIGHT_FG = "rgb(20, 22, 29)";
const DARK_BG = "rgb(30, 30, 30)";
const DARK_FG = "rgb(229, 229, 229)";

interface Probe {
  bg: string;
  fg: string;
}

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
      child.className = "bg-input text-ink";
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
  await expect(workspaceMenuTrigger(page)).toBeVisible();

  const lightAppUnpinned = await probe(page, "light", null);
  const lightAppDarkPin = await probe(page, "light", "dark");

  expect(lightAppUnpinned).toEqual({ bg: LIGHT_BG, fg: LIGHT_FG });
  expect(lightAppDarkPin).toEqual({ bg: DARK_BG, fg: DARK_FG });
  expect(lightAppDarkPin.bg).not.toBe(lightAppUnpinned.bg);
  expect(lightAppDarkPin.fg).not.toBe(lightAppUnpinned.fg);

  const darkAppUnpinned = await probe(page, "dark", null);
  const darkAppLightPin = await probe(page, "dark", "light");

  expect(darkAppUnpinned).toEqual({ bg: DARK_BG, fg: DARK_FG });
  expect(darkAppLightPin).toEqual({ bg: LIGHT_BG, fg: LIGHT_FG });
  expect(darkAppLightPin.bg).not.toBe(darkAppUnpinned.bg);
  expect(darkAppLightPin.fg).not.toBe(darkAppUnpinned.fg);
});
