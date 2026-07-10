/*
 * Interactive scripted hero demo — "mini-Houston".
 *
 * Auto-plays a short, believable loop for each agent: a prompt types itself into
 * the composer, it "sends", the agent thinks, a task card materializes in the
 * board's Running column, then moves to Done as the agent reports back. Clicking
 * an agent tab jumps to that agent and restarts its loop. Auto-play advances to
 * the next agent on a timer; hovering (or focusing) the demo pauses everything.
 *
 * Standalone: no dependency on Motion (uses WAAPI/CSS). Progressive: the static
 * HTML already shows a finished state, and prefers-reduced-motion leaves it
 * untouched. Scheduling is driven by requestAnimationFrame, so it pauses for
 * free when the tab is hidden.
 */
(() => {
  var root = document.querySelector("[data-hero-demo]");
  if (!root) return;

  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return; // static completed state stands

  var HOUSTON_LOGO = "houston-gray.svg";

  // ── Scripts ──────────────────────────────────────────────────────────────
  // Kept plain-English and non-technical, consistent with the rest of the page.
  var SCRIPTS = [
    {
      name: "Assistant",
      task: "Clear the inbox",
      prompt: "Clear my inbox. Reply to anything urgent, archive the rest.",
      card: {
        label: "Assistant",
        title: "Follow up on urgent email",
        running: "Reading 23 unread, drafting replies",
        done: "4 replies ready, 17 archived",
      },
      reply:
        "On it. 23 unread. Drafting 4 replies and archiving the newsletters.",
      confirm: "Done. 4 replies are waiting for your OK. Inbox at zero.",
    },
    {
      name: "Sales Rep",
      task: "Follow up with leads",
      prompt: "Follow up with every lead that went quiet this week.",
      card: {
        label: "Sales Rep",
        title: "Send 12 follow-ups",
        running: "Personalizing from HubSpot + LinkedIn",
        done: "12 emails sent from Gmail",
      },
      reply: "Found 12 quiet leads. Writing a personal note to each one.",
      confirm: "Sent all 12. Each one references their last conversation.",
    },
    {
      name: "Bookkeeper",
      task: "File March expenses",
      prompt: "Categorize my March expenses in QuickBooks.",
      card: {
        label: "Bookkeeper",
        title: "Categorize 47 transactions",
        running: "Matching your past patterns",
        done: "44 filed, 3 flagged for review",
      },
      reply: "Reading your bank feed. 47 transactions from March.",
      confirm: "Filed 44 and flagged 3 for you. Your books are up to date.",
    },
  ];

  // ── Elements ─────────────────────────────────────────────────────────────
  var tabs = Array.prototype.slice.call(root.querySelectorAll(".hd-tab"));
  var thread = root.querySelector("#hd-thread");
  var composer = root.querySelector("#hd-composer-text");
  var runningBody = root.querySelector("#hd-running");
  var doneBody = root.querySelector("#hd-done");
  var runCountEl = root.querySelector("#hd-run-count");
  var doneCountEl = root.querySelector("#hd-done-count");
  var nameEl = root.querySelector("#hd-agent-name");
  var taskEl = root.querySelector("#hd-agent-task");
  if (!thread || !composer || !runningBody || !doneBody) return;

  var PLACEHOLDER = "Tell your agent what to do...";

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
    c.className = "kanban-card-mock running hd-enter";
    c.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
      '<img src="' +
      HOUSTON_LOGO +
      '" width="14" height="14" alt="" style="flex-shrink:0;">' +
      '<span style="font-size:11px;color:var(--gray-500);">' +
      script.card.label +
      "</span></div>" +
      '<div class="kanban-card-title">' +
      script.card.title +
      "</div>" +
      '<div class="kanban-card-desc">' +
      script.card.running +
      "</div>" +
      '<div class="kanban-card-status status-running"><span class="dot"></span> Working</div>';
    return c;
  }

  function completeCard(card, doneText) {
    // FLIP: measure, reparent to Done, animate from the old position.
    var first = card.getBoundingClientRect();
    card.classList.remove("running");
    doneBody.appendChild(card);
    var last = card.getBoundingClientRect();
    card.querySelector(".kanban-card-desc").textContent = doneText;
    var status = card.querySelector(".kanban-card-status");
    status.className = "kanban-card-status status-done";
    status.innerHTML =
      '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M2 6l3 3 5-5"/></svg> Done';
    var dx = first.left - last.left;
    var dy = first.top - last.top;
    if ((dx || dy) && card.animate) {
      card.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
        { duration: 460, easing: "cubic-bezier(0.16,1,0.3,1)" },
      );
    }
  }

  function setActive(idx) {
    tabs.forEach((t, i) => {
      var on = i === idx;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function reset(idx) {
    var s = SCRIPTS[idx];
    clear(thread);
    clear(runningBody);
    clear(doneBody);
    runCountEl.textContent = "0";
    doneCountEl.textContent = "0";
    composer.textContent = PLACEHOLDER;
    composer.classList.remove("typed", "hd-caret");
    if (nameEl) nameEl.textContent = s.name;
    if (taskEl) taskEl.textContent = s.task;
    setActive(idx);
  }

  async function typePrompt(text) {
    composer.textContent = "";
    composer.classList.add("typed", "hd-caret");
    for (const ch of text) {
      composer.textContent += ch;
      await gate(ch === " " ? 34 : 26 + Math.random() * 30);
    }
  }

  // ── The scripted loop for one agent ──────────────────────────────────────
  async function play(idx) {
    var s = SCRIPTS[idx];

    await gate(500);
    await typePrompt(s.prompt); // prompt types itself
    await gate(360);

    composer.classList.remove("hd-caret");
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

    await gate(2800); // hold, then advance
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
    root.querySelector(".hd").classList.toggle("hd-paused", p);
  }
  root.addEventListener("pointerenter", () => {
    setPaused(true);
  });
  root.addEventListener("pointerleave", () => {
    setPaused(false);
  });
  root.addEventListener("focusin", () => {
    setPaused(true);
  });
  root.addEventListener("focusout", () => {
    if (!root.contains(document.activeElement)) setPaused(false);
  });

  // ── Tabs ─────────────────────────────────────────────────────────────────
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      run(i);
    });
  });

  // ── Go ───────────────────────────────────────────────────────────────────
  run(0);
})();
