/*
 * Interactive scripted hero demo — a faithful mini Houston, running inside the
 * true-to-app hero board (the real light Mission Control chrome in hero.njk).
 *
 * Auto-plays a fast loop through four missions (window.HERO_DEMO,
 * hero-demo-data.js), each run by a different sidebar agent: the sidebar
 * highlight, board title and "Needs you" card switch per mission (via
 * hero-demo-stage.js) while a Running card materializes in the Running column
 * and FLIPs across to Done on the beat the work finishes. Overlapping those
 * beats is what makes it read as a live app, not a slideshow. Hover/focus
 * pauses. Standalone (no Motion dependency; WAAPI/CSS only). Progressive: with
 * JS off or prefers-reduced-motion, the static finished HTML board stands.
 */
(() => {
  var root = document.querySelector("[data-hero-demo]");
  var data = window.HERO_DEMO;
  if (
    !root ||
    !data ||
    !window.createHeroDemoClock ||
    !window.createHeroDemoStage
  )
    return;

  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return; // static completed state stands

  var AGENTS = data.agents;
  var SCRIPTS = data.scripts;

  // ── Elements ─────────────────────────────────────────────────────────────
  var runningBody = root.querySelector("#hd-running");
  var doneBody = root.querySelector("#hd-done");
  var runCountEl = root.querySelector("#hd-run-count");
  var doneCountEl = root.querySelector("#hd-done-count");
  if (!runningBody || !doneBody || !runCountEl || !doneCountEl) return;

  // Static-DOM agent switcher (assets/hero-demo-stage.js).
  var stage = window.createHeroDemoStage(root, AGENTS);

  // Cancellable, pausable rAF clock (assets/hero-demo-clock.js).
  var clock = window.createHeroDemoClock();
  var gate = clock.gate;

  // ── DOM helpers ──────────────────────────────────────────────────────────
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function makeCard(agent, script) {
    var c = document.createElement("div");
    c.className = "tcard running hd-enter";
    c.innerHTML =
      '<div class="tc-head">' +
      '<span class="av ' +
      agent.av +
      '"></span>' +
      '<span class="tc-agent"></span></div>' +
      '<div class="tc-title"></div>' +
      '<div class="tc-desc"></div>';
    c.querySelector(".av").textContent = agent.initials;
    c.querySelector(".tc-agent").textContent = agent.name;
    c.querySelector(".tc-title").textContent = script.card.title;
    c.querySelector(".tc-desc").textContent = script.card.running;
    return c;
  }

  function completeCard(card, doneText) {
    // FLIP: measure, reparent to Done, animate from the old position.
    var first = card.getBoundingClientRect();
    card.classList.remove("running");
    doneBody.appendChild(card);
    var last = card.getBoundingClientRect();
    card.querySelector(".tc-desc").textContent = doneText;
    var dx = first.left - last.left;
    var dy = first.top - last.top;
    if ((dx || dy) && card.animate) {
      card.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
        { duration: 460, easing: "cubic-bezier(0.16,1,0.3,1)" },
      );
    }
  }

  function reset(idx) {
    clear(runningBody);
    clear(doneBody);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "0";
    stage.setMission(SCRIPTS[idx]);
  }

  // ── One mission: the board title + agent switch, then Running to Done ─────
  async function play(idx) {
    var s = SCRIPTS[idx];

    await gate(600);

    // The mission card materializes in Running.
    var card = makeCard(AGENTS[s.agent], s);
    runningBody.appendChild(card);
    runCountEl.textContent = "1";
    await gate(1900);

    // The card FLIPs across to Done as the work finishes.
    completeCard(card, s.card.done);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "1";

    await gate(2600); // hold the finished state, then next agent
  }

  function run(idx) {
    clock.newRun();
    reset(idx);
    play(idx).then(
      () => {
        run((idx + 1) % SCRIPTS.length);
      },
      () => {
        /* cancelled by a newer run — do nothing */
      },
    );
  }

  // ── Pause on hover / focus ───────────────────────────────────────────────
  function setPaused(p) {
    clock.setPaused(p);
    root.classList.toggle("hd-paused", p);
  }
  root.addEventListener("pointerenter", () => setPaused(true));
  root.addEventListener("pointerleave", () => setPaused(false));
  root.addEventListener("focusin", () => setPaused(true));
  root.addEventListener("focusout", () => {
    if (!root.contains(document.activeElement)) setPaused(false);
  });

  // ── Go ───────────────────────────────────────────────────────────────────
  run(0);
})();
