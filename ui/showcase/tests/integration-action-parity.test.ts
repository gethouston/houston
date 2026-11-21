import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  humanizeActionDone,
  humanizeActionGerund,
} from "@houston-ai/chat/src/action-labels.ts";
import { humanizeIntegrationAction } from "@houston-ai/skills/src/integration-action.ts";

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
