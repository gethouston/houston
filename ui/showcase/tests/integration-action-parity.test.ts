import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  humanizeActionDone,
  humanizeActionGerund,
} from "@houston-ai/chat/src/action-labels.ts";
import { humanizeIntegrationAction } from "@houston-ai/skills/src/integration-action.ts";

/**
 * The two surfaces that name a connected-app action must agree on WHICH words
 * belong to the app.
 *
 * The workflow-step chip (`@houston-ai/skills`) and the chat's process /
 * "Updates made" rows (`@houston-ai/chat`) conjugate differently on purpose —
 * a step says "Search", a running row says "Searching", a finished one says
 * "Searched" — but all three read the same slug, and a user who opens a skill
 * and then watches it run must not see the app's own name appear in one label
 * and vanish from the other. They used to: the chat matched the toolkit as a
 * literal string prefix, so a toolkit spelled `googlemaps` never matched
 * `GOOGLE_MAPS_…` and the row read "Google maps search".
 *
 * The showcase is where this can be asserted: it is the one package that
 * depends on both. The shared reading itself is
 * `@houston-ai/core`'s `actionWordsWithoutToolkit`, unit-tested there.
 */
describe("both action namers strip the same toolkit words", () => {
  const TOOLKIT = "googlemaps";
  const ACTION = "GOOGLE_MAPS_SEARCH";

  it("names the action 'search' on every surface, with the app nowhere in it", () => {
    const labels = [
      humanizeIntegrationAction(TOOLKIT, ACTION),
      humanizeActionGerund(ACTION, TOOLKIT),
      humanizeActionDone(ACTION, TOOLKIT),
    ];
    strictEqual(labels[0], "Search");
    strictEqual(labels[1], "Searching");
    strictEqual(labels[2], "Searched");
    for (const label of labels) {
      strictEqual(/google|maps/i.test(label ?? ""), false);
    }
  });

  it("agrees on the separator spelling of the same toolkit", () => {
    strictEqual(
      humanizeIntegrationAction("google_maps", ACTION),
      humanizeIntegrationAction(TOOLKIT, ACTION),
    );
    strictEqual(
      humanizeActionGerund(ACTION, "google_maps"),
      humanizeActionGerund(ACTION, TOOLKIT),
    );
  });
});
