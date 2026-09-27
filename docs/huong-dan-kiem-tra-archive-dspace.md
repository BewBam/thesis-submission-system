# Hướng dẫn: Kiểm tra sau khi Director Archive (Portal API + DSpace API)

Tài liệu này giải thích **Director nhấn Archive rồi thì sao**, bài đã vào DSpace chưa, và cách **kiểm tra bằng API**.

Tham chiếu: [`huong-dan-su-dung-theo-vai-tro.md`](./huong-dan-su-dung-theo-vai-tro.md), [`thiet-ke-chi-tiet.md`](./thiet-ke-chi-tiet.md), [`faculty-archives-and-submission-periods.md`](./faculty-archives-and-submission-periods.md).

**Base URL mặc định (Docker local)**

| Service | URL |
|---------|-----|
| Portal backend | `http://localhost:3000` |
| Portal frontend | `http://localhost:5173` |
| DSpace REST (ví dụ) | `http://localhost:8080/server` (hoặc giá trị `dspace_api_base_url`) |

---

## 1. Director Archive rồi thì sao?

Chỉ bài ở trạng thái **`approved`** mới Archive được.

Luồng backend (`POST /reviews/director-action`):

1. **Commit ngay trong Portal DB**
   - `submissions.status` → `archived`
   - Ghi `submission_events`: `director_archived`, `status_changed`
2. **Sau đó (best-effort) publish lên DSpace**
   - Gọi `DspacePublishService.publishApprovedSubmission`
   - Collection: `COALESCE(period.dspace_collection_id, semester.dspace_collection_id)`
   - Tạo **item** đúng RestContract: `POST /api/core/items?owningCollection=<uuid>`
     (metadata: `dc.title`, authors, abstract, `dc.type=Thesis`)
   - Tạo bundle `ORIGINAL` và upload **PDF thesis** (`POST .../bundles/{id}/bitstreams`) nếu file còn trên disk
   - Lưu `submissions.dspace_item_id` (UUID thật). Nếu DSpace chưa cấu hình → `dev-item-*`
   - Portal vẫn `archived` kể cả khi publish lỗi (`dspacePublishError`)

Response director-action có thêm: `dspaceMode`, `bitstreamUploaded`, `dspacePdfWarning`, `dspacePublishMessage`.

**Lưu ý Docker:** file PDF nằm trong container (`uploads/`). Nếu volume không mount, item vẫn tạo nhưng PDF upload có thể fail (`dspacePdfWarning`).


**Quan trọng**

| Điểm | Chi tiết |
|------|----------|
| Archive vs DSpace | Archive **luôn thành công** trong Portal dù DSpace lỗi |
| PDF | Upload vào bundle `ORIGINAL` khi file thesis còn trên disk; nếu thiếu file → `dspacePdfWarning` |
| Chưa cấu hình DSpace | Backend vẫn gán `dspace_item_id` dạng `dev-item-<uuid>` (placeholder local) |
| Thiếu collection | Không publish; response có thể `dspaceItemId: null` |
| Đã có `dspace_item_id` | Không tạo item mới; trả lại ID cũ |

Response mẫu khi Archive:

```json
{ "ok": true, "dspaceItemId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

Hoặc khi publish lỗi (hiếm — catch outer):

```json
{ "ok": true, "dspaceItemId": null, "dspacePublishError": true }
```

Trên UI: toast “Archived and published to DSpace (…)” nếu có `dspaceItemId`; cảnh báo nếu `dspacePublishError`.

---

## 2. Đã lưu vào DSpace thật chưa?

| `dspace_item_id` | Ý nghĩa |
|------------------|---------|
| UUID chuẩn (không bắt đầu `dev-`) | Thường là item thật trên DSpace (hoặc ID DSpace trả về) |
| Bắt đầu bằng `dev-item-` | **Chưa** gọi DSpace thật (chưa cấu hình API, hoặc publish fallback) |
| `null` / rỗng | Chưa gán — thiếu collection hoặc chưa publish |

Cấu hình DSpace (Admin → System settings hoặc env `DSPACE_API_*`):

- `dspace_api_base_url` — từ **Docker backend** dùng `http://host.docker.internal:8080/server` (không dùng `localhost`)
- `dspace_api_user` + `dspace_api_password` (auto-login CSRF: `GET /api/security/csrf` → `POST /api/authn/login`), hoặc `dspace_api_token` (fallback)
- `dspace_root_community_id`
- Khoa/học kỳ đã provision → `semesters.dspace_collection_id` có giá trị (không phải chỉ `dev-collection-*` nếu muốn DSpace thật)

