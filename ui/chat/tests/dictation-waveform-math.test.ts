import { deepEqual, equal, ok } from "node:assert";
import { describe, it } from "node:test";
import {
  bucketScreenX,
  catmullRomToBezier,
  computeWaveformLayout,
  continuousProgress,
  envelopeHalfHeight,
  headScreenX,
  SLOT_PITCH_PX,
  trackShiftPx,
  visibleSlotCount,
  WAVEFORM_BUCKET_MS,
} from "../src/dictation-waveform-math.ts";

const MARGIN = SLOT_PITCH_PX / 2;
// A track wide enough to hold 20 slots exactly.
const WIDTH = 20 * SLOT_PITCH_PX;

describe("visibleSlotCount", () => {
  it("is the floor of width / pitch, at least 1", () => {
    equal(visibleSlotCount(WIDTH), 20);
    equal(visibleSlotCount(0), 1);
    equal(visibleSlotCount(SLOT_PITCH_PX * 3.9), 3);
  });
});

describe("continuousProgress", () => {
  it("is 0 before the recording starts", () => {
    equal(continuousProgress(0), 0);
    equal(continuousProgress(-100), 0);
  });

  it("grows monotonically with elapsed time and never resets", () => {
    const a = continuousProgress(WAVEFORM_BUCKET_MS * 3 + 10);
    const b = continuousProgress(WAVEFORM_BUCKET_MS * 3 + 50);
    const c = continuousProgress(WAVEFORM_BUCKET_MS * 4);
    ok(a < b && b < c, "monotonic across bucket boundaries");
    equal(continuousProgress(WAVEFORM_BUCKET_MS * 4), 4);
  });
});

describe("trackShiftPx", () => {
  it("stays 0 while the head still fits", () => {
    equal(trackShiftPx(5, WIDTH), 0);
    equal(trackShiftPx(18, WIDTH), 0);
  });

  it("becomes positive once the head reaches the right edge", () => {
    ok(trackShiftPx(40, WIDTH) > 0);
  });
});

describe("bucketScreenX (slot stability)", () => {
  it("gives a fixed slot independent of how many buckets exist (pre-scroll)", () => {
    // shift is 0 pre-scroll, so bucket 7 sits at the same x whether there are
    // 8 buckets or 15 — previously-drawn history never moves.
    const early = bucketScreenX(7, trackShiftPx(8, WIDTH));
    const later = bucketScreenX(7, trackShiftPx(15, WIDTH));
    equal(early, later);
    equal(early, 7 * SLOT_PITCH_PX + MARGIN);
  });
});

describe("headScreenX", () => {
  it("advances monotonically with elapsed time, never backward", () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let ms = 0; ms <= WAVEFORM_BUCKET_MS * 60; ms += 37) {
      const progress = continuousProgress(ms);
      const head = headScreenX(progress, WIDTH);
      ok(head >= prev, `head never steps left (at ${ms}ms)`);
      prev = head;
    }
  });

  it("is independent of how many audio buckets have actually landed", () => {
    // The jitter bug: head derived from bucket count jumped back a slot when
    // the wall clock wrapped before the recorder appended the next bucket.
    // Same elapsed time must give the same head regardless of bucket arrival.
    const elapsed = WAVEFORM_BUCKET_MS * 8 + 30;
    const a = computeWaveformLayout([0.5, 0.5, 0.5], WIDTH, elapsed);
    const b = computeWaveformLayout(new Array(9).fill(0.5), WIDTH, elapsed);
    equal(a.headX, b.headX);
  });

  it("is pinned to the right edge once scrolling", () => {
    for (const frac of [0, 0.25, 0.5, 0.9]) {
      const progress = continuousProgress(
        WAVEFORM_BUCKET_MS * 60 + WAVEFORM_BUCKET_MS * frac,
      );
      const shift = trackShiftPx(progress, WIDTH);
      ok(shift > 0, "is scrolling");
      const head = headScreenX(progress, WIDTH);
      ok(
        Math.abs(head - (WIDTH - MARGIN)) < 1e-9,
        `head pinned at frac=${frac}`,
      );
    }
  });
});

