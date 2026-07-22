// Робота з датами у форматі YYYY-MM-DD в ЛОКАЛЬНОМУ часовому поясі.
// Уникаємо new Date("YYYY-MM-DD") — воно парситься як UTC і може зсунути день.

import { STR, type Lang } from "./i18n";

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

// Хвилини → "45 хв" / "1 год 30 хв" (або "45 min" / "1 h 30 min").
export function formatDuration(minutes: number, lang: Lang = "uk"): string {
  const { minShort, hourShort } = STR[lang];
  if (minutes < 60) return `${minutes} ${minShort}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ${hourShort}` : `${h} ${hourShort} ${m} ${minShort}`;
}

// "DD.MM" з ISO-дати.
export function shortDate(iso: string): string {
  const d = parseISO(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "Сьогодні" / "Завтра" для перших двох днів, далі "Середа 23.07" (або EN).
export function dayLabel(iso: string, todayIso: string, lang: Lang = "uk"): string {
  const diff = diffDays(iso, todayIso);
  if (diff === 0) return STR[lang].today;
  if (diff === 1) return STR[lang].tomorrow;
  const d = parseISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${STR[lang].weekdays[d.getDay()]} ${dd}.${mm}`;
}
