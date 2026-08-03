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
 * Text is translated: it comes from window.HOUSTON_I18N (js.heroDemo, emitted by
 * _includes/landing/i18n-data.njk before this asset), with the English copy
 * below as the fallback. The structure mirrors _data/landing.js heroDemo — agent
 * order, avatar classes and face rosters — which stays the source of truth; a
 * classic script cannot import it, so the small structure is copied here.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which reads
 * `window.HERO_DEMO`.
 *
 * Copy rules: plain English, non-technical, no em dashes.
 */
(() => {
  function t(path, fallback) {
    return window.houstonT ? window.houstonT(path, fallback) : fallback;
  }

  // Face identities, keyed like _data/landing.js `people`. Anonymous teammates
  // (initials only) carry no name to translate.
  var PEOPLE = {
    julian: { img: "/assets/img/julian-96.webp", name: "Julian" },
    felipe: { img: "/assets/img/felipe-96.webp", name: "Felipe" },
    rl: { initials: "RL", tone: "hp-3" },
    tp: { initials: "TP", tone: "hp-4" },
    sb: { initials: "SB", tone: "hp-5" },
  };

  function faces(ids) {
    return ids.map((id) => {
      var p = PEOPLE[id];
      return p.img
        ? { img: p.img, label: t(`people.${id}`, p.name) }
        : { initials: p.initials, tone: p.tone };
    });
  }

  // Sidebar order.
  var AGENTS = [
    { id: "houston", av: "av-p", name: "Personal Assistant" },
    { id: "sales-rep", av: "av-c", name: "Sales Rep" },
    { id: "bookkeeper", av: "av-o", name: "Bookkeeper" },
    { id: "chief-of-staff", av: "av-b", name: "Chief of Staff" },
  ];

  // Loop order, one mission per agent.
  var SCRIPTS = [
    {
      agent: "houston",
      mission: "Clear the inbox",
      card: {
        title: "Follow up on urgent email",
        running: "Reading 23 unread, drafting replies",
        done: "4 replies ready, 17 archived",
        people: ["julian", "felipe"],
      },
      needsYou: {
        title: "Approve the vendor renewal",
        desc: "Terms compared, waiting on your sign-off",
        people: ["julian"],
      },
    },
    {
      agent: "sales-rep",
      mission: "Rebuild the Q3 pipeline",
      card: {
        title: "Rebuild the Q3 pipeline report",
        running: "Matching HubSpot deals to Gmail threads",
        done: "Report ready, 6 deals flagged at risk",
        people: ["felipe", "rl", "tp"],
      },
      needsYou: {
        title: "Approve the Acme renewal",
        desc: "Draft ready, waiting on your sign-off",
        people: ["rl", "felipe"],
      },
    },
    {
      agent: "bookkeeper",
      mission: "Reconcile last month",
      card: {
        title: "Reconcile 842 transactions",
        running: "Matching Stripe to the bank feed",
        done: "838 matched, 4 flagged for review",
        people: ["tp"],
      },
      needsYou: {
        title: "Review 4 flagged charges",
        desc: "No invoice on file, needs your call",
        people: ["tp", "julian"],
      },
    },
    {
      agent: "chief-of-staff",
      mission: "Prep the board update",
      card: {
        title: "Prepare the board update",
        running: "Pulling KPIs and open threads",
        done: "One-pager waiting in your inbox",
        people: ["sb", "julian"],
      },
      needsYou: {
        title: "Approve the launch plan",
        desc: "Timeline staged, waiting on your OK",
        people: ["sb", "felipe", "rl"],
      },
    },
  ];

  var agents = {};
  AGENTS.forEach((a) => {
    agents[a.id] = { name: t(`heroDemo.agents.${a.id}`, a.name), av: a.av };
  });

  window.HERO_DEMO = {
    agents: agents,
    scripts: SCRIPTS.map((s) => {
      var key = `heroDemo.scripts.${s.agent}.`;
      return {
        agent: s.agent,
        mission: t(`${key}mission`, s.mission),
        card: {
          title: t(`${key}card.title`, s.card.title),
          running: t(`${key}card.running`, s.card.running),
          done: t(`${key}card.done`, s.card.done),
          people: faces(s.card.people),
        },
        needsYou: {
          title: t(`${key}needsYou.title`, s.needsYou.title),
          desc: t(`${key}needsYou.desc`, s.needsYou.desc),
          people: faces(s.needsYou.people),
        },
      };
    }),
  };
})();
