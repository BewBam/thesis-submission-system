# Thiết kế chi tiết hệ thống

## Thesis Deposit Portal — nộp lưu chiểu luận văn/luận án tích hợp DSpace

Tài liệu này mô tả kiến trúc và thiết kế theo **trạng thái triển khai hiện tại** trong mã nguồn.  
Tham chiếu: [`huong-dan-su-dung-theo-vai-tro.md`](./huong-dan-su-dung-theo-vai-tro.md), [`user-roles.md`](./user-roles.md), [`faculty-archives-and-submission-periods.md`](./faculty-archives-and-submission-periods.md).

> **Lưu ý:** [`tai-lieu-thiet-ke-he-thong.md`](./tai-lieu-thiet-ke-he-thong.md) còn phản ánh mô hình cũ (3 vai trò, status `approving`/`reject`). Khi có xung đột, lấy tài liệu này và code làm chuẩn.

---

## 1. System Architecture

### 1.1 Kiến trúc tổng thể

```mermaid
flowchart TB
  subgraph Client["Presentation Layer"]
    FE["React SPA<br/>Ant Design + Vite<br/>App / AdminPanel / LibraryArchivePanel"]
  end

  subgraph API["Application Layer — NestJS"]
    AUTH["AuthModule<br/>JWT + RolesGuard"]
    USERS["UsersModule"]
    SUB["SubmissionsModule"]
    REV["ReviewsModule"]
    ARC["ArchiveModule"]
    ADM["AdminModule"]
  end

  subgraph Data["Data Layer"]
    PG[(PostgreSQL 16<br/>workflow + config + metadata)]
    FS["Local File Storage<br/>uploads/incoming"]
  end

  subgraph External["External / Optional"]
    DS["DSpace 7 REST API<br/>community / collection / item"]
  end

  FE -->|HTTP + Bearer JWT<br/>multipart PDF| AUTH
  FE --> USERS
  FE --> SUB
  FE --> REV
  FE --> ARC
  FE --> ADM

  AUTH --> PG
  USERS --> PG
  SUB --> PG
  SUB --> FS
  REV --> PG
  REV -->|publish after library approve| DS
  ARC --> PG
  ARC -->|provision| DS
  ADM --> PG
```

### 1.2 Nguyên tắc thiết kế

| Nguyên tắc | Mô tả |
| ---------- | ----- |
| Tách lớp | Frontend chỉ gọi REST NestJS; không gọi DSpace trực tiếp |
| Workflow trong Postgres | Trạng thái bài nộp, review, events, đợt nộp lưu ở PostgreSQL |
| DSpace là kho lưu trữ | Khi cấu hình `dspace_api_*`, backend provision community/collection và publish item |
| Phân quyền theo role | JWT chứa `role`; guard `@Roles()` bảo vệ endpoint |
| File tạm local | PDF lưu `uploads/incoming` cho tới khi (hoặc song song với) publish DSpace |

### 1.3 Vai trò người dùng

| Role | Nhiệm vụ |
| ---- | -------- |
| `student` | Nháp / nộp / nộp lại; chọn đợt, tác giả, reviewer |
| `reviewer` | Duyệt học thuật trên bài được gán |
| `library_staff` | Intake sau khi mọi reviewer approve; cấu hình archive |
| `director` | Archive bài `approved` → `archived` |
| `admin` | Users / roles / system settings — không duyệt luận văn |

### 1.4 Workflow trạng thái

```mermaid
flowchart LR
  D[draft] -->|Submit| R[reviewing]
  R -->|1 reviewer reject| X[rejected]
  R -->|all reviewers approve| L[Library queue<br/>status vẫn reviewing]
  L -->|library approve| A[approved]
  L -->|library reject| X
  A -->|director archive| AR[archived + DSpace publish]
  X -->|student resubmit| R
  A -->|student submit again| R
```

Trạng thái hợp lệ: `draft` | `reviewing` | `approved` | `rejected` | `archived`.

---

## 2. Database Design (ERD)

### 2.1 Sơ đồ thực thể quan hệ

