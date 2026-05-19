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
  Tabs,
  Tag,
  Typography,
  Upload,
  message
} from "antd";
import { InboxOutlined } from "@ant-design/icons";
import AdminPanel from "./AdminPanel.jsx";
import LibraryArchivePanel from "./LibraryArchivePanel.jsx";

const STORAGE_KEY = "thesis_portal_auth";
const BRAND_PRIMARY = "#1488D8";
const BRAND_SECONDARY = "#132d65";
const LOGO_PATH = "/images/01_logobachkhoatoi.png";
const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const THESIS_MAX_FILE_SIZE_MB = 30;
const THESIS_MAX_FILE_SIZE_BYTES = THESIS_MAX_FILE_SIZE_MB * 1024 * 1024;

function studentEmailFromUser(user) {
  if (!user?.username) {
    return "";
  }
  const username = user.username.trim().toLowerCase();
  return username.includes("@") ? username : `${username}@hcmut.edu.vn`;
}

const THESIS_YEAR_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const year = new Date().getFullYear() + 1 - index;
  return { value: String(year), label: String(year) };
});

function isSubmittedStatus(status) {
  return status && status !== "draft";
}

function getReviewDecisions(record) {
  return (Array.isArray(record?.reviews) ? record.reviews : []).map((review) => review.decision);
}

function getStudentSubmissionCapabilities(record) {
  const status = record?.status === "reject" ? "rejected" : record?.status || "";
  const hasReviewerDecision = getReviewDecisions(record).some((decision) => decision && decision !== "pending");

  if (status === "draft") {
    return { canEdit: true, canDelete: true, canRevertToDraft: false, canSubmit: true };
  }
  if (status === "archived") {
    return { canEdit: false, canDelete: false, canRevertToDraft: false, canSubmit: false };
  }
  if (status === "rejected" || status === "approved") {
    return { canEdit: true, canDelete: false, canRevertToDraft: false, canSubmit: true };
  }
  if (status === "reviewing") {
    if (hasReviewerDecision) {
      return { canEdit: false, canDelete: false, canRevertToDraft: false, canSubmit: false };
    }
    return { canEdit: true, canDelete: true, canRevertToDraft: true, canSubmit: false };
  }
  return { canEdit: false, canDelete: false, canRevertToDraft: false, canSubmit: false };
}

function canStudentSubmitThesis(activeSubmission, editingSubmissionId, editingRecord) {
  if (!editingSubmissionId) {
    return !activeSubmission;
  }
  if (activeSubmission && activeSubmission.id !== editingSubmissionId) {
    return false;
  }
  return getStudentSubmissionCapabilities(editingRecord).canSubmit;
}

function validateThesisPdf(file) {
  if (file.type !== "application/pdf") {
    message.error("Thesis file must be PDF");
    return false;
  }
  if (file.size > THESIS_MAX_FILE_SIZE_BYTES) {
    message.error(`Thesis PDF must be at most ${THESIS_MAX_FILE_SIZE_MB} MB`);
    return false;
  }
  return true;
}

function getRoleColor(role) {
  if (role === "admin") {
    return BRAND_SECONDARY;
  }
  if (role === "director") {
    return "#6b4c9a";
  }
  if (role === "library_staff") {
    return "#c45c26";
  }
  if (role === "reviewer") {
    return BRAND_PRIMARY;
  }
  return "#2d9f75";
}

function roleLabel(role) {
  const labels = {
    admin: "Administrator",
    director: "Library director",
    library_staff: "Library staff",
    reviewer: "Reviewer",
    student: "Student"
  };
  return labels[role] || role;
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
  if (status === "draft") {
    return "default";
  }
  if (status === "reviewing") {
    return "gold";
  }
  if (status === "approved") {
    return "green";
  }
  if (status === "archived") {
    return "purple";
  }
  if (status === "rejected" || status === "reject") {
    return "red";
  }
  return "default";
}

function eventLabel(eventType) {
  const labels = {
    submitted: "Submitted",
    draft_saved: "Draft saved",
    draft_updated: "Draft updated",
    resubmitted: "Resubmitted",
    reviewer_approved: "Reviewer approved",
    reviewer_rejected: "Reviewer rejected",
    library_staff_approved: "Library intake approved",
    library_staff_rejected: "Library intake rejected",
    director_archived: "Archived by director",
    director_approved: "Director approved",
    director_rejected: "Director rejected",
    admin_approved: "Admin approved",
    admin_rejected: "Admin rejected",
    status_changed: "Status changed"
  };
  return labels[eventType] || eventType;
}

