import { z } from "zod";

/** The routine planner's IANA zone, stamped by the deployment on a turn. */
export const TurnTimezoneSchema = z
  .string({ error: "invalid timezone: expected an IANA name" })
  .min(1)
  .refine((timezone) => {
    if (/^[+-]/.test(timezone)) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "invalid timezone: expected an IANA name")
  .optional();