---

## 3. Kiểm tra bằng Portal API

### 3.1 Đăng nhập (lấy JWT)

Tài khoản bootstrap: `admin1` / `admin123` (tạo user director/library qua Admin nếu cần).

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin1\",\"password\":\"admin123\"}"
```

Lưu `access_token` từ response. Các lệnh sau dùng:

```bash
export TOKEN="<access_token>"
export SUBMISSION_ID="<uuid-bai-da-archive>"
```

Admin / library_staff cũng xem được danh sách bài (`view_all_submissions`).

### 3.2 Archive một bài (nếu đang test)

```bash
curl -s -X POST http://localhost:3000/reviews/director-action \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"submissionId\":\"$SUBMISSION_ID\",\"action\":\"archive\"}"
```

Xem `ok`, `dspaceItemId`, `dspacePublishError`.

### 3.3 Xem bài sau Archive

```bash
curl -s http://localhost:3000/submissions \
  -H "Authorization: Bearer $TOKEN"
```

Trong mảng JSON, tìm object có `id` = `$SUBMISSION_ID` và kiểm tra:

| Field | Kỳ vọng sau Archive thành công |
|-------|--------------------------------|
| `status` | `archived` |
| `dspace_item_id` | UUID hoặc `dev-item-...` |

PowerShell (lọc một bài):

```powershell
$TOKEN = "..."
$SUBMISSION_ID = "..."
$headers = @{ Authorization = "Bearer $TOKEN" }
(Invoke-RestMethod -Uri "http://localhost:3000/submissions" -Headers $headers) |
  Where-Object { $_.id -eq $SUBMISSION_ID } |
  Select-Object id, status, title, dspace_item_id
```

### 3.4 Xem hàng đợi Director (chỉ bài `approved` chờ Archive)

```bash
curl -s http://localhost:3000/reviews/director-queue \
  -H "Authorization: Bearer $TOKEN"
```

Sau Archive, bài **không** còn trong queue này.

### 3.5 Kiểm tra cấu hình DSpace trong Portal (admin)

```bash
# Đăng nhập admin (seed: thường admin1 / admin123 — xem db/init/003_seed_users.sql)
curl -s http://localhost:3000/admin/settings \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Các key liên quan: `dspace_api_base_url`, `dspace_api_user`, `dspace_api_password` (masked), `dspace_api_token` (masked), `dspace_root_community_id`.

### 3.5 Sync từ root và kiểm tra map

1. Admin/library set `dspace_root_community_id` (+ base URL, user, password).
2. Sync **import cây DSpace → Portal** (không tìm/khớp Portal theo tên hay code):
   - mọi community dưới root → **faculty** (upsert theo `dspace_community_id`)
   - mọi community dưới khoa → **semester** (upsert theo `dspace_community_id`)
   - mọi collection dưới học kỳ → **period** (upsert theo `dspace_collection_id`)
3. Gọi sync:

```bash
curl -s -X POST http://localhost:3000/archive-config/dspace/sync-from-root \
  -H "Authorization: Bearer $TOKEN"
```

4. Response: `matchedFaculties` / `matchedSemesters` / `matchedPeriods` (`created: true` nếu vừa tạo mới).
   `unmatched` thường rỗng với model này.
5. UI Library archive hiện Name / Status / DSpace ID sau sync.
6. Kiểm tra lại API:

```bash
curl -s http://localhost:3000/archive-config/faculties \
  -H "Authorization: Bearer $TOKEN"
# faculty.dspaceCommunityId

curl -s http://localhost:3000/archive-config/faculties/$FACULTY_ID/semesters \
  -H "Authorization: Bearer $TOKEN"
# semester.dspaceCommunityId, dspaceCollectionId

curl -s http://localhost:3000/archive-config/faculties/$FACULTY_ID/submission-periods \
  -H "Authorization: Bearer $TOKEN"
# period.dspaceCollectionId  ← đích publish ưu tiên
```

Chi tiết cấu trúc map: [`faculty-archives-and-submission-periods.md`](./faculty-archives-and-submission-periods.md) §5.4.

---

## 4. Kiểm tra bằng DSpace REST API

