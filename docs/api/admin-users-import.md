# User import

## GET /admin/users/import-template

Tải file Excel mẫu (`.xlsx`): cột `username`, `display name`, `role`, `faculty`.

JWT + `manage_users`.

## POST /admin/users/import/preview

Upload file `.xlsx` hoặc `.csv` (multipart `file`, tối đa 2MB). **Không ghi DB.** Trả danh sách sẽ import và hàng bị bỏ qua.

Nhận một trong hai dạng cột (tên cột không phân biệt hoa thường, `_` và khoảng trắng tương đương):

- Mẫu portal: `username`, `display name`, `role`, `faculty`
- CSV thư mục người dùng: `email`, `netid`, `last_name`, `first_name`, `phone`, `language`, `can_log_in`, `password`

Ánh xạ CSV:

| Cột | User |
| --- | --- |
| `netid` (hoặc phần trước `@` của `email`) | `username` |
| `last_name` + `first_name` | `display_name` |
| `password` | mật khẩu đăng nhập username; trống thì `auth_source=google` |
| `can_log_in` | `true` → `active`, `false` → `disabled` |
| không có `role` | mặc định `student` |

`phone` và `language` được chấp nhận, không lưu. Sinh viên và phản biện thiếu khoa thì `requiresFaculty` là `true`; giao diện chọn một khoa áp dụng lúc xác nhận. Tối đa 5000 dòng dữ liệu.

```json
{
  "toImportCount": 2,
  "errorCount": 1,
  "requiresFaculty": true,
  "toImport": [
    {
      "row": 2,
      "username": "2370523",
      "displayName": "Nguyễn Thị Thúy Ngân",
      "email": "2370523@hcmut.edu.vn",
      "role": "student",
      "status": "active",
      "facultyId": null,
      "facultyName": null
    }
  ],
  "errors": [{ "row": 4, "username": "admin1", "message": "Username already exists" }]
}
```

## POST /admin/users/import

Admin xác nhận. Body JSON, tối đa 5000 user:

```json
{
  "users": [
    {
      "username": "2370523",
      "displayName": "Nguyễn Thị Thúy Ngân",
      "role": "student",
      "facultyId": "00000000-0000-4000-8000-000000000001",
      "password": "12345678",
      "status": "active"
    }
  ]
}
```

`password` tùy chọn, ít nhất 6 ký tự. Có mật khẩu thì `auth_source=local`; không có thì mật khẩu trống và `auth_source=google` (`username@hcmut.edu.vn`).
