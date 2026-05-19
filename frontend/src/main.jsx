import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import dayjs from "dayjs";
import App from "./App";

// Required for Ant Design DatePicker / RangePicker
import "dayjs/locale/en";
dayjs.locale("en");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider
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
  </React.StrictMode>
);
