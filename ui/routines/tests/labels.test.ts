import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_NEXT_FIRE_LABELS,
  interp,
  type ScheduleSummaryLabels,
} from "../src/labels.ts";
import { describeNextFire } from "../src/next-fire.ts";
import { cronSummary, presetSummary } from "../src/schedule-summary.ts";

describe("interp", () => {
  it("fills single-brace tokens", () => {
    assert.equal(
      interp("Runs every {n} minutes", { n: 5 }),
      "Runs every 5 minutes",
    );
  });
  it("fills multiple tokens and coerces numbers", () => {
    assert.equal(
      interp("{day} at {time}", { day: "Monday", time: "9:00 AM" }),
      "Monday at 9:00 AM",
    );
    assert.equal(interp("in {h}h {m}m", { h: 2, m: 14 }), "in 2h 14m");
  });
  it("leaves unknown tokens untouched", () => {
    assert.equal(interp("hi {name}", { other: "x" }), "hi {name}");
  });
});

// A Spanish-flavored label set proves the formatters localize purely through
// the `labels` + `locale` arguments — no English leaks through.
const ES_SUMMARY: ScheduleSummaryLabels = {
  noSchedule: "Sin horario definido",
  custom: "Horario personalizado",
  customCron: "Horario cron personalizado",
  every30: "Se ejecuta cada 30 minutos",
  everyHourStart: "Se ejecuta al inicio de cada hora",
  everyMinute: "Se ejecuta cada minuto",
  everyNMinutes: "Se ejecuta cada {n} minutos",
  everyHour: "Se ejecuta cada hora",
  everyNHours: "Se ejecuta cada {n} horas",
  everyDay: "Se ejecuta todos los días a las {time}",
  everyNDays: "Se ejecuta cada {n} días a las {time}",
  weekly: "Se ejecuta cada {day} a las {time}",
  weeklyOnDays: "Se ejecuta cada semana los {days} a las {time}",
  monthly: "Se ejecuta el día {n} de cada mes a las {time}",
  everyNMonths: "Se ejecuta el día {n} de cada {months} meses a las {time}",
};

describe("cronSummary localization", () => {
  it("keeps English output with the default labels", () => {
    assert.equal(cronSummary("*/5 * * * *"), "Runs every 5 minutes");
    assert.equal(cronSummary(""), "No schedule set");
  });
  it("uses the provided label set", () => {
    assert.equal(
      cronSummary("*/5 * * * *", ES_SUMMARY),
      "Se ejecuta cada 5 minutos",
    );
    assert.equal(
      cronSummary("0 */2 * * *", ES_SUMMARY),
      "Se ejecuta cada 2 horas",
    );
    assert.equal(cronSummary("", ES_SUMMARY), "Sin horario definido");
  });
  it("localizes the every-N-days time through Intl (24h for es, no English leak)", () => {
    const en = cronSummary("30 14 */2 * *");
    assert.equal(en, "Runs every 2 days at 2:30 PM");
    const es = cronSummary("30 14 */2 * *", ES_SUMMARY, "es");
    assert.match(es, /^Se ejecuta cada 2 días a las 14:30/);
    assert.doesNotMatch(es, /PM|AM/);
  });
});

describe("presetSummary localization", () => {
  it("renders a single-day Weekly as the weekday name", () => {
    // Wednesday (day 3) in the default English locale.
    assert.equal(
      presetSummary("weekly", {
        time: "09:00",
        daysOfWeek: [3],
        dayOfMonth: 1,
      }),
      "Runs every Wednesday at 9:00 AM",
    );
    // ...and in Spanish, both the template and the day name localize.
    assert.match(
      presetSummary(
        "weekly",
        { time: "09:00", daysOfWeek: [3], dayOfMonth: 1 },
        ES_SUMMARY,
        "es",
      ),
      /Se ejecuta cada miércoles a las/,
    );
  });
  it("renders a multi-day Weekly as a localized day list", () => {
    assert.equal(
      presetSummary("weekly", {
        time: "09:00",
        daysOfWeek: [1, 3, 5],
        dayOfMonth: 1,
      }),
      "Runs every week on Mon, Wed, and Fri at 9:00 AM",
    );
    const es = presetSummary(
      "weekly",
      { time: "09:00", daysOfWeek: [1, 3, 5], dayOfMonth: 1 },
      ES_SUMMARY,
      "es",
    );
    assert.match(es, /^Se ejecuta cada semana los /);
    assert.doesNotMatch(es, /Mon|Wed|Fri| and /);
  });
  it("renders the monthly ordinal in English", () => {
    assert.equal(
      presetSummary("monthly", {
        time: "09:00",
        daysOfWeek: [1],
        dayOfMonth: 15,
      }),
      "Runs on the 15th of every month at 9:00 AM",
    );
    // Spanish uses the plain day number, not an English ordinal.
    assert.match(
      presetSummary(
        "monthly",
        { time: "09:00", daysOfWeek: [1], dayOfMonth: 15 },
        ES_SUMMARY,
        "es",
      ),
      /^Se ejecuta el día 15 de cada mes a las /,
    );
  });
});

describe("describeNextFire localization", () => {
  const now = new Date("2026-06-05T12:00:00Z");

  it("phrases the relative time from the labels", () => {
    const next = new Date(now.getTime() + 5 * 60_000);
    assert.equal(describeNextFire(next, "UTC", now).relative, "in 5m");

    const esLabels = { ...DEFAULT_NEXT_FIRE_LABELS, inMinutes: "en {m}m" };
    assert.equal(
      describeNextFire(next, "UTC", now, esLabels, "es").relative,
      "en 5m",
    );
  });

  it("uses the 'today' label for same-day fires", () => {
    const next = new Date(now.getTime() + 30 * 60_000);
    const { absolute } = describeNextFire(next, "UTC", now);
    assert.match(absolute, /^today at /);
  });
});
