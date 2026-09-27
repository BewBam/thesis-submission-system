# GET /reviews/my-queue

## Mục đích

Phản biện xem hàng đợi các submission được gán cho mình, còn ở trạng thái chờ xử lý (review và submission đều `pending`).

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/reviews/my-queue`
- **Xác thực:** JWT, header `Authorization: Bearer <token>`
- **Vai trò:** Chỉ `reviewer`

## Phản hồi thành công (200)

Mảng các bản ghi (join `reviews` + `submissions` + file), ví dụ các trường:

| Trường (đại diện)   | Mô tả |
| ------------------- | ----- |
| `id`                | ID submission |
| `title`             | Tiêu đề (legacy) |
| `student_email`     | Email sinh viên |
| `title_vi`          | Tiêu đề tiếng Việt |
| `title_en`          | Tiêu đề tiếng Anh |
| `thesis_advisors`   | Người hướng dẫn |
| `major`             | Ngành |
| `thesis_year`       | Năm |
| `abstract`          | Tóm tắt |
| `keywords`          | Từ khóa |
| `author`            | Snapshot tác giả |
| `advisor`           | Snapshot phản biện |
| `submission_status` | Trạng thái submission |
| `created_at`        | Thời điểm tạo submission |
| `my_decision`       | Quyết định của reviewer hiện tại (ở queue chỉ `pending`) |
| `my_comment`        | Ghi chú (nếu có) |
| `files`             | Mảng object: `id`, `fileName`, `fileUrl`, `fileType` |

Thứ tự: `created_at` giảm dần.

## Lỗi

- **401** — Thiếu/sai JWT.
- **403** — Không phải `reviewer`.

## Ví dụ

```bash
curl -s http://localhost:3000/reviews/my-queue \
  -H "Authorization: Bearer YOUR_JWT"
```
