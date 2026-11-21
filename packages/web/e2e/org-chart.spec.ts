import { readFile } from "node:fs/promises";
import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, signInAsViewer } from "./support/identity";
import { openAdminSection } from "./support/settings-nav";
import { screen } from "./support/team-nav";

const OWNER_CAPS = { multiplayer: true, teams: true, role: "owner" };
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);

const work = (agentSlug: string, daysAgo: number, activeMs: number) => ({
  agentSlug,
  day: day(daysAgo),
  awakeMs: activeMs * 2,
  activeMs,
  wakes: 1,
  turns: 1,
  routineRuns: 0,
});

async function arm(
  request: APIRequestContext,
  caps: Record<string, unknown>,
  compute: { rows: unknown[]; awakeNow: string[] } | null,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { ...caps, computeUsage: compute !== null },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/compute-usage`, {
    data: { seed: compute },
  });
}

const chart = (page: Page) =>
  screen(page).locator("[data-admin-section-body='orgChart']");
const line = (page: Page, name: string): Locator =>
  chart(page)
    .getByRole("region", { name: "AI Employees, ranked" })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name: `Open ${name}'s board` }),
    });

test.describe("signed in", () => {
  test.use({ baseURL: AUTH_WEB_URL });

  test("the org chart ranks each AI Employee in the ledger", async ({
    page,
    request,
  }) => {
    await arm(request, OWNER_CAPS, {
      rows: [work(SEED_AGENT_ID, 0, HOUR_MS)],
      awakeNow: [],
    });
    await signInAsViewer(page);
    await openAdminSection(page, "Org chart");
    await expect(chart(page).getByRole("heading", { level: 2 })).toBeVisible();
    const ledger = chart(page).getByRole("region", {
      name: "AI Employees, ranked",
    });
    await expect(
      ledger.getByRole("button", { name: `Open ${SEED_AGENT_NAME}'s board` }),
    ).toBeVisible();
    await expect(chart(page).locator("svg[role='img']")).toBeVisible();
    await expect(chart(page).locator("foreignObject")).toHaveCount(0);
  });
});

test("without the computeUsage capability the chart never asks for time worked", async ({
  page,
  request,
}) => {
  await arm(request, OWNER_CAPS, null);
  const computeReads: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/v1/org/compute-usage"))
      computeReads.push(req.url());
  });
  await page.goto("/");
  await openAdminSection(page, "Org chart");
  await expect(line(page, SEED_AGENT_NAME)).toBeVisible();
  await expect(chart(page).getByText("Hours of work")).toHaveCount(0);
  await expect(chart(page).getByText("Ranked by hours")).toHaveCount(0);
  expect(computeReads).toEqual([]);
});

test("the hours come from the gateway's rows for the caller's own AI Employees", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [{ userId: "u-self", email: "you@acme.test", role: "owner" }],
      agents: [
        { id: SEED_AGENT_ID, name: SEED_AGENT_NAME, everyone: true },
        { id: "scout", name: "Scout", everyone: true },
      ],
    },
  });
  await arm(request, OWNER_CAPS, {
    rows: [
      work(SEED_AGENT_ID, 0, 2 * HOUR_MS),
      work(SEED_AGENT_ID, 1, HOUR_MS),
      work("sales-bot", 1, 5 * HOUR_MS),
      work("5e70000000000000", 0, 9 * HOUR_MS),
    ],
    awakeNow: [],
  });
  await page.goto("/");
  await openAdminSection(page, "Org chart");

  await expect(
    chart(page).getByText("Hours of work", { exact: true }),
  ).toBeVisible();
  await expect(chart(page).getByText("3 hours", { exact: true })).toBeVisible();
  await expect(chart(page).getByText("Ranked by hours")).toBeVisible();
  await expect(line(page, SEED_AGENT_NAME)).toContainText(/3\s*h/);
  await expect(line(page, "Scout")).toContainText(/0\s*h/);
  for (const ghost of ["sales-bot", "Sales bot", "5e70000000000000"])
    await expect(chart(page).getByText(ghost)).toHaveCount(0);
});

test("messages lead, and rank the ledger, where time worked is not served", async ({
  page,
  request,
}) => {
  await arm(request, OWNER_CAPS, null);
  await page.route("**/v1/org/usage**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            agentSlug: SEED_AGENT_ID,
            userId: "u-self",
            day: day(0),
            messages: 42,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await openAdminSection(page, "Org chart");

  await expect(chart(page).getByText("Ranked by messages")).toBeVisible();
  await expect(chart(page).getByText("Messages · last 30 days")).toBeVisible();
  await expect(
    chart(page).getByText("42 messages", { exact: true }),
  ).toBeVisible();
  await expect(chart(page).getByText("Hours of work")).toHaveCount(0);
});

test("an admin's chart is theirs: people hidden where they only use an AI Employee", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        { userId: "u-owner", email: "owner@acme.test", role: "owner" },
        { userId: "u-self", email: "you@acme.test", role: "admin" },
      ],
      agents: [
        { id: "finance", name: "Finance Bot", access: "user", everyone: true },
        { id: "scout", name: "Scout", access: "manager", everyone: true },
      ],
    },
  });
  await arm(request, { ...OWNER_CAPS, role: "admin" }, null);
  await page.goto("/");
  await openAdminSection(page, "Org chart");

  await expect(
    chart(page).getByText("Your AI Employees", { exact: true }),
  ).toBeVisible();
  await expect(line(page, "Finance Bot")).toContainText("People hidden");
  await expect(line(page, "Scout")).toContainText("Everyone");
  await expect(line(page, "Scout")).not.toContainText("People hidden");
});

