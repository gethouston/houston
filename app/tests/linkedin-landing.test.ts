// A LinkedIn connect's return: the one-time ticket on the web callback or the
// desktop deep link, handed over once, and only its authenticated redemption
// binds the account.

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  LinkedInCompletion,
  LinkedInConnection,
} from "@houston/engine-adapter";
import {
  type LinkedInCompletionResult,
  linkedInCompletionStep,
  redeemLinkedIn,
  reportHoldOnce,
} from "../src/lib/linkedin-completion.ts";
import {
  applySettingsLanding,
  captureSettingsLanding,
  carriesTicket,
  type SlackCompletion,
  settingsLanding,
  settingsLandingFromDeepLink,
} from "../src/lib/settings-landing.ts";
import {
  createHandedLinks,
  createLandingGate,
} from "../src/lib/settings-link-gate.ts";

const ticket = "Tk7-ticket.value_~9";

describe("the LinkedIn return", () => {
  it("carries the ticket on the web callback and the desktop link alike", () => {
    const landed = { kind: "linkedin", completion: { kind: "ticket", ticket } };
    deepStrictEqual(
      settingsLanding(`?settings=linkedin&linkedin=${ticket}`),
      landed,
    );
    deepStrictEqual(
      settingsLandingFromDeepLink(
        `houston://settings/linkedin?linkedin=${ticket}`,
      ),
      landed,
    );
    strictEqual(carriesTicket(landed as never), true);
  });

  it("names a mangled ticket unredeemable, and a bare return nothing", () => {
    deepStrictEqual(settingsLanding("?settings=linkedin&linkedin=a b"), {
      kind: "linkedin",
      completion: { kind: "invalid" },
    });
    deepStrictEqual(settingsLanding("?settings=linkedin"), { kind: "absent" });
    deepStrictEqual(
      settingsLandingFromDeepLink("houston://settings/linkedinx?linkedin=x"),
      { kind: "absent" },
    );
  });

  it("strips the ticket from the address bar as it is read", () => {
    let cleaned = "";
    captureSettingsLanding(
      `https://app.gethouston.ai/?settings=linkedin&linkedin=${ticket}`,
      (url) => {
        cleaned = url;
      },
    );
    strictEqual(cleaned, "/");
  });

  it("hands the completion over without opening a settings section", () => {
    const calls: string[] = [];
    applySettingsLanding(
      settingsLanding(`?settings=linkedin&linkedin=${ticket}`),
      {
        open: () => calls.push("open"),
        hand: () => calls.push("hand"),
        linkedIn: (completion) => calls.push(`linkedIn:${completion.kind}`),
      },
    );
    deepStrictEqual(calls, ["linkedIn:ticket"]);
  });

  it("hands a desktop link over once per app run", async () => {
    const link = `houston://settings/linkedin?linkedin=${ticket}`;
    const handed = createHandedLinks(
      { read: () => null, write: () => {} },
      () => {},
    );
    const applied: unknown[] = [];
    const gate = createLandingGate({
      isReady: () => true,
      apply: (landing) => applied.push(landing),
      handed,
      report: () => {},
    });
    const offer = () =>
      gate.offer({ landing: settingsLandingFromDeepLink(link), link });
    await Promise.all([offer(), offer()]);
    await offer();
    strictEqual(applied.length, 1);
  });
});

describe("redeemLinkedIn", () => {
  const connection = {
    connected: true as const,
    name: "Ada",
    expiresAt: "2026-12-01T00:00:00Z",
  };
  const run = async (
    pending: Parameters<typeof redeemLinkedIn>[0],
    answer: () => Promise<LinkedInCompletion>,
    identity: () => string | null = () => "uid-ada",
  ) => {
    const told: LinkedInCompletionResult[] = [];
    const landed: LinkedInConnection[] = [];
    const asked: string[] = [];
    await redeemLinkedIn(pending, {
      identity,
      complete: (value) => {
        asked.push(value);
        return answer();
      },
      landed: (value) => landed.push(value),
      tell: (result) => told.push(result),
    });
    return { told, landed, asked };
  };

  it("binds the account only by redeeming, then puts it where the dialog reads", async () => {
    const r = await run({ kind: "ticket", ticket }, async () => ({
      kind: "connected",
      connection,
    }));
    deepStrictEqual(r.asked, [ticket]);
    deepStrictEqual(r.landed, [connection]);
    deepStrictEqual(r.told, ["connected"]);
  });

  it("says to connect again for a refused or mangled ticket, asking nothing for the latter", async () => {
    const refused = await run({ kind: "ticket", ticket }, async () => ({
      kind: "invalid",
    }));
    deepStrictEqual(refused.told, ["unredeemable"]);
    deepStrictEqual(refused.landed, []);
    const mangled = await run({ kind: "invalid" }, async () => {
      throw new Error("must not ask");
    });
    deepStrictEqual(mangled.asked, []);
    deepStrictEqual(mangled.told, ["unredeemable"]);
  });

  it("tells nothing more when the redemption failed (the facade reported it)", async () => {
    const r = await run({ kind: "ticket", ticket }, () =>
      Promise.reject(new Error("500")),
    );
    deepStrictEqual(r.told, []);
    deepStrictEqual(r.landed, []);
  });

  it("drops an answer that lands after sign-out or under another account", async () => {
    for (const after of [null, "uid-bob"]) {
      let who: string | null = "uid-ada";
      const r = await run(
        { kind: "ticket", ticket },
        async () => {
          who = after;
          return { kind: "connected", connection };
        },
        () => who,
      );
      deepStrictEqual(r.asked, [ticket]);
      deepStrictEqual(r.landed, [], `${after}`);
      deepStrictEqual(r.told, [], `${after}`);
    }
  });
});

describe("linkedInCompletionStep", () => {
  const read = (
    linkedinShare: boolean | null,
    isLoading = false,
    isError = false,
  ) => linkedInCompletionStep({ linkedinShare, isLoading, isError });

  it("waits for the capabilities read before taking the ticket", () => {
    strictEqual(read(null, true), "wait");
  });

  it("holds the ticket when the capabilities read failed", () => {
    strictEqual(read(null, false, true), "hold");
  });

  it("redeems where LinkedIn is served, and drops it where it is not", () => {
    strictEqual(read(true), "redeem");
    strictEqual(read(false), "drop");
    // A refetch that failed over a read that landed still knows the answer.
    strictEqual(read(true, false, true), "redeem");
    // No capabilities to read at all: the local host serves no LinkedIn.
    strictEqual(read(null), "drop");
  });
});

describe("reportHoldOnce", () => {
  it("reports a held ticket once however often its page remounts", () => {
    let reports = 0;
    const queued: SlackCompletion = { kind: "ticket", ticket: "t-1" };
    // Each call stands for a mount of the page holding the same queued ticket.
    reportHoldOnce(queued, () => reports++);
    reportHoldOnce(queued, () => reports++);
    strictEqual(reports, 1);
    // A newer ticket held in turn still reports.
    reportHoldOnce({ kind: "ticket", ticket: "t-2" }, () => reports++);
    strictEqual(reports, 2);
  });
});
