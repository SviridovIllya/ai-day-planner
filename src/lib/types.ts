export type Priority = "high" | "medium" | "low";

export type Task = {
  id: string;
  title: string;
  priority: Priority;
  estimatedMinutes: number | null;
  scheduledDate: string; // ISO date (YYYY-MM-DD) — призначає AI; у Фазі 2a хардкод = сьогодні
  deadline: string | null; // ISO date, опційно — якщо юзер згадав дедлайн у тексті
  completed: boolean;
  createdAt: string; // ISO datetime
};

// Поля, які повертає модель. Решту (id, completed, createdAt) проставляє сервер.
// scheduledDate модель теж повертає (Фаза 2b), але сервер валідує/клемпить його в горизонт.
export type ParsedTask = {
  title: string;
  priority: Priority;
  estimatedMinutes: number | null;
  scheduledDate: string;
  deadline: string | null;
};
