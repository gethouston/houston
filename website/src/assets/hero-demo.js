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
  if (reduce?.matches) return;

  var AGENTS = data.agents;
  var SCRIPTS = data.scripts;

  var runningBody = root.querySelector("#hd-running");
  var doneBody = root.querySelector("#hd-done");
  var runCountEl = root.querySelector("#hd-run-count");
  var doneCountEl = root.querySelector("#hd-done-count");
  if (!runningBody || !doneBody || !runCountEl || !doneCountEl) return;

  var stage = window.createHeroDemoStage(root, AGENTS);

  var clock = window.createHeroDemoClock();
  var gate = clock.gate;

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function makeCard(agent, script) {
    var c = document.createElement("div");
    c.className = "tcard running hd-enter";
    var faces = window.heroFacesHtml
      ? window.heroFacesHtml(script.card.people)
      : "";
    c.innerHTML =
      '<div class="tc-head">' +
      '<span class="av ' +
      agent.av +
      '"></span>' +
      '<span class="tc-agent"></span></div>' +
      '<div class="tc-title"></div>' +
      '<div class="tc-desc"></div>' +
      (faces ? `<div class="faces" aria-hidden="true">${faces}</div>` : "");
    c.querySelector(".tc-agent").textContent = agent.name;
    c.querySelector(".tc-title").textContent = script.card.title;
    c.querySelector(".tc-desc").textContent = script.card.running;
    return c;
  }

  function completeCard(card, doneText) {
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

  async function play(idx) {
    var s = SCRIPTS[idx];

    await gate(600);

    var card = makeCard(AGENTS[s.agent], s);
    runningBody.appendChild(card);
    runCountEl.textContent = "1";
    await gate(1900);

    completeCard(card, s.card.done);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "1";

    await gate(2600);
  }

  function run(idx) {
    clock.newRun();
    reset(idx);
    play(idx).then(
      () => {
        run((idx + 1) % SCRIPTS.length);
      },
      () => {},
    );
  }

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

  run(0);
})();
