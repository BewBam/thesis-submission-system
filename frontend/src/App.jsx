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
  Timeline,
  Typography,
  Upload,
  message
} from "antd";
import { InboxOutlined } from "@ant-design/icons";
import AdminPanel from "./AdminPanel.jsx";
import LibraryArchivePanel from "./LibraryArchivePanel.jsx";
import { translateApiMessage } from "./i18n/api";
import { LanguageSwitch, useI18n } from "./i18n/I18nProvider";
import {
  decisionText,
  documentTypeText,
  fieldDisplayLabel,
  formatDate,
  formatDateTime,
  languageCodeText,
  optionDisplayLabel,
  statusText
} from "./i18n/labels";

const STORAGE_KEY = "thesis_portal_auth";
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

const DEFAULT_PUBLISHER = "Ho Chi Minh City University of Technology";
const LANGUAGE_OPTIONS = [
  { value: "vie", label: "Vietnamese (vie)" },
  { value: "eng", label: "English (eng)" }
];
const DOCUMENT_TYPE_OPTIONS = [
  { value: "Thesis", label: "Thesis" },
  { value: "Dissertation", label: "Dissertation" },
  { value: "Graduation thesis", label: "Graduation thesis" }
];

function foldSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function personOptionLabel(displayName, username) {
  const name = displayName || username || "";
  return username && name !== username ? `${name} (${username})` : name || username;
}

function personOptionFilter(input, option) {
  const query = foldSearchText(input).trim();
  if (!query) {
    return true;
  }
  const haystack = option?.searchText || foldSearchText(option?.label);
  return String(haystack).includes(query);
}

const defaultArchiveMetadata = (year = String(new Date().getFullYear())) => ({
  dateIssued: year,
  publisher: DEFAULT_PUBLISHER,
  documentType: "Thesis",
  language: "vie",
  description: ""
});

function submissionSemesterKey(item) {
  return item?.semester_id || item?.semesterId || item?.semester_name || item?.semesterName || "";
}

function submissionPeriodId(item) {
  return item?.submission_period_id || item?.submissionPeriodId || "";
}

function buildSemesterFilterOptions(items) {
  const map = new Map();
  for (const item of items || []) {
    const value = submissionSemesterKey(item);
    if (!value) {
      continue;
    }
    if (!map.has(value)) {
      map.set(value, { value, label: item.semester_name || item.semesterName || value });
    }
  }
  return [...map.values()];
}

function buildPeriodFilterOptions(items, semesterFilter) {
  const map = new Map();
  for (const item of items || []) {
    if (semesterFilter && submissionSemesterKey(item) !== semesterFilter) {
      continue;
    }
    const value = submissionPeriodId(item);
    if (!value) {
      continue;
    }
    if (!map.has(value)) {
      const faculty = item.faculty_name || item.facultyName;
      map.set(value, {
        value,
        label: `${faculty ? `${faculty} / ` : ""}${item.period_name || item.periodName || value}`
      });
    }
  }
  return [...map.values()];
}

function filterBySearchAndArchive(items, search, semesterFilter, periodFilter) {
  const q = (search || "").trim().toLowerCase();
  return (items || []).filter((item) => {
    if (semesterFilter && submissionSemesterKey(item) !== semesterFilter) {
      return false;
    }
    if (periodFilter && submissionPeriodId(item) !== periodFilter) {
      return false;
    }
    if (!q) {
      return true;
    }
    const text = [
      item.title,
      item.title_vi,
      item.title_en,
      item.student_email,
      item.thesis_advisors,
      item.major,
      item.thesis_year,
      item.author,
      item.reviewer,
      item.abstract,
      item.submitter,
      item.submitter_username,
      item.faculty_name,
      item.semester_name,
      item.period_name,
      item.status,
      item.submission_status
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(q);
  });
}

function isSubmittedStatus(status) {
  return status && status !== "draft";
}

function getReviewDecisions(record) {
  return (Array.isArray(record?.reviews) ? record.reviews : []).map((review) => review.decision);
}

function isSubmissionSubmitter(record, userId) {
  if (!record || !userId) {
    return false;
  }
  return String(record.submitter_id) === String(userId);
}

function isSubmissionCoAuthor(record, userId) {
  if (!record || !userId) {
    return false;
  }
  const authorIds = Array.isArray(record.author_user_ids) ? record.author_user_ids.map(String) : [];
  return authorIds.includes(String(userId));
}

function studentBlocksNewDraftOrSubmit(submissions, userId, excludeSubmissionId) {
  if (!userId) {
    return null;
  }
  const blocking = (submissions || []).find((item) => {
    if (!isSubmittedStatus(item.status)) {
      return false;
    }
    if (excludeSubmissionId && item.id === excludeSubmissionId) {
      return false;
    }
    return isSubmissionSubmitter(item, userId) || isSubmissionCoAuthor(item, userId);
  });
  if (!blocking) {
    return null;
  }
  if (isSubmissionSubmitter(blocking, userId)) {
    return "You already have a submitted thesis. Only the submitter can edit that thesis; you cannot create another draft or submit a second thesis.";
  }
  return "You are listed as a co-author on a submitted thesis. You cannot create a draft, submit another thesis, or edit that submission — only the submitter can.";
}

function getStudentSubmissionCapabilities(record, currentUserId, allSubmissions = []) {
  const status = record?.status === "reject" ? "rejected" : record?.status || "";
  const hasReviewerDecision = getReviewDecisions(record).some((decision) => decision && decision !== "pending");
  const readOnlyCaps = {
    canEdit: false,
    canDelete: false,
    canRevertToDraft: false,
    canSubmit: false
  };

  // Only the submitting student may change the thesis; co-authors use Detail only.
  if (currentUserId && !isSubmissionSubmitter(record, currentUserId)) {
    return readOnlyCaps;
  }

  const submitBlocked = Boolean(studentBlocksNewDraftOrSubmit(allSubmissions, currentUserId, record?.id));

  if (status === "draft") {
    return {
      canEdit: !submitBlocked,
      canDelete: !submitBlocked,
      canRevertToDraft: false,
      canSubmit: !submitBlocked
    };
  }
  if (status === "archived") {
    return readOnlyCaps;
  }
  if (status === "rejected") {
    return {
      canEdit: true,
      canDelete: true,
      canRevertToDraft: false,
      canSubmit: !submitBlocked
    };
  }
  if (status === "approved") {
    return {
      canEdit: true,
      canDelete: false,
      canRevertToDraft: false,
      canSubmit: !submitBlocked
    };
  }
  if (status === "reviewing") {
    if (hasReviewerDecision) {
      return readOnlyCaps;
    }
    return { canEdit: true, canDelete: true, canRevertToDraft: true, canSubmit: false };
  }
  return readOnlyCaps;
}

function canStudentSubmitThesis(allSubmissions, userId, editingSubmissionId, editingRecord) {
  if (editingSubmissionId && editingRecord) {
    return getStudentSubmissionCapabilities(editingRecord, userId, allSubmissions).canSubmit;
  }
  return !studentBlocksNewDraftOrSubmit(allSubmissions, userId, undefined);
}

function canStudentSaveDraft(allSubmissions, userId, editingRecord) {
  if (editingRecord && isSubmissionSubmitter(editingRecord, userId) && editingRecord.status !== "draft") {
    // Editing a submitted thesis uses PATCH, not draft-create rules.
    return getStudentSubmissionCapabilities(editingRecord, userId, allSubmissions).canEdit;
  }
  if (editingRecord?.status === "draft" && isSubmissionSubmitter(editingRecord, userId)) {
    return !studentBlocksNewDraftOrSubmit(allSubmissions, userId, editingRecord.id);
  }
  return !studentBlocksNewDraftOrSubmit(allSubmissions, userId, undefined);
}

function validateThesisPdf(file, t) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  const mimeOk = !type || type === "application/pdf" || type === "application/x-pdf";
  if (!name.endsWith(".pdf") || !mimeOk) {
    message.error(t("Thesis file must be PDF"));
    return false;
  }
  if (file.size > THESIS_MAX_FILE_SIZE_BYTES) {
    message.error(t("Thesis PDF must be at most {{n}} MB", { n: THESIS_MAX_FILE_SIZE_MB }));
    return false;
  }
  return true;
}

/** Map saved submission files to Ant Design Upload fileList (display only; no originFileObj). */
function thesisFileListFromRecord(record) {
  const files = Array.isArray(record?.files) ? record.files : [];
  const thesis = files.find((f) => f.fileType === "thesis" || f.file_type === "thesis") || files[0];
  if (!thesis) {
    return [];
  }
  return [
    {
      uid: String(thesis.id || "existing-thesis"),
      name: thesis.fileName || thesis.file_name || "thesis.pdf",
      status: "done",
      // Marker so save/submit keep the server file unless the user replaces it
      existingFileId: thesis.id
    }
  ];
}

