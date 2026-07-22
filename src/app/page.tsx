"use client";

import { useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
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
import { addDays, dayLabel, diffDays, formatDuration, localToday, shortDate } from "@/lib/dates";

const STORAGE_KEY = "ai-day-planner:tasks";
const HORIZON_DAYS = 7;
const OVERLOAD_MINUTES = 8 * 60; // > 8 год на день → мʼяке попередження

const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

// Кидай туди, де курсор; якщо курсор у проміжку — беремо найближчий день.
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

const PRIORITY: Record<Priority, { label: string; stripe: string; text: string }> = {
  high: { label: "Високий", stripe: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  medium: { label: "Середній", stripe: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  low: {
    label: "Низький",
    stripe: "bg-stone-300 dark:bg-stone-600",
    text: "text-stone-500 dark:text-stone-400",
  },
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// Тап по мітці підіймає пріоритет: низький → середній → високий → (по колу) низький.
const NEXT_PRIORITY: Record<Priority, Priority> = { low: "medium", medium: "high", high: "low" };

function nextPriority(p: Priority): Priority {
  return NEXT_PRIORITY[p];
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((x, y) => {
    if (x.completed !== y.completed) return x.completed ? 1 : -1; // виконані — донизу
    const byPriority = PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority];
    if (byPriority !== 0) return byPriority;
    return (x.estimatedMinutes ?? Infinity) - (y.estimatedMinutes ?? Infinity);
  });
}

function pluralTasks(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "задача";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "задачі";
  return "задач";
}

function deadlineChip(deadline: string, today: string): { label: string; urgent: boolean } {
  const diff = diffDays(deadline, today);
  if (diff < 0) return { label: "протерміновано", urgent: true };
  if (diff === 0) return { label: "сьогодні", urgent: true };
  if (diff === 1) return { label: "до завтра", urgent: false };
  return { label: `до ${shortDate(deadline)}`, urgent: false };
}

// Анімований чекбокс (галочка «пружинить»).
function CheckButton({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Позначити як невиконане" : "Позначити виконаним"}
      onClick={onToggle}
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-all duration-150 active:scale-90 ${
        checked
          ? "border-black bg-black dark:border-white dark:bg-white"
          : "border-stone-300 hover:border-stone-400 dark:border-stone-600 dark:hover:border-stone-500"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3 w-3 text-white transition-transform duration-150 dark:text-black ${
          checked ? "scale-100" : "scale-0"
        }`}
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}

// Дедлайн: чіп із терміном (червоний, якщо сьогодні/протерміновано) або «+ термін».
// Тап відкриває нативний date-picker; порожнє значення прибирає дедлайн.
function DeadlineControl({
  task,
  today,
  onSetDeadline,
}: {
  task: Task;
  today: string;
  onSetDeadline?: (id: string, deadline: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dl = task.deadline ? deadlineChip(task.deadline, today) : null;
  const cls = dl
    ? dl.urgent
      ? "font-medium text-red-500 dark:text-red-400"
      : "text-stone-500 dark:text-stone-400"
    : "text-stone-300 dark:text-stone-600";

  if (!onSetDeadline) {
    return dl ? <span className={cls}>{dl.label}</span> : null;
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => inputRef.current?.showPicker?.()}
        aria-label={dl ? `Дедлайн: ${dl.label}. Натисни, щоб змінити.` : "Додати дедлайн"}
        className={`rounded transition-colors hover:text-stone-600 dark:hover:text-stone-300 ${cls}`}
      >
        {dl ? dl.label : "+ термін"}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={task.deadline ?? ""}
        min={today}
        onChange={(e) => onSetDeadline(task.id, e.target.value || null)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
      />
    </span>
  );
}

function TaskCard({
  task,
  today,
  onToggle,
  onDelete,
  onCyclePriority,
  onSetDeadline,
  handleProps,
  dragging,
}: {
  task: Task;
  today: string;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCyclePriority?: (id: string) => void;
  onSetDeadline?: (id: string, deadline: string | null) => void;
  handleProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const p = PRIORITY[task.priority];
  const dl = task.deadline ? deadlineChip(task.deadline, today) : null;
  const showDeadline = dl != null || onSetDeadline != null;
  const showMeta = !task.completed && (task.estimatedMinutes != null || showDeadline);

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div
        className={`w-1 shrink-0 transition-colors duration-300 ${p.stripe}`}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2.5">
        <button
          {...handleProps}
          aria-label="Перетягнути"
          className="shrink-0 cursor-grab touch-none px-0.5 text-base leading-none text-stone-400 hover:text-stone-600 active:cursor-grabbing dark:text-stone-500 dark:hover:text-stone-300"
        >
          ⠿
        </button>
        <CheckButton checked={task.completed} onToggle={() => onToggle?.(task.id)} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm leading-snug ${
              task.completed
                ? "text-stone-400 line-through dark:text-stone-600"
                : "text-black dark:text-stone-50"
            }`}
          >
            {task.title}
          </p>
          {showMeta && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-stone-400 dark:text-stone-500">
              {task.estimatedMinutes != null && <span>{formatDuration(task.estimatedMinutes)}</span>}
              {task.estimatedMinutes != null && showDeadline && <span aria-hidden>·</span>}
              <DeadlineControl task={task} today={today} onSetDeadline={onSetDeadline} />
            </div>
          )}
        </div>
        {onCyclePriority && (
          <button
            type="button"
            onClick={() => onCyclePriority(task.id)}
            aria-label={`Пріоритет: ${p.label}. Натисни, щоб змінити.`}
            className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium transition active:scale-90 hover:bg-stone-100 dark:hover:bg-stone-800 ${p.text}`}
          >
            {p.label}
          </button>
        )}
        <button
          onClick={() => onDelete?.(task.id)}
          aria-label="Видалити"
          className="pointer-only shrink-0 rounded px-1 text-lg leading-none text-stone-300 transition-colors hover:text-red-500 dark:text-stone-600"
        >
          ×
        </button>
      </div>
    </div>
  );
}

const SWIPE_TRIGGER = 64; // px — поріг спрацювання свайпу

function DraggableTask({
  task,
  today,
  onToggle,
  onDelete,
  onCyclePriority,
  onSetDeadline,
}: {
  task: Task;
  today: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onCyclePriority: (id: string) => void;
  onSetDeadline: (id: string, deadline: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const [dx, setDx] = useState(0);

  // Свайп (тільки тач): вправо — виконано, вліво — видалити.
  const swipe = useSwipeable({
    onSwiping: (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setDx(Math.max(-140, Math.min(140, e.deltaX)));
      }
    },
    onSwipedRight: (e) => {
      if (Math.abs(e.deltaX) > SWIPE_TRIGGER) onToggle(task.id);
      setDx(0);
    },
    onSwipedLeft: (e) => {
      if (Math.abs(e.deltaX) > SWIPE_TRIGGER) onDelete(task.id);
      setDx(0);
    },
    onSwiped: () => setDx(0),
    trackMouse: false,
    preventScrollOnSwipe: true,
    delta: 12,
  });

  const past = Math.abs(dx) > SWIPE_TRIGGER;

  return (
    <div ref={setNodeRef} className="relative overflow-hidden rounded-lg">
      {/* Підказки дій, що визирають з-під рядка під час свайпу */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-sm font-medium">
        <span
          className={`transition-opacity ${dx > 0 ? "opacity-100" : "opacity-0"} ${
            past ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-500/60"
          }`}
        >
          ✓ {task.completed ? "Відкрити" : "Виконано"}
        </span>
        <span
          className={`transition-opacity ${dx < 0 ? "opacity-100" : "opacity-0"} ${
            past ? "text-red-600 dark:text-red-400" : "text-red-500/60"
          }`}
        >
          Видалити ✕
        </span>
      </div>
      <div
        {...swipe}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? "transform 0.2s ease" : undefined,
        }}
      >
        <TaskCard
          task={task}
          today={today}
          onToggle={onToggle}
          onDelete={onDelete}
          onCyclePriority={onCyclePriority}
          onSetDeadline={onSetDeadline}
          handleProps={{ ...attributes, ...listeners }}
          dragging={isDragging}
        />
      </div>
    </div>
  );
}

function DayColumn({
  date,
  label,
  load,
  isEmpty,
  children,
}: {
  date: string;
  label: string;
  load: { count: number; minutes: number } | null;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const overloaded = load != null && load.minutes > OVERLOAD_MINUTES;
  const ratio = load ? load.minutes / OVERLOAD_MINUTES : 0;
  const barPct = Math.min(1, ratio) * 100;
  const barColor = ratio > 1 ? "bg-red-500" : ratio > 0.75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <h2
            className={`text-xs font-semibold uppercase tracking-wide ${
              isEmpty ? "text-stone-300 dark:text-stone-700" : "text-stone-500 dark:text-stone-400"
            } ${isOver ? "text-black dark:text-stone-50" : ""}`}
          >
            {label}
          </h2>
          {load && (
            <span className="text-xs text-stone-400 dark:text-stone-500">
              {load.count} {pluralTasks(load.count)}
              {load.minutes > 0 && <> · ~{formatDuration(load.minutes)}</>}
              {overloaded && (
                <span className="ml-1 font-medium text-red-600 dark:text-red-400">
                  · перевантажений
                </span>
              )}
            </span>
          )}
        </div>
        {load && load.minutes > 0 && (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
            role="progressbar"
            aria-valuenow={Math.round(ratio * 100)}
            aria-label={`Завантаження дня: ${Math.round(ratio * 100)}% від робочого дня (~8 год)`}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 rounded-lg transition-colors ${
          isOver ? "bg-stone-200/60 p-1 ring-2 ring-black/30 dark:bg-stone-800/60 dark:ring-white/30" : ""
        }`}
      >
        {isEmpty ? (
          <div className="rounded-md border border-dashed border-stone-200 py-1.5 text-center text-[11px] text-stone-300 dark:border-stone-800 dark:text-stone-700">
            {isOver ? "Відпусти тут" : "—"}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// Мінімальні типи для Web Speech API (немає у стандартному DOM-lib).
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechRecognitionEventLike {
  results: SpeechResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

// Лого «Spill»: амбер-крапки розсипу осідають у рівні рядки списку.
function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#292524" />
      <circle cx="9" cy="9" r="2" fill="#f59e0b" />
      <circle cx="16" cy="6.5" r="2" fill="#f59e0b" />
      <circle cx="23" cy="9.5" r="2" fill="#f59e0b" />
      <rect x="8" y="17" width="16" height="2.6" rx="1.3" fill="#fafaf9" />
      <rect x="8" y="22.5" width="11" height="2.6" rx="1.3" fill="#fafaf9" />
    </svg>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");
  const hydrated = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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

  // Голосовий ввід (Web Speech API) — апгрейд поверх тексту, лише де підтримується.
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setVoiceSupported(true);
    const rec = new Ctor();
    rec.lang = "uk-UA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = voiceBaseRef.current;
      const sep = base && !base.endsWith(" ") ? " " : "";
      setText(base + sep + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.stop();
      } catch {
        // не запущено — ігноруємо
      }
    };
  }, []);

  function toggleVoice() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    voiceBaseRef.current = text;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

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

  function cyclePriority(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority: nextPriority(t.priority) } : t)),
    );
  }

  function setDeadline(id: string, deadline: string | null) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, deadline } : t)));
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
    <div className="min-h-full flex-1 bg-stone-50 dark:bg-stone-950">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-16">
        <header>
          <div className="flex items-center gap-2.5">
            <Logo />
            <h1 className="font-display text-3xl font-semibold tracking-tight text-black dark:text-stone-50">
              Spill
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            Вивали все з голови — AI розкладе це на задачі по днях.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Що в голові? Напр.: купити молоко, подзвонити клієнту до п'ятниці, зробити презентацію…"
            rows={3}
            className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleParse}
              disabled={loading || !text.trim()}
              className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-stone-200"
            >
              {loading ? "Планую…" : "Спланувати"}
            </button>
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={listening ? "Зупинити диктування" : "Диктувати голосом"}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  listening
                    ? "bg-red-500 text-white"
                    : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
              >
                {listening ? (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                ) : (
                  <MicIcon />
                )}
                {listening ? "Слухаю…" : "Голос"}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </section>

        {tasks.length === 0 ? (
          <section className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 py-12 text-center dark:border-stone-700">
            <div className="text-4xl">🧠</div>
            <p className="font-medium text-black dark:text-stone-50">Порожньо — і це добре</p>
            <p className="max-w-xs text-sm text-stone-500 dark:text-stone-400">
              Напиши все, що крутиться в голові — купою, без порядку. AI розбере
              це на задачі й розкладе по днях.
            </p>
          </section>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            measuring={MEASURING}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex flex-col gap-5">
              {dates.map((date) => {
                const dayTasks = sortTasks(tasksByDate.get(date) ?? []);
                const active = dayTasks.filter((t) => !t.completed);
                const load =
                  dayTasks.length > 0
                    ? {
                        count: active.length,
                        minutes: active.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
                      }
                    : null;
                return (
                  <DayColumn
                    key={date}
                    date={date}
                    label={dayLabel(date, today)}
                    load={load}
                    isEmpty={dayTasks.length === 0}
                  >
                    {dayTasks.map((task) => (
                      <DraggableTask
                        key={task.id}
                        task={task}
                        today={today}
                        onToggle={toggleCompleted}
                        onDelete={deleteTask}
                        onCyclePriority={cyclePriority}
                        onSetDeadline={setDeadline}
                      />
                    ))}
                  </DayColumn>
                );
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="shadow-lg">
                  <TaskCard task={activeTask} today={today} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}
