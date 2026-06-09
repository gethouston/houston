import { test, expect } from "bun:test";
import { bytesToGiB, bytesToMiB, parseCpuToCores, parseMemToBytes } from "./quantity";

test("parseCpuToCores handles milli, whole, fractional, and empty", () => {
  expect(parseCpuToCores("250m")).toBe(0.25);
  expect(parseCpuToCores("1")).toBe(1);
  expect(parseCpuToCores("1.5")).toBe(1.5);
  expect(parseCpuToCores("1000m")).toBe(1);
  expect(parseCpuToCores("")).toBe(0);
  expect(parseCpuToCores(undefined)).toBe(0);
  expect(parseCpuToCores(null)).toBe(0);
});

test("parseCpuToCores throws on garbage rather than scoring zero", () => {
  expect(() => parseCpuToCores("abc")).toThrow(/unparseable cpu/);
});

test("parseMemToBytes handles binary and decimal suffixes and plain bytes", () => {
  expect(parseMemToBytes("512Mi")).toBe(512 * 1024 * 1024);
  expect(parseMemToBytes("2Gi")).toBe(2 * 1024 ** 3);
  expect(parseMemToBytes("1Ki")).toBe(1024);
  expect(parseMemToBytes("1M")).toBe(1_000_000);
  expect(parseMemToBytes("1G")).toBe(1_000_000_000);
  expect(parseMemToBytes("1000")).toBe(1000);
  expect(parseMemToBytes("")).toBe(0);
  expect(parseMemToBytes(undefined)).toBe(0);
});

test("parseMemToBytes throws on an unknown suffix (no silent miscount)", () => {
  expect(() => parseMemToBytes("10Zi")).toThrow(/unknown memory suffix/);
  expect(() => parseMemToBytes("notbytes")).toThrow(/unparseable memory/);
});

test("bytesToGiB / bytesToMiB convert exactly", () => {
  expect(bytesToGiB(2 * 1024 ** 3)).toBe(2);
  expect(bytesToMiB(512 * 1024 * 1024)).toBe(512);
});