const RECORD_CLIPBOARD = () => {
  const w = window as unknown as { __copiedPng?: number[] };
  const clipboard = navigator.clipboard;
  const write = clipboard?.write?.bind(clipboard);
  if (!write) return;
  clipboard.write = async (items: ClipboardItem[]) => {
    const pending = write(items);
    const png = await items[0].getType("image/png");
    w.__copiedPng = [...new Uint8Array(await png.arrayBuffer()).slice(0, 24)];
    return pending;
  };
};

function expectSharePng(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(1500);
}

test("the org chart draws its people and AI Employees, and shares an image from its dialog", async ({
  page,
  request,
  browserName,
}) => {
  if (browserName === "chromium")
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(RECORD_CLIPBOARD);
  await page
    .context()
    .route("https://www.linkedin.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>LinkedIn</p>" }),
    );
  await request.post(`${FAKE_HOST_URL}/__test__/org`, {
    data: {
      members: [
        {
          userId: "u-self",
          email: "you@acme.test",
          role: "owner",
          displayName: "Olga Owner",
        },
        {
          userId: "u-sara",
          email: "sara@acme.test",
          role: "admin",
          displayName: "Sara Diaz",
        },
        {
          userId: "u-tom",
          email: "tom@acme.test",
          role: "user",
          displayName: "Tom Reed",
        },
      ],
      agents: [
        { id: SEED_AGENT_ID, name: SEED_AGENT_NAME, everyone: true },
        {
          id: "scout",
          name: "Scout",
          assignments: [{ userId: "u-sara", access: "manager" }],
        },
        {
          id: "inbox",
          name: "Inbox Keeper",
          assignments: [{ userId: "u-tom", access: "user" }],
        },
      ],
    },
  });
  await arm(request, OWNER_CAPS, null);
  await page.goto("/");
  await openAdminSection(page, "Org chart");

  const tree = chart(page).getByRole("region", { name: "Org chart" });
  await expect(tree.getByText("3 people, 3 AI Employees")).toHaveCount(0);
  await expect(tree.getByText("Owner", { exact: true })).toHaveCount(0);
  await expect(chart(page).getByText("Who works here")).toHaveCount(0);
  for (const name of ["Olga Owner", "Sara Diaz", "Tom Reed"])
    await expect(
      tree.getByRole("button", { name: `Open ${name} in People` }),
    ).toBeVisible();
  for (const name of [SEED_AGENT_NAME, "Scout", "Inbox Keeper"])
    await expect(
      tree.getByRole("button", { name: `Open ${name}'s board` }),
    ).toBeVisible();
  const reach = await tree.evaluate((section) => {
    const svg = section.querySelector("svg[data-reveal-lines]");
    const d = svg?.querySelector("path")?.getAttribute("d") ?? "";
    const origin = svg?.getBoundingClientRect();
    const xs = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const people = [...section.querySelectorAll("[data-tree-node^='p:']")].map(
      (node) => {
        const r = node.getBoundingClientRect();
        return r.left + r.width / 2 - (origin?.left ?? 0);
      },
    );
    return {
      segments: d.split("M").length - 1,
      overshoot: Math.max(...xs) - Math.max(...people),
      undershoot: Math.min(...people) - Math.min(...xs),
    };
  });
  expect(reach.segments).toBe(6);
  expect(reach.overshoot).toBeLessThan(1);
  expect(reach.undershoot).toBeLessThan(1);

  await expect(line(page, "Scout")).toBeVisible();

  await tree.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your org chart" });
  await expect(
    dialog.getByRole("img", { name: "Your org chart as an image" }),
  ).toBeVisible();
  await expect(dialog.getByText(/subject to our Privacy Policy/)).toHaveCount(
    0,
  );

  const opening = page.waitForEvent("popup");
  const saving = page
    .waitForEvent("download", { timeout: 20_000 })
    .catch(() => null);
  await dialog.getByRole("button", { name: "Share on LinkedIn" }).click();
  const linkedIn = await opening;
  const url = new URL(linkedIn.url());
  expect(url.host).toBe("www.linkedin.com");
  expect(url.searchParams.get("shareActive")).toBe("true");
  expect(url.searchParams.get("text")).toMatch(
    /^This is my organization\. These are all the AI Employees at .+, working in Houston\.\n\ngethouston\.ai$/,
  );
  await linkedIn.close();

  const status = dialog.getByRole("status");
  await expect(status).toHaveText(/^Image (copied|saved)\. /);
  if (browserName === "chromium")
    await expect(status).toHaveText(
      "Image copied. Paste it into your LinkedIn post.",
    );
  if ((await status.textContent())?.startsWith("Image copied")) {
    const copied = await page.evaluate(
      () => (window as unknown as { __copiedPng?: number[] }).__copiedPng,
    );
    expectSharePng(Buffer.from(copied ?? []));
  } else {
    await expect(status).toHaveText(
      "Image saved. Add it to your LinkedIn post.",
    );
    const saved = await saving;
    const png = test.info().outputPath("saved-card.png");
    await saved?.saveAs(png);
    expectSharePng(await readFile(png));
  }

  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download image" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+-org-chart\.png$/);
  const png = test.info().outputPath("share-card.png");
  await download.saveAs(png);
  expectSharePng(await readFile(png));
});