function canStaffDeleteSubmission(role) {
  return role === "admin" || role === "library_staff" || role === "director";
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

function eventLabel(eventType, t) {
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
  const key = labels[eventType];
  return key ? t(key) : eventType;
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

const WORKFLOW_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  reviewing: "Reviewing",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived"
};

const WORKFLOW_REASON_LABELS = {
  all_reviewers_approved: "All reviewers approved",
  reviewer_rejected: "A reviewer rejected the thesis",
  library_staff_approved: "Passed library intake",
  library_staff_rejected: "Library intake rejected",
  director_archived: "Director archived the thesis",
  director_rejected: "Director rejected the thesis",
  student_reverted_to_draft: "Moved back to draft"
};

const WORKFLOW_ROLE_LABELS = {
  student: "Student",
  reviewer: "Reviewer",
  library_staff: "Library staff",
  director: "Director",
  admin: "Admin",
  system: "System"
};

function humanWorkflowStatus(status, t) {
  if (!status) {
    return t("Unknown");
  }
  const key = WORKFLOW_STATUS_LABELS[status];
  return key ? t(key) : String(status).replaceAll("_", " ");
}

function humanWorkflowRole(role, t) {
  if (!role) {
    return t("Unknown");
  }
  const key = WORKFLOW_ROLE_LABELS[role];
  return key ? t(key) : String(role).replaceAll("_", " ");
}

function eventComment(payload) {
  const comment = typeof payload?.comment === "string" ? payload.comment.trim() : "";
  return comment || null;
}

function formatEventPayload(eventType, payload, t) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (eventType === "submitted" || eventType === "draft_saved" || eventType === "draft_updated") {
    const parts = [];
    if (payload.title) {
      parts.push(t("Title: {{title}}", { title: payload.title }));
    }
    if (eventType === "submitted") {
      const authorCount = Array.isArray(payload.authorIds) ? payload.authorIds.length : null;
      const reviewerCount = Array.isArray(payload.reviewerIds) ? payload.reviewerIds.length : null;
      if (authorCount != null) {
        parts.push(t(authorCount === 1 ? "{{count}} author" : "{{count}} authors", { count: authorCount }));
      }
      if (reviewerCount != null) {
        parts.push(
          t(reviewerCount === 1 ? "{{count}} reviewer" : "{{count}} reviewers", { count: reviewerCount })
        );
      }
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  if (eventType === "resubmitted") {
    const updates = [];
    if (payload.titleUpdated) updates.push(t("title"));
    if (payload.abstractUpdated) updates.push(t("abstract"));
    if (payload.thesisFileReplaced) updates.push(t("thesis file"));
    return updates.length > 0
      ? t("Updated: {{fields}}", { fields: updates.join(", ") })
      : t("Resubmitted without tracked field changes");
  }

  if (eventType === "reverted_to_draft") {
    return payload.fromStatus
      ? t("From {{status}}", { status: humanWorkflowStatus(payload.fromStatus, t) })
      : t("Moved back to draft");
  }

  if (eventType === "status_changed") {
    const from = payload.from ? humanWorkflowStatus(payload.from, t) : "";
    const to = payload.to ? humanWorkflowStatus(payload.to, t) : "";
    const reason = payload.reason
      ? t(WORKFLOW_REASON_LABELS[payload.reason] || String(payload.reason).replaceAll("_", " "))
      : "";
    if (from && to && from !== to) {
      return `${from} → ${to}`;
    }
    return reason || (from && to ? `${from} → ${to}` : null);
  }

  if (
    eventType === "reviewer_rejected" ||
    eventType === "library_staff_rejected" ||
    eventType === "director_rejected" ||
    eventType === "admin_rejected"
  ) {
    return eventComment(payload)
      ? t("Reason: {{reason}}", { reason: eventComment(payload) })
      : t("No reason provided");
  }

  return eventComment(payload);
}

function timelineColor(eventType) {
  const color = eventColor(eventType);
  if (color === "green" || color === "red" || color === "blue") {
    return color;
  }
  if (color === "cyan") {
    return "blue";
  }
  return "gray";
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
  const { t, lang } = useI18n();
  const tr = (value) => translateApiMessage(value, t);
  const [loginForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [submissionForm] = Form.useForm();
  const [auth, setAuth] = useState(null);
  const [loginMethod, setLoginMethod] = useState("username");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
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
  const [adminDashTab, setAdminDashTab] = useState("admin");
  const [adminSubmissionModalOpen, setAdminSubmissionModalOpen] = useState(false);
  const [archiveFaculties, setArchiveFaculties] = useState([]);
  const [archiveSemesters, setArchiveSemesters] = useState([]);
  const [archivePeriods, setArchivePeriods] = useState([]);
  const [isLoadingArchiveFaculties, setIsLoadingArchiveFaculties] = useState(false);
  const [isLoadingArchiveSemesters, setIsLoadingArchiveSemesters] = useState(false);
  const [isLoadingArchivePeriods, setIsLoadingArchivePeriods] = useState(false);
  const [reviewerQueue, setReviewerQueue] = useState([]);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [reviewerSemesterFilter, setReviewerSemesterFilter] = useState();
  const [reviewerPeriodFilter, setReviewerPeriodFilter] = useState();
  const [staffSearch, setStaffSearch] = useState("");
  const [staffSemesterFilter, setStaffSemesterFilter] = useState();
  const [staffPeriodFilter, setStaffPeriodFilter] = useState();
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
  const [directorRejectModalOpen, setDirectorRejectModalOpen] = useState(false);
  const [directorRejectTargetId, setDirectorRejectTargetId] = useState(null);
  const [directorRejectReason, setDirectorRejectReason] = useState("");
  const [staffDetailRecord, setStaffDetailRecord] = useState(null);
  const [studentDetailRecord, setStudentDetailRecord] = useState(null);
  const [reviewerDetailRecord, setReviewerDetailRecord] = useState(null);
  const [fileOpenLoadingKey, setFileOpenLoadingKey] = useState(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState(null);
  const [editingSubmissionStatus, setEditingSubmissionStatus] = useState(null);
  const [submissionFormFields, setSubmissionFormFields] = useState([]);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    const accessToken = params.get("access_token");
    if (oauthError || accessToken) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (oauthError) {
      const oauthMessages = {
        domain: t("Only verified @hcmut.edu.vn Google accounts can sign in."),
        not_registered: t("This account has not been created. Ask an administrator to add you to a faculty first."),
        cancelled: t("Google sign-in was cancelled."),
        disabled: t("This account has been disabled."),
        maintenance: t("System is in maintenance mode. Only administrators can sign in."),
        oauth: t("Google sign-in failed. Please try again.")
      };
      message.error(oauthMessages[oauthError] || t("Google sign-in failed. Please try again."));
    }

    const finishGoogleSession = async (token) => {
      try {
        const response = await fetch("/api/auth/me", {
          headers: authHeaders(token)
        });
        const user = await parseResponse(response);
        if (!response.ok || !user?.username || !user?.role) {
          throw new Error(user?.message || "Unable to complete Google sign-in");
        }
        const nextAuth = { token, user };
        setAuth(nextAuth);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
        message.success(t("Login successful"));
      } catch (error) {
        message.error(tr(error.message || "Unable to complete Google sign-in"));
      }
    };

    if (accessToken) {
      void finishGoogleSession(accessToken);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.token && parsed?.user?.username && parsed?.user?.role) {
        setAuth(parsed);
        void fetch("/api/auth/me", { headers: authHeaders(parsed.token) })
          .then((response) => parseResponse(response).then((user) => ({ ok: response.ok, user })))
          .then(({ ok, user }) => {
            if (!ok || !user?.username || !user?.role) {
              return;
            }
            const nextAuth = { token: parsed.token, user };
            setAuth(nextAuth);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
          })
          .catch(() => undefined);
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const loadLoginOptions = async () => {
      try {
        const response = await fetch("/api/auth/login-options");
        const payload = await parseResponse(response);
        if (response.ok && (payload?.method === "google" || payload?.method === "username")) {
          setLoginMethod(payload.method);
        }
      } catch (_error) {
        setLoginMethod("username");
      }
    };
    void loadLoginOptions();
  }, []);

  const greeting = useMemo(() => {
    if (!auth?.user) {
      return "";
    }
    return t("Welcome back, {{name}}.", { name: auth.user.username });
  }, [auth, t]);

  const reviewerFiltered = useMemo(
    () => filterBySearchAndArchive(reviewerQueue, reviewerSearch, reviewerSemesterFilter, reviewerPeriodFilter),
    [reviewerQueue, reviewerSearch, reviewerSemesterFilter, reviewerPeriodFilter]
  );

  const staffFilterSource = useMemo(() => {
    const byId = new Map();
    for (const item of [...staffSubmissions, ...libraryQueue, ...directorQueue]) {
      if (item?.id && !byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    return [...byId.values()];
  }, [staffSubmissions, libraryQueue, directorQueue]);

  const staffFilteredSubmissions = useMemo(
    () => filterBySearchAndArchive(staffSubmissions, staffSearch, staffSemesterFilter, staffPeriodFilter),
    [staffSubmissions, staffSearch, staffSemesterFilter, staffPeriodFilter]
  );

  const libraryFilteredQueue = useMemo(
    () => filterBySearchAndArchive(libraryQueue, staffSearch, staffSemesterFilter, staffPeriodFilter),
    [libraryQueue, staffSearch, staffSemesterFilter, staffPeriodFilter]
  );

  const directorFilteredQueue = useMemo(
    () => filterBySearchAndArchive(directorQueue, staffSearch, staffSemesterFilter, staffPeriodFilter),
    [directorQueue, staffSearch, staffSemesterFilter, staffPeriodFilter]
  );

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
  const watchedStudentId = Form.useWatch("studentId", submissionForm);
  const isAdminActor = auth?.user?.role === "admin";
  const facultySelectOptions = useMemo(() => {
    const locked = isAdminActor
      ? studentOptions.find((item) => item.value === watchedStudentId)
      : auth?.user?.facultyId
        ? { facultyId: auth.user.facultyId, facultyName: auth.user.facultyName }
        : null;
    if (!locked?.facultyId) {
      return archiveFaculties;
    }
    if (archiveFaculties.some((item) => item.value === locked.facultyId)) {
      return archiveFaculties;
    }
    return [{ value: locked.facultyId, label: locked.facultyName || locked.facultyId }, ...archiveFaculties];
  }, [archiveFaculties, auth?.user?.facultyId, auth?.user?.facultyName, isAdminActor, studentOptions, watchedStudentId]);
  const actingStudentId = isAdminActor ? watchedStudentId : auth?.user?.id;

  const configurableFormFields = useMemo(
    () =>
      (Array.isArray(submissionFormFields) ? submissionFormFields : []).filter(
        (field) => field.fieldKey !== "author" && field.fieldKey !== "title"
      ),
    [submissionFormFields]
  );

  const loadSubmissionFormFields = async (token) => {
    try {
      const response = await fetch("/api/submissions/form-fields", {
        headers: { ...authHeaders(token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        return [];
      }
      setSubmissionFormFields(payload);
      return payload;
    } catch {
      return [];
    }
  };

  const applyFormFieldDefaults = (fields, currentValues = {}) => {
    const patch = {};
    for (const field of fields || []) {
      if (field.fieldKey === "author" || field.fieldKey === "title") {
        continue;
      }
      if (currentValues[field.fieldKey] != null && String(currentValues[field.fieldKey]).trim() !== "") {
        continue;
      }
      if (field.defaultValue) {
        patch[field.fieldKey] = field.defaultValue;
      }
    }
    if (Object.keys(patch).length > 0) {
      submissionForm.setFieldsValue(patch);
    }
  };
  const periodSelected = Boolean(submissionPeriodId);

  const studentActiveSubmission = useMemo(
    () =>
      studentSubmissions.find(
        (item) => isSubmittedStatus(item.status) && isSubmissionSubmitter(item, actingStudentId)
      ),
    [studentSubmissions, actingStudentId]
  );

  const studentOwnDraft = useMemo(
    () =>
      studentSubmissions.find(
        (item) => item.status === "draft" && isSubmissionSubmitter(item, actingStudentId)
      ) ?? null,
    [studentSubmissions, actingStudentId]
  );

  /** Submitted thesis the student should see as details (own first, otherwise co-authored). */
  const studentPrimarySubmitted = useMemo(() => {
    if (studentActiveSubmission) {
      return studentActiveSubmission;
    }
    return (
      (studentSubmissions || []).find(
        (item) => isSubmittedStatus(item.status) && isSubmissionCoAuthor(item, actingStudentId)
      ) ?? null
    );
  }, [studentActiveSubmission, studentSubmissions, actingStudentId]);

  const editingSubmissionRecord = useMemo(
    () =>
      studentSubmissions.find((item) => item.id === editingSubmissionId) ??
      staffSubmissions.find((item) => item.id === editingSubmissionId) ??
      null,
    [studentSubmissions, staffSubmissions, editingSubmissionId]
  );

  const isFormReadOnly = useMemo(() => {
    if (isAdminActor) {
      return false;
    }
    if (!editingSubmissionRecord || !auth?.user?.id) {
      return false;
    }
    return !isSubmissionSubmitter(editingSubmissionRecord, auth.user.id);
  }, [isAdminActor, editingSubmissionRecord, auth?.user?.id]);

  const canChangeSubmissionPeriod = useMemo(() => {
    if (isFormReadOnly) {
      return false;
    }
    // Draft: allow changing period. Submitted theses keep period locked.
    if (!editingSubmissionId) {
      return true;
    }
    return editingSubmissionStatus === "draft";
  }, [isFormReadOnly, editingSubmissionId, editingSubmissionStatus]);

  const editingSubmissionCapabilities = useMemo(
    () =>
      editingSubmissionRecord
        ? getStudentSubmissionCapabilities(editingSubmissionRecord, actingStudentId, studentSubmissions)
        : {
            canEdit: Boolean(actingStudentId),
            canDelete: false,
            canRevertToDraft: false,
            canSubmit:
              Boolean(actingStudentId) &&
              canStudentSubmitThesis(studentSubmissions, actingStudentId, null, null)
          },
    [editingSubmissionRecord, studentSubmissions, actingStudentId]
  );

  const canSubmitCurrentThesis = useMemo(
    () =>
      Boolean(actingStudentId) &&
      canStudentSubmitThesis(
        studentSubmissions,
        actingStudentId,
        editingSubmissionId,
        editingSubmissionRecord
      ),
    [studentSubmissions, actingStudentId, editingSubmissionId, editingSubmissionRecord]
  );

  const canSaveCurrentDraft = useMemo(
    () =>
      Boolean(actingStudentId) &&
      canStudentSaveDraft(studentSubmissions, actingStudentId, editingSubmissionRecord),
    [studentSubmissions, actingStudentId, editingSubmissionRecord]
  );

  const submitBlockMessage = useMemo(() => {
    if (!actingStudentId) {
      return isAdminActor ? "Select a student to create or submit a thesis on their behalf." : null;
    }
    const excludeId =
      editingSubmissionRecord && isSubmissionSubmitter(editingSubmissionRecord, actingStudentId)
        ? editingSubmissionId
        : undefined;
    return studentBlocksNewDraftOrSubmit(studentSubmissions, actingStudentId, excludeId);
  }, [isAdminActor, studentSubmissions, actingStudentId, editingSubmissionId, editingSubmissionRecord]);

  const submissionColumns = [
    {
      title: t("Title (EN)"),
      dataIndex: "title_en",
      key: "title_en",
      ellipsis: true,
      render: (_v, record) => record.title_en || record.title || "—"
    },
    {
      title: t("Faculty"),
      dataIndex: "faculty_name",
      key: "faculty_name",
      ellipsis: true,
      render: (value, record) => value || record.faculty_name || "—"
    },
    {
      title: t("Authors"),
      dataIndex: "author",
      key: "author",
      ellipsis: true
    },
    {
      title: t("Reviewers"),
      dataIndex: "reviewer",
      key: "reviewer"
    },
    {
      title: t("Status"),
      dataIndex: "status",
      key: "status",
      render: (status) => <Tag color={thesisStatusColor(status)}>{statusText(status, t)}</Tag>
    },
    {
      title: t("Reviewer Decisions"),
      key: "reviews",
      width: 340,
      render: (_value, record) => {
        const reviews = Array.isArray(record.reviews) ? record.reviews : [];
        if (reviews.length === 0) {
          return <Text type="secondary">{t("No reviewer decision yet")}</Text>;
        }
        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            {reviews.map((review, idx) => (
              <div key={`${review.reviewerId || review.username || idx}-${idx}`}>
                <Text strong>{review.reviewer || review.username || t("Reviewer")}</Text>{" "}
                <Tag color={reviewDecisionColor(review.decision)}>{decisionText(review.decision, t)}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {review.decidedAt ? t("at {{time}}", { time: formatDateTime(review.decidedAt, lang) }) : t("waiting")}
                </Text>
              </div>
            ))}
          </Space>
        );
      }
    },
    {
      title: t("Submitted At"),
      dataIndex: "created_at",
      key: "created_at",
      render: (createdAt) => formatDateTime(createdAt, lang)
    },
    {
      title: t("Actions"),
      key: "actions",
      width: 180,
      render: (_value, record) => {
        const caps = getStudentSubmissionCapabilities(record, actingStudentId, studentSubmissions);
        return (
          <Space size={0}>
            {isAdminActor || caps.canEdit ? (
              <Button type="link" size="small" onClick={() => void loadSubmissionIntoForm(record)}>{t("Edit")}</Button>
            ) : null}
            {caps.canDelete ? (
              <Button
                type="link"
                size="small"
                danger
                onClick={() => promptDeleteSubmission(record)}
              >{t("Delete")}</Button>
            ) : null}
            <Button type="link" size="small" onClick={() => setStudentDetailRecord(record)}>{t("Detail")}</Button>
          </Space>
        );
      }
    }
  ];

  const adminSubmissionColumns = [
    {
      title: t("Title"),
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      width: 180
    },
    {
      title: t("Submitter"),
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
      title: t("Authors"),
      dataIndex: "author",
      key: "author",
      ellipsis: true,
      width: 160
    },
    {
      title: t("Reviewers"),
      dataIndex: "reviewer",
      key: "reviewer",
      ellipsis: true,
      width: 160
    },
    {
      title: t("Abstract"),
      dataIndex: "abstract",
      key: "abstract",
      ellipsis: true,
      width: 200
    },
    {
      title: t("DSpace"),
      dataIndex: "dspace_item_id",
      key: "dspace_item_id",
      width: 100,
      ellipsis: true,
      render: (v) => (v ? <Text code>{v}</Text> : "—")
    },
    {
      title: t("Status"),
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status) => <Tag color={thesisStatusColor(status)}>{statusText(status, t)}</Tag>
    },
    {
      title: t("Submitted At"),
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (createdAt) => formatDateTime(createdAt, lang)
    },
    {
      title: " ",
      key: "detail",
      width: 110,
      fixed: "right",
      render: (_v, record) => (
        <Space size={0}>
          {isAdminActor ? (
            <Button type="link" size="small" onClick={() => void handleAdminEditSubmission(record)}>{t("Edit")}</Button>
          ) : null}
          <Button type="link" size="small" onClick={() => setStaffDetailRecord(record)}>{t("Full detail")}</Button>
        </Space>
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
      message.error(tr(error.message || "Unable to open file"));
    } finally {
      setFileOpenLoadingKey(null);
    }
  };

  const reviewerQueueColumns = [
    {
      title: t("Title"),
      dataIndex: "title",
      key: "title",
      width: 200,
      ellipsis: true
    },
    {
      title: t("Authors"),
      dataIndex: "author",
      key: "author",
      width: 200,
      ellipsis: true
    },
    {
      title: t("Reviewers (assigned)"),
      dataIndex: "reviewer",
      key: "reviewer",
      width: 200,
      ellipsis: true
    },
    {
      title: t("Abstract"),
      dataIndex: "abstract",
      key: "abstract",
      ellipsis: true
    },
    {
      title: t("Files"),
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
      title: t("Submitted At"),
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (createdAt) => formatDateTime(createdAt, lang)
    },
    {
      title: t("Actions"),
      key: "actions",
      width: 280,
      render: (_value, record) => {
        const isPendingForMe = record.my_decision === "pending";
        return (
          <Space>
            <Button type="link" size="small" onClick={() => setReviewerDetailRecord(record)}>{t("Detail")}</Button>
            {isPendingForMe ? (
              <>
                <Button
                  type="primary"
                  loading={reviewActionLoadingId === record.id}
                  onClick={() => submitReviewAction(record.id, "approve")}
                >{t("Approve")}</Button>
                <Button danger loading={reviewActionLoadingId === record.id} onClick={() => openRejectModal(record.id)}>{t("Reject")}</Button>
              </>
            ) : (
              <Tag color={reviewDecisionColor(record.my_decision)}>{decisionText(record.my_decision, t)}</Tag>
            )}
          </Space>
        );
      }
    }
  ];

  const openQueueSubmissionDetail = (record) => {
    const full = staffSubmissions.find((item) => item.id === record.id);
    setStaffDetailRecord(
      full || {
        ...record,
        status: record.status || record.submission_status
      }
    );
  };

  const buildStageQueueColumns = (loadingId, onApprove, onReject, approveLabel) => [
    {
      title: t("Title"),
      dataIndex: "title",
      key: "title",
      width: 220,
      ellipsis: true
    },
    {
      title: t("Authors"),
      dataIndex: "author",
      key: "author",
      width: 220,
      ellipsis: true
    },
    {
      title: t("Reviewers"),
      dataIndex: "reviewer",
      key: "reviewer",
      width: 220,
      ellipsis: true
    },
    {
      title: t("Status"),
      dataIndex: "submission_status",
      key: "submission_status",
      width: 120,
      render: (status) => <Tag color={thesisStatusColor(status)}>{statusText(status, t)}</Tag>
    },
    {
      title: t("Submitted At"),
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (createdAt) => formatDateTime(createdAt, lang)
    },
    {
      title: t("Actions"),
      key: "actions",
      width: 320,
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => openQueueSubmissionDetail(record)}>{t("Detail")}</Button>
          <Button type="primary" loading={loadingId === record.id} onClick={() => onApprove(record.id)}>
            {approveLabel}
          </Button>
          <Button danger loading={loadingId === record.id} onClick={() => onReject(record.id)}>{t("Reject")}</Button>
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
      message.error(tr(error.message || "Unable to load all submissions"));
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
      message.error(tr(error.message || "Unable to load library intake queue"));
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
      message.error(tr(error.message || "Unable to load director archive queue"));
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
      setEditingSubmissionId((currentId) => {
        if (!currentId) {
          return null;
        }
        const current = payload.find((item) => item.id === currentId);
        // Only the submitter may keep a thesis loaded in the entry form (no co-author autofill).
        if (current && isSubmissionSubmitter(current, studentId)) {
          setEditingSubmissionStatus(current.status === "reject" ? "rejected" : current.status);
          return currentId;
        }
        setEditingSubmissionStatus(null);
        submissionForm.resetFields();
        setArchiveSemesters([]);
        setArchivePeriods([]);
        const option = studentOptions.find((item) => item.value === studentId);
        const isAdmin = auth?.user?.role === "admin";
        submissionForm.setFieldsValue({
          studentId,
          authorIds: isAdmin ? undefined : [studentId],
          email: option?.username
            ? studentEmailFromUser({ username: option.username })
            : isAdmin
              ? ""
              : studentEmailFromUser(auth?.user),
          thesisYear: String(new Date().getFullYear()),
          ...defaultArchiveMetadata()
        });
        return null;
      });
    } catch (error) {
      message.error(tr(error.message || "Unable to load submission list"));
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (auth?.user?.role === "student" && auth?.user?.id) {
      void loadStudentSubmissions(auth.user.id);
    }
    const role = auth?.user?.role;
    if (role === "library_staff" || role === "director" || role === "admin") {
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
      message.error(tr(error.message || "Unable to load reviewer queue"));
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
      const response = await fetch("/api/users?role=reviewer", {
        headers: { ...authHeaders(auth?.token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load reviewer list");
      }
      setReviewerOptions(
        payload.map((item) => ({
          value: item.id,
          label: personOptionLabel(item.displayName, item.username),
          searchText: foldSearchText(`${item.displayName || ""} ${item.username || ""}`)
        }))
      );
    } catch (error) {
      message.error(tr(error.message || "Unable to load reviewer list"));
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
          label: item.name
        }))
      );
    } catch (error) {
      message.error(tr(error.message || "Unable to load faculties"));
    } finally {
      setIsLoadingArchiveFaculties(false);
    }
  };

  const loadArchiveSemesters = async (facultyId) => {
    if (!facultyId) {
      setArchiveSemesters([]);
      return [];
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
      const options = payload.map((item) => ({
        value: item.id,
        label: item.name
      }));
      setArchiveSemesters(options);
      return options;
    } catch (error) {
      message.error(tr(error.message || "Unable to load semesters"));
      setArchiveSemesters([]);
      return [];
    } finally {
      setIsLoadingArchiveSemesters(false);
    }
  };

  const loadArchivePeriods = async (facultyId, semesterId) => {
    if (!facultyId || !semesterId) {
      setArchivePeriods([]);
      return [];
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
      return payload;
    } catch (error) {
      message.error(tr(error.message || "Unable to load submission periods"));
      setArchivePeriods([]);
      return [];
    } finally {
      setIsLoadingArchivePeriods(false);
    }
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
      const response = await fetch("/api/users?role=student", {
        headers: { ...authHeaders(auth?.token) }
      });
      const payload = await parseResponse(response);
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("Unable to load student list");
      }
      setStudentOptions(
        payload.map((item) => ({
          value: item.id,
          label: personOptionLabel(item.displayName, item.username),
          searchText: foldSearchText(`${item.displayName || ""} ${item.username || ""}`),
          username: item.username,
          facultyId: item.facultyId || "",
          facultyName: item.facultyName || ""
        }))
      );
    } catch (error) {
      message.error(tr(error.message || "Unable to load student list"));
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (!auth?.user) {
      return;
    }
    if (auth.user.role === "student" || auth.user.role === "admin") {
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
        archiveFacultyId: auth.user.facultyId || undefined,
        thesisYear: String(new Date().getFullYear()),
        ...defaultArchiveMetadata()
      });
      if (auth.user.facultyId) {
        void loadArchiveSemesters(auth.user.facultyId);
      }
      void loadSubmissionFormFields(auth.token).then((fields) => applyFormFieldDefaults(fields));
    }
    if (auth?.user?.role === "admin") {
      submissionForm.setFieldsValue({
        studentId: undefined,
        authorIds: undefined,
        email: "",
        thesisYear: String(new Date().getFullYear()),
        ...defaultArchiveMetadata()
      });
      void loadSubmissionFormFields(auth.token).then((fields) => applyFormFieldDefaults(fields));
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
              : response.status === 403
                ? "Password login is disabled. Use Google sign-in."
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
      message.success(t("Login successful"));
    } catch (error) {
      if (error.name === "AbortError") {
        message.error(t("Login timeout. Please check backend server or Docker network."));
      } else {
        message.error(tr(error.message || "Unable to login"));
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoggingIn(false);
    }
  };

  const resolveStudentEmail = (studentId) => {
    if (!studentId) {
      return "";
    }
    if (auth?.user?.role === "student" && studentId === auth.user.id) {
      return studentEmailFromUser(auth.user);
    }
    const option = studentOptions.find((item) => item.value === studentId);
    if (option?.username) {
      return studentEmailFromUser({ username: option.username });
    }
    return "";
  };

  const refreshAfterSubmissionWrite = async () => {
    if (auth?.user?.role === "student") {
      await loadStudentSubmissions(auth.user.id);
      return;
    }
    if (auth?.user?.role === "admin") {
      await loadStaffSubmissions();
      const studentId = submissionForm.getFieldValue("studentId");
      if (studentId) {
        await loadStudentSubmissions(studentId);
      }
    }
  };

  const handleAdminStudentChange = (studentId) => {
    setEditingSubmissionId(null);
    setEditingSubmissionStatus(null);
    const email = resolveStudentEmail(studentId);
    submissionForm.setFieldsValue({
      studentId,
      email,
      authorIds: undefined,
      archiveFacultyId: undefined,
      archiveSemesterId: undefined,
      submissionPeriodId: undefined,
      thesisFile: []
    });
    setArchiveSemesters([]);
    setArchivePeriods([]);
    if (studentId) {
      void loadStudentSubmissions(studentId);
    } else {
      setStudentSubmissions([]);
    }
  };

  const applyStudentFaculty = (studentId) => {
    const student = studentOptions.find((item) => item.value === studentId);
    const facultyId = student?.facultyId || "";
    submissionForm.setFieldsValue({
      archiveFacultyId: facultyId || undefined,
      archiveSemesterId: undefined,
      submissionPeriodId: undefined
    });
    setArchivePeriods([]);
    if (facultyId) {
      void loadArchiveSemesters(facultyId);
    } else {
      setArchiveSemesters([]);
    }
  };

  const handleAdminAuthorsChange = (authorIds) => {
    const selected = Array.isArray(authorIds) ? authorIds.filter(Boolean) : [];
    const currentStudentId = submissionForm.getFieldValue("studentId");
    if (currentStudentId && selected.includes(currentStudentId)) {
      return;
    }
    const nextStudentId = selected[0];
    if (!nextStudentId) {
      submissionForm.setFieldsValue({
        studentId: undefined,
        email: "",
        archiveFacultyId: undefined,
        archiveSemesterId: undefined,
        submissionPeriodId: undefined
      });
      setArchiveSemesters([]);
      setArchivePeriods([]);
      setStudentSubmissions([]);
      return;
    }
    submissionForm.setFieldsValue({
      studentId: nextStudentId,
      email: resolveStudentEmail(nextStudentId)
    });
    applyStudentFaculty(nextStudentId);
    void loadStudentSubmissions(nextStudentId);
  };

  const buildSubmissionFormData = (values, { requireThesisFile = false } = {}) => {
    const formData = new FormData();
    const authorIds = Array.isArray(values.authorIds) ? values.authorIds.filter(Boolean) : [];
    const studentId =
      auth.user.role === "admin" ? values.studentId || authorIds[0] : auth.user.id;
    const reviewerIds = Array.isArray(values.reviewerIds) ? values.reviewerIds : [];
    if (!studentId) {
      throw new Error("Please select a student author");
    }
    if (authorIds.length === 0) {
      throw new Error("Please search and select at least one student author");
    }
    if (!authorIds.includes(studentId)) {
      throw new Error("The submitting student must be included in the author list");
    }
    formData.append("studentId", studentId);
    formData.append("email", (values.email || resolveStudentEmail(studentId)).trim());
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
    const metadata = {};
    for (const field of configurableFormFields) {
      const raw = values[field.fieldKey];
      if (raw == null) {
        continue;
      }
      const text = String(raw).trim();
      if (!text) {
        continue;
      }
      metadata[field.fieldKey] = text;
      if (
        field.fieldKey === "dateIssued" ||
        field.fieldKey === "publisher" ||
        field.fieldKey === "documentType" ||
        field.fieldKey === "language" ||
        field.fieldKey === "description" ||
        field.fieldKey === "abstract"
      ) {
        formData.append(field.fieldKey, text);
      }
    }
    if (!metadata.dateIssued && values.thesisYear) {
      metadata.dateIssued = String(values.thesisYear).trim();
      formData.append("dateIssued", metadata.dateIssued);
    }
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("authorIds", JSON.stringify(authorIds));
    formData.append("reviewerIds", JSON.stringify(reviewerIds));
    if (values.submissionPeriodId) {
      formData.append("submissionPeriodId", values.submissionPeriodId);
    }
    const thesisFile = values.thesisFile?.[0]?.originFileObj;
    if (thesisFile) {
      if (!validateThesisPdf(thesisFile, t)) {
        return null;
      }
      formData.append("thesisFile", thesisFile);
    } else if (requireThesisFile) {
      throw new Error("Please upload a thesis PDF file");
    }
    return formData;
  };

  const resetSubmissionForm = () => {
    const studentId = auth.user.role === "admin" ? submissionForm.getFieldValue("studentId") : auth.user.id;
    setEditingSubmissionId(null);
    setEditingSubmissionStatus(null);
    submissionForm.resetFields();
    setArchiveSemesters([]);
    setArchivePeriods([]);
    submissionForm.setFieldsValue({
      studentId,
      authorIds: auth.user.role === "admin" ? undefined : studentId ? [studentId] : undefined,
      email: resolveStudentEmail(studentId),
      thesisYear: String(new Date().getFullYear()),
      ...defaultArchiveMetadata()
    });
    if (auth.user.role === "admin") {
      setAdminSubmissionModalOpen(false);
    }
  };

  const openAdminCreateSubmission = () => {
    setEditingSubmissionId(null);
    setEditingSubmissionStatus(null);
    submissionForm.resetFields();
    setArchiveSemesters([]);
    setArchivePeriods([]);
    submissionForm.setFieldsValue({
      authorIds: undefined,
      thesisYear: String(new Date().getFullYear()),
      ...defaultArchiveMetadata()
    });
    setAdminSubmissionModalOpen(true);
  };

  const loadSubmissionIntoForm = async (record) => {
    const recordStudentId = record.submitter_id;
    if (!isAdminActor && !isSubmissionSubmitter(record, auth.user.id)) {
      message.warning(t("Only the submitter can edit this thesis. Use Detail to view."));
      return;
    }
    if (isAdminActor && recordStudentId) {
      submissionForm.setFieldsValue({ studentId: recordStudentId });
      await loadStudentSubmissions(recordStudentId);
    }
    setEditingSubmissionId(record.id);
    setEditingSubmissionStatus(record.status);
    const authorIds = Array.isArray(record.author_user_ids) ? record.author_user_ids : [];
    const reviewerIds = Array.isArray(record.reviewer_user_ids) ? record.reviewer_user_ids : [];
    const facultyId = record.faculty_id || undefined;
    const semesterId = record.semester_id || undefined;
    const periodId = record.submission_period_id || undefined;
    const semesterLabel = record.semester_name || semesterId;
    const periodLabel = record.period_name || t("Saved submission period");

    const withSavedSemester = (options) => {
      if (!semesterId || options.some((item) => item.value === semesterId)) {
        return options;
      }
      return [...options, { value: semesterId, label: semesterLabel }];
    };
    const withSavedPeriod = (periods) => {
      if (!periodId || periods.some((item) => item.id === periodId)) {
        return periods;
      }
      return [
        ...periods,
        {
          id: periodId,
          name: periodLabel,
          closesAt: record.period_closes_at || null
        }
      ];
    };

    if (facultyId) {
      setArchiveFaculties((prev) => {
        if (prev.some((item) => item.value === facultyId)) {
          return prev;
        }
        const label = record.faculty_name ? `${record.faculty_name}` : facultyId;
        return [...prev, { value: facultyId, label }];
      });
      const semesterOptions = await loadArchiveSemesters(facultyId);
      setArchiveSemesters(withSavedSemester(semesterOptions));
      if (semesterId) {
        const periods = await loadArchivePeriods(facultyId, semesterId);
        setArchivePeriods(withSavedPeriod(periods));
      }
    } else {
      setArchiveSemesters((prev) => withSavedSemester(prev));
      setArchivePeriods((prev) => withSavedPeriod(prev));
    }

    submissionForm.setFieldsValue({
      email: record.student_email || resolveStudentEmail(recordStudentId),
      titleVi: record.title_vi || "",
      titleEn: record.title_en || record.title || "",
      thesisAdvisors: record.thesis_advisors || "",
      major: record.major || "",
      thesisYear: record.thesis_year || String(new Date().getFullYear()),
      dateIssued: record.date_issued || record.thesis_year || String(new Date().getFullYear()),
      publisher: record.publisher || record.university_name || DEFAULT_PUBLISHER,
      documentType: record.document_type || "Thesis",
      language: record.language || "vie",
      description: record.description || "",
      abstract: record.abstract || "",
      ...(record.extra_metadata && typeof record.extra_metadata === "object" ? record.extra_metadata : {}),
      authorIds: authorIds.length > 0 ? authorIds : recordStudentId ? [recordStudentId] : undefined,
      reviewerIds,
      archiveFacultyId: facultyId,
      archiveSemesterId: semesterId,
      submissionPeriodId: periodId,
      thesisFile: thesisFileListFromRecord(record)
    });
    void loadSubmissionFormFields(auth.token);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAdminEditSubmission = async (record) => {
    setAdminDashTab("submissions");
    setStaffDetailRecord(null);
    setAdminSubmissionModalOpen(true);
    await loadSubmissionIntoForm(record);
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
      if (payload?.dspaceDeleteWarning) {
        message.warning(t("Deleted from Portal, but DSpace item may still exist — check logs"));
      } else if (payload?.dspaceDeleted) {
        message.success(t("Deleted from Portal and DSpace"));
      } else {
        message.success(t("Deleted"));
      }
      if (editingSubmissionId === submissionId) {
        resetSubmissionForm();
      }
      setStudentDetailRecord((current) => (current?.id === submissionId ? null : current));
      setStaffDetailRecord((current) => (current?.id === submissionId ? null : current));
      if (auth.user.role === "student") {
        await loadStudentSubmissions(auth.user.id);
      }
      if (auth.user.role === "admin") {
        await refreshAfterSubmissionWrite();
      }
      if (canStaffDeleteSubmission(auth.user.role)) {
        await loadStaffSubmissions();
        if (auth.user.role === "director") {
          await loadDirectorQueue();
        }
        if (auth.user.role === "library_staff") {
          await loadLibraryQueue();
        }
      }
    } catch (error) {
      message.error(tr(error.message || "Failed to delete"));
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  const promptDeleteSubmission = (record) => {
    const title = record.title_en || record.title || t("this thesis");
    Modal.confirm({
      title: t("Delete thesis?"),
      content: t('Delete "{{title}}"? This cannot be undone.', { title }),
      okText: t("Delete"),
      okType: "danger",
      cancelText: t("Cancel"),
      onOk: () => handleDeleteSubmission(record.id)
    });
  };

  const promptStaffDeleteSubmission = (record) => {
    const title = record.title_en || record.title || t("this thesis");
    const archived = record.status === "archived";
    const hasDspace = Boolean(record.dspace_item_id && !String(record.dspace_item_id).startsWith("dev-item-"));
    Modal.confirm({
      title: t("Delete submission?"),
      content: archived
        ? hasDspace
          ? t('Delete "{{title}}" from Portal and remove the linked DSpace item ({{id}})? This cannot be undone.', {
              title,
              id: record.dspace_item_id
            })
          : t('Delete archived submission "{{title}}"? This cannot be undone.', { title })
        : t('Delete "{{title}}"? This cannot be undone.', { title }),
      okText: t("Delete"),
      okType: "danger",
      cancelText: t("Cancel"),
      onOk: () => handleDeleteSubmission(record.id)
    });
  };

  const handleSubmitDraftFromDetail = async (record) => {
    const ownerId = record.submitter_id || auth.user.id;
    if (!isAdminActor && !isSubmissionSubmitter(record, auth.user.id)) {
      message.warning(t("Only the submitter can submit this thesis."));
      return;
    }
    const caps = getStudentSubmissionCapabilities(record, ownerId, studentSubmissions);
    if (!caps.canSubmit || record.status !== "draft") {
      message.warning(t("This thesis cannot be submitted from Detail right now."));
      return;
    }
    setIsSubmittingSubmission(true);
    try {
      if (!canStudentSubmitThesis(studentSubmissions, ownerId, record.id, record)) {
        throw new Error(
          studentActiveSubmission
            ? "This student already has a submitted thesis. Edit that thesis to update and resubmit it."
            : "Unable to submit thesis"
        );
      }
      if (!Array.isArray(record.files) || record.files.length === 0) {
        throw new Error("Please edit the draft and upload a thesis PDF before submitting");
      }
      const authorIds = Array.isArray(record.author_user_ids) ? record.author_user_ids : [];
      const reviewerIds = Array.isArray(record.reviewer_user_ids) ? record.reviewer_user_ids : [];
      if (!record.title_vi?.trim()) {
        throw new Error("Vietnamese thesis title is required — edit the draft first");
      }
      if (!(record.title_en || record.title)?.trim()) {
        throw new Error("English thesis title is required — edit the draft first");
      }
      if (!record.thesis_advisors?.trim()) {
        throw new Error("Advisor(s) is required — edit the draft first");
      }
      if (!record.major?.trim()) {
        throw new Error("Major is required — edit the draft first");
      }
      if (!record.thesis_year) {
        throw new Error("Year is required — edit the draft first");
      }
      for (const field of configurableFormFields) {
        if (!field.required) {
          continue;
        }
        const fromColumn =
          field.fieldKey === "abstract"
            ? record.abstract
            : field.fieldKey === "dateIssued"
              ? record.date_issued || record.thesis_year
              : field.fieldKey === "publisher"
                ? record.publisher || record.university_name
                : field.fieldKey === "documentType"
                  ? record.document_type
                  : field.fieldKey === "language"
                    ? record.language
                    : field.fieldKey === "description"
                      ? record.description
                      : record.extra_metadata?.[field.fieldKey];
        if (!String(fromColumn ?? "").trim()) {
          throw new Error(
            t("{{label}} is required — edit the draft first", { label: fieldDisplayLabel(field, t) })
          );
        }
      }
      if (!record.submission_period_id) {
        throw new Error(t("Submission period is required — edit the draft first"));
      }
      if (reviewerIds.length === 0) {
        throw new Error("Please select at least one reviewer — edit the draft first");
      }
      const formData = buildSubmissionFormData(
        {
          studentId: ownerId,
          email: record.student_email || resolveStudentEmail(ownerId),
          titleVi: record.title_vi,
          titleEn: record.title_en || record.title,
          thesisAdvisors: record.thesis_advisors,
          major: record.major,
          thesisYear: record.thesis_year,
          dateIssued: record.date_issued || record.thesis_year,
          publisher: record.publisher || record.university_name || DEFAULT_PUBLISHER,
          documentType: record.document_type || "Thesis",
          language: record.language || "vie",
          description: record.description,
          abstract: record.abstract,
          authorIds: authorIds.length > 0 ? authorIds : [ownerId],
          reviewerIds,
          submissionPeriodId: record.submission_period_id,
          thesisFile: []
        },
        { requireThesisFile: false }
      );
      if (!formData) {
        return;
      }
      const response = await fetch(`/api/submissions/${record.id}/submit`, {
        method: "POST",
        headers: { ...authHeaders(auth.token) },
        body: formData
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to submit thesis");
      }
      message.success(t("Thesis submitted successfully"));
      setStudentDetailRecord(null);
      if (editingSubmissionId === record.id) {
        resetSubmissionForm();
      }
      await refreshAfterSubmissionWrite();
    } catch (error) {
      message.error(tr(error.message || "Failed to submit thesis"))
    } finally {
      setIsSubmittingSubmission(false);
    }
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
      message.success(t("Reverted to draft"));
      setEditingSubmissionStatus("draft");
      await refreshAfterSubmissionWrite();
    } catch (error) {
      message.error(tr(error.message || "Failed to revert to draft"));
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
      if (payload?.id) {
        setEditingSubmissionId(payload.id);
        setEditingSubmissionStatus(payload.status || "draft");
      }
      message.success(t("Draft saved"));
      await refreshAfterSubmissionWrite();
      if (auth.user.role === "admin") {
        resetSubmissionForm();
      }
    } catch (error) {
      message.error(tr(error.message || "Failed to save draft"));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmitThesis = async (values) => {
    setIsSubmittingSubmission(true);
    try {
      if (
        !canStudentSubmitThesis(
          studentSubmissions,
          actingStudentId,
          editingSubmissionId,
          editingSubmissionRecord
        )
      ) {
        throw new Error(
          editingSubmissionRecord?.status === "reviewing"
            ? "This thesis is already under review. Revert it to draft first if all reviewers are still pending."
            : studentActiveSubmission
              ? "This student already has a submitted thesis. Edit that thesis to update and resubmit it."
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
      for (const field of configurableFormFields) {
        if (!field.required) {
          continue;
        }
        if (!String(values[field.fieldKey] ?? "").trim()) {
          throw new Error(t("{{label}} is required", { label: fieldDisplayLabel(field, t) }));
        }
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
          ? t("Thesis updated and submitted for review")
          : t("Thesis submitted successfully")
      );
      resetSubmissionForm();
      await refreshAfterSubmissionWrite();
    } catch (error) {
      message.error(tr(error.message || "Failed to submit thesis"))
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
      message.success(action === "approve" ? t("Approved") : t("Rejected"));
      await loadReviewerQueue();
    } catch (error) {
      message.error(tr(error.message || "Review action failed"))
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
      message.success(action === "approve" ? successApproveMsg : t("Rejected"));
      await Promise.all([
        loadStaffSubmissions(),
        endpoint === "library-action" ? loadLibraryQueue() : loadDirectorQueue()
      ]);
    } catch (error) {
      message.error(tr(error.message || "Review action failed"))
    } finally {
      setLoading(null);
    }
  }

  const submitLibraryAction = (submissionId, action, comment) =>
    submitStageAction("library-action", submissionId, action, comment, t("Passed library intake"));

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
      if (payload?.dspaceDeferred) {
        message.success(
          tr(payload?.message) ||
            t("Submission archived to period. Push to DSpace later from Archive configuration.")
        );
      } else if (payload?.dspacePublishError) {
        message.warning(
          tr(payload?.dspacePublishMessage) ||
            t("Archived in Portal, but DSpace publish failed — check DSpace settings, collection sync, and logs")
        );
      } else if (payload?.dspacePlaceholder) {
        message.warning(
          t("Archived with local placeholder item ({{id}}). Configure DSpace API to publish for real.", {
            id: payload.dspaceItemId
          })
        );
      } else if (payload?.dspaceItemId) {
        if (payload?.dspacePdfWarning) {
          message.warning(
            t("Archived and created DSpace item ({{id}}), but thesis PDF was not uploaded", {
              id: payload.dspaceItemId
            })
          );
        } else if (payload?.bitstreamUploaded) {
          message.success(t("Archived to DSpace with PDF ({{id}})", { id: payload.dspaceItemId }));
        } else {
          message.success(t("Archived and published to DSpace ({{id}})", { id: payload.dspaceItemId }));
        }
      } else {
        message.success(t("Submission archived"));
      }
      await loadDirectorQueue();
      await loadStaffSubmissions();
    } catch (error) {
      message.error(tr(error.message || "Archive failed"));
    } finally {
      setDirectorActionLoadingId(null);
    }
  };

  const submitDirectorReject = async (submissionId, comment) => {
    setDirectorActionLoadingId(submissionId);
    try {
      const response = await fetch("/api/reviews/director-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(auth.token)
        },
        body: JSON.stringify({ submissionId, action: "reject", comment })
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Reject failed");
      }
      message.success(t("Rejected"));
      await loadDirectorQueue();
      await loadStaffSubmissions();
    } catch (error) {
      message.error(tr(error.message || "Reject failed"));
    } finally {
      setDirectorActionLoadingId(null);
    }
  };

  const openDirectorRejectModal = (submissionId) => {
    setDirectorRejectTargetId(submissionId);
    setDirectorRejectReason("");
    setDirectorRejectModalOpen(true);
  };

  const confirmDirectorReject = async () => {
    if (!directorRejectTargetId) {
      return;
    }
    if (!directorRejectReason.trim()) {
      message.error(t("Please enter a reject reason"));
      return;
    }
    setDirectorRejectModalOpen(false);
    await submitDirectorReject(directorRejectTargetId, directorRejectReason.trim());
    setDirectorRejectTargetId(null);
    setDirectorRejectReason("");
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
      message.error(t("Please enter a reject reason"));
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
      message.error(t("Please enter a reject reason"));
      return;
    }
    setLibraryRejectModalOpen(false);
    await submitLibraryAction(libraryRejectTargetId, "reject", libraryRejectReason.trim());
    setLibraryRejectTargetId(null);
    setLibraryRejectReason("");
  };

  const buildDirectorArchiveColumns = (loadingId, onArchive, onReject) => [
    {
      title: t("Title"),
      dataIndex: "title",
      key: "title",
      width: 220,
      ellipsis: true
    },
    {
      title: t("Authors"),
      dataIndex: "author",
      key: "author",
      width: 200,
      ellipsis: true
    },
    {
      title: t("Status"),
      dataIndex: "submission_status",
      key: "submission_status",
      width: 110,
      render: (status) => <Tag color={thesisStatusColor(status)}>{statusText(status, t)}</Tag>
    },
    {
      title: t("Collection / period"),
      key: "period",
      width: 180,
      ellipsis: true,
      render: (_v, record) =>
        record.semester_name || record.faculty_name
          ? `${record.faculty_name || ""} / ${record.semester_name || ""}`.trim()
          : "—"
    },
    {
      title: t("Submitted At"),
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (createdAt) => formatDateTime(createdAt, lang)
    },
    {
      title: t("Actions"),
      key: "actions",
      width: 300,
      render: (_value, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => openQueueSubmissionDetail(record)}>{t("Detail")}</Button>
          <Button type="primary" loading={loadingId === record.id} onClick={() => onArchive(record.id)}>{t("Archive")}</Button>
          <Button danger loading={loadingId === record.id} onClick={() => onReject(record.id)}>{t("Reject")}</Button>
        </Space>
      )
    }
  ];

  const handleChangePassword = async (values) => {
    if (!auth?.token) {
      return;
    }
    setChangingPassword(true);
    try {
      const body = { newPassword: values.newPassword };
      if (auth.user?.hasPassword !== false && values.currentPassword) {
        body.currentPassword = values.currentPassword;
      }
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(auth.token)
        },
        body: JSON.stringify(body)
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to change password");
      }
      const nextAuth = {
        ...auth,
        user: { ...auth.user, hasPassword: true }
      };
      setAuth(nextAuth);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
      passwordForm.resetFields();
      setPasswordModalOpen(false);
      message.success(t("Password updated"));
    } catch (error) {
      message.error(tr(error.message || "Unable to change password"));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    setAuth(null);
    setAdminDashTab("admin");
    setStudentSubmissions([]);
    setStaffSubmissions([]);
    setStaffDetailRecord(null);
    setStudentDetailRecord(null);
    setReviewerDetailRecord(null);
    setReviewerQueue([]);
    setReviewerSearch("");
    setReviewerSemesterFilter(undefined);
    setReviewerPeriodFilter(undefined);
    setStaffSearch("");
    setStaffSemesterFilter(undefined);
    setStaffPeriodFilter(undefined);
    setEditingSubmissionId(null);
    setEditingSubmissionStatus(null);
    localStorage.removeItem(STORAGE_KEY);
    loginForm.resetFields();
    submissionForm.resetFields();
    message.info(t("You have been logged out"));
  };

  const renderWorkflowHistory = (history) => {
    if (!Array.isArray(history) || history.length === 0) {
      return <Text type="secondary">{t("No workflow history")}</Text>;
    }

    return (
      <Timeline
        style={{ marginTop: 12 }}
        items={history.map((item, idx) => {
          const detail = formatEventPayload(item.eventType, item.payload, t);
          const role = humanWorkflowRole(item.actorRole, t);
          const name = item.actorName || (item.actorRole === "system" ? t("System") : t("Unknown"));
          return {
            key: `${item.id || idx}-${idx}`,
            color: timelineColor(item.eventType),
            children: (
              <div style={{ paddingBottom: 4 }}>
                <Space wrap size={8}>
                  <Tag color={eventColor(item.eventType)} style={{ marginInlineEnd: 0 }}>
                    {eventLabel(item.eventType, t)}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.createdAt ? formatDateTime(item.createdAt, lang) : ""}
                  </Text>
                </Space>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {role} · {name}
                  </Text>
                </div>
                {detail ? (
                  <div style={{ marginTop: 2 }}>
                    <Text>{detail}</Text>
                  </div>
                ) : null}
              </div>
            )
          };
        })}
      />
    );
  };

  const renderSearchArchiveFilters = ({ search, onSearch, semester, onSemester, period, onPeriod, items }) => (
    <>
      <Input
        allowClear
        placeholder={t("Search by title, author, reviewer list, abstract, submitter...")}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      <Space wrap>
        <Select
          allowClear
          placeholder={t("Semester")}
          style={{ minWidth: 200 }}
          value={semester}
          options={buildSemesterFilterOptions(items)}
          onChange={(value) => {
            onSemester(value);
            onPeriod((current) => {
              if (!current || !value) {
                return current;
              }
              const stillValid = (items || []).some(
                (item) =>
                  submissionPeriodId(item) === current && submissionSemesterKey(item) === value
              );
              return stillValid ? current : undefined;
            });
          }}
        />
        <Select
          allowClear
          placeholder={t("Submission period")}
          style={{ minWidth: 260 }}
          value={period}
          options={buildPeriodFilterOptions(items, semester)}
          onChange={onPeriod}
        />
      </Space>
    </>
  );

  const renderSubmissionDetailBody = (record) => {
    if (!record) {
      return null;
    }
    const extra = record.extra_metadata && typeof record.extra_metadata === "object" ? record.extra_metadata : {};
    const shownConfigurableKeys = new Set([
      "dateIssued",
      "publisher",
      "documentType",
      "language",
      "description",
      "abstract"
    ]);
    const extraFields = (Array.isArray(configurableFormFields) ? configurableFormFields : []).filter(
      (field) => !shownConfigurableKeys.has(field.fieldKey)
    );
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label={t("Email")}>{record.student_email || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Title (Vietnamese)")}>{record.title_vi || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Title (English)")}>
            {record.title_en || record.title || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={t("Advisor(s)")}>{record.thesis_advisors || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Major")}>{record.major || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Year")}>{record.thesis_year || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Date of Issue")}>
            {record.date_issued || record.thesis_year || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={t("Publisher")}>
            {record.publisher || record.university_name || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={t("Type")}>{documentTypeText(record.document_type, t)}</Descriptions.Item>
          <Descriptions.Item label={t("Language")}>{languageCodeText(record.language, t)}</Descriptions.Item>
          <Descriptions.Item label={t("Submitter account")}>
            {record.submitter || "—"}
            {record.submitter_username ? (
              <Text type="secondary"> (@{record.submitter_username})</Text>
            ) : null}
          </Descriptions.Item>
          <Descriptions.Item label={t("Submitter user ID")}>
            <Text code copyable>
              {record.submitter_id}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t("Workflow status")}>
            <Tag color={thesisStatusColor(record.status)}>{statusText(record.status, t)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t("Created at")}>
            {formatDateTime(record.created_at, lang)}
          </Descriptions.Item>
          <Descriptions.Item label={t("Authors (resolved)")}>{record.author || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Reviewers (resolved)")}>{record.reviewer || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("University")}>{record.university_name || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Faculty")}>{record.faculty_name || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Semester")}>{record.semester_name || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Abstract")}>{record.abstract || "—"}</Descriptions.Item>
          <Descriptions.Item label={t("Description")}>{record.description || "—"}</Descriptions.Item>
          {extraFields.map((field) => (
            <Descriptions.Item key={field.id || field.fieldKey} label={fieldDisplayLabel(field, t)}>
              {String(extra[field.fieldKey] ?? record[field.fieldKey] ?? "").trim() || "—"}
            </Descriptions.Item>
          ))}
        </Descriptions>
        <div>
          <Title level={5}>{t("Files")}</Title>
          {Array.isArray(record.files) && record.files.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {record.files.map((f) => (
                <li key={f.id}>
                  <Space wrap align="start">
                    <Text strong style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                      {f.fileName}
                    </Text>
                    <Tag>{f.fileType}</Tag>
                    <Button
                      type="primary"
                      size="small"
                      loading={fileOpenLoadingKey === `${record.id}:${f.id}`}
                      onClick={() => void openProtectedSubmissionFile(record.id, f.id)}
                    >{t("Open")}</Button>
                  </Space>
                </li>
              ))}
            </ul>
          ) : (
            <Text type="secondary">{t("No files")}</Text>
          )}
        </div>
        <div>
          <Title level={5}>{t("Workflow History")}</Title>
          {renderWorkflowHistory(record.workflow_history)}
        </div>
      </Space>
    );
  };

  const renderThesisEntryWorkspace = () => {
    const studentFocusRecord = studentPrimarySubmitted || studentOwnDraft;
    const showStudentRecordDetail = !isAdminActor && Boolean(studentFocusRecord) && !editingSubmissionId;
    const focusCaps = studentFocusRecord
      ? getStudentSubmissionCapabilities(studentFocusRecord, actingStudentId, studentSubmissions)
      : null;

    return (
                <>
                  {showStudentRecordDetail ? (
                    <>
                      <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }}>
                        <Title level={5} style={{ margin: 0 }}>
                          {studentFocusRecord.status === "draft" ? t("Draft details") : t("Submission details")}
                        </Title>
                        <Space>
                          {focusCaps?.canEdit ? (
                            <Button type="primary" onClick={() => void loadSubmissionIntoForm(studentFocusRecord)}>{t("Edit")}</Button>
                          ) : null}
                          {focusCaps?.canDelete ? (
                            <Button
                              danger
                              loading={isDeletingSubmission}
                              onClick={() => promptDeleteSubmission(studentFocusRecord)}
                            >{t("Delete")}</Button>
                          ) : null}
                        </Space>
                      </Space>
                      {renderSubmissionDetailBody(studentFocusRecord)}
                    </>
                  ) : (
                    <>
                  {isAdminActor ? (
                    <Paragraph type="secondary">
                      {t(
                        "Create a draft or submit a thesis on behalf of a student. The selected student remains the submitter."
                      )}
                    </Paragraph>
                  ) : null}
                  <Form layout="vertical" form={submissionForm} autoComplete="off">
                    {isAdminActor ? (
                      <Form.Item name="studentId" hidden>
                        <Input />
                      </Form.Item>
                    ) : null}
                    <Form.Item
                      label={t("Faculty")}
                      name="archiveFacultyId"
                      rules={[{ required: true, message: t("This student is not assigned to a faculty") }]}
                    >
                      <Select
                        placeholder={t("Student faculty")}
                        loading={isLoadingArchiveFaculties}
                        options={facultySelectOptions}
                        disabled
                        notFoundContent={
                          isLoadingArchiveFaculties ? t("Loading...") : t("No faculty assigned")
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      label={t("Semester")}
                      name="archiveSemesterId"
                      rules={[{ required: true, message: t("Please select a semester") }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        placeholder={t("Select semester")}
                        optionFilterProp="label"
                        loading={isLoadingArchiveSemesters}
                        options={archiveSemesters}
                        disabled={!archiveFacultyId || !canChangeSubmissionPeriod}
                        onChange={(value) => void handleArchiveSemesterChange(value)}
                        notFoundContent={isLoadingArchiveSemesters ? t("Loading...") : t("Select a faculty first")}
                      />
                    </Form.Item>
                    <Form.Item
                      label={t("Submission period")}
                      name="submissionPeriodId"
                      rules={[{ required: true, message: t("Please select a submission period") }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        placeholder={t("Select open submission period")}
                        optionFilterProp="label"
                        loading={isLoadingArchivePeriods}
                        disabled={!archiveSemesterId || !canChangeSubmissionPeriod}
                        onChange={handleSubmissionPeriodChange}
                        options={archivePeriods.map((p) => ({
                          value: p.id,
                          label: p.closesAt
                            ? t("{{name}} (closes {{date}})", { name: p.name, date: formatDate(p.closesAt, lang) })
                            : p.name
                        }))}
                        notFoundContent={
                          isLoadingArchivePeriods ? t("Loading...") : t("No open periods for this semester")
                        }
                      />
                    </Form.Item>

                    <Divider style={{ margin: "8px 0" }} />
                    {isAdminActor ? (
                    <Form.Item
                      label={t("Authors")}
                      name="authorIds"
                      extra={t("Search by student name or username. Not filled with the admin account.")}
                      rules={[{ required: true, message: t("Please search and select at least one student author") }]}
                    >
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        disabled={isFormReadOnly}
                        placeholder={t("Search by name or username")}
                        filterOption={personOptionFilter}
                        loading={isLoadingStudents}
                        options={studentOptions}
                        maxTagCount="responsive"
                        onChange={handleAdminAuthorsChange}
                        notFoundContent={isLoadingStudents ? t("Loading...") : t("No students found")}
                      />
                    </Form.Item>
                    ) : null}
                    <fieldset
                      disabled={isFormReadOnly}
                      style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
                    >
                    <Form.Item label={t("Email")} name="email">
                      <Input disabled placeholder="username@hcmut.edu.vn" />
                    </Form.Item>
                    <Form.Item
                      label={t("Thesis title (Vietnamese)")}
                      name="titleVi"
                      rules={[{ required: true, message: t("Vietnamese title is required") }]}
                    >
                      <Input placeholder={t("Tên luận văn / luận án (tiếng Việt)")} />
                    </Form.Item>
                    <Form.Item
                      label={t("Thesis title (English)")}
                      name="titleEn"
                      rules={[{ required: true, message: t("English title is required") }]}
                    >
                      <Input placeholder={t("Thesis title in English")} />
                    </Form.Item>
                    <Form.Item
                      label={t("Advisor(s)")}
                      name="thesisAdvisors"
                      rules={[{ required: true, message: t("Advisor(s) is required") }]}
                    >
                      <Input placeholder={t("e.g. Assoc. Prof. Nguyen Van A; Dr. Tran Van B")} />
                    </Form.Item>
                    <Form.Item label={t("Major")} name="major" rules={[{ required: true, message: t("Major is required") }]}>
                      <Input placeholder={t("e.g. Computer Science")} />
                    </Form.Item>
                    <Form.Item label={t("Year")} name="thesisYear" rules={[{ required: true, message: t("Year is required") }]}>
                      <Select
                        options={THESIS_YEAR_OPTIONS}
                        placeholder={t("Graduation / submission year")}
                        onChange={(year) => {
                          const current = submissionForm.getFieldValue("dateIssued");
                          if (!current || /^\d{4}$/.test(String(current))) {
                            submissionForm.setFieldsValue({ dateIssued: year });
                          }
                        }}
                      />
                    </Form.Item>
                    {!isAdminActor ? (
                    <Form.Item
                      label={t("Authors")}
                      name="authorIds"
                      rules={[{ required: true, message: t("Please select at least one author") }]}
                    >
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        placeholder={t("Search by name or username")}
                        filterOption={personOptionFilter}
                        loading={isLoadingStudents}
                        options={studentOptions}
                        maxTagCount="responsive"
                        notFoundContent={isLoadingStudents ? t("Loading...") : t("No students found")}
                      />
                    </Form.Item>
                    ) : null}
                    <Form.Item
                      label={t("Reviewers")}
                      name="reviewerIds"
                      rules={[{ required: true, message: t("Please select at least one reviewer") }]}
                    >
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        placeholder={t("Search by name or username")}
                        filterOption={personOptionFilter}
                        loading={isLoadingReviewers}
                        options={reviewerOptions}
                        maxTagCount="responsive"
                        notFoundContent={isLoadingReviewers ? t("Loading...") : t("No reviewers found")}
                      />
                    </Form.Item>
                    {configurableFormFields.map((field) => {
                      const label = fieldDisplayLabel(field, t);
                      const rules = field.required
                        ? [{ required: true, message: t("{{label}} is required", { label }) }]
                        : [];
                      let control;
                      if (field.inputType === "textarea") {
                        control = <TextArea rows={field.fieldKey === "abstract" ? 5 : 3} />;
                      } else if (field.inputType === "select" || field.inputType === "year") {
                        control = (
                          <Select
                            options={
                              field.inputType === "year"
                                ? THESIS_YEAR_OPTIONS
                                : (field.options || []).map((o) => ({
                                    value: o.value,
                                    label: optionDisplayLabel(o, t)
                                  }))
                            }
                            placeholder={label}
                          />
                        );
                      } else {
                        control = <Input placeholder={field.defaultValue || label} />;
                      }
                      return (
                        <Form.Item
                          key={field.id || field.fieldKey}
                          label={label}
                          name={field.fieldKey}
                          rules={rules}
                        >
                          {control}
                        </Form.Item>
                      );
                    })}
                    <Form.Item
                      label={t("Thesis PDF")}
                      name="thesisFile"
                      valuePropName="fileList"
                      getValueFromEvent={(event) => event?.fileList || []}
                      rules={[
                        {
                          required: !editingSubmissionId,
                          message: t("Please upload thesis PDF")
                        }
                      ]}
                      extra={
                        editingSubmissionId
                          ? t("Current PDF is shown below. Upload a new file only if you want to replace it.")
                          : undefined
                      }
                    >
                      <Upload.Dragger
                        accept=".pdf,application/pdf"
                        beforeUpload={(file) => (validateThesisPdf(file, t) ? false : Upload.LIST_IGNORE)}
                        maxCount={1}
                        onPreview={(file) => {
                          if (file?.existingFileId && editingSubmissionId) {
                            void openProtectedSubmissionFile(editingSubmissionId, file.existingFileId);
                          }
                        }}
                      >
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">{t("Click or drag PDF thesis file here (max {{size}} MB)", { size: THESIS_MAX_FILE_SIZE_MB })}</p>
                      </Upload.Dragger>
                    </Form.Item>

                    <Space wrap>
                      {!isFormReadOnly ? (
                        <>
                          <Button
                            onClick={() => void handleSaveDraft(submissionForm.getFieldsValue())}
                            loading={isSavingDraft}
                            disabled={
                              (!periodSelected && !editingSubmissionId) || !canSaveCurrentDraft || isFormReadOnly
                            }
                          >{t("Save draft")}</Button>
                          <Button
                            type="primary"
                            onClick={() => submissionForm.validateFields().then(handleSubmitThesis).catch(() => {})}
                            loading={isSubmittingSubmission}
                            disabled={(!periodSelected && !editingSubmissionId) || !canSubmitCurrentThesis}
                          >
                            {editingSubmissionStatus === "rejected" ||
                            editingSubmissionStatus === "reject" ||
                            editingSubmissionStatus === "approved"
                              ? t("Submit again")
                              : t("Submit thesis")}
                          </Button>
                          {editingSubmissionId && editingSubmissionCapabilities.canRevertToDraft ? (
                            <Button loading={isRevertingSubmission} onClick={() => void handleRevertToDraft()}>{t("Revert to draft")}</Button>
                          ) : null}
                          {editingSubmissionId && editingSubmissionCapabilities.canDelete ? (
                            <Button
                              danger
                              loading={isDeletingSubmission}
                              onClick={() =>
                                editingSubmissionRecord && promptDeleteSubmission(editingSubmissionRecord)
                              }
                            >{t("Delete")}</Button>
                          ) : null}
                        </>
                      ) : null}
                      {editingSubmissionId ? (
                        <Button onClick={resetSubmissionForm}>{isFormReadOnly ? t("Close") : t("Cancel edit")}</Button>
                      ) : null}
                    </Space>
                    </fieldset>
                  </Form>
                    </>
                  )}
                </>
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
          <Title level={4} style={{ color: "#fff", margin: 0, lineHeight: "64px" }}>{t("Thesis Deposit Portal")}</Title>
        </Space>
        <Space size={12} align="center">
          <LanguageSwitch />
          {auth?.user ? (
          <Space size={12} align="center">
            <div style={{ textAlign: "right", lineHeight: 1.25 }}>
              <Text style={{ color: "#ffffff", display: "block", fontWeight: 600 }}>
                {auth.user.displayName || auth.user.username}
              </Text>
              <Text style={{ color: "#d7e8ff", display: "block", fontSize: 12 }}>@{auth.user.username}</Text>
            </div>
            <Button
              onClick={() => {
                passwordForm.resetFields();
                setPasswordModalOpen(true);
              }}
            >{t("Change password")}</Button>
            <Button danger onClick={handleLogout}>{t("Log out")}</Button>
          </Space>
          ) : null}
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        {!auth ? (
          <Card
            title={t("Login")}
            style={{ maxWidth: 560, borderColor: "#d6eaff", boxShadow: "0 6px 18px rgba(3, 3, 145, 0.08)" }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              {loginMethod === "google" ? (
                <>
                  <Alert
                    type="info"
                    showIcon
                    message={t("HCMUT Google sign-in")}
                    description={t("Sign in with your verified @hcmut.edu.vn Google account.")}
                  />
                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={isLoggingIn}
                    onClick={() => {
                      window.location.href = "/api/auth/google";
                    }}
                  >{t("Login with Google")}</Button>
                </>
              ) : (
                <>
                  <Alert
                    type="info"
                    showIcon
                    message={t("Demo credentials")}
                    description={t("student1/student123, reviewer1/review123, library1/library123, director1/director123, admin1/admin123")}
                  />
                  <Form form={loginForm} layout="vertical" onFinish={handleLogin} autoComplete="off">
                    <Form.Item
                      label={t("Username")}
                      name="username"
                      rules={[{ required: true, message: t("Please enter your username") }]}
                    >
                      <Input placeholder="student1" />
                    </Form.Item>
                    <Form.Item
                      label={t("Password")}
                      name="password"
                      rules={[
                        { required: true, message: t("Please enter your password") },
                        { min: 6, message: t("Password must be at least 6 characters") }
                      ]}
                    >
                      <Input.Password placeholder="******" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={isLoggingIn}>{t("Login")}</Button>
                  </Form>
                </>
              )}
            </Space>
          </Card>
        ) : (
          <Card
            title={t("Dashboard")}
            style={{
              width: "100%",
              borderColor: "#d6eaff",
              boxShadow: "0 6px 18px rgba(3, 3, 145, 0.08)"
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <Text>{greeting}</Text>
              {auth.user.role === "student" ? (
                renderThesisEntryWorkspace()
              ) : auth.user.role === "reviewer" ? (
                <>
                  <Paragraph type="secondary">{t("Review all theses where you are assigned as advisor/reviewer. Use search and grouped queues.")}</Paragraph>
                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>{t("Reviewer Workspace")}</Title>
                    <Button onClick={() => loadReviewerQueue()} loading={isLoadingReviewerQueue}>{t("Refresh")}</Button>
                  </Space>
                  {renderSearchArchiveFilters({
                    search: reviewerSearch,
                    onSearch: setReviewerSearch,
                    semester: reviewerSemesterFilter,
                    onSemester: setReviewerSemesterFilter,
                    period: reviewerPeriodFilter,
                    onPeriod: setReviewerPeriodFilter,
                    items: reviewerQueue
                  })}
                  <Title level={5} style={{ margin: "8px 0 0" }}>
                    {t("Need My Review ({{count}})", { count: reviewerNeedMyDecision.length })}
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
                    {t("I Approved ({{count}})", { count: reviewerApproved.length })}
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
                    {t("I Rejected ({{count}})", { count: reviewerRejected.length })}
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
                <Tabs
                  activeKey={adminDashTab}
                  onChange={setAdminDashTab}
                  items={[
                    {
                      key: "admin",
                      label: t("Administration"),
                      children: <AdminPanel auth={auth} hideArchiveTab hideFormFieldsTab />
                    },
                    {
                      key: "submissions",
                      label: t("Submissions"),
                      children: (
                        <Tabs
                          items={[
                            {
                              key: "list",
                              label: t("All submissions"),
                              children: (
                        <>
                          <Paragraph type="secondary">
                            {t(
                              "Open Full detail to view or delete any submission, including archived items linked to DSpace."
                            )}
                          </Paragraph>
                          <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
                            <Title level={5} style={{ margin: 0 }}>{t("All submissions")}</Title>
                            <Space>
                              <Button type="primary" onClick={openAdminCreateSubmission}>{t("Create submission")}</Button>
                              <Button onClick={() => void loadStaffSubmissions()} loading={isLoadingSubmissions}>{t("Refresh")}</Button>
                            </Space>
                          </Space>
                          {renderSearchArchiveFilters({
                            search: staffSearch,
                            onSearch: setStaffSearch,
                            semester: staffSemesterFilter,
                            onSemester: setStaffSemesterFilter,
                            period: staffPeriodFilter,
                            onPeriod: setStaffPeriodFilter,
                            items: staffSubmissions
                          })}
                          <Table
                            rowKey="id"
                            dataSource={staffFilteredSubmissions}
                            columns={adminSubmissionColumns}
                            loading={isLoadingSubmissions}
                            pagination={{ pageSize: 8 }}
                            scroll={{ x: 1400 }}
                          />
                          <Modal
                            title={editingSubmissionId ? t("Edit submission") : t("Create submission")}
                            open={adminSubmissionModalOpen}
                            onCancel={resetSubmissionForm}
                            footer={null}
                            width={880}
                            destroyOnClose
                          >
                            {renderThesisEntryWorkspace()}
                          </Modal>
                        </>
                              )
                            },
                            {
                              key: "form-fields",
                              label: t("Submission fields"),
                              children: <AdminPanel auth={auth} formFieldsOnly />
                            }
                          ]}
                        />
                      )
                    },
                    {
                      key: "archive",
                      label: t("Archive configuration"),
                      children: <LibraryArchivePanel auth={auth} readOnly={false} canManage />
                    }
                  ]}
                />
              ) : auth.user.role === "library_staff" || auth.user.role === "director" ? (
                <Tabs
                  defaultActiveKey="workflow"
                  items={[
                    {
                      key: "workflow",
                      label: auth.user.role === "director" ? t("Approval workflow") : t("Intake & submissions"),
                      children: (
                <>
                  <Paragraph type="secondary">
                    {t("Workflow:")} <Tag color="gold">{t("Reviewing")}</Tag> → <Tag color="green">{t("Approved")}</Tag> →{" "}
                    <Tag color="purple">{t("Archived")}</Tag> {t("or")} <Tag color="red">{t("Rejected")}</Tag>.
                  </Paragraph>
                  {renderSearchArchiveFilters({
                    search: staffSearch,
                    onSearch: setStaffSearch,
                    semester: staffSemesterFilter,
                    onSemester: setStaffSemesterFilter,
                    period: staffPeriodFilter,
                    onPeriod: setStaffPeriodFilter,
                    items: staffFilterSource
                  })}
                  {auth.user.role === "library_staff" && (
                    <>
                      <Divider style={{ margin: "8px 0" }} />
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Title level={5} style={{ margin: 0 }}>{t("Library intake queue")}</Title>
                        <Button onClick={() => loadLibraryQueue()} loading={isLoadingLibraryQueue}>{t("Refresh")}</Button>
                      </Space>
                      <Table
                        rowKey="id"
                        dataSource={libraryFilteredQueue}
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
                        <div>
                          <Title level={5} style={{ margin: 0 }}>{t("Archive approved submissions")}</Title>
                          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            {t(
                              "Archive commits in Portal then publishes the thesis item (+ PDF when available) into the DSpace collection of the submission period (fallback: semester collection)."
                            )}
                          </Paragraph>
                        </div>
                        <Button onClick={() => loadDirectorQueue()} loading={isLoadingDirectorQueue}>{t("Refresh")}</Button>
                      </Space>
                      <Table
                        rowKey="id"
                        dataSource={directorFilteredQueue}
                        columns={buildDirectorArchiveColumns(
                          directorActionLoadingId,
                          (id) => submitDirectorArchive(id),
                          (id) => openDirectorRejectModal(id)
                        )}
                        loading={isLoadingDirectorQueue}
                        pagination={{ pageSize: 5 }}
                        scroll={{ x: 1250 }}
                      />
                    </>
                  )}
                  <Divider style={{ margin: "8px 0" }} />
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Title level={5} style={{ margin: 0 }}>{t("All submissions")}</Title>
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
                    >{t("Refresh")}</Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={staffFilteredSubmissions}
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
                      label: t("Archive configuration"),
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
                <Paragraph type="secondary">{t("Unknown role.")}</Paragraph>
              )}
            </Space>
          </Card>
        )}
      </Content>
      <Modal
        title={
          studentDetailRecord
            ? t("Thesis detail: {{title}}", {
                title: studentDetailRecord.title_en || studentDetailRecord.title
              })
            : t("Thesis detail")
        }
        open={Boolean(studentDetailRecord)}
        onCancel={() => setStudentDetailRecord(null)}
        footer={
          studentDetailRecord
            ? (() => {
                const caps = getStudentSubmissionCapabilities(
                  studentDetailRecord,
                  auth?.user?.id,
                  studentSubmissions
                );
                const actions = [];
                if (caps.canEdit) {
                  actions.push(
                    <Button
                      key="edit"
                      onClick={() => {
                        const record = studentDetailRecord;
                        setStudentDetailRecord(null);
                        void loadSubmissionIntoForm(record);
                      }}
                    >{t("Edit")}</Button>
                  );
                }
                if (caps.canSubmit && studentDetailRecord.status === "draft") {
                  actions.push(
                    <Button
                      key="submit"
                      type="primary"
                      loading={isSubmittingSubmission}
                      onClick={() => void handleSubmitDraftFromDetail(studentDetailRecord)}
                    >{t("Submit")}</Button>
                  );
                }
                if (caps.canDelete) {
                  actions.push(
                    <Button
                      key="delete"
                      danger
                      loading={isDeletingSubmission}
                      onClick={() => promptDeleteSubmission(studentDetailRecord)}
                    >{t("Delete")}</Button>
                  );
                }
                actions.push(
                  <Button key="close" onClick={() => setStudentDetailRecord(null)}>{t("Close")}</Button>
                );
                return actions;
              })()
            : null
        }
        width={820}
        destroyOnClose
      >
        {studentDetailRecord ? renderSubmissionDetailBody(studentDetailRecord) : null}
      </Modal>
      <Modal
        title={
          reviewerDetailRecord
            ? t("Thesis detail: {{title}}", { title: reviewerDetailRecord.title })
            : t("Thesis detail")
        }
        open={Boolean(reviewerDetailRecord)}
        onCancel={() => setReviewerDetailRecord(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setReviewerDetailRecord(null)}>{t("Close")}</Button>
        ]}
        width={820}
        destroyOnClose
      >
        {reviewerDetailRecord ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label={t("Email")}>{reviewerDetailRecord.student_email || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Title (Vietnamese)")}>{reviewerDetailRecord.title_vi || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Title (English)")}>
                {reviewerDetailRecord.title_en || reviewerDetailRecord.title || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Advisor(s)")}>{reviewerDetailRecord.thesis_advisors || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Major")}>{reviewerDetailRecord.major || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Year")}>{reviewerDetailRecord.thesis_year || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Date of Issue")}>
                {reviewerDetailRecord.date_issued || reviewerDetailRecord.thesis_year || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Publisher")}>
                {reviewerDetailRecord.publisher || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Type")}>{documentTypeText(reviewerDetailRecord.document_type, t)}</Descriptions.Item>
              <Descriptions.Item label={t("Language")}>{languageCodeText(reviewerDetailRecord.language, t)}</Descriptions.Item>
              <Descriptions.Item label={t("Submitter account")}>
                {reviewerDetailRecord.submitter || "—"}
                {reviewerDetailRecord.submitter_username ? (
                  <Text type="secondary">
                    {" "}
                    (@{reviewerDetailRecord.submitter_username})
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label={t("Submitter user ID")}>
                <Text code copyable>
                  {reviewerDetailRecord.submitter_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t("Workflow status")}>
                <Tag color={thesisStatusColor(reviewerDetailRecord.submission_status)}>
                  {statusText(reviewerDetailRecord.submission_status, t)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("Created at")}>
                {formatDateTime(reviewerDetailRecord.created_at, lang)}
              </Descriptions.Item>
              <Descriptions.Item label={t("My decision")}>
                <Tag color={reviewDecisionColor(reviewerDetailRecord.my_decision)}>
                  {decisionText(reviewerDetailRecord.my_decision, t)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("My decided at")}>
                {reviewerDetailRecord.my_decided_at ? formatDateTime(reviewerDetailRecord.my_decided_at, lang) : "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("My comment")}>{reviewerDetailRecord.my_comment || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Authors (resolved)")}>{reviewerDetailRecord.author || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Reviewers (resolved)")}>{reviewerDetailRecord.reviewer || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Abstract")}>{reviewerDetailRecord.abstract || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Description")}>{reviewerDetailRecord.description || "—"}</Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>{t("Files")}</Title>
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
                        >{t("Open")}</Button>
                      </Space>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text type="secondary">{t("No files")}</Text>
              )}
            </div>
          </Space>
        ) : null}
      </Modal>
      <Modal
        title={
          staffDetailRecord
            ? t("Thesis detail: {{title}}", { title: staffDetailRecord.title })
            : t("Thesis detail")
        }
        open={Boolean(staffDetailRecord)}
        onCancel={() => setStaffDetailRecord(null)}
        footer={
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <div />
            <Space>
              {canStaffDeleteSubmission(auth?.user?.role) && staffDetailRecord ? (
                <Button
                  danger
                  loading={isDeletingSubmission}
                  onClick={() => promptStaffDeleteSubmission(staffDetailRecord)}
                >{t("Delete")}</Button>
              ) : null}
              <Button type="primary" onClick={() => setStaffDetailRecord(null)}>{t("Close")}</Button>
            </Space>
          </Space>
        }
        width={800}
        destroyOnClose
      >
        {staffDetailRecord ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label={t("Submission ID")}>
                <Text code copyable>
                  {staffDetailRecord.id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t("Email")}>{staffDetailRecord.student_email || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Title (Vietnamese)")}>{staffDetailRecord.title_vi || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Title (English)")}>
                {staffDetailRecord.title_en || staffDetailRecord.title || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Advisor(s)")}>{staffDetailRecord.thesis_advisors || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Major")}>{staffDetailRecord.major || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Year")}>{staffDetailRecord.thesis_year || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Date of Issue")}>
                {staffDetailRecord.date_issued || staffDetailRecord.thesis_year || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Publisher")}>
                {staffDetailRecord.publisher || staffDetailRecord.university_name || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Type")}>{documentTypeText(staffDetailRecord.document_type, t)}</Descriptions.Item>
              <Descriptions.Item label={t("Language")}>{languageCodeText(staffDetailRecord.language, t)}</Descriptions.Item>
              <Descriptions.Item label={t("Submitter account")}>
                {staffDetailRecord.submitter || "—"}
                {staffDetailRecord.submitter_username ? (
                  <Text type="secondary">
                    {" "}
                    (@{staffDetailRecord.submitter_username})
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label={t("Submitter user ID")}>
                <Text code copyable>
                  {staffDetailRecord.submitter_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t("Workflow status")}>
                <Tag
                  color={thesisStatusColor(staffDetailRecord.status || staffDetailRecord.submission_status)}
                >
                  {statusText(staffDetailRecord.status || staffDetailRecord.submission_status, t)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("DSpace item ID")}>
                {staffDetailRecord.dspace_item_id ? (
                  <Text code copyable>
                    {staffDetailRecord.dspace_item_id}
                  </Text>
                ) : (
                  "—"
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t("Created at")}>
                {formatDateTime(staffDetailRecord.created_at, lang)}
              </Descriptions.Item>
              <Descriptions.Item label={t("Authors (resolved)")}>{staffDetailRecord.author || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Author user IDs")}>{formatUuidList(staffDetailRecord.author_user_ids)}</Descriptions.Item>
              <Descriptions.Item label={t("Author snapshot (stored)")}>
                {staffDetailRecord.author_snapshot || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Reviewers (resolved)")}>{staffDetailRecord.reviewer || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Reviewer user IDs")}>{formatUuidList(staffDetailRecord.reviewer_user_ids)}</Descriptions.Item>
              <Descriptions.Item label={t("Reviewer snapshot (stored)")}>
                {staffDetailRecord.reviewer_snapshot || "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("Abstract")}>{staffDetailRecord.abstract || "—"}</Descriptions.Item>
              <Descriptions.Item label={t("Description")}>{staffDetailRecord.description || "—"}</Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>{t("Files")}</Title>
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
                        >{t("Open")}</Button>
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
                <Text type="secondary">{t("No files")}</Text>
              )}
            </div>
            <div>
              <Title level={5}>{t("Per-reviewer reviews")}</Title>
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
                          <Text type="secondary">{t("decision")}</Text>
                          <Tag color={reviewDecisionColor(r.decision)}>{decisionText(r.decision, t)}</Tag>
                          <Text type="secondary">{t("status")}</Text>
                          <Tag>{statusText(r.status, t)}</Tag>
                        </Space>
                        <div>
                          <Text type="secondary">{t("Comment:")}</Text>
                          {r.comment ? r.comment : "—"}
                        </div>
                        <div>
                          <Text type="secondary">{t("Decided at:")}</Text>
                          {r.decidedAt ? formatDateTime(r.decidedAt, lang) : "—"}
                        </div>
                      </Space>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Text type="secondary">{t("No review rows")}</Text>
              )}
            </div>
            <div>
              <Title level={5}>{t("Workflow History")}</Title>
              {renderWorkflowHistory(staffDetailRecord.workflow_history)}
            </div>
          </Space>
        ) : null}
      </Modal>
      <Modal
        title={t("Reject thesis")}
        open={rejectModalOpen}
        onOk={confirmReject}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectTargetId(null);
          setRejectReason("");
        }}
        okText={t("Reject")}
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">{t("Please provide a clear reason for rejection.")}</Paragraph>
        <TextArea rows={4} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
      </Modal>
      <Modal
        title={t("Library intake reject")}
        open={libraryRejectModalOpen}
        onOk={confirmLibraryReject}
        onCancel={() => {
          setLibraryRejectModalOpen(false);
          setLibraryRejectTargetId(null);
          setLibraryRejectReason("");
        }}
        okText={t("Reject")}
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">{t("Please provide a clear reason for rejection.")}</Paragraph>
        <TextArea rows={4} value={libraryRejectReason} onChange={(event) => setLibraryRejectReason(event.target.value)} />
      </Modal>
      <Modal
        title={t("Director reject")}
        open={directorRejectModalOpen}
        onOk={confirmDirectorReject}
        onCancel={() => {
          setDirectorRejectModalOpen(false);
          setDirectorRejectTargetId(null);
          setDirectorRejectReason("");
        }}
        okText={t("Reject")}
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">{t("Please provide a clear reason for rejection.")}</Paragraph>
        <TextArea
          rows={4}
          value={directorRejectReason}
          onChange={(event) => setDirectorRejectReason(event.target.value)}
        />
      </Modal>
      <Modal
        title={t("Change password")}
        open={passwordModalOpen}
        onCancel={() => {
          setPasswordModalOpen(false);
          passwordForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          {auth?.user?.hasPassword === false ? (
            <Paragraph type="secondary">{t("This account has no password yet. Set one to sign in with your username.")}</Paragraph>
          ) : (
            <Form.Item
              label={t("Current password")}
              name="currentPassword"
              rules={[{ required: true, message: t("Enter your current password") }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item
            label={t("New password")}
            name="newPassword"
            rules={[
              { required: true, message: t("Enter a new password") },
              { min: 6, message: t("Password must be at least 6 characters") }
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label={t("Confirm new password")}
            name="confirmPassword"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: t("Confirm your new password") },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t("Passwords do not match")));
                }
              })
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Space>
            <Button
              onClick={() => {
                setPasswordModalOpen(false);
                passwordForm.resetFields();
              }}
            >{t("Cancel")}</Button>
            <Button type="primary" htmlType="submit" loading={changingPassword}>{t("Update password")}</Button>
          </Space>
        </Form>
      </Modal>
    </Layout>
  );
}

export default App;
