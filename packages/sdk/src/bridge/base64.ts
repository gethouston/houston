/**
 * Base64 codec for the bridge's byte transport.
 *
 * Response bodies cross the string pipe as base64 (`fetch/chunk.bytesBase64`)
 * because the pipe carries only JSON strings and raw bytes are not
 * JSON-serializable. These helpers are self-contained on purpose: an embedded
 * JavaScriptCore/Hermes context ships neither `btoa`/`atob` (WebKit-only) nor
 * Node's `Buffer`, so the codec is written over plain `Uint8Array` + string
 * arithmetic and depends on no host global.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reverse lookup: char code -> 6-bit value (or -1 for non-alphabet bytes). */
const LOOKUP = /* @__PURE__ */ (() => {
  const table = new Int8Array(256).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Encode raw bytes to a standard (padded) base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      ALPHABET[(n >> 6) & 63] +
      ALPHABET[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`;
  }
  return out;
}

/** Decode a base64 string (padding optional) back to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  let len = b64.length;
  while (len > 0 && (b64[len - 1] === "=" || b64[len - 1] === "\n")) len--;
  const outLen = (len * 3) >> 2;
  const out = new Uint8Array(outLen);
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const v = LOOKUP[b64.charCodeAt(i)];
    if (v < 0) continue; // skip stray whitespace / non-alphabet bytes
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return o === outLen ? out : out.subarray(0, o);
}
