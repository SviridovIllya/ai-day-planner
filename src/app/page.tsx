"use client";

import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Priority, Task } from "@/lib/types";
import { addDays, dayLabel, localToday } from "@/lib/dates";

// Тримаємо виміри droppable-ів свіжими (список задач змінюється).
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

// Кидай туди, де курсор; якщо курсор у проміжку між днями — беремо найближчий день.
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : closestCenter(args);
};

const STORAGE_KEY = "ai-day-planner:tasks";
const HORIZON_DAYS = 7;

const PRIORITY_STYLES: Record<Priority, { label: string; className: string }> = {
  high: { label: "Високий", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  medium: { label: "Середній", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  low: { label: "Низький", className: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((x, y) => {
    const byPriority = PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority];
    if (byPriority !== 0) return byPriority;
    return (x.estimatedMinutes ?? Infinity) - (y.estimatedMinutes ?? Infinity);
  });
}

// Презентаційна картка задачі (використовується в списку і в DragOverlay).
function TaskCard({
  task,
  onToggle,
  onDelete,
  handleProps,
  dragging,
}: {
  task: Task;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
  handleProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const p = PRIORITY_STYLES[task.priority];
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <button
        {...handleProps}
        aria-label="Перетягнути"
        className="shrink-0 cursor-grab touch-none px-1 text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600"
      >
        ⠿
      </button>
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle?.(task.id)}
        className="h-4 w-4 shrink-0 accent-black dark:accent-white"
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          task.completed
            ? "text-zinc-400 line-through dark:text-zinc-600"
            : "text-black dark:text-zinc-50"
        }`}
      >
        {task.title}
      </span>
      {task.estimatedMinutes != null && (
        <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">
          {task.estimatedMinutes} хв
        </span>
      )}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.className}`}>
        {p.label}
      </span>
      <button
        onClick={() => onDelete?.(task.id)}
        aria-label="Видалити"
        className="shrink-0 rounded px-1 text-lg leading-none text-zinc-300 hover:text-red-500 dark:text-zinc-600"
      >
        ×
      </button>
    </div>
  );
}

function DraggableTask({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef}>
      <TaskCard
        task={task}
        onToggle={onToggle}
        onDelete={onDelete}
        handleProps={{ ...attributes, ...listeners }}
        dragging={isDragging}
      />
    </div>
  );
}

function DayColumn({
  date,
  label,
  children,
  empty,
}: {
  date: string;
  label: string;
  children: React.ReactNode;
  empty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <section className="flex flex-col gap-2">
      <h2
        className={`text-xs font-semibold uppercase tracking-wide ${
          isOver ? "text-black dark:text-zinc-50" : "text-zinc-400"
        }`}
      >
        {label}
      </h2>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 rounded-lg transition-colors ${
          isOver ? "bg-zinc-200/60 p-1 ring-2 ring-black/30 dark:bg-zinc-800/60 dark:ring-white/30" : ""
        }`}
      >
        {empty ? (
          <p className="rounded-lg border border-dashed border-zinc-300 py-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
            Перетягни сюди
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // PointerSensor обробляє мишу і тач через pointer-події; drag стартує тільки
  // з ручки (touch-action:none на ній), тож звичайний скрол/тап не конфліктують.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const targetDate = String(over.id);
    setTasks((prev) =>
      prev.map((t) => (t.id === active.id ? { ...t, scheduledDate: targetDate } : t)),
    );
  }

  const today = localToday();

  // Завжди показуємо весь 7-денний тиждень (стабільний лейаут + усі дні як цілі
  // для drop) плюс будь-які минулі дні, де ще лишились задачі.
  const dateSet = new Set(tasks.map((t) => t.scheduledDate));
  for (let i = 0; i < HORIZON_DAYS; i++) dateSet.add(addDays(today, i));
  const dates = [...dateSet].sort();
  const tasksByDate = new Map<string, Task[]>();
  for (const t of tasks) {
    const arr = tasksByDate.get(t.scheduledDate) ?? [];
    arr.push(t);
    tasksByDate.set(t.scheduledDate, arr);
  }
  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

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
          <section className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
            <div className="text-4xl">🧠</div>
            <p className="font-medium text-black dark:text-zinc-50">Порожньо — і це добре</p>
            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
              Вивали в поле вище все, що крутиться в голові, і натисни «Розібрати».
              AI перетворить це на задачі й розкладе по днях.
            </p>
          </section>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            measuring={MEASURING}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex flex-col gap-6">
              {dates.map((date) => {
                const dayTasks = sortTasks(tasksByDate.get(date) ?? []);
                return (
                  <DayColumn
                    key={date}
                    date={date}
                    label={dayLabel(date, today)}
                    empty={dayTasks.length === 0}
                  >
                    {dayTasks.map((task) => (
                      <DraggableTask
                        key={task.id}
                        task={task}
                        onToggle={toggleCompleted}
                        onDelete={deleteTask}
                      />
                    ))}
                  </DayColumn>
                );
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="shadow-lg">
                  <TaskCard task={activeTask} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}
