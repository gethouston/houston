import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatLastMessageTime } from "../src/lib/message-time.ts";

process.env.TZ = "UTC";
const now = new Date("2026-10-27T17:00:00.000Z");
const cases = [
  {
    lang: "en",
    expected: ["Now", "4:25 PM", "Yesterday", "Sun", "Oct 12", "Oct 2025"],
    yearBoundary: ["Jan 2", "Dec 2026"],
    full: "Tuesday, October 27, 2026 at 4:25 PM",
    monday: "Mon",
  },
  {
    lang: "es",
    expected: ["Ahora", "16:25", "Ayer", "dom", "12 oct", "oct 2025"],
    yearBoundary: ["2 ene", "dic 2026"],
    full: "martes, 27 de octubre de 2026, 16:25",
    monday: "lun",
  },
  {
    lang: "pt",
    expected: ["Agora", "16:25", "Ontem", "dom", "12 de out.", "out. de 2025"],
    yearBoundary: ["2 de jan.", "dez. de 2026"],
    full: "terça-feira, 27 de outubro de 2026 às 16:25",
    monday: "seg",
  },
];
const dates = [
  "2026-10-27T16:59:30.000Z",
  "2026-10-27T16:25:00.000Z",
  "2026-10-26T16:25:00.000Z",
  "2026-10-25T16:25:00.000Z",
  "2026-10-12T16:25:00.000Z",
  "2025-10-12T16:25:00.000Z",
];

for (const { lang, expected, yearBoundary, full, monday } of cases) {
  describe(`last message time in ${lang}`, () => {
    const locale: { time: { now: string; yesterday: string } } = JSON.parse(
      readFileSync(
        new URL(`../src/locales/${lang}/board.json`, import.meta.url),
        "utf8",
      ),
    );
    it("uses translated words, today's clock, weekdays and dates", () => {
      assert.deepEqual(
        dates.map(
          (iso) => formatLastMessageTime(iso, lang, locale.time, now).short,
        ),
        expected,
      );
      assert.equal(
        formatLastMessageTime(
          "2026-10-26T16:25:00.000Z",
          lang,
          locale.time,
          new Date("2026-10-28T17:00:00.000Z"),
        ).short,
        monday,
      );
    });
    it("drops the day once a message falls in another year", () => {
      const january = new Date("2027-01-20T12:00:00.000Z");
      assert.deepEqual(
        ["2027-01-02T12:00:00.000Z", "2026-12-31T12:00:00.000Z"].map(
          (iso) => formatLastMessageTime(iso, lang, locale.time, january).short,
        ),
        yearBoundary,
      );
      assert.equal(
        formatLastMessageTime(
          "2025-12-03T12:00:00.000Z",
          lang,
          locale.time,
          january,
        ).full.includes("2025"),
        true,
      );
    });
    it("provides the full date and short clock time for tooltips and detail", () => {
      assert.equal(
        formatLastMessageTime(
          "2026-10-27T16:25:00.000Z",
          lang,
          locale.time,
          now,
        ).full,
        full,
      );
    });
  });
}

it("changes from Now at exactly a minute and from weekday at seven calendar days", () => {
  const words = { now: "Now", yesterday: "Yesterday" };
  assert.equal(
    formatLastMessageTime("2026-10-27T16:59:00.000Z", "en", words, now).short,
    "4:59 PM",
  );
  assert.equal(
    formatLastMessageTime("2026-10-21T16:25:00.000Z", "en", words, now).short,
    "Wed",
  );
  assert.equal(
    formatLastMessageTime("2026-10-20T16:25:00.000Z", "en", words, now).short,
    "Oct 20",
  );
  assert.equal(
    formatLastMessageTime(
      "2026-10-26T23:59:00.000Z",
      "en",
      words,
      new Date("2026-10-27T00:01:00.000Z"),
    ).short,
    "Yesterday",
  );
});

it("uses local calendar days across a daylight-saving transition", () => {
  process.env.TZ = "America/New_York";
  try {
    for (const [at, today] of [
      ["2026-11-01T23:30:00-05:00", "2026-11-02T00:15:00-05:00"],
      ["2026-03-08T00:30:00-05:00", "2026-03-09T00:15:00-04:00"],
    ]) {
      assert.equal(
        formatLastMessageTime(
          at,
          "en",
          { now: "Now", yesterday: "Yesterday" },
          new Date(today),
        ).short,
        "Yesterday",
      );
    }
  } finally {
    process.env.TZ = "UTC";
  }
});

it("bounds the future clock-skew allowance at five minutes", () => {
  const words = { now: "Now", yesterday: "Yesterday" };
  for (const [iso, expected] of [
    ["2026-10-27T17:05:00.000Z", "Now"],
    ["2026-10-27T17:05:01.000Z", "Oct 27"],
    ["2026-10-28T17:00:00.000Z", "Oct 28"],
    ["2027-10-27T17:00:00.000Z", "Oct 2027"],
  ])
    assert.equal(formatLastMessageTime(iso, "en", words, now).short, expected);
});
