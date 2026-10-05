import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import App from "./App";
import { I18nProvider, useI18n } from "./i18n/I18nProvider";

import "dayjs/locale/en";
import "dayjs/locale/vi";

function LocalizedApp() {
  const { lang } = useI18n();

  useEffect(() => {
    dayjs.locale(lang === "vi" ? "vi" : "en");
  }, [lang]);

  return (
    <ConfigProvider
      locale={lang === "vi" ? viVN : enUS}
      theme={{
        token: {
          colorPrimary: "#1488D8",
          colorInfo: "#1488D8",
          colorLink: "#1488D8",
          borderRadius: 10
        }
      }}
    >
      <App />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <LocalizedApp />
    </I18nProvider>
  </React.StrictMode>
);
