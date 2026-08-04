import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * HOU-1071: a long URL the agent hard-wraps inside a markdown link label
 * (`[https://…-␠␠\n…/edit](href)`) must render as an inline clickable link,
 * never as the labeled button pill — the pill clips the wrapped URL into an
 * unreadable black bar.
 *
 * HOU-1152: a long URL's visible text shortens to its head plus an ellipsis
 * (Slack-style) while the href keeps the full destination.
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
/** Mirrors URL_DISPLAY_MAX in ui/chat/src/markdown-link.ts (HOU-1152). */
const URL_DISPLAY_MAX = 64;
const SHORTENED = `${REASSEMBLED.slice(0, URL_DISPLAY_MAX - 1)}…`;

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
  // (HOU-1152). The link must render as underlined inline text.
  const style = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      display: s.display,
      underlined: s.textDecorationLine,
    };
  });
  expect(style.background).toBe("rgba(0, 0, 0, 0)");
  expect(style.display).toBe("inline");
  expect(style.underlined).toContain("underline");
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
