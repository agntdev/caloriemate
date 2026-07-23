import type { LogEntry, UserProfile } from "./types.js";

export function formatKcal(n: number): string {
  return `${Math.round(n)} kcal`;
}

export function dayTotal(entries: LogEntry[]): number {
  return entries.reduce((s, e) => s + (e.confirmed ? e.calories : 0), 0);
}

export function formatLogList(
  entries: LogEntry[],
  profile: UserProfile,
  dateKey: string,
): string {
  const total = dayTotal(entries);
  const remaining = profile.dailyTarget - total;
  const header = `Log for ${dateKey}\nTarget ${formatKcal(profile.dailyTarget)} · eaten ${formatKcal(total)} · left ${formatKcal(remaining)}`;
  if (entries.length === 0) {
    return `${header}\n\nNo entries yet — tap Start Tracking to add one.`;
  }
  const lines = entries.map((e, i) => {
    const q =
      e.quantity !== 1 && e.portion
        ? ` ×${e.quantity} (${e.portion})`
        : e.portion
          ? ` (${e.portion})`
          : e.quantity !== 1
            ? ` ×${e.quantity}`
            : "";
    const src =
      e.source === "photo" ? " · photo" : e.source === "database" ? " · db" : "";
    return `${i + 1}. ${e.foodName}${q} — ${formatKcal(e.calories)}${src}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}

export function entriesToCsv(entries: LogEntry[]): string {
  const header = "date,time_utc,food,portion,quantity,calories,source,confirmed";
  const rows = entries.map((e) => {
    const iso = new Date(e.timestamp).toISOString();
    const date = e.dateKey;
    const time = iso.slice(11, 19);
    const food = csvEscape(e.foodName);
    const portion = csvEscape(e.portion ?? "");
    return `${date},${time},${food},${portion},${e.quantity},${e.calories},${e.source},${e.confirmed}`;
  });
  return [header, ...rows].join("\n");
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function backRow(): { text: string; data: string } {
  return { text: "Back to menu", data: "menu:main" };
}
