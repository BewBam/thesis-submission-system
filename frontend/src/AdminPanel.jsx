import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import LibraryArchivePanel from "./LibraryArchivePanel.jsx";
import {
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message
} from "antd";

const { Title, Paragraph, Text } = Typography;

const ROLES = ["student", "reviewer", "library_staff", "director", "admin"];

const ROLE_LABELS = {
  student: "Student",
  reviewer: "Reviewer",
  library_staff: "Library staff",
  director: "Library director",
  admin: "Administrator"
};

const PERMISSION_LABELS = {
  submit_thesis: "Submit thesis",
  review_academic: "Academic review",
  library_intake: "Library intake review",
  director_approval: "Director final approval",
  view_all_submissions: "View all submissions",
  manage_users: "Manage users",
  manage_roles: "Manage roles",
  configure_system: "Configure system"
};

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function isEmailSettingKey(key) {
  return String(key || "").startsWith("email_") || String(key || "").startsWith("smtp_");
}

function isDspaceSettingKey(key) {
  return String(key || "").startsWith("dspace_");
}

const EMAIL_TECHNICAL_KEYS = [
  "email_enabled",
  "smtp_host",
  "smtp_user",
  "smtp_password",
  "smtp_from"
];

const SMTP_FIELD_LABELS = {
  email_enabled: "EMAIL_ENABLED",
  smtp_host: "SMTP_HOST",
  smtp_user: "SMTP_USER",
  smtp_password: "SMTP_PASSWORD",
  smtp_from: "SMTP_FROM"
};

function isEmailTechnicalKey(key) {
  return EMAIL_TECHNICAL_KEYS.includes(key);
}

function sortEmailTechnical(items) {
  const rank = new Map(EMAIL_TECHNICAL_KEYS.map((key, index) => [key, index]));
  return [...items].sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
}

function renderSettingControl(item) {
  if (item.key === "login_method") {
    return (
      <Select
        options={[
          { value: "username", label: "username (password)" },
          { value: "google", label: "google (@hcmut.edu.vn)" }
        ]}
      />
    );
  }
  if (
    item.key === "maintenance_mode" ||
    item.key === "email_enabled" ||
    item.key === "smtp_secure"
  ) {
    return (
      <Select
        options={[
          { value: "false", label: "false" },
          { value: "true", label: "true" }
        ]}
      />
    );
  }
  if (
    item.key === "dspace_api_password" ||
    item.key === "dspace_api_token" ||
    item.key === "smtp_password"
  ) {
    return <Input.Password placeholder={item.sensitive ? "Unchanged if left blank / masked" : ""} />;
  }
  if (item.key.startsWith("email_body_")) {
    return <Input.TextArea rows={8} />;
  }
  return <Input />;
}

