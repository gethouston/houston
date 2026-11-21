const THIN_GROUP = String.fromCharCode(0x202f);

export function formatCount(
  value: number,
  locale: string,
  fractionDigits = 0,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
  })
    .formatToParts(value)
    .map((part) => (part.type === "group" ? THIN_GROUP : part.value))
    .join("");
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface WorkFigure {
  value: string;
  count: number;
  unit: "hours" | "minutes";
}

export function formatWork(ms: number, locale: string): WorkFigure {
  if (ms > 0 && ms < HOUR_MS) {
    const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
    return {
      value: formatCount(minutes, locale),
      count: minutes,
      unit: "minutes",
    };
  }
  const hours = Math.max(0, ms) / HOUR_MS;
  const digits = hours < 10 ? 1 : 0;
  const count = Number(hours.toFixed(digits));
  return { value: formatCount(count, locale, digits), count, unit: "hours" };
}

export interface AreaChartGeometry {
  line: string;
  area: string;
  base: number;
  end: { x: number; y: number };
}

const fixed = (n: number) => Number(n.toFixed(1));

export function areaChart(
  values: readonly number[],
  width: number,
  height: number,
): AreaChartGeometry {
  const series = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const top = Math.max(...series) * 1.08 || 1;
  const base = height - 1;
  const points = series.map((value, index) => ({
    x: fixed(3 + (index / (series.length - 1)) * (width - 6)),
    y: fixed(4 + (1 - Math.max(0, value) / top) * (base - 4)),
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const first = points[0] ?? { x: 0, y: base };
  const end = points[points.length - 1] ?? first;
  return {
    line,
    area: `${first.x},${base} ${line} ${end.x},${base}`,
    base,
    end,
  };
}

export function dayLabel(
  language: string,
  day: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(language, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
