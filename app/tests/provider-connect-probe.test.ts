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
    const card = read(
      "../src/components/chat-provider-connect-interaction-card.tsx",
    );
    strictEqual(card.includes("{flow.probing && <Loader2"), true);
    strictEqual(card.includes('flow.state === "checking"'), false);
  });
});
