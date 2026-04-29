import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Layout,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message
} from "antd";
import { InboxOutlined } from "@ant-design/icons";

const STORAGE_KEY = "thesis_portal_auth";
const BRAND_PRIMARY = "#1488D8";
const BRAND_SECONDARY = "#132d65";
const LOGO_PATH = "/images/01_logobachkhoatoi.png";
const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const allowedAttachmentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg"
];

function getRoleColor(role) {
  if (role === "admin") {
    return BRAND_SECONDARY;
  }
  if (role === "reviewer") {
    return BRAND_PRIMARY;
  }
  return "#2d9f75";
}

function roleLabel(role) {
  if (role === "admin") {
    return "Administrator";
  }
  if (role === "reviewer") {
    return "Reviewer";
  }
  return "Student";
}

function formatUuidList(value) {
  if (Array.isArray(value) && value.length > 0) {
    return value.join(", ");
  }
  return "—";
}

function reviewDecisionColor(decision) {
  if (decision === "approved") {
    return "green";
  }
  if (decision === "reject" || decision === "rejected") {
    return "red";
  }
  return "default";
}

function thesisStatusColor(status) {
  if (status === "reviewing") {
    return "gold";
  }
  if (status === "approving") {
    return "blue";
  }
  if (status === "approved") {
    return "green";
  }
  if (status === "reject" || status === "rejected") {
    return "red";
  }
  return "default";
}

function eventLabel(eventType) {
  const labels = {
    submitted: "Submitted",
    resubmitted: "Resubmitted",
    reviewer_approved: "Reviewer approved",
    reviewer_rejected: "Reviewer rejected",
    admin_approved: "Admin approved",
    admin_rejected: "Admin rejected",
    status_changed: "Status changed"
  };
  return labels[eventType] || eventType;
}

function eventColor(eventType) {
  if (eventType === "submitted" || eventType === "resubmitted") {
    return "cyan";
  }
  if (eventType === "reviewer_approved" || eventType === "admin_approved") {
    return "green";
  }
  if (eventType === "reviewer_rejected" || eventType === "admin_rejected") {
    return "red";
  }
  if (eventType === "status_changed") {
    return "blue";
  }
  return "default";
}

function formatEventPayload(eventType, payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (eventType === "submitted") {
    const authorCount = Array.isArray(payload.authorIds) ? payload.authorIds.length : 0;
    const reviewerCount = Array.isArray(payload.reviewerIds) ? payload.reviewerIds.length : 0;
    return `Title: "${payload.title || "—"}" • Authors: ${authorCount} • Reviewers: ${reviewerCount}`;
  }

  if (eventType === "resubmitted") {
    const updates = [];
    if (payload.titleUpdated) updates.push("title");
    if (payload.abstractUpdated) updates.push("abstract");
    if (payload.keywordsUpdated) updates.push("keywords");
    if (payload.thesisFileReplaced) updates.push("thesis file");
    if (payload.attachmentsReplaced) updates.push("attachments");
    return updates.length > 0 ? `Updated: ${updates.join(", ")}` : "Resubmitted without tracked field changes";
  }

  if (eventType === "status_changed") {
    return `Status: ${payload.from || "unknown"} -> ${payload.to || "unknown"}${payload.reason ? ` (${payload.reason})` : ""}`;
  }

  if (eventType === "reviewer_rejected" || eventType === "admin_rejected") {
    return payload.comment ? `Reason: ${payload.comment}` : "No reason provided";
  }

  return null;
}

async function parseResponse(response) {
  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    return null;
  }
}

function authHeaders(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}

