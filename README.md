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

Cài trên VM Debian 12, không Docker: mục [Cách 3](#cách-3--vm-debian-12-không-docker) bên dưới.

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

### Cách 3 — VM Debian 12 (không Docker)

Máy đích đã kiểm tra: Debian GNU/Linux 12 (bookworm), hostname `NopLV`. Lệnh dưới chạy bằng `root`. Bỏ qua mục IP tĩnh và SSH nếu đã đăng nhập được vào máy.

Thứ tự:

```text
IP tĩnh → SSH → Node.js 22 → PostgreSQL → clone source
    → backend NestJS (systemd) → frontend React → Nginx
    → DSpace (LXC) → HTTPS nếu có domain
```

Gói `postgresql` trên Debian 12 là PostgreSQL 15. Schema trong repo dùng SQL thông thường và chạy được trên bản này. Gói `nodejs` của Debian là bản 18, không dùng; cài Node.js 22 theo mục bên dưới.

#### IP tĩnh

Xem tên card mạng:

```bash
ip -br link
```

Sửa `/etc/network/interfaces` (đổi `eth0`, địa chỉ và gateway cho đúng mạng của VM):

```text
auto eth0
iface eth0 inet static
    address 192.168.1.50/24
    gateway 192.168.1.1
    dns-nameservers 1.1.1.1
```

```bash
systemctl restart networking
```

Restart mạng có thể ngắt phiên SSH. Nên có console của hypervisor.

#### SSH

```bash
apt update
apt install -y openssh-server
systemctl enable --now ssh
```

#### Node.js 22

```bash
apt install -y ca-certificates curl gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
```

`node -v` phải là v22.

#### PostgreSQL

```bash
apt install -y postgresql
```

Đặt mật khẩu riêng cho user database, không dùng mật khẩu mẫu của máy dev:

```bash
su - postgres -c "psql -c \"CREATE USER thesis_user WITH PASSWORD 'doi-mat-khau-nay';\""
su - postgres -c "psql -c \"CREATE DATABASE thesis_portal OWNER thesis_user;\""
```

Debian mặc định cho phép `127.0.0.1` đăng nhập bằng mật khẩu (`scram-sha-256`). App nối TCP tới `127.0.0.1:5432`, không dùng `DATABASE_URL`.

#### Clone source

```bash
apt install -y git
git clone <url-repo> /opt/thesis-portal
```

Nếu không clone bằng Git, chép cây source vào `/opt/thesis-portal` sao cho có `backend/`, `frontend/` và `db/`.

Nạp schema vào database trống:

```bash
PGPASSWORD='doi-mat-khau-nay' psql -h 127.0.0.1 -U thesis_user -d thesis_portal \
  -f /opt/thesis-portal/db/thesis_portal_full.sql
```

Script này tạo bảng và các tài khoản mẫu (`admin1` / `admin123`, …). Đổi mật khẩu các tài khoản đó trước khi mở máy ra mạng.

#### Backend NestJS

```bash
cd /opt/thesis-portal/backend
npm install
npm run build
mkdir -p uploads
```

Tạo `/opt/thesis-portal/backend/.env`. Không ghi `DATABASE_URL`: khi `NODE_ENV=production`, biến đó bật SSL và Postgres trên cùng máy sẽ từ chối kết nối.

```text
NODE_ENV=production
PORT=3000
JWT_SECRET=<chuỗi-ngẫu-nhiên>
DB_HOST=127.0.0.1
DB_PORT=5432
POSTGRES_DB=thesis_portal
POSTGRES_USER=thesis_user
POSTGRES_PASSWORD=doi-mat-khau-nay
FRONTEND_URL=http://192.168.1.50
```

Tạo `JWT_SECRET`:

```bash
openssl rand -hex 32
```

`FRONTEND_URL` là địa chỉ người dùng mở trên trình duyệt (IP tĩnh hoặc domain), không có cổng `5173`.

User hệ thống cho service, không chạy API bằng root:

```bash
useradd --system --home /opt/thesis-portal --shell /usr/sbin/nologin thesis
chown -R thesis:thesis /opt/thesis-portal
```

`/etc/systemd/system/thesis-portal.service`:

```ini
[Unit]
Description=Thesis Portal API
After=network.target postgresql.service

[Service]
Type=simple
User=thesis
Group=thesis
WorkingDirectory=/opt/thesis-portal/backend
EnvironmentFile=/opt/thesis-portal/backend/.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` phải là `backend/`. File PDF nộp bài nằm ở `backend/uploads/`.

```bash
systemctl daemon-reload
systemctl enable --now thesis-portal
curl -s http://127.0.0.1:3000/health
```

Kỳ vọng: `{"status":"ok"}`. Nest lắng nghe `0.0.0.0:3000`. Không mở cổng 3000 và 5432 ra ngoài; người dùng chỉ vào qua Nginx.

#### Frontend React

```bash
cd /opt/thesis-portal/frontend
npm install
npm run build
chown -R thesis:thesis /opt/thesis-portal/frontend
```

Bản build nằm ở `frontend/dist`. Giao diện gọi `/api/...`. Ở máy dev, Vite bỏ tiền tố `/api` rồi chuyển sang Nest. Trên VM, Nginx làm việc đó.

#### Nginx

```bash
apt install -y nginx
```

`/etc/nginx/sites-available/thesis-portal`:

```nginx
server {
    listen 80;
    server_name _;

    root /opt/thesis-portal/frontend/dist;
    index index.html;
    client_max_body_size 35m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Dấu `/` cuối ở `proxy_pass` bỏ tiền tố `/api/`. PDF tối đa 30 MB nên `client_max_body_size` để 35m. Khi có domain, đổi `server_name _` thành tên miền.

```bash
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/thesis-portal /etc/nginx/sites-enabled/thesis-portal
nginx -t
systemctl enable --now nginx
systemctl reload nginx
curl -s http://127.0.0.1/api/health
```

Mở `http://<ip-vm>/` trên trình duyệt. Đăng nhập `admin1` / `admin123`, rồi đổi mật khẩu.

#### Kết nối DSpace (LXC)

DSpace không cài trên VM này. Từ `NopLV` phải gọi được REST của LXC, ví dụ:

```bash
curl -sI http://<ip-lxc>/server/api
```

Trong Admin → System settings đặt:

| Khóa | Giá trị |
| --- | --- |
| `dspace_api_base_url` | `http://<ip-lxc>/server` |
| `dspace_api_user` | tài khoản DSpace |
| `dspace_api_password` | mật khẩu DSpace |
| `dspace_root_community_id` | UUID community gốc |

Có thể ghi cùng các khóa đó vào `backend/.env` dưới tên `DSPACE_API_BASE_URL`, `DSPACE_API_USER`, `DSPACE_API_PASSWORD`, `DSPACE_ROOT_COMMUNITY_ID`, rồi `systemctl restart thesis-portal`. Giá trị trong System settings được dùng trước.

Đợt nộp phải có `dspace_collection_id` là UUID thật trên DSpace. Archive vẫn ghi `archived` trong Postgres khi DSpace lỗi; `dspace_item_id` dạng `dev-item-...` nghĩa là chưa publish được.

#### HTTPS / domain

Khi đã có tên miền trỏ tới IP của VM:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d portal.example.edu.vn
```

Sửa `backend/.env`:

```text
FRONTEND_URL=https://portal.example.edu.vn
GOOGLE_CALLBACK_URL=https://portal.example.edu.vn/api/auth/google/callback
```

Redirect URI trên Google Cloud phải trùng `GOOGLE_CALLBACK_URL`. Trình duyệt gọi `/api/auth/google`; Nginx bỏ `/api` rồi Nest nhận `/auth/google`.

```bash
systemctl restart thesis-portal
```

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
