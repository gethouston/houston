/*
 * Data for the scripted hero demo (assets/hero-demo.js): the agent roster
 * (keys match the mockup sidebar's `data-agent` values in the hero window;
 * `av` is the avatar color class, which tints the Houston helmet glyph) and the
 * four missions the loop cycles through, one per agent, so the whole team is
 * visibly working on the true-to-app board.
 *
 * `people` on each mission are the HUMAN teammates collaborating on it, rendered
 * as an overlapping face stack on the card (the multiplayer signal, per
 * @houston-ai/board KanbanPeople). Each is EITHER a real teammate photo
 * (`{ img, label }`) or an initials avatar in a quiet tone (`{ initials, tone }`,
 * hp-1..hp-5 in landing-app-window.css) — always distinct from the vivid agent
 * helmet. Different missions carry different people, so the shared board visibly
 * belongs to a team.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which reads
 * `window.HERO_DEMO`.
 *
 * Copy rules: plain English, non-technical, no em dashes.
 */
window.HERO_DEMO = {
  agents: {
    houston: { name: "Personal Assistant", av: "av-p" },
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
          { img: "/assets/img/julian-96.webp", label: "Julian" },
          { img: "/assets/img/felipe-96.webp", label: "Felipe" },
        ],
      },
      needsYou: {
        title: "Approve the vendor renewal",
        desc: "Terms compared, waiting on your sign-off",
        people: [{ img: "/assets/img/julian-96.webp", label: "Julian" }],
      },
    },
    {
      agent: "sales-rep",
      mission: "Rebuild the Q3 pipeline",
      card: {
        title: "Rebuild the Q3 pipeline report",
        running: "Matching HubSpot deals to Gmail threads",
        done: "Report ready, 6 deals flagged at risk",
        people: [
          { img: "/assets/img/felipe-96.webp", label: "Felipe" },
          { initials: "RL", tone: "hp-3" },
          { initials: "TP", tone: "hp-4" },
        ],
      },
      needsYou: {
        title: "Approve the Acme renewal",
        desc: "Draft ready, waiting on your sign-off",
        people: [
          { initials: "RL", tone: "hp-3" },
          { img: "/assets/img/felipe-96.webp", label: "Felipe" },
        ],
      },
    },
    {
      agent: "bookkeeper",
      mission: "Reconcile last month",
      card: {
        title: "Reconcile 842 transactions",
        running: "Matching Stripe to the bank feed",
        done: "838 matched, 4 flagged for review",
        people: [{ initials: "TP", tone: "hp-4" }],
      },
      needsYou: {
        title: "Review 4 flagged charges",
        desc: "No invoice on file, needs your call",
        people: [
          { initials: "TP", tone: "hp-4" },
          { img: "/assets/img/julian-96.webp", label: "Julian" },
        ],
      },
    },
    {
      agent: "chief-of-staff",
      mission: "Prep the board update",
      card: {
        title: "Prepare the board update",
        running: "Pulling KPIs and open threads",
        done: "One-pager waiting in your inbox",
        people: [
          { initials: "SB", tone: "hp-5" },
          { img: "/assets/img/julian-96.webp", label: "Julian" },
        ],
      },
      needsYou: {
        title: "Approve the launch plan",
        desc: "Timeline staged, waiting on your OK",
        people: [
          { initials: "SB", tone: "hp-5" },
          { img: "/assets/img/felipe-96.webp", label: "Felipe" },
          { initials: "RL", tone: "hp-3" },
        ],
      },
    },
  ],
};
