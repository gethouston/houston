//! Optional routine suggestion parsed out of the instruction-generation
//! response. The cron expression is built and validated here from a
//! constrained schedule set — never taken raw from the LLM — so a
//! hallucinated expression can't create a runaway every-minute schedule.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Internal classification used only to build the cron. Not part of the
/// wire shape — the engine returns the resolved cron, not the kind.
enum RoutineScheduleKind {
    Daily,
    Weekdays,
    Weekly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedRoutine {
    pub name: String,
    pub prompt: String,
    /// 5-field cron, built and validated by the engine.
    pub schedule: String,
}

/// Parse "HH:MM" (24h) into (hour, minute), rejecting out-of-range values.
fn parse_hh_mm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.split_once(':')?;
    let hour: u32 = h.trim().parse().ok()?;
    let minute: u32 = m.trim().parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some((hour, minute))
}

/// Build a validated routine from the model's `suggestedRoutine` value.
///
/// Returns `None` for null/missing/malformed input — the routine is optional,
/// so its absence must not fail the whole generation.
pub fn build_routine(v: Option<&Value>) -> Option<SuggestedRoutine> {
    let obj = v?;
    if obj.is_null() {
        return None;
    }
    let name = obj.get("name")?.as_str()?.trim().to_string();
    let prompt = obj.get("prompt")?.as_str()?.trim().to_string();
    if name.is_empty() || prompt.is_empty() {
        return None;
    }
    let kind = match obj.get("scheduleType")?.as_str()?.to_lowercase().as_str() {
        "daily" => RoutineScheduleKind::Daily,
        "weekdays" => RoutineScheduleKind::Weekdays,
        "weekly" => RoutineScheduleKind::Weekly,
        _ => return None,
    };
    let time_of_day = obj.get("timeOfDay")?.as_str()?.trim();
    let (hour, minute) = parse_hh_mm(time_of_day)?;
    let dow = obj
        .get("dayOfWeek")
        .and_then(Value::as_u64)
        .map(|d| d as u32)
        .filter(|d| *d <= 6);

    let schedule = match kind {
        RoutineScheduleKind::Daily => format!("{minute} {hour} * * *"),
        RoutineScheduleKind::Weekdays => format!("{minute} {hour} * * 1-5"),
        RoutineScheduleKind::Weekly => {
            format!("{minute} {hour} * * {}", dow.unwrap_or(1))
        }
    };

    Some(SuggestedRoutine {
        name,
        prompt,
        schedule,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn routine(v: serde_json::Value) -> Option<SuggestedRoutine> {
        build_routine(Some(&v))
    }

    #[test]
    fn daily_builds_5_field_cron() {
        let r = routine(json!({
            "name": "Morning digest", "prompt": "Summarize new emails.",
            "scheduleType": "daily", "timeOfDay": "08:00"
        }))
        .unwrap();
        assert_eq!(r.name, "Morning digest");
        assert_eq!(r.schedule, "0 8 * * *");
    }

    #[test]
    fn weekdays_builds_cron() {
        let r = routine(json!({
            "name": "Standup", "prompt": "Post standup.",
            "scheduleType": "weekdays", "timeOfDay": "09:30"
        }))
        .unwrap();
        assert_eq!(r.schedule, "30 9 * * 1-5");
    }

    #[test]
    fn weekly_with_day_of_week() {
        let r = routine(json!({
            "name": "Report", "prompt": "Send weekly report.",
            "scheduleType": "weekly", "timeOfDay": "17:00", "dayOfWeek": 5
        }))
        .unwrap();
        assert_eq!(r.schedule, "0 17 * * 5");
    }

    #[test]
    fn weekly_without_day_defaults_to_monday() {
        let r = routine(json!({
            "name": "R", "prompt": "P.",
            "scheduleType": "weekly", "timeOfDay": "06:00"
        }))
        .unwrap();
        assert_eq!(r.schedule, "0 6 * * 1");
    }

    #[test]
    fn null_and_missing_are_none() {
        assert!(build_routine(Some(&Value::Null)).is_none());
        assert!(build_routine(None).is_none());
    }

    #[test]
    fn invalid_fields_drop_to_none() {
        // Unknown scheduleType.
        assert!(routine(json!({
            "name": "R", "prompt": "P", "scheduleType": "hourly", "timeOfDay": "08:00"
        }))
        .is_none());
        // Out-of-range time.
        assert!(routine(json!({
            "name": "R", "prompt": "P", "scheduleType": "daily", "timeOfDay": "25:00"
        }))
        .is_none());
        // Empty name.
        assert!(routine(json!({
            "name": "", "prompt": "P", "scheduleType": "daily", "timeOfDay": "08:00"
        }))
        .is_none());
    }
}
