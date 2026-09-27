# HƯỚNG DẪN SỬ DỤNG CỔNG NỘP LUẬN VĂN
## Hệ thống Thesis Portal — theo từng vai trò

---

## PHẦN CHUNG

### 1. Mục đích hệ thống

Cổng nộp luận văn hỗ trợ sinh viên nộp luận văn/luận án điện tử, phản biện học thuật xét duyệt, nhân viên thư viện tiếp nhận, giám đốc thư viện phê duyệt lưu trữ, và quản trị viên cấu hình hệ thống.

### 2. Truy cập và đăng nhập

1. Mở trình duyệt và truy cập địa chỉ cổng https://thesis-submission-system-demo-bewbams-projects.vercel.app/.
2. Nhập **Tên đăng nhập** và **Mật khẩu**.
3. Nhấn **Login** (Đăng nhập).
4. Sau khi đăng nhập thành công, hệ thống hiển thị **Dashboard** tương ứng với vai trò của tài khoản.

**Lưu ý:** Mỗi tài khoản chỉ thấy chức năng thuộc vai trò được cấp. Nếu quên mật khẩu, liên hệ quản trị viên để được cấp lại.

### 3. Tài khoản khởi tạo

Chỉ seed sẵn **admin** (`admin1` / `admin123`). Các vai trò khác (student, reviewer, library, director) do admin tạo trong **User management**.

Cấu trúc khoa / học kỳ / đợt: dùng **Sync from DSpace root** hoặc tạo trên UI — không còn data mẫu archive.

### 4. Quy trình xử lý luận văn (tổng quan)

```
Sinh viên lưu nháp / nộp bài
        ↓
Trạng thái: ĐANG PHẢN BIỆN (reviewing)
        ↓
Phản biện: Duyệt hoặc Từ chối
        ↓
(Tất cả phản biện duyệt, không ai từ chối)
        ↓
Nhân viên thư viện: Tiếp nhận — Duyệt hoặc Từ chối
        ↓
ĐÃ DUYỆT (approved)  →  Giám đốc: Lưu trữ (archived)
        hoặc
BỊ TỪ CHỐI (rejected)  →  Sinh viên chỉnh sửa và nộp lại
```

**Các trạng thái chính:**

| Trạng thái | Ý nghĩa |
|------------|---------|
| draft | Bản nháp — chưa gửi phản biện |
| reviewing | Đang trong quá trình phản biện / chờ thư viện |
| approved | Thư viện đã duyệt tiếp nhận |
| rejected | Bị từ chối (phản biện hoặc thư viện) |
| archived | Đã lưu trữ (sau khi giám đốc xác nhận) |

### 5. Giới hạn kỹ thuật quan trọng

- File luận văn: **PDF**, tối đa **30 MB**.
- Mỗi sinh viên có **một bản nháp** và tối đa **một luận văn đang nộp** (không ở trạng thái nháp) tại một thời điểm. Nộp bài sẽ chuyển bản nháp sang quy trình phản biện.
- Email sinh viên tự điền theo dạng: **tên đăng nhập@hcmut.edu.vn**.

---

## HƯỚNG DẪN CHO SINH VIÊN

### 1. Chức năng chính

- Chọn khoa, học kỳ và đợt nộp luận văn.
- Nhập thông tin luận văn (tiếng Việt, tiếng Anh, người hướng dẫn, ngành, năm, tóm tắt).
- Chọn đồng tác giả và phản biện.
- Tải file PDF luận văn.
- Lưu bản nháp hoặc nộp chính thức.
- Theo dõi trạng thái và quyết định phản biện.
- Chỉnh sửa, xóa, hoặc chuyển về nháp (trong một số điều kiện).
- Nộp lại sau khi bị từ chối hoặc sau khi thư viện đã duyệt (nếu cần chỉnh sửa).

### 2. Nộp luận văn lần đầu

**Bước 1 — Chọn đợt nộp**

1. Tại **Step 1 — Submission period**, chọn **Faculty** (Khoa).
2. Chọn **Semester** (Học kỳ).
3. Chọn **Submission period** (Đợt nộp đang mở). Đợt nộp hiển thị ngày đóng.

**Bước 2 — Nhập thông tin luận văn**

Sau khi chọn đợt nộp, điền các mục sau:

