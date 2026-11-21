import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { postAndOpen } from "../src/components/organization/linkedin-post-open.ts";
import type { LinkedInPostOutcome } from "../src/components/organization/linkedin-post-run.ts";
import { shareLineKey } from "../src/components/organization/org-chart-share-line-copy.ts";
import type { ShareLine } from "../src/components/organization/org-chart-share-run.ts";
import {
  INITIAL_SHARE_DIALOG,
  type ShareDialogAction,
  type ShareDialogState,
  shareDialogReducer,
} from "../src/components/organization/org-chart-share-state.ts";
import {
  postsThroughApi,
  primaryVariant,
  type ShareStep,
  shareStep,
} from "../src/components/organization/org-chart-share-step.ts";
import { UrlOpenError } from "../src/lib/url-open-failure.ts";
import en from "../src/locales/en/teams.json" with { type: "json" };

const POST_URL = "https://www.linkedin.com/feed/update/urn:li:share:7/";
const POSTED: LinkedInPostOutcome = { kind: "posted", postUrl: POST_URL };
const connected = {
  status: "ready",
  connection: {
    connected: true,
    name: "Ada",
    expiresAt: "2026-12-01T00:00:00Z",
  },
} as const;

function dialog(
  browser: { mayOpen?: boolean; open?: (url: string) => Promise<boolean> } = {},
) {
  let state = shareDialogReducer(INITIAL_SHARE_DIALOG, { type: "open" });
  const dispatch = (action: ShareDialogAction) => {
    state = shareDialogReducer(state, action);
  };
  const opened: string[] = [];
  const reported: unknown[] = [];
  const ports = {
    onScreen: () => (state.open ? state.session : null),
    mayOpen: () => browser.mayOpen ?? true,
    open: (url: string) => {
      opened.push(url);
      return browser.open ? browser.open(url) : Promise.resolve(true);
    },
    report: (error: unknown) => reported.push(error),
    dispatch,
  };
  return {
    get state(): ShareDialogState {
      return state;
    },
    dispatch,
    opened,
    reported,
    post: (outcome: LinkedInPostOutcome | null, during = () => {}) =>
      postAndOpen(async () => {
        during();
        if (outcome?.kind === "posted")
          dispatch({ type: "posted", postUrl: outcome.postUrl });
        return outcome;
      }, ports),
  };
}

const stepOf = (state: ShareDialogState) =>
  shareStep({
    route: "post",
    connection: connected,
    connecting: "idle",
    posting: false,
    posted: state.posted,
  });

const words = (line: ShareLine | null) => {
  if (line?.kind !== "posted") return null;
  const key = shareLineKey(line).replace("orgChart.share.", "");
  return en.orgChart.share[key as "posted" | "postedOpened"];
};

