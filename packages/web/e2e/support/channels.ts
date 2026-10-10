import { expect, type Page } from "@playwright/test";
import { signInAsViewer } from "./identity";
import { openSettings } from "./settings-nav";

/** One request the app made to the channels routes (reads excluded). */
export interface ChannelCall {
  method: string;
  path: string;
  body: unknown;
}

/** A connection as the gateway lists it. */
export interface MockConnection {
  id: string;
  provider: "slack" | "whatsapp";
  accountLabel: string;
  spaceId: string;
  createdAt: string;
}

export interface MockChannelsOptions {
  /** Slack's provider entry reports a finished admin setup. */
  slackConfigured?: boolean;
  /** WhatsApp's provider entry reports a finished admin setup. */
  whatsappConfigured?: boolean;
  holdFirstListUntilRedeemed?: boolean;
  /** What the list holds at the start. Default: one Slack connection. */
  connections?: MockConnection[];
  /** How long each minted WhatsApp code lives, in mint order; the last repeats. */
  whatsAppCodeTtlMs?: number[];
}

export const SLACK_CONNECTION: MockConnection = {
  id: "connection-1",
  provider: "slack",
  accountLabel: "Ada · Houston team",
  spaceId: "personal",
  createdAt: "2026-09-08T12:00:00Z",
};

export const WHATSAPP_NUMBER = "+15550001111";

/**
 * The WhatsApp codes the mock mints, in order, with the `wa.me` link each
 * carries. The first uses Go's `+` for the space and the second `%20`: the
 * gateway has sent both, and the app accepts both.
 */
export const WHATSAPP_CODES = [
  {
    code: "ABCDEFGH234567AB",
    url: "https://wa.me/15550001111?text=connect+ABCDEFGH234567AB",
  },
  {
    code: "QRSTUVWX234567CD",
    url: "https://wa.me/15550001111?text=connect%20QRSTUVWX234567CD",
  },
] as const;

/**
 * The gateway, recorded rather than asserted: an expectation thrown inside a
 * route handler fails the request instead of the test, so every claim about
 * what the app sent is made from the test body, after the UI settled.
 * `connections` is the live list: a spec pushes into it to model a connection
 * made outside the app (a WhatsApp message sent from the phone).
 */
export async function mockChannels(
  page: Page,
  {
    slackConfigured = true,
    whatsappConfigured = true,
    holdFirstListUntilRedeemed = false,
    connections: initial = [SLACK_CONNECTION],
    whatsAppCodeTtlMs = [600_000],
  }: MockChannelsOptions = {},
) {
  const calls: ChannelCall[] = [];
  const connections: MockConnection[] = initial.map((item) => ({ ...item }));
  let bound: MockConnection | null = null;
  let listed = false;
  let minted = 0;
  let redeemed = () => {};
  const redemption = new Promise<void>((resolve) => {
    redeemed = resolve;
  });
  await page.route("**/v1/channels**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET")
      calls.push({ method, path, body: request.postDataJSON() ?? null });
    if (method === "DELETE") {
      const id = decodeURIComponent(path.split("/").pop() ?? "");
      const index = connections.findIndex((item) => item.id === id);
      if (index >= 0) connections.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/slack/complete")) {
      // One ticket, one binding: redeeming again binds nothing new, and the
      // test asserts the app never asked twice.
      if (!bound) {
        bound = {
          id: "connection-2",
          provider: "slack",
          accountLabel: "Ada · Personal",
          spaceId: "personal",
          createdAt: "2026-09-08T12:30:00Z",
        };
        connections.push(bound);
      }
      await route.fulfill({ json: { connection: bound } });
      redeemed();
      return;
    }
    if (path.endsWith("/slack/connect")) {
      return route.fulfill({
        json: { url: "https://slack.com/oauth/v2/authorize?state=abc" },
      });
    }
    if (path.endsWith("/slack/link")) {
      return route.fulfill({
        json: {
          code: "ABCD-1234",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      });
    }
    if (path.endsWith("/whatsapp/link")) {
      const code = WHATSAPP_CODES[minted % WHATSAPP_CODES.length];
      const ttl =
        whatsAppCodeTtlMs[Math.min(minted, whatsAppCodeTtlMs.length - 1)];
      minted += 1;
      return route.fulfill({
        json: {
          code: code.code,
          expiresAt: new Date(Date.now() + ttl).toISOString(),
          phoneNumber: WHATSAPP_NUMBER,
          url: code.url,
        },
      });
    }
    // The list is answered NOW; holding the first answer until the ticket is
    // redeemed models a read the server served before a write the browser saw
    // land first.
    const json = structuredClone({
      providers: [
        { id: "slack", name: "Slack", configured: slackConfigured },
        { id: "whatsapp", name: "WhatsApp", configured: whatsappConfigured },
      ],
      connections,
    });
    const hold = holdFirstListUntilRedeemed && !listed;
    listed = true;
    if (hold) await redemption;
    return route.fulfill({ json });
  });
  return { calls, connections };
}

/** Sign in and open Settings → Channels (the phone's More card on a phone). */
export async function openChannels(page: Page) {
  await signInAsViewer(page);
  await openSettings(page);
  await page.getByRole("button", { name: /^Channels/ }).click();
  await expect(
    page.getByRole("heading", { name: "Channels", exact: true }),
  ).toBeVisible();
}
