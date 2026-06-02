import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  deriveComposioCardView,
  fallbackLogo,
  parseComposioToolkitFromHref,
  shouldSendConnectedFollowup,
  type ConnectedFollowupInput,
} from "../src/components/composio-card-state.ts";

describe("deriveComposioCardView (issue #379: status badge vs action)", () => {
  it("shows the Connect CTA when not connected and idle", () => {
    strictEqual(deriveComposioCardView(false, "idle"), "idle");
  });

  it("shows the Connecting badge once the user has started a connect", () => {
    strictEqual(deriveComposioCardView(false, "connecting"), "connecting");
  });

  it("shows the Connected badge when the probe confirms a connection", () => {
    strictEqual(deriveComposioCardView(true, "idle"), "connected");
  });

  it("lets a confirmed connection win over a stale connecting phase", () => {
    // The watcher landed the connection while the local phase was still
    // mid-flight; the card must show Connected, never a spinner that masks
    // a live connection.
    strictEqual(deriveComposioCardView(true, "connecting"), "connected");
  });
});

describe("shouldSendConnectedFollowup (proactive agent nudge)", () => {
  const base: ConnectedFollowupInput = {
    wasConnected: false,
    isConnected: true,
    hasInitiated: true,
    alreadyFired: false,
  };

  it("fires once on a user-driven not-connected → connected transition", () => {
    strictEqual(shouldSendConnectedFollowup(base), true);
  });

  it("stays silent when the card mounted already connected (no transition)", () => {
    // Agent linked an app the user had connected earlier: was===is===true.
    strictEqual(
      shouldSendConnectedFollowup({ ...base, wasConnected: true }),
      false,
    );
  });

  it("stays silent when this card never initiated the connect", () => {
    // Connection landed via the Integrations tab / CLI / another agent.
    strictEqual(
      shouldSendConnectedFollowup({ ...base, hasInitiated: false }),
      false,
    );
  });

  it("never double-fires for the same connection", () => {
    strictEqual(
      shouldSendConnectedFollowup({ ...base, alreadyFired: true }),
      false,
    );
  });

  it("stays silent on a disconnect (connected → not connected)", () => {
    strictEqual(
      shouldSendConnectedFollowup({
        wasConnected: true,
        isConnected: false,
        hasInitiated: true,
        alreadyFired: false,
      }),
      false,
    );
  });

  it("keeps two integrations independent: each speaks only for itself", () => {
    // Two cards (e.g. Gmail + Google Sheets) in the same conversation. The
    // user connects Gmail first; Sheets is still connecting. Only Gmail
    // should nudge — Sheets has not transitioned yet.
    const gmail = { wasConnected: false, hasInitiated: true, alreadyFired: false };
    const sheets = { wasConnected: false, hasInitiated: true, alreadyFired: false };

    strictEqual(
      shouldSendConnectedFollowup({ ...gmail, isConnected: true }),
      true,
    );
    strictEqual(
      shouldSendConnectedFollowup({ ...sheets, isConnected: false }),
      false,
    );

    // Sheets connects on a later tick — it fires its own (single) nudge,
    // and Gmail, already fired, does not speak again.
    strictEqual(
      shouldSendConnectedFollowup({ ...sheets, isConnected: true }),
      true,
    );
    strictEqual(
      shouldSendConnectedFollowup({
        wasConnected: true,
        isConnected: true,
        hasInitiated: true,
        alreadyFired: true,
      }),
      false,
    );
  });
});

describe("parseComposioToolkitFromHref (card-vs-plain-link decision)", () => {
  it("extracts the slug from the #houston_toolkit fragment", () => {
    strictEqual(
      parseComposioToolkitFromHref(
        "https://composio.dev/connect?x=1#houston_toolkit=gmail",
      ),
      "gmail",
    );
  });

  it("reads the slug even when the fragment carries other params", () => {
    strictEqual(
      parseComposioToolkitFromHref(
        "https://composio.dev/c#foo=bar&houston_toolkit=googlesheets",
      ),
      "googlesheets",
    );
  });

  it("returns null when there is no fragment", () => {
    strictEqual(
      parseComposioToolkitFromHref("https://composio.dev/connect"),
      null,
    );
  });

  it("returns null when the fragment lacks the toolkit param", () => {
    strictEqual(
      parseComposioToolkitFromHref("https://composio.dev/c#state=abc"),
      null,
    );
  });

  it("returns null for an empty toolkit value", () => {
    strictEqual(
      parseComposioToolkitFromHref("https://composio.dev/c#houston_toolkit="),
      null,
    );
  });

  it("returns null for a non-URL string instead of throwing", () => {
    strictEqual(parseComposioToolkitFromHref("not a url"), null);
  });
});

describe("fallbackLogo", () => {
  it("builds a favicon URL keyed off the toolkit slug", () => {
    strictEqual(
      fallbackLogo("gmail"),
      "https://www.google.com/s2/favicons?domain=gmail.com&sz=128",
    );
  });
});
