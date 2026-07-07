/**
 * GLSL 2D simplex noise for {@link ./nebula-shader}, kept in its own module so the
 * shader file and this reference stay within the file-size budget and the
 * provenance is unambiguous.
 *
 * This is the canonical public-domain simplex-noise reference by Stefan Gustavson
 * and Ian McEwan (the "webgl-noise" implementation Gustavson released to the
 * public domain) — NOT a Shadertoy port (those default to the non-commercial
 * CC BY-NC-SA licence). `snoise(vec2)` returns a value in roughly [-1, 1] and is
 * the primitive the nebula's FBM + domain warp are built on.
 *
 * GLSL ES 1.00 so the same source compiles on both `webgl2` and `webgl`
 * contexts (WebGL2 accepts 1.00 shaders), avoiding a second shader dialect.
 */

/** Public-domain 2D simplex noise (Gustavson / McEwan). Range ≈ [-1, 1]. */
export const SIMPLEX_2D_GLSL = /* glsl */ `
vec3 ht_mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 ht_mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 ht_permute(vec3 x){ return ht_mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,  // (3 - sqrt(3)) / 6
    0.366025403784439,  // (sqrt(3) - 1) / 2
   -0.577350269189626,  // -1 + 2 * C.x
    0.024390243902439); // 1 / 41
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = ht_mod289(i);
  vec3 p = ht_permute(
    ht_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(
    dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;
