/** Relative + absolute "next run" phrasing. `{m}`/`{h}`/`{d}`/`{day}`/`{time}`. */
export interface NextFireLabels {
  lessThanMinute: string;
  inMinutes: string;
  inHoursMinutes: string;
  inDaysHours: string;
  inDays: string;
  today: string;
  tomorrow: string;
  soon: string;
  at: string;
}
