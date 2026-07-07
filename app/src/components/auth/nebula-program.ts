/**
 * WebGL plumbing for {@link ./nebula-gl}: shader compilation, program linking,
 * the fullscreen-triangle vertex buffer, and reading the space palette from the
 * `--ht-space-*` tokens into 0–1 vec3s. Split from the component so the runtime
 * (React + rAF loop) stays within the file-size budget. No colour is hardcoded
 * here — every palette entry resolves a CSS custom property.
 */

import { FRAGMENT_SHADER, VERTEX_SHADER } from "./nebula-shader";
import { parseHex } from "./starfield-model";

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** A palette colour as a 0–1 RGB triple, ready for `gl.uniform3f`. */
export type Vec3 = readonly [number, number, number];

/**
 * The six palette uniforms and the token each reads from. Order/keys mirror
 * `UNIFORMS` colour entries in {@link ./nebula-shader}.
 */
export const SPACE_PALETTE_TOKENS = {
  canvas: "--ht-space-canvas",
  canvasGlow: "--ht-space-canvas-glow",
  nebula1: "--ht-space-nebula-1",
  nebula2: "--ht-space-nebula-2",
  core: "--ht-space-nebula-core",
  dust: "--ht-space-nebula-dust",
} as const;

export type PaletteKey = keyof typeof SPACE_PALETTE_TOKENS;
export type SpaceGlPalette = Record<PaletteKey, Vec3>;

/**
 * The compiled program plus the vertex buffer it draws from, so the caller can
 * release both GL objects on unmount.
 */
export interface NebulaProgram {
  program: WebGLProgram;
  buffer: WebGLBuffer;
}

/**
 * Resolve every `--ht-space-*` palette token to a 0–1 vec3 (read once). Returns
 * `null` if any token is missing or malformed: `parseHex` on an empty/garbage
 * token would coerce to `[0,0,0]` (silent black), so we validate the raw hex and
 * treat a parse failure as an init failure — the caller then swaps in the CSS
 * fallback rather than rendering an all-black nebula.
 */
export function readSpaceGlPalette(): SpaceGlPalette | null {
  const style = getComputedStyle(document.documentElement);
  const out = {} as Record<PaletteKey, Vec3>;
  for (const key of Object.keys(SPACE_PALETTE_TOKENS) as PaletteKey[]) {
    const raw = style.getPropertyValue(SPACE_PALETTE_TOKENS[key]).trim();
    const h = raw.replace("#", "");
    const hex =
      h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    const [r, g, b] = parseHex(raw);
    out[key] = [r / 255, g / 255, b / 255];
  }
  return out;
}

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Decorative layer, so we fall back rather than toast — but a shader
    // compile error must never vanish silently (no-silent-failure policy).
    console.warn(
      "[nebula] shader compile failed:",
      gl.getShaderInfoLog(shader),
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Compile + link the nebula program and bind a fullscreen-triangle `a_pos`
 * buffer (three verts covering clip space). Returns `null` on any failure so the
 * caller can fall back to the CSS gradient branch. GLSL ES 1.00 compiles on both
 * `webgl2` and `webgl`. The shaders are deleted after a successful link (they
 * live on inside the linked program); on failure every partial object is freed.
 */
export function createNebulaProgram(gl: GL): NebulaProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(
      "[nebula] program link failed:",
      gl.getProgramInfoLog(program),
    );
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // A single triangle large enough to cover the [-1,1] clip square.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return { program, buffer };
}
