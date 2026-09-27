# User Excel import

## GET /admin/users/import-template

Tải file Excel mẫu (`.xlsx`): cột `username`, `display name`, `role`.

JWT + `manage_users`.

## POST /admin/users/import/preview

Upload file `.xlsx` (multipart `file`, tối đa 2MB). **Không ghi DB.** Trả danh sách sẽ import và hàng bị bỏ qua.

```json
{
  "toImportCount": 2,
  "errorCount": 1,
  "toImport": [
    {
      "row": 2,
      "username": "nguyen.vana",
      "displayName": "Nguyen Van A",
      "role": "student",
      "email": "nguyen.vana@hcmut.edu.vn"
    }
  ],
  "errors": [{ "row": 4, "username": "admin1", "message": "Username already exists" }]
}
```

## POST /admin/users/import

Admin xác nhận. Body JSON:

```json
{
  "users": [
    { "username": "nguyen.vana", "displayName": "Nguyen Van A", "role": "student" }
  ]
}
```

Tối đa 500 user. `password` trống, `email` = `username@hcmut.edu.vn`, `auth_source=google`.
