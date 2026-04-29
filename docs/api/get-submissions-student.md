# GET /submissions/student/:studentId

## Mục đích

Lấy danh sách bản nộp của một sinh viên theo `studentId`, kèm metadata và danh sách file.

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/submissions/student/:studentId`
- **Xác thực:** JWT, header `Authorization: Bearer <token>`
- **Vai trò:** `student` hoặc `admin`

### Quyền truy cập

- **`student`:** Chỉ được xem khi `studentId` trong URL trùng `sub` trong JWT; khác → **403 Forbidden**.
- **`admin`:** Được xem mọi `studentId`.

## Path parameters

| Tham số      | Kiểu   | Mô tả                    |
| ------------ | ------ | ------------------------ |
| `studentId`  | string | ID user (sinh viên)      |

## Phản hồi thành công (200)

Mảng các bản ghi submission (từ SQL `GROUP BY`), mỗi phần tử gồm các trường tương ứng cột/query, ví dụ:

| Trường (đại diện) | Kiểu   | Mô tả |
| ----------------- | ------ | ----- |
| `id`              | string | ID submission |
| `title`           | string | Tiêu đề |
| `author`          | string | Chuỗi tác giả (aggregate hoặc snapshot) |
| `advisor`         | string | Chuỗi phản biện đã gán |
| `keywords`        | string | Từ khóa |
| `status`          | string | Trạng thái submission |
| `created_at`      | string / Date | Thời điểm tạo |
| `files`           | array  | Mỗi phần tử: `id`, `fileName`, `fileUrl`, `fileType` (`thesis` \| `attachment`) |

Thứ tự: `created_at` giảm dần.

## Lỗi

- **401** — Thiếu/sai JWT.
- **403** — Sinh viên xem submission của người khác.

## Ví dụ

```bash
curl -s "http://localhost:3000/submissions/student/STUDENT_UUID" \
  -H "Authorization: Bearer YOUR_JWT"
```
