# Sprint 0 Deliverables

Tai lieu nay ghi nhan ket qua thuc hien Sprint 0 cho he thong web nop luu chieu luan van/luan an tich hop DSpace.

## 1) Pham vi va muc tieu he thong

### Pham vi MVP

- Xay dung cong nop bai cho sinh vien (metadata + file PDF).
- Xay dung quy trinh review cho reviewer/admin.
- Tich hop DSpace de tao item, day metadata va file.
- Cong bo va tra cuu tai lieu qua DSpace.

### Muc tieu sprint 0

- Chot kien truc tong the va pham vi MVP.
- Chot mo hinh du lieu va luong nghiep vu cot loi.
- Chot backlog va tieu chi nghiem thu theo sprint.

## 2) Kien truc tong the da chot

Luong he thong:

- Frontend (React + Ant Design) -> Backend (NestJS) -> DSpace 7 REST API
- Backend su dung PostgreSQL cho trang thai workflow va metadata tam
- Storage tam (neu can): uu tien S3, fallback local

Nguyen tac:

- DSpace la source of truth cho tai lieu hoc thuat da cong bo.
- Backend chi lam nghiep vu, validate, dieu phoi tich hop.

## 3) Actor va use case da xac nhan

### Student

- Dang nhap he thong
- Tao bai nop va upload PDF
- Theo doi trang thai pending/approved/rejected

### Reviewer

- Xem danh sach bai nop
- Xem chi tiet bai nop
- Approve/Reject kem nhan xet

### Admin

- Quan tri collection/quyen
- Ho tro xu ly su co tich hop DSpace

## 4) Mo hinh du lieu da chot

### Bang `users`

- `id`
- `username` (unique)
- `password` (dev seed; production should hash)
- `display_name`
- `role` (`student`, `reviewer`, `admin`)
- `created_at`

### Bang `submissions`

- `id`
- `title`
- `student_id` (tai khoan role `student`, nguon cho `author`)
- `advisor_id` (legacy, optional)
- `author` (snapshot ho ten luc nop)
- `advisor` (snapshot nhieu reviewer, noi bang `; `)
- `abstract`
- `keywords`
- `status` (`pending`, `approved`, `rejected`)
- `dspace_item_id`
- `created_at`

### Bang `submission_files`

- `id`
- `submission_id`
- `file_name`
- `file_url`

### Bang `submission_authors`

- `submission_id`
- `user_id` (tai khoan role `student`)
- `sort_order`

### Bang `submission_reviewers`

- `submission_id`
- `user_id` (tai khoan role `reviewer`)
- `sort_order`

### Bang `reviews`

- `id`
- `submission_id`
- `reviewer_id`
- `status`
- `comment`

Gioi han:

- DB khong luu file chinh (file chinh do DSpace quan ly).

## 5) Mapping metadata sang Dublin Core

- `title` -> `dc.title`
- `author` -> `dc.contributor.author`
- `advisor` -> `dc.contributor.advisor`
- `abstract` -> `dc.description.abstract`
- `keywords` -> `dc.subject`

Nguon du lieu cho metadata:

- `author` lay tu ho so tai khoan role `student` (tai khoan nop bai).
- `advisor` lay tu danh sach tai khoan role `reviewer` duoc chon (multi-select), luu bang `submission_reviewers` + snapshot.

## 6) Quy trinh review da chot

- Sinh vien nop bai -> trang thai `pending`
- Reviewer/Admin xu ly:
  - Approve -> dua sang buoc day DSpace
  - Reject -> tra ve sinh vien kem comment

## 7) Phuong an storage da chot

- Uu tien S3 cho luu tam file upload.
- Cho phep local storage trong moi truong dev/test.
- Co the bo luu tam rieng neu backend day truc tiep vao DSpace.

## 8) Backlog da chot theo sprint

### Sprint 1 - Nen tang va xac thuc

- Dung frontend/backend/database
- Hoan thanh auth + role

### Sprint 2 - Luong nop bai

- Form metadata + upload file + validate + luu pending

### Sprint 3 - Review workflow

- Dashboard reviewer/admin + approve/reject + cap nhat trang thai

### Sprint 4 - Tich hop DSpace

- Login DSpace, tao item, day metadata, upload bitstream, publish

### Sprint 5 - Bao mat va van hanh

- Gioi han upload, quet virus, retry, log, docker compose

## 9) Tieu chi nghiem thu da chot

### Nghiem thu chuc nang

- Sinh vien nop bai thanh cong va theo doi trang thai duoc.
- Reviewer/Admin duyet va tu choi bai nop duoc.
- Bai approved duoc day len DSpace va truy cap duoc qua link.

### Nghiem thu phi chuc nang

- Bat buoc HTTPS
- Phan quyen dung theo role
- Co xu ly loi API DSpace va token het han
- Co log theo doi giao dich tich hop

## 10) Trang thai sprint 0

- Hoan thanh 100% dau viec Sprint 0.
- Tai lieu thiet ke va checklist sprint da duoc thong nhat.
