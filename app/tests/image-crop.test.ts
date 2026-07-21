import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  AVATAR_MAX_DIMENSION,
  centerSquareCrop,
  outputEdge,
} from "../src/lib/image-crop.ts";

describe("centerSquareCrop", () => {
  it("returns the whole image for an already-square source", () => {
    deepStrictEqual(centerSquareCrop(300, 300), { sx: 0, sy: 0, size: 300 });
  });

  it("trims the wider axis evenly for a landscape source", () => {
    // 400x200 -> 200 square, 100px trimmed off each horizontal side.
    deepStrictEqual(centerSquareCrop(400, 200), { sx: 100, sy: 0, size: 200 });
  });

  it("trims the taller axis evenly for a portrait source", () => {
    // 200x400 -> 200 square, 100px trimmed off each vertical side.
    deepStrictEqual(centerSquareCrop(200, 400), { sx: 0, sy: 100, size: 200 });
  });

  it("floors the offset when the trim is an odd number of pixels", () => {
    // 401x200 -> 200 square, (401-200)/2 = 100.5 floored to 100.
    deepStrictEqual(centerSquareCrop(401, 200), { sx: 100, sy: 0, size: 200 });
  });
});

describe("outputEdge", () => {
  it("downscales a large crop to the avatar ceiling", () => {
    strictEqual(outputEdge(2000), AVATAR_MAX_DIMENSION);
  });

  it("never upscales a crop smaller than the ceiling", () => {
    strictEqual(outputEdge(128), 128);
  });

  it("keeps a crop exactly at the ceiling", () => {
    strictEqual(outputEdge(AVATAR_MAX_DIMENSION), AVATAR_MAX_DIMENSION);
  });

  it("honors a custom max", () => {
    strictEqual(outputEdge(500, 256), 256);
  });
});
