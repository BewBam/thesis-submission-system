# POST /submissions

## Mục đích

Sinh viên tạo bản nộp luận văn: metadata + file luận văn PDF + file đính kèm (tùy chọn).

## Yêu cầu

- **Phương thức:** `POST`
- **Đường dẫn:** `/submissions`
- **Xác thực:** JWT, header `Authorization: Bearer <token>`
- **Vai trò:** Chỉ `student`
- **Content-Type:** `multipart/form-data`

JWT payload phải có `sub` trùng với `studentId` trong body; nếu không sẽ **403 Forbidden** (`Students can only submit as themselves`).

## Phần form (fields)

### File

| Tên field       | Số file tối đa | Bắt buộc | Ghi chú |
| --------------- | -------------- | -------- | ------- |
| `thesisFile`    | 1              | Có       | Phải là PDF (`application/pdf`). Thiếu file → **400** (`Thesis PDF is required`). Sai MIME → **400** (`Thesis file must be a PDF`). |
| `attachments`   | 10             | Không    | MIME được chấp nhận: PDF, DOC/DOCX, ZIP, PNG, JPEG. MIME không hỗ trợ → **400** (`Unsupported attachment format: ...`). |

Giới hạn kích thước mỗi file (multer): **20 MB**.

### Body fields (text; thường gửi cùng multipart)

| Trường         | Kiểu (logic) | Bắt buộc | Mô tả |
| -------------- | ------------ | -------- | ----- |
| `title`        | string       | Có       | Tiêu đề |
| `authorIds`    | mảng ID      | Có, không rỗng | ID tác giả (user role `student`). Có thể gửi dạng mảng form, JSON string mảng, hoặc chuỗi phân tách dấu phẩy (xem DTO). Phải chứa `studentId`. |
| `reviewerIds`  | mảng ID      | Có, không rỗng | ID phản biện (user role `reviewer`). Định dạng tương tự `authorIds`. |
| `abstract`     | string       | Có       | Tóm tắt |
| `keywords`     | string       | Có       | Từ khóa; có thể gửi chuỗi hoặc mảng (server chuẩn hóa thành chuỗi phân tách dấu phẩy). |
| `studentId`    | string       | Có       | ID sinh viên nộp; phải khớp `sub` trong JWT. |

## Phản hồi thành công (201 Created)

JSON:

| Trường   | Kiểu   | Mô tả        |
| -------- | ------ | ------------ |
| `id`     | string | ID submission |
| `status` | string | `pending`    |

## Lỗi thường gặp

- **401** — Thiếu/sai JWT.
- **403** — Không phải `student` hoặc `sub` ≠ `studentId`.
- **400** — Validation DTO, thiếu PDF, sai MIME, tác giả/phản biện không hợp lệ, v.v.
- **500** — Lỗi lưu DB (`Unable to store submission`).

## Ví dụ (curl)

```bash
curl -s -X POST http://localhost:3000/submissions \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "title=Đề tài mẫu" \
  -F "studentId=STUDENT_UUID" \
  -F "authorIds=[\"STUDENT_UUID\",\"COAUTHOR_UUID\"]" \
  -F "reviewerIds=[\"REVIEWER_UUID\"]" \
  -F "abstract=Tóm tắt..." \
  -F "keywords=machine learning, NLP" \
  -F "thesisFile=@/path/to/thesis.pdf;type=application/pdf"
```
