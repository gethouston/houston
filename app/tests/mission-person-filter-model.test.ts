import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type PersonFilterInputs,
  personFilterMode,
} from "../src/lib/mission-person-filter-model.ts";

const inputs = (
  over: Partial<PersonFilterInputs> = {},
): PersonFilterInputs => ({
  hasSession: true,
  spaces: false,
  multiplayer: false,
  teamSpace: false,
  ...over,
});

describe("personFilterMode — visibility matrix", () => {
  it("signed out: hidden, whatever the host", () => {
    strictEqual(personFilterMode(inputs({ hasSession: false })), "hidden");
    strictEqual(
      personFilterMode(
        inputs({ hasSession: false, spaces: true, teamSpace: true }),
      ),
      "hidden",
    );
  });

  it("spaces host, personal space: teaser (invite row, no Mine)", () => {
    strictEqual(
      personFilterMode(inputs({ spaces: true, teamSpace: false })),
      "teaser",
    );
  });

  it("spaces host, personal space: teaser even if multiplayer is advertised", () => {
    strictEqual(
      personFilterMode(
        inputs({ spaces: true, multiplayer: true, teamSpace: false }),
      ),
      "teaser",
    );
  });

  it("spaces host, team space: the real filter", () => {
    strictEqual(
      personFilterMode(
        inputs({ spaces: true, multiplayer: true, teamSpace: true }),
      ),
      "filter",
    );
  });

  it("spaces host, team space: real filter even without the multiplayer flag", () => {
    strictEqual(
      personFilterMode(
        inputs({ spaces: true, multiplayer: false, teamSpace: true }),
      ),
      "filter",
    );
  });

  it("legacy multiplayer host (no spaces): the real filter, as today", () => {
    strictEqual(
      personFilterMode(inputs({ spaces: false, multiplayer: true })),
      "filter",
    );
  });

  it("single-player / no-spaces host: hidden, as today", () => {
    strictEqual(
      personFilterMode(inputs({ spaces: false, multiplayer: false })),
      "hidden",
    );
  });
});
