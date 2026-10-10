import { detectLocale, translate, type Locale, type MessageKey } from "./i18n";

export type ThemeName = "light" | "dark" | "system";

const THEME_KEY = "mapscribe.theme";
const LOCALE_KEY = "mapscribe.locale";

function storedLocale(): Locale {
  const value = localStorage.getItem(LOCALE_KEY);
  if (value === "zh" || value === "en") return value;
  return detectLocale();
}

function storedTheme(): ThemeName {
  const value = localStorage.getItem(THEME_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export const preferences = $state({
  locale: typeof localStorage === "undefined" ? ("zh" as Locale) : storedLocale(),
  theme: typeof localStorage === "undefined" ? ("system" as ThemeName) : storedTheme(),
});

export function t(key: MessageKey): string {
  return translate(preferences.locale, key);
}

export function setLocale(locale: Locale): void {
  preferences.locale = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

export function setTheme(theme: ThemeName): void {
  preferences.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
}

export function applyTheme(): void {
  const dark =
    preferences.theme === "dark" ||
    (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