Chỉ áp dụng khi `dspace_item_id` **không** phải `dev-item-*` và `dspace_api_base_url` trỏ đúng server.

### 4.1 Login DSpace 7 (lấy Bearer token)

```bash
export DSPACE=http://localhost:8080/server   # sửa theo môi trường
export DSPACE_USER=admin@example.com
export DSPACE_PASS=changeme

curl -s -X POST "$DSPACE/api/authn/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user=$DSPACE_USER&password=$DSPACE_PASS" \
  -D - -o /dev/null
```

Header `Authorization: Bearer ...` nằm trong response headers (DSpace 7). Hoặc dùng client đã login sẵn.

Ví dụ lấy token (nếu API trả JSON body — tùy phiên bản):

```bash
# Nhiều bản DSpace trả token qua header Authorization sau login
curl -si -X POST "$DSPACE/api/authn/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user=$DSPACE_USER&password=$DSPACE_PASS"
```

```bash
export DSPACE_TOKEN="<bearer-tu-header-Authorization>"
export ITEM_ID="<dspace_item_id-tu-portal>"
```

### 4.2 Đọc item theo UUID

```bash
curl -s "$DSPACE/api/core/items/$ITEM_ID" \
  -H "Authorization: Bearer $DSPACE_TOKEN" \
  -H "Accept: application/json"
```

Kỳ vọng: HTTP 200, `id` / `uuid` khớp, metadata có `dc.title`.

### 4.3 Tìm item (search)

```bash
curl -s "$DSPACE/api/discover/search/objects?query=dc.title:<tu-khoa-tieu-de>" \
  -H "Authorization: Bearer $DSPACE_TOKEN" \
  -H "Accept: application/json"
```

### 4.4 Kiểm tra collection sở hữu (nếu cần)

```bash
curl -s "$DSPACE/api/core/items/$ITEM_ID/owningCollection" \
  -H "Authorization: Bearer $DSPACE_TOKEN" \
  -H "Accept: application/json"
```

UUID collection nên khớp `semesters.dspace_collection_id` trên Portal.

---

## 5. Kiểm tra nhanh trong PostgreSQL (tuỳ chọn)

```bash
docker exec -it thesis_postgres psql -U thesis_user -d thesis_portal -c \
  "SELECT id, status, title, dspace_item_id FROM submissions WHERE id = '<uuid>';"
```

```sql
SELECT s.id, s.status, s.dspace_item_id, sem.dspace_collection_id
FROM submissions s
LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
LEFT JOIN semesters sem ON sem.id = sp.semester_id
WHERE s.status = 'archived'
ORDER BY s.created_at DESC
LIMIT 20;
```

---

## 6. Checklist quyết định “đã vào DSpace chưa?”

1. [ ] Portal: `status === "archived"`.
2. [ ] Portal: có `dspace_item_id`.
3. [ ] `dspace_item_id` **không** bắt đầu bằng `dev-item-`.
4. [ ] DSpace: `GET /api/core/items/{dspace_item_id}` trả 200.
5. [ ] (Tuỳ chọn) Owning collection khớp semester trên Portal.
6. [ ] Kiểm tra DSpace item có bitstream PDF trong bundle ORIGINAL (hoặc Portal báo `dspacePdfWarning` nếu thiếu file trên disk).

---

## 7. Sự cố thường gặp

| Triệu chứng | Nguyên nhân gợi ý |
|-------------|-------------------|
| Archive OK, `dspace_item_id` = `dev-item-...` | Chưa set `dspace_api_base_url` + user/password (hoặc token); hoặc DSpace lỗi và fallback |
| Sync/`fetch failed` từ backend Docker | `dspace_api_base_url` đang là `localhost` — đổi thành `host.docker.internal` |
| Login `403 Invalid CSRF token` | Backend cũ thiếu CSRF; cần bản provisioner có `GET /api/security/csrf` rồi login kèm `X-XSRF-TOKEN` + cookie |
| Archive OK, `dspace_item_id` null | Semester chưa có `dspace_collection_id` (chưa tạo học kỳ / provision DSpace) |
| Toast “DSpace publish failed” | Exception ngoài publish — xem log container `thesis_backend` |
| DSpace 401 khi GET item | Token hết hạn / sai user; login lại |
| Item có trên DSpace nhưng không có PDF | File thiếu trong container `uploads/` hoặc upload bitstream lỗi — xem log + `dspacePdfWarning` |
