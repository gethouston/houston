/*
 * Dark "Mission Control" galaxy hero background.
 *
 * A single hand-written GLSL fragment shader paints an opaque deep-space scene
 * behind the hero: slowly drifting, twinkling starfields in parallax layers,
 * faint domain-warped nebula wisps, and a soft glow toward the horizon. Colours
 * are Houston's own design-token `space.*` palette (packages/design-tokens):
 * canvas #07080f, nebula indigo #38346b / teal #14384c / core #b8b2e8, stars
 * #dce2f7 (cool) and #f6e7cd (warm). It reads as brand — the astronaut logo,
 * Mission Control — not as a gimmick.
 *
 * THREE variants, switchable live via `?bg=subtle|galaxy|nebula` for comparison:
 *   - subtle : sparse stars, one faint nebula glow. The quiet, premium option.
 *   - galaxy : (default) a diagonal Milky-Way band of denser stars + dust and
 *              two nebula wisps, gentle parallax. The "wow" option.
 *   - nebula : nebula-forward — larger, more colourful gas clouds, fewer but
 *              brighter stars. Painterly.
 *
 * Performance contract (unchanged from the previous hero background):
 *   - Never blocks LCP: init is deferred to idle time after first paint.
 *   - Pauses when the tab is hidden (visibilitychange) and when the hero is
 *     scrolled out of view (IntersectionObserver).
 *   - Respects prefers-reduced-motion: does not init at all — the static
 *     `.hero-bg` glow + CSS `.hero-stars` are the fallback look.
 *   - No WebGL: same static fallback (the canvas stays transparent).
 *   - Renders at a reduced internal resolution; the field is soft and cheap.
 */
