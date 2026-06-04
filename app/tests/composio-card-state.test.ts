import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  deriveComposioCardView,
  fallbackLogo,
  isToolkitConnected,
  parseComposioToolkitFromHref,
  resolveComposioApp,
  shouldSendConnectedFollowup,
  type ConnectedFollowupInput,
} from "../src/components/composio-card-state.ts";
import {
  extractComposioToolkits,
  isWaitingForToolkits,
} from "../src/components/composio-waiting.ts";
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

describe("extractComposioToolkits (issue #412: end-of-message hand-off line)", () => {
  it("pulls the toolkit slug out of a markdown connect link", () => {
    deepStrictEqual(
      extractComposioToolkits(
        "Let's hook up Gmail: [Connect Gmail](https://composio.dev/c#houston_toolkit=gmail) and we're set.",
      ),
      ["gmail"],
    );
  });

  it("collects multiple distinct toolkits in first-seen order", () => {
    deepStrictEqual(
      extractComposioToolkits(
        "[Connect Gmail](https://x/#houston_toolkit=gmail) then " +
          "[Connect Slack](https://x/#houston_toolkit=slack).",
      ),
      ["gmail", "slack"],
    );
  });

  it("dedupes and normalizes repeated / mis-cased links", () => {
    // Two links to the same app (different casing) collapse to one slug, so
    // the footer never double-counts a single integration.
    deepStrictEqual(
      extractComposioToolkits(
        "[here](https://x/#houston_toolkit=GoogleDrive) or " +
          "[here](https://x/#houston_toolkit=googledrive)",
      ),
      ["googledrive"],
    );
  });

  it("reads the slug through an optional markdown link title", () => {
    deepStrictEqual(
      extractComposioToolkits(
        '[Connect](https://x/#houston_toolkit=notion "Open Notion auth")',
      ),
      ["notion"],
    );
  });

  it("ignores a bare / auto-linked URL (renders as plain text, not a card)", () => {
    // The link renderer only turns a real `[label](href)` link into a card;
    // a raw URL stays plain text. The footer must mirror that, so a bare
    // connect URL contributes no toolkit.
    deepStrictEqual(
      extractComposioToolkits(
        "https://composio.dev/c#houston_toolkit=gmail",
      ),
      [],
    );
  });

  it("ignores ordinary markdown links that are not connect URLs", () => {
    deepStrictEqual(
      extractComposioToolkits("See [the docs](https://example.com/guide)."),
      [],
    );
  });

  it("returns an empty list when the message links nothing", () => {
    deepStrictEqual(extractComposioToolkits("All done, no integrations."), []);
  });
});

describe("isWaitingForToolkits (issue #412: when the line shows)", () => {
  it("waits while any linked toolkit is not connected", () => {
    // The agent linked an app and paused; idle and connecting both read as
    // not-connected, so the line stays up until the connection lands.
    strictEqual(isWaitingForToolkits(["slack"], new Set(["gmail"])), true);
  });

  it("clears once every linked toolkit is connected (agent can resume)", () => {
    strictEqual(
      isWaitingForToolkits(["gmail", "slack"], new Set(["gmail", "slack"])),
      false,
    );
  });

  it("still waits when one of several is connected and another is not", () => {
    strictEqual(
      isWaitingForToolkits(["gmail", "slack"], new Set(["gmail"])),
      true,
    );
  });

  it("matches connection across casing (normalized membership)", () => {
    strictEqual(isWaitingForToolkits(["GoogleDrive"], new Set(["googledrive"])), false);
  });

  it("does not wait when the message linked no integration", () => {
    strictEqual(isWaitingForToolkits([], new Set()), false);
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
