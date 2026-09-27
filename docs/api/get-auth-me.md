# GET /auth/me

## Mục đích

Lấy thông tin user hiện tại từ JWT (dùng sau Google callback).

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/auth/me`
- **Xác thực:** `Authorization: Bearer <access_token>`

## Phản hồi thành công (200)

| Trường | Kiểu | Mô tả |
| ------ | ---- | ----- |
| `id` | string | UUID |
| `username` | string | Local-part email hoặc username local |
| `displayName` | string | Tên hiển thị |
| `role` | string | Vai trò |
| `email` | string \| null | Email Google / backfill |

## Lỗi

- **401** — Token thiếu/hết hạn, user không còn, hoặc tài khoản disabled
