import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import LibraryArchivePanel from "./LibraryArchivePanel.jsx";
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
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

export default function AdminPanel({ auth }) {
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [settings, setSettings] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm] = Form.useForm();
  const [settingsForm] = Form.useForm();
  const [savingUser, setSavingUser] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedRole, setSelectedRole] = useState("student");
  const [rolePermissions, setRolePermissions] = useState({});
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

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
      const values = {};
      for (const item of payload) {
        values[item.key] = item.value;
      }
      settingsForm.setFieldsValue(values);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingSettings(false);
    }
  }, [auth.token, settingsForm]);

  useEffect(() => {
    if (activeTab === "users") {
      void loadUsers();
    } else if (activeTab === "roles") {
      void loadRoles();
    } else if (activeTab === "settings") {
      void loadSettings();
    }
  }, [activeTab, loadUsers, loadRoles, loadSettings]);

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

  const openEditUser = (record) => {
    setEditingUser(record);
    userForm.setFieldsValue({
      username: record.username,
      displayName: record.displayName,
      role: record.role,
      status: record.status
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
          status: values.status
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
            role: values.role
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
      return username.includes(query) || displayName.includes(query);
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
      width: 100,
      render: (_v, record) => (
        <Button type="link" size="small" onClick={() => openEditUser(record)}>
          Edit
        </Button>
      )
    }
  ];

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
      key: "settings",
      label: "System settings",
      children: (
        <>
          <Paragraph type="secondary">
            Update system configuration parameters (4.4.5.3).
          </Paragraph>
          <Form form={settingsForm} layout="vertical" onFinish={saveSettings}>
            {settings.map((item) => (
              <Form.Item
                key={item.key}
                name={item.key}
                label={item.key}
                extra={item.description}
                rules={[{ required: true, message: "Required" }]}
              >
                {item.key === "maintenance_mode" ? (
                  <Select
                    options={[
                      { value: "false", label: "false — normal operation" },
                      { value: "true", label: "true — only admins can sign in" }
                    ]}
                  />
                ) : (
                  <Input />
                )}
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
      key: "archive",
      label: "Archive configuration",
      children: <LibraryArchivePanel auth={auth} readOnly={false} canManage />
    }
  ];

  return (
    <>
      <Paragraph type="secondary">
        Administrator workspace: user accounts, role permissions, and system configuration. Administrators do not
        approve or reject thesis submissions.
      </Paragraph>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
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
    </>
  );
}
