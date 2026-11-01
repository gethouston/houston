// The /data-partners estimator (markup: _includes/data-partners/estimator.njk).
// Two sliders and the region pick feed the payout model the build embedded;
// the range redraws on every move. The employees slider holds a log-scale
// position, turned into a head count by employeesAt. Without JS the markup's
// default range stands.

import { employeesAt, estimatePayout } from "./payout-model.js";

const root = document.querySelector("[data-estimator]");
if (root) {
  const model = JSON.parse(root.querySelector("[data-model]").textContent);
  const form = root.querySelector("form");
  const { employees: employeesInput, years: yearsInput } = form.elements;
  const showEmployees = root.querySelector('[data-show="employees"]');
  const showYears = root.querySelector('[data-show="years"]');
  const low = root.querySelector('[data-out="low"]');
  const high = root.querySelector('[data-out="high"]');
  const lang = document.documentElement.lang || "en";
  const count = new Intl.NumberFormat(lang);
  const money = new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  // The filled part of each track, for the CSS gradient.
  const paint = (input) => {
    const span = Number(input.max) - Number(input.min);
    const share = ((Number(input.value) - Number(input.min)) / span) * 100;
    input.style.setProperty("--fill", `${share}%`);
  };

  const update = () => {
    const employees = employeesAt(Number(employeesInput.value));
    const years = Number(yearsInput.value);
    const region = form.elements.region.value;
    const range = estimatePayout(model, { employees, years, region });
    showEmployees.textContent = count.format(employees);
    showYears.textContent = count.format(years);
    employeesInput.setAttribute("aria-valuetext", count.format(employees));
    paint(employeesInput);
    paint(yearsInput);
    if (!range) return;
    low.textContent = money.format(range.low);
    high.textContent = money.format(range.high);
  };

  form.addEventListener("input", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  update();
}
