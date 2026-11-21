import { expect, test } from "vitest";
import { formatHostListeningBanner } from "./banner";

const TOKEN =
  "deadbeefcafef00d0123456789abcdef0123456789abcdef0123456789abcdef";

test("desktop sidecar (generated token) prints the full token for the handshake", () => {
  const line = formatHostListeningBanner({
    port: 4318,
    token: TOKEN,
    redactToken: false,
  });
  expect(line).toBe(`HOUSTON_HOST_LISTENING port=4318 token=${TOKEN}`);
  expect(line).toMatch(/(^|\s)token=deadbeef/);
});

test("managed pod / self-host (env token) redacts to a non-reversible fingerprint", () => {
  const line = formatHostListeningBanner({
    port: 4318,
    token: TOKEN,
    redactToken: true,
  });
  expect(line.startsWith("HOUSTON_HOST_LISTENING port=4318")).toBe(true);
  expect(line).not.toContain(TOKEN);
  expect(line).toContain(`token_fp=${TOKEN.slice(0, 8)}`);
  expect(line).toContain(`token_len=${TOKEN.length}`);
  expect(line).not.toMatch(/(^|\s)token=/);
});
