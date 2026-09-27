# GET /auth/login-options

## Mục đích

Cho frontend biết đang dùng form username/password hay nút Google. Public, không cần JWT.

Khi admin đặt `login_method=google` nhưng thiếu `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, API **fallback** `method=username` để không khóa hệ thống.

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/auth/login-options`
- **Xác thực:** Không

## Phản hồi thành công (200)

| Trường | Kiểu | Mô tả |
| ------ | ---- | ----- |
| `method` | string | `username` hoặc `google` |
| `googleConfigured` | boolean | Env Google OAuth đã đủ chưa |

## Ví dụ

```bash
curl -s http://localhost:3000/auth/login-options
```