```mermaid
erDiagram
  UNIVERSITIES ||--o{ FACULTIES : has
  FACULTIES ||--o{ SEMESTERS : has
  FACULTIES ||--o{ SUBMISSION_PERIODS : has
  SEMESTERS ||--o{ SUBMISSION_PERIODS : scoped_by
  FACULTIES ||--o{ USERS : "optional faculty_id"
  SUBMISSION_PERIODS ||--o{ SUBMISSIONS : "period of"

  USERS ||--o{ SUBMISSIONS : "student_id FK"
  USERS ||--o{ SUBMISSION_AUTHORS : "co-author"
  USERS ||--o{ REVIEWS : "reviewer_id FK"
  USERS ||--o{ SUBMISSION_EVENTS : "actor_id FK nullable"

  SUBMISSIONS ||--o{ SUBMISSION_FILES : has
  SUBMISSIONS ||--o{ SUBMISSION_AUTHORS : has
  SUBMISSIONS ||--o{ REVIEWS : "assignment + decision"
  SUBMISSIONS ||--o{ SUBMISSION_EVENTS : logs

  UNIVERSITIES {
    uuid id PK
    text name
    text code UK
    text status
    timestamptz created_at
  }

  FACULTIES {
    uuid id PK
    uuid university_id FK
    text code
    text name
    text status
    text dspace_community_id
    text dspace_sync_status
    text created_by
    timestamptz updated_at
  }

  SEMESTERS {
    uuid id PK
    uuid faculty_id FK
    text code
    text name
    text status
    text dspace_community_id
    text dspace_collection_id
    text collection_name
    text dspace_sync_status
  }

  SUBMISSION_PERIODS {
    uuid id PK
    uuid faculty_id FK
    uuid semester_id FK
    text name
    timestamptz opens_at
    timestamptz closes_at
    text status
    boolean allow_resubmit
  }

  USERS {
    uuid id PK
    text username UK
    text password
    text display_name
    text role
    text status
    uuid faculty_id FK
    timestamptz created_at
  }

  SUBMISSIONS {
    uuid id PK
    text title
    text title_vi
    text title_en
    text author
    text advisor
    text thesis_advisors
    text abstract
    text keywords
    text major
    text thesis_year
    text student_email
    uuid student_id FK
    text status
    uuid submission_period_id FK
    text dspace_item_id
    text university_name
    text faculty_name
    text semester_name
    timestamptz created_at
  }

  SUBMISSION_FILES {
    uuid id PK
    uuid submission_id FK
    text file_name
    text file_url
    text file_type
  }

  SUBMISSION_AUTHORS {
    uuid submission_id PK_FK
    uuid user_id PK_FK
    int sort_order
  }

  REVIEWS {
    uuid submission_id PK_FK
    uuid reviewer_id PK_FK
    uuid id
    text decision
    text comment
    int sort_order
    timestamptz decided_at
  }

  SUBMISSION_EVENTS {
    uuid id PK
    uuid submission_id FK
    uuid actor_id FK
    text actor_role
    text event_type
    jsonb payload
    timestamptz created_at
  }

  ROLE_PERMISSIONS {
    text role PK
    text permission PK
    boolean allowed
  }

  SYSTEM_SETTINGS {
    text key PK
    text value
    text description
    timestamptz updated_at
  }
```

### 2.2 Enum và ràng buộc

| Trường | Giá trị |
| ------ | ------- |
| `users.role` | `student`, `reviewer`, `library_staff`, `director`, `admin` |
| `users.status` | `active`, `disabled` |
| `submissions.status` | `draft`, `reviewing`, `approved`, `rejected`, `archived` |
| `reviews.decision` | `pending`, `approved`, `reject` |
| `submission_periods.status` | `draft`, `open`, `closed`, `archived` |
| `faculties/semesters.dspace_sync_status` | `pending`, `synced`, `failed` |

**Ràng buộc nghiệp vụ nổi bật**

