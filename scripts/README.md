# Scripts

Script phụ trợ cho Thesis Portal. Chúng gọi DSpace REST API để tạo hoặc xem cây community, không cài Portal và không cần `npm install`.

## Giới thiệu

Portal map khoa / học kỳ / đợt nộp theo **tên** (đã bỏ dấu) với cây DSpace. Hai script seed tạo cây đó; `inspect.ps1` in cây đang có trên DSpace.

```text
root community
└── khoa (sub-community)          × 11 HCMUT
    └── Hoc ky 1 - 2025           (sub-community)
        └── Dot nop HK1/2025      (collection)
```

| File | Việc làm |
|------|----------|
| `dspace-seed-hierarchy.ps1` | Tạo cây trên Windows (PowerShell) |
| `dspace-seed-hierarchy.sh` | Cùng logic, chạy bằng bash |
| `inspect.ps1` | Đăng nhập rồi in community → collection → item |

Hai script seed giữ cùng logic: sửa một bên thì sửa bên kia. Tên khoa là ASCII để Portal sync (bỏ dấu) vẫn khớp.

Cả hai seed đều:

- Đăng nhập bằng `GET /api/security/csrf` rồi `POST /api/authn/login`, dùng Bearer + cookie XSRF (`curl` + cookie jar).
- Hoặc nhận sẵn Bearer / XSRF, không đăng nhập lại.
- Gắn cây dưới community có sẵn khi có `DSPACE_PARENT_COMMUNITY_ID`.
- Tạo đúng [RestContract](https://github.com/DSpace/RestContract/blob/main/communities.md): `POST /api/core/communities?parent=<uuid>` và `POST /api/core/collections?parent=<uuid>`.

## Cài đặt

1. Clone repo và đứng ở thư mục gốc project (ví dụ `d:\bam\Study\252\project`).
2. DSpace 7 REST phải đang chạy. URL mặc định: `http://localhost:8080/server`.
3. Cài tool theo hệ điều hành. Script không cài package riêng.

**Windows (seed `.ps1` và `inspect.ps1`)**

- PowerShell 5.1 trở lên (có sẵn trên Windows 10/11).
- `curl.exe` (có sẵn trên Windows 10 trở lên). Kiểm tra: `curl.exe --version`.
- Nếu PowerShell chặn script:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Bash (Git Bash, Linux, macOS)**

- `bash` và `curl`.
- `jq` hoặc `python3` (script dùng một trong hai để đọc `id` từ JSON).

```bash
curl --version
jq --version || python3 --version
```

Không commit mật khẩu, token, hay `cookies.txt`. Báo cáo seed ghi vào `scripts/out/` (thư mục này nằm trong `.gitignore`).

## Chạy seed

Điền user/password của EPerson DSpace có quyền tạo community. Giá trị dưới đây là tài khoản demo local.

### PowerShell

```powershell
cd d:\bam\Study\252\project\scripts
.\dspace-seed-hierarchy.ps1 `
  -BaseUrl "http://localhost:8080/server" `
  -User "admin@mail.com" `
  -Password "123456789" `
  -RootName "Truong Dai hoc Bach Khoa TPHCM"
```

Gắn dưới community có sẵn: thêm `-ParentCommunityId "<uuid>"`.

### Bash

```bash
export DSPACE_BASE_URL="http://localhost:8080/server"
export DSPACE_USER="admin@mail.com"
export DSPACE_PASSWORD="123456789"
export DSPACE_ROOT_NAME="Truong Dai hoc Bach Khoa TPHCM"
# optional: export DSPACE_PARENT_COMMUNITY_ID="<uuid>"
bash scripts/dspace-seed-hierarchy.sh
```

Biến môi trường dùng chung: `DSPACE_BASE_URL`, `DSPACE_USER`, `DSPACE_PASSWORD`, `DSPACE_BEARER`, `DSPACE_XSRF`, `DSPACE_PARENT_COMMUNITY_ID`, `DSPACE_ROOT_NAME`.

Báo cáo: `scripts/out/dspace-seed-*.csv` (PowerShell) hoặc `.tsv` (bash).

## Kiểm tra cây

`inspect.ps1` đăng nhập rồi in community gốc, sub-community, collection và item.

```powershell
cd d:\bam\Study\252\project\scripts
.\inspect.ps1 `
  -BaseUrl "http://localhost:8080/server" `
  -User "admin@mail.com" `
  -Password "123456789"
```

Cùng ba biến: `DSPACE_BASE_URL`, `DSPACE_USER`, `DSPACE_PASSWORD`.

## Sau khi seed

1. Copy UUID community gốc vào System settings `dspace_root_community_id`.
2. Tên khoa / học kỳ / đợt nộp trên Portal phải trùng tên trên DSpace (sau khi chuẩn hóa).
3. Gọi `POST /archive-config/dspace/sync-from-root` để Portal map cây vừa tạo.
