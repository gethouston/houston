// Step-through behavior for every diagram. Inside a [data-stepper] figure:
//   data-on="2,3"  → element is visible only on those steps
//   data-hl="2"    → element gets the .hl / .on class on those steps
//   [data-caption] → shows captions[step-1] (JSON in data-captions on the figure)
// Steps are 1-based. Buttons: [data-act="next|back|restart|goto"] (goto uses data-step).

function parse(list: string | null): number[] {
  return (list ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0);
}

export function initSteppers() {
  document
    .querySelectorAll<HTMLElement>("[data-stepper]:not([data-ready])")
    .forEach((fig) => {
      fig.dataset.ready = "1";
      const captions: string[] = JSON.parse(fig.dataset.captions ?? "[]");
      const total = captions.length;
      let step = 1;

      const render = () => {
        fig.dataset.step = String(step);
        fig
          .querySelectorAll<HTMLElement | SVGElement>("[data-on]")
          .forEach((el) => {
            const on = parse(el.getAttribute("data-on")).includes(step);
            if (on) el.removeAttribute("hidden");
            else el.setAttribute("hidden", "");
          });
        fig
          .querySelectorAll<HTMLElement | SVGElement>("[data-hl]")
          .forEach((el) => {
            const on = parse(el.getAttribute("data-hl")).includes(step);
            el.classList.toggle("hl", on);
            el.classList.toggle("on", on);
          });
        const cap = fig.querySelector("[data-caption]");
        if (cap) cap.textContent = captions[step - 1] ?? "";
        const count = fig.querySelector("[data-count]");
        if (count) count.textContent = `${step} / ${total}`;
        fig.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
          const act = b.dataset.act;
          if (act === "back") b.disabled = step <= 1;
          if (act === "next") b.disabled = step >= total;
          if (act === "goto")
            b.setAttribute(
              "aria-pressed",
              String(Number(b.dataset.step) === step),
            );
        });
      };

      fig.addEventListener("click", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
          "[data-act]",
        );
        if (!b || !fig.contains(b)) return;
        const act = b.dataset.act;
        if (act === "next") step = Math.min(total, step + 1);
        if (act === "back") step = Math.max(1, step - 1);
        if (act === "restart") step = 1;
        if (act === "goto") step = Number(b.dataset.step) || 1;
        render();
      });
      render();
    });
}
