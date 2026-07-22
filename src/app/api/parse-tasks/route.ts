import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ParsedTask, Priority, Task } from "@/lib/types";
import { addDays, dayLabel, isValidISODate, localToday } from "@/lib/dates";

const HORIZON_DAYS = 7;

function buildSystemPrompt(today: string): string {
  // Перелік дат горизонту з людськими лейблами — щоб моделі було легко призначати дати.
  const horizon = Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const iso = addDays(today, i);
    return `${iso} (${dayLabel(iso, today)})`;
  }).join("\n");

  return `Ти — планувальник дня. Користувач надсилає хаотичний текст (brain dump).
Розбий його на окремі конкретні задачі й признач кожній день у межах наступних 7 днів.

Сьогодні: ${today}. Доступні дати для планування:
${horizon}

Правила призначення дати (scheduledDate):
1. Якщо в тексті є явна дата чи дедлайн ("завтра", "до п'ятниці", "у середу") — признач scheduledDate саме на цей день (у межах горизонту вище).
2. Якщо дати нема — розподіли за пріоритетом: high — на найближчі дні (сьогодні/завтра), medium — середина тижня, low — пізніше. НЕ звалюй усе на один день, розноси рівномірно.
3. Використовуй ЛИШЕ дати зі списку вище (горизонт 7 днів).

Поверни ЛИШЕ валідний JSON-масив об'єктів. Без markdown, без \`\`\`, без пояснень.
Кожен об'єкт має рівно такі поля:
- "title": string — коротке формулювання задачі ТІЄЮ Ж мовою, що й текст користувача (укр → укр, англ → англ)
- "priority": "high" | "medium" | "low"
- "estimatedMinutes": number | null — оцінка часу у хвилинах, або null
- "scheduledDate": string — дата у форматі YYYY-MM-DD зі списку вище
- "deadline": string | null — YYYY-MM-DD, ЛИШЕ якщо користувач явно згадав дедлайн; інакше null

Приклад: [{"title":"Подзвонити клієнту","priority":"high","estimatedMinutes":15,"scheduledDate":"${today}","deadline":null}]

Якщо задач нема — поверни [].`;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

const VALID_PRIORITIES: Priority[] = ["high", "medium", "low"];

// Клемпимо дату моделі в горизонт [today … today+6]. Некоректне/поза межами → найближча межа.
function clampToHorizon(date: unknown, today: string): string {
  const maxDate = addDays(today, HORIZON_DAYS - 1);
  if (typeof date !== "string" || !isValidISODate(date)) return today;
  if (date < today) return today;
  if (date > maxDate) return maxDate;
  return date;
}

export async function POST(req: Request) {
  let body: { text?: unknown; today?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON у запиті" }, { status: 400 });
  }

  const { text } = body;
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Поле 'text' обов'язкове" }, { status: 400 });
  }

  // Дата з клієнта (його локальне "сьогодні"); фолбек — серверна дата.
  const today =
    typeof body.today === "string" && isValidISODate(body.today)
      ? body.today
      : localToday();

  let raw: string;
  try {
    const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env (server-side only)
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: buildSystemPrompt(today),
      messages: [{ role: "user", content: text }],
    });
    raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (err) {
    console.error("Anthropic API error:", err);
    return NextResponse.json(
      { error: "Помилка виклику AI. Перевір ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    console.error("JSON.parse failed. Model output:", raw);
    return NextResponse.json({ error: "Модель повернула невалідний JSON" }, { status: 500 });
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json({ error: "Очікувався JSON-масив задач" }, { status: 500 });
  }

  const createdAt = new Date().toISOString();
  const tasks: Task[] = (parsed as ParsedTask[]).map((item) => ({
    id: crypto.randomUUID(),
    title: String(item.title ?? "").trim() || "Без назви",
    priority: VALID_PRIORITIES.includes(item.priority) ? item.priority : "medium",
    estimatedMinutes:
      typeof item.estimatedMinutes === "number" ? item.estimatedMinutes : null,
    scheduledDate: clampToHorizon(item.scheduledDate, today),
    deadline:
      typeof item.deadline === "string" && isValidISODate(item.deadline)
        ? item.deadline
        : null,
    completed: false,
    createdAt,
  }));

  return NextResponse.json({ tasks });
}
