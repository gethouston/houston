import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextReconnectNoticeChangeFor,
  providerReconnectNoticeFor,
} from "../src/lib/provider-reconnect-notice.ts";
import type { ProviderStatus } from "../src/lib/tauri.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 1, 12);

const status = (
  provider: string,
  authenticated: boolean,
  reconnectBy?: number,
): ProviderStatus => ({
  provider,
  cli_installed: true,
  auth_state: authenticated ? "authenticated" : "unauthenticated",
  authenticated,
  cli_name: provider,
  ...(reconnectBy === undefined ? {} : { reconnectBy }),
});

/**
 * The shell pill reads the probed statuses through the SDK's rule. These pin
 * the hand-off: the connected flag is the probe's `authenticated`, and only a
 * deadline inside the window shows.
 */
describe("providerReconnectNoticeFor", () => {
  it("shows the soonest connected login inside the window", () => {
    deepStrictEqual(
      providerReconnectNoticeFor(
        {
          anthropic: status("anthropic", true, now + 2.5 * DAY),
          openai: status("openai", true),
        },
        now,
      ),
      { provider: "anthropic", reconnectBy: now + 2.5 * DAY, daysLeft: 2 },
    );
  });

  it("shows nothing far from the deadline, or once the account is signed out", () => {
    strictEqual(
      providerReconnectNoticeFor(
        { anthropic: status("anthropic", true, now + 20 * DAY) },
        now,
      ),
      null,
    );
    strictEqual(
      providerReconnectNoticeFor(
        { anthropic: status("anthropic", false, now + DAY) },
        now,
      ),
      null,
    );
    strictEqual(providerReconnectNoticeFor({}, now), null);
  });

  it("names when the pill must re-read the clock", () => {
    strictEqual(
      nextReconnectNoticeChangeFor(
        { anthropic: status("anthropic", true, now + 10 * DAY) },
        now,
      ),
      now + 5 * DAY,
    );
    strictEqual(
      nextReconnectNoticeChangeFor(
        { anthropic: status("anthropic", false, now + 10 * DAY) },
        now,
      ),
      null,
    );
  });
});
