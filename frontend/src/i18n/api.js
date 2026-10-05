const PATTERNS = [
  {
    re: /^Thesis PDF must be at most (\d+) MB$/,
    key: "Thesis PDF must be at most {{n}} MB",
    vars: (match) => ({ n: match[1] })
  },
  {
    re: /^Unable to open file \((\d+)\)$/,
    key: "Unable to open file ({{status}})",
    vars: (match) => ({ status: match[1] })
  },
  {
    re: /^Invalid role: (.+)$/,
    key: "Invalid role: {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Unknown permission: (.+)$/,
    key: "Unknown permission: {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Permission (.+) must be a boolean$/,
    key: "Permission {{value}} must be a boolean",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Unknown setting key: (.+)$/,
    key: "Unknown setting key: {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Import is limited to (\d+) users$/,
    key: "Import is limited to {{n}} users",
    vars: (match) => ({ n: match[1] })
  },
  {
    re: /^Cannot open period in status (.+)$/,
    key: "Cannot open period in status {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Cannot close period in status (.+)$/,
    key: "Cannot close period in status {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Field key "(.+)" already exists$/,
    key: 'Field key "{{value}}" already exists',
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Missing required permission \(one of: (.+)\)$/,
    key: "Missing required permission (one of: {{value}})",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Unable to store submission: (.+)$/,
    key: "Unable to store submission: {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Unable to list top-level DSpace communities: (.+)$/,
    key: "Unable to list top-level DSpace communities: {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Unable to list DSpace children for ([^:]+): (.+)$/,
    key: "Unable to list DSpace children for {{id}}: {{value}}",
    vars: (match) => ({ id: match[1], value: match[2] })
  },
  {
    re: /^column storage only allows: (.+)\. Use storage=extra for custom fields\.$/,
    key: "column storage only allows: {{value}}. Use storage=extra for custom fields.",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Query role must be one of: (.+)$/,
    key: "Query role must be one of: {{value}}",
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Invalid role "(.+)"\. Use: (.+)$/,
    key: 'Invalid role "{{value}}". Use: {{roles}}',
    vars: (match) => ({ value: match[1], roles: match[2] })
  },
  {
    re: /^Invalid can_log_in "(.+)"\. Use true or false\.$/,
    key: 'Invalid can_log_in "{{value}}". Use true or false.',
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^Unknown faculty "(.+)"$/,
    key: 'Unknown faculty "{{value}}"',
    vars: (match) => ({ value: match[1] })
  },
  {
    re: /^(.+) is required$/,
    key: "{{label}} is required",
    vars: (match) => ({ label: match[1] })
  }
];

function normalizeMessage(message) {
  if (Array.isArray(message)) {
    return message.filter(Boolean).join("\n");
  }
  if (message && typeof message === "object" && message.message) {
    return normalizeMessage(message.message);
  }
  return message == null ? "" : String(message);
}

export function translateApiMessage(message, t) {
  const text = normalizeMessage(message).trim();
  if (!text) {
    return "";
  }
  const lines = text.split("\n").map((line) => translateLine(line.trim(), t));
  return lines.join("\n");
}

function translateLine(text, t) {
  if (!text) {
    return "";
  }
  const exact = t(text);
  if (exact !== text) {
    return exact;
  }
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.re);
    if (match) {
      const vars = pattern.vars(match);
      if (pattern.key === "{{label}} is required" && vars.label) {
        const label = t(vars.label);
        return t(pattern.key, { label: label === vars.label ? vars.label : label });
      }
      return t(pattern.key, vars);
    }
  }
  return text;
}
