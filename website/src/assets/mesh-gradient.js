/*
 * Animated mesh-gradient hero background.
 *
 * A single hand-written GLSL fragment shader draws a slow, barely-moving field
 * of pastel colour over transparency, composited on top of the static
 * `.hero-bg` radial gradients (which stay as the fallback when WebGL is
 * unavailable). Deliberately restrained: alpha peaks around 0.30, colours are
 * the site's own accents desaturated toward white, so it reads as an elegant
 * drift rather than a saturated rainbow.
 *
 * Performance contract (see task spec):
 *   - Never blocks LCP: init is deferred to idle time after first paint.
 *   - Pauses when the tab is hidden (visibilitychange) and when the hero is
 *     scrolled out of view (IntersectionObserver).
 *   - Respects prefers-reduced-motion: does not init at all (static gradient).
 *   - Renders at a reduced internal resolution — the field is low-frequency and
 *     blurred by nature, so the cost is negligible.
 */
(() => {
  var canvas = document.querySelector(".hero-mesh");
  if (!canvas) return;

  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

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
    "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }",
    "  return v;",
    "}",
    "void main(){",
    "  vec2 uv = vUv;",
    "  uv.x *= uRes.x / uRes.y;", // aspect correct so blobs stay round
    "  float t = uTime * 0.028;", // slow drift
    "  vec2 q = vec2(fbm(uv * 1.15 + vec2(0.0, t)), fbm(uv * 1.15 + vec2(5.2, -t)));",
    "  vec2 r = vec2(fbm(uv * 1.35 + 3.6 * q + vec2(1.7, t * 0.7)), fbm(uv * 1.35 + 3.6 * q + vec2(8.3, -t * 0.6)));",
    "  float f = fbm(uv * 1.6 + 3.6 * r);",
    "  float m1 = smoothstep(0.25, 0.95, f);", // blue field
    "  float m2 = smoothstep(0.30, 1.00, r.x);", // peach field
    "  float m3 = smoothstep(0.22, 0.92, q.y);", // indigo field
    "  vec3 blue   = vec3(0.24, 0.52, 0.96);",
    "  vec3 indigo = vec3(0.51, 0.55, 0.97);",
    "  vec3 peach  = vec3(0.99, 0.60, 0.30);",
    "  float w1 = m1 * 0.9, w2 = m2 * 0.55, w3 = m3 * 0.8;",
    "  float wsum = w1 + w2 + w3;",
    "  vec3 col = (blue * w1 + indigo * w3 + peach * w2) / max(wsum, 0.001);",
    "  float alpha = smoothstep(0.0, 1.25, wsum) * 0.30;", // subtle, perceptible, never loud
    "  gl_FragColor = vec4(col, alpha);",
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
    if (!gl) return; // no WebGL: static .hero-bg remains, nothing more to do

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

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // Low internal resolution — the field is soft, so this is invisible and cheap.
    var SCALE = 0.62;
    function resize() {
      var w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      var h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    }

    var running = false;
    var raf = 0;
    var start = performance.now();
    var elapsed = 0;
    var last = start;

    function frame(now) {
      if (!running) return;
      elapsed += Math.min(now - last, 50); // clamp gaps from throttling/pauses
      last = now;
      resize();
      gl.uniform1f(uTime, elapsed / 1000);
      gl.clear(gl.COLOR_BUFFER_BIT);
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

    // Pause when scrolled out of view.
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

    // Pause when the tab is hidden.
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
