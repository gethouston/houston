// The /data-partners payout estimate. Pure: no DOM, so the page's estimator
// (data-partners-estimator.js), the build (the no-JS figure in
// _data/dataPartners.js) and the tests all run this one function.
//
// Each bound is a bilinear surface in employees (E) and years of data (Y),
// scaled by the headquarters region and by Houston's share of the reference
// curve the coefficients were fitted to:
//   bound = (base + perEmployee·E + perYear·Y + perEmployeeYear·E·Y)
//           × region × share
// The coefficients and the share live in _data/dataPartners.js.

// The employee floor is the program's bar (the FAQ's 20 full-time employees):
// the estimator only prices companies that qualify.
export const LIMITS = {
  employees: { min: 20, max: 10000 },
  years: { min: 1, max: 50 },
};

const bound = (c, e, y) =>
  c.base + c.perEmployee * e + c.perYear * y + c.perEmployeeYear * e * y;

const inRange = (n, { min, max }) =>
  Number.isInteger(n) && n >= min && n <= max;

// Returns { low, high } in whole US dollars, or null when an input is out of
// range or the region is unknown, so a caller never formats NaN.
export function estimatePayout(model, { employees, years, region }) {
  const scale = model.regions[region];
  if (scale === undefined) return null;
  if (!inRange(employees, LIMITS.employees)) return null;
  if (!inRange(years, LIMITS.years)) return null;
  const factor = scale * model.share;
  return {
    low: Math.round(bound(model.low, employees, years) * factor),
    high: Math.round(bound(model.high, employees, years) * factor),
  };
}

// The employees slider runs on a log scale, so 10 to 100 gets as much travel
// as 1,000 to 10,000. Positions are 0 to SLIDER_STEPS; values are rounded to
// two significant figures (35, 350, 3,500), never past the limits.
export const SLIDER_STEPS = 1000;
const { min: MIN_E, max: MAX_E } = LIMITS.employees;
const SPAN = Math.log10(MAX_E / MIN_E);

export function employeesAt(position) {
  const raw = MIN_E * 10 ** ((position / SLIDER_STEPS) * SPAN);
  const step = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1);
  return Math.min(MAX_E, Math.max(MIN_E, Math.round(raw / step) * step));
}

export function positionFor(employees) {
  return Math.round((Math.log10(employees / MIN_E) / SPAN) * SLIDER_STEPS);
}