describe("computeWaveformLayout", () => {
  const levels = (n: number) =>
    Array.from({ length: n }, (_, i) => (i % 5) / 5);

  it("places pre-scroll buckets at fixed slots, left→right, with a leader ahead", () => {
    const l = computeWaveformLayout(levels(6), WIDTH, WAVEFORM_BUCKET_MS * 6);
    equal(l.full, false);
    equal(l.points.length, 6);
    deepEqual(
      l.points.map((p) => p.x),
      [0, 1, 2, 3, 4, 5].map((i) => i * SLOT_PITCH_PX + MARGIN),
    );
    ok(l.leaderFromX < WIDTH, "leader occupies the remaining track");
  });

  it("keeps a bucket's x identical before and after more buckets arrive (pre-scroll)", () => {
    const before = computeWaveformLayout(
      levels(8),
      WIDTH,
      WAVEFORM_BUCKET_MS * 8,
    );
    const after = computeWaveformLayout(
      levels(15),
      WIDTH,
      WAVEFORM_BUCKET_MS * 15,
    );
    // bucket index 3 is present in both frames at the same slot.
    equal(before.points[3]?.x, after.points[3]?.x);
  });

  it("keeps the newest bucket at the head when full (one clock)", () => {
    const n = 50;
    const l = computeWaveformLayout(levels(n), WIDTH, WAVEFORM_BUCKET_MS * n);
    ok(l.full, "is scrolling");
    const newest = l.points[l.points.length - 1];
    ok(newest !== undefined && Math.abs(newest.x - l.headX) <= SLOT_PITCH_PX);
  });

  it("scrolls the whole strip left monotonically as elapsed grows within a bucket", () => {
    const n = 50;
    const base = WAVEFORM_BUCKET_MS * n;
    const a = computeWaveformLayout(levels(n), WIDTH, base + 10);
    const b = computeWaveformLayout(levels(n), WIDTH, base + 60);
    // A fixed bucket (index 45) shifts left as the sub-bucket offset advances.
    const xa = a.points.find((_, i) => a.points.length - i === 5)?.x ?? 0;
    const xb = b.points.find((_, i) => b.points.length - i === 5)?.x ?? 0;
    ok(xb < xa, "history scrolls left, never jitters right");
  });

  it("drops buckets that have scrolled off the left edge", () => {
    const n = 200;
    const l = computeWaveformLayout(levels(n), WIDTH, WAVEFORM_BUCKET_MS * n);
    ok(
      l.points.length <= visibleSlotCount(WIDTH) + 3,
      "only visible window drawn",
    );
    ok((l.points[0]?.x ?? 0) < 0 || (l.points[0]?.x ?? 0) <= SLOT_PITCH_PX);
  });
});

describe("catmullRomToBezier", () => {
  it("returns nothing for fewer than two points", () => {
    deepEqual(catmullRomToBezier([]), []);
    deepEqual(catmullRomToBezier([{ x: 0, y: 0 }]), []);
  });

  it("emits one segment per gap, anchored on the input points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];
    const segs = catmullRomToBezier(pts);
    equal(segs.length, 2);
    deepEqual(segs[0]?.p0, pts[0]);
    deepEqual(segs[0]?.p1, pts[1]);
    deepEqual(segs[1]?.p1, pts[2]);
  });

  it("keeps control points collinear for a straight input (no wobble)", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ];
    for (const s of catmullRomToBezier(pts)) {
      equal(s.c1.x, s.c1.y); // y = x line
      equal(s.c2.x, s.c2.y);
    }
  });
});

describe("envelopeHalfHeight", () => {
  it("scales with level up to the max half-height", () => {
    equal(envelopeHalfHeight(1, 40, 0.75), 40);
    equal(envelopeHalfHeight(0.5, 40, 0.75), 20);
  });

  it("floors silence to a hairline", () => {
    equal(envelopeHalfHeight(0, 40, 0.75), 0.75);
    equal(envelopeHalfHeight(-1, 40, 0.75), 0.75);
  });
});
