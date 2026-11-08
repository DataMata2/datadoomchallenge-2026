import type { CriterionDefinition } from "./api";

export const languageNames: Record<string, string> = {
  RU: "Русский (RU)",
  KZ: "Казахский (KZ)",
  EN: "Английский (EN)",
};
export const languageName = (value?: string) =>
  value ? languageNames[value] || value : "Неизвестно";
export const analysisLanguage = (value?: string) => languageName(value || "EN");
export const channelName = (value?: string) =>
  value === "agent chat"
    ? "Чат"
    : value === "voice call"
      ? "Звонок"
      : value || "Неизвестно";
export const groupNames: Record<string, string> = {
  none: "Без группировки",
  channel: "Канал",
  language: "Язык диалога",
  month_half: "Половина месяца",
  day_night: "День / ночь",
  daypart: "Время суток",
  holiday: "Праздник / обычный день",
  date: "Дата",
};
const labels: Record<string, string> = {
  queued: "В очереди",
  running: "Выполняется",
  completed: "Завершено",
  failed: "Ошибка",
  interrupted: "Прервано",
  cancelled: "Отменено",
  pending: "Ожидает",
  not_run: "Не запускалось",
  ok: "Оценено",
  error: "Ошибка",
  unevaluated: "Без оценки",
  ready: "Готово",
  draft: "Черновик",
  open: "Открыта",
  confirmed: "Подтверждено",
  changed: "Изменено",
  resolved: "Рассмотрена",
  client: "Клиент",
  operator: "Оператор",
  bot: "Бот",
  system: "Система",
  assigned_demo: "Демонстрационные даты",
  source_only: "Исходные даты",
  external_api: "Внешний API",
  local: "Локальный",
  hybrid: "Гибридный",
  mixed: "Смешанный",
  empty: "Пусто",
  live: "Онлайн",
  fake: "Тестовый",
  "All selected": "Вся выборка",
  "No assigned demo date": "Демонстрационная дата не назначена",
  "Day 06:00–18:00": "День 06:00–18:00",
  "Night 18:00–06:00": "Ночь 18:00–06:00",
  Night: "Ночь",
  Morning: "Утро",
  Afternoon: "День",
  Evening: "Вечер",
  "Kazakhstan public or observed holiday": "Праздник Казахстана с переносами",
  "Non-holiday": "Обычный день",
  "stratified-october-v1": "Распределение по периодам октября v1",
};
/** Only known product metadata is translated. Unknown values remain inspectable. */
export const label = (value?: string | null) =>
  value ? labels[value] || value : "Нет";
