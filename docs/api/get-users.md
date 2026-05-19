# GET /users

## Mục đích

Liệt kê người dùng theo vai trò (dùng cho giao diện chọn tác giả, phản biện, v.v.).

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/users`
- **Xác thực:** Không (theo code hiện tại)

## Query

| Tham số | Kiểu   | Bắt buộc | Giá trị hợp lệ                          |
| ------- | ------ | -------- | ---------------------------------------- |
| `role`  | string | Có       | `student`, `reviewer`, `library_staff`, `director`, hoặc `admin` |

Nếu thiếu `role` hoặc giá trị không thuộc danh sách trên, server trả **400 Bad Request** với thông báo liệt kê các role hợp lệ.

## Phản hồi thành công (200)

Mảng các object:

| Trường        | Kiểu   | Mô tả                          |
| ------------- | ------ | ------------------------------ |
| `id`          | string | ID user                        |
| `username`    | string | Tên đăng nhập                  |
| `displayName` | string | Tên hiển thị                   |
| `role`        | string | Khớp với `role` đã query       |

Thứ tự: `username` tăng dần.

## Lỗi

- **400 Bad Request** — `role` không hợp lệ.

## Ví dụ

```bash
curl -s "http://localhost:3000/users?role=reviewer"
```
