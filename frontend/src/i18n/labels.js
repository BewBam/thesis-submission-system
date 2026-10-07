const STATUS_KEYS = {
  draft: "Draft",
  submitted: "Submitted",
  reviewing: "Reviewing",
  approved: "Approved",
  rejected: "Rejected",
  reject: "Rejected",
  archived: "Archived",
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
  disabled: "Disabled",
  open: "Open",
  closed: "Closed",
  failed: "Failed",
  published: "Published"
};

const ROLE_KEYS = {
  student: "Student",
  reviewer: "Reviewer",
  library_staff: "Library staff",
  director: "Library director",
  admin: "Administrator",
  system: "System"
};

const FIELD_KEYS = {
  author: "Author",
  title: "Title",
  dateIssued: "Date of Issue",
  publisher: "Publisher",
  documentType: "Type",
  language: "Language",
  abstract: "Abstract",
  description: "Description"
};

const OPTION_KEYS = {
  Thesis: "Thesis",
  Dissertation: "Dissertation",
  "Graduation thesis": "Graduation thesis",
  "Capstone Project": "Capstone Project",
  "PhD Dissertation": "PhD Dissertation",
  "Master's thesis": "Master's thesis",
  "Master thesis": "Master's thesis",
  vie: "Vietnamese (vie)",
  eng: "English (eng)"
};

const INPUT_TYPE_KEYS = {
  text: "Text",
  textarea: "Textarea",
  select: "Select",
  year: "Year",
  file: "File"
};

export function dateLocale(lang) {
  return lang === "vi" ? "vi-VN" : "en-US";
}

export function formatDateTime(value, lang) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(dateLocale(lang));
}

export function formatDate(value, lang) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(dateLocale(lang));
}

export function statusText(status, t) {
  if (!status) {
    return t("Unknown");
  }
  const key = STATUS_KEYS[status];
  return key ? t(key) : t(String(status).replaceAll("_", " "));
}

export function decisionText(decision, t) {
  return statusText(decision, t);
}

export function roleText(role, t) {
  if (!role) {
    return t("Unknown");
  }
  const key = ROLE_KEYS[role];
  return key ? t(key) : t(String(role).replaceAll("_", " "));
}

export function fieldDisplayLabel(field, t) {
  const key = FIELD_KEYS[field?.fieldKey];
  if (key) {
    return t(key);
  }
  return field?.label || "";
}

export function optionDisplayLabel(option, t) {
  const value = option?.value;
  if (value != null && OPTION_KEYS[value]) {
    return t(OPTION_KEYS[value]);
  }
  if (option?.label && OPTION_KEYS[option.label]) {
    return t(OPTION_KEYS[option.label]);
  }
  return option?.label ?? String(value ?? "");
}

export function inputTypeText(inputType, t) {
  const key = INPUT_TYPE_KEYS[inputType];
  return key ? t(key) : inputType || "";
}

export function documentTypeText(value, t) {
  if (!value) {
    return "—";
  }
  return OPTION_KEYS[value] ? t(OPTION_KEYS[value]) : value;
}

export function languageCodeText(value, t) {
  if (!value) {
    return "—";
  }
  return OPTION_KEYS[value] ? t(OPTION_KEYS[value]) : value;
}

export function countPhrase(count, singularKey, pluralKey, t) {
  const n = Number(count) || 0;
  return t(n === 1 ? singularKey : pluralKey, { count: n });
}
