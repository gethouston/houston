/*
 * Data for the scripted hero demo (assets/hero-demo.js): the agent roster
 * (keys match the mockup sidebar's `data-agent` values in the hero window;
 * `av` is the avatar color class, which tints the Houston helmet glyph) and the
 * four missions the loop cycles through, one per agent, so the whole team is
 * visibly working on the true-to-app board.
 *
 * `people` on each mission are the HUMAN teammates collaborating on it, rendered
 * as an overlapping initial face stack on the card (the multiplayer signal, per
 * @houston-ai/board KanbanPeople). Each is `{ initials, tone }` where `tone` is
 * a quiet human-avatar color class (hp-1..hp-5, landing-app-window.css), always
 * distinct from the vivid agent helmet. Different missions carry different
 * people, so the shared board visibly belongs to a team.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which reads
 * `window.HERO_DEMO`.
 *
 * Copy rules: plain English, non-technical, no em dashes.
 */
window.HERO_DEMO = {
  agents: {
    houston: { name: "Houston", av: "av-p" },
    "sales-rep": { name: "Sales Rep", av: "av-c" },
    bookkeeper: { name: "Bookkeeper", av: "av-o" },
    "chief-of-staff": { name: "Chief of Staff", av: "av-b" },
  },
  scripts: [
    {
      agent: "houston",
      mission: "Clear the inbox",
      card: {
        title: "Follow up on urgent email",
        running: "Reading 23 unread, drafting replies",
        done: "4 replies ready, 17 archived",
        people: [
          { initials: "JA", tone: "hp-1" },
          { initials: "MK", tone: "hp-2" },
        ],
      },
      needsYou: {
        title: "Plan a trip to Tokyo",
        desc: "Research flights and hotels for the spring",
        people: [{ initials: "JA", tone: "hp-1" }],
      },
    },
    {
      agent: "sales-rep",
      mission: "Follow up with leads",
      card: {
        title: "Send 12 follow-ups",
        running: "Personalizing from HubSpot + LinkedIn",
        done: "12 emails sent from Gmail",
        people: [
          { initials: "MK", tone: "hp-2" },
          { initials: "RL", tone: "hp-3" },
          { initials: "TP", tone: "hp-4" },
        ],
      },
      needsYou: {
        title: "Approve the Acme proposal",
        desc: "Draft ready, waiting on your sign-off",
        people: [
          { initials: "RL", tone: "hp-3" },
          { initials: "MK", tone: "hp-2" },
        ],
      },
    },
    {
      agent: "bookkeeper",
      mission: "File March expenses",
      card: {
        title: "Categorize 47 transactions",
        running: "Matching your past patterns",
        done: "44 filed, 3 flagged for review",
        people: [{ initials: "TP", tone: "hp-4" }],
      },
      needsYou: {
        title: "Review 3 flagged expenses",
        desc: "Unusual amounts, needs your call",
        people: [
          { initials: "TP", tone: "hp-4" },
          { initials: "JA", tone: "hp-1" },
        ],
      },
    },
    {
      agent: "chief-of-staff",
      mission: "Prep the Monday briefing",
      card: {
        title: "Prepare Monday briefing",
        running: "Pulling calendar, KPIs, open threads",
        done: "One-pager waiting in your inbox",
        people: [
          { initials: "SB", tone: "hp-5" },
          { initials: "JA", tone: "hp-1" },
        ],
      },
      needsYou: {
        title: "Pick a date for the offsite",
        desc: "Three options held on your calendar",
        people: [
          { initials: "SB", tone: "hp-5" },
          { initials: "MK", tone: "hp-2" },
          { initials: "RL", tone: "hp-3" },
        ],
      },
    },
  ],
};