| Trường | Mô tả |
|--------|--------|
| Email | Tự điền từ tài khoản (không sửa) |
| Thesis title (Vietnamese) | Tên luận văn tiếng Việt — bắt buộc |
| Thesis title (English) | Tên luận văn tiếng Anh — bắt buộc |
| Advisor(s) | Người hướng dẫn (có thể nhiều người, phân cách bằng dấu chấm phẩy) |
| Major | Ngành / chuyên ngành |
| Year | Năm tốt nghiệp / năm nộp |
| Authors | Chọn tài khoản sinh viên là tác giả (bắt buộc có chính mình) |
| Reviewers | Chọn ít nhất một phản biện |
| Abstract | Tóm tắt luận văn |
| Thesis PDF | Kéo thả hoặc chọn file PDF (tối đa 30 MB) |

**Bước 3 — Lưu hoặc nộp**

- **Save draft** (Lưu nháp): Lưu tiến độ vào **một** bản nháp duy nhất (chưa gửi phản biện). Có thể quay lại chỉnh sửa sau.
- **Submit thesis** (Nộp luận văn): Chuyển bản nháp sang quy trình phản biện. Cần đủ thông tin và file PDF.

### 3. Quản lý bản nháp và bài đã nộp

**Form nhập liệu:** Người nộp tạo/sửa draft và submit. Form **không** tự điền khi mở trang; nhấn **Edit** trong Detail để tiếp tục draft (có autofill faculty / semester / period). Đồng tác giả không tạo draft, không submit, không edit — chỉ **Detail**.

**Bảng My submissions:** Draft và bài đã nộp của bạn, cùng bài bạn là đồng tác giả (kể cả draft). Actions: **Detail** — trong Detail có Edit / Delete (submitter) và **Submit** cho draft.

### 4. Khi nào được chỉnh sửa / xóa / chuyển về nháp?

| Tình huống | Được phép |
|------------|-----------|
| Bản nháp (draft) — người nộp | Sửa, xóa, nộp chính thức |
| Đồng tác giả trên bài đã nộp | Chỉ Detail; không draft / edit / submit thesis khác |
| Khi author chính Submit | Hệ thống xóa draft cá nhân của các co-authors |
| Đang phản biện, **chưa có** phản biện nào duyệt/từ chối | Sửa, xóa, **Revert to draft** (chuyển về nháp) |
| Đang phản biện, **đã có** phản biện duyệt hoặc từ chối | Không sửa — chờ kết quả cuối |
| Bị từ chối (rejected) | Sửa và **Submit again** (Nộp lại) |
| Thư viện đã duyệt (approved) | Sửa và **Submit again** nếu cần gửi lại vòng xét duyệt |
| Đã lưu trữ (archived) | Không chỉnh sửa |

### 5. Nộp lại sau khi bị từ chối

1. Tại bảng **My submission**, nhấn **Edit** trên bài bị từ chối.
2. Cập nhật thông tin và/hoặc file PDF (để trống file nếu giữ file cũ).
3. Nhấn **Submit again**.
4. Hệ thống đưa bài về trạng thái đang phản biện và tạo lại vòng phản biện.

### 6. Mẹo sử dụng

- Chỉ có **một** bản nháp; Save draft luôn cập nhật bản đó.
- Nhấn **Refresh** để cập nhật trạng thái mới nhất.
- Trong cửa sổ **Detail**, xem **Workflow History** để biết ai đã xử lý và khi nào.

---

## HƯỚNG DẪN CHO PHẢN BIỆN (REVIEWER)

### 1. Chức năng chính

- Xem danh sách luận văn được phân công phản biện.
- Tìm kiếm theo tiêu đề, tác giả, tóm tắt, người nộp.
- Xem chi tiết và mở file PDF.
- **Duyệt** hoặc **Từ chối** (bắt buộc ghi lý do khi từ chối).

### 2. Các nhóm danh sách

| Nhóm | Ý nghĩa |
|------|---------|
| Need My Review | Chờ quyết định của bạn |
| I Approved | Bạn đã duyệt |
| I Rejected | Bạn đã từ chối |

### 3. Thực hiện phản biện

1. Vào **Reviewer Workspace**.
2. (Tuỳ chọn) Nhập từ khóa vào ô tìm kiếm.
3. Trong bảng **Need My Review**, chọn bài cần xử lý.
4. Nhấn **Detail** để xem đầy đủ thông tin, hoặc mở file PDF từ cột **Files**.
5. Chọn một trong hai:
   - **Approve** (Duyệt): Đồng ý về mặt học thuật.
   - **Reject** (Từ chối): Nhập **lý do từ chối** (bắt buộc) rồi xác nhận.

### 4. Quy tắc nghiệp vụ

