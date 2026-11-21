import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { connectAiStep, reachTeamStep } from "./support/manager-onboarding";
import { hireStarterTeam, STARTER_ROLES } from "./support/manager-team";
import { openManagerOnboarding, resetToFirstRun } from "./support/onboarding";
import { missionCard } from "./support/team-nav";

async function translateLikeChrome(page: Page): Promise<void> {
  await page.evaluate(() => {
    const wrap = (text: Text) => {
      const parent = text.parentElement;
      if (!parent || !text.data.trim()) return;
      if (parent.tagName === "FONT" || parent.closest("script,style,textarea"))
        return;
      const outer = document.createElement("font");
      const inner = document.createElement("font");
      outer.appendChild(inner);
      parent.replaceChild(outer, text);
      inner.appendChild(text);
    };
    const wrapUnder = (node: Node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        texts.push(t as Text);
      }
      texts.forEach(wrap);
    };
    wrapUnder(document.body);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) wrap(added as Text);
          else wrapUnder(added);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

test("the document opts out of browser translation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("translate", "no");
  await expect(
    page.locator('meta[name="google"][content="notranslate"]'),
  ).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("a translated first run survives the manager's onboarding conversation", async ({
  page,
  request,
}) => {
  const crashes: string[] = [];
  const rescues: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("react_crash") || text.includes("uncaught_error")) {
      crashes.push(text);
    }
    if (text.includes("[foreign-dom]")) rescues.push(text);
  });
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await expect(connectAiStep(page)).toBeVisible();

  await translateLikeChrome(page);
  await reachTeamStep(page);
  await hireStarterTeam(page, null, "click", STARTER_ROLES);

  await expect(page.getByText("App crashed")).toHaveCount(0);
  expect(crashes).toEqual([]);
  expect(rescues.length).toBeGreaterThan(0);
});

test("the DOM guard re-points removeChild/insertBefore at the wrapper", async ({
  page,
}) => {
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  const outcome = await page.evaluate(() => {
    const translate = (p: HTMLElement) => {
      const text = p.firstChild as Text;
      const outer = document.createElement("font");
      const inner = document.createElement("font");
      outer.appendChild(inner);
      p.replaceChild(outer, text);
      inner.appendChild(text);
      return text;
    };
    const removed = document.createElement("p");
    removed.textContent = "hola";
    const removedText = translate(removed);
    removed.removeChild(removedText);

    const inserted = document.createElement("p");
    inserted.textContent = "mundo";
    translate(inserted);
    const badge = document.createElement("span");
    inserted.insertBefore(
      badge,
      inserted.querySelector("font")?.firstChild?.firstChild ?? null,
    );

    const detached = document.createElement("p");
    const stray = document.createTextNode("gone");
    detached.removeChild(stray);
    const late = document.createElement("em");
    detached.insertBefore(late, stray);

    return {
      removedChildren: removed.childNodes.length,
      insertedOrder: Array.from(inserted.childNodes).map((n) => n.nodeName),
      detachedOrder: Array.from(detached.childNodes).map((n) => n.nodeName),
    };
  });
  expect(outcome).toEqual({
    removedChildren: 0,
    insertedOrder: ["SPAN", "FONT"],
    detachedOrder: ["EM"],
  });
});
