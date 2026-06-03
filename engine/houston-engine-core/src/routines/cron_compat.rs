//! Compatibility shim between standard Unix cron day-of-week numbering and the
//! `cron` crate's numbering.
//!
//! The whole product speaks **standard Unix cron**: day-of-week `0..=6` with
//! `0`/`7` = Sunday. That is what the schedule-builder UI emits
//! (`ui/routines/src/schedule-cron-utils.ts`) and what the frontend `nextFire`
//! preview interprets (`ui/routines/src/next-fire.ts`). The `cron` crate we run
//! on the backend numbers days **`1..=7` with `1` = Sunday, `7` = Saturday**,
//! and rejects `0` outright.
//!
//! Handing the crate our schedules verbatim fired every weekly routine one day
//! early (Monday `1` → Sunday) and made Sunday routines (`0`) fail to schedule
//! at all — the `Schedule::from_str` error was only logged, so the routine
//! silently never fired while the UI happily showed "next Sunday". See issue
//! #389.
//!
//! [`to_engine_cron`] is the single translation point: it turns a 5-field
//! standard cron into the 7-field string the crate parses, shifting the
//! day-of-week field into the crate's numbering so the routine fires on the day
//! the user actually picked.

/// Convert a 5-field standard cron expression into the 7-field form the `cron`
/// crate parses (`sec min hour dom month dow year`), translating the
/// day-of-week field from standard Unix numbering (`0`/`7` = Sunday) into the
/// crate's (`1` = Sunday, `7` = Saturday).
///
/// Anything that is not a clean 5-field expression is wrapped verbatim so
/// `Schedule::from_str` surfaces the same parse error it always did — we never
/// silently rewrite a malformed schedule.
pub(crate) fn to_engine_cron(schedule: &str) -> String {
    let fields: Vec<&str> = schedule.split_whitespace().collect();
    if fields.len() != 5 {
        return format!("0 {schedule} *");
    }
    let dow = normalize_dow(fields[4]);
    format!(
        "0 {} {} {} {} {} *",
        fields[0], fields[1], fields[2], fields[3], dow
    )
}

/// Shift every day-of-week ordinal in a cron field by the standard→crate offset
/// (`+1`, with Sunday `0`/`7` → `1`). Structure (`*`, ranges, lists, steps) is
/// preserved; step *intervals* are left untouched since they are counts, not
/// ordinals. Day names and out-of-range numbers pass through unchanged so the
/// `cron` crate reports the error instead of us rewriting a bad schedule into a
/// valid-but-wrong one.
fn normalize_dow(field: &str) -> String {
    // Names (`MON`, `sun`, …) already mean the right day to the crate; only the
    // numeric convention differs. Leave name-bearing fields alone.
    if field.chars().any(|c| c.is_ascii_alphabetic()) {
        return field.to_string();
    }
    let mut parts = Vec::with_capacity(field.split(',').count());
    for part in field.split(',') {
        match shift_part(part) {
            Some(shifted) => parts.push(shifted),
            None => return field.to_string(),
        }
    }
    parts.join(",")
}

/// Shift one comma-separated component (`*`, `n`, `a-b`, each with an optional
/// `/step`). Returns `None` if the component is not a plain numeric form we can
/// safely shift, so the caller can pass the whole field through untouched.
fn shift_part(part: &str) -> Option<String> {
    let (range, step) = match part.split_once('/') {
        Some((r, s)) => (r, Some(s)),
        None => (part, None),
    };

    let shifted_range = if range == "*" {
        "*".to_string()
    } else if let Some((lo, hi)) = range.split_once('-') {
        format!("{}-{}", shift_ordinal(lo)?, shift_ordinal(hi)?)
    } else {
        shift_ordinal(range)?
    };

    Some(match step {
        Some(s) => format!("{shifted_range}/{s}"),
        None => shifted_range,
    })
}