function eventColor(eventType) {
  if (eventType === "submitted" || eventType === "resubmitted" || eventType === "draft_saved" || eventType === "draft_updated") {
    return "cyan";
  }
  if (
    eventType === "reviewer_approved" ||
    eventType === "library_staff_approved" ||
    eventType === "director_archived" ||
    eventType === "director_approved" ||
    eventType === "admin_approved"
  ) {
    return "green";
  }
  if (
    eventType === "reviewer_rejected" ||
    eventType === "library_staff_rejected" ||
    eventType === "director_rejected" ||
    eventType === "admin_rejected"
  ) {
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
    if (payload.thesisFileReplaced) updates.push("thesis file");
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
  const [auth, setAuth] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSubmittingSubmission, setIsSubmittingSubmission] = useState(false);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [isRevertingSubmission, setIsRevertingSubmission] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [staffSubmissions, setStaffSubmissions] = useState([]);
  const [libraryQueue, setLibraryQueue] = useState([]);
  const [directorQueue, setDirectorQueue] = useState([]);
  const [reviewerOptions, setReviewerOptions] = useState([]);
  const [isLoadingReviewers, setIsLoadingReviewers] = useState(false);
  const [studentOptions, setStudentOptions] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [archiveFaculties, setArchiveFaculties] = useState([]);
  const [archiveSemesters, setArchiveSemesters] = useState([]);
  const [archivePeriods, setArchivePeriods] = useState([]);
  const [isLoadingArchiveFaculties, setIsLoadingArchiveFaculties] = useState(false);
  const [isLoadingArchiveSemesters, setIsLoadingArchiveSemesters] = useState(false);
  const [isLoadingArchivePeriods, setIsLoadingArchivePeriods] = useState(false);
  const [reviewerQueue, setReviewerQueue] = useState([]);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [isLoadingReviewerQueue, setIsLoadingReviewerQueue] = useState(false);
  const [isLoadingLibraryQueue, setIsLoadingLibraryQueue] = useState(false);
  const [isLoadingDirectorQueue, setIsLoadingDirectorQueue] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviewActionLoadingId, setReviewActionLoadingId] = useState(null);
  const [libraryRejectModalOpen, setLibraryRejectModalOpen] = useState(false);
  const [libraryRejectTargetId, setLibraryRejectTargetId] = useState(null);
  const [libraryRejectReason, setLibraryRejectReason] = useState("");
  const [libraryActionLoadingId, setLibraryActionLoadingId] = useState(null);
  const [directorActionLoadingId, setDirectorActionLoadingId] = useState(null);
  const [staffDetailRecord, setStaffDetailRecord] = useState(null);
  const [studentDetailRecord, setStudentDetailRecord] = useState(null);
  const [reviewerDetailRecord, setReviewerDetailRecord] = useState(null);
  const [fileOpenLoadingKey, setFileOpenLoadingKey] = useState(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState(null);
  const [editingSubmissionStatus, setEditingSubmissionStatus] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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
        item.title_vi,
        item.title_en,
        item.student_email,
        item.thesis_advisors,
        item.major,
        item.thesis_year,
        item.author,
        item.advisor,
        item.abstract,
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


  const submissionPeriodId = Form.useWatch("submissionPeriodId", submissionForm);
  const archiveFacultyId = Form.useWatch("archiveFacultyId", submissionForm);
  const archiveSemesterId = Form.useWatch("archiveSemesterId", submissionForm);
  const periodSelected = Boolean(submissionPeriodId);

  const studentActiveSubmission = useMemo(
    () =>
      studentSubmissions.find(
        (item) => isSubmittedStatus(item.status) && item.submitter_id === auth?.user?.id
      ),
    [studentSubmissions, auth?.user?.id]
  );

  const studentDraftSubmissions = useMemo(
    () =>
      studentSubmissions.filter(
        (item) => item.status === "draft" && item.submitter_id === auth?.user?.id
      ),
    [studentSubmissions, auth?.user?.id]
  );

  const editingSubmissionRecord = useMemo(
    () => studentSubmissions.find((item) => item.id === editingSubmissionId) ?? null,
    [studentSubmissions, editingSubmissionId]
  );

  const editingSubmissionCapabilities = useMemo(
    () =>
      editingSubmissionRecord
        ? getStudentSubmissionCapabilities(editingSubmissionRecord)
        : { canEdit: true, canDelete: false, canRevertToDraft: false, canSubmit: !studentActiveSubmission },
    [editingSubmissionRecord, studentActiveSubmission]
  );

  const canSubmitCurrentThesis = useMemo(
    () => canStudentSubmitThesis(studentActiveSubmission, editingSubmissionId, editingSubmissionRecord),
    [studentActiveSubmission, editingSubmissionId, editingSubmissionRecord]
  );

  const submissionColumns = [
    {
      title: "Title (EN)",
      dataIndex: "title_en",
      key: "title_en",
      ellipsis: true,
      render: (_v, record) => record.title_en || record.title || "—"
    },
    {
      title: "Faculty",
      dataIndex: "faculty_name",
      key: "faculty_name",
      ellipsis: true,
      render: (value, record) => value || record.faculty_name || "—"
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
          {getStudentSubmissionCapabilities(record).canEdit ? (
            <Button type="primary" size="small" onClick={() => loadSubmissionIntoForm(record)}>
              Edit
            </Button>
          ) : null}
          {getStudentSubmissionCapabilities(record).canDelete ? (
            <Button danger size="small" onClick={() => void promptDeleteSubmission(record)}>
              Delete
            </Button>
          ) : null}
        </Space>
      )
    }
  ];

  const draftColumns = submissionColumns
    .filter((col) => col.key !== "reviews" && col.key !== "actions")
    .concat([
      {
        title: "Actions",
        key: "draft_actions",
        width: 160,
        render: (_value, record) => (
          <Space>
            <Button type="link" size="small" onClick={() => setStudentDetailRecord(record)}>
              Detail
            </Button>
            {getStudentSubmissionCapabilities(record).canEdit ? (
              <Button type="primary" size="small" onClick={() => loadSubmissionIntoForm(record)}>
                Edit
              </Button>
            ) : null}
            {getStudentSubmissionCapabilities(record).canDelete ? (
              <Button danger size="small" onClick={() => void promptDeleteSubmission(record)}>
                Delete
              </Button>
            ) : null}
          </Space>
        )
      }
    ]);

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
        <Button type="link" size="small" onClick={() => setStaffDetailRecord(record)}>
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

  const buildStageQueueColumns = (loadingId, onApprove, onReject, approveLabel) => [
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
      width: 260,
      render: (_value, record) => (
        <Space>
          <Button type="primary" loading={loadingId === record.id} onClick={() => onApprove(record.id)}>
            {approveLabel}
          </Button>
          <Button danger loading={loadingId === record.id} onClick={() => onReject(record.id)}>
            Reject
          </Button>
        </Space>
      )
    }
  ];

  const loadStaffSubmissions = async () => {
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
      setStaffSubmissions(payload);
    } catch (error) {
      message.error(error.message || "Unable to load all submissions");
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const loadLibraryQueue = async () => {
    setIsLoadingLibraryQueue(true);
    try {
      const response = await fetch("/api/reviews/library-queue", {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load library intake queue");
      }
      setLibraryQueue(payload);
    } catch (error) {
      message.error(error.message || "Unable to load library intake queue");
    } finally {
      setIsLoadingLibraryQueue(false);
    }
  };

  const loadDirectorQueue = async () => {
    setIsLoadingDirectorQueue(true);
    try {
      const response = await fetch("/api/reviews/director-queue", {
        headers: {
          ...authHeaders(auth?.token)
        }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load director archive queue");
      }
      setDirectorQueue(payload);
    } catch (error) {
      message.error(error.message || "Unable to load director archive queue");
    } finally {
      setIsLoadingDirectorQueue(false);
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
    const role = auth?.user?.role;
    if (role === "library_staff" || role === "director") {
      void loadStaffSubmissions();
    }
    if (role === "library_staff") {
      void loadLibraryQueue();
    }
    if (role === "director") {
      void loadDirectorQueue();
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

  const loadArchiveFaculties = async () => {
    setIsLoadingArchiveFaculties(true);
    try {
      const response = await fetch("/api/archive/faculties", {
        headers: { ...authHeaders(auth?.token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load faculties");
      }
      setArchiveFaculties(
        payload.map((item) => ({
          value: item.id,
          label: `${item.name} (${item.code})`
        }))
      );
    } catch (error) {
      message.error(error.message || "Unable to load faculties");
    } finally {
      setIsLoadingArchiveFaculties(false);
    }
  };

  const loadArchiveSemesters = async (facultyId) => {
    if (!facultyId) {
      setArchiveSemesters([]);
      return;
    }
    setIsLoadingArchiveSemesters(true);
    try {
      const response = await fetch(`/api/archive/faculties/${facultyId}/semesters`, {
        headers: { ...authHeaders(auth?.token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load semesters");
      }
      setArchiveSemesters(
        payload.map((item) => ({
          value: item.id,
          label: `${item.name} (${item.code})`
        }))
      );
    } catch (error) {
      message.error(error.message || "Unable to load semesters");
    } finally {
      setIsLoadingArchiveSemesters(false);
    }
  };

  const loadArchivePeriods = async (facultyId, semesterId) => {
    if (!facultyId || !semesterId) {
      setArchivePeriods([]);
      return;
    }
    setIsLoadingArchivePeriods(true);
    try {
      const response = await fetch(
        `/api/archive/submission-periods?facultyId=${encodeURIComponent(facultyId)}&semesterId=${encodeURIComponent(semesterId)}`,
        { headers: { ...authHeaders(auth?.token) } }
      );
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load submission periods");
      }
      setArchivePeriods(payload);
    } catch (error) {
      message.error(error.message || "Unable to load submission periods");
    } finally {
      setIsLoadingArchivePeriods(false);
    }
  };

  const handleArchiveFacultyChange = async (facultyId) => {
    submissionForm.setFieldsValue({
      archiveSemesterId: undefined,
      submissionPeriodId: undefined
    });
    setArchivePeriods([]);
    await loadArchiveSemesters(facultyId);
  };

  const handleArchiveSemesterChange = async (semesterId) => {
    const facultyId = submissionForm.getFieldValue("archiveFacultyId");
    submissionForm.setFieldsValue({
      submissionPeriodId: undefined
    });
    setArchivePeriods([]);
    await loadArchivePeriods(facultyId, semesterId);
  };

  const handleSubmissionPeriodChange = (periodId) => {
    submissionForm.setFieldValue("submissionPeriodId", periodId);
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
      void loadArchiveFaculties();
    }
  }, [auth]);

  useEffect(() => {
    if (auth?.user?.role === "student") {
      submissionForm.setFieldsValue({
        studentId: auth.user.id,
        authorIds: [auth.user.id],
        email: studentEmailFromUser(auth.user),
        thesisYear: String(new Date().getFullYear())
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

  const buildSubmissionFormData = (values, { requireThesisFile = false } = {}) => {
    const formData = new FormData();
    const studentId = auth.user.id;
    const authorIds = Array.isArray(values.authorIds) ? values.authorIds : [];
    const reviewerIds = Array.isArray(values.reviewerIds) ? values.reviewerIds : [];
    if (!authorIds.includes(auth.user.id)) {
      throw new Error("Students must include themselves in the author list");
    }
    formData.append("studentId", studentId);
    formData.append("email", (values.email || studentEmailFromUser(auth.user)).trim());
    if (values.titleVi?.trim()) {
      formData.append("titleVi", values.titleVi.trim());
    }
    if (values.titleEn?.trim()) {
      formData.append("titleEn", values.titleEn.trim());
    }
    if (values.thesisAdvisors?.trim()) {
      formData.append("thesisAdvisors", values.thesisAdvisors.trim());
    }
    if (values.major?.trim()) {
      formData.append("major", values.major.trim());
    }
    if (values.thesisYear) {
      formData.append("thesisYear", String(values.thesisYear).trim());
    }
    if (values.abstract?.trim()) {
      formData.append("abstract", values.abstract.trim());
    }
    formData.append("authorIds", JSON.stringify(authorIds));
    formData.append("reviewerIds", JSON.stringify(reviewerIds));
    if (values.submissionPeriodId) {
      formData.append("submissionPeriodId", values.submissionPeriodId);
    }
    const thesisFile = values.thesisFile?.[0]?.originFileObj;
    if (thesisFile) {
      if (!validateThesisPdf(thesisFile)) {
        return null;
      }
      formData.append("thesisFile", thesisFile);
    } else if (requireThesisFile) {
      throw new Error("Please upload a thesis PDF file");
    }
    return formData;
  };

  const resetSubmissionForm = () => {
    setEditingSubmissionId(null);
    setEditingSubmissionStatus(null);
    submissionForm.resetFields();
    setArchiveSemesters([]);
    setArchivePeriods([]);
    submissionForm.setFieldsValue({
      studentId: auth.user.id,
      authorIds: [auth.user.id],
      email: studentEmailFromUser(auth.user),
      thesisYear: String(new Date().getFullYear())
    });
  };

  const loadSubmissionIntoForm = (record) => {
    setEditingSubmissionId(record.id);
    setEditingSubmissionStatus(record.status);
    const authorIds = Array.isArray(record.author_user_ids) ? record.author_user_ids : [];
    const reviewerIds = Array.isArray(record.reviewer_user_ids) ? record.reviewer_user_ids : [];
    submissionForm.setFieldsValue({
      email: record.student_email || studentEmailFromUser(auth.user),
      titleVi: record.title_vi || "",
      titleEn: record.title_en || record.title || "",
      thesisAdvisors: record.thesis_advisors || "",
      major: record.major || "",
      thesisYear: record.thesis_year || String(new Date().getFullYear()),
      abstract: record.abstract || "",
      authorIds: authorIds.length > 0 ? authorIds : [auth.user.id],
      reviewerIds,
      submissionPeriodId: record.submission_period_id,
      thesisFile: []
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    const status = record.status === "reject" ? "rejected" : record.status;
    message.info(
      status === "rejected" || status === "approved"
        ? "Edit your thesis and submit again for review"
        : status === "reviewing"
          ? "Update your thesis while reviewers have not decided yet"
          : "Continue editing your draft"
    );
  };

  const handleDeleteSubmission = async (submissionId) => {
    setIsDeletingSubmission(true);
    try {
      const response = await fetch(`/api/submissions/${submissionId}`, {
        method: "DELETE",
        headers: { ...authHeaders(auth.token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to delete");
      }
      message.success("Deleted");
      if (editingSubmissionId === submissionId) {
        resetSubmissionForm();
      }
      await loadStudentSubmissions(auth.user.id);
    } catch (error) {
      message.error(error.message || "Failed to delete");
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  const promptDeleteSubmission = (record) => {
    const title = record.title_en || record.title || "this thesis";
    Modal.confirm({
      title: "Delete thesis?",
      content: `Delete "${title}"? This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: () => handleDeleteSubmission(record.id)
    });
  };

  const handleRevertToDraft = async () => {
    if (!editingSubmissionId) {
      return;
    }
    setIsRevertingSubmission(true);
    try {
      const response = await fetch(`/api/submissions/${editingSubmissionId}/revert-to-draft`, {
        method: "POST",
        headers: { ...authHeaders(auth.token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to revert to draft");
      }
      message.success("Reverted to draft");
      setEditingSubmissionStatus("draft");
      await loadStudentSubmissions(auth.user.id);
    } catch (error) {
      message.error(error.message || "Failed to revert to draft");
    } finally {
      setIsRevertingSubmission(false);
    }
  };

  const handleSaveDraft = async (values) => {
    setIsSavingDraft(true);
    try {
      const formData = buildSubmissionFormData(values, { requireThesisFile: false });
      if (!formData) {
        return;
      }
      const url = editingSubmissionId ? `/api/submissions/${editingSubmissionId}` : "/api/submissions/drafts";
      const method = editingSubmissionId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { ...authHeaders(auth.token) },
        body: formData
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to save draft");
      }
      if (!editingSubmissionId && payload?.id) {
        setEditingSubmissionId(payload.id);
        setEditingSubmissionStatus("draft");
      }
      message.success("Draft saved");
      await loadStudentSubmissions(auth.user.id);
    } catch (error) {
      message.error(error.message || "Failed to save draft");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmitThesis = async (values) => {
    setIsSubmittingSubmission(true);
    try {
      if (!canStudentSubmitThesis(studentActiveSubmission, editingSubmissionId, editingSubmissionRecord)) {
        throw new Error(
          editingSubmissionRecord?.status === "reviewing"
            ? "This thesis is already under review. Revert it to draft first if all reviewers are still pending."
            : studentActiveSubmission
              ? "You already have a submitted thesis. Edit that thesis to update and resubmit it."
              : "Unable to submit thesis"
        );
      }
      const formData = buildSubmissionFormData(values, {
        requireThesisFile: !editingSubmissionId
      });
      if (!formData) {
        return;
      }
      if (!values.titleVi?.trim()) {
        throw new Error("Vietnamese thesis title is required");
      }
      if (!values.titleEn?.trim()) {
        throw new Error("English thesis title is required");
      }
      if (!values.thesisAdvisors?.trim()) {
        throw new Error("Advisor(s) is required");
      }
      if (!values.major?.trim()) {
        throw new Error("Major is required");
      }
      if (!values.thesisYear) {
        throw new Error("Year is required");
      }
      if (!values.abstract?.trim()) {
        throw new Error("Abstract is required");
      }
      if (!values.submissionPeriodId) {
        throw new Error("Please select a submission period");
      }
      const reviewerIds = Array.isArray(values.reviewerIds) ? values.reviewerIds : [];
      if (reviewerIds.length === 0) {
        throw new Error("Please select at least one reviewer");
      }

      let response;
      if (editingSubmissionId) {
        response = await fetch(`/api/submissions/${editingSubmissionId}/submit`, {
          method: "POST",
          headers: { ...authHeaders(auth.token) },
          body: formData
        });
      } else {
        if (!values.thesisFile?.[0]?.originFileObj) {
          throw new Error("Please upload a thesis PDF file");
        }
        response = await fetch("/api/submissions", {
          method: "POST",
          headers: { ...authHeaders(auth.token) },
          body: formData
        });
      }
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to submit thesis");
      }

      message.success(
        editingSubmissionStatus === "rejected" || editingSubmissionStatus === "reject"
          ? "Thesis updated and submitted for review"
          : "Thesis submitted successfully"
      );
      resetSubmissionForm();
      await loadStudentSubmissions(auth.user.id);
    } catch (error) {
      message.error(error.message || "Failed to submit thesis");
    } finally {
      setIsSubmittingSubmission(false);
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

  async function submitStageAction(endpoint, submissionId, action, comment, successApproveMsg) {
    const setLoading =
      endpoint === "library-action" ? setLibraryActionLoadingId : setDirectorActionLoadingId;
    setLoading(submissionId);
    try {
      const response = await fetch(`/api/reviews/${endpoint}`, {
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
      message.success(action === "approve" ? successApproveMsg : "Rejected");
      await Promise.all([
        loadStaffSubmissions(),
        endpoint === "library-action" ? loadLibraryQueue() : loadDirectorQueue()
      ]);
    } catch (error) {
      message.error(error.message || "Review action failed");
    } finally {
      setLoading(null);
    }
  }

  const submitLibraryAction = (submissionId, action, comment) =>
    submitStageAction("library-action", submissionId, action, comment, "Passed library intake");

  const submitDirectorArchive = async (submissionId) => {
    setDirectorActionLoadingId(submissionId);
    try {
      const response = await fetch("/api/reviews/director-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(auth.token)
        },
        body: JSON.stringify({ submissionId, action: "archive" })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Archive failed");
      }
      message.success("Submission archived");
      await loadDirectorQueue();
      await loadStaffSubmissions();
    } catch (error) {
      message.error(error.message || "Archive failed");
    } finally {
      setDirectorActionLoadingId(null);
    }
  };

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

  function openLibraryRejectModal(submissionId) {
    setLibraryRejectTargetId(submissionId);
    setLibraryRejectReason("");
    setLibraryRejectModalOpen(true);
  }

  const confirmLibraryReject = async () => {
    if (!libraryRejectTargetId) {
      return;
    }
    if (!libraryRejectReason.trim()) {
      message.error("Please enter a reject reason");
      return;
    }
    setLibraryRejectModalOpen(false);
    await submitLibraryAction(libraryRejectTargetId, "reject", libraryRejectReason.trim());
    setLibraryRejectTargetId(null);
    setLibraryRejectReason("");
  };

  const buildDirectorArchiveColumns = (loadingId, onArchive) => [
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
      width: 140,
      render: (_value, record) => (
        <Button type="primary" loading={loadingId === record.id} onClick={() => onArchive(record.id)}>
          Archive
        </Button>
      )
    }
  ];

  const handleLogout = () => {
    setAuth(null);
    setStudentSubmissions([]);
    setAdminSubmissions([]);
    setAdminQueue([]);
    setStaffDetailRecord(null);
    setStudentDetailRecord(null);
    setReviewerDetailRecord(null);
    setReviewerQueue([]);
    setReviewerSearch("");
    setEditingSubmissionId(null);
    setEditingSubmissionStatus(null);
    localStorage.removeItem(STORAGE_KEY);
    loginForm.resetFields();
    submissionForm.resetFields();
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
                description="student1/student123, reviewer1/review123, library1/library123, director1/director123, admin1/admin123"
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
                    You may save multiple drafts, but only one thesis can be in review at a time. While reviewers are
                    still pending, you may edit, delete, or revert the thesis to draft. After a reviewer or library staff
                    acts, edit and submit again from your submission record.
                  </Paragraph>
                  {studentActiveSubmission && !canSubmitCurrentThesis && !editingSubmissionId ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="You already have a submitted thesis"
                      description="You can keep saving drafts. To send a thesis for review again, use Edit on your submission below."
                    />
                  ) : null}
                  {editingSubmissionId ? (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={
                        editingSubmissionStatus === "rejected" || editingSubmissionStatus === "reject"
                          ? "Editing rejected thesis"
                          : editingSubmissionStatus === "approved"
                            ? "Editing approved thesis"
                            : editingSubmissionStatus === "reviewing"
                              ? "Editing thesis under review"
                              : "Editing draft"
                      }
                      description={
                        editingSubmissionStatus === "rejected" ||
                        editingSubmissionStatus === "reject" ||
                        editingSubmissionStatus === "approved"
                          ? "Update your thesis and submit again for review."
                          : editingSubmissionStatus === "reviewing"
                            ? "Save changes while no reviewer has approved or rejected yet. You may also revert to draft or delete."
                            : "Save your draft or submit when ready."
                      }
                      action={
                        <Button size="small" onClick={resetSubmissionForm}>
                          Cancel edit
                        </Button>
                      }
                    />
                  ) : null}
                  <Divider style={{ margin: "8px 0" }} />
                  <Title level={5} style={{ margin: "0 0 8px" }}>
                    Step 1 — Submission period
                  </Title>
                  <Form layout="vertical" form={submissionForm} autoComplete="off">
                    <Form.Item
                      label="Faculty"
                      name="archiveFacultyId"
                      rules={[{ required: true, message: "Please select a faculty" }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        placeholder="Select faculty"
                        optionFilterProp="label"
                        loading={isLoadingArchiveFaculties}
                        options={archiveFaculties}
                        disabled={Boolean(editingSubmissionId)}
                        onChange={(value) => void handleArchiveFacultyChange(value)}
                        notFoundContent={
                          isLoadingArchiveFaculties ? "Loading..." : "No faculties with open submission periods"
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      label="Semester"
                      name="archiveSemesterId"
                      rules={[{ required: true, message: "Please select a semester" }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        placeholder="Select semester"
                        optionFilterProp="label"
                        loading={isLoadingArchiveSemesters}
                        options={archiveSemesters}
                        disabled={!archiveFacultyId || Boolean(editingSubmissionId)}
                        onChange={(value) => void handleArchiveSemesterChange(value)}
                        notFoundContent={isLoadingArchiveSemesters ? "Loading..." : "Select a faculty first"}
                      />
                    </Form.Item>
                    <Form.Item
                      label="Submission period"
                      name="submissionPeriodId"
                      rules={[{ required: true, message: "Please select a submission period" }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        placeholder="Select open submission period"
                        optionFilterProp="label"
                        loading={isLoadingArchivePeriods}
                        disabled={!archiveSemesterId || Boolean(editingSubmissionId)}
                        onChange={handleSubmissionPeriodChange}
                        options={archivePeriods.map((p) => ({
                          value: p.id,
                          label: `${p.name} (closes ${new Date(p.closesAt).toLocaleDateString()})`
                        }))}
                        notFoundContent={
                          isLoadingArchivePeriods ? "Loading..." : "No open periods for this semester"
                        }
                      />
                    </Form.Item>

                    <Divider style={{ margin: "8px 0" }} />
                    <Title level={5} style={{ margin: "0 0 8px" }}>
                      Step 2 — Thesis details
                    </Title>
                    {!periodSelected ? (
                      <Alert
                        type="info"
                        showIcon
                        message="Complete Step 1"
                        description="Select faculty, semester, and submission period before entering thesis details."
                        style={{ marginBottom: 16 }}
                      />
                    ) : null}
                    <fieldset disabled={!periodSelected} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                    <Form.Item label="Email" name="email">
                      <Input disabled placeholder="username@hcmut.edu.vn" />
                    </Form.Item>
                    <Form.Item
                      label="Thesis title (Vietnamese)"
                      name="titleVi"
                      rules={[{ required: true, message: "Vietnamese title is required" }]}
                    >
                      <Input placeholder="Tên luận văn / luận án (tiếng Việt)" />
                    </Form.Item>
                    <Form.Item
                      label="Thesis title (English)"
                      name="titleEn"
                      rules={[{ required: true, message: "English title is required" }]}
                    >
                      <Input placeholder="Thesis title in English" />
                    </Form.Item>
                    <Form.Item
                      label="Advisor(s)"
                      name="thesisAdvisors"
                      rules={[{ required: true, message: "Advisor(s) is required" }]}
                    >
                      <Input placeholder="e.g. Assoc. Prof. Nguyen Van A; Dr. Tran Van B" />
                    </Form.Item>
                    <Form.Item label="Major" name="major" rules={[{ required: true, message: "Major is required" }]}>
                      <Input placeholder="e.g. Computer Science" />
                    </Form.Item>
                    <Form.Item label="Year" name="thesisYear" rules={[{ required: true, message: "Year is required" }]}>
                      <Select options={THESIS_YEAR_OPTIONS} placeholder="Graduation / submission year" />
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
                      label="Thesis PDF"
                      name="thesisFile"
                      valuePropName="fileList"
                      getValueFromEvent={(event) => event?.fileList || []}
                      rules={[
                        {
                          required: !editingSubmissionId,
                          message: "Please upload thesis PDF"
                        }
                      ]}
                      extra={
                        editingSubmissionId
                          ? "Leave empty to keep the current PDF on file"
                          : undefined
                      }
                    >
                      <Upload.Dragger
                        beforeUpload={(file) => (validateThesisPdf(file) ? false : Upload.LIST_IGNORE)}
                        maxCount={1}
                      >
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Click or drag PDF thesis file here (max {THESIS_MAX_FILE_SIZE_MB} MB)</p>
                      </Upload.Dragger>
                    </Form.Item>

                    <Space wrap>
                      <Button
                        onClick={() => void handleSaveDraft(submissionForm.getFieldsValue())}
                        loading={isSavingDraft}
                        disabled={!periodSelected && !editingSubmissionId}
                      >
                        Save draft
                      </Button>
                      <Button
                        type="primary"
                        onClick={() => submissionForm.validateFields().then(handleSubmitThesis).catch(() => {})}
                        loading={isSubmittingSubmission}
                        disabled={(!periodSelected && !editingSubmissionId) || !canSubmitCurrentThesis}
                      >
                        {editingSubmissionStatus === "rejected" ||
                        editingSubmissionStatus === "reject" ||
                        editingSubmissionStatus === "approved"
                          ? "Submit again"
                          : "Submit thesis"}
                      </Button>
                      {editingSubmissionId && editingSubmissionCapabilities.canRevertToDraft ? (
                        <Button loading={isRevertingSubmission} onClick={() => void handleRevertToDraft()}>
                          Revert to draft
                        </Button>
                      ) : null}
                      {editingSubmissionId && editingSubmissionCapabilities.canDelete ? (
                        <Button
                          danger
                          loading={isDeletingSubmission}
                          onClick={() => editingSubmissionRecord && promptDeleteSubmission(editingSubmissionRecord)}
                        >
                          Delete
                        </Button>
                      ) : null}
                      {editingSubmissionId ? (
                        <Button onClick={resetSubmissionForm}>Cancel edit</Button>
                      ) : (
                        <Button onClick={resetSubmissionForm}>New draft</Button>
                      )}
                    </Space>
                    </fieldset>
                  </Form>

                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>
                      My submission
                    </Title>
                    <Button onClick={() => loadStudentSubmissions(auth.user.id)} loading={isLoadingSubmissions}>
                      Refresh
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={studentActiveSubmission ? [studentActiveSubmission] : []}
                    columns={submissionColumns}
                    loading={isLoadingSubmissions}
                    pagination={false}
                    locale={{ emptyText: "No submitted thesis yet" }}
                    scroll={{ x: 1200 }}
                  />
                  <Divider style={{ margin: "8px 0" }} />
                  <Title level={5} style={{ margin: "0 0 8px" }}>
                    Drafts ({studentDraftSubmissions.length})
                  </Title>
                  <Table
                    rowKey="id"
                    dataSource={studentDraftSubmissions}
                    columns={draftColumns}
                    loading={isLoadingSubmissions}
                    pagination={{ pageSize: 5 }}
                    locale={{ emptyText: "No drafts saved" }}
                    scroll={{ x: 1000 }}
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
                    placeholder="Search by title, author, reviewer list, abstract, submitter..."
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
                <AdminPanel auth={auth} />
              ) : auth.user.role === "library_staff" || auth.user.role === "director" ? (
                <Tabs
                  defaultActiveKey="workflow"
                  items={[
                    {
                      key: "workflow",
                      label: auth.user.role === "director" ? "Approval workflow" : "Intake & submissions",
                      children: (
                <>
                  <Paragraph type="secondary">
                    Workflow: <Tag color="gold">reviewing</Tag> → <Tag color="green">approved</Tag> →{" "}
                    <Tag color="purple">archived</Tag> or <Tag color="red">rejected</Tag>.
                  </Paragraph>
                  {auth.user.role === "library_staff" && (
                    <>
                      <Divider style={{ margin: "8px 0" }} />
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Title level={5} style={{ margin: 0 }}>
                          Library intake queue
                        </Title>
                        <Button onClick={() => loadLibraryQueue()} loading={isLoadingLibraryQueue}>
                          Refresh
                        </Button>
                      </Space>
                      <Table
                        rowKey="id"
                        dataSource={libraryQueue}
                        columns={buildStageQueueColumns(
                          libraryActionLoadingId,
                          (id) => submitLibraryAction(id, "approve"),
                          openLibraryRejectModal,
                          "Approve"
                        )}
                        loading={isLoadingLibraryQueue}
                        pagination={{ pageSize: 5 }}
                        scroll={{ x: 1250 }}
                      />
                    </>
                  )}
                  {auth.user.role === "director" && (
                    <>
                      <Divider style={{ margin: "8px 0" }} />
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Title level={5} style={{ margin: 0 }}>
                          Archive approved submissions
                        </Title>
                        <Button onClick={() => loadDirectorQueue()} loading={isLoadingDirectorQueue}>
                          Refresh
                        </Button>
                      </Space>
                      <Table
                        rowKey="id"
                        dataSource={directorQueue}
                        columns={buildDirectorArchiveColumns(directorActionLoadingId, (id) =>
                          submitDirectorArchive(id)
                        )}
                        loading={isLoadingDirectorQueue}
                        pagination={{ pageSize: 5 }}
                        scroll={{ x: 1250 }}
                      />
                    </>
                  )}
                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>
                      All submissions
                    </Title>
                    <Button
                      onClick={() => {
                        void loadStaffSubmissions();
                        if (auth.user.role === "library_staff") {
                          void loadLibraryQueue();
                        }
                        if (auth.user.role === "director") {
                          void loadDirectorQueue();
                        }
                      }}
                      loading={
                        isLoadingSubmissions || isLoadingLibraryQueue || isLoadingDirectorQueue
                      }
                    >
                      Refresh
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={staffSubmissions}
                    columns={adminSubmissionColumns}
                    loading={isLoadingSubmissions}
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 1400 }}
                  />
                </>
                      )
                    },
                    {
                      key: "archive",
                      label: "Archive configuration",
                      children: (
                        <LibraryArchivePanel
                          auth={auth}
                          readOnly={auth.user.role === "director"}
                          canManage={auth.user.role === "library_staff" || auth.user.role === "admin"}
                        />
                      )
                    }
                  ]}
                />
              ) : (
                <Paragraph type="secondary">Unknown role.</Paragraph>
              )}
            </Space>
          </Card>
        )}
      </Content>
      <Modal
        title={
          studentDetailRecord
            ? `Thesis detail: ${studentDetailRecord.title_en || studentDetailRecord.title}`
            : "Thesis detail"
        }
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
              <Descriptions.Item label="Email">{studentDetailRecord.student_email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Title (Vietnamese)">{studentDetailRecord.title_vi || "—"}</Descriptions.Item>
              <Descriptions.Item label="Title (English)">
                {studentDetailRecord.title_en || studentDetailRecord.title || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Advisor(s)">{studentDetailRecord.thesis_advisors || "—"}</Descriptions.Item>
              <Descriptions.Item label="Major">{studentDetailRecord.major || "—"}</Descriptions.Item>
              <Descriptions.Item label="Year">{studentDetailRecord.thesis_year || "—"}</Descriptions.Item>
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
              <Descriptions.Item label="University">{studentDetailRecord.university_name || "—"}</Descriptions.Item>
              <Descriptions.Item label="Faculty">{studentDetailRecord.faculty_name || "—"}</Descriptions.Item>
              <Descriptions.Item label="Semester">{studentDetailRecord.semester_name || "—"}</Descriptions.Item>
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
              <Descriptions.Item label="Email">{reviewerDetailRecord.student_email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Title (Vietnamese)">{reviewerDetailRecord.title_vi || "—"}</Descriptions.Item>
              <Descriptions.Item label="Title (English)">
                {reviewerDetailRecord.title_en || reviewerDetailRecord.title || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Advisor(s)">{reviewerDetailRecord.thesis_advisors || "—"}</Descriptions.Item>
              <Descriptions.Item label="Major">{reviewerDetailRecord.major || "—"}</Descriptions.Item>
              <Descriptions.Item label="Year">{reviewerDetailRecord.thesis_year || "—"}</Descriptions.Item>
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
        title={staffDetailRecord ? `Thesis: ${staffDetailRecord.title}` : "Thesis detail"}
        open={Boolean(staffDetailRecord)}
        onCancel={() => setStaffDetailRecord(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setStaffDetailRecord(null)}>
            Close
          </Button>
        ]}
        width={800}
        destroyOnClose
      >
        {staffDetailRecord ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Submission ID">
                <Text code copyable>
                  {staffDetailRecord.id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Email">{staffDetailRecord.student_email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Title (Vietnamese)">{staffDetailRecord.title_vi || "—"}</Descriptions.Item>
              <Descriptions.Item label="Title (English)">
                {staffDetailRecord.title_en || staffDetailRecord.title || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Advisor(s)">{staffDetailRecord.thesis_advisors || "—"}</Descriptions.Item>
              <Descriptions.Item label="Major">{staffDetailRecord.major || "—"}</Descriptions.Item>
              <Descriptions.Item label="Year">{staffDetailRecord.thesis_year || "—"}</Descriptions.Item>
              <Descriptions.Item label="Submitter account">
                {staffDetailRecord.submitter || "—"}
                {staffDetailRecord.submitter_username ? (
                  <Text type="secondary">
                    {" "}
                    (@{staffDetailRecord.submitter_username})
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label="Submitter user ID">
                <Text code copyable>
                  {staffDetailRecord.submitter_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Workflow status">
                <Tag
                  color={thesisStatusColor(staffDetailRecord.status)}
                >
                  {staffDetailRecord.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="DSpace item ID">
                {staffDetailRecord.dspace_item_id ? (
                  <Text code copyable>
                    {staffDetailRecord.dspace_item_id}
                  </Text>
                ) : (
                  "—"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Created at">
                {new Date(staffDetailRecord.created_at).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Authors (resolved)">{staffDetailRecord.author || "—"}</Descriptions.Item>
              <Descriptions.Item label="Author user IDs">{formatUuidList(staffDetailRecord.author_user_ids)}</Descriptions.Item>
              <Descriptions.Item label="Author snapshot (stored)">
                {staffDetailRecord.author_snapshot || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Reviewers (resolved)">{staffDetailRecord.advisor || "—"}</Descriptions.Item>
              <Descriptions.Item label="Reviewer user IDs">{formatUuidList(staffDetailRecord.reviewer_user_ids)}</Descriptions.Item>
              <Descriptions.Item label="Reviewer snapshot (stored)">
                {staffDetailRecord.advisor_snapshot || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Abstract">{staffDetailRecord.abstract || "—"}</Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>Files</Title>
              {Array.isArray(staffDetailRecord.files) && staffDetailRecord.files.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {staffDetailRecord.files.map((f) => (
                    <li key={f.id}>
                      <Space wrap align="start">
                        <Text strong style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                          {f.fileName}
                        </Text>
                        <Tag>{f.fileType}</Tag>
                        <Button
                          type="primary"
                          size="small"
                          loading={fileOpenLoadingKey === `${staffDetailRecord.id}:${f.id}`}
                          onClick={() => void openProtectedSubmissionFile(staffDetailRecord.id, f.id)}
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
              {Array.isArray(staffDetailRecord.reviews) && staffDetailRecord.reviews.length > 0 ? (
                <Descriptions bordered size="small" column={1}>
                  {staffDetailRecord.reviews.map((r, idx) => (
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
              {renderWorkflowHistory(staffDetailRecord.workflow_history)}
            </div>
          </Space>
        ) : null}
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
        title="Library intake reject"
        open={libraryRejectModalOpen}
        onOk={confirmLibraryReject}
        onCancel={() => {
          setLibraryRejectModalOpen(false);
          setLibraryRejectTargetId(null);
          setLibraryRejectReason("");
        }}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">Please provide a clear reason for rejection.</Paragraph>
        <TextArea rows={4} value={libraryRejectReason} onChange={(event) => setLibraryRejectReason(event.target.value)} />
      </Modal>
    </Layout>
  );
}

export default App;
