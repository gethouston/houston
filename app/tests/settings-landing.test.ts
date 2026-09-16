import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  applySettingsLanding,
  captureSettingsLanding,
  type SettingsLanding,
  type SlackCompletion,
  settingsLanding,
  withoutSlackTicket,
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
  it("strips the ticket from the URL and leaves the rest of it alone", () => {
    strictEqual(
      withoutSlackTicket(
        `https://app.test/home?settings=channels&slack=${ticket}#panel`,
      ),
      "/home?settings=channels#panel",
    );
    strictEqual(
      withoutSlackTicket("https://app.test/?settings=channels"),
      "/?settings=channels",
    );
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
    deepStrictEqual(cleaned, ["/home?settings=channels#panel"]);
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
    deepStrictEqual(cleaned, ["/?settings=channels"]);
  });
  it("leaves a URL carrying no ticket exactly as it is", () => {
    deepStrictEqual(capture("https://app.test/?settings=channels").cleaned, []);
    deepStrictEqual(capture("https://app.test/agents").cleaned, []);
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
