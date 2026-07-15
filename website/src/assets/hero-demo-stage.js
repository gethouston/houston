/*
 * Stage switcher for the scripted hero demo: points every STATIC bit of the
 * mockup at the current mission's agent — sidebar highlight, board title,
 * chat head (name + avatar tint), mission label, and the "Needs you" card —
 * exactly like picking another agent in the real app. The dynamic beats
 * (typing, bubbles, the Running→Done card) live in hero-demo.js.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which calls
 * `window.createHeroDemoStage(root, agents)`.
 */
window.createHeroDemoStage = (root, agents) => {
  var boardTitle = root.querySelector("#hd-board-title");
  var chatAgent = root.querySelector("#hd-chat-agent");
  var chatAvatar = root.querySelector("#hd-chat-avatar");
  var missionEl = root.querySelector("#hd-mission");
  var needsAvatar = root.querySelector("#hd-needs-avatar");
  var needsAgent = root.querySelector("#hd-needs-agent");
  var needsTitle = root.querySelector("#hd-needs-title");
  var needsDesc = root.querySelector("#hd-needs-desc");

  return {
    setMission(script) {
      var agent = agents[script.agent];
      root.querySelectorAll(".m-agent").forEach((row) => {
        row.classList.toggle(
          "active",
          row.getAttribute("data-agent") === script.agent,
        );
      });
      if (boardTitle) boardTitle.textContent = agent.name;
      if (chatAgent) chatAgent.textContent = agent.name;
      if (chatAvatar) chatAvatar.style.background = agent.tint;
      if (missionEl) missionEl.textContent = script.mission;
      if (needsAgent) needsAgent.textContent = agent.name;
      if (needsAvatar) needsAvatar.style.background = agent.tint;
      if (needsTitle) needsTitle.textContent = script.needsYou.title;
      if (needsDesc) needsDesc.textContent = script.needsYou.desc;
    },
  };
};