- Chỉ phản biện được bài ở trạng thái **đang phản biện** và còn **pending** (chưa quyết định).
- Nếu **một phản biện từ chối**, luận văn chuyển sang **bị từ chối**; sinh viên phải chỉnh sửa và nộp lại.
- Khi **tất cả phản biện đã duyệt** (không còn ai pending), bài chuyển sang hàng đợi **tiếp nhận thư viện**.
- Mỗi phản biện chỉ quyết định **một lần** cho mỗi lượt nộp; không đổi quyết định sau khi đã submit.

### 5. Mẹo sử dụng

- Nhấn **Refresh** sau khi xử lý để cập nhật danh sách.
- Đọc **Abstract** và tải **thesis PDF** trước khi duyệt.

---

## HƯỚNG DẪN CHO NHÂN VIÊN THƯ VIỆN (LIBRARY STAFF)

### 1. Chức năng chính

- Tiếp nhận luận văn đã qua vòng phản biện học thuật.
- Duyệt hoặc từ chối tiếp nhận thư viện.
- Xem toàn bộ luận văn trong hệ thống.
- Cấu hình lưu trữ: trường, khoa, học kỳ, đợt nộp.

### 2. Tab Intake & submissions (Tiếp nhận và luận văn)

**Quy trình hiển thị:** reviewing → approved → archived, hoặc rejected.

**Hàng đợi Library intake queue**

Chỉ hiển thị bài thỏa điều kiện:
- Đang ở trạng thái phản biện.
- Tất cả phản biện đã quyết định (không còn pending).
- Không có phản biện nào từ chối.

Thao tác trên từng bài:

| Nút | Tác dụng |
|-----|----------|
| Detail | Xem chi tiết |
| Approve | Duyệt tiếp nhận — chuyển sang **approved** |
| Reject | Từ chối — nhập lý do, chuyển sang **rejected** |

**Bảng All submissions:** Xem mọi luận văn; mở chi tiết, file, lịch sử.

### 3. Tab Archive configuration (Cấu hình lưu trữ)

Nhân viên thư viện **được phép chỉnh sửa** cấu hình:

- **Universities** (Trường / đại học)
- **Faculties** (Khoa) — mã, tên, liên kết DSpace
- **Semesters** (Học kỳ) — theo từng khoa
- **Submission periods** (Đợt nộp) — thời gian mở/đóng, trạng thái open/closed/draft/archived

**Thao tác thường dùng:**

1. Chọn khoa trong danh sách bên trái.
2. Thêm/sửa học kỳ và đợt nộp.
3. Đặt đợt nộp ở trạng thái **open** khi cho phép sinh viên nộp.
4. Đóng đợt (**closed**) khi hết hạn nộp.

### 4. Mẹo sử dụng

- Kiểm tra **Reviewer Decisions** trong chi tiết bài trước khi tiếp nhận.
- Sau **Approve**, bài có thể được giám đốc đưa vào **archived**.

---

## HƯỚNG DẪN CHO GIÁM ĐỐC THƯ VIỆN (DIRECTOR)

### 1. Chức năng chính

- Phê duyệt lưu trữ các luận văn thư viện đã duyệt.
- Xem toàn bộ luận văn.
- Xem cấu hình lưu trữ (chỉ đọc, không chỉnh sửa).

### 2. Tab Approval workflow (Quy trình phê duyệt)

**Hàng đợi Archive approved submissions**

Liệt kê bài ở trạng thái **approved** (thư viện đã duyệt tiếp nhận).

| Nút | Tác dụng |
|-----|----------|
| Detail | Xem chi tiết luận văn |
| Archive | Xác nhận lưu trữ — chuyển sang **archived** và **publish item lên DSpace** (auto-login nếu đã cấu hình) |

**Bảng All submissions:** Tra cứu mọi luận văn trong hệ thống.

### 3. Tab Archive configuration

Giám đốc chỉ **xem** cấu hình khoa, học kỳ, đợt nộp — **không** tạo/sửa (do nhân viên thư viện hoặc quản trị viên thực hiện).

### 4. Quy trình đề xuất

1. Nhân viên thư viện duyệt tiếp nhận → **approved**.
2. Giám đốc kiểm tra metadata và file.
3. Giám đốc nhấn **Archive** để hoàn tất lưu trữ và đẩy lên DSpace.
4. Bài ở trạng thái **archived** — sinh viên không chỉnh sửa được nữa; `dspace_item_id` được lưu nếu publish thành công.
5. Cách kiểm tra bằng API: [`huong-dan-kiem-tra-archive-dspace.md`](./huong-dan-kiem-tra-archive-dspace.md).

---

## HƯỚNG DẪN CHO QUẢN TRỊ VIÊN (ADMIN)

