import { now } from "./clock.js";

/** YYYY-MM-DD for `ms` in the given IANA timezone. */
export function dateKeyInTz(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  }
}

/** Local HH:MM (24h) for `ms` in the given timezone. */
export function timeHmInTz(ms: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  } catch {
    const d = new Date(ms);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
}

/** Today's date key in timezone. */
export function todayKey(timeZone: string): string {
  return dateKeyInTz(now(), timeZone);
}

/** Compare HH:MM strings: -1 if a<b, 0 equal, 1 if a>b. */
export function cmpHm(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Validate HH:MM 24h. */
export function isValidHm(s: string): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  return Boolean(m);
}

/** Common timezone choices for onboarding buttons. */
export const COMMON_TIMEZONES: { label: string; tz: string }[] = [
  { label: "UTC", tz: "UTC" },
  { label: "US Eastern", tz: "America/New_York" },
  { label: "US Central", tz: "America/Chicago" },
  { label: "US Pacific", tz: "America/Los_Angeles" },
  { label: "UK", tz: "Europe/London" },
  { label: "Central Europe", tz: "Europe/Berlin" },
  { label: "India", tz: "Asia/Kolkata" },
  { label: "Japan", tz: "Asia/Tokyo" },
  { label: "Australia East", tz: "Australia/Sydney" },
];

/** Shift a YYYY-MM-DD by `delta` days (calendar arithmetic in UTC noon). */
export function shiftDateKey(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}
