import type { CriterionDefinition } from "./api";
import {
  t,
  message,
  getLocale,
  formattingLocale,
  groupLabel as translatedGroup,
} from "./i18n";
export const languageNames: Record<string, string> = {
  get RU() {
    return t("Russian (RU)");
  },
  get KZ() {
    return t("Kazakh (KZ)");
  },
  get EN() {
    return t("English (EN)");
  },
};
export const languageName = (value?: string) =>
  value ? languageNames[value] || value : t("Unknown");
export const analysisLanguage = (value?: string) => languageName(value || "EN");
export const channelName = (value?: string) =>
  value ? t(value) : t("Unknown");
export const label = (value?: string | null) => (value ? t(value) : t("none"));
export function groupLabel(value: string, custom = false): string {
  if (custom) return value;
  if (languageNames[value]) return languageName(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Intl.DateTimeFormat(formattingLocale(), {
      timeZone: "Asia/Almaty",
    }).format(new Date(`${value}T00:00:00+05:00`));
  return translatedGroup(value);
}
export const metadataText = (value: string) => message(value);
export const checklistName = (id: string, name: string) =>
  id === "cqa-v1" ? t("Conversation quality baseline") : name;
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
/** Localize a copy of the canonical rubric only. User definitions remain verbatim. */
export function criterionDisplay(
  criterion: CriterionDefinition,
  version: string,
): CriterionDefinition {
  if (version !== "cqa-v1" || !builtIn[criterion.id]) return criterion;
  const copy =
    getLocale() === "ru"
      ? builtIn[criterion.id]
      : {
          title: t(criterion.title),
          description: t(criterion.description),
          na_condition: criterion.na_condition
            ? t(criterion.na_condition)
            : null,
          scale_meanings: Object.fromEntries(
            Object.entries(criterion.scale_meanings || {}).map(
              ([key, value]) => [key, t(value)],
            ),
          ),
        };
  return { ...criterion, ...copy, scale_meanings: { ...copy.scale_meanings } };
}
