# Hướng dẫn chạy automation test

Bộ test kiểm tra năm chức năng: nộp bài, file PDF, approve/reject, nộp lại, và push DSpace (mức portal, không bắt buộc DSpace thật).

Có hai lớp:

- API test: Jest + Supertest, thư mục `backend/test`
- Giao diện: Playwright, thư mục `playwright`

Cùng spec chạy local hoặc trỏ vào URL portal đã deploy. Không chạy hai đích cùng lúc.

## Cài đặt

Cần Node.js và Docker.

```bash
cd backend
npm install

cd ..
npm install
npx playwright install chromium
```

## Chạy local

Chỉ cần Postgres, không cần backend hay frontend Docker đang chiếm cổng 3000/5173.

```bash
docker compose up -d postgres
```

Postgres lắng nghe `127.0.0.1:5433`, user `thesis_user`, mật khẩu `thesis_pass`.

API test tạo database `thesis_test` (xóa database này nếu đã có), chạy `db/init`, rồi bật Nest trong process test. Không ghi vào `thesis_portal`.

```bash
cd backend
npm run test:e2e
```

Playwright, sau khi API test xong, ở thư mục gốc:

```bash
npm run test:e2e
```

Playwright tự tạo lại `thesis_test`, bật backend cổng **3001** và giao diện cổng **5174**. Không dùng cổng 3000/5173.

Thứ tự: API test trước, Playwright sau. Không chạy song song vì cả hai dựng lại `thesis_test`.

Nhóm email (TC-MAIL) không nằm trong `npm run test:e2e`. Chỉ chạy local, cần Mailpit, và không đặt `API_URL`. Server deploy không có hộp thư test và không được gửi mail thật.

```bash
docker compose up -d postgres mailpit
cd backend
npm run test:email
```

Mailpit nhận SMTP ở cổng 1025. API đọc thư là http://127.0.0.1:8025. Báo cáo ghi ra `docs/test-output/email-report.md`. Hết nhóm này, test tự đặt lại `email_enabled = false`.

Nhóm đẩy DSpace thật (TC-DSP-006) cũng tách khỏi `npm run test:e2e`. Cần Postgres và DSpace tại http://dspace.lib.test. Test lưu trữ một bài trên `thesis_test`, đẩy vào collection «Thạc sĩ» của community «Nộp luận văn», kiểm metadata và PDF, rồi xóa item.

```bash
docker compose up -d postgres
cd backend
npm run test:dspace
```

Báo cáo ghi ra `docs/test-output/dspace-report.md`. Tài khoản DSpace nằm trong `backend/test/dspace-live.e2e-spec.ts`.

Sau mỗi lần chạy, báo cáo Markdown được ghi ra:

- API: `docs/test-output/api-report.md`
- Playwright: `docs/test-output/playwright-report.md`

Terminal vẫn in tóm tắt. File Markdown có bảng từng test, thời gian, và nội dung lỗi nếu fail.

## Chạy khi portal có URL

Đặt cả hai biến. `API_URL` là API mà frontend rewrite tới, hiện trong `frontend/vercel.json`.

PowerShell:

```powershell
$env:PORTAL_URL="https://thesis-submission-system-demo-bewbams-projects.vercel.app"
$env:API_URL="https://thesis-submission-system-production.up.railway.app"

cd backend
npm run test:e2e

cd ..
npm run test:e2e
```

bash:

```bash
export PORTAL_URL="https://thesis-submission-system-demo-bewbams-projects.vercel.app"
export API_URL="https://thesis-submission-system-production.up.railway.app"
```

Remote không tạo database, không tắt DSpace, không bật server local.

Điều kiện trên server:

- `login_method` là `username` (không phải Google).
- Còn tài khoản seed: `student1` / `student123`, `reviewer1` / `review123`, `library1` / `library123`, `director1` / `director123`, `admin1` / `admin123`.
- Có ít nhất một trường (university). Nếu chưa có đợt nộp đang open, test tạo khoa, học kỳ và đợt mới qua API thư viện.

Test tạo user phụ và bài mới, rồi xóa các bài đó bằng API. Không xóa dữ liệu có sẵn ngoài các bài do chính test tạo.

Kết quả push DSpace trên remote chấp nhận item thật, `dev-item-`, hoặc lỗi publish. Bài vẫn phải ở trạng thái `archived`.

## Dọn dữ liệu

- Local: mỗi lần chạy tạo lại `thesis_test`.
- Remote: xóa submission do test tạo. User phụ (`tstu…`, `e2e…`) có thể còn trên server.

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `ECONNREFUSED 127.0.0.1:5433` | Bật Postgres: `docker compose up -d postgres` |
| Cổng 3001 hoặc 5174 bị chiếm | Tắt process đang giữ cổng rồi chạy lại Playwright |
| Remote báo thiếu tài khoản seed | Tạo lại user seed hoặc đăng nhập username/password còn đúng |
| Remote bắt đăng nhập Google | Đặt system setting `login_method` = `username` |
| `Remote tests need both PORTAL_URL and API_URL` | Đặt đủ hai biến trước khi chạy Playwright |
| API test và Playwright chạy cùng lúc | Dừng một bên. Local chỉ chạy tuần tự |

## Phạm vi không chạy tự động

Google OAuth, màn quản trị, filter, phân trang, email trên URL deploy, và DSpace production. Email workflow chỉ kiểm local qua Mailpit. Không có GitHub Actions trong bộ này.
