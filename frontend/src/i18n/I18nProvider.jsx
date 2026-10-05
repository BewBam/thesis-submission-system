import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button, Space } from "antd";
import en from "./en";
import vi from "./vi";

const STORAGE_KEY = "thesis_portal_lang";
const I18nContext = createContext(null);

function interpolate(template, vars) {
  if (!vars) {
    return template;
  }
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) =>
    vars[key] == null ? "" : String(vars[key])
  );
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "vi";
    } catch {
      return "vi";
    }
  });

  const dict = lang === "en" ? en : vi;

  const t = useCallback(
    (key, vars) => {
      const template = dict[key] ?? en[key] ?? key;
      return interpolate(template, vars);
    },
    [dict]
  );

  const setLang = useCallback((next) => {
    const value = next === "en" ? "en" : "vi";
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures; the in-memory language still switches.
    }
    setLangState(value);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "vi" ? "vi" : "en";
    document.title = dict["Thesis Deposit Portal"] || "Thesis Deposit Portal";
  }, [dict, lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

export function LanguageSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <Space size={4}>
      <Button size="small" type={lang === "vi" ? "primary" : "default"} onClick={() => setLang("vi")}>
        VI
      </Button>
      <Button size="small" type={lang === "en" ? "primary" : "default"} onClick={() => setLang("en")}>
        EN
      </Button>
    </Space>
  );
}
