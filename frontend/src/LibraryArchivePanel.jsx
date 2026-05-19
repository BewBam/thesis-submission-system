import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from "antd";
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

function syncStatusTag(status) {
  if (status === "synced") {
    return <Tag color="green">synced</Tag>;
  }
  if (status === "failed") {
    return <Tag color="red">failed</Tag>;
  }
  return <Tag color="gold">pending</Tag>;
}

export default function LibraryArchivePanel({ auth, readOnly = false, canManage }) {
  const allowEdit = canManage ?? !readOnly;
  const [faculties, setFaculties] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState(null);
  const [semesters, setSemesters] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loadingFaculties, setLoadingFaculties] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [facultyModalOpen, setFacultyModalOpen] = useState(false);
  const [semesterModalOpen, setSemesterModalOpen] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [facultyForm] = Form.useForm();
  const [semesterForm] = Form.useForm();
  const [periodForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);

  const selectedFaculty = faculties.find((f) => f.id === selectedFacultyId) || null;

  const loadUniversities = useCallback(async () => {
    try {
      const response = await fetch("/api/archive-config/universities", {
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to load universities");
      }
      setUniversities(payload);
    } catch (error) {
      message.error(error.message);
    }
  }, [auth.token]);

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
      setFaculties(payload);
      if (payload.length > 0 && !selectedFacultyId) {
        setSelectedFacultyId(payload[0].id);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoadingFaculties(false);
    }
  }, [auth.token, selectedFacultyId]);

  const loadFacultyDetail = useCallback(
    async (facultyId) => {
      if (!facultyId) {
        return;
      }
      setLoadingDetail(true);
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
        setSemesters(semPayload);
        setPeriods(perPayload);
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoadingDetail(false);
      }
    },
    [auth.token]
  );

  useEffect(() => {
    void loadUniversities();
    void loadFaculties();
  }, [loadUniversities, loadFaculties]);

  useEffect(() => {
    if (selectedFacultyId) {
      void loadFacultyDetail(selectedFacultyId);
    }
  }, [selectedFacultyId, loadFacultyDetail]);

  const submitFaculty = async (values) => {
    setSaving(true);
    try {
      const response = await fetch("/api/archive-config/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({
          universityId: values.universityId,
          code: values.code,
          name: values.name,
          provisionDspace: true
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
      setSelectedFacultyId(payload.id);
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const provisionDspace = async (facultyId) => {
    setActionId(facultyId);
    try {
      const response = await fetch(`/api/archive-config/faculties/${facultyId}/provision-dspace`, {
        method: "POST",
        headers: authHeaders(auth.token)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "DSpace provisioning failed");
      }
      message.success("DSpace community provisioned");
      await loadFaculties();
    } catch (error) {
      message.error(error.message);
    } finally {
      setActionId(null);
    }
  };

  const submitSemester = async (values) => {
    if (!selectedFacultyId) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/archive-config/faculties/${selectedFacultyId}/semesters`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
        body: JSON.stringify({
          code: values.code,
          name: values.name,
          collectionName: values.collectionName || undefined
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to create semester");
      }
      message.success("Semester created with DSpace sub-community and collection");
      setSemesterModalOpen(false);
      semesterForm.resetFields();
      await loadFaculties();
      await loadFacultyDetail(selectedFacultyId);
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const submitPeriod = async (values) => {
    if (!selectedFacultyId) {
      message.warning("Select a faculty first");
      return;
    }
    if (!values.range?.[0] || !values.range?.[1]) {
      message.error("Please choose open and close dates");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/archive-config/faculties/${selectedFacultyId}/submission-periods`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(auth.token) },
          body: JSON.stringify({
            semesterId: values.semesterId,
            name: values.name,
            opensAt: toIsoString(values.range[0]),
            closesAt: toIsoString(values.range[1]),
            allowResubmit: values.allowResubmit !== false
          })
        }
      );
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
        message.success("Submission period created (draft)");
      }
      setPeriodModalOpen(false);
      periodForm.resetFields();
      await loadFaculties();
      await loadFacultyDetail(selectedFacultyId);
    } catch (error) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const openCreatePeriodModal = () => {
    if (!selectedFacultyId) {
      message.warning("Select a faculty from the table first");
      return;
    }
    if (semesters.length === 0) {
      message.info("Add a semester for this faculty before creating a submission period");
      setSemesterModalOpen(true);
      return;
    }
    periodForm.setFieldsValue({
      allowResubmit: true,
      openAfterCreate: false,
      range: [dayjs().startOf("day"), dayjs().add(90, "day").endOf("day")]
    });
    setPeriodModalOpen(true);
  };

  const periodAction = async (periodId, action) => {
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
      if (selectedFacultyId) {
        await loadFacultyDetail(selectedFacultyId);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setActionId(null);
    }
  };

  const facultyColumns = [
    { title: "Code", dataIndex: "code", width: 90 },
    { title: "Name", dataIndex: "name" },
    {
      title: "Status",
      dataIndex: "status",
      width: 90,
      render: (status) => <Tag color={status === "active" ? "green" : "default"}>{status}</Tag>
    },
    {
      title: "DSpace",
      width: 100,
      render: (_, row) => syncStatusTag(row.dspaceSyncStatus)
    },
    { title: "Semesters", dataIndex: "semesterCount", width: 90 },
    { title: "Open periods", dataIndex: "openPeriodCount", width: 110 }
  ];

  const semesterColumns = [
    { title: "Code", dataIndex: "code", width: 100 },
    { title: "Name", dataIndex: "name" },
    { title: "Collection", dataIndex: "collectionName", ellipsis: true },
    {
      title: "DSpace collection",
      dataIndex: "dspaceCollectionId",
      ellipsis: true,
      render: (id) => <Text code style={{ fontSize: 11 }}>{id || "—"}</Text>
    },
    {
      title: "Sync",
      dataIndex: "dspaceSyncStatus",
      width: 90,
      render: (s) => syncStatusTag(s)
    }
  ];

  const periodColumns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Semester",
      render: (_, row) => `${row.semesterCode} — ${row.semesterName}`
    },
    {
      title: "Opens",
      dataIndex: "opensAt",
      width: 160,
      render: (v) => new Date(v).toLocaleString()
    },
    {
      title: "Closes",
      dataIndex: "closesAt",
      width: 160,
      render: (v) => new Date(v).toLocaleString()
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 90,
      render: (status) => <Tag color={periodStatusColor(status)}>{status}</Tag>
    },
    {
      title: "Resubmit",
      dataIndex: "allowResubmit",
      width: 90,
      render: (v) => (v ? "Yes" : "No")
    },
    ...(!allowEdit
      ? []
      : [
          {
            title: "Actions",
            width: 160,
            render: (_, row) => (
              <Space>
                {row.status !== "open" && row.status !== "archived" && (
                  <Button
                    size="small"
                    type="primary"
                    loading={actionId === `open-${row.id}`}
                    onClick={() => periodAction(row.id, "open")}
                  >
                    Open
                  </Button>
                )}
                {row.status === "open" && (
                  <Button
                    size="small"
                    danger
                    loading={actionId === `close-${row.id}`}
                    onClick={() => periodAction(row.id, "close")}
                  >
                    Close
                  </Button>
                )}
              </Space>
            )
          }
        ])
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div>
        <Title level={5} style={{ margin: 0 }}>
          Faculty archive configuration
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Manage faculties, semester sub-communities, collections, and submission periods. DSpace IDs
          are provisioned automatically (dev placeholders when API is not configured).
        </Paragraph>
      </div>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Text type="secondary">
          {allowEdit ? "Create submission periods per faculty and semester" : "Read-only view"}
        </Text>
        <Space>
          <Button onClick={() => loadFaculties()} loading={loadingFaculties}>
            Refresh
          </Button>
          {allowEdit && selectedFacultyId && (
            <Button type="primary" onClick={openCreatePeriodModal}>
              Create period
            </Button>
          )}
          {allowEdit && (
            <Button onClick={() => setFacultyModalOpen(true)}>
              Add faculty
            </Button>
          )}
        </Space>
      </Space>
      <Table
        rowKey="id"
        size="small"
        dataSource={faculties}
        columns={facultyColumns}
        loading={loadingFaculties}
        pagination={{ pageSize: 6 }}
        rowSelection={{
          type: "radio",
          selectedRowKeys: selectedFacultyId ? [selectedFacultyId] : [],
          onChange: (keys) => setSelectedFacultyId(keys[0] || null)
        }}
        onRow={(record) => ({
          onClick: () => setSelectedFacultyId(record.id),
          style: { cursor: "pointer" }
        })}
      />
      {selectedFaculty && (
        <>
          <Divider style={{ margin: "4px 0" }} />
          <Space wrap>
            <Title level={5} style={{ margin: 0 }}>
              {selectedFaculty.name} ({selectedFaculty.code})
            </Title>
            {syncStatusTag(selectedFaculty.dspaceSyncStatus)}
            {selectedFaculty.dspaceCommunityId && (
              <Text type="secondary" code style={{ fontSize: 11 }}>
                {selectedFaculty.dspaceCommunityId}
              </Text>
            )}
            {allowEdit && selectedFaculty.dspaceSyncStatus !== "synced" && (
              <Button
                size="small"
                loading={actionId === selectedFaculty.id}
                onClick={() => provisionDspace(selectedFaculty.id)}
              >
                Provision DSpace
              </Button>
            )}
          </Space>
          <Tabs
            items={[
              {
                key: "semesters",
                label: `Semesters (${semesters.length})`,
                children: (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {allowEdit && (
                      <Button onClick={() => setSemesterModalOpen(true)}>Add semester</Button>
                    )}
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={semesters}
                      columns={semesterColumns}
                      loading={loadingDetail}
                      pagination={false}
                    />
                  </Space>
                )
              },
              {
                key: "periods",
                label: `Submission periods (${periods.length})`,
                children: (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {allowEdit && (
                      <Space direction="vertical" style={{ width: "100%" }}>
                        <Button type="primary" onClick={openCreatePeriodModal}>
                          Create period
                        </Button>
                        {semesters.length === 0 && (
                          <Alert
                            type="info"
                            showIcon
                            message="No semester yet"
                            description="Add a semester for this faculty, then create a submission period."
                          />
                        )}
                      </Space>
                    )}
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={periods}
                      columns={periodColumns}
                      loading={loadingDetail}
                      pagination={{ pageSize: 8 }}
                    />
                  </Space>
                )
              }
            ]}
          />
        </>
      )}
      <Modal
        title="Add faculty"
        open={facultyModalOpen}
        onCancel={() => setFacultyModalOpen(false)}
        onOk={() => facultyForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={facultyForm} layout="vertical" onFinish={submitFaculty}>
          <Form.Item name="universityId" label="University" rules={[{ required: true }]}>
            <Select
              options={universities.map((u) => ({ value: u.id, label: u.name }))}
              placeholder="Select university"
            />
          </Form.Item>
          <Form.Item name="code" label="Faculty code" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="CNTT" />
          </Form.Item>
          <Form.Item name="name" label="Faculty name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Khoa Công nghệ Thông tin" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Add semester"
        open={semesterModalOpen}
        onCancel={() => setSemesterModalOpen(false)}
        onOk={() => semesterForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={semesterForm} layout="vertical" onFinish={submitSemester}>
          <Form.Item name="code" label="Semester code" rules={[{ required: true }]}>
            <Input placeholder="2025-1" />
          </Form.Item>
          <Form.Item name="name" label="Display name" rules={[{ required: true }]}>
            <Input placeholder="Học kỳ 1 — 2025" />
          </Form.Item>
          <Form.Item name="collectionName" label="Collection name (optional)">
            <Input placeholder="Luận văn – 2025-1" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Create submission period"
        open={periodModalOpen}
        onCancel={() => setPeriodModalOpen(false)}
        onOk={() => periodForm.submit()}
        okButtonProps={{ disabled: semesters.length === 0 }}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form
          form={periodForm}
          layout="vertical"
          onFinish={submitPeriod}
          initialValues={{ allowResubmit: true, openAfterCreate: false }}
        >
          {semesters.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Add a semester first"
              description="Close this dialog and use Add semester on the Semesters tab."
              style={{ marginBottom: 16 }}
            />
          ) : (
          <Form.Item name="semesterId" label="Semester" rules={[{ required: true }]}>
            <Select
              placeholder="Select semester"
              options={semesters.map((s) => ({
                value: s.id,
                label: `${s.code} — ${s.name}`
              }))}
            />
          </Form.Item>
          )}
          <Form.Item name="name" label="Period name" rules={[{ required: true, min: 3 }]}>
            <Input placeholder="Đợt nộp lưu chiểu HK1/2025" />
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
          <Form.Item name="openAfterCreate" valuePropName="checked">
            <Checkbox>Open period immediately after creating</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
