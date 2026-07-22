export type Lang = "uk" | "en";

export const STR = {
  uk: {
    switchTo: "EN",
    tagline: "Вивали все з голови — AI розкладе це на задачі по днях.",
    placeholder:
      "Що в голові? Напр.: купити молоко, подзвонити клієнту до п'ятниці, зробити презентацію…",
    plan: "Спланувати",
    planning: "Планую…",
    voice: "Голос",
    listening: "Слухаю…",
    dictate: "Диктувати голосом",
    stopDictate: "Зупинити диктування",
    requestError: "Помилка запиту",
    unknownError: "Невідома помилка",
    emptyTitle: "Порожньо — і це добре",
    emptyBody:
      "Напиши все, що крутиться в голові — купою, без порядку. AI розбере це на задачі й розкладе по днях.",
    overloaded: "перевантажений",
    dropHere: "Відпусти тут",
    prio: { high: "Високий", medium: "Середній", low: "Низький" },
    dragAria: "Перетягнути",
    markDone: "Позначити виконаним",
    markUndone: "Позначити як невиконане",
    deleteAria: "Видалити",
    addDue: "+ термін",
    swipeDone: "Виконано",
    swipeReopen: "Відкрити",
    swipeDelete: "Видалити",
    minShort: "хв",
    hourShort: "год",
    today: "Сьогодні",
    tomorrow: "Завтра",
    weekdays: ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"],
    dueOverdue: "протерміновано",
    dueToday: "сьогодні",
    dueTomorrow: "до завтра",
    duePrefix: "до",
  },
  en: {
    switchTo: "UA",
    tagline: "Dump everything on your mind — AI turns it into a day-by-day plan.",
    placeholder:
      "What's on your mind? E.g.: buy milk, call the client by Friday, make a presentation…",
    plan: "Plan it",
    planning: "Planning…",
    voice: "Voice",
    listening: "Listening…",
    dictate: "Dictate",
    stopDictate: "Stop dictation",
    requestError: "Request failed",
    unknownError: "Unknown error",
    emptyTitle: "Empty — and that's good",
    emptyBody:
      "Write everything on your mind — all at once, no order. AI will sort it into tasks and lay them out by day.",
    overloaded: "overloaded",
    dropHere: "Drop here",
    prio: { high: "High", medium: "Medium", low: "Low" },
    dragAria: "Drag",
    markDone: "Mark done",
    markUndone: "Mark undone",
    deleteAria: "Delete",
    addDue: "+ due",
    swipeDone: "Done",
    swipeReopen: "Reopen",
    swipeDelete: "Delete",
    minShort: "min",
    hourShort: "h",
    today: "Today",
    tomorrow: "Tomorrow",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    dueOverdue: "overdue",
    dueToday: "today",
    dueTomorrow: "by tomorrow",
    duePrefix: "by",
  },
} as const;

export function pluralTasks(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "task" : "tasks";
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "задача";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "задачі";
  return "задач";
}
