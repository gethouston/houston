/*
 * Cancellable, pausable rAF clock for the scripted hero demo.
 *
 * `gate(ms)` resolves after ms of UNPAUSED time — scheduling is rAF-driven,
 * so it stops for free when the tab is hidden, and per-frame deltas are
 * clamped so a long hidden gap never fast-forwards the script. `newRun()`
 * invalidates every pending gate from the previous run: each rejects with
 * the shared `CANCEL` sentinel, which the caller treats as "an old loop
 * died, do nothing".
 *
 * Loaded before hero-demo.js (both `defer`, in order), which calls
 * `window.createHeroDemoClock()`.
 */
window.createHeroDemoClock = () => {
  var token = 0;
  var paused = false;
  var CANCEL = {};

  return {
    CANCEL,

    /** Invalidate all gates issued before this call (starts a new run). */
    newRun() {
      token++;
    },

    setPaused(p) {
      paused = p;
    },

    /** Resolve after `ms` of unpaused time; reject with CANCEL on newRun. */
    gate(ms) {
      var mine = token;
      return new Promise((resolve, reject) => {
        var elapsed = 0;
        var last = performance.now();
        function tick(now) {
          if (mine !== token) {
            reject(CANCEL);
            return;
          }
          var dt = Math.min(now - last, 50); // clamp gaps (hidden tab)
          last = now;
          if (!paused) elapsed += dt;
          if (elapsed >= ms) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    },
  };
};
