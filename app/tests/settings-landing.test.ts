import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  ackBootLanding,
  applySettingsLanding,
  captureSettingsLanding,
  peekBootLanding,
  type SettingsLanding,
  type SlackCompletion,
  settingsLanding,
  settingsLandingFromDeepLink,
  withoutLanding,
} from "../src/lib/settings-landing.ts";
import { useUIStore } from "../src/stores/ui.ts";

const ticket = "Tk7-ticket.value_~9";

afterEach(() => useUIStore.getState().reset());

describe("public channels landing", () => {
  it("recognizes a navigation-only callback", () => {
    deepStrictEqual(settingsLanding("?settings=channels"), {
      kind: "settings",
      section: "channels",
      slack: null,
    });
  });
  it("ignores unrelated sections and ambiguous parameters", () => {
    for (const query of [
      "",
      "?settings=admin",
      "?settings=channels&settings=profile",
      "?settings=https://evil.test",
      `?settings=channels&assistant=1111111111111111`,
    ])
      deepStrictEqual(settingsLanding(query), { kind: "absent" });
  });
  it("carries the completion ticket the gateway minted", () => {
    deepStrictEqual(settingsLanding(`?settings=channels&slack=${ticket}`), {
      kind: "settings",
      section: "channels",
      slack: { kind: "ticket", ticket },
    });
  });
  it("refuses a ticket that could never be redeemed, and says so", () => {
    for (const value of [
      "",
      "short",
      "with%20space",
      "a".repeat(257),
      "path/traversal/value",
      `${ticket}&slack=${ticket}`,
    ])
      deepStrictEqual(settingsLanding(`?settings=channels&slack=${value}`), {
        kind: "settings",
        section: "channels",
        slack: { kind: "invalid" },
      });
  });
  it("strips the landing from the URL and leaves the rest of it alone", () => {
    strictEqual(
      withoutLanding(
        `https://app.test/home?settings=channels&slack=${ticket}&x=1#panel`,
      ),
      "/home?x=1#panel",
    );
    strictEqual(withoutLanding("https://app.test/?settings=channels"), "/");
  });
});

describe("capturing a callback", () => {
  const capture = (href: string) => {
    const cleaned: string[] = [];
    const landing = captureSettingsLanding(href, (url) => cleaned.push(url));
    return { landing, cleaned };
  };

  it("takes the ticket out of the address bar the moment it is read", () => {
    // Nothing waits on sign-in or workspace loading: while the ticket is in
    // window.location, analytics and session replay can capture the URL.
    const { landing, cleaned } = capture(
      `https://app.test/home?settings=channels&slack=${ticket}#panel`,
    );
    deepStrictEqual(landing, {
      kind: "settings",
      section: "channels",
      slack: { kind: "ticket", ticket },
    });
    deepStrictEqual(cleaned, ["/home#panel"]);
  });
  it("strips anything shaped like a ticket, redeemable or not", () => {
    const { landing, cleaned } = capture(
      "https://app.test/?settings=channels&slack=nope",
    );
    deepStrictEqual(landing, {
      kind: "settings",
      section: "channels",
      slack: { kind: "invalid" },
    });
    deepStrictEqual(cleaned, ["/"]);
  });
  it("consumes a bare landing too, and leaves any other URL as it is", () => {
    deepStrictEqual(capture("https://app.test/?settings=channels").cleaned, [
      "/",
    ]);
    deepStrictEqual(capture("https://app.test/?settings=plan").cleaned, []);
    deepStrictEqual(capture("https://app.test/agents").cleaned, []);
  });
  it("holds the boot capture across remounts until it is handled", () => {
    const cleaned: string[] = [];
    const clean = (url: string) => cleaned.push(url);
    const href = `https://app.test/?settings=linkedin&linkedin=${ticket}`;
    const landing = {
      kind: "linkedin",
      completion: { kind: "ticket", ticket },
    };
    deepStrictEqual(peekBootLanding(href, clean), landing);
    // A shell remount before sign-in reads the same landing from memory,
    // and the URL is never cleaned twice.
    deepStrictEqual(peekBootLanding("https://app.test/", clean), landing);
    ackBootLanding();
    deepStrictEqual(peekBootLanding(href, clean), { kind: "absent" });
    deepStrictEqual(cleaned, ["/"]);
  });
});

