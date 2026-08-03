// Which characters the bundled fonts can actually draw.
//
// satori silently substitutes `.notdef` — an empty box — for any code point the
// loaded fonts do not carry, and the result is a PERMANENT public credential
// with boxes where somebody's name should be. The three TTFs here are Latin
// cuts of Hanken Grotesk, so a name in Chinese, Arabic, Devanagari, Greek or
// Cyrillic renders as boxes with no error anywhere.
//
// There is no satori API for "did every glyph resolve", so we read the font's
// own `cmap` table and check the strings before rendering. This module is pure
// parsing: it reports, `render.mjs` decides what to say about it.

/** Characters that never need a glyph, so never count as missing. */
const IGNORED = /^[\s​-‏ ⁠﻿]$/u;

/**
 * Code points a TrueType/OpenType font can draw.
 *
 * @param {Buffer} data Raw font file.
 * @returns {Set<number>} Covered code points. Empty when no Unicode `cmap`
 *   subtable could be parsed — callers treat that as "cannot tell", not as
 *   "covers nothing".
 */
export function coveredCodePoints(data) {
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength ?? data.length,
  );
  const cmap = findTable(view, "cmap");
  if (cmap === null) return new Set();

  const covered = new Set();
  const subtableCount = view.getUint16(cmap + 2);
  for (let i = 0; i < subtableCount; i += 1) {
    const record = cmap + 4 + i * 8;
    const platformId = view.getUint16(record);
    const encodingId = view.getUint16(record + 2);
    if (!isUnicode(platformId, encodingId)) continue;
    const subtable = cmap + view.getUint32(record + 4);
    const format = view.getUint16(subtable);
    if (format === 4) readFormat4(view, subtable, covered);
    else if (format === 12) readFormat12(view, subtable, covered);
  }
  return covered;
}

/**
 * The distinct characters of `text` that `covered` cannot draw.
 *
 * @param {string} text Text destined for a certificate image.
 * @param {Set<number>} covered Union of every loaded font's coverage.
 * @returns {string[]} Each offending character once, in first-seen order.
 */
export function uncoveredCharacters(text, covered) {
  if (covered.size === 0) return [];
  const missing = [];
  const seen = new Set();
  for (const char of String(text ?? "")) {
    const cp = char.codePointAt(0);
    if (covered.has(cp) || IGNORED.test(char) || seen.has(cp)) continue;
    seen.add(cp);
    missing.push(char);
  }
  return missing;
}

/** Byte offset of a table in the font file, or `null` when it has none. */
function findTable(view, tag) {
  const tableCount = view.getUint16(4);
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    const name = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    if (name === tag) return view.getUint32(record + 8);
  }
  return null;
}

/** Unicode cmap encodings: platform 0 (Unicode) and 3/1 + 3/10 (Windows). */
function isUnicode(platformId, encodingId) {
  if (platformId === 0) return true;
  return platformId === 3 && (encodingId === 1 || encodingId === 10);
}

/** Format 4: segmented mapping, the Basic Multilingual Plane. */
function readFormat4(view, start, covered) {
  const segCount = view.getUint16(start + 6) / 2;
  const endCodes = start + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;

  for (let seg = 0; seg < segCount; seg += 1) {
    const end = view.getUint16(endCodes + seg * 2);
    const first = view.getUint16(startCodes + seg * 2);
    if (first > end || first === 0xffff) continue;
    const rangeOffset = view.getUint16(idRangeOffsets + seg * 2);
    for (let cp = first; cp <= end && cp !== 0xffff; cp += 1) {
      if (rangeOffset === 0) {
        covered.add(cp);
        continue;
      }
      // The glyph id lives in the array that starts at this entry, offset by
      // the segment's rangeOffset — the one genuinely odd corner of format 4.
      const at = idRangeOffsets + seg * 2 + rangeOffset + (cp - first) * 2;
      if (at + 1 >= view.byteLength) continue;
      if (view.getUint16(at) !== 0) covered.add(cp);
    }
  }
}

/** Format 12: grouped mapping, full Unicode range. */
function readFormat12(view, start, covered) {
  const groupCount = view.getUint32(start + 12);
  for (let i = 0; i < groupCount; i += 1) {
    const group = start + 16 + i * 12;
    const first = view.getUint32(group);
    const end = view.getUint32(group + 4);
    for (let cp = first; cp <= end; cp += 1) covered.add(cp);
  }
}
