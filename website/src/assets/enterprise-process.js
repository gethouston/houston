(() => {
  const root = document.querySelector("[data-slider]");
  if (!root) return;
  const slides = Array.from(root.querySelectorAll("[data-slide]"));
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  const marks = Array.from(root.querySelectorAll(".ent-dots i"));
  if (slides.length < 2) return;

  const last = slides.length - 1;
  let current = 0;
  const show = (index) => {
    current = Math.max(0, Math.min(last, index));
    slides.forEach((slide, i) => {
      const on = i === current;
      slide.classList.toggle("is-on", on);
      slide.setAttribute("aria-hidden", on ? "false" : "true");
    });
    marks.forEach((mark, i) => {
      mark.classList.toggle("is-on", i === current);
    });
    prev.disabled = current === 0;
    next.disabled = current === last;
    root.classList.toggle("is-last", current === last);
  };
  show(0);

  prev.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") show(current + 1);
    else if (event.key === "ArrowLeft" && current > 0) show(current - 1);
    else return;
    event.preventDefault();
  });

  let startX = 0;
  let startY = 0;
  root.addEventListener(
    "touchstart",
    (event) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    },
    { passive: true },
  );
  root.addEventListener(
    "touchend",
    (event) => {
      const dx = event.changedTouches[0].clientX - startX;
      const dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) show(current + 1);
      else if (current > 0) show(current - 1);
    },
    { passive: true },
  );
})();
