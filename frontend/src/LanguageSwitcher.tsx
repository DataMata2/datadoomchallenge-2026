import { setLocale, t, useLocale, type Locale } from "./i18n";
export default function LanguageSwitcher() {
  const locale = useLocale();
  return (
    <label className="locale-switcher">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
      </svg>
      <span className="sr-only">{t("Interface language")}</span>
      <select
        aria-label={t("Interface language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="ru" lang="ru">
          Русский
        </option>
        <option value="en" lang="en">
          English
        </option>
        <option value="kk" lang="kk">
          Қазақша
        </option>
      </select>
    </label>
  );
}