describe("the post this opening made", () => {
  it("opens once, and View post steps back with the line saying so", async () => {
    const d = dialog();
    const outcome = await d.post(POSTED);
    d.dispatch({ type: "posted", postUrl: POST_URL });

    deepStrictEqual(outcome, POSTED);
    deepStrictEqual(d.opened, [POST_URL]);
    deepStrictEqual(stepOf(d.state), {
      kind: "posted",
      postUrl: POST_URL,
      opened: true,
    });
    strictEqual(primaryVariant(stepOf(d.state)), "outline");
    strictEqual(
      words(d.state.line),
      "Posted to LinkedIn. It's open in your browser.",
    );
  });

  it("keeps View post leading when the browser refused the open", async () => {
    const d = dialog({ open: async () => false });
    await d.post(POSTED);

    deepStrictEqual(d.opened, [POST_URL]);
    strictEqual(primaryVariant(stepOf(d.state)), "default");
    strictEqual(words(d.state.line), "Posted to LinkedIn.");
  });

  it("is not opened once the click's activation lapsed (no popup warning)", async () => {
    const d = dialog({ mayOpen: false });
    await d.post(POSTED);

    deepStrictEqual(d.opened, []);
    deepStrictEqual(d.state.posted, { postUrl: POST_URL, opened: false });
    strictEqual(primaryVariant(stepOf(d.state)), "default");
    strictEqual(words(d.state.line), "Posted to LinkedIn.");
  });

  it("says nothing and reports nothing on a machine with no browser", async () => {
    const noBrowser = new UrlOpenError({ kind: "no_handler", message: "31" });
    const d = dialog({ open: () => Promise.reject(noBrowser) });
    await d.post(POSTED);

    deepStrictEqual(d.reported, []);
    deepStrictEqual(d.state.posted, { postUrl: POST_URL, opened: false });
  });

  it("reports an unexpected failed open, once, and keeps View post leading", async () => {
    const broke = new UrlOpenError({ kind: "other", message: "spawn EACCES" });
    const d = dialog({ open: () => Promise.reject(broke) });
    await d.post(POSTED);

    deepStrictEqual(d.reported, [broke]);
    deepStrictEqual(d.state.posted, { postUrl: POST_URL, opened: false });
    strictEqual(words(d.state.line), "Posted to LinkedIn.");
  });

  const unposted: [string, LinkedInPostOutcome | null][] = [
    ["may be up", { kind: "unconfirmed" }],
    ["was refused", { kind: "refused", code: "rate_limited" }],
    ["failed", { kind: "failed" }],
    ["settled after a sign-out", null],
  ];
  for (const [what, outcome] of unposted)
    it(`opens nothing when the post ${what}`, async () => {
      const d = dialog();
      strictEqual(await d.post(outcome), outcome);
      deepStrictEqual(d.opened, []);
      strictEqual(d.state.posted, null);
    });

  it("opens nothing once the dialog closed before it went up", async () => {
    const d = dialog();
    await d.post(POSTED, () => d.dispatch({ type: "close" }));

    deepStrictEqual(d.opened, []);
  });

  it("drops the opened line when the dialog closed while the browser opened", async () => {
    let take = (_: boolean) => {};
    const d = dialog({
      open: () =>
        new Promise((resolve) => {
          take = resolve;
        }),
    });
    const posting = d.post(POSTED);
    await new Promise((settle) => setImmediate(settle));
    d.dispatch({ type: "close" });
    d.dispatch({ type: "open" });
    take(true);
    await posting;

    deepStrictEqual(d.opened, [POST_URL]);
    strictEqual(d.state.posted, null);
    strictEqual(d.state.line, null);
  });
});

describe("a post replayed into another opening", () => {
  it("is shown without opening, View post leading", async () => {
    const d = dialog();
    await d.post(POSTED, () => {
      d.dispatch({ type: "close" });
      d.dispatch({ type: "open" });
    });

    deepStrictEqual(d.opened, []);
    deepStrictEqual(d.state.posted, { postUrl: POST_URL, opened: false });
    strictEqual(primaryVariant(stepOf(d.state)), "default");
    strictEqual(words(d.state.line), "Posted to LinkedIn.");
  });
});

describe("how loudly the primary button asks", () => {
  const cases: [ShareStep, "default" | "outline"][] = [
    [{ kind: "share", via: "sheet" }, "default"],
    [{ kind: "share", via: "paste" }, "default"],
    [{ kind: "checking" }, "default"],
    [{ kind: "connect", phase: "idle" }, "outline"],
    [{ kind: "connect", phase: "minting" }, "outline"],
    [{ kind: "connect", phase: "waiting" }, "outline"],
    [{ kind: "post", name: "Ada", posting: false }, "default"],
    [{ kind: "post", name: "Ada", posting: true }, "default"],
    [{ kind: "posted", postUrl: POST_URL, opened: false }, "default"],
    [{ kind: "posted", postUrl: POST_URL, opened: true }, "outline"],
  ];
  for (const [step, variant] of cases)
    it(`${JSON.stringify(step)} is ${variant}`, () => {
      strictEqual(primaryVariant(step), variant);
    });
});

describe("the privacy notice beside the words", () => {
  const cases: [ShareStep, boolean][] = [
    [{ kind: "share", via: "sheet" }, false],
    [{ kind: "share", via: "paste" }, false],
    [{ kind: "checking" }, true],
    [{ kind: "connect", phase: "idle" }, true],
    [{ kind: "post", name: "Ada", posting: false }, true],
    [{ kind: "posted", postUrl: POST_URL, opened: false }, true],
  ];
  for (const [step, shown] of cases)
    it(`${JSON.stringify(step)} ${shown ? "shows" : "hides"} it`, () => {
      strictEqual(postsThroughApi(step), shown);
    });
});
