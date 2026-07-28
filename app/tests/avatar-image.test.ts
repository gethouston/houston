import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  AVATAR_QUALITY_STEPS,
  dataUrlByteLength,
  encodeUnderCap,
  isAvatarImageFile,
} from "../src/lib/avatar-image.ts";

// The crop geometry is `centerSquareCrop` from `lib/image-crop.ts`, shared with
// the Agent Store avatar upload and covered by `image-crop.test.ts`.

/** A real 1x1 fully transparent PNG: 96 base64 chars, 2 of them padding. */
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * An encoder that records every quality it is asked for and returns a string of
 * the length the caller declared for that step, so the cap search is observable.
 */
const recordingEncoder = (lengthFor: (quality: number) => number) => {
  const asked: number[] = [];
  return {
    asked,
    encode: (quality: number) => {
      asked.push(quality);
      return "x".repeat(lengthFor(quality));
    },
  };
};

describe("dataUrlByteLength", () => {
  it("reports the true decoded byte count of a real data URI", () => {
    const payload = TINY_PNG_DATA_URL.slice(TINY_PNG_DATA_URL.indexOf(",") + 1);
    strictEqual(payload.length, 96);
    strictEqual(
      dataUrlByteLength(TINY_PNG_DATA_URL),
      Buffer.from(payload, "base64").length,
    );
    strictEqual(dataUrlByteLength(TINY_PNG_DATA_URL), 70);
  });

  it("does not count padding as bytes", () => {
    // "TWFu" -> "Man" (3 bytes), "TWE=" -> "Ma" (2), "TQ==" -> "M" (1).
    strictEqual(dataUrlByteLength("data:image/webp;base64,TWFu"), 3);
    strictEqual(dataUrlByteLength("data:image/webp;base64,TWE="), 2);
    strictEqual(dataUrlByteLength("data:image/webp;base64,TQ=="), 1);
  });

  it("returns 0 for an empty payload", () => {
    strictEqual(dataUrlByteLength("data:image/webp;base64,"), 0);
    strictEqual(dataUrlByteLength(""), 0);
  });
});

describe("encodeUnderCap", () => {
  it("keeps the FIRST, highest-quality encoding when it already fits", () => {
    const { asked, encode } = recordingEncoder(() => 10);
    const result = encodeUnderCap(encode, 100);
    strictEqual(result?.length, 10);
    deepStrictEqual(asked, [AVATAR_QUALITY_STEPS[0]]);
  });

  it("descends the quality steps and returns the first one under the cap", () => {
    // 0.9 and 0.8 are too heavy; 0.7 is the first that fits.
    const { asked, encode } = recordingEncoder((quality) =>
      quality > 0.75 ? 200 : 50,
    );
    const result = encodeUnderCap(encode, 100);
    strictEqual(result?.length, 50);
    deepStrictEqual(asked, [0.9, 0.8, 0.7]);
  });

  it("accepts an encoding exactly AT the cap", () => {
    const { encode } = recordingEncoder(() => 100);
    strictEqual(encodeUnderCap(encode, 100)?.length, 100);
  });

  it("returns null when even the lowest quality exceeds the cap", () => {
    const { asked, encode } = recordingEncoder(() => 101);
    strictEqual(encodeUnderCap(encode, 100), null);
    deepStrictEqual(asked, [...AVATAR_QUALITY_STEPS]);
  });

  it("calls the encoder at most once per quality step", () => {
    const { asked, encode } = recordingEncoder(() => 101);
    encodeUnderCap(encode, 100);
    strictEqual(asked.length, AVATAR_QUALITY_STEPS.length);
    strictEqual(new Set(asked).size, asked.length);
  });

  it("defaults to the gateway-safe character cap", () => {
    const { encode } = recordingEncoder(() => 99_999);
    strictEqual(encodeUnderCap(encode)?.length, 99_999);
    const tooBig = recordingEncoder(() => 100_001);
    strictEqual(encodeUnderCap(tooBig.encode), null);
  });
});

describe("isAvatarImageFile", () => {
  it("accepts any image/* type, including formats we do not name", () => {
    strictEqual(isAvatarImageFile({ type: "image/png" }), true);
    strictEqual(isAvatarImageFile({ type: "image/webp" }), true);
    strictEqual(isAvatarImageFile({ type: "image/heic" }), true);
  });

  it("rejects a non-image and a browser that reported no type at all", () => {
    strictEqual(isAvatarImageFile({ type: "application/pdf" }), false);
    strictEqual(isAvatarImageFile({ type: "" }), false);
  });
});
