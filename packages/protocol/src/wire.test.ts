import { expectTypeOf, test } from "vitest";
import type { WireEvent } from "./index";

test("the protocol index re-exports the turn_start WireEvent arm", () => {
  const turnStart: WireEvent = {
    type: "turn_start",
    data: { provider: "anthropic", model: "claude-sonnet-4-6" },
  };

  expectTypeOf(turnStart).toMatchTypeOf<WireEvent>();
  // `type` is the discriminant → narrows `data` to the turn_start shape.
  if (turnStart.type === "turn_start") {
    expectTypeOf(turnStart.data).toEqualTypeOf<{
      provider: string;
      model: string;
    }>();
  }

  // @ts-expect-error — `type` is the discriminant; unknown values are not assignable
  const bad: WireEvent = { type: "not_an_event", data: null };
  void bad;
});
