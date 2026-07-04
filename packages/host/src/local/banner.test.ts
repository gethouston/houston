import { expect, test } from "vitest";
import { formatHostListeningBanner } from "./banner";

const TOKEN =
  "deadbeefcafef00d0123456789abcdef0123456789abcdef0123456789abcdef";

test("desktop sidecar (generated token) prints the full token for the handshake", () => {
  // The Tauri supervisor parses `token=<value>` back out of this line, so the
  // full token MUST be present when we are NOT redacting.
  const line = formatHostListeningBanner({
    port: 4318,
    token: TOKEN,
    redactToken: false,
  });
  expect(line).toBe(`HOUSTON_HOST_LISTENING port=4318 token=${TOKEN}`);
  // parse_banner's grammar: a whitespace-delimited `token=` field is present.
  expect(line).toMatch(/(^|\s)token=deadbeef/);
});

test("managed pod / self-host (env token) redacts to a non-reversible fingerprint", () => {
  const line = formatHostListeningBanner({
    port: 4318,
    token: TOKEN,
    redactToken: true,
  });
  // Readiness greps still match on the prefix.
  expect(line.startsWith("HOUSTON_HOST_LISTENING port=4318")).toBe(true);
  // The full token never appears.
  expect(line).not.toContain(TOKEN);
  // A fingerprint (first 8 chars) + length is surfaced for log correlation, and
  // deliberately uses `token_fp=`/`token_len=` so nothing parses it as a token.
  expect(line).toContain(`token_fp=${TOKEN.slice(0, 8)}`);
  expect(line).toContain(`token_len=${TOKEN.length}`);
  expect(line).not.toMatch(/(^|\s)token=/);
});
