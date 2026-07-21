// Робота з датами у форматі YYYY-MM-DD в ЛОКАЛЬНОМУ часовому поясі.
// Уникаємо new Date("YYYY-MM-DD") — воно парситься як UTC і може зсунути день.

const WEEKDAYS = [
  "Неділя",
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "П'ятниця",
  "Субота",
];

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localToday(): string {
  return isoDate(new Date());
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return !Number.isNaN(d.getTime()) && isoDate(d) === s;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function diffDays(iso: string, fromIso: string): number {
  const a = parseISO(iso).getTime();
  const b = parseISO(fromIso).getTime();
  return Math.round((a - b) / 86_400_000);
}

// "Сьогодні" / "Завтра" для перших двох днів, далі "Середа 23.07".
export function dayLabel(iso: string, todayIso: string): string {
  const diff = diffDays(iso, todayIso);
  if (diff === 0) return "Сьогодні";
  if (diff === 1) return "Завтра";
  const d = parseISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${dd}.${mm}`;
}
