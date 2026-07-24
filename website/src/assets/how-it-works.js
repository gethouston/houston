/*
 * "How it works" interactive agent selector. Seven tabs, one per agent; picking
 * one rewrites the three numbered steps (ask / work / result) and replays the
 * conversation inside the phone mock (the agent header, the mission, and the
 * chat thread). Purely presentational; no network. Loaded `defer`.
 */
(() => {
  var agents = [
    {
      name: "Personal Assistant",
      mission: "Clear my inbox",
      ask: '"Clear my inbox. Reply to anything urgent, archive the rest."',
      work: "Opens Gmail, reads 23 unread emails, drafts replies to urgent ones, archives newsletters.",
      result: "23 emails handled. 4 replies ready for approval. Inbox at zero.",
      chat: [
        {
          role: "user",
          text: "Clear my inbox. Reply to anything urgent, archive the rest.",
        },
        {
          role: "assistant",
          text: "On it. Found 23 unread emails. Drafting replies to 4 urgent ones, archiving 17 newsletters, flagging 2 from your boss.",
        },
        {
          role: "user",
          text: "Don’t reply to Sarah’s email yet, I need to think about it.",
        },
        {
          role: "assistant",
          text: "Got it. Skipping Sarah. The other 3 replies are ready for your approval.",
        },
      ],
    },
    {
      name: "Bookkeeper",
      mission: "File March expenses",
      ask: '"Categorize all my March expenses and file them in QuickBooks."',
      work: "Logs into QuickBooks, reads bank transactions, categorizes each one based on past patterns.",
      result:
        "47 transactions categorized. 3 flagged for review. Done in minutes.",
      chat: [
        {
          role: "user",
          text: "Categorize all my March expenses and file them in QuickBooks.",
        },
        {
          role: "assistant",
          text: "Reading your bank feed now. I see 47 transactions from March. Categorizing based on your past patterns.",
        },
        {
          role: "user",
          text: "The $340 from Office Depot should go under office supplies, not miscellaneous.",
        },
        {
          role: "assistant",
          text: "Fixed. I’ll remember that for next time. 44 categorized, 3 flagged for your review.",
        },
      ],
    },
    {
      name: "HR Manager",
      mission: "Post job and screen resumes",
      ask: '"Post the marketing manager job and screen last week’s resumes."',
      work: "Writes the job post, publishes on LinkedIn and Indeed, reads 34 resumes and scores them.",
      result:
        "Job posted on 2 platforms. 34 resumes screened. Top 8 shortlisted.",
      chat: [
        {
          role: "user",
          text: "Post the marketing manager job on LinkedIn and Indeed. Then screen the resumes in my Drive.",
        },
        {
          role: "assistant",
          text: "Job post written and published on both platforms. Now reading 34 resumes from your Drive folder.",
        },
        { role: "user", text: "Prioritize candidates with B2B experience." },
        {
          role: "assistant",
          text: "Done. 8 candidates shortlisted, 5 of them have B2B backgrounds. Notes attached to each.",
        },
      ],
    },
    {
      name: "Support Rep",
      mission: "Handle support tickets",
      ask: '"Go through the support inbox and reply to everything with a clear answer."',
      work: "Reads Zendesk tickets, matches FAQs, drafts responses, escalates complex issues.",
      result:
        "18 tickets answered. 3 escalated with context. Avg response: 2 min.",
      chat: [
        {
          role: "user",
          text: "Go through the support inbox. Reply to anything with a clear answer, escalate the rest.",
        },
        {
          role: "assistant",
          text: "Reading 21 open tickets. 18 match known answers. Drafting replies now.",
        },
        {
          role: "user",
          text: "For the billing questions, mention our new refund policy.",
        },
        {
          role: "assistant",
          text: "Updated. 18 replies sent, 3 escalated to you with full context.",
        },
      ],
    },
    {
      name: "Sales Rep",
      mission: "Follow up with stale leads",
      ask: '"Follow up with every lead that went quiet in the last 2 weeks."',
      work: "Checks HubSpot for stale leads, pulls LinkedIn info, writes personalized follow-ups.",
      result:
        "12 follow-ups sent. Each references their company and last conversation.",
      chat: [
        {
          role: "user",
          text: "Follow up with every lead that went quiet in the last 2 weeks. Personalize each one.",
        },
        {
          role: "assistant",
          text: "Found 12 stale leads in HubSpot. Pulling their LinkedIn profiles to personalize.",
        },
        {
          role: "user",
          text: "Skip anyone from Acme Corp, we lost that deal.",
        },
        {
          role: "assistant",
          text: "Removed Acme. 11 follow-ups sent from your Gmail. Each mentions their company and last touchpoint.",
        },
      ],
    },
    {
      name: "Office Manager",
      mission: "Reschedule this week",
      ask: '"Move the Wednesday all-hands to Thursday and find time for a 1-on-1 with Sarah."',
      work: "Checks Calendar for conflicts, moves meetings, notifies attendees, finds open slots.",
      result: "All-hands moved. 14 notified. 1-on-1 booked Thursday 2pm.",
      chat: [
        {
          role: "user",
          text: "Move Wednesday’s all-hands to Thursday. And find a time for a 1-on-1 with Sarah.",
        },
        {
          role: "assistant",
          text: "Checking calendars. Thursday 10am works for the all-hands. Sarah has a slot at 2pm.",
        },
        { role: "user", text: "Perfect. Send the updates." },
        {
          role: "assistant",
          text: "Done. All-hands moved, 14 people notified. 1-on-1 with Sarah booked for Thursday 2pm.",
        },
      ],
    },
    {
      name: "Financial Analyst",
      mission: "Monthly revenue report",
      ask: '"Pull this month’s revenue from Stripe and compare to last month."',
      work: "Connects to Stripe, pulls data, builds comparison in Google Sheets, flags anomalies.",
      result: "Report built. Revenue up 12%. One refund spike flagged.",
      chat: [
        {
          role: "user",
          text: "Pull this month’s revenue from Stripe. Compare it to last month and flag anything weird.",
        },
        {
          role: "assistant",
          text: "Connected to Stripe. Pulling transaction data for March and February. Building the comparison now.",
        },
        { role: "user", text: "Add a breakdown by product line." },
        {
          role: "assistant",
          text: "Done. Report is in Google Sheets. Revenue up 12% overall. Product B had an unusual refund spike — flagged for your review.",
        },
      ],
    },
  ];

  var tabs = document.querySelectorAll(".hiw-tab");
  var askEl = document.getElementById("hiw-ask");
  var workEl = document.getElementById("hiw-work");
  var resultEl = document.getElementById("hiw-result");
  var chatEl = document.getElementById("hiw-chat");
  var nameEl = document.getElementById("hiw-agent-name");
  var missionEl = document.getElementById("hiw-agent-mission");
  if (!tabs.length || !askEl) return;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setAgent(idx) {
    var a = agents[idx];
    askEl.textContent = a.ask;
    workEl.textContent = a.work;
    resultEl.textContent = a.result;
    nameEl.textContent = a.name;
    missionEl.textContent = a.mission;
    var html = "";
    a.chat.forEach((msg) => {
      html += `<div class="chat-msg ${msg.role}">${esc(msg.text)}</div>`;
    });
    html +=
      '<div class="typing-dots"><span></span><span></span><span></span></div>';
    html +=
      '<div class="chat-composer-mock"><span class="placeholder">Tell your agent what to do...</span>' +
      '<span class="send-btn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14V2M8 2l-4 4M8 2l4 4"/></svg></span></div>';
    chatEl.innerHTML = html;
    tabs.forEach((t) => {
      t.classList.toggle(
        "active",
        parseInt(t.getAttribute("data-agent"), 10) === idx,
      );
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setAgent(parseInt(tab.getAttribute("data-agent"), 10));
    });
  });

  setAgent(0);
})();
