# POST /auth/login

## Mục đích

Đăng nhập bằng tên đăng nhập và mật khẩu; nhận JWT và thông tin user (không có mật khẩu).

## Yêu cầu

- **Phương thức:** `POST`
- **Đường dẫn:** `/auth/login`
- **Xác thực:** Không
- **Header:** `Content-Type: application/json`

## Body (JSON)

| Trường     | Kiểu   | Bắt buộc | Ràng buộc        |
| ---------- | ------ | -------- | ---------------- |
| `username` | string | Có       | Chuỗi            |
| `password` | string | Có       | Tối thiểu 6 ký tự |

## Phản hồi thành công (201 Created)

NestJS mặc định trả **201** cho `POST` (có thể đổi bằng `@HttpCode(200)` nếu muốn thống nhất với tài liệu OAuth thường dùng 200).

JSON:

| Trường          | Kiểu   | Mô tả                          |
| --------------- | ------ | ------------------------------ |
| `access_token`  | string | JWT dùng cho `Authorization`   |
| `user`          | object | Thông tin user sau đăng nhập   |
| `user.id`       | string | ID user                        |
| `user.username` | string | Tên đăng nhập                  |
| `user.displayName` | string | Tên hiển thị                |
| `user.role`     | string | `student` \| `reviewer` \| `admin` |

## Lỗi

- **401 Unauthorized** — Sai tên đăng nhập hoặc mật khẩu (`Invalid username or password`).
- **400 Bad Request** — Body không hợp lệ (validation).

## Ví dụ

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"demo\",\"password\":\"password123\"}"
```

## Ghi chú

Các endpoint được bảo vệ JWT cần header:

`Authorization: Bearer <access_token>`