(() => {
  var canvas = document.querySelector(".hero-galaxy");
  if (!canvas) return;

  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

  // Variant selection via ?bg= ; default is the "galaxy" band.
  var VARIANTS = { subtle: 0, galaxy: 1, nebula: 2 };
  var param = new URLSearchParams(window.location.search).get("bg");
  var variant = VARIANTS[param] != null ? VARIANTS[param] : VARIANTS.galaxy;

  var VERT = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPos * 0.5 + 0.5;",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}",
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform float uTime;",
    "uniform vec2 uRes;",
    "uniform int uVariant;",

    // ── hashing / noise ──────────────────────────────────────────────
    "float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }",
    "vec2 hash22(vec2 p){ float n = sin(dot(p, vec2(41.0, 289.0))); return fract(vec2(262144.0, 32768.0) * n); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.0 + 11.3; a *= 0.5; }",
    "  return v;",
    "}",

    // ── a parallax star layer ────────────────────────────────────────
    // Tiles space into cells; ~half the cells hold a star at a random
    // offset, with per-star brightness, colour temperature and twinkle.
    "vec3 starLayer(vec2 uv, float density, float bright, float tw){",
    "  uv *= density;",
    "  vec2 gv = fract(uv) - 0.5;",
    "  vec2 id = floor(uv);",
    "  vec3 acc = vec3(0.0);",
    "  for (int y = -1; y <= 1; y++){",
    "    for (int x = -1; x <= 1; x++){",
    "      vec2 offs = vec2(float(x), float(y));",
    "      vec2 h = hash22(id + offs);",
    "      float present = step(0.55, hash21(id + offs + 7.13));",
    "      vec2 sp = offs + (h - 0.5) * 0.85 - gv;",
    "      float d = length(sp);",
    "      float b = hash21(id + offs + 3.37);",
    "      float core = smoothstep(0.09, 0.0, d);",
    "      float halo = smoothstep(0.42, 0.0, d) * 0.16;",
    "      float twinkle = 0.55 + 0.45 * sin(uTime * tw * (0.6 + b) + b * 6.2831);",
    "      float m = present * (core + halo) * (0.28 + 0.72 * b) * twinkle;",
    "      vec3 cool = vec3(0.863, 0.886, 0.969);", // #dce2f7
    "      vec3 warm = vec3(0.965, 0.906, 0.804);", // #f6e7cd
    "      vec3 tint = mix(cool, warm, smoothstep(0.82, 1.0, b));",
    "      acc += tint * m;",
    "    }",
    "  }",
    "  return acc * bright;",
    "}",

    // ── domain-warped nebula ─────────────────────────────────────────
    "vec3 nebula(vec2 p, float t, out float dens){",
    "  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.03)), fbm(p + vec2(5.2, -t * 0.028)));",
    "  vec2 r = vec2(fbm(p + 2.4 * q + vec2(1.7, t * 0.02)), fbm(p + 2.4 * q + vec2(8.3, -t * 0.018)));",
    "  float f = fbm(p + 3.0 * r);",
    "  dens = f;",
    "  vec3 indigo = vec3(0.220, 0.204, 0.419);", // #38346b
    "  vec3 teal   = vec3(0.078, 0.220, 0.298);", // #14384c
    "  vec3 core   = vec3(0.722, 0.698, 0.910);", // #b8b2e8
    "  vec3 col = mix(indigo, teal, clamp(r.x * 1.5, 0.0, 1.0));",
    "  col = mix(col, core, pow(clamp(f, 0.0, 1.0), 3.0) * 0.55);",
    "  return col;",
    "}",

    "void main(){",
    "  float aspect = uRes.x / uRes.y;",
    "  vec2 suv = (vUv - 0.5); suv.x *= aspect;", // centred, aspect-correct
    "  float t = uTime;",

    "  vec3 canvasCol = vec3(0.027, 0.031, 0.059);", // #07080f space-canvas
    "  vec3 glowCol   = vec3(0.063, 0.078, 0.188);", // #101430 canvas-glow
    "  vec3 col = canvasCol;",

    // horizon glow: a soft pool of light low-centre, so the hero has depth
    "  float glow = smoothstep(1.05, 0.0, length((vUv - vec2(0.5, 0.62)) * vec2(aspect * 0.85, 1.0)));",
    "  col += glowCol * glow * 0.9;",

    // per-variant tuning
    "  float nebAmt = 0.16; float starMul = 1.0;",
    "  if (uVariant == 0){ nebAmt = 0.10; starMul = 0.85; }", // subtle
    "  if (uVariant == 1){ nebAmt = 0.22; starMul = 1.0; }", // galaxy
    "  if (uVariant == 2){ nebAmt = 0.52; starMul = 0.72; }", // nebula

    // galaxy variant: concentrate stars + gas into a diagonal Milky-Way band
    "  float bandMask = 1.0;",
    "  if (uVariant == 1){",
    "    float ang = -0.62;",
    "    float ry = suv.x * sin(ang) + suv.y * cos(ang);",
    "    float wob = 0.05 * fbm(suv * 1.4 + t * 0.01);",
    "    bandMask = exp(-pow((ry + wob) / 0.34, 2.0));",
    "  }",

    // nebula
    "  float dens;",
    "  vec2 np = (uVariant == 2) ? suv * 1.15 : suv * 1.45;",
    "  vec3 neb = nebula(np, t, dens);",
    "  float nebFalloff = (uVariant == 1) ? mix(0.35, 1.0, bandMask) : 1.0;",
    "  col += neb * smoothstep(0.15, 1.1, dens) * nebAmt * nebFalloff;",

    // starfields — parallax layers drifting at different speeds
    "  float bandBoost = (uVariant == 1) ? (0.35 + 0.65 * bandMask) : 1.0;",
    "  vec3 stars = vec3(0.0);",
    "  stars += starLayer(suv + vec2(t * 0.006, 0.0), 9.0,  0.55, 1.1);",
    "  stars += starLayer(suv + vec2(t * 0.011, t * 0.002), 15.0, 0.40, 1.7);",
    "  stars += starLayer(suv + vec2(t * 0.017, 0.0), 24.0, 0.30, 2.3) * bandBoost;",
    "  col += stars * starMul * (0.7 + 0.3 * bandBoost);",

    // gentle vignette so the hero edges settle into the dark
    "  float vig = smoothstep(1.3, 0.35, length(suv));",
    "  col *= mix(0.72, 1.0, vig);",

    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function init() {
    var gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
    });
    if (!gl) return; // no WebGL: static .hero-bg + .hero-stars remain

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    var aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uTime = gl.getUniformLocation(prog, "uTime");
    var uRes = gl.getUniformLocation(prog, "uRes");
    gl.uniform1i(gl.getUniformLocation(prog, "uVariant"), variant);

    // Opaque scene, so once the canvas paints it fully covers the fallback.
    canvas.style.opacity = "1";

    // Low internal resolution — the field is soft, so this is cheap and unseen.
    var SCALE = 0.6;
    var maxDim = 1400; // hard cap so huge/hidpi viewports stay affordable
    function resize() {
      var cw = canvas.clientWidth || 1;
      var ch = canvas.clientHeight || 1;
      var scale = Math.min(SCALE, maxDim / Math.max(cw, ch));
      var w = Math.max(1, Math.round(cw * scale));
      var h = Math.max(1, Math.round(ch * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    }

    var running = false;
    var raf = 0;
    var elapsed = 0;
    var last = performance.now();

    function frame(now) {
      if (!running) return;
      elapsed += Math.min(now - last, 50); // clamp gaps from throttling/pauses
      last = now;
      resize();
      gl.uniform1f(uTime, elapsed / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    var onScreen = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          onScreen = entries[0].isIntersecting;
          if (onScreen && !document.hidden) play();
          else stop();
        },
        { threshold: 0 },
      ).observe(canvas);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (onScreen) play();
    });

    var resizeTimer;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
      },
      { passive: true },
    );

    resize();
    play();
  }

  // Defer past first paint so the shader never competes with LCP.
  function schedule() {
    if ("requestIdleCallback" in window)
      requestIdleCallback(init, { timeout: 1200 });
    else setTimeout(init, 200);
  }
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();
