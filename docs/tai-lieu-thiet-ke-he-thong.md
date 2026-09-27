# TAI LIEU THIET KE HE THONG

## He thong web nop luu chieu luan van/luan an tich hop DSpace

### Ghi chu pham vi trien khai hien tai

Trong giai doan hien tai, du an uu tien hoan thien frontend va backend (xac thuc, nop bai, review, workflow DB). Phan tich hop API DSpace duoc giu nguyen trong thiet ke nhung tam thoi chua thuc thi.

## 1. PHUONG AN KY THUAT

### 1.1 Muc tieu he thong

Xay dung he thong web cho phep:

- Sinh vien nop luan van/luan an
- Quan ly quy trinh duyet (review)
- Tich hop voi he thong luu tru hoc thuat (DSpace)
- Cong bo va tra cuu tai lieu

### 1.2 Kien truc tong the

He thong su dung kien truc 3 lop:

- Frontend (React + Ant Design)
- Backend (NestJS)
- DSpace 7 (REST API)
- PostgreSQL + Storage (S3 hoac local)

Nguyen tac thiet ke:

- DSpace la nguon du lieu chinh (source of truth)
- Backend chi dong vai tro:
  - Xu ly nghiep vu
  - Validate du lieu
  - Trung gian tich hop

### 1.3 Thanh phan he thong

#### 1.3.1 Frontend

Cong nghe:

- React
- Ant Design

Chuc nang:

- Form nop luan van
- Upload file PDF
- Theo doi trang thai
- Dashboard cho admin/reviewer

#### 1.3.2 Backend

Cong nghe:

- Node.js (NestJS)

Cau truc module:

- `auth`: xac thuc
- `users`: quan ly nguoi dung
- `submission`: quan ly bai nop
- `review`: duyet bai
- `dspace`: tich hop DSpace API
- `file`: xu ly upload
- `metadata`: mapping du lieu

#### 1.3.3 DSpace 7

Vai tro:

- Luu tru tai lieu
- Quan ly metadata (Dublin Core)
- Tim kiem va indexing

#### 1.3.4 Database (PostgreSQL)

Luu:

- Tai khoan nguoi dung (`users`) va phan quyen (`student`, `reviewer`, `admin`)
- Metadata tam
- Trang thai workflow
- Lien ket voi DSpace (item ID)

Khong luu:

- File chinh (do DSpace quan ly)

#### 1.3.5 Storage

- S3 (khuyen nghi) hoac local
- Co the bo neu dung storage cua DSpace

### 1.4 Mo hinh du lieu

Bang `submissions`:

- `id`
- `title`
- `student_id` (lien ket tai khoan role `student`, dong thoi la nguon cho `author` khi map metadata)
- `advisor_id` (legacy, co the NULL khi dung nhieu reviewer qua bang `submission_reviewers`)
- `author` (snapshot nhieu tac gia, noi bang `; ` tu danh sach tai khoan student da chon)
- `advisor` (snapshot nhieu reviewer/huong dan, noi bang `; ` tu danh sach tai khoan reviewer da chon)
- `abstract`
- `keywords`
- `status` (`reviewing`, `approving`, `approved`, `reject`)
- `dspace_item_id`
- `created_at`

Bang `submission_files`:

- `id`
- `submission_id`
- `file_name`
- `file_url`

Bang `submission_authors`:

- `submission_id`
- `user_id` (tai khoan role `student`)
- `sort_order`

Bang `submission_reviewers`:

- `submission_id`
- `user_id` (tai khoan role `reviewer`)
- `sort_order`

Bang `reviews`:

- `id`
- `submission_id`
- `reviewer_id`
- `status`
- `comment`

### 1.5 Bao mat

- Xac thuc JWT / SSO
- HTTPS
- Gioi han file upload (PDF)
- Kiem tra virus file
- Phan quyen (`student` / `reviewer` / `admin`)

### 1.6 Trien khai (Deployment)

Su dung Docker:

- Frontend container
- Backend container
- DSpace container
- Postgres container

### 1.7 Quy dinh nop luu chieu (tham khao)

- Tom tat yeu cau noi dung, hinh thuc in, dia CD-ROM va lien he ho tro: `docs/quy-dinh-nop-luu-chieu-thu-vien.md`

## 2. LUONG NOP LUAN VAN

### 2.1 Actor

- Sinh vien
- Reviewer (khong nop thesis, chi duyet sau khi sinh vien nop)
- Admin (duyet lan cuoi sau reviewer)

### 2.2 Cac buoc thuc hien

**Buoc 1: Dang nhap**

- Nguoi dung dang nhap he thong

**Buoc 2: Nhap thong tin**

Sinh vien nhap:

- Tieu de (`title`)
- Tom tat (`abstract`)
- Tu khoa (`keywords`)

