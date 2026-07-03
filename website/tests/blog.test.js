import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isoDate,
  isoDateOnly,
  readableDate,
  readingTimeMinutes,
} from "../lib/blog.js";

test("readingTimeMinutes never returns 0", () => {
  assert.equal(readingTimeMinutes(""), 1);
  assert.equal(readingTimeMinutes(null), 1);
  assert.equal(readingTimeMinutes("a few words only"), 1);
});

test("readingTimeMinutes strips HTML and rounds to whole minutes", () => {
  const words440 = Array(440).fill("word").join(" ");
  assert.equal(readingTimeMinutes(`<p>${words440}</p>`), 2);
  const words660 = Array(660).fill("word").join(" ");
  assert.equal(readingTimeMinutes(words660), 3);
});

test("readingTimeMinutes does not count markup as words", () => {
  const html = "<div class='x'><span>one two three</span></div>";
  assert.equal(readingTimeMinutes(html), 1);
});

test("readableDate formats in UTC regardless of machine timezone", () => {
  assert.equal(readableDate(new Date("2026-07-02T00:00:00Z")), "July 2, 2026");
  assert.equal(readableDate("2026-01-15"), "January 15, 2026");
});

test("isoDate emits full ISO 8601", () => {
  assert.equal(isoDate("2026-07-02"), "2026-07-02T00:00:00.000Z");
});

test("isoDateOnly emits the calendar date", () => {
  assert.equal(isoDateOnly(new Date("2026-07-02T10:30:00Z")), "2026-07-02");
});

test("date helpers throw on invalid dates instead of emitting garbage", () => {
  assert.throws(() => isoDate("not-a-date"));
  assert.throws(() => readableDate(undefined));
});
