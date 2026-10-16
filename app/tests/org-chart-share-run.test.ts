import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isExpectedClipboardRefusal } from "../src/components/organization/org-chart-share-copy.ts";
import {
  NO_LANDING,
  type ShareSheet,
  shareRoute,
  shareViaSheet,
} from "../src/components/organization/org-chart-share-run.ts";

const PNG = new File(["png"], "acme-org-chart.png", { type: "image/png" });

const sheet = (
  share: ShareSheet["share"] = async () => {},
  canShare = true,
): ShareSheet => ({ canShare: () => canShare, share });

describe("shareRoute", () => {
  const env = {
    tauri: false,
    nativeMobile: false,
    coarse: true,
    sheet: sheet(),
    image: PNG,
    linkedin: true,
  };

  it("keeps the share sheet on phones and iPads whose sheet takes the picture, even where Houston can post", () => {
    strictEqual(shareRoute(env).kind, "sheet");
    // Before the picture is drawn, a sheet that exists is assumed to take it.
    strictEqual(shareRoute({ ...env, image: null }).kind, "sheet");
  });

  it("posts where the deployment can, on a desktop or a touch device with no sheet for files", () => {
    for (const overrides of [
      { coarse: false },
      { sheet: undefined },
      { sheet: sheet(async () => {}, false) },
      { tauri: true },
    ])
      strictEqual(shareRoute({ ...env, ...overrides }).kind, "post");
  });

  it("never posts from the iOS or Android app: its sheet, or copy and paste", () => {
    strictEqual(shareRoute({ ...env, nativeMobile: true }).kind, "sheet");
    for (const overrides of [
      { sheet: undefined },
      { sheet: sheet(async () => {}, false) },
      { coarse: false },
    ])
      strictEqual(
        shareRoute({ ...env, nativeMobile: true, ...overrides }).kind,
        "paste",
      );
  });

  it("copies and pastes where the deployment cannot post", () => {
    strictEqual(
      shareRoute({ ...env, coarse: false, linkedin: false }).kind,
      "paste",
    );
    strictEqual(
      shareRoute({ ...env, tauri: true, linkedin: false }).kind,
      "paste",
    );
  });
});

describe("shareViaSheet", () => {
  const run = (share: ShareSheet["share"]) => {
    const reports: string[] = [];
    const landing = shareViaSheet(sheet(share), PNG, "post", (command) =>
      reports.push(command),
    );
    return { landing, reports };
  };

  it("hands the picture and the post to the sheet, and tracks it", async () => {
    let handed: { files: File[]; text: string } | null = null;
    const { landing } = run(async (data) => {
      handed = data;
    });
    strictEqual((await landing).channel, "native");
    deepStrictEqual(handed, { files: [PNG], text: "post" });
  });

  it("treats closing the sheet, or a second tap while it is up, as quiet", async () => {
    for (const name of ["AbortError", "InvalidStateError"]) {
      const { landing, reports } = run(() =>
        Promise.reject(new DOMException("x", name)),
      );
      deepStrictEqual(await landing, NO_LANDING);
      deepStrictEqual(reports, []);
    }
  });

  it("reports a sheet that failed for another reason", async () => {
    const { landing, reports } = run(() => Promise.reject(new Error("boom")));
    deepStrictEqual(await landing, NO_LANDING);
    deepStrictEqual(reports, ["org_chart_share_native"]);
  });
});

describe("isExpectedClipboardRefusal", () => {
  it("is only the browser's NotAllowedError", () => {
    strictEqual(
      isExpectedClipboardRefusal(new DOMException("x", "NotAllowedError")),
      true,
    );
    strictEqual(isExpectedClipboardRefusal(new Error("boom")), false);
    strictEqual(isExpectedClipboardRefusal(null), false);
  });
});
