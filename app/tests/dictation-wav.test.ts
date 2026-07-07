import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  encodeWav,
  floatTo16BitPCM,
  mergeFloat32,
  resampleLinear,
} from "../src/lib/dictation/wav.ts";

describe("floatTo16BitPCM", () => {
  it("maps exact endpoints without rounding drift", () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1]));
    deepStrictEqual(Array.from(out), [0, 32767, -32768]);
  });

  it("clamps out-of-range samples instead of wrapping", () => {
    const out = floatTo16BitPCM(new Float32Array([2, -2]));
    deepStrictEqual(Array.from(out), [32767, -32768]);
  });
});

describe("mergeFloat32", () => {
  it("concatenates chunks in order", () => {
    const merged = mergeFloat32([
      new Float32Array([1, 2]),
      new Float32Array([]),
      new Float32Array([3]),
    ]);
    deepStrictEqual(Array.from(merged), [1, 2, 3]);
  });
});

describe("resampleLinear", () => {
  it("is a no-op when rates already match", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    strictEqual(resampleLinear(input, 16000, 16000), input);
  });

  it("scales length from 48kHz down to 16kHz (3:1)", () => {
    const input = new Float32Array(480); // 10ms @ 48kHz
    const out = resampleLinear(input, 48000, 16000);
    strictEqual(out.length, 160); // 10ms @ 16kHz
  });

  it("interpolates linearly between neighboring samples", () => {
    // 2:1 downsample of a ramp: out[i] should land near input[2*i].
    const input = Float32Array.from({ length: 8 }, (_, i) => i);
    const out = resampleLinear(input, 2, 1);
    strictEqual(out.length, 4);
    deepStrictEqual(Array.from(out), [0, 2, 4, 6]);
  });
});

describe("encodeWav", () => {
  it("writes a byte-exact 44-byte header + PCM body for a known input", () => {
    const samples = new Float32Array([0, 1, -1, 0.5]);
    const bytes = encodeWav(samples, 16000);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const ascii = (offset: number, len: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + len));

    strictEqual(bytes.length, 44 + samples.length * 2);
    strictEqual(ascii(0, 4), "RIFF");
    strictEqual(view.getUint32(4, true), 36 + samples.length * 2);
    strictEqual(ascii(8, 4), "WAVE");
    strictEqual(ascii(12, 4), "fmt ");
    strictEqual(view.getUint32(16, true), 16);
    strictEqual(view.getUint16(20, true), 1); // PCM
    strictEqual(view.getUint16(22, true), 1); // mono
    strictEqual(view.getUint32(24, true), 16000);
    strictEqual(view.getUint32(28, true), 32000); // byte rate
    strictEqual(view.getUint16(32, true), 2); // block align
    strictEqual(view.getUint16(34, true), 16); // bits per sample
    strictEqual(ascii(36, 4), "data");
    strictEqual(view.getUint32(40, true), samples.length * 2);

    const pcm = new Int16Array(
      bytes.buffer,
      bytes.byteOffset + 44,
      samples.length,
    );
    deepStrictEqual(Array.from(pcm), [0, 32767, -32768, 16384]);
  });

  it("defaults to the 16kHz dictation sample rate", () => {
    const bytes = encodeWav(new Float32Array([0]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    strictEqual(view.getUint32(24, true), 16000);
  });
});
