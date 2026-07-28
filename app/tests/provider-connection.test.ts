import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type ProviderConnectionStatus,
  providerConnectionState,
  providerIsConnected,
  providerNotConfirmedDisconnected,
  reconnectCardShouldClear,
} from "../src/lib/provider-connection.ts";

/**
 * HOU-979 — one provider status, ONE meaning.
 *
 * The bug these pin: the same `unknown` probe meant "invisible" to the chat
 * picker's catalog, "Connected" to the AI hub's badge, and "keep the reconnect
 * card up forever" to the in-chat card. `unknown` is now a third state,
 * `checking`, everywhere.
 */

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const status = (
  over: Partial<ProviderConnectionStatus> = {},
): ProviderConnectionStatus => ({
  cli_installed: true,
  auth_state: "authenticated",
  authenticated: true,
  ...over,
});

describe("provider connection state", () => {
  it("treats a confirmed authenticated probe as connected", () => {
    strictEqual(providerConnectionState(status(), false), "connected");
    strictEqual(providerConnectionState(status(), true), "connected");
  });

  it("treats a confirmed unauthenticated probe as disconnected", () => {
    strictEqual(
      providerConnectionState(
        status({ auth_state: "unauthenticated", authenticated: false }),
        false,
      ),
      "disconnected",
    );
  });

  it("treats an UNKNOWN probe as checking, never connected and never hidden", () => {
    const unknown = status({ auth_state: "unknown", authenticated: false });
    strictEqual(providerConnectionState(unknown, false), "checking");
    strictEqual(providerConnectionState(unknown, true), "checking");
    // The exact regression: the hub used to read this as Connected.
    strictEqual(providerIsConnected(unknown), false);
    // …and the picker used to read it as disconnected, which dropped the
    // provider from the catalog entirely.
    strictEqual(
      providerConnectionState(unknown, false) === "disconnected",
      false,
    );
  });

  it("is never connected when the CLI is missing", () => {
    for (const auth of ["authenticated", "unauthenticated"] as const) {
      strictEqual(
        providerConnectionState(
          status({ cli_installed: false, auth_state: auth }),
          false,
        ),
        "disconnected",
      );
    }
  });

  it("tests UNKNOWN before the missing-CLI check — unknown is ALWAYS checking", () => {
    // Precedence, not a detail: the old picker asked "unknown?" first, and a
    // status whose auth_state is unknown is a status whose every other field is
    // a guess too. Reporting a confident `disconnected` off `cli_installed:
    // false` there would resurrect the exact "provider silently vanishes"
    // behavior the tri-state replaced.
    strictEqual(
      providerConnectionState(
        status({ cli_installed: false, auth_state: "unknown" }),
        false,
      ),
      "checking",
    );
  });

  it("maps a missing status to checking only while probing", () => {
    strictEqual(providerConnectionState(undefined, true), "checking");
    // Settled with nothing for this provider: degrade, never spin forever.
    strictEqual(providerConnectionState(undefined, false), "disconnected");
  });

  it("honors the denormalized boolean only when auth_state is absent", () => {
    strictEqual(
      providerConnectionState(
        { cli_installed: true, authenticated: true },
        false,
      ),
      "connected",
    );
    strictEqual(
      providerConnectionState(
        { cli_installed: true, authenticated: false },
        false,
      ),
      "disconnected",
    );
    // A status carrying both can never disagree with itself: auth_state wins.
    strictEqual(
      providerConnectionState(
        { cli_installed: true, authenticated: true, auth_state: "unknown" },
        false,
      ),
      "checking",
    );
  });
});

describe("the permissive read (tunnel autoreconnect / first-load gate)", () => {
  it("tolerates an unknown probe, which the connected predicate does not", () => {
    const unknown = status({ auth_state: "unknown", authenticated: false });
    strictEqual(providerNotConfirmedDisconnected(unknown), true);
    strictEqual(providerIsConnected(unknown), false);
  });

  it("still respects a CONFIRMED signed-out state", () => {
    strictEqual(
      providerNotConfirmedDisconnected(
        status({ auth_state: "unauthenticated", authenticated: false }),
      ),
      false,
    );
  });

  it("keeps the OLD lenient reading when auth_state is absent", () => {
    // The predicate this replaced was `cli_installed && auth_state !==
    // "unauthenticated"`, so a status with NO probe result was never a
    // confirmation of "signed out". Routing this case through the strict
    // derivation instead reads the denormalized `authenticated: false` as
    // disconnected — which would kill the local-model tunnel and degrade the
    // first-load gate on exactly the statuses that say nothing (HOU-979).
    strictEqual(
      providerNotConfirmedDisconnected({
        cli_installed: true,
        authenticated: false,
      }),
      true,
    );
    strictEqual(
      providerNotConfirmedDisconnected({ cli_installed: true }),
      true,
    );
    // A missing CLI is still a confirmation, exactly as the old predicate read it.
    strictEqual(
      providerNotConfirmedDisconnected({
        cli_installed: false,
        authenticated: false,
      }),
      false,
    );
    // And an absent status still confirms nothing to act on.
    strictEqual(providerNotConfirmedDisconnected(undefined), false);
  });

  it("is used only where leniency is the safe choice, never for a badge", () => {
    // Guard against it creeping back into a "Connected" surface. The two
    // sanctioned consumers are the tunnel auto-reconnect and the first-load
    // claudeAvailable gate; neither paints a connection badge.
    for (const file of [
      "../src/hooks/use-local-bridge-autoreconnect.ts",
      "../src/hooks/use-houston-init.ts",
    ]) {
      strictEqual(
        read(file).includes("providerNotConfirmedDisconnected"),
        true,
        `${file} uses the permissive read`,
      );
    }
    // The hub's badge + the picker mapping must use the strict derivation.
    strictEqual(
      read("../src/hooks/use-provider-connections.ts").includes(
        "providerNotConfirmedDisconnected",
      ),
      false,
      "the hub never uses the permissive read",
    );
    strictEqual(
      read("../src/lib/chat-model-picker-map.ts").includes(
        "providerConnectionState",
      ),
      true,
      "the picker maps through the shared derivation",
    );
  });
});

describe("reconnect card clear rule", () => {
  it("clears on a fresh probe that CONFIRMS the provider is connected", () => {
    strictEqual(reconnectCardShouldClear({ ok: true, status: status() }), true);
  });

  it("does not clear on a confirmed signed-out probe", () => {
    strictEqual(
      reconnectCardShouldClear({
        ok: true,
        status: status({ auth_state: "unauthenticated", authenticated: false }),
      }),
      false,
    );
  });

  it("does not clear on an unknown probe, which confirms nothing", () => {
    strictEqual(
      reconnectCardShouldClear({
        ok: true,
        status: status({ auth_state: "unknown", authenticated: false }),
      }),
      false,
    );
  });

  it("does not latch on an errored probe: the NEXT confirming probe still clears", () => {
    // The reconnect-succeeded-across-an-errored-poll case. A failed probe is
    // simply skipped; it must not set any sticky state, so the following
    // confirming probe clears the card exactly as if the error never happened.
    strictEqual(reconnectCardShouldClear({ ok: false }), false);
    strictEqual(reconnectCardShouldClear({ ok: true, status: status() }), true);
  });
});
