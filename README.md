# Thesis Portal

Cổng nộp và lưu trữ luận văn điện tử cho Trường Đại học Bách khoa — ĐHQG-HCM (HCMUT).

## Giới thiệu

Sinh viên nộp luận văn PDF theo đợt. Phản biện xét duyệt học thuật, nhân viên thư viện tiếp nhận, giám đốc thư viện lưu trữ lên DSpace. Quản trị viên cấu hình người dùng, phân quyền, form nộp bài và thông số hệ thống.

Luồng xử lý:

```text
Sinh viên lưu nháp / nộp bài
        ↓
reviewing — phản biện duyệt hoặc từ chối
        ↓
(mọi phản biện đã duyệt)
        ↓
Thư viện tiếp nhận — duyệt hoặc từ chối
        ↓
approved — giám đốc lưu trữ (archived) lên DSpace
        hoặc
rejected — sinh viên chỉnh sửa và nộp lại
```

| Vai trò | Việc chính |
| --- | --- |
| `student` | Nộp luận văn, theo dõi trạng thái, nộp lại khi bị từ chối |
| `reviewer` | Phản biện các bài được gán |
| `library_staff` | Tiếp nhận bài đã qua phản biện |
| `director` | Phê duyệt lưu trữ và đẩy lên DSpace |
| `admin` | Người dùng, phân quyền, form nộp, cấu hình hệ thống |

Giới hạn nộp bài: file PDF, tối đa 30 MB. Mỗi sinh viên có một bản nháp và tối đa một luận văn đang trong quy trình.

| Thành phần | Công nghệ |
| --- | --- |
| `frontend/` | React, Vite, Ant Design |
| `backend/` | NestJS |
| `db/init/001_schema.sql` | PostgreSQL 16 (cùng nội dung với `db/thesis_portal_full.sql`) |
| `docker-compose.yml` | Postgres, API, giao diện, Mailpit |

Đăng nhập mặc định bằng tên và mật khẩu. Quản trị viên có thể bật Google OAuth cho tài khoản `@hcmut.edu.vn`. Email thông báo quy trình dùng SMTP; khi phát triển có thể xem thư tại Mailpit.

## Cài đặt

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Compose v2)
- Git

Chạy API và giao diện trên máy (không qua container) thì cần thêm Node.js 22.

### Cách 1 — Docker Compose

Đứng ở thư mục gốc repo:

```bash
docker compose up --build
```

| Dịch vụ | Địa chỉ |
| --- | --- |
| Giao diện | http://localhost:5173 |
| API | http://localhost:3000 |
| Kiểm tra API | http://localhost:3000/health |
| Mailpit (hộp thư local) | http://localhost:8025 |
| Postgres | `localhost:5433` (user `thesis_user`, db `thesis_portal`, mật khẩu `thesis_pass`) |

Postgres chỉ chạy script trong `db/init/` lần đầu, khi volume còn trống. `db/thesis_portal_full.sql` là bản sao để chạy tay bằng `psql`, không được mount vào container.

Dừng stack:

```bash
docker compose down
```

Tạo lại database từ đầu (xóa dữ liệu trong volume):

```bash
docker compose down -v
docker compose up --build
```

### Cách 2 — Node trên máy, Postgres trong Docker

Chỉ bật Postgres:

```bash
docker compose up -d postgres
```

Trong thư mục `backend`:

```bash
npm install
```

PowerShell:

```powershell
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "5433"
$env:POSTGRES_DB = "thesis_portal"
$env:POSTGRES_USER = "thesis_user"
$env:POSTGRES_PASSWORD = "thesis_pass"
$env:JWT_SECRET = "dev-secret-change-me"
npm run start:dev
```

bash:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5433
export POSTGRES_DB=thesis_portal
export POSTGRES_USER=thesis_user
export POSTGRES_PASSWORD=thesis_pass
export JWT_SECRET=dev-secret-change-me
npm run start:dev
```

Postgres trong container lắng nghe cổng 5432. Compose map cổng đó ra **5433** trên máy host, nên `DB_PORT` phải là `5433`.

Trong thư mục `frontend`:

```bash
npm install
npm run dev
```

Giao diện: http://localhost:5173. Vite chuyển `/api` sang `http://localhost:3000`.

### Biến môi trường

Đăng nhập bằng tài khoản local không cần file `.env`. SMTP và Google OAuth thì copy mẫu rồi điền secret trên máy — không commit `.env`.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Docker Compose đọc `.env` ở thư mục gốc. `npm run start:dev` trong `backend/` đọc `backend/.env` hoặc `.env` ở thư mục gốc.

Email: bật `EMAIL_ENABLED=true` và điền SMTP. Seed database để `email_enabled` là `false` cho đến khi quản trị viên bật trong System settings. Giá trị trong System settings được dùng trước; biến môi trường chỉ được dùng khi ô tương ứng để trống. Lỗi gửi thư không làm fail quy trình nộp bài.

Google: điền `GOOGLE_CLIENT_SECRET`. Redirect URI trên Google Cloud phải là `http://localhost:3000/auth/google/callback`, JavaScript origin là `http://localhost:5173`. Nếu màn hình consent đang ở chế độ Testing, thêm người dùng `@hcmut.edu.vn`.

DSpace: trong System settings đặt `dspace_api_base_url`, `dspace_api_user` và `dspace_api_password` (hoặc biến `DSPACE_API_*`). Giám đốc lưu trữ bài thì hệ thống mới publish lên DSpace. Script tạo cây community nằm trong [`scripts/README.md`](scripts/README.md).

### Tài khoản mẫu

Script khởi tạo tạo sẵn các tài khoản sau (chỉ dùng cho máy local):

| Username | Mật khẩu | Vai trò |
| --- | --- | --- |
| `student1` | `student123` | student |
| `tuan.ngonhat` | `student123` | student |
| `reviewer1` | `review123` | reviewer |
| `library1` | `library123` | library_staff |
| `director1` | `director123` | director |
| `admin1` | `admin123` | admin |

Script khởi tạo đã có 11 khoa HCMUT. Học kỳ và đợt nộp thì tạo trên giao diện hoặc đồng bộ từ DSpace.

## Tài liệu thêm

- Cách dùng theo vai trò: [`docs/huong-dan-su-dung-theo-vai-tro.md`](docs/huong-dan-su-dung-theo-vai-tro.md)
- API: [`docs/api/README.md`](docs/api/README.md)
- Script DSpace: [`scripts/README.md`](scripts/README.md)
