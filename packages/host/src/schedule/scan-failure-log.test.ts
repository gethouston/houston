import { afterEach, expect, test } from "vitest";
import {
  clearScanFailure,
  resetScanFailureLogForTests,
  SCAN_FAILURE_REPEAT_MS,
  shouldLogScanFailure,
} from "./scan-failure-log";

afterEach(resetScanFailureLogForTests);

test("a failure logs when it starts, then once an hour while its reason holds", () => {
  expect(shouldLogScanFailure("ws/a", "not valid JSON", 0)).toBe(true);
  expect(shouldLogScanFailure("ws/a", "not valid JSON", 30_000)).toBe(false);
  expect(
    shouldLogScanFailure("ws/a", "not valid JSON", SCAN_FAILURE_REPEAT_MS - 1),
  ).toBe(false);
  expect(
    shouldLogScanFailure("ws/a", "not valid JSON", SCAN_FAILURE_REPEAT_MS),
  ).toBe(true);
});

test("a changed reason and another agent log at once; a success resets the streak", () => {
  expect(shouldLogScanFailure("ws/a", "not valid JSON", 0)).toBe(true);
  expect(shouldLogScanFailure("ws/a", "ENOENT", 1_000)).toBe(true);
  expect(shouldLogScanFailure("ws/b", "ENOENT", 2_000)).toBe(true);
  clearScanFailure("ws/a");
  expect(shouldLogScanFailure("ws/a", "ENOENT", 3_000)).toBe(true);
});
