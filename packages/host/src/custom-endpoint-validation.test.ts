import { describe, expect, test } from "vitest";
import { checkPublicHttpsEndpoint } from "./custom-endpoint-validation";

const check = (url: string) => checkPublicHttpsEndpoint(new URL(url));

describe("checkPublicHttpsEndpoint — accepts a reachable public HTTPS endpoint", () => {
  test.each([
    "https://api.example.com/v1",
    "https://api.example.com:443/v1",
    "https://sub.domain.example.com/openai/v1",
    "https://8.8.8.8/v1",
    "https://[2606:4700:4700::1111]/v1",
  ])("%s → ok", (url) => {
    expect(check(url)).toEqual({ ok: true });
  });
});

describe("checkPublicHttpsEndpoint — rejects unreachable endpoints", () => {
  test("plain http is rejected (not https)", () => {
    const r = check("http://api.example.com/v1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/https/i);
      expect(r.code).toBe("endpoint_not_https");
    }
  });

  test.each([
    "https://api.example.com:8443/v1",
    "https://api.example.com:11434/v1",
    "https://api.example.com:80/v1",
  ])("a non-443 port is rejected (%s)", (url) => {
    const r = check(url);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/port/i);
      expect(r.code).toBe("endpoint_custom_port");
    }
  });

  test.each([
    "https://localhost/v1",
    "https://localhost:443/v1",
    "https://api.localhost/v1",
    "https://printer.local/v1",
    "https://ollama.local/v1",
  ])("a local hostname is rejected (%s)", (url) => {
    const r = check(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("endpoint_private_host");
  });

  test("a localhost URL that also breaks scheme and port reports the host", () => {
    const r = check("http://localhost:11434/v1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("endpoint_private_host");
  });

  test.each([
    "https://127.0.0.1/v1",
    "https://127.5.5.5/v1",
    "https://10.0.0.1/v1",
    "https://172.16.0.1/v1",
    "https://172.31.255.255/v1",
    "https://192.168.1.1/v1",
    "https://169.254.10.20/v1",
    "https://169.254.169.254/v1",
    "https://0.0.0.0/v1",
    "https://0.1.2.3/v1",
    "https://100.64.0.1/v1",
    "https://100.127.255.255/v1",
    "https://198.18.0.1/v1",
    "https://198.19.255.255/v1",
    "https://224.0.0.1/v1",
    "https://239.255.255.255/v1",
    "https://255.255.255.255/v1",
  ])("a private/loopback/link-local IPv4 is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test.each([
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://[fd12:3456::1]/v1",
    "https://[fe80::1]/v1",
    "https://[feba::1]/v1",
  ])("a loopback/ULA/link-local IPv6 literal is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test.each([
    "https://[::ffff:169.254.169.254]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://[::ffff:10.0.0.1]/v1",
    "https://[::ffff:a9fe:a9fe]/v1",
    "https://[::ffff:7f00:1]/v1",
    "https://[::]/v1",
    "https://[::a00:1]/v1",
    "https://[::7f00:1]/v1",
  ])("an IPv4-mapped/compatible IPv6 literal is rejected (%s)", (url) => {
    expect(check(url).ok).toBe(false);
  });

  test("172.15/172.32 are NOT the private 172.16/12 block (still rejected only by range)", () => {
    expect(check("https://172.15.0.1/v1")).toEqual({ ok: true });
    expect(check("https://172.32.0.1/v1")).toEqual({ ok: true });
  });
});
