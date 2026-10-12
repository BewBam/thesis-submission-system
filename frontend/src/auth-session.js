import { message } from "antd";

const STORAGE_KEY = "thesis_portal_auth";

let onExpired = () => {};
let installed = false;
let suppressErrors = false;

const originalError = message.error.bind(message);
message.error = (...args) => {
  if (suppressErrors) {
    return;
  }
  return originalError(...args);
};

export function setSessionExpiredHandler(handler) {
  onExpired = typeof handler === "function" ? handler : () => {};
}

export function suppressApiErrors(suppress) {
  suppressErrors = Boolean(suppress);
}

export function beginLoginAttempt() {
  suppressErrors = false;
}

function storedToken() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return typeof parsed?.token === "string" ? parsed.token : "";
  } catch {
    return "";
  }
}

function authorizationToken(input, init) {
  const headers = new Headers(init?.headers || undefined);
  let value = headers.get("Authorization");
  if (!value && typeof Request !== "undefined" && input instanceof Request) {
    value = input.headers.get("Authorization");
  }
  if (!value) {
    return "";
  }
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : "";
}

export function readTokenExpiry(token) {
  try {
    const segment = String(token || "").split(".")[1];
    if (!segment) {
      return null;
    }
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function installAuthFetch() {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    const sent = authorizationToken(input, init);
    const saved = storedToken();
    if (response.status === 401 && sent && saved && sent === saved) {
      onExpired();
    }
    return response;
  };
}
