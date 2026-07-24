/*
 * Data for the scripted hero demo (assets/hero-demo.js): the agent roster
 * (keys match the mockup sidebar's `data-agent` values in the hero window;
 * `av` is the monochrome-skin avatar class, `initials` the chip label) and the
 * four missions the loop cycles through, one per agent, so the whole team is
 * visibly working on the true-to-app board.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which reads
 * `window.HERO_DEMO`.
 *
 * Copy rules: plain English, non-technical, no em dashes.
 */
window.HERO_DEMO = {
  agents: {
    houston: { name: "Houston", av: "av-p", initials: "H" },
    "sales-rep": { name: "Sales Rep", av: "av-c", initials: "SR" },
    bookkeeper: { name: "Bookkeeper", av: "av-o", initials: "BK" },
    "chief-of-staff": { name: "Chief of Staff", av: "av-b", initials: "CS" },
  },
  scripts: [
    {
      agent: "houston",
      mission: "Clear the inbox",
      card: {
        title: "Follow up on urgent email",
        running: "Reading 23 unread, drafting replies",
        done: "4 replies ready, 17 archived",
      },
      needsYou: {
        title: "Plan a trip to Tokyo",
        desc: "Research flights and hotels for the spring",
      },
    },
    {
      agent: "sales-rep",
      mission: "Follow up with leads",
      card: {
        title: "Send 12 follow-ups",
        running: "Personalizing from HubSpot + LinkedIn",
        done: "12 emails sent from Gmail",
      },
      needsYou: {
        title: "Approve the Acme proposal",
        desc: "Draft ready, waiting on your sign-off",
      },
    },
    {
      agent: "bookkeeper",
      mission: "File March expenses",
      card: {
        title: "Categorize 47 transactions",
        running: "Matching your past patterns",
        done: "44 filed, 3 flagged for review",
      },
      needsYou: {
        title: "Review 3 flagged expenses",
        desc: "Unusual amounts, needs your call",
      },
    },
    {
      agent: "chief-of-staff",
      mission: "Prep the Monday briefing",
      card: {
        title: "Prepare Monday briefing",
        running: "Pulling calendar, KPIs, open threads",
        done: "One-pager waiting in your inbox",
      },
      needsYou: {
        title: "Pick a date for the offsite",
        desc: "Three options held on your calendar",
      },
    },
  ],
};
