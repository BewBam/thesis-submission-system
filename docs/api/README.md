# API Documentation

Tài liệu chi tiết cho từng endpoint backend.

## Base URL

- Local backend: `http://localhost:3000`
- Auth header cho endpoint bảo vệ: `Authorization: Bearer <access_token>`

## Danh sách endpoint

| Method | Endpoint | Tài liệu |
| ------ | -------- | -------- |
| GET | `/` | [`get-root.md`](./get-root.md) |
| GET | `/health` | [`get-health.md`](./get-health.md) |
| POST | `/auth/login` | [`post-auth-login.md`](./post-auth-login.md) |
| GET | `/users` | [`get-users.md`](./get-users.md) |
| POST | `/submissions` | [`post-submissions.md`](./post-submissions.md) |
| GET | `/submissions/student/:studentId` | [`get-submissions-student.md`](./get-submissions-student.md) |
| GET | `/reviews/my-queue` | [`get-reviews-my-queue.md`](./get-reviews-my-queue.md) |
| POST | `/reviews/action` | [`post-reviews-action.md`](./post-reviews-action.md) |

## Ghi chú trạng thái nghiệp vụ

Theo code backend hiện tại, trạng thái bản nộp đang dùng tập giá trị:

- `pending`
- `approved`
- `rejected`
