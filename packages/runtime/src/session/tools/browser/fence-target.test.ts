import { expect, test, vi } from "vitest";
import {
  type FenceLookup,
  judgeTarget,
  MAX_CONNECT_ADDRESSES,
  parseAuthority,
} from "./fence-target";
import { ownAddresses } from "./ip-ranges";

const DNS: Record<string, string[]> = {
  "public.test": ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
  "loop.test": ["127.0.0.1"],
  "loop6.test": ["::1"],
  "mapped.test": ["::ffff:127.0.0.1"],
  "lan.test": ["10.1.2.3"],
  "cgnat.test": ["100.64.0.9"],
  "meta.test": ["169.254.169.254"],
  "mixed.test": ["93.184.215.14", "10.0.0.7"],
  "mixed-loop.test": ["93.184.215.14", "127.0.0.1"],
  "zone.test": ["fe80::1%en0"],
  "nas.local": ["fe80::1c2b:3aff:fe4d:5e6f%en0", "192.168.1.20"],
  "site-local.test": ["fec0::1", "192.168.1.20"],
  "ll-loop.test": ["fe80::1", "93.184.215.14", "127.0.0.1"],
  "garbage.test": ["not-an-ip"],
  "empty.test": [],
};

const lookup: FenceLookup = vi.fn(async (host: string) => {
  const answers = DNS[host];
  if (!answers)
    throw Object.assign(new Error("nope"), {
      code: "ENOTFOUND",
      hostname: host,
    });
  return answers.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));
});

const managed = (host: string) => judgeTarget(host, "blocked", lookup);
const selfHosted = (host: string) => judgeTarget(host, "allowed", lookup);

test("a public name is allowed, pinned to every answer it checked, in order", async () => {
  const both = ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"];
  expect(await managed("public.test")).toEqual({
    kind: "allowed",
    addresses: both,
  });
  expect(await managed("PUBLIC.test.")).toEqual({
    kind: "allowed",
    addresses: both,
  });
});

test("a long answer list is cut to the first few, duplicates once", async () => {
  const many: FenceLookup = async () =>
    ["1.1.1.1", "1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9"].map(
      (address) => ({ address, family: 4 }),
    );
  expect(await judgeTarget("many.test", "blocked", many)).toEqual({
    kind: "allowed",
    addresses: ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"].slice(
      0,
      MAX_CONNECT_ADDRESSES,
    ),
  });
});

test("this machine's own interface addresses are refused, as a name's answer or a literal", async () => {
  const own = ownAddresses({ en0: [{ address: "93.184.215.14" }] });
  expect(await judgeTarget("public.test", "allowed", lookup, own)).toEqual({
    kind: "refused",
  });
  expect(await judgeTarget("93.184.215.14", "allowed", lookup, own)).toEqual({
    kind: "refused",
  });
  expect((await judgeTarget("8.8.8.8", "allowed", lookup, own)).kind).toBe(
    "allowed",
  );
});

test("a name that resolves to this machine or link-local is refused everywhere", async () => {
  for (const host of [
    "loop.test",
    "loop6.test",
    "mapped.test",
    "meta.test",
    "zone.test",
  ]) {
    expect(await managed(host), host).toEqual({ kind: "refused" });
    expect(await selfHosted(host), host).toEqual({ kind: "refused" });
  }
});

test("a name that resolves to a private network is refused only on the managed cloud", async () => {
  for (const host of ["lan.test", "cgnat.test"]) {
    expect(await managed(host), host).toEqual({ kind: "refused" });
    expect((await selfHosted(host)).kind, host).toBe("allowed");
  }
});

test("ONE blocked answer among public ones refuses the name", async () => {
  expect(await managed("mixed.test")).toEqual({ kind: "refused" });
  expect(await managed("mixed-loop.test")).toEqual({ kind: "refused" });
  expect(await selfHosted("mixed-loop.test")).toEqual({ kind: "refused" });
  expect((await selfHosted("mixed.test")).kind).toBe("allowed");
});

test("an IPv6 link-local answer beside a usable one is dropped, never dialed", async () => {
  expect(await selfHosted("nas.local")).toEqual({
    kind: "allowed",
    addresses: ["192.168.1.20"],
  });
  expect(await managed("nas.local")).toEqual({ kind: "refused" });
  expect(await selfHosted("site-local.test")).toEqual({ kind: "refused" });
  expect(await selfHosted("ll-loop.test")).toEqual({ kind: "refused" });
  expect(await selfHosted("zone.test")).toEqual({ kind: "refused" });
});

test("blocked names and literals are refused without a lookup, root dot or not", async () => {
  vi.mocked(lookup).mockClear();
  for (const host of [
    "localhost",
    "localhost.",
    "app.localhost.",
    "metadata",
    "metadata.",
    "metadata.google.internal",
    "metadata.google.internal.",
    "svc.cluster.internal.",
    "127.0.0.1",
    "[::1]",
    "0.0.0.0",
    "169.254.169.254",
    "",
  ])
    expect(await selfHosted(host), host).toEqual({ kind: "refused" });
  expect(await managed("10.0.0.1")).toEqual({ kind: "refused" });
  expect(lookup).not.toHaveBeenCalled();
});

test("a public IP literal goes as written, without a lookup", async () => {
  expect(await managed("8.8.8.8")).toEqual({
    kind: "allowed",
    addresses: ["8.8.8.8"],
  });
  expect(await managed("[2001:4860:4860::8888]")).toEqual({
    kind: "allowed",
    addresses: ["2001:4860:4860::8888"],
  });
  expect((await selfHosted("192.168.1.1")).kind).toBe("allowed");
});

test("no answer is unreachable; an answer that is not an address is refused", async () => {
  expect(await managed("nowhere.test")).toEqual({ kind: "unreachable" });
  expect(await managed("empty.test")).toEqual({ kind: "unreachable" });
  expect(await managed("garbage.test")).toEqual({ kind: "refused" });
});

test("a lookup that breaks for another reason is not hidden", async () => {
  const broken: FenceLookup = async () => {
    throw new TypeError("resolver bug");
  };
  await expect(judgeTarget("public.test", "blocked", broken)).rejects.toThrow(
    "resolver bug",
  );
});

test("CONNECT authorities parse with their port, IPv6 bracketed", () => {
  expect(parseAuthority("example.com:443")).toEqual({
    host: "example.com",
    port: 443,
  });
  expect(parseAuthority("[::1]:8443")).toEqual({ host: "[::1]", port: 8443 });
  for (const bad of [
    "example.com",
    "example.com:0",
    "example.com:70000",
    "::1:443",
    ":443",
  ])
    expect(parseAuthority(bad), bad).toBeNull();
});
