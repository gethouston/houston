import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type ChannelFailure,
  silenceChannelError,
} from "../src/lib/channel-silence.ts";

const failure = (over: Partial<ChannelFailure> = {}): ChannelFailure => ({
  unavailable: false,
  refusedTicket: false,
  cancelled: false,
  ...over,
});

describe("which channel failures stay off the user's screen", () => {
  it("silences a deployment that serves no channels, on every call", () => {
    for (const call of ["list_channels", "disconnect_channel"] as const)
      strictEqual(
        silenceChannelError(call, failure({ unavailable: true })),
        true,
      );
  });
  it("silences a refused completion ticket, which has its own copy", () => {
    strictEqual(
      silenceChannelError("complete_slack", failure({ refusedTicket: true })),
      true,
    );
  });
  it("reports the same refusal from any other call, which has none", () => {
    for (const call of [
      "disconnect_channel",
      "link_slack",
      "connect_slack",
    ] as const)
      strictEqual(
        silenceChannelError(call, failure({ refusedTicket: true })),
        false,
      );
  });
  it("silences a call the user's own space switch cancelled", () => {
    strictEqual(
      silenceChannelError("link_slack", failure({ cancelled: true })),
      true,
    );
  });
  it("reports anything it has no copy for", () => {
    strictEqual(silenceChannelError("complete_slack", failure()), false);
    strictEqual(silenceChannelError("list_channels", failure()), false);
  });
});
