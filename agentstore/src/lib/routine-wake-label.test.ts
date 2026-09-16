import { describe, expect, it } from "vitest";
import { exampleAgentIr } from "./export/__fixtures__/example-ir";
import { routineWakeLabel } from "./routine-wake-label";

describe("routineWakeLabel", () => {
  it("labels each wake kind in plain words, never a cron line or a slug", () => {
    expect(exampleAgentIr.routines.map(routineWakeLabel)).toEqual([
      "On a schedule",
      "When Gmail has a new event",
      "When an external app calls it",
    ]);
  });

  it("falls back to a humanized slug for an app the catalog does not know", () => {
    expect(
      routineWakeLabel({
        id: "r",
        name: "R",
        prompt: "p",
        wake: {
          kind: "composio",
          toolkit: "acme_crm",
          triggerSlug: "ACME_NEW_LEAD",
          triggerConfig: {},
        },
      }),
    ).toBe("When Acme Crm has a new event");
  });
});
