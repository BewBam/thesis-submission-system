# POST /reviews/action

## Mục đích

Phản biện thực hiện **duyệt** (`approve`) hoặc **từ chối** (`reject`) một submission đã được gán; cập nhật bản ghi review và có thể cập nhật trạng thái submission.

## Yêu cầu

- **Phương thức:** `POST`
- **Đường dẫn:** `/reviews/action`
- **Xác thực:** JWT, header `Authorization: Bearer <token>`
- **Vai trò:** Chỉ `reviewer`
- **Header:** `Content-Type: application/json`

## Body (JSON)

| Trường         | Kiểu   | Bắt buộc | Mô tả |
| -------------- | ------ | -------- | ----- |
| `submissionId` | string | Có       | ID submission cần xử lý |
| `action`       | string | Có       | `approve` hoặc `reject` |
| `comment`      | string | Tùy      | **Bắt buộc có nội dung (sau trim)** khi `action` là `reject`; nếu thiếu → **400** (`Reject reason is required`). Với `approve` có thể bỏ qua. |

## Luồng nghiệp vụ (tóm tắt)

- Chỉ xử lý được khi tồn tại bản ghi review gán `submissionId` cho reviewer hiện tại, `decision` của review là `pending`, và `submission.status` là `pending`.
- **`reject`:** Cập nhật review; đặt `submissions.status` = `rejected`.
- **`approve`:** Cập nhật review; nếu không còn review nào của submission ở trạng thái `pending` thì đặt `submissions.status` = `approved`.

## Phản hồi thành công (201 Created)

NestJS mặc định dùng **201** cho `POST` khi không khai báo `@HttpCode`.

```json
{ "ok": true }
```

## Lỗi

- **401** — Thiếu/sai JWT.
- **403** — Không phải `reviewer`.
- **404** — Submission không được gán cho reviewer này (`Submission not assigned to this reviewer`).
- **400** — Review đã hoàn tất, submission không còn `pending`, hoặc thiếu lý do khi `reject`.

## Ví dụ

```bash
curl -s -X POST http://localhost:3000/reviews/action \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"submissionId\":\"SUBMISSION_UUID\",\"action\":\"approve\"}"
```

Từ chối có lý do:

```bash
curl -s -X POST http://localhost:3000/reviews/action \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"submissionId\":\"SUBMISSION_UUID\",\"action\":\"reject\",\"comment\":\"Thiếu phần phương pháp.\"}"
```
