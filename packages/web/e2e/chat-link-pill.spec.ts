import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

const MISSION_ID = "act-hou-1071";
const CONVERSATION_ID = `activity-${MISSION_ID}`;

const HREF =
  "https://docs.google.com/spreadsheets/d/1JOOOml-rR9HmaliG4UX6UxZipaFoFE3zB13FWiPz-Y/edit?usp=sharing";
const WRAPPED_LABEL =
  "https://docs.google.com/spreadsheets/d/1JOOOml-  \nrR9HmaliG4UX6UxZipaFoFE3zB13FWiPz-Y/edit";
const REASSEMBLED =
  "https://docs.google.com/spreadsheets/d/1JOOOml-rR9HmaliG4UX6UxZipaFoFE3zB13FWiPz-Y/edit";
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

  const link = page.locator(`a[href="${HREF}"]`);
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toHaveText(SHORTENED);
  await expect(link).toHaveAttribute("title", HREF);

  await expect(
    page.locator("button", { hasText: "docs.google.com" }),
  ).toHaveCount(0);

  const style = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, display: s.display };
  });
  expect(style.display).toBe("inline");
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

  const labeled = page.locator(`a[href="${labeledHref}"]`);
  await expect(labeled).toBeVisible({ timeout: 15_000 });
  await expect(labeled).toHaveText(label);
  await expect(labeled).toHaveAttribute("title", labeledHref);

  await expect(page.locator("button", { hasText: label })).toHaveCount(0);

  const labeledStyle = await labeled.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, display: s.display };
  });
  expect(labeledStyle.display).toBe("inline");
  expect(labeledStyle.background).toMatch(/\/ 0\.1\)$/);

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
  await page.evaluate(() => {
    (window as unknown as { __opens: string[] }).__opens = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opens: string[] }).__opens.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.getByText("Open once").first().click();

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

  await page.locator('a[href="https://example.com/bare"]').click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __opens: string[] }).__opens),
    )
    .toEqual(["https://example.com/report", "https://example.com/bare"]);
});
