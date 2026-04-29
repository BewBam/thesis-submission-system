# Checklist theo sprint

Tai lieu tham chieu: `tai-lieu-thiet-ke-he-thong.md`
Bien ban Sprint 0: `sprint-0-deliverables.md`
Ghi chu pham vi hien tai: tam chua goi API DSpace, uu tien frontend/backend truoc.

## Sprint 0 - Khoi dong va thiet ke (1 tuan)

### Muc tieu

- [x] Chot pham vi va muc tieu he thong
- [x] Chot kien truc tong the va nguyen tac DSpace la source of truth
- [x] Chot backlog va tieu chi nghiem thu cho tung sprint

### Cong viec chinh

- [x] Xac nhan actor va use case chinh (student/reviewer/admin)
- [x] Chot mo hinh du lieu: `submissions`, `submission_files`, `reviews`
- [x] Chot mapping metadata sang Dublin Core
- [x] Chot quy trinh review: reviewing -> approving -> approved/reject
- [x] Chot phuong an storage (S3/local/DSpace storage)

### Dau ra sprint

- [x] Tai lieu thiet ke he thong duoc thong nhat
- [x] Checklist va ke hoach sprint duoc thong nhat

## Sprint 1 - Nen tang va xac thuc (1-2 tuan)

### Muc tieu

- [x] Dung bo khung frontend/backend/database
- [x] Hoan thanh xac thuc va phan quyen co ban

### Cong viec chinh

- [x] Khoi tao du an React + Ant Design
- [x] Khoi tao du an NestJS va module co ban
- [x] Tao schema/bang trong PostgreSQL
- [x] Hoan thanh module `auth` (JWT hoac SSO)
- [x] Hoan thanh module `users`
- [x] Thiet lap role: `student`, `reviewer`, `admin`
- [ ] Cau hinh HTTPS cho moi truong deploy

### Dau ra sprint

- [ ] Dang nhap thanh cong theo role
- [x] CSDL san sang cho quy trinh nop bai

## Sprint 2 - Luong nop luan van (1-2 tuan)

### Muc tieu

- [ ] Hoan thanh luong nop bai tu sinh vien

### Cong viec chinh

- [ ] Xay dung form nhap metadata (`title`, `abstract`, `keywords`)
- [ ] Tu dong lay `author` tu ho so tai khoan role `student`
- [ ] Tu dong lay `advisor` tu ho so tai khoan role `reviewer` duoc gan voi bai nop
- [ ] Upload file PDF va phu luc
- [ ] Validate metadata va dinh dang file
- [ ] Luu metadata vao DB voi trang thai `reviewing`
- [ ] Luu file tam hoac chuyen thang theo thiet ke
- [ ] Hien thi thong bao nop thanh cong
- [ ] Tao man hinh theo doi trang thai bai nop cho sinh vien

### Dau ra sprint

- [ ] Sinh vien nop bai thanh cong end-to-end (chua day len DSpace)

## Sprint 3 - Review va phe duyet (1 tuan)

### Muc tieu

- [ ] Hoan thanh quy trinh duyet bai cho reviewer/admin

### Cong viec chinh

- [ ] Xay dung dashboard reviewer/admin
- [ ] Hien thi danh sach bai nop theo trang thai
- [ ] Chi tiet bai nop + file dinh kem
- [ ] Reviewer Action Approve/Reject + comment phan hoi khi reject
- [ ] Neu tat ca reviewer approve thi chuyen status sang `approving`
- [ ] Admin Action Approve/Reject o buoc review lan cuoi
- [ ] Cap nhat trang thai workflow trong DB

### Dau ra sprint

- [ ] Quy trinh review hoat dong day du (reviewing -> approving -> approved/reject)

## Sprint 4 - Tich hop DSpace va cong bo (1-2 tuan) [PENDING - tam hoan]

### Muc tieu

- [ ] Day bai duoc duyet len DSpace thanh cong
- [ ] Kich hoat lai sprint nay sau khi frontend/backend dat muc tieu MVP on dinh

### Cong viec chinh

- [ ] Backend login DSpace va quan ly token
- [ ] Tao item trong collection qua REST API
- [ ] Day metadata Dublin Core:
  - [ ] `dc.title`
  - [ ] `dc.contributor.author`
  - [ ] `dc.contributor.advisor`
  - [ ] `dc.description.abstract`
  - [ ] `dc.subject`
- [ ] Upload PDF thanh bitstream
- [ ] Gan bitstream vao item
- [ ] Publish item (theo workflow DSpace)
- [ ] Luu `dspace_item_id` + link truy cap vao DB
- [ ] Kiem thu tra cuu, xem va tai tai lieu tu DSpace

### Dau ra sprint

- [ ] Luong approved -> DSpace item public hoat dong on dinh

## Sprint 5 - Bao mat, van hanh va toi uu (1 tuan)

### Muc tieu

- [ ] Hoan thien deployment, bao mat va xu ly loi

### Cong viec chinh

- [ ] Gioi han upload chi nhan PDF
- [ ] Tich hop quet virus file
- [ ] Xu ly loi API DSpace, token het han, metadata khong hop le
- [ ] Bo sung retry co kiem soat
- [ ] Bo sung log chi tiet
- [ ] Danh gia queue cho file lon (nang cao)
- [ ] Docker hoa he thong:
  - [ ] Frontend container
  - [ ] Backend container
  - [ ] DSpace container
  - [ ] Postgres container
  - [ ] `docker-compose` cho toan bo he thong

### Dau ra sprint

- [ ] Ban release on dinh cho moi truong truong dai hoc

## Backlog mo rong (sau MVP)

- [ ] Tich hop kiem tra dao van
- [ ] He thong thong bao email
- [ ] API cho LMS
- [ ] Dashboard thong ke
- [ ] Phan tich du lieu nghien cuu

## Checklist nghiem thu tong

- [ ] Trien khai nhanh theo lo trinh sprint
- [ ] He thong on dinh khi van hanh
- [ ] Phu hop moi truong dai hoc
- [ ] San sang mo rong lau dai