- `submissions.student_id` → `users(id)` (UUID FK); đã bỏ `advisor_id` legacy.
- `submission_events.actor_id` → `users(id)` (nullable FK).
- `reviews` là nguồn sự thật cho **gán reviewer + quyết định** (`decision`, `sort_order`); bảng `submission_reviewers` đã gỡ.
- Mỗi sinh viên tối đa **một** submission không ở trạng thái `draft` (`idx_submissions_one_active_per_student`).
- Mỗi sinh viên tối đa **một** `draft` (`idx_submissions_one_draft_per_student`); Save draft upsert; Submit chuyển draft → `reviewing`.
- **Submitter** (người tạo/nộp) là người duy nhất được edit / draft / submit / resubmit bài đó. Đồng tác giả thấy bài (kể cả draft) trong My submissions nhưng chỉ **Detail** — không tạo draft/edit/nộp thesis khác; form không autofill từ bài đồng tác giả.
- Khi submit: hệ thống **xóa draft** của mọi author trong danh sách (trừ chính submission đang nộp).
- Sinh viên đã là submitter hoặc author trên bài không-draft thì không được tạo/giữ draft riêng.
- Tối đa **một** đợt `open` mỗi khoa (`idx_one_open_period_per_faculty`).
- Bài không-draft: submitter phải có trong `submission_authors` (constraint trigger `trg_submitter_is_author`, deferred).
- Index: `submissions(status)`, `submissions(student_id)`, `submissions(submission_period_id)`, `reviews(reviewer_id, decision)`.
- File luận văn: PDF, tối đa 30 MB (`thesis_max_file_size_mb`).

### 2.3 Nguồn schema

Script khởi tạo: `db/init/001_schema.sql` … `028_one_draft_per_student.sql`.

**DB hiện có:** chạy migration `026` trên Postgres, hoặc `docker compose down -v && docker compose up --build` để init lại.

---

## 3. API Design

**Base URL (local):** `http://localhost:3000`  
**Auth header:** `Authorization: Bearer <access_token>` (trừ login / health / root)

### 3.1 Auth và hệ thống

| Method | Path | Role | Mô tả |
| ------ | ---- | ---- | ----- |
| GET | `/` | public | Root info |
| GET | `/health` | public | Health check |
| POST | `/auth/login` | public | `{ username, password }` → JWT + user |

### 3.2 Users

| Method | Path | Role | Mô tả |
| ------ | ---- | ---- | ----- |
| GET | `/users?role=` | authenticated | Dropdown theo role (`student`, `reviewer`, …) |

### 3.3 Submissions

| Method | Path | Role | Mô tả |
| ------ | ---- | ---- | ----- |
| POST | `/submissions` | student | Nộp mới (multipart) |
| POST | `/submissions/drafts` | student | Lưu nháp |
| PATCH | `/submissions/:submissionId` | student | Cập nhật nháp |
| POST | `/submissions/:submissionId/submit` | student | Submit / resubmit |
| POST | `/submissions/:submissionId/revert-to-draft` | student | Về nháp (điều kiện) |
| DELETE | `/submissions/:submissionId` | student | Xóa (điều kiện) |
| GET | `/submissions` | library_staff, director | Tất cả bài nộp |
| GET | `/submissions/student/:studentId` | student\*, library_staff, director | Bài theo sinh viên |
| GET | `/submissions/:submissionId/files/:fileId/download` | student, reviewer, library_staff, director | Tải / xem PDF |

\*Student chỉ xem khi `:studentId` = chính mình.

**Multipart fields (tóm tắt):** `studentId`, `authorIds` (JSON), `reviewerIds` (JSON), `submissionPeriodId`, metadata (`titleVi`, `titleEn`, `thesisAdvisors`, `major`, `thesisYear`, `abstract`, `keywords`, …), `thesisFile`.

### 3.4 Reviews

| Method | Path | Role | Body / ghi chú |
| ------ | ---- | ---- | -------------- |
| GET | `/reviews/my-queue` | reviewer | Hàng đợi gán cho reviewer |
| POST | `/reviews/action` | reviewer | `{ submissionId, action: "approve"\|"reject", comment? }` — reject bắt buộc comment |
| GET | `/reviews/library-queue` | library_staff | Bài ready intake (mọi reviewer approved, status vẫn `reviewing`) |
| POST | `/reviews/library-action` | library_staff | approve → `approved` (+ publish DSpace best-effort); reject → `rejected` |
| GET | `/reviews/director-queue` | director | `status = approved` |
| POST | `/reviews/director-action` | director | `{ submissionId, action: "archive" }` → `archived` |

