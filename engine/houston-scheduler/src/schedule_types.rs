use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// High-level schedule definitions that can be converted to cron expressions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleType {
    /// Run once daily at the given time (HH:MM format).
    Daily { time_of_day: String },
    /// Run Monday through Friday at the given time.
    Weekdays { time_of_day: String },
    /// Run on a specific day of the week (0 = Sunday) at the given time.
    Weekly {
        day_of_week: u32,
        time_of_day: String,
    },
    /// Run on a specific day of the month at the given time.
    Monthly {
        day_of_month: u32,
        time_of_day: String,
    },
    /// Raw cron expression.
    Cron { expression: String },
    /// Fixed interval in seconds.
    Interval { seconds: u64 },
}

impl ScheduleType {
    /// Convert to a cron expression string.
    ///
    /// Returns `None` for `Interval` (which is not cron-representable).
    pub fn to_cron_expression(&self) -> Option<String> {
        match self {
            Self::Daily { time_of_day } => {
                let (hour, minute) = parse_time_of_day(time_of_day)?;
                Some(format!("0 {} {} * * *", minute, hour))
            }
            Self::Weekdays { time_of_day } => {
                let (hour, minute) = parse_time_of_day(time_of_day)?;
                Some(format!("0 {} {} * * 1-5", minute, hour))
            }
            Self::Weekly {
                day_of_week,
                time_of_day,
            } => {
                let (hour, minute) = parse_time_of_day(time_of_day)?;
                Some(format!("0 {} {} * * {}", minute, hour, day_of_week))
            }
            Self::Monthly {
                day_of_month,
                time_of_day,
            } => {
                let (hour, minute) = parse_time_of_day(time_of_day)?;
                Some(format!("0 {} {} {} * *", minute, hour, day_of_month))
            }
            Self::Cron { expression } => Some(expression.clone()),
            Self::Interval { .. } => None,
        }
    }

    /// Calculate the next occurrence from now.
    ///
    /// For `Interval`, returns `now + interval`. For cron-based schedules,
    /// parses the expression and finds the next matching time.
    pub fn next_occurrence(&self) -> Option<DateTime<Utc>> {
        match self {
            Self::Interval { seconds } => {
                Some(Utc::now() + chrono::Duration::seconds(*seconds as i64))
            }
            other => {
                let expr = other.to_cron_expression()?;
                next_from_cron(&expr)
            }
        }
    }
}

/// Parse "HH:MM" into (hour, minute).
fn parse_time_of_day(s: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some((hour, minute))
}

/// Compute the next occurrence for a cron expression from now.
fn next_from_cron(expr: &str) -> Option<DateTime<Utc>> {
    use cron::Schedule;
    use std::str::FromStr;

    let schedule = Schedule::from_str(expr).ok()?;
    schedule.upcoming(Utc).next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_to_cron() {
        let s = ScheduleType::Daily {
            time_of_day: "09:30".to_string(),
        };
        assert_eq!(s.to_cron_expression(), Some("0 30 9 * * *".to_string()));
    }

    #[test]
    fn weekdays_to_cron() {
        let s = ScheduleType::Weekdays {
            time_of_day: "17:00".to_string(),
        };
        assert_eq!(s.to_cron_expression(), Some("0 0 17 * * 1-5".to_string()));
    }

    #[test]
    fn interval_has_no_cron() {
        let s = ScheduleType::Interval { seconds: 60 };
        assert_eq!(s.to_cron_expression(), None);
    }

    #[test]
    fn interval_next_occurrence() {
        let s = ScheduleType::Interval { seconds: 300 };
        let next = s.next_occurrence().expect("should compute next");
        let now = Utc::now();
        // Should be roughly 5 minutes from now (allow 2 seconds of slack).
        let diff = (next - now).num_seconds();
        assert!(diff >= 298 && diff <= 302);
    }

    #[test]
    fn invalid_time_returns_none() {
        let s = ScheduleType::Daily {
            time_of_day: "25:00".to_string(),
        };
        assert_eq!(s.to_cron_expression(), None);
    }
}
