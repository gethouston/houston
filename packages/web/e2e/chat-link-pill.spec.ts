import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * HOU-1071: a long URL the agent hard-wraps inside a markdown link label
 * (`[https://…-␠␠\n…/edit](href)`) must render as an inline clickable link,
 * never as the labeled button pill — the pill clips the wrapped URL into an
 * unreadable black bar. Seeded through `/__test__/chat-history`, so this
 * exercises the REAL browser pipeline: history → feed → Streamdown →
 * `classifyMarkdownLink` → the `a` override in `ui/chat`.
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

test("hard-wrapped URL label renders inline, not as a clipped pill (HOU-1071)", async ({
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

  // The inline anchor: full href, whitespace-free reassembled URL as text.
  const link = page.locator(`a[href="${HREF}"]`);
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toHaveText(REASSEMBLED);

  // And no button pill wearing the URL (the clipped-black-bar regression).
  await expect(
    page.locator("button", { hasText: "docs.google.com" }),
  ).toHaveCount(0);
});