### 3.5 Archive (sinh viên chọn đợt nộp)

| Method | Path | Role |
| ------ | ---- | ---- |
| GET | `/archive/faculties` | student |
| GET | `/archive/faculties/:facultyId/semesters` | student |
| GET | `/archive/submission-periods?facultyId=&semesterId=` | student |

### 3.6 Archive config

| Method | Path | Role ghi |
| ------ | ---- | -------- |
| GET | `/archive-config/universities` | library_staff, admin, director |
| GET | `/archive-config/faculties` | library_staff, admin, director |
| POST | `/archive-config/faculties` | library_staff, admin |
| PATCH | `/archive-config/faculties/:facultyId` | library_staff, admin |
| POST | `/archive-config/faculties/:facultyId/provision-dspace` | library_staff, admin |
| POST | `/archive-config/dspace/sync-from-root` | library_staff, admin | Map DSpace root→khoa→HK→đợt theo tên |
| GET/POST | `/archive-config/faculties/:facultyId/semesters` | GET: +director; POST: library_staff, admin |
| GET/POST | `/archive-config/faculties/:facultyId/submission-periods` | tương tự |
| POST | `/archive-config/submission-periods/:periodId/open` | library_staff, admin |
| POST | `/archive-config/submission-periods/:periodId/close` | library_staff, admin |

### 3.7 Admin

| Method | Path | Role |
| ------ | ---- | ---- |
| GET | `/admin/users` | admin |
| POST | `/admin/users` | admin |
| PATCH | `/admin/users/:userId` | admin |
| GET | `/admin/roles` | admin |
| GET | `/admin/roles/meta` | admin |
| PUT | `/admin/roles/:role` | admin |
| GET | `/admin/settings` | admin |
| PATCH | `/admin/settings` | admin |

Chi tiết từng endpoint (một phần): [`api/README.md`](./api/README.md).

### 3.8 Phân quyền theo permission (DB-driven)

API bảo vệ bằng `JwtAuthGuard` + `PermissionsGuard` và decorator `@RequirePermissions(...)`.  
Guard đọc bảng `role_permissions` (cache ~30s; invalidate khi admin cập nhật roles).

| Permission | Endpoint điển hình |
| ---------- | ------------------ |
| `submit_thesis` | Nộp/nháp, `/archive/*` (student), `GET /users` |
| `review_academic` | `/reviews/my-queue`, `/reviews/action` |
| `library_intake` | `/reviews/library-*`, ghi `/archive-config` |
| `director_approval` | `/reviews/director-*` |
| `view_all_submissions` | `GET /submissions`, đọc archive-config |
| `manage_users` / `manage_roles` / `configure_system` | `/admin/*` |

User cần **ít nhất một** permission trong danh sách decorator (OR).

---

## 4. Component Design

### 4.1 Frontend

```mermaid
flowchart TB
  MAIN["main.jsx"] --> APP["App.jsx<br/>Auth + role router"]
  APP --> LOGIN["Login Form"]
  APP --> STU["Student Workspace<br/>period wizard, form, drafts, my submission"]
  APP --> REV["Reviewer Workspace<br/>Need / Approved / Rejected"]
  APP --> LIB["Library tabs"]
  APP --> DIR["Director tabs"]
  APP --> ADM["AdminPanel.jsx"]
  LIB --> ARCUI["LibraryArchivePanel.jsx"]
  DIR --> ARCUI
```

| Component | File | Trách nhiệm |
| --------- | ---- | ----------- |
| Bootstrap | `frontend/src/main.jsx` | Mount React app |
| App shell | `frontend/src/App.jsx` | Auth localStorage, gọi API, dashboard theo role, form nộp bài, review UI |
| Admin | `frontend/src/AdminPanel.jsx` | Manage users, roles, system settings |
| Archive UI | `frontend/src/LibraryArchivePanel.jsx` | Universities / faculties / semesters / periods |

### 4.2 Backend (NestJS)

