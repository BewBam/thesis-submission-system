import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
  message
} from "antd";
import {
  BankOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  DownOutlined,
  FolderOutlined,
  ReadOutlined,
  RightOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
const { Title, Paragraph, Text } = Typography;

function toIsoString(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toISOString === "function") {
    return value.toISOString();
  }
  return dayjs(value).toISOString();
}

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

const DSPACE_SETTING_ORDER = [
  "dspace_api_base_url",
  "dspace_api_user",
  "dspace_api_password",
  "dspace_api_token",
  "dspace_root_community_id"
];

function isDspaceSettingKey(key) {
  return String(key || "").startsWith("dspace_");
}

function sortDspaceSettings(items) {
  const rank = new Map(DSPACE_SETTING_ORDER.map((key, index) => [key, index]));
  return [...items].sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99) || a.key.localeCompare(b.key));
}

function renderDspaceSettingControl(item) {
  if (item.key === "dspace_api_password" || item.key === "dspace_api_token") {
    return <Input.Password placeholder={item.sensitive ? "Unchanged if left blank / masked" : ""} />;
  }
  return <Input />;
}

function formatTreeDate(value) {
  if (!value) {
    return "—";
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY") : "—";
}

function countLabel(count, singular, plural) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? singular : plural}`;
}

function ArchiveTreeRow({ depth, expanded, expandable, onToggle, icon, title, extra, actions, style, stacked = false }) {
  return (
    <div
      className="archive-tree-row"
      onClick={expandable ? onToggle : undefined}
      style={{
        display: "flex",
        alignItems: stacked ? "flex-start" : "center",
        gap: 8,
        minHeight: depth === 0 ? 52 : 44,
        padding: depth === 0 ? "8px 14px" : "8px 14px",
        paddingLeft: 12 + depth * 22,
        cursor: expandable ? "pointer" : "default",
        ...style
      }}
    >
      <span
        style={{
          width: 16,
          color: "#8aa0b8",
          display: "inline-flex",
          justifyContent: "center",
          flex: "0 0 16px"
        }}
      >
        {expandable ? expanded ? <DownOutlined style={{ fontSize: 11 }} /> : <RightOutlined style={{ fontSize: 11 }} /> : null}
      </span>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 28px",
          background: depth === 0 ? "#e8f4fc" : depth === 1 ? "#eef3fb" : "#f3f5f8",
          color: depth === 0 ? "#1488D8" : depth === 1 ? "#2f5f93" : "#6d7f93"
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={6} wrap>
          <Text strong={depth < 2} style={{ fontSize: depth === 0 ? 15 : 14 }}>
            {title}
          </Text>
          {stacked ? null : extra}
        </Space>
        {stacked ? (
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {extra}
          </div>
        ) : null}
      </div>
      <div onClick={(event) => event.stopPropagation()} style={{ flex: "0 0 auto" }}>
        {actions}
      </div>
    </div>
  );
}

function periodStatusColor(status) {
  if (status === "open") {
    return "green";
  }
  if (status === "draft") {
    return "default";
  }
  if (status === "closed") {
    return "orange";
  }
  return "purple";
}

function dspaceIdText(id) {
  if (!id) {
    return <Text type="secondary">—</Text>;
  }
  return (
    <Text code copyable={{ text: id }} style={{ fontSize: 11 }}>
      {id}
    </Text>
  );
}

/** Build Ant Design Tree data from flat dspace_sync_nodes / sync result nodes. */
function buildDspaceTreeData(nodes, options = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }
  const collectionsOnly = Boolean(options.selectableCollectionsOnly);
  const idSet = new Set(nodes.map((node) => node.dspaceId));
  const byParent = new Map();
  for (const node of nodes) {
    const parentKey =
      node.parentDspaceId && idSet.has(node.parentDspaceId) ? node.parentDspaceId : "__root__";
    if (!byParent.has(parentKey)) {
      byParent.set(parentKey, []);
    }
    byParent.get(parentKey).push(node);
  }

  const toNodes = (parentKey) => {
    const children = (byParent.get(parentKey) || []).slice().sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "community" ? -1 : 1;
      }
      return String(a.name).localeCompare(String(b.name), "vi");
    });
    return children.map((node) => {
      const isCollection = node.type === "collection";
      const nested = isCollection ? [] : toNodes(node.dspaceId);
      return {
        key: node.dspaceId,
        isLeaf: isCollection || nested.length === 0,
        selectable: collectionsOnly ? isCollection : undefined,
        title: (
          <Space size={8} wrap>
            {isCollection ? <DatabaseOutlined /> : <FolderOutlined />}
            <Text strong={!isCollection}>{node.name}</Text>
            <Tag color={isCollection ? "blue" : "geekblue"}>
              {isCollection ? "collection" : "community"}
            </Tag>
            {options.hideId ? null : (
              <Text type="secondary" code style={{ fontSize: 11 }}>
                {node.dspaceId}
              </Text>
            )}
          </Space>
        ),
        children: nested.length > 0 ? nested : undefined
      };
    });
  };

  return toNodes("__root__");
}

function collectExpandableKeys(treeNodes) {
  const keys = [];
  const walk = (items) => {
    for (const item of items || []) {
      if (item.children?.length) {
        keys.push(item.key);
        walk(item.children);
      }
    }
  };
  walk(treeNodes);
  return keys;
}

export default function LibraryArchivePanel({ auth, readOnly = false, canManage }) {
  const allowEdit = canManage ?? !readOnly;
  const isAdmin = auth?.user?.role === "admin";
  const canManageFaculties = isAdmin;
  const [faculties, setFaculties] = useState([]);
  const [facultyTree, setFacultyTree] = useState({});
  const [expandedFacultyKeys, setExpandedFacultyKeys] = useState([]);
  const [expandedSemesterKeys, setExpandedSemesterKeys] = useState({});
  const [loadingFaculties, setLoadingFaculties] = useState(false);
  const [syncingDspace, setSyncingDspace] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [dspaceSyncNodes, setDspaceSyncNodes] = useState([]);
  const [dspaceTreeExpandedKeys, setDspaceTreeExpandedKeys] = useState([]);
  const [loadingDspaceTree, setLoadingDspaceTree] = useState(false);
  const [mainTab, setMainTab] = useState("browse");
  const [configSemesters, setConfigSemesters] = useState([]);
  const [loadingConfigSemesters, setLoadingConfigSemesters] = useState(false);
  const [facultyModalOpen, setFacultyModalOpen] = useState(false);
  const [semesterModalOpen, setSemesterModalOpen] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [semesterForm] = Form.useForm();
  const [detailKind, setDetailKind] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editKind, setEditKind] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [facultyForm] = Form.useForm();
  const [periodForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [dspaceSettingsForm] = Form.useForm();
  const [dspaceSettings, setDspaceSettings] = useState([]);
  const [loadingDspaceSettings, setLoadingDspaceSettings] = useState(false);
  const [savingDspaceSettings, setSavingDspaceSettings] = useState(false);
  const configFacultyId = Form.useWatch("facultyId", periodForm);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [publishQueue, setPublishQueue] = useState([]);
  const [loadingPublishQueue, setLoadingPublishQueue] = useState(false);
  const [pushingDspace, setPushingDspace] = useState(false);
  const [selectedPublishIds, setSelectedPublishIds] = useState([]);
  const [publishFilterFacultyId, setPublishFilterFacultyId] = useState(null);
  const [publishFilterSemesterId, setPublishFilterSemesterId] = useState(null);
  const [publishFilterPeriodId, setPublishFilterPeriodId] = useState(null);
  const [publishFilterStatus, setPublishFilterStatus] = useState("pending");
  const [publishSemesters, setPublishSemesters] = useState([]);
  const [publishPeriods, setPublishPeriods] = useState([]);
  const [targetCollectionId, setTargetCollectionId] = useState(null);
  const [pushCollectionModalOpen, setPushCollectionModalOpen] = useState(false);

  const dspaceTreeData = useMemo(() => buildDspaceTreeData(dspaceSyncNodes), [dspaceSyncNodes]);
  const pushCollectionTreeData = useMemo(
    () => buildDspaceTreeData(dspaceSyncNodes, { selectableCollectionsOnly: true, hideId: true }),
    [dspaceSyncNodes]
  );
  const selectedPushCollection = dspaceSyncNodes.find(
    (node) => node.type === "collection" && node.dspaceId === targetCollectionId
  );

  const applyDspaceNodes = useCallback((nodes) => {
    const list = Array.isArray(nodes) ? nodes : [];
    setDspaceSyncNodes(list);
    const tree = buildDspaceTreeData(list);
    // Expand first two levels by default for readability
    const topKeys = tree.map((n) => n.key);
    const secondLevel = tree.flatMap((n) => (n.children || []).map((c) => c.key));
    setDspaceTreeExpandedKeys([...topKeys, ...secondLevel].map(String));
  }, []);

  const loadDspaceSyncNodes = useCallback(async () => {
    setLoadingDspaceTree(true);
    try {
      const response = await fetch("/api/archive-config/dspace/sync-nodes", {
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load DSpace sync tree");
      }
      applyDspaceNodes(payload);
    } catch (error) {
      // Tree is optional until first sync succeeds
      console.warn(error);
    } finally {
      setLoadingDspaceTree(false);
    }
  }, [auth.token, applyDspaceNodes]);

  const loadDspaceSettings = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setLoadingDspaceSettings(true);
    try {
      const response = await fetch("/api/admin/settings", { headers: authHeaders(auth.token) });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(payload?.message || "Unable to load DSpace settings");
      }
      const dspaceItems = sortDspaceSettings(payload.filter((item) => isDspaceSettingKey(item.key)));
      setDspaceSettings(dspaceItems);
      const values = {};
      for (const item of dspaceItems) {
        values[item.key] = item.value;
      }
      dspaceSettingsForm.setFieldsValue(values);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingDspaceSettings(false);
    }
  }, [auth.token, dspaceSettingsForm, isAdmin]);

  const loadFaculties = useCallback(async () => {
    setLoadingFaculties(true);
    try {
      const response = await fetch("/api/archive-config/faculties", {
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load faculties");
      }
      setFaculties(Array.isArray(payload) ? payload : []);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingFaculties(false);
    }
  }, [auth.token]);

  const loadFacultyTree = useCallback(
    async (facultyId) => {
      if (!facultyId) {
        return;
      }
      setFacultyTree((prev) => ({
        ...prev,
        [facultyId]: {
          semesters: prev[facultyId]?.semesters || [],
          periods: prev[facultyId]?.periods || [],
          loading: true
        }
      }));
      try {
        const [semRes, perRes] = await Promise.all([
          fetch(`/api/archive-config/faculties/${facultyId}/semesters`, {
            headers: authHeaders(auth.token)
          }),
          fetch(`/api/archive-config/faculties/${facultyId}/submission-periods`, {
            headers: authHeaders(auth.token)
          })
        ]);
        const semPayload = await parseResponse(semRes);
        const perPayload = await parseResponse(perRes);
        if (!semRes.ok) {
          throw new Error(semPayload?.message || "Unable to load semesters");
        }
        if (!perRes.ok) {
          throw new Error(perPayload?.message || "Unable to load submission periods");
        }
        setFacultyTree((prev) => ({
          ...prev,
          [facultyId]: {
            semesters: Array.isArray(semPayload) ? semPayload : [],
            periods: Array.isArray(perPayload) ? perPayload : [],
            loading: false
          }
        }));
      } catch (error) {
        message.error(error.message);
        setFacultyTree((prev) => ({
          ...prev,
          [facultyId]: {
            semesters: prev[facultyId]?.semesters || [],
            periods: prev[facultyId]?.periods || [],
            loading: false
          }
        }));
      }
    },
    [auth.token]
  );

  const expandFaculty = useCallback(
    async (facultyId) => {
      if (!facultyId) {
        return;
      }
      setExpandedFacultyKeys((prev) => (prev.includes(facultyId) ? prev : [...prev, facultyId]));
      await loadFacultyTree(facultyId);
    },
    [loadFacultyTree]
  );

  const loadPublishQueue = useCallback(async () => {
    if (!allowEdit) {
      return;
    }
    setLoadingPublishQueue(true);
    try {
      const params = new URLSearchParams();
      if (publishFilterFacultyId) {
        params.set("facultyId", publishFilterFacultyId);
      }
      if (publishFilterSemesterId) {
        params.set("semesterId", publishFilterSemesterId);
      }
      if (publishFilterPeriodId) {
        params.set("periodId", publishFilterPeriodId);
      }
      if (publishFilterStatus) {
        params.set("dspaceStatus", publishFilterStatus);
      }
      const qs = params.toString();
      const response = await fetch(
        `/api/archive-config/dspace/publish-queue${qs ? `?${qs}` : ""}`,
        { headers: authHeaders(auth.token) }
      );
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load publish queue");
      }
      setPublishQueue(Array.isArray(payload) ? payload : []);
      setSelectedPublishIds([]);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingPublishQueue(false);
    }
  }, [
    allowEdit,
    auth.token,
    publishFilterFacultyId,
    publishFilterSemesterId,
    publishFilterPeriodId,
    publishFilterStatus
  ]);

  const onPublishFilterFacultyChange = async (facultyId) => {
    setPublishFilterFacultyId(facultyId || null);
    setPublishFilterSemesterId(null);
    setPublishFilterPeriodId(null);
    if (!facultyId) {
      setPublishSemesters([]);
      setPublishPeriods([]);
      return;
    }
    try {
      const [semRes, perRes] = await Promise.all([
        fetch(`/api/archive-config/faculties/${facultyId}/semesters`, {
          headers: authHeaders(auth.token)
        }),
        fetch(`/api/archive-config/faculties/${facultyId}/submission-periods`, {
          headers: authHeaders(auth.token)
        })
      ]);
      const semPayload = await parseResponse(semRes);
      const perPayload = await parseResponse(perRes);
      if (!semRes.ok) {
        throw new Error(semPayload?.message || "Unable to load semesters");
      }
      if (!perRes.ok) {
        throw new Error(perPayload?.message || "Unable to load submission periods");
      }
      setPublishSemesters(Array.isArray(semPayload) ? semPayload : []);
      setPublishPeriods(Array.isArray(perPayload) ? perPayload : []);
    } catch (error) {
      setPublishSemesters([]);
      setPublishPeriods([]);
      message.error(error.message);
    }
  };

  const onPublishFilterSemesterChange = (semesterId) => {
    setPublishFilterSemesterId(semesterId || null);
    setPublishFilterPeriodId(null);
  };

  const openPushCollectionModal = () => {
    if (selectedPublishIds.length === 0) {
      message.warning("Chọn ít nhất một submission");
      return;
    }
    setTargetCollectionId(null);
    setPushCollectionModalOpen(true);
  };

  const closePushCollectionModal = () => {
    if (pushingDspace) {
      return;
    }
    setPushCollectionModalOpen(false);
    setTargetCollectionId(null);
  };

  const pushSelectedToDspace = async () => {
    if (!targetCollectionId) {
      message.warning("Chọn DSpace collection đích");
      return;
    }
    if (selectedPublishIds.length === 0) {
      message.warning("Chọn ít nhất một submission");
      return;
    }
    setPushingDspace(true);
    try {
      const response = await fetch("/api/archive-config/dspace/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({
          submissionIds: selectedPublishIds,
          collectionId: targetCollectionId
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Push to DSpace failed");
      }
      const results = payload?.results || [];
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) {
        message.success(`Pushed ${okCount} submission(s) to DSpace`);
      } else {
        message.warning(`Pushed ${okCount} ok, ${failCount} failed`);
      }
      setPushCollectionModalOpen(false);
      setTargetCollectionId(null);
      setSelectedPublishIds([]);
      await loadPublishQueue();
    } catch (error) {
      message.error(error.message);
    } finally {
      setPushingDspace(false);
    }
  };

  const loadConfigSemesters = useCallback(
    async (facultyId) => {
      if (!facultyId) {
        setConfigSemesters([]);
        return;
      }
      setLoadingConfigSemesters(true);
      try {
        const response = await fetch(`/api/archive-config/faculties/${facultyId}/semesters`, {
          headers: authHeaders(auth.token)
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load semesters");
        }
        setConfigSemesters(Array.isArray(payload) ? payload : []);
      } catch (error) {
        setConfigSemesters([]);
        message.error(error.message);
      } finally {
        setLoadingConfigSemesters(false);
      }
    },
    [auth.token]
  );

  useEffect(() => {
    void loadFaculties();
    void loadDspaceSyncNodes();
  }, [loadFaculties, loadDspaceSyncNodes]);

  useEffect(() => {
    if (mainTab === "push-dspace" && allowEdit) {
      void loadPublishQueue();
    }
    if (mainTab === "dspace-settings" && isAdmin) {
      void loadDspaceSettings();
    }
  }, [mainTab, allowEdit, isAdmin, loadPublishQueue, loadDspaceSettings]);

  const saveDspaceSettings = async (values) => {
    setSavingDspaceSettings(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({ settings: values })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to save DSpace settings");
      }
      message.success("DSpace settings saved");
      await loadDspaceSettings();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingDspaceSettings(false);
    }
  };

  const syncFromDspaceRoot = async () => {
    setSyncingDspace(true);
    try {
      const response = await fetch("/api/archive-config/dspace/sync-from-root", {
        method: "POST",
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "DSpace sync failed");
      }
      setSyncResult(payload);
      applyDspaceNodes(payload.nodes || []);
      const total = payload.stats?.total ?? payload.nodes?.length ?? 0;
      const communities = payload.stats?.communities ?? 0;
      const collections = payload.stats?.collections ?? 0;
      message.success(
        `Synced ${total} DSpace nodes (${communities} communities, ${collections} collections)`
      );
      await loadFaculties();
      await Promise.all(expandedFacultyKeys.map((facultyId) => loadFacultyTree(facultyId)));
    } catch (error) {
      message.error(error.message);
    } finally {
      setSyncingDspace(false);
    }
  };

  const submitFaculty = async (values) => {
    setSaving(true);
    try {
      const response = await fetch("/api/archive-config/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({
          name: values.name
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to create faculty");
      }
      message.success("Faculty created");
      setFacultyModalOpen(false);
      facultyForm.resetFields();
      await loadFaculties();
      setMainTab("browse");
      if (payload?.id) {
        await expandFaculty(payload.id);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const submitSemester = async (values) => {
    const forAllFaculties = values.forAllFaculties === true;
    const facultyId = values.facultyId;
    if (!forAllFaculties && !facultyId) {
      message.warning("Select a faculty");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: values.name
      };
      const response = await fetch(
        forAllFaculties
          ? "/api/archive-config/semesters/for-all-faculties"
          : `/api/archive-config/faculties/${facultyId}/semesters`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
          body: JSON.stringify(body)
        }
      );
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to create semester");
      }
      if (forAllFaculties) {
        const createdCount = payload?.createdCount ?? 0;
        const skippedCount = payload?.skippedCount ?? 0;
        message.success(
          skippedCount > 0
            ? `Created semester for ${createdCount} faculties, skipped ${skippedCount}`
            : `Created semester for ${createdCount} faculties`
        );
      } else {
        message.success("Semester created");
      }
      setSemesterModalOpen(false);
      semesterForm.resetFields();
      await loadFaculties();
      if (forAllFaculties) {
        await Promise.all(expandedFacultyKeys.map((id) => loadFacultyTree(id)));
      } else {
        await expandFaculty(facultyId);
        if (configFacultyId === facultyId) {
          await loadConfigSemesters(facultyId);
        }
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const submitPeriod = async (values) => {
    const facultyId = values.facultyId;
    if (!facultyId) {
      message.warning("Select a faculty");
      return;
    }
    if (!values.semesterId) {
      message.warning("Select a semester");
      return;
    }
    if (!values.range?.[0] || !values.range?.[1]) {
      message.error("Please choose submission open and close dates");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/archive-config/faculties/${facultyId}/submission-periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({
          semesterId: values.semesterId,
          name: values.name,
          opensAt: toIsoString(values.range[0]),
          closesAt: toIsoString(values.range[1]),
          allowResubmit: values.allowResubmit !== false
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to create submission period");
      }
      if (values.openAfterCreate && payload?.id) {
        const openRes = await fetch(`/api/archive-config/submission-periods/${payload.id}/open`, {
          method: "POST",
          headers: authHeaders(auth.token)
        });
        const openPayload = await parseResponse(openRes);
        if (!openRes.ok) {
          throw new Error(openPayload?.message || "Period created but could not be opened");
        }
        message.success("Submission period created and opened");
      } else {
        message.success(
          payload?.dspaceCollectionId
            ? "Submission period created (DSpace collection linked)"
            : "Submission period created (draft)"
        );
      }
      periodForm.resetFields();
      setPeriodModalOpen(false);
      setExpandedSemesterKeys((prev) => {
        const current = prev[facultyId] || [];
        if (current.includes(values.semesterId)) {
          return prev;
        }
        return { ...prev, [facultyId]: [...current, values.semesterId] };
      });
      await loadFaculties();
      await expandFaculty(facultyId);
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const openCreateSemesterModal = () => {
    semesterForm.setFieldsValue({
      forAllFaculties: false,
      facultyId: undefined,
      name: undefined
    });
    setSemesterModalOpen(true);
  };

  const openCreatePeriodModal = () => {
    periodForm.setFieldsValue({
      facultyId: undefined,
      semesterId: undefined,
      name: undefined,
      allowResubmit: true,
      openAfterCreate: false,
      range: [dayjs().startOf("day"), dayjs().add(90, "day").endOf("day")]
    });
    setConfigSemesters([]);
    setPeriodModalOpen(true);
  };

  const onConfigFacultyChange = (facultyId) => {
    periodForm.setFieldsValue({ facultyId, semesterId: undefined });
    void loadConfigSemesters(facultyId);
  };

  const periodAction = async (periodId, action, facultyId) => {
    setActionId(`${action}-${periodId}`);
    try {
      const response = await fetch(`/api/archive-config/submission-periods/${periodId}/${action}`, {
        method: "POST",
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || `Unable to ${action} period`);
      }
      message.success(action === "open" ? "Period opened" : "Period closed");
      await loadFaculties();
      if (facultyId) {
        await loadFacultyTree(facultyId);
      }
      if (detailKind === "period" && detailRecord?.id === periodId) {
        await openDetail("period", periodId);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setActionId(null);
    }
  };

  const openDetail = async (kind, id) => {
    setDetailKind(kind);
    setDetailLoading(true);
    setDetailRecord(null);
    try {
      const path =
        kind === "faculty"
          ? `/api/archive-config/faculties/${id}`
          : kind === "semester"
            ? `/api/archive-config/semesters/${id}`
            : `/api/archive-config/submission-periods/${id}`;
      const response = await fetch(path, { headers: authHeaders(auth.token) });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load detail");
      }
      setDetailRecord(payload);
    } catch (error) {
      message.error(error.message);
      setDetailKind(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailKind(null);
    setDetailRecord(null);
  };

  const openEditFromDetail = () => {
    if (!detailRecord || !detailKind) {
      return;
    }
    setEditKind(detailKind);
    setEditRecord(detailRecord);
    if (detailKind === "faculty") {
      editForm.setFieldsValue({
        name: detailRecord.name,
        status: detailRecord.status
      });
    } else if (detailKind === "semester") {
      editForm.setFieldsValue({
        name: detailRecord.name,
        status: detailRecord.status || "active"
      });
    } else {
      editForm.setFieldsValue({
        name: detailRecord.name,
        range: [dayjs(detailRecord.opensAt), dayjs(detailRecord.closesAt)],
        allowResubmit: detailRecord.allowResubmit !== false
      });
    }
  };

  const submitEdit = async (values) => {
    if (!editKind || !editRecord) {
      return;
    }
    setSaving(true);
    try {
      let path;
      let body;
      if (editKind === "faculty") {
        path = `/api/archive-config/faculties/${editRecord.id}`;
        body = { name: values.name, status: values.status };
      } else if (editKind === "semester") {
        path = `/api/archive-config/semesters/${editRecord.id}`;
        body = {
          name: values.name,
          status: values.status
        };
      } else {
        if (!values.range?.[0] || !values.range?.[1]) {
          message.error("Please choose open and close dates");
          setSaving(false);
          return;
        }
        path = `/api/archive-config/submission-periods/${editRecord.id}`;
        body = {
          name: values.name,
          opensAt: toIsoString(values.range[0]),
          closesAt: toIsoString(values.range[1]),
          allowResubmit: values.allowResubmit !== false
        };
      }
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify(body)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to update");
      }
      message.success("Updated successfully");
      const treeFacultyId = editKind === "faculty" ? editRecord.id : editRecord.facultyId;
      setEditKind(null);
      setEditRecord(null);
      editForm.resetFields();
      await loadFaculties();
      if (treeFacultyId && (editKind === "semester" || editKind === "period" || expandedFacultyKeys.includes(treeFacultyId))) {
        await loadFacultyTree(treeFacultyId);
      }
      if (detailKind) {
        setDetailRecord(payload);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteFromDetail = () => {
    if (!detailKind || !detailRecord) {
      return;
    }
    const labels = {
      faculty: "faculty",
      semester: "semester",
      period: "submission period"
    };
    const name = detailRecord.name;
    Modal.confirm({
      title: `Delete ${labels[detailKind]}?`,
      content:
        detailKind === "faculty"
          ? `Delete "${name}" from Portal? Semesters and periods under this faculty will also be removed. Linked submissions keep files but lose the period link.`
          : detailKind === "semester"
            ? `Delete "${name}" from Portal? Periods under this semester will also be removed. Linked submissions will lose the period link.`
            : `Delete period "${name}" from Portal? Linked submissions will lose the period link.`,
      okText: "Delete",
      okType: "danger",
      onOk: () => deleteFromDetail()
    });
  };

  const deleteFromDetail = async () => {
    if (!detailKind || !detailRecord) {
      return;
    }
    const id = detailRecord.id;
    const path =
      detailKind === "faculty"
        ? `/api/archive-config/faculties/${id}`
        : detailKind === "semester"
          ? `/api/archive-config/semesters/${id}`
          : `/api/archive-config/submission-periods/${id}`;
    setActionId(`delete-${id}`);
    try {
      const response = await fetch(path, {
        method: "DELETE",
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to delete");
      }
      if (payload?.dspaceDeleteWarning) {
        message.warning("Removed from Portal, but DSpace node may still exist — check backend logs");
      } else if (payload?.dspaceDeleted) {
        message.success("Deleted from Portal and DSpace");
      } else {
        message.success("Deleted successfully");
      }
      const deletedFaculty = detailKind === "faculty";
      const treeFacultyId = deletedFaculty ? id : detailRecord.facultyId;
      closeDetail();
      await loadFaculties();
      if (deletedFaculty) {
        setExpandedFacultyKeys((prev) => prev.filter((key) => key !== treeFacultyId));
        setFacultyTree((prev) => {
          const next = { ...prev };
          delete next[treeFacultyId];
          return next;
        });
        setExpandedSemesterKeys((prev) => {
          const next = { ...prev };
          delete next[treeFacultyId];
          return next;
        });
      } else if (treeFacultyId) {
        await loadFacultyTree(treeFacultyId);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setActionId(null);
    }
  };

  const toggleFaculty = (facultyId) => {
    const open = expandedFacultyKeys.includes(facultyId);
    if (open) {
      setExpandedFacultyKeys((keys) => keys.filter((key) => key !== facultyId));
      return;
    }
    void expandFaculty(facultyId);
  };

  const toggleSemester = (facultyId, semesterId) => {
    setExpandedSemesterKeys((prev) => {
      const current = prev[facultyId] || [];
      const nextKeys = current.includes(semesterId)
        ? current.filter((key) => key !== semesterId)
        : [...current, semesterId];
      return { ...prev, [facultyId]: nextKeys };
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div>
        <Title level={5} style={{ margin: 0 }}>
          Faculty archive configuration
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Portal đã seed sẵn 11 khoa HCMUT. Sau workflow, submission được archive vào period
          (chưa lên DSpace). Admin/library staff dùng tab <Text strong>Push to DSpace</Text> để đẩy
          lên collection đã sync.
        </Paragraph>
      </div>
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Text type="secondary">
          {allowEdit ? "Config submission period under existing faculty / semester" : "Read-only view"}
        </Text>
        <Space wrap>
          <Button
            onClick={() => {
              void (async () => {
                await loadFaculties();
                await Promise.all(expandedFacultyKeys.map((facultyId) => loadFacultyTree(facultyId)));
              })();
            }}
            loading={loadingFaculties}
          >
            Refresh
          </Button>
          {allowEdit && (
            <Button loading={syncingDspace} onClick={() => void syncFromDspaceRoot()}>
              Sync from DSpace
            </Button>
          )}
          {canManageFaculties && (
            <Button
              type="primary"
              onClick={() => {
                setFacultyModalOpen(true);
              }}
            >
              Add faculty
            </Button>
          )}
        </Space>
      </Space>

      <Tabs
        activeKey={mainTab}
        onChange={setMainTab}
        items={[
          ...(isAdmin
            ? [
                {
                  key: "dspace-settings",
                  label: "DSpace settings",
                  children: (
                    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 640 }}>
                      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        Set <Text code>dspace_api_base_url</Text> plus{" "}
                        <Text code>dspace_api_user</Text> / <Text code>dspace_api_password</Text> for
                        auto-login. Optional <Text code>dspace_api_token</Text> is a fallback when
                        user/password are empty. Root community UUID is used when syncing from DSpace.
                      </Paragraph>
                      <Form
                        form={dspaceSettingsForm}
                        layout="vertical"
                        onFinish={saveDspaceSettings}
                      >
                        {dspaceSettings.map((item) => (
                          <Form.Item
                            key={item.key}
                            name={item.key}
                            label={item.key}
                            extra={item.description}
                          >
                            {renderDspaceSettingControl(item)}
                          </Form.Item>
                        ))}
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={savingDspaceSettings || loadingDspaceSettings}
                        >
                          Save DSpace settings
                        </Button>
                      </Form>
                    </Space>
                  )
                }
              ]
            : []),
          ...(allowEdit
            ? [
                {
                  key: "push-dspace",
                  label: "Push to DSpace",
                  children: (
                    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                      <Alert
                        type="info"
                        showIcon
                        message="Archived submissions stay in Portal periods until you push them"
                        description="Filter by faculty / semester / period / DSpace status, select submissions, then click Push selected to choose a DSpace collection."
                      />
                      <Space wrap>
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Lọc khoa"
                          style={{ minWidth: 220 }}
                          value={publishFilterFacultyId}
                          options={faculties.map((f) => ({
                            value: f.id,
                            label: f.name
                          }))}
                          onChange={(v) => void onPublishFilterFacultyChange(v)}
                        />
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Lọc học kỳ"
                          style={{ minWidth: 200 }}
                          value={publishFilterSemesterId}
                          disabled={!publishFilterFacultyId}
                          options={publishSemesters.map((s) => ({
                            value: s.id,
                            label: s.name
                          }))}
                          onChange={onPublishFilterSemesterChange}
                        />
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Lọc period"
                          style={{ minWidth: 220 }}
                          value={publishFilterPeriodId}
                          disabled={!publishFilterSemesterId}
                          options={publishPeriods
                            .filter((period) => period.semesterId === publishFilterSemesterId)
                            .map((period) => ({
                              value: period.id,
                              label: period.name
                            }))}
                          onChange={(v) => setPublishFilterPeriodId(v || null)}
                        />
                        <Select
                          placeholder="Trạng thái DSpace"
                          style={{ minWidth: 160 }}
                          value={publishFilterStatus}
                          options={[
                            { value: "pending", label: "pending (chưa lên)" },
                            { value: "published", label: "published" },
                            { value: "failed", label: "failed" },
                            { value: "", label: "Tất cả" }
                          ]}
                          onChange={(v) => setPublishFilterStatus(v ?? "")}
                        />
                        <Button loading={loadingPublishQueue} onClick={() => void loadPublishQueue()}>
                          Apply filters
                        </Button>
                      </Space>
                      <Button
                        type="primary"
                        disabled={selectedPublishIds.length === 0}
                        onClick={openPushCollectionModal}
                      >
                        Push selected ({selectedPublishIds.length})
                      </Button>
                      <Modal
                        title="Push to DSpace"
                        open={pushCollectionModalOpen}
                        onCancel={closePushCollectionModal}
                        destroyOnClose
                        width={720}
                        okText="Push"
                        confirmLoading={pushingDspace}
                        okButtonProps={{ disabled: !targetCollectionId }}
                        onOk={() => void pushSelectedToDspace()}
                      >
                        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                          <Text>
                            {selectedPublishIds.length} submission
                            {selectedPublishIds.length === 1 ? "" : "s"} selected. Choose a collection
                            in the DSpace tree.
                          </Text>
                          {pushCollectionTreeData.length === 0 ? (
                            <Alert
                              type="info"
                              showIcon
                              message="Chưa có cây DSpace"
                              description="Sync DSpace trước để chọn collection."
                            />
                          ) : (
                            <Tree
                              showLine
                              blockNode
                              defaultExpandAll
                              treeData={pushCollectionTreeData}
                              selectedKeys={targetCollectionId ? [targetCollectionId] : []}
                              onSelect={(keys) => {
                                const id = keys[0] ? String(keys[0]) : null;
                                const node = dspaceSyncNodes.find((item) => item.dspaceId === id);
                                setTargetCollectionId(node?.type === "collection" ? id : null);
                              }}
                              style={{
                                background: "#fafafa",
                                padding: 8,
                                borderRadius: 6,
                                border: "1px solid #f0f0f0",
                                maxHeight: 420,
                                overflow: "auto"
                              }}
                            />
                          )}
                          <Text type="secondary">
                            {selectedPushCollection
                              ? `Collection: ${selectedPushCollection.path || selectedPushCollection.name}`
                              : "Chỉ chọn được collection. Community dùng để mở nhánh."}
                          </Text>
                        </Space>
                      </Modal>
                      <Table
                        rowKey="id"
                        size="small"
                        loading={loadingPublishQueue}
                        dataSource={publishQueue}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 1100 }}
                        rowSelection={{
                          selectedRowKeys: selectedPublishIds,
                          onChange: (keys) => setSelectedPublishIds(keys)
                        }}
                        columns={[
                          { title: "Title", dataIndex: "title", ellipsis: true },
                          { title: "Author", dataIndex: "author", width: 160, ellipsis: true },
                          {
                            title: "Faculty",
                            dataIndex: "facultyName",
                            width: 180,
                            ellipsis: true,
                            render: (v) => v || "—"
                          },
                          {
                            title: "Semester",
                            width: 160,
                            ellipsis: true,
                            render: (_, row) => row.semesterName || "—"
                          },
                          {
                            title: "Period",
                            dataIndex: "periodName",
                            width: 160,
                            ellipsis: true,
                            render: (v) => v || "—"
                          },
                          {
                            title: "DSpace status",
                            dataIndex: "dspacePublishStatus",
                            width: 120,
                            render: (s) => {
                              if (s === "published") {
                                return <Tag color="green">published</Tag>;
                              }
                              if (s === "failed") {
                                return <Tag color="red">failed</Tag>;
                              }
                              return <Tag color="gold">pending</Tag>;
                            }
                          },
                          {
                            title: "DSpace item",
                            dataIndex: "dspaceItemId",
                            width: 260,
                            render: (id) => dspaceIdText(id)
                          }
                        ]}
                      />
                    </Space>
                  )
                }
              ]
            : []),
          {
            key: "browse",
            label: "Browse & periods",
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div
                  style={{
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    padding: 12,
                    background: "#fafafa"
                  }}
                >
                  <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }} wrap>
                    <Space wrap>
                      <Text strong>DSpace structure</Text>
                      <Tag>{dspaceSyncNodes.length} nodes</Tag>
                      <Tag color="geekblue">
                        {dspaceSyncNodes.filter((n) => n.type === "community").length} communities
                      </Tag>
                      <Tag color="blue">
                        {dspaceSyncNodes.filter((n) => n.type === "collection").length} collections
                      </Tag>
                    </Space>
                    <Space wrap>
                      <Button
                        size="small"
                        loading={loadingDspaceTree}
                        onClick={() => void loadDspaceSyncNodes()}
                      >
                        Reload tree
                      </Button>
                      <Button
                        size="small"
                        disabled={dspaceTreeData.length === 0}
                        onClick={() =>
                          setDspaceTreeExpandedKeys(collectExpandableKeys(dspaceTreeData))
                        }
                      >
                        Expand all
                      </Button>
                      <Button
                        size="small"
                        disabled={dspaceTreeExpandedKeys.length === 0}
                        onClick={() => setDspaceTreeExpandedKeys([])}
                      >
                        Collapse all
                      </Button>
                    </Space>
                  </Space>
                  {dspaceTreeData.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message="No synced DSpace communities/collections yet"
                      description='Click "Sync from DSpace" to fetch the live tree, then expand/collapse nodes here.'
                    />
                  ) : (
                    <Tree
                      showLine
                      showIcon={false}
                      treeData={dspaceTreeData}
                      expandedKeys={dspaceTreeExpandedKeys}
                      onExpand={(keys) => setDspaceTreeExpandedKeys(keys.map(String))}
                      style={{
                        background: "#fff",
                        padding: 8,
                        borderRadius: 6,
                        maxHeight: 360,
                        overflow: "auto"
                      }}
                    />
                  )}
                </div>
                <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                  <Space wrap>
                    {allowEdit && (
                      <Button type="primary" onClick={openCreateSemesterModal}>
                        Create semester
                      </Button>
                    )}
                    {allowEdit && (
                      <Button onClick={openCreatePeriodModal}>Create period</Button>
                    )}
                  </Space>
                  <Space wrap>
                    <Button
                      size="small"
                      disabled={faculties.length === 0}
                      onClick={() => {
                        const ids = faculties.map((faculty) => faculty.id);
                        setExpandedFacultyKeys(ids);
                        void Promise.all(ids.map((facultyId) => loadFacultyTree(facultyId)));
                      }}
                    >
                      Expand all
                    </Button>
                    <Button
                      size="small"
                      disabled={expandedFacultyKeys.length === 0}
                      onClick={() => setExpandedFacultyKeys([])}
                    >
                      Collapse all
                    </Button>
                  </Space>
                </Space>
                <style>{`
                  .archive-tree-row:hover { background: #f4f9fd; }
                `}</style>
                {loadingFaculties && faculties.length === 0 ? (
                  <Text type="secondary">Loading faculties…</Text>
                ) : faculties.length === 0 ? (
                  <Text type="secondary">No faculties</Text>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {faculties.map((faculty) => {
                      const facultyOpen = expandedFacultyKeys.includes(faculty.id);
                      const node = facultyTree[faculty.id];
                      const semesterRows = node?.semesters || [];
                      const periodRows = node?.periods || [];
                      const openSemesterKeys = expandedSemesterKeys[faculty.id] || [];
                      return (
                        <div
                          key={faculty.id}
                          style={{
                            border: "1px solid #e3ebf5",
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "#fff",
                            boxShadow: "0 1px 2px rgba(19, 45, 101, 0.05)"
                          }}
                        >
                          <ArchiveTreeRow
                            depth={0}
                            expanded={facultyOpen}
                            expandable
                            onToggle={() => toggleFaculty(faculty.id)}
                            icon={<BankOutlined />}
                            title={faculty.name}
                            extra={
                              <>
                                <Tag color={faculty.status === "active" ? "green" : "default"}>
                                  {faculty.status}
                                </Tag>
                                <Text type="secondary">
                                  {countLabel(faculty.semesterCount, "semester", "semesters")}
                                </Text>
                                <Text type="secondary">
                                  {countLabel(faculty.openPeriodCount, "open period", "open periods")}
                                </Text>
                              </>
                            }
                            actions={
                              <Button size="small" onClick={() => void openDetail("faculty", faculty.id)}>
                                Detail
                              </Button>
                            }
                          />
                          {facultyOpen ? (
                            <div style={{ borderTop: "1px solid #e8eef6", background: "#f8fbfe" }}>
                              {node?.loading && semesterRows.length === 0 ? (
                                <div style={{ padding: "12px 16px 12px 52px" }}>
                                  <Text type="secondary">Loading semesters…</Text>
                                </div>
                              ) : semesterRows.length === 0 ? (
                                <div style={{ padding: "12px 16px 12px 52px" }}>
                                  <Text type="secondary">No semesters</Text>
                                </div>
                              ) : (
                                semesterRows.map((semester) => {
                                  const semesterOpen = openSemesterKeys.includes(semester.id);
                                  const semesterPeriods = periodRows.filter(
                                    (period) => period.semesterId === semester.id
                                  );
                                  return (
                                    <div key={semester.id} style={{ borderTop: "1px solid #eef3f8" }}>
                                      <ArchiveTreeRow
                                        depth={1}
                                        expanded={semesterOpen}
                                        expandable
                                        onToggle={() => toggleSemester(faculty.id, semester.id)}
                                        icon={<ReadOutlined />}
                                        title={semester.name}
                                        extra={
                                          <>
                                            <Tag color={semester.status === "active" ? "green" : "default"}>
                                              {semester.status || "—"}
                                            </Tag>
                                            <Text type="secondary">
                                              {countLabel(semester.periodCount, "period", "periods")}
                                            </Text>
                                          </>
                                        }
                                        actions={
                                          <Button
                                            size="small"
                                            onClick={() => void openDetail("semester", semester.id)}
                                          >
                                            Detail
                                          </Button>
                                        }
                                      />
                                      {semesterOpen ? (
                                        <div
                                          style={{
                                            margin: "0 12px 10px 46px",
                                            borderLeft: "2px solid #d5e4f4",
                                            background: "#fff",
                                            borderRadius: "0 8px 8px 0"
                                          }}
                                        >
                                          {semesterPeriods.length === 0 ? (
                                            <div style={{ padding: "10px 14px" }}>
                                              <Text type="secondary">No periods</Text>
                                            </div>
                                          ) : (
                                            semesterPeriods.map((period, index) => (
                                              <ArchiveTreeRow
                                                key={period.id}
                                                depth={2}
                                                stacked
                                                expandable={false}
                                                style={index > 0 ? { borderTop: "1px solid #f0f4f8" } : undefined}
                                                icon={<CalendarOutlined />}
                                                title={period.name}
                                                extra={
                                                  <>
                                                    <Tag color={periodStatusColor(period.status)}>{period.status}</Tag>
                                                    <Text type="secondary">
                                                      {formatTreeDate(period.opensAt)} – {formatTreeDate(period.closesAt)}
                                                    </Text>
                                                    <Text type="secondary">
                                                      {countLabel(period.submissionCount, "submission", "submissions")}
                                                    </Text>
                                                    {period.allowResubmit ? <Tag>Resubmit</Tag> : null}
                                                  </>
                                                }
                                                actions={
                                                  <Space size={6}>
                                                    <Button
                                                      size="small"
                                                      onClick={() => void openDetail("period", period.id)}
                                                    >
                                                      Detail
                                                    </Button>
                                                    {allowEdit &&
                                                    period.status !== "open" &&
                                                    period.status !== "archived" ? (
                                                      <Button
                                                        size="small"
                                                        type="primary"
                                                        loading={actionId === `open-${period.id}`}
                                                        onClick={() => periodAction(period.id, "open", period.facultyId)}
                                                      >
                                                        Open
                                                      </Button>
                                                    ) : null}
                                                    {allowEdit && period.status === "open" ? (
                                                      <Button
                                                        size="small"
                                                        danger
                                                        loading={actionId === `close-${period.id}`}
                                                        onClick={() =>
                                                          periodAction(period.id, "close", period.facultyId)
                                                        }
                                                      >
                                                        Close
                                                      </Button>
                                                    ) : null}
                                                  </Space>
                                                }
                                              />
                                            ))
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Space>
            )
          }
        ]}
      />

      <Modal
        title="Add faculty"
        open={facultyModalOpen}
        onCancel={() => {
          setFacultyModalOpen(false);
          facultyForm.resetFields();
        }}
        onOk={() => facultyForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={facultyForm} layout="vertical" onFinish={submitFaculty}>
          <Form.Item name="name" label="Faculty name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Khoa Cơ khí" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create semester"
        open={semesterModalOpen}
        onCancel={() => {
          setSemesterModalOpen(false);
          semesterForm.resetFields();
        }}
        onOk={() => semesterForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={semesterForm} layout="vertical" onFinish={submitSemester} initialValues={{ forAllFaculties: false }}>
          <Form.Item name="forAllFaculties" valuePropName="checked" style={{ marginBottom: 12 }}>
            <Checkbox
              onChange={(event) => {
                if (event.target.checked) {
                  semesterForm.setFieldValue("facultyId", undefined);
                }
              }}
            >
              Create semester for all faculties
            </Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, current) => prev.forAllFaculties !== current.forAllFaculties}>
            {({ getFieldValue }) =>
              getFieldValue("forAllFaculties") ? (
                <Paragraph type="secondary" style={{ marginTop: 0 }}>
                  The same semester is created for every active faculty.
                </Paragraph>
              ) : (
                <Form.Item
                  name="facultyId"
                  label="Faculty (khoa)"
                  rules={[{ required: true, message: "Chọn khoa" }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Chọn khoa"
                    loading={loadingFaculties}
                    options={faculties.map((faculty) => ({
                      value: faculty.id,
                      label: faculty.name
                    }))}
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="name" label="Semester name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Học kỳ 1 năm 2025" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create period"
        open={periodModalOpen}
        onCancel={() => {
          setPeriodModalOpen(false);
          periodForm.resetFields();
        }}
        onOk={() => periodForm.submit()}
        confirmLoading={saving}
        okText="Create period"
        width={640}
        destroyOnClose
      >
        <Paragraph type="secondary">
          Một khoa có nhiều học kỳ; một học kỳ có thể có nhiều period đang mở. Collection DSpace
          được tạo dưới root community đã cấu hình, nếu có.
        </Paragraph>
        <Form
          form={periodForm}
          layout="vertical"
          onFinish={submitPeriod}
          initialValues={{
            allowResubmit: true,
            openAfterCreate: false,
            range: [dayjs().startOf("day"), dayjs().add(90, "day").endOf("day")]
          }}
        >
          <Form.Item name="facultyId" label="Faculty (khoa)" rules={[{ required: true, message: "Chọn khoa" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn khoa"
              loading={loadingFaculties}
              options={faculties.map((f) => ({
                value: f.id,
                label: f.name
              }))}
              onChange={onConfigFacultyChange}
            />
          </Form.Item>
          <Form.Item
            name="semesterId"
            label="Semester (học kỳ)"
            rules={[{ required: true, message: "Chọn học kỳ" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={configFacultyId ? "Chọn học kỳ" : "Chọn khoa trước"}
              loading={loadingConfigSemesters}
              disabled={!configFacultyId}
              options={configSemesters.map((s) => ({
                value: s.id,
                label: s.name
              }))}
              notFoundContent={loadingConfigSemesters ? "Loading…" : "Không có học kỳ cho khoa này"}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="Period name"
            rules={[{ required: true, min: 3, message: "Nhập tên đợt nộp (≥ 3 ký tự)" }]}
          >
            <Input placeholder="Đợt nộp lưu chiểu HK1/2025" />
          </Form.Item>
          <Form.Item
            name="range"
            label="Thời hạn nộp bài (mở — đóng)"
            rules={[{ required: true, message: "Chọn thời hạn nộp bài" }]}
          >
            <DatePicker.RangePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="allowResubmit" label="Allow resubmit on reject">
            <Select
              options={[
                { value: true, label: "Yes" },
                { value: false, label: "No" }
              ]}
            />
          </Form.Item>
          <Form.Item name="openAfterCreate" valuePropName="checked">
            <Checkbox>Open period immediately after creating</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          detailKind === "faculty"
            ? "Faculty detail"
            : detailKind === "semester"
              ? "Semester detail"
              : detailKind === "period"
                ? "Submission period detail"
                : "Detail"
        }
        open={Boolean(detailKind)}
        onCancel={closeDetail}
        width={720}
        destroyOnClose
        footer={
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button onClick={closeDetail}>Close</Button>
            {detailRecord &&
            ((detailKind === "faculty" && canManageFaculties) ||
              (detailKind === "semester" && canManageFaculties) ||
              (detailKind === "period" && allowEdit)) ? (
              <Space>
                <Button onClick={openEditFromDetail}>Edit</Button>
                <Button
                  danger
                  loading={actionId === `delete-${detailRecord.id}`}
                  onClick={confirmDeleteFromDetail}
                >
                  Delete
                </Button>
              </Space>
            ) : null}
          </Space>
        }
      >
        {detailLoading || !detailRecord ? (
          <Text type="secondary">Loading…</Text>
        ) : (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {detailKind === "faculty" && (
              <>
                <Space size="large" wrap>
                  <Statistic title="Semesters" value={detailRecord.semesterCount ?? 0} />
                  <Statistic title="Submission periods" value={detailRecord.periodCount ?? 0} />
                  <Statistic title="Submissions" value={detailRecord.submissionCount ?? 0} />
                </Space>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Name">{detailRecord.name}</Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={detailRecord.status === "active" ? "green" : "default"}>
                      {detailRecord.status}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
            {detailKind === "semester" && (
              <>
                <Space size="large" wrap>
                  <Statistic title="Submission periods" value={detailRecord.periodCount ?? 0} />
                  <Statistic title="Submissions" value={detailRecord.submissionCount ?? 0} />
                </Space>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Name">{detailRecord.name}</Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={detailRecord.status === "active" ? "green" : "default"}>
                      {detailRecord.status || "—"}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
            {detailKind === "period" && (
              <>
                <Space size="large" wrap>
                  <Statistic title="Submissions" value={detailRecord.submissionCount ?? 0} />
                </Space>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Name">{detailRecord.name}</Descriptions.Item>
                  <Descriptions.Item label="Semester">
                    {detailRecord.semesterName || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={periodStatusColor(detailRecord.status)}>{detailRecord.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Opens">
                    {new Date(detailRecord.opensAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="Closes">
                    {new Date(detailRecord.closesAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="Allow resubmit">
                    {detailRecord.allowResubmit ? "Yes" : "No"}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
          </Space>
        )}
      </Modal>
      <Modal
        title={
          editKind === "faculty"
            ? "Edit faculty"
            : editKind === "semester"
              ? "Edit semester"
              : editKind === "period"
                ? "Edit submission period"
                : "Edit"
        }
        open={Boolean(editKind)}
        onCancel={() => {
          setEditKind(null);
          setEditRecord(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={submitEdit}>
          {editKind === "faculty" && (
            <>
              <Form.Item name="name" label="Faculty name" rules={[{ required: true, min: 2 }]}>
                <Input />
              </Form.Item>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "active", label: "active" },
                    { value: "inactive", label: "inactive" }
                  ]}
                />
              </Form.Item>
            </>
          )}
          {editKind === "semester" && (
            <>
              <Form.Item name="name" label="Display name" rules={[{ required: true, min: 2 }]}>
                <Input />
              </Form.Item>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "active", label: "active" },
                    { value: "inactive", label: "inactive" }
                  ]}
                />
              </Form.Item>
            </>
          )}
          {editKind === "period" && (
            <>
              <Form.Item name="name" label="Period name" rules={[{ required: true, min: 3 }]}>
                <Input />
              </Form.Item>
              <Form.Item name="range" label="Open — close" rules={[{ required: true }]}>
                <DatePicker.RangePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="allowResubmit" label="Allow resubmit on reject">
                <Select
                  options={[
                    { value: true, label: "Yes" },
                    { value: false, label: "No" }
                  ]}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
      <Modal
        title="DSpace sync result"
        open={Boolean(syncResult)}
        onCancel={() => setSyncResult(null)}
        onOk={() => setSyncResult(null)}
        width={900}
        destroyOnClose
      >
        {syncResult ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Text>
              Sync scope:{" "}
              {syncResult.rootCommunityId ? (
                <>
                  configured root <Text code>{syncResult.rootCommunityId}</Text>
                </>
              ) : (
                <Text>all top-level communities</Text>
              )}
            </Text>
            <Alert
              type="success"
              showIcon
              message={`Indexed ${syncResult.stats?.total ?? syncResult.nodes?.length ?? 0} nodes (${
                syncResult.stats?.communities ?? 0
              } communities, ${syncResult.stats?.collections ?? 0} collections)`}
              description="Portal faculty / semester / period structure is unchanged. Expand or collapse the DSpace tree below."
            />
            <Space wrap>
              <Button
                size="small"
                onClick={() =>
                  setDspaceTreeExpandedKeys(collectExpandableKeys(buildDspaceTreeData(syncResult.nodes || [])))
                }
              >
                Expand all
              </Button>
              <Button size="small" onClick={() => setDspaceTreeExpandedKeys([])}>
                Collapse all
              </Button>
            </Space>
            <Tree
              showLine
              treeData={buildDspaceTreeData(syncResult.nodes || [])}
              expandedKeys={dspaceTreeExpandedKeys}
              onExpand={(keys) => setDspaceTreeExpandedKeys(keys.map(String))}
              style={{ maxHeight: 420, overflow: "auto" }}
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
