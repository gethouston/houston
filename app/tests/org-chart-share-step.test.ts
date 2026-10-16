// The share dialog's primary button through each state the person can meet:
// no LinkedIn on the deployment, connect then post, a post made, LinkedIn
// dropping the connection, and the phone's share sheet.

import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  linkedInConnectPollMs,
  linkedInRefusalAction,
  startLinkedInConnectWatch,
} from "@houston/sdk/linkedin/policy";
import { shareRoute } from "../src/components/organization/org-chart-share-run.ts";
import {
  INITIAL_SHARE_DIALOG,
  type ShareDialogState,
  shareDialogReducer,
} from "../src/components/organization/org-chart-share-state.ts";
import {
  type ConnectionRead,
  type ConnectPhase,
  connectionRead,
  shareStep,
} from "../src/components/organization/org-chart-share-step.ts";

const PNG = new File(["png"], "acme-org-chart.png", { type: "image/png" });
const POST_URL = "https://www.linkedin.com/feed/update/urn:li:share:7/";
const desktop = {
  tauri: false,
  nativeMobile: false,
  coarse: false,
  sheet: undefined,
  image: PNG,
};
const ready = (connected: boolean): ConnectionRead => ({
  status: "ready",
  connection: connected
    ? { connected: true, name: "Ada", expiresAt: "2026-12-01T00:00:00Z" }
    : { connected: false },
});

/** As `useLinkedInPost` reads the attempt. */
const phaseOf = (state: ShareDialogState): ConnectPhase =>
  !state.connect ? "idle" : state.connect.minting ? "minting" : "waiting";

const step = (
  linkedin: boolean,
  state: ShareDialogState,
  connection: ConnectionRead,
  env = desktop,
  posting = false,
) =>
  shareStep({
    route: shareRoute({ ...env, linkedin }).kind,
    connection,
    connecting: phaseOf(state),
    posting,
    postUrl: state.postUrl,
  });

const opened = shareDialogReducer(INITIAL_SHARE_DIALOG, { type: "open" });

describe("the share dialog's primary button", () => {
  it("shares by copy and paste where the deployment has no LinkedIn", () => {
    deepStrictEqual(step(false, opened, { status: "pending" }), {
      kind: "share",
      via: "paste",
    });
  });

  it("keeps the connection on screen when only a background refetch failed", () => {
    const connection = {
      connected: true as const,
      name: "Ada",
      expiresAt: "2026-12-01T00:00:00Z",
    };
    deepStrictEqual(connectionRead({ data: connection, isError: true }), {
      status: "ready",
      connection,
    });
    deepStrictEqual(connectionRead({ data: undefined, isError: true }), {
      status: "error",
    });
    deepStrictEqual(connectionRead({ data: undefined, isError: false }), {
      status: "pending",
    });
  });

  it("falls back to copy and paste when the connection cannot be read", () => {
    deepStrictEqual(step(true, opened, { status: "error" }), {
      kind: "share",
      via: "paste",
    });
    deepStrictEqual(step(true, opened, { status: "pending" }), {
      kind: "checking",
    });
  });

  it("connects, polls while LinkedIn's window is open, then posts", () => {
    deepStrictEqual(step(true, opened, ready(false)), {
      kind: "connect",
      phase: "idle",
    });
    const watch = startLinkedInConnectWatch(0);
    const tag = { session: opened.session, attempt: 1 };
    const minting = shareDialogReducer(opened, {
      type: "connecting",
      ...tag,
      watch,
    });
    // Busy from the click on: a second click cannot mint a second state.
    deepStrictEqual(step(true, minting, ready(false)), {
      kind: "connect",
      phase: "minting",
    });
    const connecting = shareDialogReducer(minting, {
      type: "connectOpened",
      ...tag,
    });
    deepStrictEqual(step(true, connecting, ready(false)), {
      kind: "connect",
      phase: "waiting",
    });
    deepStrictEqual(
      linkedInConnectPollMs(watch, { connected: false }, 1),
      2_000,
    );
    // The poll reads connected: it stops, and the button becomes Post.
    const landed = ready(true);
    deepStrictEqual(
      linkedInConnectPollMs(
        watch,
        landed.status === "ready" ? landed.connection : undefined,
        2_000,
      ),
      false,
    );
    const ended = shareDialogReducer(connecting, {
      type: "connectEnded",
      ...tag,
    });
    deepStrictEqual(step(true, ended, landed), {
      kind: "post",
      name: "Ada",
      posting: false,
    });
    // The space's post slot says a post is out.
    const posting = shareDialogReducer(ended, { type: "posting" });
    deepStrictEqual(step(true, posting, landed, desktop, true), {
      kind: "post",
      name: "Ada",
      posting: true,
    });
  });

  it("offers View post once the post is up", () => {
    const posting = shareDialogReducer(opened, { type: "posting" });
    const posted = shareDialogReducer(posting, {
      type: "posted",
      postUrl: POST_URL,
    });
    deepStrictEqual(step(true, posted, ready(true)), {
      kind: "posted",
      postUrl: POST_URL,
    });
  });

  it("goes back to Connect, saying so, when LinkedIn dropped the connection", () => {
    const posting = shareDialogReducer(opened, { type: "posting" });
    deepStrictEqual(
      linkedInRefusalAction("linkedin_not_connected"),
      "reconnect",
    );
    const refused = shareDialogReducer(posting, {
      type: "postRefused",
      line: { kind: "reconnect" },
    });
    // The surface marks the cached connection disconnected.
    deepStrictEqual(step(true, refused, ready(false)), {
      kind: "connect",
      phase: "idle",
    });
    deepStrictEqual(refused.line, { kind: "reconnect" });
  });

  it("keeps the share sheet on phones and iPads, LinkedIn or not", () => {
    const phone = {
      tauri: false,
      nativeMobile: false,
      coarse: true,
      sheet: { canShare: () => true, share: async () => {} },
      image: PNG,
    };
    for (const linkedin of [true, false])
      deepStrictEqual(step(linkedin, opened, ready(true), phone), {
        kind: "share",
        via: "sheet",
      });
  });

  it("copies and pastes in the iOS or Android app with no file share sheet, never connecting", () => {
    const app = { ...desktop, nativeMobile: true, coarse: true };
    for (const connection of [ready(false), ready(true)])
      deepStrictEqual(step(true, opened, connection, app), {
        kind: "share",
        via: "paste",
      });
  });
});
