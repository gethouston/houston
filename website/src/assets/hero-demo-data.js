/*
 * Data for the scripted hero demo (assets/hero-demo.js): the agent roster
 * (matching the mockup sidebar in index.html — keys are the sidebar's
 * `data-agent` values, tints the same rgba used on the sidebar avatars) and
 * the four missions the ~30s loop cycles through, one per agent, so the whole
 * team is visibly working. Loaded before hero-demo.js (both `defer`, in
 * order), which reads `window.HERO_DEMO`.
 *
 * Copy rules: plain English, non-technical, no em dashes.
 */
window.HERO_DEMO = {
  agents: {
    houston: { name: "Houston", tint: "rgba(167,139,250,0.22)" },
    "sales-rep": { name: "Sales Rep", tint: "rgba(239,68,68,0.22)" },
    bookkeeper: { name: "Bookkeeper", tint: "rgba(249,115,22,0.22)" },
    "chief-of-staff": { name: "Chief of Staff", tint: "rgba(59,130,246,0.22)" },
  },
  scripts: [
    {
      agent: "houston",
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
      needsYou: {
        title: "Plan a trip to Tokyo",
        desc: "Research flights and hotels for the spring",
      },
    },
    {
      agent: "sales-rep",
      mission: "Follow up with leads",
      prompt: "Follow up with every lead that went quiet this week.",
      card: {
        title: "Send 12 follow-ups",
        running: "Personalizing from HubSpot + LinkedIn",
        done: "12 emails sent from Gmail",
      },
      reply: "Found 12 quiet leads. Writing a personal note to each one.",
      confirm: "Sent all 12. Each one references their last conversation.",
      needsYou: {
        title: "Approve the Acme proposal",
        desc: "Draft ready, waiting on your sign-off",
      },
    },
    {
      agent: "bookkeeper",
      mission: "File March expenses",
      prompt: "Categorize my March expenses in QuickBooks.",
      card: {
        title: "Categorize 47 transactions",
        running: "Matching your past patterns",
        done: "44 filed, 3 flagged for review",
      },
      reply: "Reading your bank feed. 47 transactions from March.",
      confirm: "Filed 44 and flagged 3 for you. Your books are up to date.",
      needsYou: {
        title: "Review 3 flagged expenses",
        desc: "Unusual amounts, needs your call",
      },
    },
    {
      agent: "chief-of-staff",
      mission: "Prep the Monday briefing",
      prompt: "Put together my Monday briefing: calendar, numbers, decisions.",
      card: {
        title: "Prepare Monday briefing",
        running: "Pulling calendar, KPIs, open threads",
        done: "One-pager waiting in your inbox",
      },
      reply: "Scanning your week: 9 meetings, 3 decisions waiting on you.",
      confirm: "Briefing ready. One page, three decisions flagged for Monday.",
      needsYou: {
        title: "Pick a date for the offsite",
        desc: "Three options held on your calendar",
      },
    },
  ],
};
