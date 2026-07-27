/*
 * Stage switcher for the scripted hero demo: points every STATIC bit of the
 * true-to-app hero board at the current mission's agent — sidebar highlight,
 * board title, and the "Needs you" card (avatar, name, title, desc, and the
 * human face stack) — exactly like picking another agent in the real app. The
 * dynamic beats (the Running to Done card) live in hero-demo.js.
 *
 * Loaded before hero-demo.js (both `defer`, in order), which calls
 * `window.createHeroDemoStage(root, agents)` and reuses `window.heroFacesHtml`.
 */

// Build the overlapping human face stack for a mission (the multiplayer signal,
// mirroring @houston-ai/board KanbanPeople): up to 3 avatars, then a "+N" chip.
// A person is EITHER a real teammate photo (`{ img, label }`) or an initials
// avatar in a quiet tone (`{ initials, tone }`). Shared by the static "Needs
// you" card and the JS-created Running card (hero-demo.js). Returns HTML; the
// caller owns the .faces container.
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
