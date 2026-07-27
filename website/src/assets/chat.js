/*
 * Multiplayer chat replay (landing #multiplayer). Four use-case pills; picking
 * one rewrites the shared thread — the agent header (name + mission + helmet
 * color), the participant face stack, and every turn — then replays it: turns
 * appear in sequence, a typing indicator precedes each agent turn, and the
 * thread loops. Turns come from real people (photo avatars) AND the agent (a
 * tinted Houston helmet), so the preview reads as a genuine multi-person
 * conversation doing complex work across real tool integrations, not a demo.
 *
 * Presentational only, no network. Loaded `defer`. Scenario 0 (Sales) is also
 * inlined in multiplayer.njk so JS-off shows a full settled thread; with
 * prefers-reduced-motion this script renders the settled thread and does NOT
 * loop. Copy rules: plain English, non-technical, no em dashes.
 */
(() => {
  var root = document.querySelector("[data-chat-demo]");
  if (!root) return;

  // Human participants — real teammate photos (astronaut headshots), circular.
  var PEOPLE = {
    julian: {
      name: "Julian",
      s: "/assets/img/julian-48.webp",
      d: "/assets/img/julian-96.webp",
    },
    felipe: {
      name: "Felipe",
      s: "/assets/img/felipe-48.webp",
      d: "/assets/img/felipe-96.webp",
    },
  };

  // Each scenario: the shared agent (name + helmet-color av), the mission, the
  // people in the room, and the thread. `who` is a PEOPLE key or "agent". Every
  // story is complex, multi-step work with a SECOND human jumping in to redirect
  // (the multiplayer signal). Agents act across their real integrations only.
  var SCENARIOS = [
    {
      label: "Sales",
      agent: "Sales Rep",
      av: "av-c",
      mission: "Rebuild the Q3 pipeline report",
      people: ["julian", "felipe"],
      thread: [
        {
          who: "julian",
          text: "Rebuild the Q3 pipeline report. Pull every open deal from HubSpot, match it against the email threads in Gmail, and tell me what will really close.",
        },
        {
          who: "agent",
          text: "Working through it. 63 open deals in HubSpot, cross-checked against Gmail. 12 have gone quiet for 3+ weeks, and 5 are stuck waiting on a contract from us.",
        },
        {
          who: "felipe",
          text: "Exclude the churned accounts, and add the renewals coming up this quarter.",
        },
        {
          who: "agent",
          text: "Updated. Dropped 4 churned accounts, added 9 renewals. Weighted pipeline is $1.4M, with $380K at real risk from the stalled threads.",
        },
        {
          who: "julian",
          text: "Perfect. Put it where the whole team can see it.",
        },
        {
          who: "agent",
          text: "Done. The Q3 pipeline report is on the shared board, at-risk deals flagged, with a follow-up drafted for each.",
        },
      ],
    },
    {
      label: "Bookkeeping",
      agent: "Bookkeeper",
      av: "av-o",
      mission: "Close last month's books",
      people: ["felipe", "julian"],
      thread: [
        {
          who: "felipe",
          text: "Close out last month. Pull every transaction from Stripe and the bank, match them up, and flag anything that does not reconcile.",
        },
        {
          who: "agent",
          text: "On it. 842 transactions across Stripe and the bank feed. 838 matched cleanly. 3 bank charges have no invoice, and 1 refund is logged twice.",
        },
        {
          who: "julian",
          text: "The double refund is ours, we issued it by mistake. Categorize the 3 charges as software.",
        },
        {
          who: "agent",
          text: "Done. Refund noted, 3 charges filed under software. The books balance to the cent.",
        },
        { who: "felipe", text: "Great. Send it to the accountant." },
        {
          who: "agent",
          text: "Sent. The reconciled month and a one-page summary are on their way, copied to the shared folder.",
        },
      ],
    },
    {
      label: "Hiring",
      agent: "HR Manager",
      av: "av-g",
      mission: "Hire a senior designer",
      people: ["julian", "felipe"],
      thread: [
        {
          who: "julian",
          text: "Open the senior designer role. Post it, then screen everyone who applies against the brief.",
        },
        {
          who: "agent",
          text: "Posted to LinkedIn and the careers page. 41 applicants so far, each scored against the brief. Prioritizing product design and B2B experience.",
        },
        {
          who: "felipe",
          text: "Push anyone with fintech experience to the top.",
        },
        {
          who: "agent",
          text: "Reordered. Top 9 now, 4 with fintech backgrounds. Notes and portfolios are attached for each.",
        },
        { who: "julian", text: "Set up calls with the top 3." },
        {
          who: "agent",
          text: "Booked. Three 30-minute intro calls are on your calendar this week, invites sent.",
        },
      ],
    },
    {
      label: "Support",
      agent: "Support Rep",
      av: "av-b",
      mission: "Clear the support queue",
      people: ["felipe", "julian"],
      thread: [
        {
          who: "felipe",
          text: "The support queue is backed up, 34 open tickets in two days. Triage them and clear what you can.",
        },
        {
          who: "agent",
          text: "Going through all 34. 19 are the same billing question after the price change, 8 are password resets, and 7 need a human.",
        },
        {
          who: "julian",
          text: "Send the billing 19 the new pricing FAQ, and reset the 8 passwords.",
        },
        {
          who: "agent",
          text: "Done. 27 tickets answered and closed from the shared inbox. The 7 that need judgment are tagged and waiting.",
        },
        { who: "felipe", text: "Who are the 7 for?" },
        {
          who: "agent",
          text: "Two refunds over our limit for you to approve, and five feature questions I have drafted replies for. Approve and they go out.",
        },
      ],
    },
  ];

  var tabs = root.querySelectorAll(".chat-tab");
  var thread = root.querySelector("#cd-thread");
  var agentAv = root.querySelector("#cd-agent-av");
  var agentName = root.querySelector("#cd-agent-name");
  var mission = root.querySelector("#cd-mission");
  var peopleEl = root.querySelector("#cd-people");
  if (!tabs.length || !thread) return;

  var reduceMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");

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
        esc(m.text) +
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
      esc(m.text) +
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
      return;
    }

    while (mine === token) {
      thread.innerHTML = "";
      for (let i = 0; i < s.thread.length && mine === token; i++) {
        const m = s.thread[i];
        if (m.who === "agent") {
          thread.insertAdjacentHTML("beforeend", typingHtml(s));
          await wait(1000);
          if (mine !== token) return;
          const dots = thread.querySelector(".cmsg-typing");
          if (dots) dots.remove();
        }
        thread.insertAdjacentHTML("beforeend", msgHtml(s, m, true));
        await wait(m.who === "agent" ? 1500 : 1000);
        if (mine !== token) return;
      }
      await wait(2800);
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      play(parseInt(tab.getAttribute("data-uc"), 10));
    });
  });

  play(0);
})();
