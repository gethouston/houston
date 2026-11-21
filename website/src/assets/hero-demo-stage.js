window.heroFacesHtml = (people, max) => {
  if (!people?.length) return "";
  var cap = max || 3;
  var faces = people.slice(0, cap);
  var extra = people.length - faces.length;
  var html = faces
    .map((p) =>
      p.img
        ? `<span class="face face-img" title="${p.label || ""}"><img src="${p.img}" alt=""></span>`
        : `<span class="face ${p.tone}">${p.initials}</span>`,
    )
    .join("");
  if (extra > 0) html += `<span class="face face-more">+${extra}</span>`;
  return html;
};

window.createHeroDemoStage = (root, agents) => {
  var boardTitle = root.querySelector("#hd-board-title");
  var needsAvatar = root.querySelector("#hd-needs-avatar");
  var needsAgent = root.querySelector("#hd-needs-agent");
  var needsTitle = root.querySelector("#hd-needs-title");
  var needsDesc = root.querySelector("#hd-needs-desc");
  var needsPeople = root.querySelector("#hd-needs-people");

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
      }
      if (needsTitle) needsTitle.textContent = script.needsYou.title;
      if (needsDesc) needsDesc.textContent = script.needsYou.desc;
      if (needsPeople) {
        needsPeople.innerHTML = window.heroFacesHtml(script.needsYou.people);
      }
    },
  };
};
