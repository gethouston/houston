import { formatMessageTime } from "@houston-ai/board";
import { expect, test } from "vitest";

test("cards reuse Intl formatters for each locale and option set", () => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  let constructions = 0;
  Intl.DateTimeFormat = new Proxy(NativeDateTimeFormat, {
    construct(target, args) {
      constructions++;
      return new target(args[0], args[1]);
    },
  });
  try {
    const now = new Date("2026-10-27T17:00:00Z");
    const at = "2026-10-27T16:00:00Z";
    for (let i = 0; i < 20; i++) formatMessageTime(at, "en-GB", undefined, now);
    expect(constructions).toBe(2);
    formatMessageTime(at, "es", undefined, now);
    expect(constructions).toBe(4);
    formatMessageTime(at, "en-GB", undefined, now, "medium");
    expect(constructions).toBe(5);
  } finally {
    Intl.DateTimeFormat = NativeDateTimeFormat;
  }
});