export function groupLabel(value: string, custom = false): string {
  if (custom) return value;
  if (languageNames[value]) return languageName(value);
  if (value === "agent chat" || value === "voice call")
    return channelName(value);
  const half = /^(\d{4}-\d{2}) days (1–15|16–end)$/.exec(value);
  if (half)
    return `${half[1]}: ${half[2] === "1–15" ? "1–15 число" : "16 число — конец месяца"}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty" }).format(
      new Date(`${value}T00:00:00+05:00`),
    );
  return label(value);
}
const metadata: Record<string, string> = {
  "Calendar predicates use demo_started_at converted to Asia/Almaty; records without assigned demo dates are excluded only when a calendar predicate is supplied.":
    "Календарные фильтры используют demo_started_at в часовом поясе Asia/Almaty. Записи без демонстрационных дат исключаются только при заданном календарном фильтре.",
  "Kazakhstan public holidays including observed days; ordinary weekends are controlled by ISO weekday filters.":
    "Праздники Казахстана учитывают переносы. Обычные выходные задаются фильтром дней недели ISO.",
  "All supplied predicates are AND; date/time end bounds are exclusive, score bounds inclusive. Hours with equal endpoints cover the full day.":
    "Все условия объединяются оператором И. Конечная граница даты и времени не включается; границы оценки включаются. Одинаковые начальный и конечный часы означают полные сутки.",
  "Latest cqa-v1 evaluation including errors; means exclude failed, unevaluated and N/A values.":
    "Используется последняя оценка cqa-v1, включая ошибки. Средние не включают ошибки, неоценённые диалоги и Н/П.",
  "Each cohort intersects the global selection; groups may overlap. Root IDs are unique and remain the custom-metric target population.":
    "Каждая когорта пересекается с общей выборкой; группы могут перекрываться. Исходные идентификаторы уникальны и остаются целевой выборкой пользовательской метрики.",
  "Calendar filters describe assigned demonstration dates; source timestamps are unchanged.":
    "Календарные фильтры описывают назначенные демонстрационные даты; исходные временные метки сохранены.",
  "No demonstration calendar is assigned; original timestamps are retained.":
    "Демонстрационный календарь не назначен; исходные временные метки сохранены.",
};
export function metadataText(value: string): string {
  if (value.startsWith("Global filters: "))
    return `Общие фильтры: ${value.slice(16)}`;
  return metadata[value] || value;
}
export const checklistName = (id: string, name: string) =>
  id === "cqa-v1" ? "Базовый чек-лист качества диалогов" : name;
const builtIn: Record<
  string,
  Pick<
    CriterionDefinition,
    "title" | "description" | "scale_meanings" | "na_condition"
  >
> = {
  contact: {
    title: "Приветствие и представление",
    description:
      "Оператор приветствует клиента на его языке и представляется в первом ответе.",
    scale_meanings: {
      false:
        "Одно или оба обязательных действия отсутствуют либо выполнены неверно.",
      true: "Приветствие и представление присутствуют в первом ответе.",
    },
    na_condition: null,
  },
  discovery: {
    title: "Выявление и уточнение запроса",
    description:
      "Оператор использует известные сведения и уточняет недостающую информацию до ответа.",
    scale_meanings: {
      false: "Необходимое уточнение пропущено или выполнено неверно.",
      true: "Известные сведения учтены, недостающая информация уточнена до ответа.",
    },
    na_condition:
      "Информация, необходимая для ответа, была доступна с самого начала.",
  },
  identification: {
    title: "Проверка личности",
    description:
      "Проверка личности подтверждена до раскрытия защищённой информации или защищённого действия. Если обязательная проверка не подтверждена расшифровкой, ответ — «Нет».",
    scale_meanings: {
      false:
        "Обязательная проверка отсутствует, не подтверждена или проведена после раскрытия информации либо действия.",
      true: "Проверка подтверждена до раскрытия защищённой информации или действия.",
    },
    na_condition:
      "Запрос не требует проверки личности, например общий вопрос о тарифах.",
  },
  consultation: {
    title: "Правильность и полнота консультации",
    description:
      "Оцените, насколько правильно и полно решён запрос или указан следующий шаг.",
    scale_meanings: {
      "0": "Содержательного ответа нет либо ключевая рекомендация неверна.",
      "5": "Даны общие рекомендации, но клиенту всё ещё непонятно, что делать.",
      "10": "Часть запроса решена; существенный вопрос остаётся открытым.",
      "15": "Основной вопрос решён; пропущена второстепенная деталь.",
      "20": "Все существенные вопросы решены либо указан правильный следующий шаг.",
    },
    na_condition: "Диалог завершился до того, как клиент сформулировал запрос.",
  },
  empathy: {
    title: "Вежливость и реакция на неудобство",
    description:
      "Оператор вежлив и при выраженном недовольстве или неудобстве клиента реагирует на конкретную проблему.",
    scale_meanings: {
      false:
        "Оператор невежлив или не реагирует на конкретное неудобство клиента.",
      true: "Оператор вежлив и реагирует на конкретную проблему клиента, если она высказана.",
    },
    na_condition: null,
  },
  dialogue: {
    title: "Ясность, последовательность и ожидание",
    description:
      "Оцените ясность, последовательность, связность ответов и предупреждение о явном ожидании независимо от полноты решения.",
    scale_meanings: {
      "0": "Несвязные или противоречивые ответы не позволяют понять диалог.",
      "4": "Формулировки или порядок ответов вынуждают клиента переспрашивать.",
      "7": "Есть один заметный сбой, но клиент может понять ответ и продолжить.",
      "10": "Ответы ясные и связные; оператор предупреждает клиента о явном ожидании.",
    },
    na_condition: null,
  },
  closure: {
    title: "Итог, дополнительная помощь и прощание",
    description:
      "Оператор подводит итог или предлагает дополнительную помощь и прощается.",
    scale_meanings: {
      false:
        "Обязательные завершающие действия пропущены, хотя была возможность завершить диалог.",
      true: "Итог или предложение дополнительной помощи сопровождаются прощанием.",
    },
    na_condition: "Диалог прерван до появления возможности его завершить.",
  },
  critical: {
    title: "Серьёзное нарушение",
    description:
      "Отметьте оскорбление, предложение платных услуг вне компании или разглашение конфиденциальной информации. Предложения перевести деньги лично оператору для инвестиций либо получить частную платную консультацию по личному номеру клиента достаточно; согласие или оплата клиента не требуются.",
    scale_meanings: {
      false: "Ни одно из трёх серьёзных нарушений не обнаружено.",
      true: "Обнаружено хотя бы одно из трёх серьёзных нарушений.",
    },
    na_condition: null,
  },
};
/** Localize a copy of the canonical rubric; never mutate stored definitions. */
export function criterionDisplay(
  criterion: CriterionDefinition,
  version: string,
): CriterionDefinition {
  return version === "cqa-v1" && builtIn[criterion.id]
    ? {
        ...criterion,
        ...builtIn[criterion.id],
        scale_meanings: { ...builtIn[criterion.id].scale_meanings },
      }
    : criterion;
}
