import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type SettingsLanding,
  settingsLandingFromDeepLink,
} from "../src/lib/settings-landing.ts";
import {
  createHandedLinks,
  createLandingGate,
  type HandedLinks,
  type LinkLedger,
} from "../src/lib/settings-link-gate.ts";

const ticket = "Tk7-ticket.value_~9";
const link = `houston://settings/channels?slack=${ticket}`;
const nextLink = "houston://settings/channels?slack=Second-ticket_42";

function memoryLedger(): LinkLedger & { value: string | null } {
  return {
    value: null,
    read() {
      return this.value;
    },
    write(value) {
      this.value = value;
    },
  };
}

/** One mount of the hook: its own gate, sharing the app run's handed links. */
function mount(handed: HandedLinks, ready = true) {
  const state = { ready };
  const applied: SettingsLanding[] = [];
  const reported: unknown[] = [];
  const gate = createLandingGate({
    isReady: () => state.ready,
    apply: (landing) => applied.push(landing),
    handed,
    report: (error) => reported.push(error),
  });
  const offerLink = (value: string) =>
    gate.offer({ landing: settingsLandingFromDeepLink(value), link: value });
  return { state, applied, reported, gate, offerLink };
}

const channelsWith = (value: string): SettingsLanding => ({
  kind: "settings",
  section: "channels",
  slack: { kind: "ticket", ticket: value },
});

describe("handing over a settings link", () => {
  it("holds a link that arrived before sign-in and applies it once ready", async () => {
    const shell = mount(
      createHandedLinks(memoryLedger(), () => {}),
      false,
    );
    await shell.offerLink(link);
    deepStrictEqual(shell.applied, []);
    shell.state.ready = true;
    await shell.gate.flush();
    await shell.gate.flush();
    deepStrictEqual(shell.applied, [channelsWith(ticket)]);
  });

  it("hands the launching link once when the cold read and the listener both carry it", async () => {
    const shell = mount(createHandedLinks(memoryLedger(), () => {}));
    await Promise.all([shell.offerLink(link), shell.offerLink(link)]);
    deepStrictEqual(shell.applied, [channelsWith(ticket)]);
  });

  it("drops the same launching link on a remount, before Settings opens", async () => {
    const handed = createHandedLinks(memoryLedger(), () => {});
    await mount(handed).offerLink(link);
    const remounted = mount(handed);
    await remounted.offerLink(link);
    deepStrictEqual(remounted.applied, []);
    deepStrictEqual(remounted.reported, []);
  });

  it("drops it after a webview reload too, remembering only a digest", async () => {
    const ledger = memoryLedger();
    await mount(createHandedLinks(ledger, () => {})).offerLink(link);
    const reloaded = mount(createHandedLinks(ledger, () => {}));
    await reloaded.offerLink(link);
    deepStrictEqual(reloaded.applied, []);
    const stored: unknown = JSON.parse(ledger.value ?? "null");
    ok(Array.isArray(stored));
    strictEqual(stored.length, 1);
    ok(/^[0-9a-f]{64}$/.test(String(stored[0])));
    ok(!ledger.value?.includes(ticket));
  });

  it("hands a new ticket that arrives after a spent one", async () => {
    const handed = createHandedLinks(memoryLedger(), () => {});
    const shell = mount(handed);
    await shell.offerLink(link);
    await shell.offerLink(nextLink);
    deepStrictEqual(shell.applied, [
      channelsWith(ticket),
      channelsWith("Second-ticket_42"),
    ]);
  });

  it("applies the web callback, which carries no link, without a claim", async () => {
    const claims: string[] = [];
    const shell = mount({
      claim: async (value) => {
        claims.push(value);
        return false;
      },
    });
    await shell.gate.offer({ landing: channelsWith(ticket), link: null });
    deepStrictEqual(shell.applied, [channelsWith(ticket)]);
    deepStrictEqual(claims, []);
  });

  it("keeps the boot landing for a remount until a mount applies it", async () => {
    const handed = createHandedLinks(memoryLedger(), () => {});
    let acks = 0;
    const boot = {
      landing: channelsWith(ticket),
      link: null,
      applied: () => acks++,
    };
    // The shell remounts before sign-in: the held offer dies unapplied.
    const first = mount(handed, false);
    await first.gate.offer(boot);
    strictEqual(acks, 0);
    const second = mount(handed);
    await second.gate.offer(boot);
    deepStrictEqual(first.applied, []);
    deepStrictEqual(second.applied, [channelsWith(ticket)]);
    strictEqual(acks, 1);
  });

  it("opens Channels every time the bare failure-page link is clicked", async () => {
    const handed = createHandedLinks(memoryLedger(), () => {});
    const bare = "houston://settings/channels";
    const shell = mount(handed);
    await shell.offerLink(bare);
    await shell.offerLink(bare);
    const remounted = mount(handed);
    await remounted.offerLink(bare);
    const channels: SettingsLanding = {
      kind: "settings",
      section: "channels",
      slack: null,
    };
    deepStrictEqual(shell.applied, [channels, channels]);
    deepStrictEqual(remounted.applied, [channels]);
  });

  it("replaces a corrupt ledger instead of failing every claim", async () => {
    const ledger = memoryLedger();
    ledger.value = "{not json";
    const reported: unknown[] = [];
    const shell = mount(createHandedLinks(ledger, (e) => reported.push(e)));
    await shell.offerLink(link);
    deepStrictEqual(shell.applied, [channelsWith(ticket)]);
    strictEqual(reported.length, 1);
    ok(reported[0] instanceof SyntaxError);
    const stored: unknown = JSON.parse(String(ledger.value));
    ok(Array.isArray(stored) && stored.length === 1);
  });

  it("shows a malformed ticket's error once per app run", async () => {
    const handed = createHandedLinks(memoryLedger(), () => {});
    const malformed = "houston://settings/channels?slack=x";
    const shell = mount(handed);
    await shell.offerLink(malformed);
    await shell.offerLink(malformed);
    const remounted = mount(handed);
    await remounted.offerLink(malformed);
    deepStrictEqual(shell.applied, [
      { kind: "settings", section: "channels", slack: { kind: "invalid" } },
    ]);
    deepStrictEqual(remounted.applied, []);
  });

  it("ignores a link that is not a channels landing", async () => {
    const shell = mount(createHandedLinks(memoryLedger(), () => {}));
    await shell.offerLink("houston://settings/plan");
    deepStrictEqual(shell.applied, []);
  });

  it("still hands the link once and reports when storage refuses", async () => {
    const reported: unknown[] = [];
    const refusal = new Error("storage is full");
    const handed = createHandedLinks(
      {
        read: () => null,
        write: () => {
          throw refusal;
        },
      },
      (error) => reported.push(error),
    );
    const shell = mount(handed);
    await shell.offerLink(link);
    await mount(handed).offerLink(link);
    deepStrictEqual(shell.applied, [channelsWith(ticket)]);
    deepStrictEqual(reported, [refusal]);
  });
});
