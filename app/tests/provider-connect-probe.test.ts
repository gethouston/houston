import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  providerConnectEvidenceSeen,
  providerConnectProbing,
} from "../src/lib/provider-connect-probe.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("provider connect probing", () => {
  it("spins while the FIRST answer is still outstanding", () => {
    strictEqual(providerConnectProbing("checking", false), true);
  });

  it("stops the moment any evidence lands", () => {
    strictEqual(providerConnectProbing("connected", false), false);
    strictEqual(providerConnectProbing("disconnected", false), false);
  });

  it("never spins again on a probe that failed", () => {
    // The observer reports "checking" for a read that FAILED too. Spun off the
    // state alone, a card whose status call keeps failing spun forever and said
    // nothing; after the first answer the last known state simply stands.
    strictEqual(providerConnectProbing("checking", true), false);
  });
});

describe("provider connect evidence", () => {
  it("counts any settled state as evidence", () => {
    strictEqual(providerConnectEvidenceSeen(false, "connected"), true);
    strictEqual(providerConnectEvidenceSeen(false, "disconnected"), true);
  });

  it("does not count 'checking' as evidence", () => {
    strictEqual(providerConnectEvidenceSeen(false, "checking"), false);
  });

  it("never unsees evidence", () => {
    strictEqual(providerConnectEvidenceSeen(true, "checking"), true);
  });
});

describe("the provider connect card's feedback", () => {
  it("keeps the Connect pill's checking spinner, driven by the probe", () => {
    // The card lost the spinner entirely in the step-shell unification: the
    // user pressed nothing and saw nothing while the status call ran.
    const card = read(
      "../src/components/chat-provider-connect-interaction-card.tsx",
    );
    strictEqual(card.includes("{flow.probing && <Loader2"), true);
    // Off the raw state it would spin forever on a failing probe.
    strictEqual(card.includes('flow.state === "checking"'), false);
  });
});
