/*
 * Multiplayer chat replay (landing #multiplayer). Four use-case pills; picking
 * one rewrites the shared thread — the agent header (name + mission + helmet
 * color), the participant face stack, and every turn — then replays it: turns
 * appear in sequence, a typing indicator precedes each agent turn, and the
 * thread loops. Turns come from real people (photo avatars) AND the agent (a
 * tinted Houston helmet), so the preview reads as a genuine multi-person
 * conversation doing complex work across real tool integrations, not a demo.
 *
 * Text is translated: it comes from window.HOUSTON_I18N (js.chat and js.people,
 * emitted by _includes/landing/i18n-data.njk before this asset), with the
 * English copy below as the fallback. The structure mirrors _data/landing.js
 * chat — pill order, helmet colors, the people in each room and who speaks each
 * turn — which stays the source of truth; a classic script cannot import it, so
 * the small structure is copied here.
 *
 * Presentational only, no network. Loaded `defer`. Scenario 0 (Sales) is also
 * inlined in multiplayer.njk so JS-off shows a full settled thread; with
 * prefers-reduced-motion this script renders the settled thread and does NOT
 * loop. Copy rules: plain English, non-technical, no em dashes.
 */
(() => {
  var root = document.querySelector("[data-chat-demo]");
  if (!root) return;

  function t(path, fallback) {
    return window.houstonT ? window.houstonT(path, fallback) : fallback;
  }

  // Human participants — real teammate photos (astronaut headshots), circular.
  var PEOPLE = {
    julian: {
      name: t("people.julian", "Julian"),
      s: "/assets/img/julian-48.webp",
      d: "/assets/img/julian-96.webp",
    },
    felipe: {
      name: t("people.felipe", "Felipe"),
      s: "/assets/img/felipe-48.webp",
      d: "/assets/img/felipe-96.webp",
    },
  };

  // Structure of each scenario: the shared agent's helmet-color av, the people
  // in the room, and who speaks each turn (a PEOPLE key or "agent"). Zips by
  // index with the locale's turns. Every story is complex, multi-step work with
  // a SECOND human jumping in to redirect (the multiplayer signal). Agents act
  // across their real integrations only.
  var STRUCTURE = [
    {
      id: "sales",
      av: "av-c",
      people: ["julian", "felipe"],
      turns: ["julian", "agent", "felipe", "agent", "julian", "agent"],
    },
    {
      id: "bookkeeping",
      av: "av-o",
      people: ["felipe", "julian"],
      turns: ["felipe", "agent", "julian", "agent", "felipe", "agent"],
    },
    {
      id: "hiring",
      av: "av-g",
      people: ["julian", "felipe"],
      turns: ["julian", "agent", "felipe", "agent", "julian", "agent"],
    },
    {
      id: "support",
      av: "av-b",
      people: ["felipe", "julian"],
      turns: ["felipe", "agent", "julian", "agent", "felipe", "agent"],
    },
  ];

  // English fallback copy, same shape as window.HOUSTON_I18N.chat.scenarios.
  var FALLBACK = {
    sales: {
      label: "Sales",
      agent: "Sales Rep",
      mission: "Rebuild the Q3 pipeline report",
      turns: [
        "Rebuild the Q3 pipeline report. Pull every open deal from HubSpot, match it against the email threads in Gmail, and tell me what will really close.",
        "Working through it. 63 open deals in HubSpot, cross-checked against Gmail. 12 have gone quiet for 3+ weeks, and 5 are stuck waiting on a contract from us.",
        "Exclude the churned accounts, and add the renewals coming up this quarter. @Julian the stalled ones are your call.",
        "Updated. Dropped 4 churned accounts, added 9 renewals. Weighted pipeline is $1.4M, with $380K at real risk from the stalled threads.",
        "Chase the stalled ones. Put it where the whole team can see it.",
        "Done. The report is on the shared board, at-risk deals flagged, a follow-up drafted for each. @Julian please confirm and I'll send all 12.",
      ],
    },
    bookkeeping: {
      label: "Bookkeeping",
      agent: "Bookkeeper",
      mission: "Close last month's books",
      turns: [
        "Close out last month. Pull every transaction from Stripe and the bank, match them up, and flag anything that does not reconcile.",
        "On it. 842 transactions across Stripe and the bank feed. 838 matched cleanly. 3 bank charges have no invoice, and 1 refund is logged twice. @Julian that refund looks like yours, can you confirm?",
        "Confirmed, we issued it by mistake. Categorize the 3 charges as software.",
        "Done. Refund noted, 3 charges filed under software. The books balance to the cent.",
        "Great. Send it to the accountant.",
        "Sent. The reconciled month is with the accountant. @Felipe the one-page summary is in the shared folder for your sign-off.",
      ],
    },
    hiring: {
      label: "Hiring",
      agent: "HR Manager",
      mission: "Hire a senior designer",
      turns: [
        "Open the senior designer role. Post it, then screen everyone who applies against the brief.",
        "Posted to LinkedIn and the careers page. 41 applicants so far, each scored against the brief. Prioritizing product design and B2B experience.",
        "Push anyone with fintech experience to the top. @Julian you'll want to see the first two.",
        "Reordered. Top 9 now, 4 with fintech backgrounds. Notes and portfolios are attached for each.",
        "Set up calls with the top 3.",
        "Booked. Three intro calls on your calendar this week. @Felipe should I add you to the panel invites?",
      ],
    },
    support: {
      label: "Support",
      agent: "Support Rep",
      mission: "Clear the support queue",
      turns: [
        "The support queue is backed up, 34 open tickets in two days. Triage them and clear what you can.",
        "Going through all 34. 19 are the same billing question after the price change, 8 are password resets, and 7 need a human.",
        "Send the billing 19 the new pricing FAQ, and reset the 8 passwords.",
        "Done. 27 tickets answered and closed from the shared inbox. The 7 that need judgment are tagged and waiting.",
        "Who are the 7 for?",
        "Five feature questions with replies drafted, and two refunds over our limit. @Felipe please approve those and everything goes out today.",
      ],
    },
  };

  var SCENARIOS = STRUCTURE.map((s) => {
    var fb = FALLBACK[s.id];
    var key = `chat.scenarios.${s.id}.`;
    var texts = t(`${key}turns`, fb.turns);
    if (!Array.isArray(texts)) texts = fb.turns;
    return {
      label: t(`${key}label`, fb.label),
      agent: t(`${key}agent`, fb.agent),
      av: s.av,
      mission: t(`${key}mission`, fb.mission),
      people: s.people,
      thread: s.turns.map((who, i) => ({
        who: who,
        text: texts[i] || fb.turns[i],
      })),
    };
  });

  var tabs = root.querySelectorAll(".chat-tab");
  var thread = root.querySelector("#cd-thread");
  var agentAv = root.querySelector("#cd-agent-av");
  var agentName = root.querySelector("#cd-agent-name");
  var mission = root.querySelector("#cd-mission");
  var peopleEl = root.querySelector("#cd-people");
  if (!tabs.length || !thread) return;

  var reduceMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  // Mentions are matched by NAME, so the pattern is built from the locale's
  // people (longest first, so one name can never mask a longer one).
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function mentionRe() {
    var names = ["Julian", "Felipe", "Maya"];
    var people = t("people", null);
    var translated = [];
    if (people && typeof people === "object") {
      translated = Object.keys(people)
        .map((k) => people[k])
        .filter((n) => typeof n === "string" && n);
    }
    if (translated.length) names = translated;
    names.sort((a, b) => b.length - a.length);
    return new RegExp(`@(${names.map(escapeRe).join("|")})\\b`, "g");
  }

  var MENTIONS = mentionRe();

  function mentionize(text) {
    return text.replace(MENTIONS, '<span class="mention">@$1</span>');
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function faceImg(p, cls) {
    return (
      '<span class="' +
      cls +
      ' face-img" title="' +
      esc(p.name) +
      '"><img src="' +
      p.s +
      '" srcset="' +
      p.d +
      ' 2x" width="48" height="48" alt=""></span>'
    );
  }

  function msgHtml(s, m, entering) {
    var cls = `cmsg ${entering ? "cmsg-in " : ""}`;
    if (m.who === "agent") {
      return (
        '<div class="' +
        cls +
        'cmsg-agent"><span class="cmsg-av av ' +
        s.av +
        '"></span>' +
        '<div class="cmsg-main"><span class="cmsg-name">' +
        esc(s.agent) +
        '</span><div class="cmsg-text">' +
        mentionize(esc(m.text)) +
        "</div></div></div>"
      );
    }
    var p = PEOPLE[m.who];
    return (
      '<div class="' +
      cls +
      'cmsg-human">' +
      faceImg(p, "cmsg-av") +
      '<div class="cmsg-main"><span class="cmsg-name">' +
      esc(p.name) +
      '</span><div class="cmsg-text">' +
      mentionize(esc(m.text)) +
      "</div></div></div>"
    );
  }

  function typingHtml(s) {
    return (
      '<div class="cmsg cmsg-in cmsg-agent cmsg-typing"><span class="cmsg-av av ' +
      s.av +
      '"></span>' +
      '<div class="cmsg-main"><span class="cmsg-name">' +
      esc(s.agent) +
      '</span><div class="cmsg-text cmsg-dots"><span></span><span></span><span></span></div></div></div>'
    );
  }

  function setHeader(s, idx) {
    if (agentAv) agentAv.className = `av ${s.av}`;
    if (agentName) agentName.textContent = s.agent;
    if (mission) mission.textContent = s.mission;
    if (peopleEl)
      peopleEl.innerHTML = s.people
        .map((k) => faceImg(PEOPLE[k], "face"))
        .join("");
    tabs.forEach((t) => {
      var on = parseInt(t.getAttribute("data-uc"), 10) === idx;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  // Replay engine. A run token cancels an in-flight replay when the pill changes.
  var token = 0;
  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function play(idx) {
    var mine = ++token;
    var s = SCENARIOS[idx];
    setHeader(s, idx);

    // Reduced motion / no animation: render the whole settled thread, no loop.
    if (reduceMq?.matches) {
      thread.innerHTML = s.thread.map((m) => msgHtml(s, m)).join("");
      thread.scrollTop = thread.scrollHeight;
      return;
    }

    while (mine === token) {
      thread.innerHTML = "";
      for (let i = 0; i < s.thread.length && mine === token; i++) {
        const m = s.thread[i];
        if (m.who === "agent") {
          thread.insertAdjacentHTML("beforeend", typingHtml(s));
          thread.scrollTop = thread.scrollHeight;
          await wait(1000);
          if (mine !== token) return;
          const dots = thread.querySelector(".cmsg-typing");
          if (dots) dots.remove();
        }
        thread.insertAdjacentHTML("beforeend", msgHtml(s, m, true));
        thread.scrollTop = thread.scrollHeight;
        await wait(m.who === "agent" ? 1500 : 1000);
        if (mine !== token) return;
      }
      await wait(2800);
      // Auto-advance to the next use case after a full pass, unless the user
      // has taken over the pills or is reading (hovering the window).
      if (mine === token && !userTookOver && !hovered) {
        play((idx + 1) % SCENARIOS.length);
        return;
      }
    }
  }

  // User intent wins: a manual pill click ends auto-rotation for good.
  var userTookOver = false;
  var hovered = false;
  root.addEventListener("mouseenter", () => {
    hovered = true;
  });
  root.addEventListener("mouseleave", () => {
    hovered = false;
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      userTookOver = true;
      play(parseInt(tab.getAttribute("data-uc"), 10));
    });
  });

  play(0);
})();
