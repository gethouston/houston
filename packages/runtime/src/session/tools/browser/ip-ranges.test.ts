import { expect, test } from "vitest";
import {
  ALWAYS_BLOCKED_PREFIXES,
  blockedAddress,
  isIpv6LinkLocal,
  ownAddresses,
  PRIVATE_NETWORK_PREFIXES,
  parseIp,
  parsePrefix,
  privateNetworksFor,
} from "./ip-ranges";

const managed = (host: string) => blockedAddress(host, "blocked");

test("IP literals parse in every spelling; names do not", () => {
  expect(parseIp("10.0.0.1")).toEqual({ bits: 32, value: 0x0a000001n });
  expect(parseIp("[::1]")).toEqual({ bits: 128, value: 1n });
  expect(parseIp("::ffff:10.0.0.1")).toEqual({ bits: 32, value: 0x0a000001n });
  expect(parseIp("[::ffff:a00:1]")).toEqual({ bits: 32, value: 0x0a000001n });
  expect(parseIp("2001:db8::8:800:200c:417a")?.value).toBe(
    0x20010db8000000000008080020_0c417an,
  );
  expect(parseIp("example.com")).toBeNull();
  expect(parseIp("10.example")).toBeNull();
});

test("each blocked block holds its first and last address and nothing beside it", () => {
  expect(managed("172.16.0.0")).toBe("private_network");
  expect(managed("172.31.255.255")).toBe("private_network");
  expect(managed("172.32.0.0")).toBeNull();
  expect(managed("fe80::1")).toBe("link_local");
  expect(managed("feff::1")).toBe("link_local");
  expect(managed("ff02::1")).toBeNull();
  expect(managed("169.254.169.254")).toBe("link_local");
  expect(managed("0.1.2.3")).toBe("this_machine");
  expect(managed("::")).toBe("this_machine");
});

test("only the managed cloud blocks private networks; this machine and link-local stay blocked everywhere", () => {
  expect(privateNetworksFor({ HOUSTON_MANAGED_CLOUD: "1" })).toBe("blocked");
  expect(privateNetworksFor({})).toBe("allowed");
  expect(privateNetworksFor({ HOUSTON_MANAGED_CLOUD: "0" })).toBe("allowed");
  for (const ip of ["10.0.0.1", "192.168.1.1", "100.64.0.1", "fd00::1"])
    expect(blockedAddress(ip, "allowed"), ip).toBeNull();
  expect(blockedAddress("127.0.0.1", "allowed")).toBe("this_machine");
  expect(blockedAddress("::ffff:127.0.0.1", "allowed")).toBe("this_machine");
  expect(blockedAddress("169.254.169.254", "allowed")).toBe("link_local");
  expect(blockedAddress("fec0::1", "allowed")).toBe("link_local");
});

test("the prefix lists name the blocks the fence refuses", () => {
  expect(PRIVATE_NETWORK_PREFIXES).toContain("100.64.0.0/10");
  expect(ALWAYS_BLOCKED_PREFIXES).not.toContain("10.0.0.0/8");
  expect(parsePrefix("10.0.0.0/8")).toEqual({
    bits: 32,
    base: 0x0a000000n,
    length: 8,
  });
});

test("AWS's IPv6 and Alibaba's metadata servers are blocked everywhere", () => {
  for (const ip of ["fd00:ec2::254", "100.100.100.200"]) {
    expect(blockedAddress(ip, "allowed"), ip).toBe("link_local");
    expect(managed(ip), ip).toBe("link_local");
  }
  expect(blockedAddress("fd00:ec2::253", "allowed")).toBeNull();
  expect(blockedAddress("100.100.100.201", "allowed")).toBeNull();
});

test("this machine's own interface addresses count as this machine", () => {
  const own = ownAddresses({
    en0: [{ address: "192.168.1.20" }, { address: "2001:db8::20" }],
    utun3: [{ address: "fe80::1%utun3" }],
  });
  expect(blockedAddress("192.168.1.20", "allowed", own)).toBe("this_machine");
  expect(blockedAddress("::ffff:192.168.1.20", "allowed", own)).toBe(
    "this_machine",
  );
  expect(blockedAddress("2001:db8::20", "allowed", own)).toBe("this_machine");
  expect(blockedAddress("192.168.1.21", "allowed", own)).toBeNull();
  expect(ownAddresses().size).toBeGreaterThan(0);
});

test("IPv6 link-local is fe80::/10 only, zone or not", () => {
  for (const ip of ["fe80::1", "fe80::1%en0", "[febf::1]"])
    expect(isIpv6LinkLocal(ip), ip).toBe(true);
  for (const ip of ["fec0::1", "169.254.1.1", "fd00::1", "nas.local"])
    expect(isIpv6LinkLocal(ip), ip).toBe(false);
});
