import { expect, test } from "vitest";
import { isBlockedAddress, vetResolvedHost } from "./portable-from-store-net";

/**
 * The DNS-level SSRF guard: the IP classifier (every private / loopback /
 * link-local / ULA range, v4 and v6, including IPv4-mapped IPv6) and the resolve
 * step that rejects a host whose answers land in any of them before a fetch runs.
 */

test.each([
  "10.0.0.5",
  "10.255.255.255",
  "127.0.0.1",
  "169.254.169.254", // cloud metadata
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "100.64.0.1", // carrier-grade NAT
  "198.18.0.1", // benchmarking
  "0.0.0.0",
  "224.0.0.1", // multicast
  "::1", // loopback
  "::", // unspecified
  "fc00::1", // unique-local
  "fd12:3456::1", // unique-local
  "fe80::1", // link-local
  "febf::1", // link-local upper edge
  "ff02::1", // multicast
  "::ffff:169.254.169.254", // IPv4-mapped metadata
  "::ffff:10.0.0.1", // IPv4-mapped private
])("blocks %s", (ip) => {
  expect(isBlockedAddress(ip)).toBe(true);
});

test.each([
  "93.184.216.34", // public
  "8.8.8.8",
  "172.32.0.1", // just outside 172.16/12
  "192.169.0.1", // just outside 192.168/16
  "2606:2800:220:1::1", // public IPv6
  "2001:4860:4860::8888", // public IPv6
])("allows public %s", (ip) => {
  expect(isBlockedAddress(ip)).toBe(false);
});

test("vetResolvedHost rejects when ANY answer is private", async () => {
  const result = await vetResolvedHost("agent.evil.example", async () => [
    "93.184.216.34",
    "10.0.0.5",
  ]);
  expect(result).toEqual({
    status: 400,
    error: "That link points to an address we cannot open.",
  });
});

test("vetResolvedHost passes an all-public resolution", async () => {
  const result = await vetResolvedHost("store.gethouston.ai", async () => [
    "93.184.216.34",
  ]);
  expect(result).toEqual({ ok: true });
});

test("vetResolvedHost surfaces a resolution failure as a 502 (never swallowed)", async () => {
  const result = await vetResolvedHost("nope.example", async () => {
    throw new Error("ENOTFOUND");
  });
  expect(result).toEqual({
    status: 502,
    error: "Could not reach the agent store: ENOTFOUND",
  });
});

test("vetResolvedHost treats an empty resolution as unreachable (502)", async () => {
  const result = await vetResolvedHost("empty.example", async () => []);
  expect(result).toEqual({
    status: 502,
    error: "Could not reach the agent store.",
  });
});
