import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * HOU-1071: a long URL the agent hard-wraps inside a markdown link label
 * (`[https://…-␠␠\n…/edit](href)`) must render as an inline clickable link,
 * never as the labeled button pill — the pill clips the wrapped URL into an
 * unreadable black bar.
 *
 * HOU-1152: a long URL's visible text shortens to its head plus an ellipsis
 * (Slack-style) while the href keeps the full destination — and EVERY link
 * variant wears that one chip: the labeled `[Open the deck](…)` link (which
 * kept the pre-Slack solid button pill through the first pass) and a URL a
 * person pasted into their own bubble included.
 *
 * Seeded through `/__test__/chat-history`, so this exercises the REAL
 * browser pipeline: history → feed → Streamdown → `classifyMarkdownLink` →
 * the `a` override in `ui/chat`.
 */

const MISSION_ID = "act-hou-1071";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

const HREF =
  "https://docs.google.com/spreadsheets/d/1JOOOml-rR9HmaliG4UX6UxZipaFoFE3zB13FWiPz-Y/edit?usp=sharing";
/** The label as agents actually emit it: hard-wrapped with trailing spaces. */
const WRAPPED_LABEL =
  "https://docs.google.com/spreadsheets/d/1JOOOml-  \nrR9HmaliG4UX6UxZipaFoFE3zB13FWiPz-Y/edit";
const REASSEMBLED =
  "https://docs.google.com/spreadsheets/d/1JOOOml-rR9HmaliG4UX6UxZipaFoFE3zB13FWiPz-Y/edit";
/** Mirrors autolinkDisplay in ui/chat/src/markdown-link.ts (HOU-1152):
 *  scheme stripped, then capped at URL_DISPLAY_MAX with an ellipsis. */
const URL_DISPLAY_MAX = 64;
const SHORTENED = `${REASSEMBLED.replace(/^https:\/\//, "").slice(0, URL_DISPLAY_MAX - 1)}…`;

test("hard-wrapped URL label renders inline and shortened, not as a clipped pill (HOU-1071 / HOU-1152)", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: "Link rendering", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: CONVERSATION_ID,
      messages: [
        { role: "user", content: "share the sheet", ts: 1 },
        {
          role: "assistant",
          content: `Sheet's live, open it here: [${WRAPPED_LABEL}](${HREF})`,
          ts: 2,
        },
      ],
    },
  });

  await page.goto("/");
  await page.getByText("Link rendering").first().click();

  // The inline anchor: full href, reassembled + shortened URL as text, and
  // the full destination surfaced on hover.
  const link = page.locator(`a[href="${HREF}"]`);
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toHaveText(SHORTENED);
  await expect(link).toHaveAttribute("title", HREF);

  // And no button pill wearing the URL (the clipped-black-bar regression).
  await expect(
    page.locator("button", { hasText: "docs.google.com" }),
  ).toHaveCount(0);

  // Nor a pill by stylesheet: a blanket `.is-assistant a[href]` rule once
  // re-skinned every anchor as a fixed-height pill, clipping long URLs
  // (HOU-1152). The link must render as an INLINE chip: link-token blue on
  // the soft link tint, flowing with the text (never a fixed-height flexbox).
  const style = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, display: s.display };
  });
  expect(style.display).toBe("inline");
  // bg-link/10: the link token at 10% alpha (Tailwind computes via oklab —
  // assert the tint's alpha rather than a color-space-dependent literal).
  expect(style.background).toMatch(/\/ 0\.1\)$/);
});

test("bare long URL displays shortened with the full href intact (HOU-1152)", async ({
  page,
  request,
}) => {
  const missionId = "act-hou-1152";
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: missionId, title: "Bare link rendering", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: `activity-${missionId}`,
      messages: [
        { role: "user", content: "where are the slides?", ts: 1 },
        { role: "assistant", content: `Right here: ${REASSEMBLED}`, ts: 2 },
      ],
    },
  });

  await page.goto("/");
  await page.getByText("Bare link rendering").first().click();

  const link = page.locator(`a[href="${REASSEMBLED}"]`);
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toHaveText(SHORTENED);
  await expect(link).toHaveAttribute("title", REASSEMBLED);
});

test("a labeled link is the same inline chip as a bare URL, never a button pill (HOU-1152)", async ({
  page,
  request,
}) => {
  const missionId = "act-hou-1152-labeled";
  const labeledHref =
    "https://docs.google.com/presentation/d/1qObQZ8EL3Yc/edit";
  const label = "Open the deck";
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: missionId, title: "Labeled link", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: `activity-${missionId}`,
      messages: [
        // The person's own pasted URL, in the human bubble.
        { role: "user", content: `deck please: ${REASSEMBLED}`, ts: 1 },
        {
          role: "assistant",
          content: `Done: [${label}](${labeledHref})`,
          ts: 2,
        },
      ],
    },
  });

  await page.goto("/");
  await page.getByText("Labeled link").first().click();

  // The labeled link: an inline anchor wearing its label verbatim (a label is
  // the author's words, not a URL to shorten), with the destination on hover.
  const labeled = page.locator(`a[href="${labeledHref}"]`);
  await expect(labeled).toBeVisible({ timeout: 15_000 });
  await expect(labeled).toHaveText(label);
  await expect(labeled).toHaveAttribute("title", labeledHref);

  // Not the old solid button pill — the one link variant that still looked
  // like a call to action while every other link had become a chip.
  await expect(page.locator("button", { hasText: label })).toHaveCount(0);

  // Same chip anatomy as a bare URL: inline flow on the soft link tint.
  const labeledStyle = await labeled.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, display: s.display };
  });
  expect(labeledStyle.display).toBe("inline");
  expect(labeledStyle.background).toMatch(/\/ 0\.1\)$/);

  // And the URL the PERSON pasted shortens exactly like the agent's does —
  // the human path renders plain text, but a chip is a chip on both sides.
  const pasted = page.locator(`a[href="${REASSEMBLED}"]`);
  await expect(pasted).toHaveText(SHORTENED);
  await expect(pasted).toHaveAttribute("title", REASSEMBLED);
});

test("a link opens the browser exactly ONCE (PRODUCT-1231)", async ({
  page,
  request,
}) => {
  const MISSION = "act-open-once";
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION, title: "Open once", status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: `activity-${MISSION}`,
      messages: [
        { role: "user", content: "link", ts: 1 },
        {
          role: "assistant",
          content:
            "Aquí: [el informe](https://example.com/report) y https://example.com/bare",
          ts: 2,
        },
      ],
    },
  });

  await page.goto("/");
  // Count real opens: the web build's `open_url` shim is window.open.
  await page.evaluate(() => {
    (window as unknown as { __opens: string[] }).__opens = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opens: string[] }).__opens.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.getByText("Open once").first().click();

  // `Autolink` renders a real <a href> AND handles the click itself. The app's
  // document-level safety net also catches every `a[href]` — so without the
  // `defaultPrevented` guard this click opened two browser tabs.
  const labeled = page.locator('a[href="https://example.com/report"]');
  await expect(labeled).toBeVisible({ timeout: 15_000 });
  await labeled.click();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __opens: string[] }).__opens.length,
      ),
    )
    .toBe(1);

  // Same for a bare autolinked URL.
  await page.locator('a[href="https://example.com/bare"]').click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __opens: string[] }).__opens),
    )
    .toEqual(["https://example.com/report", "https://example.com/bare"]);
});
