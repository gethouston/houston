window.createHeroDemoClock = () => {
  var token = 0;
  var paused = false;
  var CANCEL = {};

  return {
    CANCEL,

    newRun() {
      token++;
    },

    setPaused(p) {
      paused = p;
    },

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
          var dt = Math.min(now - last, 50);
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