function App() {
  const [loginForm] = Form.useForm();
  const [submissionForm] = Form.useForm();
  const [resubmitForm] = Form.useForm();
  const [auth, setAuth] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSubmittingSubmission, setIsSubmittingSubmission] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [adminSubmissions, setAdminSubmissions] = useState([]);
  const [adminQueue, setAdminQueue] = useState([]);
  const [reviewerOptions, setReviewerOptions] = useState([]);
  const [isLoadingReviewers, setIsLoadingReviewers] = useState(false);
  const [studentOptions, setStudentOptions] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [reviewerQueue, setReviewerQueue] = useState([]);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [isLoadingReviewerQueue, setIsLoadingReviewerQueue] = useState(false);
  const [isLoadingAdminQueue, setIsLoadingAdminQueue] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviewActionLoadingId, setReviewActionLoadingId] = useState(null);
  const [adminRejectModalOpen, setAdminRejectModalOpen] = useState(false);
  const [adminRejectTargetId, setAdminRejectTargetId] = useState(null);
  const [adminRejectReason, setAdminRejectReason] = useState("");
  const [adminActionLoadingId, setAdminActionLoadingId] = useState(null);
  const [adminDetailRecord, setAdminDetailRecord] = useState(null);
  const [studentDetailRecord, setStudentDetailRecord] = useState(null);
  const [reviewerDetailRecord, setReviewerDetailRecord] = useState(null);
  const [fileOpenLoadingKey, setFileOpenLoadingKey] = useState(null);
  const [resubmitModalOpen, setResubmitModalOpen] = useState(false);
  const [resubmitTarget, setResubmitTarget] = useState(null);
  const [isResubmitting, setIsResubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.token && parsed?.user?.username && parsed?.user?.role) {
        setAuth(parsed);
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const greeting = useMemo(() => {
    if (!auth?.user) {
      return "";
    }
    return `Welcome back, ${auth.user.username}.`;
  }, [auth]);

  const reviewerFiltered = useMemo(() => {
    const q = reviewerSearch.trim().toLowerCase();
    if (!q) {
      return reviewerQueue;
    }
    return reviewerQueue.filter((item) => {
      const text = [
        item.title,
        item.author,
        item.advisor,
        item.abstract,
        item.keywords,
        item.submitter,
        item.submitter_username
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [reviewerQueue, reviewerSearch]);

  const reviewerNeedMyDecision = useMemo(
    () => reviewerFiltered.filter((item) => item.my_decision === "pending"),
    [reviewerFiltered]
  );

  const reviewerApproved = useMemo(
    () => reviewerFiltered.filter((item) => item.my_decision === "approved"),
    [reviewerFiltered]
  );

  const reviewerRejected = useMemo(
    () => reviewerFiltered.filter((item) => item.my_decision === "reject"),
    [reviewerFiltered]
  );


  const submissionColumns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title"
    },
    {
      title: "Authors",
      dataIndex: "author",
      key: "author",
      ellipsis: true
    },
    {
      title: "Reviewers",
      dataIndex: "advisor",
      key: "advisor"
    },
    {
      title: "Keywords",
      dataIndex: "keywords",
      key: "keywords",
      render: (value) => (value ? value.split(",").join(", ") : "-")
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => <Tag color={thesisStatusColor(status)}>{status}</Tag>
    },
    {
      title: "Reviewer Decisions",
      key: "reviews",
      width: 340,
      render: (_value, record) => {
        const reviews = Array.isArray(record.reviews) ? record.reviews : [];
        if (reviews.length === 0) {
          return <Text type="secondary">No reviewer decision yet</Text>;
        }
        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            {reviews.map((review, idx) => (
              <div key={`${review.reviewerId || review.username || idx}-${idx}`}>
                <Text strong>{review.reviewer || review.username || "Reviewer"}</Text>{" "}
                <Tag color={reviewDecisionColor(review.decision)}>{review.decision}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {review.decidedAt ? `at ${new Date(review.decidedAt).toLocaleString()}` : "waiting"}
                </Text>
              </div>
            ))}
          </Space>
        );
      }
    },
    {
      title: "Submitted At",
      dataIndex: "created_at",
      key: "created_at",
      render: (createdAt) => new Date(createdAt).toLocaleString()
    },
    {
      title: "Actions",
      key: "actions",
      width: 220,
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => setStudentDetailRecord(record)}>
            Detail
          </Button>
          {record.status === "reject" ? (
            <Button type="primary" size="small" onClick={() => openResubmitModal(record)}>
              Resubmit
            </Button>
          ) : null}
        </Space>
      )
    }
  ];

  const adminSubmissionColumns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      width: 180
    },
    {
      title: "Submitter",
      key: "submitter",
      ellipsis: true,
      width: 140,
      render: (_v, record) => (
        <span>
          {record.submitter || "—"}
          {record.submitter_username ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {" "}
              ({record.submitter_username})
            </Text>
          ) : null}
        </span>
      )
    },
    {
      title: "Authors",
      dataIndex: "author",
      key: "author",
      ellipsis: true,
      width: 160
    },
    {
      title: "Reviewers",
      dataIndex: "advisor",
      key: "advisor",
      ellipsis: true,
      width: 160
    },
    {
      title: "Keywords",
      dataIndex: "keywords",
      key: "keywords",
      ellipsis: true,
      width: 140,
      render: (value) => (value ? value.split(",").join(", ") : "—")
    },
    {
      title: "Abstract",
      dataIndex: "abstract",
      key: "abstract",
      ellipsis: true,
      width: 200
    },
    {
      title: "DSpace",
      dataIndex: "dspace_item_id",
      key: "dspace_item_id",
      width: 100,
      ellipsis: true,
      render: (v) => (v ? <Text code>{v}</Text> : "—")
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status) => <Tag color={thesisStatusColor(status)}>{status}</Tag>
    },
    {
      title: "Submitted At",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (createdAt) => new Date(createdAt).toLocaleString()
    },
    {
      title: " ",
      key: "detail",
      width: 110,
      fixed: "right",
      render: (_v, record) => (
        <Button type="link" size="small" onClick={() => setAdminDetailRecord(record)}>
          Full detail
        </Button>
      )
    }
  ];

  const openProtectedSubmissionFile = async (submissionId, fileId) => {
    const key = `${submissionId}:${fileId}`;
    setFileOpenLoadingKey(key);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/files/${fileId}/download`, {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new Error(payload?.message || `Unable to open file (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    } catch (error) {
      message.error(error.message || "Unable to open file");
    } finally {
      setFileOpenLoadingKey(null);
    }
  };

  const reviewerQueueColumns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      width: 200,
      ellipsis: true
    },
    {
      title: "Authors",
      dataIndex: "author",
      key: "author",
      width: 200,
      ellipsis: true
    },
    {
      title: "Reviewers (assigned)",
      dataIndex: "advisor",
      key: "advisor",
      width: 200,
      ellipsis: true
    },
    {
      title: "Abstract",
      dataIndex: "abstract",
      key: "abstract",
      ellipsis: true
    },
    {
      title: "Files",
      key: "files",
      width: 220,
      render: (_v, record) => {
        const files = Array.isArray(record.files) ? record.files : [];
        if (files.length === 0) {
          return <Text type="secondary">—</Text>;
        }
        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            {files.map((f) => (
              <Button
                key={f.id}
                type="link"
                size="small"
                style={{
                  padding: 0,
                  height: "auto",
                  textAlign: "left",
                  display: "block",
                  width: "100%",
                  whiteSpace: "normal",
                  lineHeight: 1.25
                }}
                loading={fileOpenLoadingKey === `${record.id}:${f.id}`}
                onClick={() => void openProtectedSubmissionFile(record.id, f.id)}
              >
                <Tag style={{ marginInlineEnd: 4 }}>{f.fileType}</Tag>
                <span style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{f.fileName}</span>
              </Button>
            ))}
          </Space>
        );
      }
    },
    {
      title: "Submitted At",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (createdAt) => new Date(createdAt).toLocaleString()
    },
    {
      title: "Actions",
      key: "actions",
      width: 280,
      render: (_value, record) => {
        const isPendingForMe = record.my_decision === "pending";
        return (
          <Space>
            <Button type="link" size="small" onClick={() => setReviewerDetailRecord(record)}>
              Detail
            </Button>
            {isPendingForMe ? (
              <>
                <Button
                  type="primary"
                  loading={reviewActionLoadingId === record.id}
                  onClick={() => submitReviewAction(record.id, "approve")}
                >
                  Approve
                </Button>
                <Button danger loading={reviewActionLoadingId === record.id} onClick={() => openRejectModal(record.id)}>
                  Reject
                </Button>
              </>
            ) : (
              <Tag color={reviewDecisionColor(record.my_decision)}>{record.my_decision}</Tag>
            )}
          </Space>
        );
      }
    }
  ];

  const adminQueueColumns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      width: 220,
      ellipsis: true
    },
    {
      title: "Authors",
      dataIndex: "author",
      key: "author",
      width: 220,
      ellipsis: true
    },
    {
      title: "Reviewers",
      dataIndex: "advisor",
      key: "advisor",
      width: 220,
      ellipsis: true
    },
    {
      title: "Status",
      dataIndex: "submission_status",
      key: "submission_status",
      width: 120,
      render: (status) => <Tag color={thesisStatusColor(status)}>{status}</Tag>
    },
    {
      title: "Submitted At",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (createdAt) => new Date(createdAt).toLocaleString()
    },
    {
      title: "Actions",
      key: "actions",
      width: 240,
      render: (_value, record) => (
        <Space>
          <Button
            type="primary"
            loading={adminActionLoadingId === record.id}
            onClick={() => submitAdminAction(record.id, "approve")}
          >
            Final approve
          </Button>
          <Button danger loading={adminActionLoadingId === record.id} onClick={() => openAdminRejectModal(record.id)}>
            Reject
          </Button>
        </Space>
      )
    }
  ];

  const loadAdminSubmissions = async () => {
    setIsLoadingSubmissions(true);
    try {
      const response = await fetch("/api/submissions", {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load all submissions");
      }
      setAdminSubmissions(payload);
    } catch (error) {
      message.error(error.message || "Unable to load all submissions");
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const loadAdminQueue = async () => {
    setIsLoadingAdminQueue(true);
    try {
      const response = await fetch("/api/reviews/admin-queue", {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load admin queue");
      }
      setAdminQueue(payload);
    } catch (error) {
      message.error(error.message || "Unable to load admin queue");
    } finally {
      setIsLoadingAdminQueue(false);
    }
  };

  const loadStudentSubmissions = async (studentId) => {
    setIsLoadingSubmissions(true);
    try {
      const response = await fetch(`/api/submissions/student/${studentId}`, {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load submission list");
      }
      setStudentSubmissions(payload);
    } catch (error) {
      message.error(error.message || "Unable to load submission list");
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (auth?.user?.role === "student" && auth?.user?.id) {
      void loadStudentSubmissions(auth.user.id);
    }
    if (auth?.user?.role === "admin") {
      void loadAdminSubmissions();
      void loadAdminQueue();
    }
  }, [auth]);

  const loadReviewerQueue = async () => {
    setIsLoadingReviewerQueue(true);
    try {
      const response = await fetch("/api/reviews/my-queue", {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load reviewer queue");
      }
      setReviewerQueue(payload);
    } catch (error) {
      message.error(error.message || "Unable to load reviewer queue");
    } finally {
      setIsLoadingReviewerQueue(false);
    }
  };

  useEffect(() => {
    if (auth?.user?.role === "reviewer") {
      void loadReviewerQueue();
    }
  }, [auth]);

  const loadReviewers = async () => {
    setIsLoadingReviewers(true);
    try {
      const response = await fetch("/api/users?role=reviewer");
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load reviewer list");
      }
      setReviewerOptions(
        payload.map((item) => ({
          value: item.id,
          label: `${item.displayName || item.username} (${item.username})`
        }))
      );
    } catch (error) {
      message.error(error.message || "Unable to load reviewer list");
    } finally {
      setIsLoadingReviewers(false);
    }
  };

  const loadStudents = async () => {
    setIsLoadingStudents(true);
    try {
      const response = await fetch("/api/users?role=student");
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load student list");
      }
      setStudentOptions(
        payload.map((item) => ({
          value: item.id,
          label: `${item.displayName || item.username} (${item.username})`
        }))
      );
    } catch (error) {
      message.error(error.message || "Unable to load student list");
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (!auth?.user) {
      return;
    }
    if (auth.user.role === "student") {
      void loadReviewers();
      void loadStudents();
    }
  }, [auth]);

  useEffect(() => {
    if (auth?.user?.role === "student") {
      submissionForm.setFieldsValue({
        studentId: auth.user.id,
        authorIds: [auth.user.id]
      });
    }
    if (auth?.user?.role !== "student") {
      submissionForm.setFieldsValue({
        studentId: undefined,
        authorIds: undefined
      });
    }
  }, [auth, submissionForm]);

  const handleLogin = async (values) => {
    setIsLoggingIn(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(values),
        signal: controller.signal
      });

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            (response.status === 401
              ? "Invalid username or password"
              : "Login failed. Please check backend server and API URL.")
        );
      }

      if (!payload?.access_token || !payload?.user) {
        throw new Error("Invalid login response from server");
      }

      const nextAuth = {
        token: payload.access_token,
        user: payload.user
      };
      setAuth(nextAuth);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
      message.success("Login successful");
    } catch (error) {
      if (error.name === "AbortError") {
        message.error("Login timeout. Please check backend server or Docker network.");
      } else {
        message.error(error.message || "Unable to login");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoggingIn(false);
    }
  };

  const handleCreateSubmission = async (values) => {
    setIsSubmittingSubmission(true);
    try {
      const thesisFile = values.thesisFile?.[0]?.originFileObj;
      if (!thesisFile || thesisFile.type !== "application/pdf") {
        throw new Error("Please upload a thesis PDF file");
      }

      const formData = new FormData();
      formData.append("title", values.title.trim());
      formData.append("abstract", values.abstract.trim());
      formData.append("keywords", values.keywords.trim());
      const studentId = auth.user.id;
      const authorIds = Array.isArray(values.authorIds) ? values.authorIds : [];
      const reviewerIds = Array.isArray(values.reviewerIds) ? values.reviewerIds : [];
      if (auth.user.role === "student" && !authorIds.includes(auth.user.id)) {
        throw new Error("Students must include themselves in the author list");
      }
      formData.append("studentId", studentId);
      formData.append("authorIds", JSON.stringify(authorIds));
      formData.append("reviewerIds", JSON.stringify(reviewerIds));
      formData.append("thesisFile", thesisFile);

      for (const item of values.attachments || []) {
        if (item?.originFileObj) {
          formData.append("attachments", item.originFileObj);
        }
      }

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          ...authHeaders(auth.token)
        },
        body: formData
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to submit thesis");
      }

      message.success("Submission created successfully");
      submissionForm.resetFields();
      await loadStudentSubmissions(auth.user.id);
    } catch (error) {
      message.error(error.message || "Failed to submit thesis");
    } finally {
      setIsSubmittingSubmission(false);
    }
  };

  const openResubmitModal = (record) => {
    setResubmitTarget(record);
    resubmitForm.setFieldsValue({
      title: record.title || "",
      abstract: record.abstract || "",
      keywords: record.keywords || ""
    });
    setResubmitModalOpen(true);
  };

  const handleResubmitSubmission = async (values) => {
    if (!resubmitTarget?.id) {
      return;
    }
    setIsResubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", values.title?.trim() || "");
      formData.append("abstract", values.abstract?.trim() || "");
      formData.append("keywords", values.keywords?.trim() || "");

      const thesisFile = values.thesisFile?.[0]?.originFileObj;
      if (thesisFile) {
        if (thesisFile.type !== "application/pdf") {
          throw new Error("Thesis file must be PDF");
        }
        formData.append("thesisFile", thesisFile);
      }

      for (const item of values.attachments || []) {
        if (item?.originFileObj) {
          formData.append("attachments", item.originFileObj);
        }
      }

      const response = await fetch(`/api/submissions/${resubmitTarget.id}/resubmit`, {
        method: "PUT",
        headers: {
          ...authHeaders(auth?.token)
        },
        body: formData
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to resubmit thesis");
      }
      message.success(`Resubmitted successfully. Status moved to ${payload?.status || "reviewing"}.`);
      setResubmitModalOpen(false);
      setResubmitTarget(null);
      resubmitForm.resetFields();
      await loadStudentSubmissions(auth.user.id);
    } catch (error) {
      message.error(error.message || "Failed to resubmit thesis");
    } finally {
      setIsResubmitting(false);
    }
  };

  const submitReviewAction = async (submissionId, action, comment) => {
    setReviewActionLoadingId(submissionId);
    try {
      const response = await fetch("/api/reviews/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(auth.token)
        },
        body: JSON.stringify({
          submissionId,
          action,
          comment
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Review action failed");
      }
      message.success(action === "approve" ? "Approved" : "Rejected");
      await loadReviewerQueue();
    } catch (error) {
      message.error(error.message || "Review action failed");
    } finally {
      setReviewActionLoadingId(null);
    }
  };

  async function submitAdminAction(submissionId, action, comment) {
    setAdminActionLoadingId(submissionId);
    try {
      const response = await fetch("/api/reviews/admin-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(auth.token)
        },
        body: JSON.stringify({
          submissionId,
          action,
          comment
        })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Admin review action failed");
      }
      message.success(action === "approve" ? "Final approve completed" : "Rejected");
      await Promise.all([loadAdminQueue(), loadAdminSubmissions()]);
    } catch (error) {
      message.error(error.message || "Admin review action failed");
    } finally {
      setAdminActionLoadingId(null);
    }
  }

  const openRejectModal = (submissionId) => {
    setRejectTargetId(submissionId);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectTargetId) {
      return;
    }
    if (!rejectReason.trim()) {
      message.error("Please enter a reject reason");
      return;
    }
    setRejectModalOpen(false);
    await submitReviewAction(rejectTargetId, "reject", rejectReason.trim());
    setRejectTargetId(null);
    setRejectReason("");
  };

  function openAdminRejectModal(submissionId) {
    setAdminRejectTargetId(submissionId);
    setAdminRejectReason("");
    setAdminRejectModalOpen(true);
  }

  const confirmAdminReject = async () => {
    if (!adminRejectTargetId) {
      return;
    }
    if (!adminRejectReason.trim()) {
      message.error("Please enter a reject reason");
      return;
    }
    setAdminRejectModalOpen(false);
    await submitAdminAction(adminRejectTargetId, "reject", adminRejectReason.trim());
    setAdminRejectTargetId(null);
    setAdminRejectReason("");
  };

  const handleLogout = () => {
    setAuth(null);
    setStudentSubmissions([]);
    setAdminSubmissions([]);
    setAdminQueue([]);
    setAdminDetailRecord(null);
    setStudentDetailRecord(null);
    setReviewerDetailRecord(null);
    setReviewerQueue([]);
    setReviewerSearch("");
    setResubmitModalOpen(false);
    setResubmitTarget(null);
    localStorage.removeItem(STORAGE_KEY);
    loginForm.resetFields();
    submissionForm.resetFields();
    resubmitForm.resetFields();
    message.info("You have been logged out");
  };

  const renderWorkflowHistory = (history) => {
    if (!Array.isArray(history) || history.length === 0) {
      return <Text type="secondary">No workflow history</Text>;
    }

    return (
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {history.map((item, idx) => {
          const payloadSummary = formatEventPayload(item.eventType, item.payload);
          return (
            <Card
              key={`${item.id || idx}-${idx}`}
              size="small"
              style={{ borderColor: "#d9e7ff", borderRadius: 10, background: "#fafcff" }}
              bodyStyle={{ padding: "10px 12px" }}
            >
              <Space wrap size={8} style={{ width: "100%", justifyContent: "space-between" }}>
                <Space wrap size={8}>
                  <Tag color={eventColor(item.eventType)}>{eventLabel(item.eventType)}</Tag>
                  <Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.actorRole || "unknown"}
                </Text>
              </Space>
              <div>
                <Text strong>{item.actorName || item.actorId || "system"}</Text>
              </div>
              {payloadSummary ? (
                <div style={{ marginTop: 4 }}>
                  <Text>{payloadSummary}</Text>
                </div>
              ) : item.payload ? (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {JSON.stringify(item.payload)}
                  </Text>
                </div>
              ) : null}
            </Card>
          );
        })}
      </Space>
    );
  };

  return (
    <Layout style={{ minHeight: "100vh", background: "#f4f8ff" }}>
      <Header
        style={{
          background: BRAND_SECONDARY,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12
        }}
      >
        <Space align="center" size={12}>
          <img
            src={LOGO_PATH}
            alt="BK TP.HCM logo"
            style={{ width: 85, height: 85, objectFit: "contain", display: "block" }}
          />
          <Title level={4} style={{ color: "#fff", margin: 0, lineHeight: "64px" }}>
            Thesis Deposit Portal
          </Title>
        </Space>
        {auth?.user ? (
          <Space size={12} align="center">
            <div style={{ textAlign: "right", lineHeight: 1.25 }}>
              <Text style={{ color: "#ffffff", display: "block", fontWeight: 600 }}>
                {auth.user.displayName || auth.user.username}
              </Text>
              <Text style={{ color: "#d7e8ff", display: "block", fontSize: 12 }}>@{auth.user.username}</Text>
              <Text style={{ color: "#d7e8ff", display: "block", fontSize: 12 }}>
                user_id: {auth.user.id}
              </Text>
            </div>
            <Button danger onClick={handleLogout}>
              Log out
            </Button>
          </Space>
        ) : null}
      </Header>
      <Content style={{ padding: 24 }}>
        {!auth ? (
          <Card
            title="Login"
            style={{ maxWidth: 560, borderColor: "#d6eaff", boxShadow: "0 6px 18px rgba(3, 3, 145, 0.08)" }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <Alert
                type="info"
                showIcon
                message="Demo credentials"
                description="student1-3/student123, reviewer1-3/review123, admin1/admin123 (seeded in Postgres)"
              />
              <Form form={loginForm} layout="vertical" onFinish={handleLogin} autoComplete="off">
                <Form.Item
                  label="Username"
                  name="username"
                  rules={[{ required: true, message: "Please enter your username" }]}
                >
                  <Input placeholder="student1" />
                </Form.Item>
                <Form.Item
                  label="Password"
                  name="password"
                  rules={[
                    { required: true, message: "Please enter your password" },
                    { min: 6, message: "Password must be at least 6 characters" }
                  ]}
                >
                  <Input.Password placeholder="******" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={isLoggingIn}>
                  Login
                </Button>
              </Form>
            </Space>
          </Card>
        ) : (
          <Card
            title="Dashboard"
            style={{
              width: "100%",
              borderColor: "#d6eaff",
              boxShadow: "0 6px 18px rgba(3, 3, 145, 0.08)"
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <Text>{greeting}</Text>
              <Text>
                Your role: <Tag color={getRoleColor(auth.user.role)}>{roleLabel(auth.user.role)}</Tag>
              </Text>
              {auth.user.role === "student" ? (
                <>
                  <Paragraph type="secondary">
                    Submit thesis metadata and files. The first workflow status is always <Tag color="gold">reviewing</Tag>.
                    Pick authors and reviewers using searchable multi-select lists. If a thesis is <Tag color="red">reject</Tag>,
                    use <Text strong>Resubmit</Text> to edit metadata/files and send it for review again.
                  </Paragraph>
                  <Divider style={{ margin: "8px 0" }} />
                  <Form layout="vertical" form={submissionForm} onFinish={handleCreateSubmission} autoComplete="off">
                    <Form.Item label="Title" name="title" rules={[{ required: true, message: "Title is required" }]}>
                      <Input placeholder="Thesis title" />
                    </Form.Item>
                    <Form.Item
                      label="Authors"
                      name="authorIds"
                      rules={[{ required: true, message: "Please select at least one author" }]}
                    >
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        placeholder="Search and select authors (student accounts)"
                        optionFilterProp="label"
                        loading={isLoadingStudents}
                        options={studentOptions}
                        maxTagCount="responsive"
                        notFoundContent={isLoadingStudents ? "Loading..." : "No students found"}
                      />
                    </Form.Item>
                    <Form.Item
                      label="Reviewers"
                      name="reviewerIds"
                      rules={[{ required: true, message: "Please select at least one reviewer" }]}
                    >
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        placeholder="Search and select reviewers"
                        optionFilterProp="label"
                        loading={isLoadingReviewers}
                        options={reviewerOptions}
                        maxTagCount="responsive"
                        notFoundContent={isLoadingReviewers ? "Loading..." : "No reviewers found"}
                      />
                    </Form.Item>
                    <Form.Item
                      label="Abstract"
                      name="abstract"
                      rules={[{ required: true, message: "Abstract is required" }]}
                    >
                      <TextArea rows={5} placeholder="Summary of your thesis" />
                    </Form.Item>
                    <Form.Item
                      label="Keywords"
                      name="keywords"
                      rules={[{ required: true, message: "Keywords are required" }]}
                    >
                      <Input placeholder="keyword1, keyword2, keyword3" />
                    </Form.Item>

                    <Form.Item
                      label="Thesis PDF"
                      name="thesisFile"
                      valuePropName="fileList"
                      getValueFromEvent={(event) => event?.fileList || []}
                      rules={[{ required: true, message: "Please upload thesis PDF" }]}
                    >
                      <Upload.Dragger
                        beforeUpload={(file) => {
                          const isPdf = file.type === "application/pdf";
                          if (!isPdf) {
                            message.error("Thesis file must be PDF");
                          }
                          return false;
                        }}
                        maxCount={1}
                      >
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Click or drag PDF thesis file here</p>
                      </Upload.Dragger>
                    </Form.Item>

                    <Form.Item
                      label="Attachments (optional)"
                      name="attachments"
                      valuePropName="fileList"
                      getValueFromEvent={(event) => event?.fileList || []}
                    >
                      <Upload
                        multiple
                        beforeUpload={(file) => {
                          const isAllowed = allowedAttachmentTypes.includes(file.type);
                          if (!isAllowed) {
                            message.error("Unsupported attachment format");
                          }
                          return false;
                        }}
                      >
                        <Button>Choose attachments</Button>
                      </Upload>
                    </Form.Item>

                    <Button type="primary" htmlType="submit" loading={isSubmittingSubmission}>
                      Submit Thesis
                    </Button>
                  </Form>

                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>
                      My Submissions
                    </Title>
                    <Button onClick={() => loadStudentSubmissions(auth.user.id)} loading={isLoadingSubmissions}>
                      Refresh
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={studentSubmissions}
                    columns={submissionColumns}
                    loading={isLoadingSubmissions}
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 1200 }}
                  />
                </>
              ) : auth.user.role === "reviewer" ? (
                <>
                  <Paragraph type="secondary">
                    Review all theses where you are assigned as advisor/reviewer. Use search and grouped queues.
                  </Paragraph>
                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>
                      Reviewer Workspace
                    </Title>
                    <Button onClick={() => loadReviewerQueue()} loading={isLoadingReviewerQueue}>
                      Refresh
                    </Button>
                  </Space>
                  <Input
                    allowClear
                    placeholder="Search by title, author, reviewer list, abstract, keywords, submitter..."
                    value={reviewerSearch}
                    onChange={(event) => setReviewerSearch(event.target.value)}
                  />
                  <Title level={5} style={{ margin: "8px 0 0" }}>
                    Need My Review ({reviewerNeedMyDecision.length})
                  </Title>
                  <Table
                    rowKey="id"
                    dataSource={reviewerNeedMyDecision}
                    columns={reviewerQueueColumns}
                    loading={isLoadingReviewerQueue}
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 1320 }}
                  />
                  <Title level={5} style={{ margin: "8px 0 0" }}>
                    I Approved ({reviewerApproved.length})
                  </Title>
                  <Table
                    rowKey="id"
                    dataSource={reviewerApproved}
                    columns={reviewerQueueColumns}
                    loading={isLoadingReviewerQueue}
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 1320 }}
                  />
                  <Title level={5} style={{ margin: "8px 0 0" }}>
                    I Rejected ({reviewerRejected.length})
                  </Title>
                  <Table
                    rowKey="id"
                    dataSource={reviewerRejected}
                    columns={reviewerQueueColumns}
                    loading={isLoadingReviewerQueue}
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 1320 }}
                  />
                </>
              ) : auth.user.role === "admin" ? (
                <>
                  <Paragraph type="secondary">
                    Final review queue uses status <Tag color="blue">approving</Tag>. After decision, thesis becomes
                    <Tag color="green">approved</Tag> or <Tag color="red">reject</Tag>.
                  </Paragraph>
                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>
                      Final Admin Queue
                    </Title>
                    <Button onClick={() => loadAdminQueue()} loading={isLoadingAdminQueue}>
                      Refresh queue
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={adminQueue}
                    columns={adminQueueColumns}
                    loading={isLoadingAdminQueue}
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 1250 }}
                  />
                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>
                      All Submissions
                    </Title>
                    <Button
                      onClick={() => {
                        void loadAdminSubmissions();
                        void loadAdminQueue();
                      }}
                      loading={isLoadingSubmissions || isLoadingAdminQueue}
                    >
                      Refresh
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={adminSubmissions}
                    columns={adminSubmissionColumns}
                    loading={isLoadingSubmissions}
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 1400 }}
                  />
                </>
              ) : (
                <Paragraph type="secondary">Unknown role.</Paragraph>
              )}
            </Space>
          </Card>
        )}
      </Content>
      <Modal
        title={studentDetailRecord ? `Thesis detail: ${studentDetailRecord.title}` : "Thesis detail"}
        open={Boolean(studentDetailRecord)}
        onCancel={() => setStudentDetailRecord(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setStudentDetailRecord(null)}>
            Close
          </Button>
        ]}
        width={820}
        destroyOnClose
      >
        {studentDetailRecord ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Title">{studentDetailRecord.title || "—"}</Descriptions.Item>
              <Descriptions.Item label="Submitter account">
                {studentDetailRecord.submitter || "—"}
                {studentDetailRecord.submitter_username ? (
                  <Text type="secondary">
                    {" "}
                    (@{studentDetailRecord.submitter_username})
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label="Submitter user ID">
                <Text code copyable>
                  {studentDetailRecord.submitter_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Workflow status">
                <Tag color={thesisStatusColor(studentDetailRecord.status)}>{studentDetailRecord.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Created at">
                {new Date(studentDetailRecord.created_at).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Authors (resolved)">{studentDetailRecord.author || "—"}</Descriptions.Item>
              <Descriptions.Item label="Reviewers (resolved)">{studentDetailRecord.advisor || "—"}</Descriptions.Item>
              <Descriptions.Item label="Keywords">
                {studentDetailRecord.keywords ? studentDetailRecord.keywords.split(",").join(", ") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Abstract">{studentDetailRecord.abstract || "—"}</Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>Files</Title>
              {Array.isArray(studentDetailRecord.files) && studentDetailRecord.files.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {studentDetailRecord.files.map((f) => (
                    <li key={f.id}>
                      <Space wrap align="start">
                        <Text strong style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                          {f.fileName}
                        </Text>
                        <Tag>{f.fileType}</Tag>
                        <Button
                          type="primary"
                          size="small"
                          loading={fileOpenLoadingKey === `${studentDetailRecord.id}:${f.id}`}
                          onClick={() => void openProtectedSubmissionFile(studentDetailRecord.id, f.id)}
                        >
                          Open
                        </Button>
                      </Space>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text type="secondary">No files</Text>
              )}
            </div>
            <div>
              <Title level={5}>Workflow History</Title>
              {renderWorkflowHistory(studentDetailRecord.workflow_history)}
            </div>
          </Space>
        ) : null}
      </Modal>
      <Modal
        title={reviewerDetailRecord ? `Thesis detail: ${reviewerDetailRecord.title}` : "Thesis detail"}
        open={Boolean(reviewerDetailRecord)}
        onCancel={() => setReviewerDetailRecord(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setReviewerDetailRecord(null)}>
            Close
          </Button>
        ]}
        width={820}
        destroyOnClose
      >
        {reviewerDetailRecord ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Title">{reviewerDetailRecord.title || "—"}</Descriptions.Item>
              <Descriptions.Item label="Submitter account">
                {reviewerDetailRecord.submitter || "—"}
                {reviewerDetailRecord.submitter_username ? (
                  <Text type="secondary">
                    {" "}
                    (@{reviewerDetailRecord.submitter_username})
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label="Submitter user ID">
                <Text code copyable>
                  {reviewerDetailRecord.submitter_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Workflow status">
                <Tag color={thesisStatusColor(reviewerDetailRecord.submission_status)}>
                  {reviewerDetailRecord.submission_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Created at">
                {new Date(reviewerDetailRecord.created_at).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="My decision">
                <Tag color={reviewDecisionColor(reviewerDetailRecord.my_decision)}>{reviewerDetailRecord.my_decision}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="My decided at">
                {reviewerDetailRecord.my_decided_at ? new Date(reviewerDetailRecord.my_decided_at).toLocaleString() : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="My comment">{reviewerDetailRecord.my_comment || "—"}</Descriptions.Item>
              <Descriptions.Item label="Authors (resolved)">{reviewerDetailRecord.author || "—"}</Descriptions.Item>
              <Descriptions.Item label="Reviewers (resolved)">{reviewerDetailRecord.advisor || "—"}</Descriptions.Item>
              <Descriptions.Item label="Keywords">
                {reviewerDetailRecord.keywords ? reviewerDetailRecord.keywords.split(",").join(", ") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Abstract">{reviewerDetailRecord.abstract || "—"}</Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>Files</Title>
              {Array.isArray(reviewerDetailRecord.files) && reviewerDetailRecord.files.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {reviewerDetailRecord.files.map((f) => (
                    <li key={f.id}>
                      <Space wrap align="start">
                        <Text strong style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                          {f.fileName}
                        </Text>
                        <Tag>{f.fileType}</Tag>
                        <Button
                          type="primary"
                          size="small"
                          loading={fileOpenLoadingKey === `${reviewerDetailRecord.id}:${f.id}`}
                          onClick={() => void openProtectedSubmissionFile(reviewerDetailRecord.id, f.id)}
                        >
                          Open
                        </Button>
                      </Space>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text type="secondary">No files</Text>
              )}
            </div>
          </Space>
        ) : null}
      </Modal>
      <Modal
        title={adminDetailRecord ? `Thesis: ${adminDetailRecord.title}` : "Thesis detail"}
        open={Boolean(adminDetailRecord)}
        onCancel={() => setAdminDetailRecord(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setAdminDetailRecord(null)}>
            Close
          </Button>
        ]}
        width={800}
        destroyOnClose
      >
        {adminDetailRecord ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Submission ID">
                <Text code copyable>
                  {adminDetailRecord.id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Title">{adminDetailRecord.title}</Descriptions.Item>
              <Descriptions.Item label="Submitter account">
                {adminDetailRecord.submitter || "—"}
                {adminDetailRecord.submitter_username ? (
                  <Text type="secondary">
                    {" "}
                    (@{adminDetailRecord.submitter_username})
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label="Submitter user ID">
                <Text code copyable>
                  {adminDetailRecord.submitter_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Workflow status">
                <Tag
                  color={thesisStatusColor(adminDetailRecord.status)}
                >
                  {adminDetailRecord.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="DSpace item ID">
                {adminDetailRecord.dspace_item_id ? (
                  <Text code copyable>
                    {adminDetailRecord.dspace_item_id}
                  </Text>
                ) : (
                  "—"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Created at">
                {new Date(adminDetailRecord.created_at).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Authors (resolved)">{adminDetailRecord.author || "—"}</Descriptions.Item>
              <Descriptions.Item label="Author user IDs">{formatUuidList(adminDetailRecord.author_user_ids)}</Descriptions.Item>
              <Descriptions.Item label="Author snapshot (stored)">
                {adminDetailRecord.author_snapshot || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Reviewers (resolved)">{adminDetailRecord.advisor || "—"}</Descriptions.Item>
              <Descriptions.Item label="Reviewer user IDs">{formatUuidList(adminDetailRecord.reviewer_user_ids)}</Descriptions.Item>
              <Descriptions.Item label="Reviewer snapshot (stored)">
                {adminDetailRecord.advisor_snapshot || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Keywords">
                {adminDetailRecord.keywords ? adminDetailRecord.keywords.split(",").join(", ") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Abstract">{adminDetailRecord.abstract || "—"}</Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>Files</Title>
              {Array.isArray(adminDetailRecord.files) && adminDetailRecord.files.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {adminDetailRecord.files.map((f) => (
                    <li key={f.id}>
                      <Space wrap align="start">
                        <Text strong style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                          {f.fileName}
                        </Text>
                        <Tag>{f.fileType}</Tag>
                        <Button
                          type="primary"
                          size="small"
                          loading={fileOpenLoadingKey === `${adminDetailRecord.id}:${f.id}`}
                          onClick={() => void openProtectedSubmissionFile(adminDetailRecord.id, f.id)}
                        >
                          Open
                        </Button>
                      </Space>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all" }}>
                          {f.fileUrl}
                        </Text>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text type="secondary">No files</Text>
              )}
            </div>
            <div>
              <Title level={5}>Per-reviewer reviews</Title>
              {Array.isArray(adminDetailRecord.reviews) && adminDetailRecord.reviews.length > 0 ? (
                <Descriptions bordered size="small" column={1}>
                  {adminDetailRecord.reviews.map((r, idx) => (
                    <Descriptions.Item
                      key={`${r.reviewerId || r.reviewer_id || idx}-${idx}`}
                      label={
                        <span>
                          {r.reviewer || "—"}{" "}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ({r.username})
                          </Text>
                        </span>
                      }
                    >
                      <Space direction="vertical" size={4} style={{ width: "100%" }}>
                        <Space wrap>
                          <Text type="secondary">decision</Text>
                          <Tag color={reviewDecisionColor(r.decision)}>{r.decision}</Tag>
                          <Text type="secondary">status</Text>
                          <Tag>{r.status}</Tag>
                        </Space>
                        <div>
                          <Text type="secondary">Comment: </Text>
                          {r.comment ? r.comment : "—"}
                        </div>
                        <div>
                          <Text type="secondary">Decided at: </Text>
                          {r.decidedAt ? new Date(r.decidedAt).toLocaleString() : "—"}
                        </div>
                      </Space>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Text type="secondary">No review rows</Text>
              )}
            </div>
            <div>
              <Title level={5}>Workflow History</Title>
              {renderWorkflowHistory(adminDetailRecord.workflow_history)}
            </div>
          </Space>
        ) : null}
      </Modal>
      <Modal
        title={resubmitTarget ? `Resubmit thesis: ${resubmitTarget.title}` : "Resubmit thesis"}
        open={resubmitModalOpen}
        onCancel={() => {
          setResubmitModalOpen(false);
          setResubmitTarget(null);
          resubmitForm.resetFields();
        }}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Form form={resubmitForm} layout="vertical" onFinish={handleResubmitSubmission} autoComplete="off">
          <Form.Item label="Title" name="title" rules={[{ required: true, message: "Title is required" }]}>
            <Input placeholder="Thesis title" />
          </Form.Item>
          <Form.Item label="Abstract" name="abstract" rules={[{ required: true, message: "Abstract is required" }]}>
            <TextArea rows={5} placeholder="Summary of your thesis" />
          </Form.Item>
          <Form.Item label="Keywords" name="keywords" rules={[{ required: true, message: "Keywords are required" }]}>
            <Input placeholder="keyword1, keyword2, keyword3" />
          </Form.Item>
          <Form.Item
            label="Replace Thesis PDF (optional)"
            name="thesisFile"
            valuePropName="fileList"
            getValueFromEvent={(event) => event?.fileList || []}
          >
            <Upload.Dragger
              beforeUpload={(file) => {
                const isPdf = file.type === "application/pdf";
                if (!isPdf) {
                  message.error("Thesis file must be PDF");
                }
                return false;
              }}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Upload a new thesis PDF only if you want to replace the current one</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item
            label="Replace attachments (optional)"
            name="attachments"
            valuePropName="fileList"
            getValueFromEvent={(event) => event?.fileList || []}
          >
            <Upload
              multiple
              beforeUpload={(file) => {
                const isAllowed = allowedAttachmentTypes.includes(file.type);
                if (!isAllowed) {
                  message.error("Unsupported attachment format");
                }
                return false;
              }}
            >
              <Button>Choose new attachments</Button>
            </Upload>
          </Form.Item>
          <Space>
            <Button
              onClick={() => {
                setResubmitModalOpen(false);
                setResubmitTarget(null);
                resubmitForm.resetFields();
              }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={isResubmitting}>
              Resubmit for review
            </Button>
          </Space>
        </Form>
      </Modal>
      <Modal
        title="Reject thesis"
        open={rejectModalOpen}
        onOk={confirmReject}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectTargetId(null);
          setRejectReason("");
        }}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">Please provide a clear reason for rejection.</Paragraph>
        <TextArea rows={4} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
      </Modal>
      <Modal
        title="Admin reject thesis"
        open={adminRejectModalOpen}
        onOk={confirmAdminReject}
        onCancel={() => {
          setAdminRejectModalOpen(false);
          setAdminRejectTargetId(null);
          setAdminRejectReason("");
        }}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">Please provide a clear reason for rejection.</Paragraph>
        <TextArea rows={4} value={adminRejectReason} onChange={(event) => setAdminRejectReason(event.target.value)} />
      </Modal>
    </Layout>
  );
}

export default App;