export default function AdminPanel({
  auth,
  hideArchiveTab = false,
  hideEmailTab = false,
  hideFormFieldsTab = false,
  emailOnly = false,
  formFieldsOnly = false
}) {
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [settings, setSettings] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importingUsers, setImportingUsers] = useState(false);
  const [previewingImport, setPreviewingImport] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [faculties, setFaculties] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm] = Form.useForm();
  const watchedUserRole = Form.useWatch("role", userForm);
  const facultyRequired = watchedUserRole === "student" || watchedUserRole === "reviewer";
  const [settingsForm] = Form.useForm();
  const [emailForm] = Form.useForm();
  const [savingUser, setSavingUser] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [formFields, setFormFields] = useState([]);
  const [loadingFormFields, setLoadingFormFields] = useState(false);
  const [savingFormField, setSavingFormField] = useState(false);
  const [formFieldModalOpen, setFormFieldModalOpen] = useState(false);
  const [editingFormField, setEditingFormField] = useState(null);
  const [formFieldForm] = Form.useForm();
  const [selectedRole, setSelectedRole] = useState("student");
  const [rolePermissions, setRolePermissions] = useState({});
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

  const systemSettings = useMemo(
    () => settings.filter((item) => !isEmailSettingKey(item.key) && !isDspaceSettingKey(item.key)),
    [settings]
  );
  const emailSettings = useMemo(
    () => settings.filter((item) => isEmailSettingKey(item.key)),
    [settings]
  );
  const emailTechnicalSettings = useMemo(
    () => sortEmailTechnical(emailSettings.filter((item) => isEmailTechnicalKey(item.key))),
    [emailSettings]
  );
  const emailTemplateSettings = useMemo(
    () =>
      emailSettings.filter(
        (item) => item.key.startsWith("email_subject_") || item.key.startsWith("email_body_")
      ),
    [emailSettings]
  );

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/admin/users", { headers: authHeaders(auth.token) });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load users");
      }
      setUsers(payload);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingUsers(false);
    }
  }, [auth.token]);

  const loadFaculties = useCallback(async () => {
    try {
      const response = await fetch("/api/archive-config/faculties", { headers: authHeaders(auth.token) });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(payload?.message || "Unable to load faculties");
      }
      setFaculties(payload);
    } catch (error) {
      message.error(error.message);
    }
  }, [auth.token]);

  const loadRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const response = await fetch("/api/admin/roles", { headers: authHeaders(auth.token) });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load roles");
      }
      setRoles(payload);
      const current = payload.find((r) => r.role === selectedRole) || payload[0];
      if (current) {
        setSelectedRole(current.role);
        setRolePermissions({ ...current.permissions });
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingRoles(false);
    }
  }, [auth.token]);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const response = await fetch("/api/admin/settings", { headers: authHeaders(auth.token) });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load settings");
      }
      setSettings(payload);
      const systemValues = {};
      const emailValues = {};
      for (const item of payload) {
        if (isEmailSettingKey(item.key)) {
          emailValues[item.key] = item.value;
        } else if (!isDspaceSettingKey(item.key)) {
          systemValues[item.key] = item.value;
        }
      }
      settingsForm.setFieldsValue(systemValues);
      emailForm.setFieldsValue(emailValues);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingSettings(false);
    }
  }, [auth.token, settingsForm, emailForm]);

  const loadFormFields = useCallback(async () => {
    setLoadingFormFields(true);
    try {
      const response = await fetch("/api/admin/submission-form-fields", {
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load form fields");
      }
      setFormFields(Array.isArray(payload) ? payload : []);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingFormFields(false);
    }
  }, [auth.token]);

  useEffect(() => {
    if (formFieldsOnly) {
      void loadFormFields();
      return;
    }
    if (emailOnly || activeTab === "settings" || activeTab === "email") {
      void loadSettings();
      return;
    }
    if (activeTab === "users") {
      void loadUsers();
      void loadFaculties();
    } else if (activeTab === "roles") {
      void loadRoles();
    } else if (activeTab === "form-fields") {
      void loadFormFields();
    }
  }, [activeTab, emailOnly, formFieldsOnly, loadUsers, loadFaculties, loadRoles, loadSettings, loadFormFields]);

  useEffect(() => {
    const entry = roles.find((r) => r.role === selectedRole);
    if (entry) {
      setRolePermissions({ ...entry.permissions });
    }
  }, [selectedRole, roles]);

  const openCreateUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({ role: "student" });
    setUserModalOpen(true);
  };

  const openImportUsers = () => {
    setImportPreview(null);
    setImportResult(null);
    setImportModalOpen(true);
  };

  const downloadUsersExport = async () => {
    setExportingUsers(true);
    try {
      const response = await fetch("/api/admin/users/export", {
        headers: authHeaders(auth.token)
      });
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new Error(payload?.message || "Unable to export users");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "users.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(error.message || "Unable to export users");
    } finally {
      setExportingUsers(false);
    }
  };

  const downloadUserTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await fetch("/api/admin/users/import-template", {
        headers: authHeaders(auth.token)
      });
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new Error(payload?.message || "Unable to download template");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "users-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(error.message || "Unable to download template");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const previewUsersFile = async (file) => {
    setPreviewingImport(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/users/import/preview", {
        method: "POST",
        headers: authHeaders(auth.token),
        body: formData
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to read Excel file");
      }
      setImportPreview({ ...payload, fileName: file.name });
      if (!payload.toImportCount && payload.errorCount) {
        message.warning("No valid users to import. Check the skipped rows.");
      } else if (!payload.toImportCount) {
        message.info("The file had no data rows.");
      }
    } catch (error) {
      message.error(error.message || "Unable to read Excel file");
      setImportPreview(null);
    } finally {
      setPreviewingImport(false);
    }
    return false;
  };

  const confirmImportUsers = async () => {
    const rows = importPreview?.toImport || [];
    if (!rows.length) {
      message.warning("Upload an Excel file and review the list first.");
      return;
    }
    setImportingUsers(true);
    try {
      const response = await fetch("/api/admin/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({
          users: rows.map((row) => ({
            username: row.username,
            displayName: row.displayName,
            role: row.role,
            facultyId: row.facultyId || null
          }))
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to import users");
      }
      setImportResult(payload);
      setImportPreview(null);
      if (payload.createdCount > 0) {
        message.success(`Imported ${payload.createdCount} user(s)`);
        await loadUsers();
      } else {
        message.warning("No users imported. Check the error list.");
      }
    } catch (error) {
      message.error(error.message || "Unable to import users");
    } finally {
      setImportingUsers(false);
    }
  };

  const openEditUser = (record) => {
    setEditingUser(record);
    userForm.setFieldsValue({
      username: record.username,
      displayName: record.displayName,
      role: record.role,
      status: record.status,
      facultyId: record.facultyId || undefined
    });
    setUserModalOpen(true);
  };

  const saveUser = async (values) => {
    setSavingUser(true);
    try {
      if (editingUser) {
        const body = {
          displayName: values.displayName,
          role: values.role,
          status: values.status,
          facultyId: values.facultyId || null
        };
        if (values.password?.trim()) {
          body.password = values.password.trim();
        }
        const response = await fetch(`/api/admin/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
          body: JSON.stringify(body)
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to update user");
        }
        message.success("User updated");
      } else {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
          body: JSON.stringify({
            username: values.username.trim(),
            password: values.password,
            displayName: values.displayName.trim(),
            role: values.role,
            facultyId: values.facultyId || undefined
          })
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to create user");
        }
        message.success("User created");
      }
      setUserModalOpen(false);
      await loadUsers();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingUser(false);
    }
  };

  const deleteUser = async (record) => {
    try {
      const response = await fetch(`/api/admin/users/${record.id}`, {
        method: "DELETE",
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to delete user");
      }
      message.success(`Deleted ${record.username}`);
      await loadUsers();
    } catch (error) {
      message.error(error.message || "Unable to delete user");
    }
  };

  const saveRolePermissions = async () => {
    setSavingRoles(true);
    try {
      const response = await fetch(`/api/admin/roles/${selectedRole}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({ permissions: rolePermissions })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to update role permissions");
      }
      message.success("Role permissions updated");
      await loadRoles();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingRoles(false);
    }
  };

  const saveSettings = async (values) => {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({ settings: values })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to save settings");
      }
      message.success("System configuration saved");
      await loadSettings();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const saveEmailSettings = async (values) => {
    const settings = {};
    for (const [key, value] of Object.entries(values)) {
      if (
        EMAIL_TECHNICAL_KEYS.includes(key) ||
        key.startsWith("email_subject_") ||
        key.startsWith("email_body_")
      ) {
        settings[key] = value;
      }
    }
    setSavingSettings(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({ settings })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to save email settings");
      }
      message.success("Email configuration saved");
      await loadSettings();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const openCreateFormField = () => {
    setEditingFormField(null);
    formFieldForm.resetFields();
    formFieldForm.setFieldsValue({
      inputType: "text",
      required: false,
      enabled: true,
      storage: "extra",
      dspacePath: "",
      defaultValue: "",
      optionsText: ""
    });
    setFormFieldModalOpen(true);
  };

  const openEditFormField = (record) => {
    setEditingFormField(record);
    formFieldForm.setFieldsValue({
      fieldKey: record.fieldKey,
      label: record.label,
      dspacePath: record.dspacePath,
      inputType: record.inputType,
      required: record.required,
      enabled: record.enabled,
      sortOrder: record.sortOrder,
      defaultValue: record.defaultValue,
      optionsText: (record.options || []).map((o) => `${o.value}|${o.label}`).join("\n")
    });
    setFormFieldModalOpen(true);
  };

  const parseOptionsText = (text) => {
    if (!text?.trim()) {
      return [];
    }
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [value, ...rest] = line.split("|");
        const label = rest.join("|").trim() || value.trim();
        return { value: value.trim(), label };
      });
  };

  const saveFormField = async (values) => {
    setSavingFormField(true);
    try {
      const options = parseOptionsText(values.optionsText);
      if (editingFormField) {
        const body = {
          label: values.label,
          dspacePath: values.dspacePath || "",
          inputType: values.inputType,
          required: Boolean(values.required),
          enabled: Boolean(values.enabled),
          sortOrder: Number(values.sortOrder) || 0,
          defaultValue: values.defaultValue || "",
          options
        };
        if (!editingFormField.systemLocked && values.fieldKey) {
          body.fieldKey = values.fieldKey;
        }
        const response = await fetch(`/api/admin/submission-form-fields/${editingFormField.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
          body: JSON.stringify(body)
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to update field");
        }
        message.success("Field updated");
      } else {
        const response = await fetch("/api/admin/submission-form-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
          body: JSON.stringify({
            fieldKey: values.fieldKey,
            label: values.label,
            dspacePath: values.dspacePath || "",
            inputType: values.inputType,
            required: Boolean(values.required),
            enabled: Boolean(values.enabled),
            defaultValue: values.defaultValue || "",
            storage: "extra",
            options
          })
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to create field");
        }
        message.success("Field created");
      }
      setFormFieldModalOpen(false);
      await loadFormFields();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingFormField(false);
    }
  };

  const toggleFormFieldFlag = async (record, patch) => {
    try {
      const response = await fetch(`/api/admin/submission-form-fields/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify(patch)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to update field");
      }
      await loadFormFields();
    } catch (error) {
      message.error(error.message);
    }
  };

  const deleteFormField = (record) => {
    Modal.confirm({
      title: `Delete field "${record.label}"?`,
      content: record.systemLocked
        ? "System fields cannot be deleted."
        : "Custom field will be removed from the submission form.",
      okType: "danger",
      onOk: async () => {
        if (record.systemLocked) {
          return;
        }
        const response = await fetch(`/api/admin/submission-form-fields/${record.id}`, {
          method: "DELETE",
          headers: authHeaders(auth.token)
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to delete field");
        }
        message.success("Field deleted");
        await loadFormFields();
      }
    });
  };

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      if (userRoleFilter !== "all" && user.role !== userRoleFilter) {
        return false;
      }
      if (userStatusFilter !== "all" && user.status !== userStatusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const username = (user.username || "").toLowerCase();
      const displayName = (user.displayName || "").toLowerCase();
      const facultyName = (user.facultyName || "").toLowerCase();
      return username.includes(query) || displayName.includes(query) || facultyName.includes(query);
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  const clearUserFilters = () => {
    setUserSearch("");
    setUserRoleFilter("all");
    setUserStatusFilter("all");
  };

  const userColumns = [
    { title: "Username", dataIndex: "username", key: "username", width: 120 },
    { title: "Display name", dataIndex: "displayName", key: "displayName", width: 160 },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      width: 130,
      render: (role) => <Tag>{roleLabel(role)}</Tag>
    },
    {
      title: "Faculty",
      dataIndex: "facultyName",
      key: "facultyName",
      width: 220,
      render: (value) => value || "—"
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status) => <Tag color={status === "active" ? "green" : "red"}>{status}</Tag>
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v) => (v ? new Date(v).toLocaleString() : "—")
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_v, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => openEditUser(record)}>
            Edit
          </Button>
          {record.id !== auth.user.id ? (
            <Popconfirm
              title={`Delete ${record.username}?`}
              description="This cannot be undone. Users with submissions or reviews cannot be deleted."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => void deleteUser(record)}
            >
              <Button type="link" size="small" danger>
                Delete
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      )
    }
  ];

  const emailPanel = (
    <>
      <Paragraph type="secondary">
        Bật EMAIL_ENABLED để gửi mail. Cần SMTP_HOST, SMTP_USER, SMTP_PASSWORD và SMTP_FROM. Cổng 587
        (STARTTLS) được dùng tự động. Địa chỉ nhân viên là{" "}
        <Text code>username@hcmut.edu.vn</Text>.
      </Paragraph>
      <Form form={emailForm} layout="vertical" onFinish={saveEmailSettings}>
        <Title level={5} style={{ marginTop: 0 }}>
          SMTP
        </Title>
        {emailTechnicalSettings.map((item) => (
          <Form.Item
            key={item.key}
            name={item.key}
            label={SMTP_FIELD_LABELS[item.key] || item.key}
            extra={
              item.key === "smtp_password"
                ? "Để trống nếu giữ mật khẩu hiện tại"
                : item.key === "email_enabled"
                  ? "true = gửi mail workflow; false = không gửi"
                  : item.description
            }
            rules={
              item.key === "smtp_password"
                ? undefined
                : [{ required: true, message: "Required" }]
            }
          >
            {renderSettingControl(item)}
          </Form.Item>
        ))}
        <Divider />
        <Title level={5}>Notification templates</Title>
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Template placeholders: <Text code>{"{{title}}"}</Text>, <Text code>{"{{studentName}}"}</Text>,{" "}
          <Text code>{"{{reason}}"}</Text>, <Text code>{"{{portalUrl}}"}</Text>,{" "}
          <Text code>{"{{author}}"}</Text>, <Text code>{"{{advisor}}"}</Text>,{" "}
          <Text code>{"{{facultyName}}"}</Text>, <Text code>{"{{semesterName}}"}</Text>.
        </Paragraph>
        {emailTemplateSettings.map((item) => (
          <Form.Item key={item.key} name={item.key} label={item.key} extra={item.description}>
            {renderSettingControl(item)}
          </Form.Item>
        ))}
        <Button type="primary" htmlType="submit" loading={savingSettings || loadingSettings}>
          Save email configuration
        </Button>
      </Form>
    </>
  );

  const formFieldsPanel = (
    <>
      <Paragraph type="secondary">
        Configure metadata fields on the student form and when publishing to DSpace. Toggle{" "}
        <Text strong>Required</Text> / <Text strong>Enabled</Text>, or add custom fields. System
        fields (Author, Title, …) cannot be deleted — disable them instead.
      </Paragraph>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" onClick={openCreateFormField}>
          Add field
        </Button>
        <Button onClick={() => void loadFormFields()} loading={loadingFormFields}>
          Refresh
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loadingFormFields}
        dataSource={formFields}
        pagination={false}
        scroll={{ x: 1100 }}
        columns={[
          { title: "Label", dataIndex: "label", width: 160 },
          { title: "Key", dataIndex: "fieldKey", width: 140, render: (v) => <Text code>{v}</Text> },
          {
            title: "DSpace path",
            dataIndex: "dspacePath",
            width: 200,
            render: (v) => (v ? <Text code>{v}</Text> : "—")
          },
          { title: "Type", dataIndex: "inputType", width: 100 },
          {
            title: "Required",
            dataIndex: "required",
            width: 100,
            render: (v, row) => (
              <Switch checked={v} onChange={(checked) => void toggleFormFieldFlag(row, { required: checked })} />
            )
          },
          {
            title: "Enabled",
            dataIndex: "enabled",
            width: 100,
            render: (v, row) => (
              <Switch checked={v} onChange={(checked) => void toggleFormFieldFlag(row, { enabled: checked })} />
            )
          },
          {
            title: "System",
            dataIndex: "systemLocked",
            width: 90,
            render: (v) => (v ? <Tag>locked</Tag> : <Tag color="blue">custom</Tag>)
          },
          {
            title: "Actions",
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEditFormField(row)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  disabled={row.systemLocked}
                  onClick={() => deleteFormField(row)}
                >
                  Delete
                </Button>
              </Space>
            )
          }
        ]}
      />
    </>
  );

  const formFieldModal = (
      <Modal
        title={editingFormField ? `Edit field: ${editingFormField.fieldKey}` : "Add submission field"}
        open={formFieldModalOpen}
        onCancel={() => setFormFieldModalOpen(false)}
        onOk={() => formFieldForm.submit()}
        confirmLoading={savingFormField}
        destroyOnClose
        width={560}
      >
        <Form form={formFieldForm} layout="vertical" onFinish={saveFormField}>
          <Form.Item
            name="fieldKey"
            label="Field key"
            rules={[{ required: true, min: 2, message: "Key is required" }]}
            extra={editingFormField?.systemLocked ? "System field key cannot change" : "e.g. keywords, degree"}
          >
            <Input disabled={Boolean(editingFormField?.systemLocked)} placeholder="myCustomField" />
          </Form.Item>
          <Form.Item name="label" label="Label" rules={[{ required: true, message: "Label is required" }]}>
            <Input placeholder="Keywords" />
          </Form.Item>
          <Form.Item name="dspacePath" label="DSpace metadata path" extra="e.g. dc.subject — leave empty to skip DSpace">
            <Input placeholder="dc.subject" />
          </Form.Item>
          <Form.Item name="inputType" label="Input type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "text", label: "Text" },
                { value: "textarea", label: "Textarea" },
                { value: "select", label: "Select" },
                { value: "year", label: "Year" }
              ]}
            />
          </Form.Item>
          <Form.Item name="defaultValue" label="Default value">
            <Input />
          </Form.Item>
          <Form.Item
            name="optionsText"
            label="Select options"
            extra="One per line: value|Label (only for select type)"
          >
            <Input.TextArea rows={4} placeholder={"vie|Vietnamese\neng|English"} />
          </Form.Item>
          {editingFormField ? (
            <Form.Item name="sortOrder" label="Sort order">
              <Input type="number" />
            </Form.Item>
          ) : null}
          <Form.Item name="required" label="Required" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled on form" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
  );

  const tabItems = [
    {
      key: "users",
      label: "Manage users",
      children: (
        <>
          <Paragraph type="secondary">
            Create, edit, or disable user accounts (4.4.5.1).
          </Paragraph>
          <Space style={{ marginBottom: 12 }} wrap>
            <Button type="primary" onClick={openCreateUser}>
              Create user
            </Button>
            <Button icon={<DownloadOutlined />} loading={exportingUsers} onClick={downloadUsersExport}>
              Export users
            </Button>
            <Button onClick={openImportUsers}>Import users</Button>
            <Button onClick={() => loadUsers()} loading={loadingUsers}>
              Refresh
            </Button>
          </Space>
          <Space style={{ marginBottom: 12, width: "100%" }} wrap align="start">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search username or display name"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{ minWidth: 260, flex: 1 }}
            />
            <Select
              value={userRoleFilter}
              onChange={setUserRoleFilter}
              style={{ minWidth: 180 }}
              options={[
                { value: "all", label: "All roles" },
                ...ROLES.map((r) => ({ value: r, label: roleLabel(r) }))
              ]}
            />
            <Select
              value={userStatusFilter}
              onChange={setUserStatusFilter}
              style={{ minWidth: 140 }}
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "disabled", label: "Disabled" }
              ]}
            />
            {(userSearch || userRoleFilter !== "all" || userStatusFilter !== "all") && (
              <Button onClick={clearUserFilters}>Clear filters</Button>
            )}
          </Space>
          <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            Showing {filteredUsers.length} of {users.length} users
          </Text>
          <Table
            rowKey="id"
            dataSource={filteredUsers}
            columns={userColumns}
            loading={loadingUsers}
            pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: [8, 16, 32] }}
            scroll={{ x: 900 }}
          />
        </>
      )
    },
    {
      key: "roles",
      label: "Manage roles",
      children: (
        <>
          <Paragraph type="secondary">
            Configure permissions for each role (4.4.5.2). Changes are stored for access control policy.
          </Paragraph>
          <Space style={{ marginBottom: 16 }} wrap>
            <Text strong>Role:</Text>
            <Select
              style={{ minWidth: 200 }}
              value={selectedRole}
              onChange={setSelectedRole}
              options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
            />
            <Button type="primary" onClick={saveRolePermissions} loading={savingRoles}>
              Save permissions
            </Button>
            <Button onClick={() => loadRoles()} loading={loadingRoles}>
              Refresh
            </Button>
          </Space>
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {Object.keys(PERMISSION_LABELS).map((key) => (
              <Space key={key} style={{ width: "100%", justifyContent: "space-between" }}>
                <Text>{PERMISSION_LABELS[key]}</Text>
                <Switch
                  checked={Boolean(rolePermissions[key])}
                  onChange={(checked) =>
                    setRolePermissions((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              </Space>
            ))}
          </Space>
        </>
      )
    },
    {
      key: "form-fields",
      label: "Submission fields",
      children: formFieldsPanel
    },
    {
      key: "settings",
      label: "System settings",
      children: (
        <>
          <Paragraph type="secondary">
            Update system configuration parameters (4.4.5.3).
          </Paragraph>
          <Form form={settingsForm} layout="vertical" onFinish={saveSettings}>
            {systemSettings.map((item) => (
              <Form.Item
                key={item.key}
                name={item.key}
                label={item.key}
                extra={item.description}
                rules={[{ required: true, message: "Required" }]}
              >
                {renderSettingControl(item)}
              </Form.Item>
            ))}
            <Button type="primary" htmlType="submit" loading={savingSettings || loadingSettings}>
              Save configuration
            </Button>
          </Form>
        </>
      )
    },
    {
      key: "email",
      label: "Email configuration",
      children: emailPanel
    },
    {
      key: "archive",
      label: "Archive configuration",
      children: <LibraryArchivePanel auth={auth} readOnly={false} canManage />
    }
  ];

  if (emailOnly) {
    return emailPanel;
  }

  if (formFieldsOnly) {
    return (
      <>
        {formFieldsPanel}
        {formFieldModal}
      </>
    );
  }

  const visibleTabs = tabItems.filter((t) => {
    if (hideArchiveTab && t.key === "archive") {
      return false;
    }
    if (hideEmailTab && t.key === "email") {
      return false;
    }
    if (hideFormFieldsTab && t.key === "form-fields") {
      return false;
    }
    return true;
  });

  return (
    <>
      <Paragraph type="secondary">
        Administrator workspace: user accounts, role permissions, system and email configuration.
        Administrators do not approve or reject theses; they can create and submit on behalf of a student from the
        Submissions tab. Submission form fields are configured under Submissions.
      </Paragraph>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={visibleTabs} />
      <Modal
        title={editingUser ? `Edit user: ${editingUser.username}` : "Create user"}
        open={userModalOpen}
        onCancel={() => setUserModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={userForm} layout="vertical" onFinish={saveUser}>
          {!editingUser ? (
            <Form.Item
              label="Username"
              name="username"
              rules={[{ required: true, message: "Username is required" }]}
            >
              <Input />
            </Form.Item>
          ) : (
            <Form.Item label="Username">
              <Input value={editingUser.username} disabled />
            </Form.Item>
          )}
          <Form.Item
            label="Display name"
            name="displayName"
            rules={[{ required: true, message: "Display name is required" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true }]}>
            <Select options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))} />
          </Form.Item>
          <Form.Item
            label="Faculty"
            name="facultyId"
            rules={facultyRequired ? [{ required: true, message: "Faculty is required for students and reviewers" }] : []}
          >
            <Select
              allowClear={!facultyRequired}
              showSearch
              optionFilterProp="label"
              placeholder={facultyRequired ? "Select faculty" : "Optional"}
              options={faculties.map((faculty) => ({ value: faculty.id, label: faculty.name }))}
            />
          </Form.Item>
          {editingUser ? (
            <Form.Item label="Status" name="status" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "active", label: "active" },
                  { value: "disabled", label: "disabled" }
                ]}
              />
            </Form.Item>
          ) : null}
          <Form.Item
            label={editingUser ? "New password (optional)" : "Password"}
            name="password"
            rules={
              editingUser
                ? [{ min: 6, message: "At least 6 characters" }]
                : [
                    { required: true, message: "Password is required" },
                    { min: 6, message: "At least 6 characters" }
                  ]
            }
          >
            <Input.Password />
          </Form.Item>
          <Space>
            <Button onClick={() => setUserModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={savingUser}>
              {editingUser ? "Save changes" : "Create"}
            </Button>
          </Space>
        </Form>
      </Modal>
      <Modal
        title="Import users"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        width={760}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={() => setImportModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="import"
            type="primary"
            icon={<UploadOutlined />}
            loading={importingUsers}
            disabled={!importPreview?.toImport?.length}
            onClick={confirmImportUsers}
          >
            Import
          </Button>
        ]}
      >
        <Paragraph type="secondary">
          1. Download the template. 2. Upload the filled .xlsx file to preview. 3. Check the list, then click
          Import.           Columns: <Text code>username</Text>, <Text code>display name</Text>, <Text code>role</Text>,{" "}
          <Text code>faculty</Text> ({ROLES.join(", ")}). Faculty is required for student and reviewer, and must
          match a faculty name. Accounts have no password and sign in with Google as{" "}
          <Text code>username@hcmut.edu.vn</Text>.
        </Paragraph>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} loading={downloadingTemplate} onClick={downloadUserTemplate}>
            Download template
          </Button>
          <Upload accept=".xlsx" showUploadList={false} beforeUpload={previewUsersFile}>
            <Button icon={<UploadOutlined />} loading={previewingImport}>
              Upload Excel
            </Button>
          </Upload>
        </Space>
        {importPreview ? (
          <>
            <Paragraph>
              File: <Text strong>{importPreview.fileName}</Text> · Will import: {importPreview.toImportCount} ·
              Skipped: {importPreview.errorCount}
            </Paragraph>
            {importPreview.toImport?.length ? (
              <Table
                size="small"
                rowKey={(row) => `${row.row}-${row.username}`}
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                dataSource={importPreview.toImport}
                style={{ marginBottom: 16 }}
                columns={[
                  { title: "Row", dataIndex: "row", width: 70 },
                  { title: "Username", dataIndex: "username" },
                  { title: "Display name", dataIndex: "displayName" },
                  { title: "Role", dataIndex: "role", width: 140 },
                  { title: "Faculty", dataIndex: "facultyName" }
                ]}
              />
            ) : (
              <Paragraph type="secondary">No users will be imported from this file.</Paragraph>
            )}
            {importPreview.errors?.length ? (
              <Table
                size="small"
                title={() => "Skipped rows"}
                rowKey={(row) => `${row.row}-${row.username || ""}-${row.message}`}
                pagination={false}
                dataSource={importPreview.errors}
                columns={[
                  { title: "Row", dataIndex: "row", width: 70 },
                  { title: "Username", dataIndex: "username" },
                  { title: "Reason", dataIndex: "message" }
                ]}
              />
            ) : null}
          </>
        ) : null}
        {importResult ? (
          <Paragraph style={{ marginTop: 12 }}>
            Imported: {importResult.createdCount} · Errors: {importResult.errorCount}
            {importResult.errors?.length ? (
              <Table
                size="small"
                style={{ marginTop: 8 }}
                rowKey={(row) => `${row.username || ""}-${row.message}`}
                pagination={false}
                dataSource={importResult.errors}
                columns={[
                  { title: "Username", dataIndex: "username" },
                  { title: "Error", dataIndex: "message" }
                ]}
              />
            ) : null}
          </Paragraph>
        ) : null}
      </Modal>
      {formFieldModal}
    </>
  );
}
