import { describe, expect, it } from "vitest";
import { tunnelTokenFor, verifyTunnelToken } from "../src/allocate";

describe("tunnel token HMAC", () => {
  it("roundtrips: token issued for a tunnel validates for that tunnel", async () => {
    const t = await tunnelTokenFor("tun-abc", "shh");
    expect(await verifyTunnelToken("tun-abc", t, "shh")).toBe(true);
  });

  it("rejects tokens from different tunnels", async () => {
    const t = await tunnelTokenFor("tun-abc", "shh");
    expect(await verifyTunnelToken("tun-xyz", t, "shh")).toBe(false);
  });

  it("rejects wrong secret", async () => {
    const t = await tunnelTokenFor("tun-abc", "shh");
    expect(await verifyTunnelToken("tun-abc", t, "other")).toBe(false);
  });

  it("rejects wrong-length tokens", async () => {
    expect(await verifyTunnelToken("tun-abc", "short", "shh")).toBe(false);
    const t = await tunnelTokenFor("tun-abc", "shh");
    expect(await verifyTunnelToken("tun-abc", `${t}xx`, "shh")).toBe(false);
  });

  it("produces different tokens for different tunnels", async () => {
    const a = await tunnelTokenFor("tun-a", "shh");
    const b = await tunnelTokenFor("tun-b", "shh");
    expect(a).not.toBe(b);
  });

  it("produces deterministic output", async () => {
    const a = await tunnelTokenFor("tun-a", "shh");
    const b = await tunnelTokenFor("tun-a", "shh");
    expect(a).toBe(b);
  });
});
