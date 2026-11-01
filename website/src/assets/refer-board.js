// The request board on /data-partners/refer: the industry tabs and the search
// narrow the cards already in the page, and the count says how many are left.
// Nothing is fetched or rendered here; without JS every card stands.

(() => {
  const board = document.querySelector("[data-board]");
  if (!board) return;
  const tabs = Array.from(board.querySelectorAll("[data-cat]")).filter(
    (node) => node.tagName === "BUTTON",
  );
  const cards = Array.from(board.querySelectorAll(".rf-listing"));
  const search = board.querySelector("[data-search]");
  const count = board.querySelector("[data-count]");
  const empty = board.querySelector("[data-empty]");
  const one = board.getAttribute("data-count-one");
  const other = board.getAttribute("data-count-other");
  let category = "";

  const apply = () => {
    const query = (search?.value ?? "").trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const inCategory = !category || card.dataset.cat === category;
      const matches = !query || card.dataset.text.includes(query);
      card.hidden = !(inCategory && matches);
      if (!card.hidden) shown++;
    }
    for (const tab of tabs) {
      tab.setAttribute("aria-pressed", String(tab.dataset.cat === category));
    }
    count.textContent = (shown === 1 ? one : other).replace("{count}", shown);
    empty.hidden = shown > 0;
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      category = tab.dataset.cat;
      apply();
    });
  }
  search?.addEventListener("input", apply);
  board.querySelector("[data-show-all]")?.addEventListener("click", () => {
    category = "";
    if (search) search.value = "";
    apply();
    search?.focus();
  });
})();