/// Map a single standard day-of-week ordinal (`0..=7`, `0`/`7` = Sunday) onto
/// the `cron` crate's (`1..=7`, `1` = Sunday). Returns `None` for anything
/// outside `0..=7` so the field is left intact and the crate rejects it.
fn shift_ordinal(tok: &str) -> Option<String> {
    let n: u32 = tok.parse().ok()?;
    if n > 7 {
        return None;
    }
    Some(((n % 7) + 1).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Utc, Weekday};
    use cron::Schedule;
    use std::str::FromStr;

    // -- String translation --

    #[test]
    fn single_days_shift_by_one() {
        assert_eq!(to_engine_cron("0 9 * * 0"), "0 0 9 * * 1 *"); // Sunday
        assert_eq!(to_engine_cron("0 9 * * 1"), "0 0 9 * * 2 *"); // Monday
        assert_eq!(to_engine_cron("0 9 * * 6"), "0 0 9 * * 7 *"); // Saturday
    }

    #[test]
    fn sunday_seven_wraps_to_one() {
        // Standard cron also accepts 7 for Sunday; the crate's Sunday is 1.
        assert_eq!(to_engine_cron("0 9 * * 7"), "0 0 9 * * 1 *");
    }

    #[test]
    fn weekday_range_shifts_both_bounds() {
        // 1-5 (Mon-Fri, standard) → 2-6 (Mon-Fri, crate).
        assert_eq!(to_engine_cron("30 8 * * 1-5"), "0 30 8 * * 2-6 *");
    }

    #[test]
    fn day_list_each_member_shifts() {
        assert_eq!(to_engine_cron("0 9 * * 1,3,5"), "0 0 9 * * 2,4,6 *");
    }

    #[test]
    fn star_and_minute_steps_are_untouched() {
        assert_eq!(to_engine_cron("*/30 * * * *"), "0 */30 * * * * *");
        assert_eq!(to_engine_cron("0 9 * * *"), "0 0 9 * * * *");
        assert_eq!(to_engine_cron("0 * * * *"), "0 0 * * * * *");
    }

    #[test]
    fn dow_step_keeps_interval_shifts_base() {
        // base 0 (Sun) shifts to 1, the /2 interval is a count and stays.
        assert_eq!(to_engine_cron("0 9 * * 0/2"), "0 0 9 * * 1/2 *");
    }

    #[test]
    fn malformed_or_out_of_range_passes_through_for_the_crate_to_reject() {
        assert_eq!(to_engine_cron("not a cron"), "0 not a cron *");
        // 9 is out of range; leave it so Schedule::from_str errors as before.
        assert_eq!(to_engine_cron("0 9 * * 9"), "0 0 9 * * 9 *");
    }

    // -- Behaviour through the real cron crate --

    fn next_weekday(cron5: &str) -> Weekday {
        let schedule = Schedule::from_str(&to_engine_cron(cron5))
            .unwrap_or_else(|e| panic!("{cron5} should parse: {e}"));
        schedule
            .upcoming(Utc)
            .next()
            .expect("schedule should have an upcoming fire")
            .weekday()
    }

    #[test]
    fn weekly_monday_actually_fires_on_monday() {
        assert_eq!(next_weekday("0 9 * * 1"), Weekday::Mon);
    }

    #[test]
    fn weekly_sunday_actually_fires_on_sunday() {
        // Before the fix this cron failed to parse at all (`0` < min 1).
        assert_eq!(next_weekday("0 9 * * 0"), Weekday::Sun);
    }

    #[test]
    fn weekly_saturday_actually_fires_on_saturday() {
        assert_eq!(next_weekday("0 9 * * 6"), Weekday::Sat);
    }

    #[test]
    fn weekdays_never_land_on_the_weekend() {
        let schedule = Schedule::from_str(&to_engine_cron("0 9 * * 1-5")).unwrap();
        for fire in schedule.upcoming(Utc).take(14) {
            assert!(
                !matches!(fire.weekday(), Weekday::Sat | Weekday::Sun),
                "weekdays routine fired on {fire}",
            );
        }
    }
}
