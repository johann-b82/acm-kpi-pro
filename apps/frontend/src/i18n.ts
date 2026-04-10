import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

// Typed resources — augments i18next CustomTypeOptions below
const resources = {
  de: { translation: de },
  en: { translation: en },
} as const;

// Detect initial locale: read acm_lang cookie (non-HTTPOnly, set by server on login)
// Falls back to 'de' (D-02: German is default for ACM)
function detectLocale(): string {
  try {
    const match = document.cookie.match(/(?:^|;\s*)acm_lang=([^;]+)/);
    const lang = match?.[1];
    if (lang === "en" || lang === "de") return lang;
  } catch {
    // ignore
  }
  return "de";
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectLocale(),
    fallbackLng: "de",
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  });

export default i18n;

// ---- TypeScript augmentation for typed t() keys ----
declare module "i18next" {
  interface CustomTypeOptions {
    resources: typeof resources["de"];
    returnNull: false;
  }
}
