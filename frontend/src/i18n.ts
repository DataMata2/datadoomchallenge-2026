import { useSyncExternalStore } from "react";
import { messages } from "./i18n-catalog";

export const locales = ["ru", "en", "kk"] as const;
export type Locale = (typeof locales)[number];
export const localeKey = "cqa-ui-locale";
const listeners = new Set<() => void>();
let selected: Locale | undefined;
const valid = (value: unknown): value is Locale =>
  locales.includes(value as Locale);
export function getLocale(): Locale {
  if (selected) return selected;
  try {
    const saved = localStorage.getItem(localeKey);
    if (valid(saved)) return saved;
  } catch {
    /* Storage may be unavailable. */
  }
  return "ru";
}
export function setLocale(locale: Locale) {
  if (!valid(locale)) throw new RangeError("Unsupported interface locale");
  selected = locale;
  try {
    localStorage.setItem(localeKey, locale);
  } catch {
    /* The in-memory preference still works. */
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key === localeKey) {
      selected = valid(event.newValue) ? event.newValue : undefined;
      listener();
    }
  };
  if (typeof window !== "undefined")
    window.addEventListener("storage", storage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined")
      window.removeEventListener("storage", storage);
  };
}
export const useLocale = () =>
  useSyncExternalStore(subscribe, getLocale, () => "ru" as Locale);
export const formattingLocale = () =>
  ({ ru: "ru-RU", en: "en-GB", kk: "kk-KZ" })[getLocale()];
type Params = Record<string, string | number | boolean | null | undefined>;
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = Object.keys(messages)
  .filter((key) => /\{\w+\}/.test(key))
  .map((key) => {
    const names = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    const pattern = key
      .split(/\{\w+\}/)
      .map(escape)
      .join("([\\s\\S]*?)");
    return { key, names, regex: new RegExp(`^${pattern}$`) };
  })
  .sort(
    (a, b) =>
      b.key.replace(/\{\w+\}/g, "").length -
      a.key.replace(/\{\w+\}/g, "").length,
  );
/** Translate product copy only, at explicit render sites. Unknown/user-authored
 * content is returned verbatim; no DOM rewriting or API payload mutation. */
export function t(source: string, params?: Params): string {
  const locale = getLocale();
  const key = normalize(source);
  let copy =
    locale === "en" ? source : messages[key]?.[locale === "ru" ? 0 : 1];
  const values = params;
  if (copy === undefined) return source;
  if (locale !== "en")
    copy =
      (source.match(/^\s*/)?.[0] || "") +
      copy +
      (source.match(/\s*$/)?.[0] || "");
  return values
    ? copy.replace(/\{(\w+)\}/g, (token, name: string) =>
        values?.[name] == null ? token : String(values[name]),
      )
    : copy;
}
/** Canonical software errors/metadata may contain interpolated IDs. This helper
 * is deliberately separate from product labels and never used for source text. */
export function message(source: string): string {
  if (getLocale() === "en" || messages[normalize(source)]) return t(source);
  for (const template of templates) {
    const match = template.regex.exec(source.trim());
    if (match)
      return t(
        template.key,
        Object.fromEntries(
          template.names.map((name, index) => [name, match[index + 1]]),
        ),
      );
  }
  return source;
}
export const groupLabel = (value: string) =>
  /^\d{4}-\d{2} days (1–15|16–end)$/.test(value) ? message(value) : t(value);

const nouns = {
  conversations: {
    en: ["conversation", "conversations", "conversations"],
    ru: ["диалог", "диалога", "диалогов"],
    kk: ["диалог", "диалог", "диалог"],
  },
  turns: {
    en: ["turn", "turns", "turns"],
    ru: ["реплика", "реплики", "реплик"],
    kk: ["реплика", "реплика", "реплика"],
  },
} as const;
export function count(kind: keyof typeof nouns, value: number) {
  const locale = getLocale();
  const category = new Intl.PluralRules(formattingLocale()).select(value);
  const index = category === "one" ? 0 : category === "few" ? 1 : 2;
  return `${value} ${nouns[kind][locale][index]}`;
}
