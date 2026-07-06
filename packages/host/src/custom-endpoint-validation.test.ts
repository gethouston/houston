import { describe, expect, test } from "vitest";
import { checkPublicHttpsEndpoint } from "./custom-endpoint-validation";

/**
 * The managed-cloud egress guard for a BYO OpenAI-compatible base URL. A cloud
 * pod reaches ONLY public TCP 443, so this must accept a public HTTPS host on
 * 443 and reject every address the pod's NetworkPolicy drops (plain http, a
 * custom port, and private/loopback/link-local hosts — IPv4 and IPv6).
 */

const check = (url: string) => checkPublicHttpsEndpoint(new URL(url));

describe("checkPublicHttpsEndpoint — accepts a reachable public HTTPS endpoint", () => {
  test.each([
    "https://api.example.com/v1",
    "https://api.example.com:443/v1", // explicit default port normalizes away
    "https://sub.domain.example.com/openai/v1",
    "https://8.8.8.8/v1", // a public IP literal is reachable on :443
    "https://[2606:4700:4700::1111]/v1", // a genuine public IPv6 is reachable
  ])("%s → ok", (url) => {
    expect(check(url)).toEqual({ ok: true });
  });
});

describe("checkPublicHttpsEndpoint — rejects unreachable endpoints", () => {
  test("plain http is rejected (not https)", () => {
    const r = check("http://api.example.com/v1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/https/i);
  });

  test.each([
    "https://api.example.com:8443/v1",
    "https://api.example.com:11434/v1",
    "https://api.example.com:80/v1",
  ])("a non-443 port is rejected (%s)", (url) => {
    const r = check(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/port/i);
  });

  test.each([
    "https://localhost/v1",
    "https://localhost:443/v1",
    "https://api.localhost/v1",
    "https://printer.local/v1",
    "https://ollama.local/v1",
  ])("a local hostname is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test.each([
    "https://127.0.0.1/v1", // loopback 127/8
    "https://127.5.5.5/v1",
    "https://10.0.0.1/v1", // private 10/8
    "https://172.16.0.1/v1", // private 172.16/12 (low)
    "https://172.31.255.255/v1", // private 172.16/12 (high)
    "https://192.168.1.1/v1", // private 192.168/16
    "https://169.254.10.20/v1", // link-local 169.254/16
    "https://169.254.169.254/v1", // cloud metadata IP
    "https://0.0.0.0/v1", // unspecified 0.0.0.0/8
    "https://0.1.2.3/v1", // 0.0.0.0/8
    "https://100.64.0.1/v1", // CGNAT 100.64.0.0/10 (low)
    "https://100.127.255.255/v1", // CGNAT 100.64.0.0/10 (high)
    "https://198.18.0.1/v1", // benchmarking 198.18.0.0/15
    "https://198.19.255.255/v1", // benchmarking 198.18.0.0/15 (high)
    "https://224.0.0.1/v1", // multicast 224.0.0.0/4 (low)
    "https://239.255.255.255/v1", // multicast 224.0.0.0/4 (high)
    "https://255.255.255.255/v1", // limited broadcast
  ])("a private/loopback/link-local IPv4 is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test.each([
    "https://[::1]/v1", // IPv6 loopback
    "https://[fc00::1]/v1", // ULA fc00::/7
    "https://[fd12:3456::1]/v1", // ULA
    "https://[fe80::1]/v1", // link-local fe80::/10
    "https://[feba::1]/v1", // link-local (upper edge of /10)
  ])("a loopback/ULA/link-local IPv6 literal is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test.each([
    "https://[::ffff:169.254.169.254]/v1", // IPv4-mapped metadata IP → [::ffff:a9fe:a9fe]
    "https://[::ffff:127.0.0.1]/v1", // IPv4-mapped loopback → [::ffff:7f00:1]
    "https://[::ffff:10.0.0.1]/v1", // IPv4-mapped RFC-1918 → [::ffff:a00:1]
    "https://[::ffff:a9fe:a9fe]/v1", // hex-compressed mapped metadata IP
    "https://[::ffff:7f00:1]/v1", // hex-compressed mapped loopback
    "https://[::]/v1", // unspecified / IPv4-compatible ::0.0.0.0
    "https://[::a00:1]/v1", // IPv4-compatible ::10.0.0.1
    "https://[::7f00:1]/v1", // IPv4-compatible ::127.0.0.1
  ])("an IPv4-mapped/compatible IPv6 literal is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test("172.15/172.32 are NOT the private 172.16/12 block (still rejected only by range)", () => {
    // Just outside 172.16/12 → these are public and pass on :443.
    expect(check("https://172.15.0.1/v1")).toEqual({ ok: true });
    expect(check("https://172.32.0.1/v1")).toEqual({ ok: true });
  });
});
