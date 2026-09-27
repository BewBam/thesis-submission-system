# POST /submissions

## Mục đích

Sinh viên tạo bản nộp luận văn: metadata + file luận văn PDF.

## Yêu cầu

- **Phương thức:** `POST`
- **Đường dẫn:** `/submissions`
- **Xác thực:** JWT, header `Authorization: Bearer <token>`
- **Vai trò:** Chỉ `student`
- **Content-Type:** `multipart/form-data`

JWT payload phải có `sub` trùng với `studentId` trong body; nếu không sẽ **403 Forbidden** (`Students can only submit as themselves`).

## Phần form (fields)

### File

| Tên field    | Số file tối đa | Bắt buộc | Ghi chú |
| ------------ | -------------- | -------- | ------- |
| `thesisFile` | 1              | Có       | Phải là PDF (`application/pdf`). Thiếu file → **400** (`Thesis PDF is required`). Sai MIME → **400** (`Thesis file must be a PDF`). Vượt **30 MB** → **400** (`Thesis PDF must be at most 30 MB`). |

Giới hạn kích thước (multer + kiểm tra server): **30 MB**.

### Body fields (text; thường gửi cùng multipart)

| Trường           | Kiểu (logic) | Bắt buộc | Mô tả |
| ---------------- | ------------ | -------- | ----- |
| `email`          | string       | Không    | Email sinh viên. Nếu bỏ trống, server tự điền `username@hcmut.edu.vn` từ tài khoản đăng nhập. |
| `titleVi`        | string       | Có       | Tiêu đề luận văn (tiếng Việt) |
| `titleEn`        | string       | Có       | Tiêu đề luận văn (tiếng Anh). Server cũng lưu vào cột `title` (legacy). |
| `thesisAdvisors` | string       | Có       | Người hướng dẫn (một hoặc nhiều, phân tách bằng `;`) |
| `major`          | string       | Có       | Ngành / chuyên ngành |
| `thesisYear`     | string       | Có       | Năm tốt nghiệp / nộp (4 chữ số, ví dụ `2026`) |
| `authorIds`      | mảng ID      | Có, không rỗng | ID tác giả (user role `student`). Có thể gửi dạng mảng form, JSON string mảng, hoặc chuỗi phân tách dấu phẩy. Phải chứa `studentId`. |
| `reviewerIds`    | mảng ID      | Có, không rỗng | ID phản biện (user role `reviewer`). Định dạng tương tự `authorIds`. |
| `abstract`       | string       | Có       | Tóm tắt |
| `studentId`      | string       | Có       | ID sinh viên nộp; phải khớp `sub` trong JWT. |
| `submissionPeriodId` | string (UUID) | Có | Đợt nộp đang mở; server lưu snapshot `university_name`, `faculty_name`, `semester_name` từ đợt. |

**Không còn dùng:** trường `title` đơn lẻ (thay bằng `titleVi` + `titleEn`).

**Không còn dùng:** `keywords`, `attachments`. University/faculty **không** gửi tay — lấy từ đợt đã chọn.

**Chọn đợt (trước khi nộp):** `GET /archive/faculties` → `GET /archive/faculties/:id/semesters` → `GET /archive/submission-periods?facultyId=&semesterId=`

## Phản hồi thành công (201 Created)

JSON:

| Trường   | Kiểu   | Mô tả          |
| -------- | ------ | -------------- |
| `id`     | string | ID submission  |
| `status` | string | `reviewing`    |

## Lỗi thường gặp

- **401** — Thiếu/sai JWT.
- **403** — Không phải `student` hoặc `sub` ≠ `studentId`.
- **400** — Validation DTO, thiếu PDF, sai MIME, file > 30 MB, tác giả/phản biện không hợp lệ, v.v.
- **500** — Lỗi lưu DB (`Unable to store submission`).

## Ví dụ (curl)

```bash
curl -s -X POST http://localhost:3000/submissions \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "email=student01@hcmut.edu.vn" \
  -F "titleVi=Đề tài mẫu (tiếng Việt)" \
  -F "titleEn=Sample thesis title" \
  -F "thesisAdvisors=PGS.TS. Nguyen Van A" \
  -F "major=Computer Science" \
  -F "thesisYear=2026" \
  -F "studentId=STUDENT_UUID" \
  -F "authorIds=[\"STUDENT_UUID\",\"COAUTHOR_UUID\"]" \
  -F "reviewerIds=[\"REVIEWER_UUID\"]" \
  -F "abstract=Tóm tắt..." \
  -F "submissionPeriodId=PERIOD_UUID" \
  -F "thesisFile=@/path/to/thesis.pdf;type=application/pdf"
```
