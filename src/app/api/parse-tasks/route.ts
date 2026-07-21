import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ParsedTask, Priority, Task } from "@/lib/types";

const SYSTEM_PROMPT = `Ти — парсер задач для планера дня. Користувач надсилає хаотичний текст (brain dump).
Твоє завдання — розбити його на окремі конкретні задачі.

Поверни ЛИШЕ валідний JSON-масив об'єктів. Без markdown-обгортки, без \`\`\`, без преамбули, без пояснень.
Кожен об'єкт має рівно такі поля:
- "title": string — коротке формулювання задачі українською
- "priority": "high" | "medium" | "low" — оціни важливість/терміновість
- "estimatedMinutes": number | null — оцінка часу у хвилинах, або null якщо незрозуміло
- "deadline": string | null — ISO-дата (YYYY-MM-DD), ЛИШЕ якщо користувач явно згадав дедлайн; інакше null

Приклад відповіді:
[{"title":"Купити молоко","priority":"low","estimatedMinutes":15,"deadline":null}]

Якщо задач нема — поверни [].`;

// Захисне зрізання markdown-фенсів на випадок, якщо модель усе ж обгорне відповідь.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

const VALID_PRIORITIES: Priority[] = ["high", "medium", "low"];

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: Request) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "Невалідний JSON у запиті" }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Поле 'text' обов'язкове" }, { status: 400 });
  }

  let raw: string;
  try {
    // Ініціалізація тут (а не на рівні модуля), щоб відсутність ключа не ламала збірку.
    const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env (server-side only)
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
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

  // T1: try/catch навколо JSON.parse відповіді моделі
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    console.error("JSON.parse failed. Model output:", raw);
    return NextResponse.json(
      { error: "Модель повернула невалідний JSON" },
      { status: 500 },
    );
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json(
      { error: "Очікувався JSON-масив задач" },
      { status: 500 },
    );
  }

  const scheduledDate = todayISODate(); // Фаза 2a: усі задачі на сьогодні
  const createdAt = new Date().toISOString();

  const tasks: Task[] = (parsed as ParsedTask[]).map((item) => ({
    id: crypto.randomUUID(),
    title: String(item.title ?? "").trim() || "Без назви",
    priority: VALID_PRIORITIES.includes(item.priority) ? item.priority : "medium",
    estimatedMinutes:
      typeof item.estimatedMinutes === "number" ? item.estimatedMinutes : null,
    scheduledDate,
    deadline: typeof item.deadline === "string" ? item.deadline : null,
    completed: false,
    createdAt,
  }));

  return NextResponse.json({ tasks });
}
