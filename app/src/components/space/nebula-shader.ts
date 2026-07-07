/**
 * GLSL source for the sign-in nebula ({@link ./nebula-gl}). One fullscreen
 * fragment shader — no textures, no libraries — that renders a domain-warped FBM
 * nebula in the deep-space palette. Split from the GL runtime so both stay within
 * the file-size budget; the noise primitive lives in {@link ./nebula-noise}.
 *
 * The technique (per the rendering spec): 5-octave FBM (`ht_fbm`) in an
 * ANISOTROPIC band-space domain (along-axis compressed ~2:1) with a single low-K
 * domain warp plus RIDGED abs-noise detail — `color = palette(ridge(fbm(p + K*q)))`,
 * K = 1.4 — so the structure reads as filaments pulled along the river rather than
 * marbled eddies. Density is gated by a large-scale, band-elongated FBM region mask
 * AND the band falloff, so whole tracts of sky switch off to near-black between
 * filaments (astrophotography restraint, not lava-lamp cloud). The inner warp
 * coordinate drifts with time so the nebula *morphs in place* (nothing translates).
 * Ridged abs-noise carves dark dust lanes inside the lit band; a Reinhard-ish tone
 * curve plus a per-pixel hash dither kill banding (this replaces the old canvas
 * grain). Structure is biased along the starfield's Milky-Way diagonal (same
 * geometry as `starfield-model.ts`: direction (w, -h), centre-of-screen, half-width
 * 0.175·diag) so nebula and star band read as a single structure. Peak luminance is
 * clamped to ≤ 0.22 so the sign-in card always stays the brightest thing on screen.
 *
 * All colour arrives as vec3 uniforms read from `--ht-space-*` tokens — the shader
 * hardcodes no colour. GLSL ES 1.00 (compiles on `webgl2` and `webgl`).
 */

import { SIMPLEX_2D_GLSL } from "./nebula-noise";

/** Fullscreen-triangle vertex shader; `a_pos` is clip-space, no transforms. */
export const VERTEX_SHADER = /* glsl */ `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * Uniform names the {@link ./nebula-gl} runtime binds. The six `u_*Color` names
 * pair 1:1 with {@link SPACE_PALETTE_TOKENS} in {@link ./nebula-program}.
 */
export const UNIFORMS = {
  resolution: "u_resolution",
  time: "u_time",
  octaves: "u_octaves",
  canvas: "u_canvasColor",
  canvasGlow: "u_canvasGlowColor",
  nebula1: "u_nebula1Color",
  nebula2: "u_nebula2Color",
  core: "u_coreColor",
  dust: "u_dustColor",
} as const;

const HEAD = /* glsl */ `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;      // seconds since first paint
uniform float u_octaves;   // 5.0 nominal, 3.0 when degraded
uniform vec3 u_canvasColor;
uniform vec3 u_canvasGlowColor;
uniform vec3 u_nebula1Color;   // violet mid
uniform vec3 u_nebula2Color;   // teal accent
uniform vec3 u_coreColor;      // near-white violet highlight
uniform vec3 u_dustColor;      // dark lane tint

const float K = 1.4;           // domain-warp strength (low → filaments, not marble)
const float BAND_HALF = 0.175; // matches starfield-model.ts band half-width
const float INNER_RATE = 0.004;// inner-warp drift per second
`;

const NOISE_HELPERS = /* glsl */ `
float ht_fbm(vec2 p) {
  float amp = 0.5;
  float freq = 1.0;
  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= u_octaves) break;
    sum += amp * snoise(p * freq);
    freq *= 2.0;   // lacunarity
    amp *= 0.5;    // gain
  }
  return sum;
}

float ht_hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 ht_tone(vec3 c) {
  // Filmic-ish shoulder: identity in the shadows (space stays deep black),
  // soft roll-off only above the knee so highlights never clip / band.
  vec3 over = max(c - 0.16, 0.0);
  return min(c, vec3(0.16)) + over / (1.0 + over * 4.0);
}
`;

const MAIN = /* glsl */ `
void main() {
  // Canvas-space coords (top-left origin) so the band matches the star canvas.
  vec2 pc = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 uv = pc / u_resolution.y;               // aspect-preserving unit

  // --- Milky-Way band geometry (same as starfield-model.ts) -------------
  vec2 dir = normalize(vec2(u_resolution.x, -u_resolution.y));
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 rel = pc - u_resolution * 0.5;
  float along = dot(rel, dir);
  float acrossS = dot(rel, perp);
  float across = abs(acrossS);
  float halfW = BAND_HALF * length(u_resolution); // == starfield diag * 0.175
  float band = 1.0 - smoothstep(0.0, halfW * 1.5, across); // soft, wide falloff

  // Anisotropic band-space domain: compress the along-axis ~2:1 so structure
  // streaks ALONG the river (filaments) instead of marbling into eddies.
  vec2 bs = vec2(along, acrossS) / u_resolution.y;
  vec2 p = vec2(bs.x * 0.48, bs.y * 1.2) * 2.2;
  vec2 tOff = vec2(u_time * INNER_RATE);        // drift the INNER warp only

  // --- Single low-K domain warp + ridged detail = filaments -------------
  vec2 q = vec2(ht_fbm(p + tOff),
                ht_fbm(p + vec2(5.2, 1.3) + tOff));
  float warp = ht_fbm(p + K * q);
  float ridge = 1.0 - abs(ht_fbm(p * 1.8 + K * q)); // ridged → pulled filaments
  float raw = ridge * (0.45 + 0.55 * (warp * 0.5 + 0.5));
  float d = smoothstep(0.28, 0.95, raw);        // contrast → crisp filaments

  // --- Large-scale region mask: whole areas of sky switch off -----------
  // Elongated along the band so lit patches chain into ONE river, not a blob.
  float cloud = ht_fbm(vec2(bs.x * 0.34, bs.y * 0.9) + vec2(11.0, 7.0));
  float region = smoothstep(0.18, 0.62, cloud * 0.5 + 0.5);

  // Density lives only where structure AND region AND band overlap, so the
  // sky between filaments reads genuinely dark (astrophotography, not marble).
  float density = d * region * band;

  // --- Palette: teal shadow -> violet body -> near-white core -----------
  vec3 col = mix(u_nebula2Color, u_nebula1Color, smoothstep(0.15, 0.7, d));
  col = mix(col, u_coreColor, smoothstep(0.82, 1.0, d) * band * region);
  vec3 neb = col * pow(density, 1.7);           // emission over the base

  // --- Ridged dust lanes: carve thin dark filaments inside the band -----
  float lane = abs(ht_fbm(p * 2.3 + vec2(3.7, 1.1) + tOff * 0.5));
  float dustMask = smoothstep(0.03, 0.18, lane);
  neb = mix(u_dustColor * density, neb, dustMask);

  // --- Base gradient (canvas-glow at top -> canvas) + emission ----------
  float top = clamp(gl_FragCoord.y / u_resolution.y, 0.0, 1.0);
  vec3 base = mix(u_canvasColor, u_canvasGlowColor, top * 0.22);
  col = base + neb;

  // --- Tone curve + luminance cap (<= 0.22) + dither --------------------
  col = ht_tone(col);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= (lum > 0.22) ? (0.22 / lum) : 1.0;
  col += (ht_hash(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

/** Assembled fragment shader: noise primitive + helpers + main. */
export const FRAGMENT_SHADER = `${HEAD}${SIMPLEX_2D_GLSL}${NOISE_HELPERS}${MAIN}`;
