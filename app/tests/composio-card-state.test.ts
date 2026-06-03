import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  deriveComposioCardView,
  fallbackLogo,
  isToolkitConnected,
  parseComposioToolkitFromHref,
  resolveComposioApp,
  shouldSendConnectedFollowup,
  shouldShowWaitingToConnect,
  type ConnectedFollowupInput,
} from "../src/components/composio-card-state.ts";
import type { ComposioAppEntry } from "../src/lib/tauri.ts";

const appEntry = (over: Partial<ComposioAppEntry> = {}): ComposioAppEntry => ({
  toolkit: "gmail",
  name: "Gmail",
  description: "Email",
  logo_url: "https://logos.example/gmail.png",
  categories: [],
  ...over,
});

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

describe("resolveComposioApp (card display identity)", () => {
  it("uses the catalog entry's name, description, and logo when found", () => {
    const app = resolveComposioApp("gmail", [appEntry()], "App integration");
    strictEqual(app.name, "Gmail");
    strictEqual(app.description, "Email");
    strictEqual(app.logoUrl, "https://logos.example/gmail.png");
  });

  it("matches the catalog across casing (raw fragment vs canonical slug)", () => {
    const app = resolveComposioApp(
      "GoogleDrive",
      [appEntry({ toolkit: "googledrive", name: "Google Drive" })],
      "App integration",
    );
    strictEqual(app.name, "Google Drive");
  });

  it("falls back to the favicon when the catalog entry has no logo", () => {
    const app = resolveComposioApp(
      "gmail",
      [appEntry({ logo_url: "" })],
      "App integration",
    );
    strictEqual(app.logoUrl, fallbackLogo("gmail"));
  });

  it("builds a fallback identity when the toolkit is not in the catalog", () => {
    const app = resolveComposioApp("obscureapp", [appEntry()], "App integration");
    strictEqual(app.name, "obscureapp");
    strictEqual(app.description, "App integration");
    strictEqual(app.logoUrl, fallbackLogo("obscureapp"));
  });

  it("falls back when the catalog has not loaded yet (undefined)", () => {
    const app = resolveComposioApp("gmail", undefined, "App integration");
    strictEqual(app.name, "gmail");
    strictEqual(app.description, "App integration");
  });
});

describe("shouldShowWaitingToConnect (issue #412: explicit hand-off line)", () => {
  it("shows the waiting line while idle, before the user acts", () => {
    // The agent linked an app and paused; make the hand-off explicit.
    strictEqual(shouldShowWaitingToConnect("idle"), true);
  });

  it("keeps the line up while connecting, until the connection lands", () => {
    // The auth round-trip can stall, get abandoned, or time back out to
    // idle, so the agent is still waiting; the message must not vanish.
    strictEqual(shouldShowWaitingToConnect("connecting"), true);
  });

  it("hides it only once connected (the agent can resume)", () => {
    strictEqual(shouldShowWaitingToConnect("connected"), false);
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

describe("isToolkitConnected (normalized membership)", () => {
  it("matches when the fragment slug and probe slug agree exactly", () => {
    strictEqual(isToolkitConnected(new Set(["gmail"]), "gmail"), true);
  });

  it("matches across casing: raw fragment vs lowercased probe set", () => {
    // The engine watcher detected `googledrive`; the agent authored the
    // fragment as `GoogleDrive`. Without normalization the card would stay
    // stuck on "Connecting..." forever — this is the #385 fix.
    strictEqual(isToolkitConnected(new Set(["googledrive"]), "GoogleDrive"), true);
  });

  it("matches despite stray whitespace in the fragment slug", () => {
    strictEqual(isToolkitConnected(new Set(["slack"]), "  slack "), true);
  });

  it("does not match a structurally different slug", () => {
    // Normalization only trims + lowercases; an underscore variant is a
    // genuine authoring mismatch, not something the card should paper over.
    strictEqual(isToolkitConnected(new Set(["googledrive"]), "google_drive"), false);
  });

  it("is false against an empty connected set", () => {
    strictEqual(isToolkitConnected(new Set(), "gmail"), false);
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
