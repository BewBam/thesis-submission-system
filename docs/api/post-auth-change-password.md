# POST /auth/change-password

## Mục đích

Người dùng đang đăng nhập tự đổi mật khẩu của chính mình.

## Yêu cầu

- **Phương thức:** `POST`
- **Đường dẫn:** `/auth/change-password`
- **Xác thực:** `Authorization: Bearer <access_token>`
- **Header:** `Content-Type: application/json`

## Body (JSON)

| Trường | Kiểu | Bắt buộc | Ràng buộc |
| ------ | ---- | -------- | --------- |
| `currentPassword` | string | Khi tài khoản đã có mật khẩu | Phải trùng mật khẩu hiện tại |
| `newPassword` | string | Có | Tối thiểu 6 ký tự, khác mật khẩu hiện tại |

Tài khoản chưa có mật khẩu (đăng nhập Google) có thể đặt mật khẩu mới mà không gửi `currentPassword`.

## Phản hồi thành công (200)

```json
{ "updated": true }
```

## Lỗi

- **400** — Sai mật khẩu hiện tại, mật khẩu mới trùng mật khẩu cũ, hoặc body không hợp lệ.
- **401** — Token thiếu/hết hạn, user không còn, hoặc tài khoản disabled.
