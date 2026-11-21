(() => {
  const html = document.documentElement;
  const zones = Array.from(document.querySelectorAll("main [data-tone]"));
  if (!zones.length || !("IntersectionObserver" in window)) return;
  const flowing = zones.filter(
    (zone) =>
      zone.classList.contains("section") &&
      !zone.hasAttribute("data-tone-fixed"),
  );

  let tone = "";
  const apply = (next) => {
    if (!next || next === tone) return;
    tone = next;
    const dark = next === "dark";
    html.classList.toggle("ent-tone-dark", dark);
    for (const zone of flowing) zone.classList.toggle("is-dark", dark);
    document.dispatchEvent(new CustomEvent("ent:tone", { detail: next }));
  };

  html.classList.add("ent-flow");
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) apply(entry.target.getAttribute("data-tone"));
      }
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  for (const zone of zones) io.observe(zone);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof window.Lenis !== "function") return;
  const lenis = new window.Lenis({
    lerp: 0.11,
    smoothWheel: true,
    anchors: true,
    autoRaf: true,
  });
  window.lenis = lenis;
})();
