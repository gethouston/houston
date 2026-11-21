import { beforeEach, expect, test, vi } from "vitest";

const os: Record<string, { address: string; family: number }[]> = {
  wiki: [{ address: "10.1.2.3", family: 4 }],
  "printer.local": [
    { address: "fe80::1", family: 6 },
    { address: "192.168.1.9", family: 4 },
  ],
  "loopy.lan": [{ address: "127.0.0.1", family: 4 }],
};
const dnsZone: Record<string, string[]> = { "site.test": ["198.51.100.7"] };
const miss = (host: string) =>
  Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" });

const asked = vi.hoisted(() => ({ os: [] as string[], cares: [] as string[] }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string, options: { all?: boolean }) => {
    asked.os.push(host);
    if (options.all !== true) throw new Error("the fence asks for all answers");
    const answers = os[host];
    if (!answers) throw miss(host);
    return answers;
  }),
  Resolver: class {
    async resolve4(host: string) {
      asked.cares.push(host);
      const answers = dnsZone[host];
      if (!answers) throw miss(host);
      return answers;
    }
    async resolve6(host: string): Promise<string[]> {
      throw miss(host);
    }
  },
}));

const { lookupFor } = await import("./fence-resolve");
const { judgeTarget } = await import("./fence-target");

beforeEach(() => {
  asked.os.length = 0;
  asked.cares.length = 0;
});

test("where private networks are allowed, the OS resolver answers intranet names", async () => {
  const lookup = lookupFor("allowed");
  expect(lookupFor("allowed")).toBe(lookup);
  expect(await lookup("wiki")).toEqual([{ address: "10.1.2.3", family: 4 }]);
  expect(await judgeTarget("wiki", "allowed", lookup)).toEqual({
    kind: "allowed",
    addresses: ["10.1.2.3"],
  });
  expect(asked).toEqual({ os: ["wiki", "wiki"], cares: [] });
});

test("the OS resolver's answers still pass the address checks", async () => {
  const lookup = lookupFor("allowed");
  expect(await lookup("printer.local")).toEqual([
    { address: "192.168.1.9", family: 4 },
    { address: "fe80::1", family: 6 },
  ]);
  expect(await judgeTarget("printer.local", "allowed", lookup)).toEqual({
    kind: "allowed",
    addresses: ["192.168.1.9"],
  });
  expect(await judgeTarget("loopy.lan", "allowed", lookup)).toEqual({
    kind: "refused",
  });
  expect(await judgeTarget("nowhere.lan", "allowed", lookup)).toEqual({
    kind: "unreachable",
  });
});

test("on the managed cloud only public DNS answers, never the OS resolver", async () => {
  const lookup = lookupFor("blocked");
  expect(lookup).not.toBe(lookupFor("allowed"));
  expect(await judgeTarget("site.test", "blocked", lookup)).toEqual({
    kind: "allowed",
    addresses: ["198.51.100.7"],
  });
  expect(await judgeTarget("wiki", "blocked", lookup)).toEqual({
    kind: "unreachable",
  });
  expect(asked.os).toEqual([]);
  expect(asked.cares).toEqual(["site.test", "wiki"]);
});
