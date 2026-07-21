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

// Поля, які повертає модель. Решту (id, scheduledDate, completed, createdAt)
// проставляє сервер — не довіряємо моделі генерувати їх.
export type ParsedTask = {
  title: string;
  priority: Priority;
  estimatedMinutes: number | null;
  deadline: string | null;
};