### 1. Chức năng chính

- Quản lý tài khoản người dùng.
- Cấu hình quyền theo vai trò.
- Cấu hình tham số hệ thống.
- (Qua panel thư viện) Cấu hình lưu trữ nếu cần.

**Lưu ý:** Quản trị viên **không** trực tiếp phản biện hay tiếp nhận luận văn trong quy trình nghiệp vụ hàng ngày.

### 2. Tab Manage users (Quản lý người dùng)

| Thao tác | Mô tả |
|----------|--------|
| Create user | Tạo tài khoản mới (username, mật khẩu, tên hiển thị, vai trò) |
| Edit | Sửa thông tin, đổi vai trò, kích hoạt/vô hiệu hóa |
| Search / Filter | Lọc theo tên, vai trò, trạng thái active/disabled |

**Vai trò có thể gán:** student, reviewer, library_staff, director, admin.

**Trạng thái tài khoản:**
- **active**: Đăng nhập bình thường.
- **disabled**: Không đăng nhập được.

### 3. Tab Manage roles (Quản lý vai trò)

Chọn vai trò và bật/tắt từng quyền:

| Quyền | Ý nghĩa |
|-------|---------|
| Submit thesis | Nộp luận văn |
| Academic review | Phản biện học thuật |
| Library intake review | Tiếp nhận thư viện |
| Director final approval | Phê duyệt/lưu trữ cấp giám đốc |
| View all submissions | Xem mọi luận văn |
| Manage users | Quản lý người dùng |
| Manage roles | Quản lý quyền vai trò |
| Configure system | Cấu hình hệ thống |

Nhấn **Save permissions** để lưu.

### 4. Tab System settings (Cấu hình hệ thống)

| Tham số | Mô tả |
|---------|--------|
| dspace_api_base_url | Base URL REST DSpace, ví dụ `http://host.docker.internal:8080/server` |
| dspace_api_user | Email/username DSpace — dùng **auto-login** |
| dspace_api_password | Mật khẩu DSpace (auto-login) |
| dspace_api_token | Token tĩnh (chỉ fallback khi không có user/password) |
| dspace_root_community_id | UUID community gốc (tuỳ chọn) |
| thesis_max_file_size_mb | Dung lượng tối đa file PDF (mặc định 30 MB) |
| submission_timezone | Múi giờ đợt nộp |
| library_support_phone | Số điện thoại hỗ trợ thư viện |
| maintenance_mode | Bật true: chỉ admin đăng nhập được |

Nhấn **Save** sau khi chỉnh sửa.

**DSpace:** khi Giám đốc nhấn **Archive**, hệ thống tự login DSpace (nếu đã cấu hình user/password) và đẩy item lên collection của đợt nộp. Library Approve chỉ chuyển trạng thái `approved`, không publish.

### 5. Mẹo sử dụng

- Tắt **maintenance_mode** trừ khi bảo trì có kế hoạch.
- Không chia sẻ mật khẩu tài khoản admin.
- Vô hiệu hóa (**disabled**) tài khoản nghỉ việc thay vì xóa.

---

## PHỤ LỤC: XỬ LÝ SỰ CỐ THƯỜNG GẶP

| Vấn đề | Gợi ý xử lý |
|--------|-------------|
| Không đăng nhập được | Kiểm tra username/password; tài khoản có bị disabled; maintenance_mode |
| Không thấy đợt nộp | Đợt chưa **open** hoặc đã hết hạn; liên hệ thư viện |
| Không nộp được — đã có bài nộp | Chỉ một bài chính thức; dùng Edit trên bài hiện có hoặc lưu nháp khác |
| Không sửa được bài đang phản biện | Đã có phản biện quyết định; chờ kết quả hoặc liên hệ phản biện |
| File PDF bị lỗi | Đúng định dạng PDF, dưới 30 MB |
| Phản biện không thấy bài | Sinh viên chưa chọn đúng reviewer; bài chưa Submit |
| Thư viện không thấy hàng đợi | Chưa đủ phản biện duyệt; còn phản biện pending hoặc có người reject |

---

## LIÊN HỆ HỖ TRỢ

- Hỗ trợ kỹ thuật hệ thống: Quản trị viên (admin).
- Hỗ trợ nộp luận văn / đợt nộp: Nhân viên thư viện.
- Số điện thoại tham khảo (cấu hình trong hệ thống): **library_support_phone**.

---

*Tài liệu áp dụng cho phiên bản Thesis Portal hiện tại. Khi triển khai production, thay đổi URL, tài khoản demo và thông tin liên hệ cho phù hợp.*
