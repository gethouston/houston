import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CheckoutReturnMessage,
  desktopReturnLink,
  orgReturnFromCheckoutPage,
  orgReturnFromDeepLink,
  orgReturnFromWebUrl,
  parseCheckoutReturnMessage,
  webReturnPath,
} from "../src/lib/checkout-return.ts";
import {
  handOffCheckoutReturn,
  type ReturnPagePorts,
} from "../src/lib/checkout-return-handoff.ts";
import { createCheckoutLinkGate } from "../src/lib/checkout-return-links.ts";
import { settingsSectionFromDeepLink } from "../src/lib/settings-sections.ts";

const ORG = "0123456789abcdef";

describe("org checkout return links", () => {
  it("reads the org and outcome Stripe returns with", () => {
    deepStrictEqual(orgReturnFromCheckoutPage(`?kind=org&org=${ORG}`, true), {
      org: ORG,
      outcome: "success",
    });
    deepStrictEqual(orgReturnFromCheckoutPage(`?kind=org&org=${ORG}`, false), {
      org: ORG,
      outcome: "cancel",
    });
  });

  it("leaves the Plus return and a bad slug alone", () => {
    strictEqual(orgReturnFromCheckoutPage("", true), null);
    strictEqual(orgReturnFromCheckoutPage(`?org=${ORG}`, true), null);
    strictEqual(orgReturnFromCheckoutPage("?kind=org&org=../x", true), null);
  });

  it("round-trips through the desktop deep link", () => {
    const r = { org: ORG, outcome: "success" } as const;
    strictEqual(
      desktopReturnLink(r),
      `houston://settings/plan?org=${ORG}&checkout=success`,
    );
    deepStrictEqual(orgReturnFromDeepLink(desktopReturnLink(r)), r);
    strictEqual(orgReturnFromDeepLink("houston://settings/plan"), null);
    strictEqual(
      orgReturnFromDeepLink(
        `houston://settings/channels?org=${ORG}&checkout=success`,
      ),
      null,
    );
    strictEqual(
      orgReturnFromDeepLink(`houston://settings/plan?org=${ORG}&checkout=done`),
      null,
    );
  });

  it("round-trips through the web app URL", () => {
    const r = { org: ORG, outcome: "cancel" } as const;
    deepStrictEqual(
      orgReturnFromWebUrl(`https://app.example${webReturnPath(r)}`),
      r,
    );
    strictEqual(
      orgReturnFromWebUrl(
        "https://app.example/settings/billing?checkout=success",
      ),
      null,
    );
  });

  it("keeps the org return out of the Settings plan landing", () => {
    strictEqual(
      settingsSectionFromDeepLink(
        `houston://settings/plan?org=${ORG}&checkout=success`,
      ),
      null,
    );
    strictEqual(settingsSectionFromDeepLink("houston://settings/plan"), "plan");
  });

  it("parses only well-formed channel messages", () => {
    deepStrictEqual(parseCheckoutReturnMessage({ type: "taken", org: ORG }), {
      type: "taken",
      org: ORG,
    });
    strictEqual(parseCheckoutReturnMessage({ type: "taken", org: "x" }), null);
    strictEqual(
      parseCheckoutReturnMessage({ type: "returned", org: ORG, outcome: "x" }),
      null,
    );
    strictEqual(parseCheckoutReturnMessage("returned"), null);
  });
});

function fakePorts(answer: boolean) {
  const calls: string[] = [];
  const posted: CheckoutReturnMessage[] = [];
  let listener: ((data: unknown) => void) | null = null;
  const ports: ReturnPagePorts = {
    channel: {
      post: (message) => {
        posted.push(message);
        if (answer)
          queueMicrotask(() => listener?.({ type: "taken", org: ORG }));
      },
      listen: (onMessage) => {
        listener = onMessage;
        return () => {
          listener = null;
        };
      },
    },
    close: () => calls.push("close"),
    navigate: (path) => calls.push(`navigate ${path}`),
    openDeepLink: (link) => calls.push(`deep ${link}`),
    wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    show: (where) => calls.push(`show ${where}`),
  };
  return { ports, calls, posted };
}

describe("handOffCheckoutReturn", () => {
  const r = { org: ORG, outcome: "success" } as const;

  it("hands back to the web tab that opened checkout and closes", async () => {
    const { ports, calls, posted } = fakePorts(true);
    await handOffCheckoutReturn(r, ports);
    deepStrictEqual(posted, [{ type: "returned", ...r }]);
    // A refused close moves this tab into the app at that org's Billing.
    deepStrictEqual(calls, [
      "show web",
      "close",
      `navigate ${webReturnPath(r)}`,
    ]);
  });

  it("tries the desktop app once when no web tab answers", async () => {
    const { ports, calls } = fakePorts(false);
    await handOffCheckoutReturn(r, ports);
    deepStrictEqual(calls, ["show desktop", `deep ${desktopReturnLink(r)}`]);
  });

  it("goes straight to the desktop app without BroadcastChannel", async () => {
    const { ports, calls } = fakePorts(true);
    await handOffCheckoutReturn(r, { ...ports, channel: null });
    deepStrictEqual(calls, ["show desktop", `deep ${desktopReturnLink(r)}`]);
  });
});

describe("checkout deep links that land", () => {
  const link = `houston://settings/plan?org=${ORG}&checkout=cancel`;

  it("lands a second live return for the same org and outcome", () => {
    let now = 0;
    const gate = createCheckoutLinkGate(() => now);
    strictEqual(gate.live(link), true);
    now += 300;
    strictEqual(gate.live(link), false, "the same event fired twice");
    now += 60_000;
    strictEqual(gate.live(link), true);
  });

  it("lands the launch link once per run, however it arrives", () => {
    let now = 0;
    const gate = createCheckoutLinkGate(() => now);
    strictEqual(gate.launch(link), true);
    now += 200;
    strictEqual(gate.live(link), false, "the launch link replayed as an event");
    now += 60_000;
    strictEqual(gate.launch(link), false, "a shell remount reads it again");
    strictEqual(gate.live(link), true);
  });
});
