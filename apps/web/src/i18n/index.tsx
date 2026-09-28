import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Messages } from "./en.ts";
import { zhTW } from "./zh-TW.ts";

export type { Messages };
export { LocalizedError, describeError } from "./errors.ts";

export const LOCALES = ["en", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];

const MESSAGES: Record<Locale, Messages> = { en, "zh-TW": zhTW };
const LOCALE_KEY = "ref-a-claim:locale";

interface I18n {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(loadLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, messages: MESSAGES[locale], setLocale }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (!i18n) throw new Error("useI18n is used outside I18nProvider.");
  return i18n;
}

export function useMessages(): Messages {
  return useI18n().messages;
}

/** English unless another language was chosen before. Storage can be unavailable (e.g. blocked site data). */
function loadLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    return LOCALES.find((locale) => locale === stored) ?? "en";
  } catch {
    return "en";
  }
}

function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // The choice then lasts only as long as the page.
  }
}