Metadata lay tu tai khoan (khong nhap tay neu da co day du trong ho so nguoi dung):

- Tac gia (`author`): co the nhieu nguoi, chon tu danh sach tai khoan role `student` (multi-select co tim kiem), luu bang `submission_authors` + snapshot `author` (noi bang ngan cach).
- Giang vien huong dan / reviewer (`advisor` snapshot): co the nhieu nguoi, chon tu danh sach tai khoan role `reviewer` (multi-select co tim kiem), luu bang `submission_reviewers` + snapshot `advisor` (noi bang ngan cach).

Ghi chu thiet ke:

- Khi map sang Dublin Core, co the tao nhieu truong `dc.contributor.advisor` (hoac quy uoc gom chuoi) tuy chinh sach metadata.
- Giao dien: multi-select co tim kiem cho reviewer (luu `submission_reviewers` + snapshot `advisor`).

**Buoc 3: Upload file**

- Upload file PDF
- Co the upload them phu luc

**Buoc 4: Gui bai**

He thong validate:

- Day du metadata
- Dung dinh dang file

Luu vao database voi trang thai: `reviewing`

**Buoc 5: Thong bao**

- Thong bao nop thanh cong
- Chuyen sang cho reviewer duyet (status `reviewing`)

**Buoc 6: Reviewer duyet**

- Cac reviewer duoc gan se duyet bai
- Neu co reviewer reject -> status `reject`
- Neu tat ca reviewer approve -> status `approving`

**Buoc 7: Admin duyet lan cuoi**

- Admin review bai o status `approving`
- Admin approve -> status `approved`
- Admin reject -> status `reject`

## 3. LUONG XU LY DU LIEU

### 3.1 Giai doan 1: Tiep nhan

Frontend gui request -> Backend

Backend:

- Validate du lieu
- Luu metadata vao DB
- Luu file (tam thoi hoac chuyen thang)

### 3.2 Giai doan 2: Review cua reviewer

Actor:

- Reviewer

Flow:

- Xem danh sach bai nop co trang thai `reviewing`
- Kiem tra noi dung va file
- Moi reviewer thuc hien:
  - Approve -> cap nhat ket qua review cua reviewer do
  - Reject -> thesis chuyen `reject` ngay
- Khi tat ca reviewer deu approve -> thesis chuyen sang `approving`

### 3.3 Giai doan 3: Review cuoi cua admin

Trang thai hien tai cua thesis o dau vao giai doan nay: `approving`.

Flow:

- Admin xem danh sach thesis o trang thai `approving`
- Admin review lan cuoi va quyet dinh:
  - Approve -> thesis chuyen `approved`
  - Reject -> thesis chuyen `reject`

### 3.4 Giai doan 4: Tich hop DSpace

Trang thai hien tai: tam hoan thuc thi o pha hien tai, se kich hoat lai sau khi frontend/backend on dinh.

Khi bai duoc duyet:

**Buoc 1: Xac thuc**

- Backend login vao DSpace -> Lay token

**Buoc 2: Tao Item**

- Goi API tao item trong collection

**Buoc 3: Gui metadata**

Mapping sang Dublin Core:

- `dc.title`
- `dc.contributor.author`
- `dc.contributor.advisor`
- `dc.description.abstract`
- `dc.subject`

**Buoc 4: Upload file**

- Upload file PDF thanh bitstream

**Buoc 5: Gan file vao item**

- Lien ket bitstream voi item

**Buoc 6: Publish**

- Public item (tuy cau hinh workflow DSpace)

**Buoc 7: Luu lien ket**

Backend luu:

- `dspace_item_id`
- Link truy cap

### 3.5 Giai doan 5: Cong bo & tra cuu

- DSpace index du lieu (Solr)
- Nguoi dung co the:
  - Tim kiem
  - Xem luan van
  - Tai file

### 3.6 Xu ly loi

Cac truong hop can xu ly:

- Loi upload file
- Loi API DSpace
- Token het han
- Metadata khong hop le

Giai phap:

- Retry API
- Log chi tiet
- Queue xu ly file lon (nang cao)

## 4. TONG KET

He thong duoc thiet ke voi:

- Kien truc don gian, de trien khai
- Tan dung DSpace lam he luu tru chuan
- Backend dong vai tro dieu phoi
- De mo rong trong tuong lai

## 5. HUONG PHAT TRIEN MO RONG

- Tich hop kiem tra dao van
- He thong thong bao (email)
- API cho he LMS
- Dashboard thong ke
- Phan tich du lieu nghien cuu

Ket luan:

Phuong an nay dam bao:

- Trien khai nhanh
- On dinh
- Phu hop moi truong dai hoc
- Co kha nang mo rong lau dai
