export const LIMITS = {
  employees: { min: 20, max: 10000 },
  years: { min: 1, max: 50 },
};

const bound = (c, e, y) =>
  c.base + c.perEmployee * e + c.perYear * y + c.perEmployeeYear * e * y;

const inRange = (n, { min, max }) =>
  Number.isInteger(n) && n >= min && n <= max;

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
