/*
 * Stage switcher for the scripted hero demo: points every STATIC bit of the
 * true-to-app hero board at the current mission's agent — sidebar highlight,
 * board title, and the "Needs you" card (avatar, name, title, desc) — exactly
 * like picking another agent in the real app. The dynamic beats (the Running to
 * Done card) live in hero-demo.js.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which calls
 * `window.createHeroDemoStage(root, agents)`.
 */
window.createHeroDemoStage = (root, agents) => {
  var boardTitle = root.querySelector("#hd-board-title");
  var needsAvatar = root.querySelector("#hd-needs-avatar");
  var needsAgent = root.querySelector("#hd-needs-agent");
  var needsTitle = root.querySelector("#hd-needs-title");
  var needsDesc = root.querySelector("#hd-needs-desc");

  return {
    setMission(script) {
      var agent = agents[script.agent];
      root.querySelectorAll(".agent-row").forEach((row) => {
        row.classList.toggle(
          "on",
          row.getAttribute("data-agent") === script.agent,
        );
      });
      if (boardTitle) boardTitle.textContent = agent.name;
      if (needsAgent) needsAgent.textContent = agent.name;
      if (needsAvatar) {
        needsAvatar.className = `av ${agent.av}`;
        needsAvatar.textContent = agent.initials;
      }
      if (needsTitle) needsTitle.textContent = script.needsYou.title;
      if (needsDesc) needsDesc.textContent = script.needsYou.desc;
    },
  };
};
