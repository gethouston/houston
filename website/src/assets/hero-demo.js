/*
 * Interactive scripted hero demo — a faithful mini Houston.
 *
 * Auto-plays a short, believable loop inside the mockup's Mission Control: a
 * prompt types itself into the chat composer, it "sends", the agent thinks, a
 * mission card materializes in the board's Running column, then FLIPs to Done as
 * the agent reports back. The loop cycles through a few real-world missions (all
 * run by the single "Houston" agent, exactly as the real app models it).
 * Hovering (or focusing) the demo pauses everything.
 *
 * Standalone: no Motion dependency (WAAPI/CSS only). Progressive: the static
 * HTML already shows a finished state, and prefers-reduced-motion leaves it
 * untouched. Scheduling is rAF-driven, so it pauses for free when hidden.
 */
(() => {
  var root = document.querySelector("[data-hero-demo]");
  if (!root) return;

  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return; // static completed state stands

  var LOGO = "houston-black.svg";

  // ── Missions (plain-English, non-technical, single Houston agent) ─────────
  var SCRIPTS = [
    {
      mission: "Clear the inbox",
      prompt: "Clear my inbox. Reply to anything urgent, archive the rest.",
      card: {
        title: "Follow up on urgent email",
        running: "Reading 23 unread, drafting replies",
        done: "4 replies ready, 17 archived",
      },
      reply:
        "On it. 23 unread. Drafting 4 replies and archiving the newsletters.",
      confirm: "Done. 4 replies are waiting for your OK. Inbox at zero.",
    },
    {
      mission: "Follow up with leads",
      prompt: "Follow up with every lead that went quiet this week.",
      card: {
        title: "Send 12 follow-ups",
        running: "Personalizing from HubSpot + LinkedIn",
        done: "12 emails sent from Gmail",
      },
      reply: "Found 12 quiet leads. Writing a personal note to each one.",
      confirm: "Sent all 12. Each one references their last conversation.",
    },
    {
      mission: "File March expenses",
      prompt: "Categorize my March expenses in QuickBooks.",
      card: {
        title: "Categorize 47 transactions",
        running: "Matching your past patterns",
        done: "44 filed, 3 flagged for review",
      },
      reply: "Reading your bank feed. 47 transactions from March.",
      confirm: "Filed 44 and flagged 3 for you. Your books are up to date.",
    },
  ];

  // ── Elements ─────────────────────────────────────────────────────────────
  var thread = root.querySelector("#hd-thread");
  var composer = root.querySelector("#hd-composer-text");
  var runningBody = root.querySelector("#hd-running");
  var doneBody = root.querySelector("#hd-done");
  var runCountEl = root.querySelector("#hd-run-count");
  var doneCountEl = root.querySelector("#hd-done-count");
  var missionEl = root.querySelector("#hd-mission");
  if (!thread || !composer || !runningBody || !doneBody) return;

  var PLACEHOLDER = "Send a follow-up...";

  // ── Cancellable, pausable clock ──────────────────────────────────────────
  var token = 0;
  var paused = false;
  var CANCEL = {};

  function gate(ms) {
    var mine = token;
    return new Promise((resolve, reject) => {
      var elapsed = 0;
      var last = performance.now();
      function tick(now) {
        if (mine !== token) {
          reject(CANCEL);
          return;
        }
        var dt = Math.min(now - last, 50); // clamp gaps (hidden tab / pause)
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
  }

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

  function makeCard(script) {
    var c = document.createElement("div");
    c.className = "mc-card running hd-enter";
    c.innerHTML =
      '<div class="mc-card-head">' +
      '<span class="m-avatar"><img src="' +
      LOGO +
      '" width="11" height="11" alt=""></span>' +
      '<span class="mc-card-agent">Houston</span></div>' +
      '<div class="mc-card-title">' +
      script.card.title +
      "</div>" +
      '<div class="mc-card-desc">' +
      script.card.running +
      "</div>";
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
    var s = SCRIPTS[idx];
    clear(thread);
    clear(runningBody);
    clear(doneBody);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "0";
    composer.textContent = PLACEHOLDER;
    composer.classList.remove("typed", "mc-caret");
    if (missionEl) missionEl.textContent = s.mission;
  }

  async function typePrompt(text) {
    composer.textContent = "";
    composer.classList.add("typed", "mc-caret");
    for (const ch of text) {
      composer.textContent += ch;
      await gate(ch === " " ? 34 : 26 + Math.random() * 30);
    }
  }

  // ── The scripted loop for one mission ────────────────────────────────────
  async function play(idx) {
    var s = SCRIPTS[idx];

    await gate(500);
    await typePrompt(s.prompt); // prompt types itself
    await gate(360);

    composer.classList.remove("mc-caret");
    composer.textContent = PLACEHOLDER; // send: composer clears
    composer.classList.remove("typed");
    bubble("user", s.prompt);
    await gate(520);

    var card = makeCard(s); // task materializes in Running
    runningBody.appendChild(card);
    runCountEl.textContent = "1";
    await gate(420);

    var dots = typingDots(); // agent thinks
    await gate(950);
    if (dots.parentNode) dots.parentNode.removeChild(dots);
    bubble("assistant", s.reply);
    await gate(1650);

    completeCard(card, s.card.done); // Running -> Done
    runCountEl.textContent = "0";
    doneCountEl.textContent = "1";
    await gate(420);

    var dots2 = typingDots();
    await gate(720);
    if (dots2.parentNode) dots2.parentNode.removeChild(dots2);
    bubble("assistant", s.confirm);

    await gate(2800); // hold, then advance to the next mission
  }

  function run(idx) {
    token++;
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
    paused = p;
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
