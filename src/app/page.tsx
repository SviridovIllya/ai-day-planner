"use client";

import { useEffect, useRef, useState } from "react";
import type { Priority, Task } from "@/lib/types";
import { dayLabel, localToday } from "@/lib/dates";

const STORAGE_KEY = "ai-day-planner:tasks";

const PRIORITY_STYLES: Record<Priority, { label: string; className: string }> = {
  high: { label: "Високий", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  medium: { label: "Середній", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  low: { label: "Низький", className: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

type DateGroup = { date: string; label: string; tasks: Task[] };

// T6: групуємо за scheduledDate, дати за зростанням; у групі — пріоритет, потім за часом.
function groupByDate(tasks: Task[], today: string): DateGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    const arr = byDate.get(t.scheduledDate) ?? [];
    arr.push(t);
    byDate.set(t.scheduledDate, arr);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: dayLabel(date, today),
      tasks: [...items].sort((x, y) => {
        const byPriority = PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority];
        if (byPriority !== 0) return byPriority;
        return (x.estimatedMinutes ?? Infinity) - (y.estimatedMinutes ?? Infinity);
      }),
    }));
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTasks(JSON.parse(stored));
    } catch {
      // пошкоджені дані — ігноруємо
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  async function handleParse() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today: localToday() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Помилка запиту");
      // T4: додаємо, не замінюємо; дедуп за назвою серед незавершених + у межах батчу.
      setTasks((prev) => {
        const seen = new Set(
          prev.filter((t) => !t.completed).map((t) => t.title.trim().toLowerCase()),
        );
        const additions: Task[] = [];
        for (const t of data.tasks as Task[]) {
          const key = t.title.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          additions.push(t);
        }
        return [...prev, ...additions];
      });
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Невідома помилка");
    } finally {
      setLoading(false);
    }
  }

  function toggleCompleted(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }

  const groups = tasks.length > 0 ? groupByDate(tasks, localToday()) : [];

  return (
    <div className="min-h-full flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-16">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            AI Day Planner
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Вивали все з голови — AI розкладе це на задачі по днях.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Що в голові? Напр.: купити молоко, подзвонити клієнту до п'ятниці, зробити презентацію…"
            rows={4}
            className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            onClick={handleParse}
            disabled={loading || !text.trim()}
            className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "Розбираю…" : "Розібрати"}
          </button>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </section>

        {tasks.length === 0 ? (
          // T7: свідомий empty state, а не "порожній екран як баг"
          <section className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
            <div className="text-4xl">🧠</div>
            <p className="font-medium text-black dark:text-zinc-50">Порожньо — і це добре</p>
            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
              Вивали в поле вище все, що крутиться в голові, і натисни «Розібрати».
              AI перетворить це на задачі й розкладе по днях.
            </p>
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.date} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {group.label}
                </h2>
                {group.tasks.map((task) => {
                  const p = PRIORITY_STYLES[task.priority];
                  return (
                    <label
                      key={task.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleCompleted(task.id)}
                        className="h-4 w-4 shrink-0 accent-black dark:accent-white"
                      />
                      <span
                        className={`flex-1 text-sm ${
                          task.completed
                            ? "text-zinc-400 line-through dark:text-zinc-600"
                            : "text-black dark:text-zinc-50"
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.estimatedMinutes != null && (
                        <span className="shrink-0 text-xs text-zinc-400">
                          {task.estimatedMinutes} хв
                        </span>
                      )}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.className}`}
                      >
                        {p.label}
                      </span>
                    </label>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