describe("applying a channels landing", () => {
  const record = () => {
    const calls: string[] = [];
    const handed: SlackCompletion[] = [];
    return {
      calls,
      handed,
      ports: {
        open: (section: "channels") => calls.push(`open:${section}`),
        hand: (completion: SlackCompletion) => {
          calls.push("hand");
          handed.push(completion);
        },
        linkedIn: () => calls.push("linkedIn"),
      },
    };
  };

  it("opens Channels, hands the ticket over once and clears the URL", () => {
    const { calls, handed, ports } = record();
    applySettingsLanding(
      settingsLanding(`?settings=channels&slack=${ticket}`),
      ports,
    );
    deepStrictEqual(calls, ["open:channels", "hand"]);
    deepStrictEqual(handed, [{ kind: "ticket", ticket }]);
  });
  it("hands a refused ticket over too, so the user is told why nothing happened", () => {
    const { calls, handed, ports } = record();
    applySettingsLanding(
      settingsLanding("?settings=channels&slack=nope"),
      ports,
    );
    deepStrictEqual(calls, ["open:channels", "hand"]);
    deepStrictEqual(handed, [{ kind: "invalid" }]);
  });
  it("navigates without touching the URL when no ticket came back", () => {
    const { calls, ports } = record();
    applySettingsLanding(settingsLanding("?settings=channels"), ports);
    deepStrictEqual(calls, ["open:channels"]);
  });
  it("does nothing at all for a URL that is not a channels callback", () => {
    const { calls, ports } = record();
    const absent: SettingsLanding = { kind: "absent" };
    applySettingsLanding(absent, ports);
    deepStrictEqual(calls, []);
  });
});

describe("the queued completion", () => {
  it("is taken exactly once, so a remount cannot redeem the ticket twice", () => {
    applySettingsLanding(
      settingsLanding(`?settings=channels&slack=${ticket}`),
      {
        open: (section) => useUIStore.getState().openSettings(section),
        hand: (completion) =>
          useUIStore.getState().setPendingSlackCompletion(completion),
      },
    );
    strictEqual(useUIStore.getState().settingsSection, "channels");
    const first = useUIStore.getState().pendingSlackCompletion;
    deepStrictEqual(first, { kind: "ticket", ticket });
    useUIStore.getState().setPendingSlackCompletion(null);
    strictEqual(useUIStore.getState().pendingSlackCompletion, null);
  });
  it("never survives an identity change", () => {
    useUIStore.getState().setPendingSlackCompletion({ kind: "ticket", ticket });
    useUIStore.getState().reset();
    strictEqual(useUIStore.getState().pendingSlackCompletion, null);
  });
});

describe("the desktop Slack return", () => {
  it("lands the ticket exactly as the web callback does", () => {
    deepStrictEqual(
      settingsLandingFromDeepLink(
        "houston://settings/channels?slack=Tk7-ticket.value_~9",
      ),
      {
        kind: "settings",
        section: "channels",
        slack: { kind: "ticket", ticket: "Tk7-ticket.value_~9" },
      },
    );
    deepStrictEqual(
      settingsLandingFromDeepLink(
        `houston://settings/channels/?slack=${ticket}`,
      ),
      settingsLanding(`?settings=channels&slack=${ticket}`),
    );
  });
  it("reads a mangled or duplicated ticket as a link that cannot connect", () => {
    for (const link of [
      "houston://settings/channels?slack=short",
      "houston://settings/channels?slack=has%20space",
      `houston://settings/channels?slack=${ticket}&slack=${ticket}`,
    ])
      deepStrictEqual(settingsLandingFromDeepLink(link), {
        kind: "settings",
        section: "channels",
        slack: { kind: "invalid" },
      });
  });
  it("opens Channels without a completion when no ticket came back", () => {
    deepStrictEqual(
      settingsLandingFromDeepLink("houston://settings/channels"),
      {
        kind: "settings",
        section: "channels",
        slack: null,
      },
    );
  });
  it("ignores other sections, schemes, hosts and garbage", () => {
    for (const link of [
      "houston://settings/plan",
      `houston://settings/plan?slack=${ticket}`,
      `houston://settings/channelsx?slack=${ticket}`,
      `houston://settings/channels/extra?slack=${ticket}`,
      `houston://auth-callback/channels?slack=${ticket}`,
      `https://settings/channels?slack=${ticket}`,
      `https://app.gethouston.ai/settings/channels?slack=${ticket}`,
      "not a url",
    ])
      deepStrictEqual(settingsLandingFromDeepLink(link), { kind: "absent" });
  });
});
