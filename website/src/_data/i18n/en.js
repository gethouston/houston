// English copy for the landing page. Source of truth for the key tree: es.js
// and pt.js mirror it exactly (same paths, same array lengths), and
// scripts/check-locales.mjs enforces that.
//
// Rules:
// - Keys ending in `Html` may contain markup and are rendered with `| safe`.
//   Everything else is plain text and must be escaped by the template.
// - No em dashes anywhere. Use a comma, a colon, or a sentence break.
// - `{price}` and `{days}` are the only placeholders. Templates substitute them
//   from _data/pricing.js, so a price never gets hardcoded into a translation.
// - Structure (avatar tones, face rosters, logo paths, badges) lives in
//   _data/landing.js. Arrays here zip by index with the arrays there.
// - The `js` subtree is serialized into the page as window.HOUSTON_I18N by
//   _includes/landing/i18n-data.njk. Only put runtime strings there.

export default {
  meta: {
    title: "Houston: AI agents that actually do the work",
    description:
      "Houston is the shared workspace where people and AI agents work together. Shared agents, one mission board, roles for your whole team. Free for up to three people.",
    ogTitle: "Houston: AI agents that actually do the work",
    ogDescription:
      "Houston is the shared workspace where people and AI agents work together. Shared agents, one mission board, roles for your whole team. Free for up to three people.",
    twTitle: "Houston: AI agents that actually do the work",
    twDescription:
      "Houston is the shared workspace where people and AI agents work together. Shared agents, one mission board, roles for your whole team. Free for up to three people.",
    jsonLdDescription:
      "Free desktop app that runs AI agents which do real work for you, on your existing ChatGPT or Claude subscription, with over 1,000 integrations.",
    ogImageAlt: "Houston: AI agents that actually do the work.",
  },

  nav: {
    skip: "Skip to content",
    primary: "Primary",
    multiplayer: "Multiplayer",
    agents: "Agents",
    features: "Features",
    pricing: "Pricing",
    faq: "Questions",
    resources: "Resources",
    agentStore: "Agent Store",
    guides: "Guides",
    vision: "Vision",
    changelog: "Changelog",
    github: "GitHub",
    githubLabel: "Houston on GitHub",
    download: "Download",
    menu: "Menu",
    langLabel: "Language",
    links: {
      guides: "/guides/",
    },
  },

  hero: {
    h1Html: "One app to run all your team's AI&nbsp;agents",
    sub: "Houston gives your team one place to run AI agents, on any model, connected to the tools you already use, so every agent and everything it learns belongs to the company instead of one person's account.",
    ctaDownload: "Download the app",
    ctaSeeHow: "See how it works",
    windowAlt:
      "Houston, the desktop app: a team's shared mission board where agents move tasks across Running, Needs you, and Done, with the teammates on each mission shown as face stacks",
    app: {
      workspace: "Acme Studio",
      nav: {
        missionControl: "Mission Control",
        integrations: "Integrations",
        models: "AI Models",
        usage: "Usage",
        agentStore: "Agent Store",
        settings: "Settings",
      },
      sharedAgents: "Shared Agents",
      search: "Search missions",
      guide: "Guide me",
      newMission: "New mission",
      tabs: {
        activity: "Activity",
        routines: "Routines",
        integrations: "Integrations",
        files: "Files",
        archived: "Archived",
        agentSettings: "Agent Settings",
      },
      cols: {
        running: "Running",
        needsYou: "Needs you",
        done: "Done",
      },
      peopleGroup: "People on this mission",
      agents: {
        houston: "Personal Assistant",
        "chief-of-staff": "Chief of Staff",
        bookkeeper: "Bookkeeper",
        "sales-rep": "Sales Rep",
      },
      boardTitle: "Personal Assistant",
      needsCard: {
        title: "Approve the vendor renewal",
        desc: "Terms compared, waiting on your sign-off",
      },
      doneCard: {
        title: "Follow up on urgent email",
        desc: "4 replies ready, 17 archived",
      },
    },
  },

  multiplayer: {
    title: "AI stopped being single-player.",
    phrase1: "AI is locked in private chats.",
    phrase2: "Houston puts your agents in front of the whole team.",
    tabsLabel: "Use cases",
    tabs: ["Sales", "Bookkeeping", "Hiring", "Support"],
    agentName: "Sales Rep",
    mission: "Rebuild the Q3 pipeline report",
    composer: "Message your team and the agent...",
    peopleLabel: "People in this chat",
    msgs: [
      {
        who: "Julian",
        textHtml:
          "Rebuild the Q3 pipeline report. Pull every open deal from HubSpot, match it against the email threads in Gmail, and tell me what will really close.",
      },
      {
        who: "Sales Rep",
        textHtml:
          "Working through it. 63 open deals in HubSpot, cross-checked against Gmail. 12 have gone quiet for 3+ weeks, and 5 are stuck waiting on a contract from us.",
      },
      {
        who: "Felipe",
        textHtml:
          'Exclude the churned accounts, and add the renewals coming up this quarter. <span class="mention">@Julian</span> the stalled ones are your call.',
      },
      {
        who: "Sales Rep",
        textHtml:
          "Updated. Dropped 4 churned accounts, added 9 renewals. Weighted pipeline is $1.4M, with $380K at real risk from the stalled threads.",
      },
      {
        who: "Julian",
        textHtml:
          "Chase the stalled ones. Put it where the whole team can see it.",
      },
      {
        who: "Sales Rep",
        textHtml:
          'Done. The report is on the shared board, at-risk deals flagged, a follow-up drafted for each. <span class="mention">@Julian</span> please confirm and I\'ll send all 12.',
      },
    ],
  },

  parallel: {
    title: "Multi-agent by design.",
    lines: [
      "Different teams and projects need different agents. Houston is built multi-agent from day zero.",
      "And every agent is multi-chat: each card is its own conversation. That's how you run many projects, with many people, in parallel.",
      "Create an agent for your business in minutes, or start from one the community already built.",
    ],
    cta: "Explore the Agent Store",
    tabsLabel: "Agents",
    peopleLabel: "People on this mission",
    agents: {
      "sales-rep": {
        name: "Sales Rep",
        missionCount: "18 missions",
        more: "+13 more missions",
        alt: "The Sales Rep's mission column: 18 missions running in parallel, the top five shown",
        cards: [
          {
            title: "Rebuild the Q3 pipeline report",
            desc: "Cross-checking 63 deals against Gmail",
          },
          {
            title: "Prep the Acme renewal",
            desc: "Pricing needs your approval",
          },
          {
            title: "Follow up with 12 stale leads",
            desc: "3 replies drafted, 2 deals moving",
          },
          {
            title: "Draft the Meridian proposal",
            desc: "Scope pulled from the last three calls",
          },
          {
            title: "Log the week in HubSpot",
            desc: "Every call and reply, filed",
          },
        ],
      },
      bookkeeper: {
        name: "Bookkeeper",
        missionCount: "14 missions",
        more: "+9 more missions",
        alt: "The Bookkeeper's mission column: 14 missions running in parallel, the top five shown",
        cards: [
          {
            title: "Reconcile March",
            desc: "Matching QuickBooks against the bank feed",
          },
          {
            title: "File the Q1 expense report",
            desc: "2 receipts missing, flagged for you",
          },
          {
            title: "Chase 4 overdue invoices",
            desc: "2 paid, 2 promised this week",
          },
          {
            title: "Prepare the tax pack",
            desc: "Collecting statements for the accountant",
          },
          {
            title: "Categorize new subscriptions",
            desc: "3 tools found in the card statement",
          },
        ],
      },
      "hr-manager": {
        name: "HR Manager",
        missionCount: "21 missions",
        more: "+16 more missions",
        alt: "The HR Manager's mission column: 21 missions running in parallel, the top five shown",
        cards: [
          {
            title: "Screen the designer applicants",
            desc: "34 profiles against the role brief",
          },
          {
            title: "Draft the referral policy",
            desc: "First draft ready for your review",
          },
          {
            title: "Onboard Maya",
            desc: "Accounts created, intro doc sent",
          },
          {
            title: "Schedule the final interviews",
            desc: "5 candidates, calendars matched",
          },
          {
            title: "Renew the health plan",
            desc: "Three quotes compared, one flagged",
          },
        ],
      },
      "support-rep": {
        name: "Support Rep",
        missionCount: "16 missions",
        more: "+11 more missions",
        alt: "The Support Rep's mission column: 16 missions running in parallel, the top five shown",
        cards: [
          {
            title: "Clear the weekend queue",
            desc: "41 tickets, drafting replies",
          },
          {
            title: "Escalate the billing bug",
            desc: "3 reports match, needs an engineer",
          },
          {
            title: "Send the weekly digest",
            desc: "Top issues summarized for the team",
          },
          {
            title: "Update the help center",
            desc: "4 articles rewritten from real tickets",
          },
          {
            title: "Tag feature requests",
            desc: "12 filed for the product review",
          },
        ],
      },
    },
  },

  compound: {
    title: "Teach once. Better forever.",
    lines: [
      "Correct an agent once and it sticks, for everyone. Every learning, skill, and file it carries belongs to the whole team.",
      "That's compounding: each week your agents know your business better than the last.",
      "New people inherit it all on day one, and nothing walks out the door.",
    ],
    tabsLabel: "What the agent carries",
    tabs: {
      learnings: "Learnings",
      skills: "Skills",
      context: "Context",
    },
    agentName: "Sales Rep",
    agentSub: "Shared agent · Acme Studio",
    countLabel: "learnings",
    learnings: {
      alt: "The agent's learnings, taught by the team and growing: churned accounts excluded, deal owners copied, renewals from contract date, discount sign-offs, calls logged in HubSpot",
      rows: [
        {
          note: "Exclude churned accounts from pipeline math",
          when: "2d ago",
        },
        { note: "CC the deal owner before anything sends", when: "5d ago" },
        { note: "Count renewals from the contract date", when: "1w ago" },
        { note: "Discounts above 15% need a sign-off", when: "2w ago" },
        { note: "Log every call in HubSpot, same day", when: "3w ago" },
      ],
    },
    skills: {
      alt: "The agent's skills and the tools each one uses: pipeline report with HubSpot and Gmail, follow-up sequence with Gmail, proposal draft with Notion, meeting brief with Slack and Notion, win-loss recap with HubSpot and Slack",
      rows: [
        { note: "Pipeline report" },
        { note: "Follow-up sequence" },
        { note: "Proposal draft" },
        { note: "Meeting brief" },
        { note: "Win-loss recap" },
      ],
    },
    context: {
      alt: "The agent's context, a gallery of team files: pricing sheet, ICP notes, Q3 targets, case studies, objection playbook, demo script",
      tiles: [
        { name: "Pricing sheet", meta: "2 pages" },
        { name: "ICP notes", meta: "updated 3d ago" },
        { name: "Q3 targets", meta: "live" },
        { name: "Case studies", meta: "folder" },
        { name: "Objection playbook", meta: "9 plays" },
        { name: "Demo script", meta: "updated 1w ago" },
      ],
    },
  },

  stack: {
    title: "Plugs into everything you already use.",
    tiles: [
      {
        n: "1,000+",
        l: "integrations, the tools your team already works in",
        more: "+990 more",
      },
      {
        n: "400+",
        l: "models, switch per agent whenever you want",
        more: "+30 more providers",
      },
      {
        n: "Use your AI subscription",
        l: "ChatGPT, Claude, and the coding plans you already pay for. No second bill.",
        more: "or bring any API key",
      },
      {
        n: "Local models",
        l: "one computer serves the whole team, fully private",
        more: "or any OpenAI-compatible server",
      },
    ],
  },

  pricing: {
    title: "Ready to 10x your team overnight?",
    lead: "Free for the first three people. Upgrade when the whole team wants in.",
    free: {
      name: "Free",
      note: "for yourself, or a team of up to three",
      items: [
        "Your personal workspace, free forever",
        "Up to three people when you're ready",
        "All 1,000+ integrations",
        "Works with your AI subscription",
        "Community agents from the store",
      ],
      cta: "Download the app",
    },
    team: {
      chip: "Most popular",
      name: "Team",
      per: "/seat/mo",
      note: "billed annually · {price} billed monthly",
      items: [
        "Everything in Free",
        "Unlimited teammates",
        "Unlimited usage, agents around the clock",
        "Shared agents and team spaces",
        "Roles and guardrails",
      ],
      cta: "Start free trial",
    },
    enterprise: {
      name: "Enterprise",
      amount: "Custom",
      note: "for larger teams",
      items: ["SSO", "Security review", "Onboarding for the whole team"],
      cta: "Talk to us",
    },
  },

  faq: {
    title: "Questions, answered",
    groups: [
      {
        title: "Multiplayer and teams",
        items: [
          {
            q: "Can my whole team work on the same agent?",
            aHtml:
              "Yes. Share an agent and choose who can use it and who can manage it. Everyone works from the same mission board and can pick up a mission where someone else left off.",
          },
          {
            q: "What are the roles?",
            aHtml:
              "Three: Owner, Manager, and Member. The owner runs billing and can do anything. Managers add people, create agents, and change settings. Members use the agents they are given.",
          },
          {
            q: "Who sees which agents?",
            aHtml:
              "You choose, per agent. People only see and use the agents shared with them, so the rest of the workspace stays private.",
          },
          {
            q: "What is a space?",
            aHtml:
              "Everyone gets a personal space that is just for them. Team spaces sit beside it for shared work, and you switch between them in a click.",
          },
          {
            q: "Can I set guardrails on a shared agent?",
            aHtml:
              "Yes. For each shared agent you choose which apps and which AI models it may use. Everyone still picks their own model within what you allow.",
          },
          {
            q: "Does sharing an agent lose its history?",
            aHtml:
              "No. Move it into a team and it keeps its history and skills, and teammates can pick up any mission from where it stands.",
          },
          {
            q: "Desktop or web?",
            aHtml:
              "Both. Reach the same spaces, agents, and missions from the desktop app or the web.",
          },
        ],
      },
      {
        title: "Agents and tools",
        items: [
          {
            q: "What agents come built in?",
            aHtml:
              "A full team: personal assistant, bookkeeper, HR manager, support rep, sales rep, office manager, financial analyst, growth lead, and more.",
          },
          {
            q: "Can I add or build more?",
            aHtml:
              'Yes. Browse 30+ more in the <a href="https://agents.gethouston.ai">Agent Store</a>, or build your own in minutes.',
          },
          {
            q: "What can agents connect to?",
            aHtml:
              "Over 1,000 tools you already use, like Gmail, Slack, QuickBooks, HubSpot, and Google Drive.",
          },
          {
            q: "Can I use my own ChatGPT or Claude plan?",
            aHtml:
              "Yes. Connect the ChatGPT or Claude plan you already pay for and there is no second AI bill. Prefer keys or another provider? That works too.",
          },
          {
            q: "What models can agents use?",
            aHtml:
              "Over 400, from every major provider. Each agent can run a different model, each person can pick their own within it, and managers set the ceiling for the team.",
          },
          {
            q: "Can we run local models?",
            aHtml:
              "Yes. Run a local model on one computer and it serves tokens to your whole team's agents. Private by default, and no per-token bill at all.",
          },
        ],
      },
      {
        title: "Pricing and billing",
        items: [
          {
            q: "What is free?",
            aHtml:
              "Houston is free for up to three people in one space, with limited usage and no credit card. Enough to put agents on real work and feel the value. When the whole team wants in, or you need unlimited usage, you upgrade to Team.",
          },
          {
            q: "Who pays for a team?",
            aHtml:
              "The owner. Everyone you invite rides on the owner's plan, so members never enter a card of their own.",
          },
          {
            q: "What counts as a seat?",
            aHtml:
              "One member who accepts your invite. Pending invites are free, and seats are prorated when people join or leave.",
          },
          {
            q: "How does the free trial work?",
            aHtml:
              "A team space gets a {days}-day free trial with no card. It starts when your second member accepts.",
          },
          {
            q: "What happens when the trial ends?",
            aHtml:
              "Nothing is deleted. The space drops to the free plan: up to three people and limited usage. Every agent and mission stays put. Add a card whenever you are ready.",
          },
          {
            q: "Do members download or pay?",
            aHtml:
              "Members just accept the invite and download the app. Billing stays with the owner.",
          },
          {
            q: "Around-the-clock and enterprise?",
            aHtml:
              "Team keeps shared agents running even when laptops are closed. Enterprise adds single sign-on, an uptime SLA, priority support in English and Spanish, and private deployment.",
          },
        ],
      },
      {
        title: "Getting the app",
        items: [
          {
            q: "Which systems is Houston on?",
            aHtml:
              'Download for <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="mac">macOS</button> or <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="windows">Windows</button>. On Windows, pick x64 (Intel or AMD) or ARM64 (Surface, Snapdragon).',
          },
          {
            q: "How do I get in?",
            aHtml:
              "Houston is free while we're in beta. Hit download, tell us who you are, and the installer starts right away.",
          },
        ],
      },
    ],
  },

  footer: {
    blurb:
      "The workspace where people and AI agents work together. Free to try, for the whole team when you are ready.",
    download: "Download",
    mac: "macOS",
    windows: "Windows",
    product: "Product",
    company: "Company",
    resources: "Resources",
    contact: "Contact",
    twitter: "Twitter / X",
    credit: "Houston. Open source.",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    unsubscribe: "Unsubscribe",
    unsubscribeSubject: "Unsubscribe",
    unsubscribeBody: "Please remove this email address from Houston marketing.",
    langLabel: "Language",
  },

  gate: {
    title: "Get Houston",
    lead: "Tell us who you are and your download starts right away.",
    close: "Close",
    name: {
      label: "Complete name",
      placeholder: "Jane Doe",
      error: "Please enter your full name to continue.",
    },
    email: {
      label: "Email",
      placeholder: "jane@company.com",
      error: "Please enter a valid email to continue.",
    },
    phone: {
      label: "Phone number",
      optional: "(best to reach you on WhatsApp)",
      placeholder: "555 123 4567",
      error: "Please enter your phone number to continue.",
      ccLabel: "Country code",
    },
    linkedin: {
      label: "LinkedIn",
      placeholder: "https://www.linkedin.com/in/you",
      error: "Please enter a valid LinkedIn URL to continue.",
    },
    country: {
      label: "Country",
      placeholder: "Select your country",
      error: "Please select your country to continue.",
      searchPlaceholder: "Search countries",
      empty: "No matches",
      menuLabel: "Country list",
    },
    submit: "Continue to download",
    formError: "Something went wrong. Please try again.",
    fineprintHtml:
      'By continuing you agree to receive product updates from Houston. Unsubscribe anytime. See our <a href="/privacy/">Privacy Policy</a>.',
    done: {
      title: "You're all set",
      lead: "Pick your download and you're off.",
    },
    macBtn: "Download for Mac",
    winX64: "Windows (x64 / Intel / AMD)",
    winArm: "Windows (ARM64 / Surface, Snapdragon)",
    notSure: "Not sure which one to pick?",
    notSureBody:
      "Most laptops and desktops are x64 (Intel or AMD CPUs). Only a Surface Pro X, Surface Pro 9 5G, a Snapdragon X laptop, or another ARM-based Windows machine needs ARM64. On first install you'll see one SmartScreen \"Run anyway\" prompt; we're working on full code-signing.",
    switchArch: "Wrong one? Switch to the other version →",
  },

  // Shown to a visitor whose browser prefers another language. The English
  // copy is the key-parity anchor: es.js and pt.js invite in their own tongue.
  langBanner: {
    text: "This page is available in English.",
    cta: "Read in English",
    dismiss: "Dismiss",
  },

  // Everything below ships to the browser as window.HOUSTON_I18N.
  js: {
    people: {
      julian: "Julian",
      felipe: "Felipe",
      maya: "Maya",
      ana: "Ana",
    },
    heroDemo: {
      agents: {
        houston: "Personal Assistant",
        "sales-rep": "Sales Rep",
        bookkeeper: "Bookkeeper",
        "chief-of-staff": "Chief of Staff",
      },
      scripts: {
        houston: {
          mission: "Clear the inbox",
          card: {
            title: "Follow up on urgent email",
            running: "Reading 23 unread, drafting replies",
            done: "4 replies ready, 17 archived",
          },
          needsYou: {
            title: "Approve the vendor renewal",
            desc: "Terms compared, waiting on your sign-off",
          },
        },
        "sales-rep": {
          mission: "Rebuild the Q3 pipeline",
          card: {
            title: "Rebuild the Q3 pipeline report",
            running: "Matching HubSpot deals to Gmail threads",
            done: "Report ready, 6 deals flagged at risk",
          },
          needsYou: {
            title: "Approve the Acme renewal",
            desc: "Draft ready, waiting on your sign-off",
          },
        },
        bookkeeper: {
          mission: "Reconcile last month",
          card: {
            title: "Reconcile 842 transactions",
            running: "Matching Stripe to the bank feed",
            done: "838 matched, 4 flagged for review",
          },
          needsYou: {
            title: "Review 4 flagged charges",
            desc: "No invoice on file, needs your call",
          },
        },
        "chief-of-staff": {
          mission: "Prep the board update",
          card: {
            title: "Prepare the board update",
            running: "Pulling KPIs and open threads",
            done: "One-pager waiting in your inbox",
          },
          needsYou: {
            title: "Approve the launch plan",
            desc: "Timeline staged, waiting on your OK",
          },
        },
      },
    },
    chat: {
      scenarios: {
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
      },
    },
    compound: {
      justNow: "just now",
      pool: [
        {
          note: "Quote annual pricing in the customer's currency",
          who: "Felipe",
        },
        { note: "Loop in support when a deal mentions bugs", who: "Julian" },
        {
          note: "Never promise a date without checking the roadmap",
          who: "Maya",
        },
        { note: "Summarize every demo call in the deal notes", who: "Julian" },
        { note: "Flag competitors named in any thread", who: "Felipe" },
        {
          note: "Send recap emails before noon, customer's timezone",
          who: "Ana",
        },
      ],
    },
    gate: {
      preparing: "Preparing your download…",
      submit: "Continue to download",
      needWindows: "Need it for Windows instead?",
      needMac: "Need it for Mac instead?",
      countrySearch: "Search countries",
      countryEmpty: "No matches",
      ccLabel: "Country code",
      ccSearch: "Search country codes",
    },
  },
};
