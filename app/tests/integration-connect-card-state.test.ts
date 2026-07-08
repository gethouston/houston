import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import {
  deriveConnectCardView,
  findCatalogToolkit,
  isToolkitConnected,
  normalizeToolkitSlug,
  parseToolkitFromHref,
  shouldAutoContinueConnected,
} from "../src/components/integration-connect-card-state.ts";

describe("parseToolkitFromHref", () => {
  it("extracts the slug from the prompt's canonical link shape", () => {
    strictEqual(
      parseToolkitFromHref(
        "https://gethouston.ai/connect#houston_toolkit=gmail",
      ),
      "gmail",
    );
  });

  it("accepts any base URL carrying the fragment (legacy Rust-engine links)", () => {
    strictEqual(
      parseToolkitFromHref(
        "https://connect.composio.dev/link/lk_abc#houston_toolkit=googledrive",
      ),
      "googledrive",
    );
  });

  it("returns null for ordinary links, empty slugs, and garbage", () => {
    strictEqual(parseToolkitFromHref("https://example.com/docs"), null);
    strictEqual(
      parseToolkitFromHref("https://example.com/#other_fragment=1"),
      null,
    );
    strictEqual(
      parseToolkitFromHref("https://example.com/#houston_toolkit="),
      null,
    );
    strictEqual(parseToolkitFromHref("not a url"), null);
  });
});

describe("isToolkitConnected", () => {
  const connections: IntegrationConnection[] = [
    { toolkit: "gmail", connectionId: "ca_1", status: "active" },
    { toolkit: "slack", connectionId: "ca_2", status: "pending" },
    { toolkit: "notion", connectionId: "ca_3", status: "error" },
  ];

  it("matches only ACTIVE connections", () => {
    strictEqual(isToolkitConnected(connections, "gmail"), true);
    strictEqual(isToolkitConnected(connections, "slack"), false);
    strictEqual(isToolkitConnected(connections, "notion"), false);
    strictEqual(isToolkitConnected(connections, "linear"), false);
  });

  it("normalizes the agent-authored slug (casing + whitespace)", () => {
    // The fragment is agent-authored: `GMail ` must still match the
    // catalog's `gmail`, or the card sticks on "Connect" while connected.
    strictEqual(isToolkitConnected(connections, " GMail "), true);
    strictEqual(normalizeToolkitSlug(" GoogleDrive "), "googledrive");
  });

  it("treats missing data as not connected", () => {
    strictEqual(isToolkitConnected(undefined, "gmail"), false);
  });
});

describe("findCatalogToolkit", () => {
  const catalog = [
    { slug: "gmail", name: "Gmail", logoUrl: "https://l/g.png" },
    { slug: "googlecalendar", name: "Google Calendar" },
  ];

  it("resolves casing-insensitively and misses gracefully", () => {
    deepStrictEqual(findCatalogToolkit(catalog, "GMAIL"), catalog[0]);
    strictEqual(findCatalogToolkit(catalog, "linear"), undefined);
    strictEqual(findCatalogToolkit(undefined, "gmail"), undefined);
  });
});

describe("deriveConnectCardView", () => {
  it("the real connection status always wins over the local phase", () => {
    strictEqual(deriveConnectCardView(true, true), "connected");
    strictEqual(deriveConnectCardView(true, false), "connected");
    strictEqual(deriveConnectCardView(false, true), "connecting");
    strictEqual(deriveConnectCardView(false, false), "idle");
  });
});

describe("shouldAutoContinueConnected", () => {
  const base = {
    autoContinue: true,
    isConnected: true,
    catalogSettled: true,
    alreadyFired: false,
  };

  it("advances a stepper connect step whose toolkit is already connected", () => {
    // The soft-lock repro: a mixed question+connect sequence reaches an
    // already-connected Gmail step. There is no Connect button to click, so the
    // card MUST self-report or the queued answers never send.
    strictEqual(shouldAutoContinueConnected(base), true);
  });

  it("stays passive for the inline markdown-link card (autoContinue off)", () => {
    strictEqual(
      shouldAutoContinueConnected({ ...base, autoContinue: false }),
      false,
    );
  });

  it("waits for a live connection before firing", () => {
    strictEqual(
      shouldAutoContinueConnected({ ...base, isConnected: false }),
      false,
    );
  });

  it("holds until the catalog settles so the app name is real, not the slug", () => {
    strictEqual(
      shouldAutoContinueConnected({ ...base, catalogSettled: false }),
      false,
    );
  });

  it("fires at most once per card (a user-driven connect already spoke)", () => {
    strictEqual(
      shouldAutoContinueConnected({ ...base, alreadyFired: true }),
      false,
    );
  });
});