```mermaid
flowchart LR
  subgraph Nest["AppModule"]
    AM[AuthModule]
    UM[UsersModule]
    SM[SubmissionsModule]
    RM[ReviewsModule]
    AR[ArchiveModule]
    AD[AdminModule]
  end

  AM --> JwtStrategy
  UM --> PermissionsService
  SM --> SubmissionsService
  SM --> DiskUpload
  RM --> ReviewsService
  RM --> DspacePublishService
  AR --> ArchiveConfigService
  AR --> SubmissionPeriodsService
  AR --> DspaceProvisionerService
  AD --> AdminUsersService
  AD --> AdminRolesService
  AD --> AdminSettingsService
```

| Lớp | Thành phần | Vai trò |
| --- | ---------- | ------- |
| Controller | `*.controller.ts` | HTTP routing, `@RequirePermissions`, multipart |
| Service | `*.service.ts` | Nghiệp vụ + SQL (`pg` pool) |
| DTO | `dto/*.dto.ts` | Validate input (class-validator) |
| Guard | `JwtAuthGuard`, `PermissionsGuard` | JWT + quyền từ `role_permissions` |
| Permissions | `PermissionsService` | Cache / invalidate quyền theo role |
| Integration | `DspaceProvisionerService`, `DspacePublishService` | Community/collection/item DSpace hoặc placeholder `dev-*` |

### 4.3 Permissions (logic admin)

| Permission | Ý nghĩa |
| ---------- | ------- |
| `submit_thesis` | Nộp luận văn |
| `review_academic` | Phản biện học thuật |
| `library_intake` | Tiếp nhận thư viện |
| `director_approval` | Archive cấp giám đốc |
| `view_all_submissions` | Xem mọi bài nộp |
| `manage_users` | Quản lý user |
| `manage_roles` | Quản lý quyền role |
| `configure_system` | Cấu hình hệ thống |

Guard API hiện gắn cứng theo `@Roles(...)`; bảng `role_permissions` phục vụ cấu hình UI admin.

---

## 5. Sequence Diagram

### 5.1 Đăng nhập

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend
  participant API as AuthController
  participant US as UsersService
  participant DB as PostgreSQL

  U->>FE: username / password
  FE->>API: POST /auth/login
  API->>US: findByUsername
  US->>DB: SELECT users
  DB-->>US: user row
  alt invalid / disabled / maintenance
    API-->>FE: 401 Unauthorized
  else ok
    API-->>FE: access_token + user
    FE->>FE: save localStorage thesis_portal_auth
  end
```

### 5.2 Nộp bài → phản biện → thư viện → giám đốc

```mermaid
sequenceDiagram
  actor S as Student
  actor R as Reviewer
  actor L as Library Staff
  actor D as Director
  participant FE as Frontend
  participant SUB as Submissions API
  participant REV as Reviews API
  participant DB as PostgreSQL
  participant DS as DSpace / Placeholder
  participant FS as File Storage

  S->>FE: Chọn period + metadata + PDF
  FE->>SUB: POST /submissions/drafts optional
  SUB->>DB: INSERT draft
  SUB->>FS: save PDF
  FE->>SUB: POST /:id/submit
  SUB->>DB: status reviewing + reviews pending
  SUB-->>FE: ok

  loop Mỗi reviewer được gán
    R->>FE: Approve or Reject
    FE->>REV: POST /reviews/action
    REV->>DB: UPDATE reviews.decision
    alt reject
      REV->>DB: submissions.status = rejected
    else all approved
      Note over REV,DB: status vẫn reviewing — sẵn sàng library queue
    end
  end

  L->>FE: Library intake Approve
  FE->>REV: POST /reviews/library-action
  REV->>DB: status = approved

  D->>FE: Archive
  FE->>REV: POST /reviews/director-action archive
  REV->>DB: status = archived
  REV->>DS: auto-login + publishItem
  DS-->>REV: dspace_item_id
  REV->>DB: UPDATE dspace_item_id
```

### 5.3 Cấu hình đợt nộp và provision DSpace

```mermaid
sequenceDiagram
  actor L as Library Staff
  participant FE as Frontend
  participant CFG as ArchiveConfig API
  participant DB as PostgreSQL
  participant DS as DspaceProvisioner

  L->>FE: Tạo faculty / semester / period
  FE->>CFG: POST faculties / semesters / periods
  CFG->>DB: INSERT
  L->>FE: Provision DSpace
  FE->>CFG: POST .../provision-dspace
  CFG->>DS: create community / collection
  DS-->>CFG: ids real or dev-*
  CFG->>DB: UPDATE dspace columns
  L->>FE: Open period
  FE->>CFG: POST .../open
  CFG->>DB: period status = open
