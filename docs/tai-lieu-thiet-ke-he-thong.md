# TAI LIEU THIET KE HE THONG

## He thong web nop luu chieu luan van/luan an tich hop DSpace

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
- `student_id`
- `status` (`pending`, `approved`, `rejected`)
- `dspace_item_id`
- `created_at`

Bang `submission_files`:

- `id`
- `submission_id`
- `file_name`
- `file_url`

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

## 2. LUONG NOP LUAN VAN

### 2.1 Actor

- Sinh vien

### 2.2 Cac buoc thuc hien

**Buoc 1: Dang nhap**

- Nguoi dung dang nhap he thong

**Buoc 2: Nhap thong tin**

Sinh vien nhap:

- Tieu de (`title`)
- Tac gia (`author`)
- Giang vien huong dan (`advisor`)
- Tom tat (`abstract`)
- Tu khoa (`keywords`)

**Buoc 3: Upload file**

- Upload file PDF
- Co the upload them phu luc

**Buoc 4: Gui bai**

He thong validate:

- Day du metadata
- Dung dinh dang file

Luu vao database voi trang thai: `pending`

**Buoc 5: Thong bao**

- Thong bao nop thanh cong
- Cho duyet

## 3. LUONG XU LY DU LIEU

### 3.1 Giai doan 1: Tiep nhan

Frontend gui request -> Backend

Backend:

- Validate du lieu
- Luu metadata vao DB
- Luu file (tam thoi hoac chuyen thang)

### 3.2 Giai doan 2: Review

Actor:

- Reviewer / Admin

Flow:

- Xem danh sach bai nop
- Kiem tra noi dung
- Thuc hien:
  - Approve -> Chuyen buoc tiep
  - Reject -> Tra ve sinh vien

### 3.3 Giai doan 3: Tich hop DSpace

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

### 3.4 Giai doan 4: Cong bo & tra cuu

- DSpace index du lieu (Solr)
- Nguoi dung co the:
  - Tim kiem
  - Xem luan van
  - Tai file

### 3.5 Xu ly loi

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
