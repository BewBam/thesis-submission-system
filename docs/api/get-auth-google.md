# GET /auth/google

## Mục đích

Bắt đầu đăng nhập Google OAuth (authorization code). Browser được 302 tới Google (`hd` = `GOOGLE_ALLOWED_DOMAIN`, mặc định `hcmut.edu.vn`).

Chỉ hoạt động khi `GET /auth/login-options` trả `method=google`.

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/auth/google`
- **Xác thực:** Không

## Phản hồi

- **302** — Google accounts
- **403** — `login_method` đang là `username`
- **503** — thiếu env Google

Frontend gọi qua proxy: `GET /api/auth/google`.

Callback Google (khớp OAuth client): `GET /auth/google/callback?code=&state=`

Backend đổi code, chỉ nhận email `*@hcmut.edu.vn` đã verify, map username = phần trước `@`, JIT user `student` nếu chưa có, rồi 302 về `FRONTEND_URL/?access_token=` hoặc `/?error=domain` (và `oauth`, `cancelled`, `disabled`, `maintenance`).