```

---

## 6. Deployment Diagram

### 6.1 Môi trường Docker Compose (local)

```mermaid
flowchart TB
  subgraph Host["Host machine"]
    subgraph Compose["docker-compose.yml"]
      FE_C["thesis_frontend<br/>Vite container<br/>port 5173"]
      BE_C["thesis_backend<br/>NestJS container<br/>port 3000"]
      PG_C["thesis_postgres<br/>Postgres 16<br/>port 5432"]
      VOL[("volume pg_data")]
      INIT["./db/init → docker-entrypoint-initdb.d"]
    end
  end

  subgraph Optional["Optional / later"]
    DS_C["DSpace 7 REST API"]
    VERCEL["Vercel FE demo"]
  end

  Browser["Browser"] -->|http://localhost:5173| FE_C
  FE_C -->|API_PROXY_TARGET http://backend:3000| BE_C
  BE_C -->|DB_HOST=postgres| PG_C
  PG_C --- VOL
  INIT -.-> PG_C
  BE_C -->|system_settings dspace_api_*| DS_C
  Browser -.->|demo deploy| VERCEL
  VERCEL -.->|API backend URL| BE_C
```

### 6.2 Mapping service

| Service | Build / Image | Port | Phụ thuộc | Biến môi trường chính |
| ------- | ------------- | ---- | --------- | --------------------- |
| `postgres` | `postgres:16` | 5432 | volume `pg_data`, SQL init | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| `backend` | `./backend` Dockerfile | 3000 | postgres | `DB_HOST=postgres`, `JWT_SECRET`, `PORT` |
| `frontend` | `./frontend` Dockerfile | 5173 | backend | `API_PROXY_TARGET=http://backend:3000` |

### 6.3 Khởi chạy

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Reset DB (chạy lại init SQL): `docker compose down -v && docker compose up --build`

### 6.4 Ghi chú vận hành

- DSpace: cấu hình `dspace_api_base_url` + `dspace_api_user` / `dspace_api_password` (auto-login). `dspace_api_token` chỉ là fallback. Director **Archive** publish item; có thể set env `DSPACE_API_*` trong `docker-compose.yml`.
- Upload PDF nằm trong filesystem container backend — production nên gắn volume riêng hoặc chuyển object storage / DSpace bitstream.
- Tài khoản demo: xem [`huong-dan-su-dung-theo-vai-tro.md`](./huong-dan-su-dung-theo-vai-tro.md).

---

## 7. Công nghệ sử dụng

| Lớp | Công nghệ |
| --- | --------- |
| Frontend | React 18, Ant Design 5, Vite 6 |
| Backend | NestJS 10, Passport JWT, Multer, class-validator, `pg` |
| Database | PostgreSQL 16 |
| Deploy local | Docker Compose |
| Kho học thuật | DSpace 7 REST (tùy cấu hình) |

---

## 8. Liên kết tài liệu liên quan

| Tài liệu | Nội dung |
| -------- | -------- |
| [`huong-dan-su-dung-theo-vai-tro.md`](./huong-dan-su-dung-theo-vai-tro.md) | Hướng dẫn sử dụng theo từng role |
| [`user-roles.md`](./user-roles.md) | Mô tả vai trò (cần đồng bộ với workflow rút gọn) |
| [`faculty-archives-and-submission-periods.md`](./faculty-archives-and-submission-periods.md) | Khoa / học kỳ / đợt nộp |
| [`huong-dan-kiem-tra-archive-dspace.md`](./huong-dan-kiem-tra-archive-dspace.md) | Sau Director Archive: kiểm tra Portal API + DSpace API |
| [`api/README.md`](./api/README.md) | Tài liệu API (một phần endpoint) |
| [`checklist.md`](./checklist.md) | Checklist sprint |
| [`../README.md`](../README.md) | Quick start |
