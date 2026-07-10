/*
 * Interactive scripted hero demo — a faithful mini Houston.
 *
 * Auto-plays a fast ~30s loop inside the mockup's Mission Control: four
 * missions (window.HERO_DEMO, hero-demo-data.js), each run by a different
 * sidebar agent — sidebar highlight, board title and chat head switch per
 * mission. The board and chat move TOGETHER: the Running card materializes
 * on the beat the agent starts thinking and FLIPs to Done on the beat the
 * confirmation lands — overlapping the panels (not strictly sequencing them)
 * is what makes it read as a live app, not a slideshow. Hover/focus pauses.
 * Standalone (no Motion dependency; WAAPI/CSS only). Progressive: with JS
 * off or prefers-reduced-motion, the static finished HTML state stands.
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

  var LOGO = "houston-black.svg";
  var AGENTS = data.agents;
  var SCRIPTS = data.scripts;

  // ── Elements ─────────────────────────────────────────────────────────────
  var thread = root.querySelector("#hd-thread");
  var composer = root.querySelector("#hd-composer-text");
  var runningBody = root.querySelector("#hd-running");
  var doneBody = root.querySelector("#hd-done");
  var runCountEl = root.querySelector("#hd-run-count");
  var doneCountEl = root.querySelector("#hd-done-count");
  if (!thread || !composer || !runningBody || !doneBody) return;

  // Static-DOM agent switcher (assets/hero-demo-stage.js).
  var stage = window.createHeroDemoStage(root, AGENTS);

  var PLACEHOLDER = "Send a follow-up...";

  // Cancellable, pausable rAF clock (assets/hero-demo-clock.js).
  var clock = window.createHeroDemoClock();
  var gate = clock.gate;

  // ── DOM helpers ──────────────────────────────────────────────────────────
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function bubble(role, text) {
    var b = document.createElement("div");
    b.className = `chat-msg ${role} hd-enter`;
    b.textContent = text;
    thread.appendChild(b);
    return b;
  }

  function typingDots() {
    var d = document.createElement("div");
    d.className = "typing-dots hd-enter";
    d.innerHTML = "<span></span><span></span><span></span>";
    thread.appendChild(d);
    return d;
  }

  function makeCard(agent, script) {
    var c = document.createElement("div");
    c.className = "mc-card running hd-enter";
    c.innerHTML =
      '<div class="mc-card-head">' +
      '<span class="m-avatar" style="background:' +
      agent.tint +
      '"><img src="' +
      LOGO +
      '" width="11" height="11" alt=""></span>' +
      '<span class="mc-card-agent"></span></div>' +
      '<div class="mc-card-title"></div>' +
      '<div class="mc-card-desc"></div>';
    c.querySelector(".mc-card-agent").textContent = agent.name;
    c.querySelector(".mc-card-title").textContent = script.card.title;
    c.querySelector(".mc-card-desc").textContent = script.card.running;
    return c;
  }

  function completeCard(card, doneText) {
    // FLIP: measure, reparent to Done, animate from the old position.
    var first = card.getBoundingClientRect();
    card.classList.remove("running");
    doneBody.appendChild(card);
    var last = card.getBoundingClientRect();
    card.querySelector(".mc-card-desc").textContent = doneText;
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
    clear(thread);
    clear(runningBody);
    clear(doneBody);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "0";
    composer.textContent = PLACEHOLDER;
    composer.classList.remove("typed", "mc-caret");
    stage.setMission(SCRIPTS[idx]);
  }

  async function typePrompt(text) {
    composer.textContent = "";
    composer.classList.add("typed", "mc-caret");
    for (const ch of text) {
      composer.textContent += ch;
      await gate(ch === " " ? 12 : 10 + Math.random() * 8);
    }
  }

  // ── One mission (~7.5s): chat and board move together, not in turn ───────
  async function play(idx) {
    var s = SCRIPTS[idx];

    await gate(400);
    await typePrompt(s.prompt); // prompt types itself, fast
    await gate(200);

    composer.classList.remove("mc-caret");
    composer.textContent = PLACEHOLDER; // send: composer clears
    composer.classList.remove("typed");
    bubble("user", s.prompt);
    await gate(350);

    // Same beat: the mission card materializes in Running WHILE the agent
    // starts thinking in the chat.
    var card = makeCard(AGENTS[s.agent], s);
    runningBody.appendChild(card);
    runCountEl.textContent = "1";
    var dots = typingDots();
    await gate(650);

    if (dots.parentNode) dots.parentNode.removeChild(dots);
    bubble("assistant", s.reply);
    await gate(1300);

    var dots2 = typingDots();
    await gate(450);
    if (dots2.parentNode) dots2.parentNode.removeChild(dots2);

    // Same beat: the card FLIPs to Done AS the confirmation lands.
    completeCard(card, s.card.done);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "1";
    bubble("assistant", s.confirm);

    await gate(2400); // hold the finished state, then next agent
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
