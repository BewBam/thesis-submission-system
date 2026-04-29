import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import App from "./App";

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
