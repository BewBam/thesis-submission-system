# HƯỚNG DẪN SỬ DỤNG CỔNG NỘP LUẬN VĂN
## Hệ thống Thesis Portal — theo từng vai trò

---

## PHẦN CHUNG

### 1. Mục đích hệ thống

Cổng nộp luận văn hỗ trợ sinh viên nộp luận văn/luận án điện tử, phản biện học thuật xét duyệt, nhân viên thư viện tiếp nhận, giám đốc thư viện phê duyệt lưu trữ, và quản trị viên cấu hình hệ thống.

### 2. Truy cập và đăng nhập

1. Kết nối mạng LIB_PRIVATE, mở trình duyệt và truy cập địa chỉ cổng http://172.28.60.43/.
2. Nhập **Tên đăng nhập** và **Mật khẩu**.
3. Nhấn **Login** (Đăng nhập).
4. Sau khi đăng nhập thành công, hệ thống hiển thị **Dashboard** tương ứng với vai trò của tài khoản.
5. Đổi mật khẩu bằng **Change password** trên thanh đầu trang. Cần mật khẩu hiện tại nếu tài khoản đăng nhập bằng mật khẩu.

**Lưu ý:** Mỗi tài khoản chỉ thấy chức năng thuộc vai trò được cấp. Nếu quên mật khẩu, liên hệ quản trị viên để được cấp lại. Khi quản trị viên đặt **login_method** là `google`, màn đăng nhập dùng **Login with Google** cho tài khoản `@hcmut.edu.vn` đã được xác minh.

### 3. Tài khoản khởi tạo

Chỉ seed sẵn **admin** (`admin1` / `admin123`). Các vai trò khác (student, reviewer, library, director) do admin tạo trong **User management**.

Cấu trúc khoa / học kỳ / đợt: dùng **Sync from DSpace root** hoặc tạo trên UI — không còn data mẫu archive.

### 4. Quy trình xử lý luận văn (tổng quan)

```
Sinh viên lưu nháp / nộp bài
        ↓
Bước hiện tại của quy trình (mặc định: phản biện → thư viện → giám đốc)
        ↓
Đúng vai trò của bước đó: Duyệt hoặc Từ chối
        ↓
Bước cuối là giám đốc: Lưu trữ (archived)
Bước cuối không phải giám đốc: Đã duyệt (approved)
        hoặc
BỊ TỪ CHỐI (rejected)  →  Sinh viên sửa và nộp lại (về bước đầu)

Bài approved hoặc archived có thể đẩy ở Push to DSpace.
```

Admin đặt thứ tự từng bước trong **Administration → Approval workflow**. Nhiều vai trò có thể cùng một thứ tự và sẽ duyệt song song. Mỗi bước chỉ chọn `reviewer`, `library_staff` hoặc `director`. Một vai trò có thể vắng, hoặc xuất hiện lại ở thứ tự khác. Bài đã nộp giữ các bước lúc nộp, không đổi khi admin sửa mẫu.

**Các trạng thái chính:**

| Trạng thái | Ý nghĩa |
|------------|---------|
| draft | Bản nháp — chưa gửi vào quy trình |
| reviewing | Đang chờ một bước không phải bước cuối của giám đốc |
| approved | Đã xong bước cuối mà bước đó không lưu trữ, hoặc đang chờ giám đốc ở bước cuối |
| rejected | Bị từ chối ở một bước; nộp lại thì về bước đầu |
| archived | Giám đốc đã lưu ở bước cuối; chưa chắc đã có item trên DSpace |

### 5. Flow chính

Luồng mặc định, từ lúc mở đợt đến khi bài có trên DSpace. Các vai trò cùng thứ tự duyệt song song. Thứ tự sau chỉ mở khi mọi vai trò ở thứ tự hiện tại đã xong.

1. **Admin** tạo tài khoản student, reviewer, library_staff, director. Student và reviewer phải gắn khoa. **Thư viện hoặc admin** tạo học kỳ, mở đợt nộp (**open**).
2. **Sinh viên** chọn học kỳ và đợt đang mở, điền form, chọn tác giả và phản biện, tải PDF. Có thể **Save draft** (`draft`). **Submit thesis** chụp quy trình lúc nộp và giao cho bước đầu.
3. **Bước phản biện:** từng người được gán **Approve** hoặc **Reject** (reject bắt buộc có lý do). Một người từ chối thì bài thành `rejected`. Khi mọi người duyệt, vai trò phản biện ở thứ tự đó hoàn tất. Nếu còn vai trò khác cùng thứ tự, bài chờ họ. Hết thứ tự thì sang thứ tự kế. Vào một bước phản biện mới thì quyết định của bước đó về `pending`.
4. **Bước thư viện hoặc giám đốc không phải bước cuối:** **Duyệt** hoàn tất vai trò đó. Bài sang thứ tự sau khi mọi vai trò cùng thứ tự đã xong. **Reject** (có lý do) thì `rejected`.
5. **Bước cuối là giám đốc:** **Archive** hoàn tất vai trò giám đốc. Nếu còn vai trò khác cùng thứ tự cuối, bài `archived` khi những vai trò đó cũng xong. Nếu chuỗi không có giám đốc, bước cuối chỉ chuyển `approved`.
6. **Thư viện hoặc admin** mở **Archive configuration → Push to DSpace**. Hàng đợi gồm bài `approved` và `archived`. Chọn collection, rồi **Push selected**. Push thành công thì có `dspace_item_id`. Lỗi thì DSpace status vẫn là `pending` để đẩy lại. Trạng thái cổng không đổi vì push.

**Nhánh rẽ**

| Việc xảy ra | Hệ thống làm gì |
|-------------|-----------------|
| Sinh viên nộp lại bài `rejected`, `approved` hoặc `reviewing` khi vẫn được phép | **Submit again** đưa bài về bước đầu của quy trình hiện tại |
| Đang `reviewing` và mọi phản biện còn `pending` | **Save draft** đưa bài về nháp và mở lại nút nộp. Không còn nút chuyển về nháp riêng |
| Bài `archived` | Sinh viên không sửa, không xóa |
| Chưa có quyền nhóm nào | Mọi phản biện chọn và thấy hàng đợi như cũ |
| Đã có ít nhất một quyền nhóm | Phản biện chỉ thấy và chỉ duyệt sinh viên thuộc nhóm được cấp |

### 6. Giới hạn kỹ thuật quan trọng

- File luận văn: **PDF**. Dung lượng tối đa lấy từ **thesis_max_file_size_mb** (mặc định 30 MB). Chữ trên vùng tải file đổi theo giá trị admin đang lưu.
- Mỗi sinh viên có **một bản nháp** và tối đa **một luận văn đang nộp** (không ở trạng thái nháp) tại một thời điểm. Nộp bài sẽ chuyển bản nháp sang quy trình phản biện.
- Email sinh viên tự điền theo dạng: **tên đăng nhập@hcmut.edu.vn**.

---

## HƯỚNG DẪN CHO SINH VIÊN

### 1. Chức năng chính

- Chọn học kỳ và đợt nộp (khoa lấy từ tài khoản, không đổi trên form).
- Nhập thông tin luận văn (tiếng Việt, tiếng Anh, người hướng dẫn, ngành, năm, loại tài liệu, tóm tắt).
- Tìm và chọn đồng tác giả, phản biện theo tên hoặc username.
- Tải file PDF luận văn.
- Lưu bản nháp hoặc nộp chính thức.
- Theo dõi trạng thái và quyết định phản biện.
- Chỉnh sửa hoặc xóa trong một số điều kiện. Bài đang phản biện mà chưa ai quyết định: **Save draft** đưa về nháp.
- Nộp lại sau khi bị từ chối hoặc sau khi thư viện đã duyệt (nếu cần chỉnh sửa).

### 2. Nộp luận văn lần đầu

**Bước 1 — Chọn đợt nộp**

1. **Faculty** (Khoa) đã gán cho tài khoản và không sửa được trên form. Nếu trống, nhờ quản trị viên gán khoa.
2. Chọn **Semester** (Học kỳ).
3. Chọn **Submission period** (Đợt nộp đang mở). Đợt nộp hiển thị ngày đóng.

**Bước 2 — Nhập thông tin luận văn**

Các mục dưới đây nhập được ngay, không cần chọn đợt trước và không bắt theo thứ tự. **Save draft** và **Submit thesis** vẫn cần đã chọn đợt nộp.

| Trường | Mô tả |
|--------|--------|
| Email | Tự điền từ tài khoản (không sửa) |
| Thesis title (Vietnamese) | Tên luận văn tiếng Việt — bắt buộc |
| Thesis title (English) | Tên luận văn tiếng Anh — bắt buộc |
| Advisor(s) | Người hướng dẫn (có thể nhiều người, phân cách bằng dấu chấm phẩy) |
| Major | Ngành / chuyên ngành |
| Year | Năm tốt nghiệp / năm nộp |
| Authors | Tìm theo tên hoặc username, rồi chọn tài khoản sinh viên (bắt buộc có chính mình) |
| Reviewers | Tìm theo tên hoặc username, chọn ít nhất một phản biện |
| Type | Loại tài liệu: **Thesis** (mặc định), **Dissertation**, hoặc **Graduation thesis** |
| Abstract | Tóm tắt luận văn |
| Thesis PDF | Kéo thả hoặc chọn file PDF. Dòng hướng dẫn ghi dung lượng tối đa đang cấu hình |

**Bước 3 — Lưu hoặc nộp**

- **Save draft** (Lưu nháp): Lưu tiến độ vào **một** bản nháp duy nhất (chưa gửi phản biện). Có thể quay lại chỉnh sửa sau.
- **Submit thesis** (Nộp luận văn): Chuyển bản nháp sang quy trình phản biện. Cần đủ thông tin và file PDF.

### 3. Quản lý bản nháp và bài đã nộp

**Form nhập liệu:** Người nộp tạo/sửa draft và submit. Form **không** tự điền khi mở trang; nhấn **Edit** trong Detail để tiếp tục draft (có autofill faculty / semester / period). Đồng tác giả không tạo draft, không submit, không edit — chỉ **Detail**.

**Bảng My submissions:** Draft và bài đã nộp của bạn, cùng bài bạn là đồng tác giả (kể cả draft). Mở **Detail** để xem. Người nộp sửa từ form hoặc từ **Edit** trong chi tiết khi còn được phép. Nút **Delete** hiện trên **Chi tiết bài nộp** khi được phép.

### 4. Khi nào được chỉnh sửa / xóa / chuyển về nháp?

| Tình huống | Được phép |
|------------|-----------|
| Bản nháp (draft) — người nộp | Sửa, xóa, nộp chính thức |
| Đồng tác giả trên bài đã nộp | Chỉ Detail; không draft / edit / submit thesis khác |
| Khi author chính Submit | Hệ thống xóa draft cá nhân của các co-authors |
| Đang phản biện, **chưa có** phản biện nào duyệt/từ chối | Sửa, xóa, và **Save draft** (chuyển về nháp, mở lại nộp) |
| Đang phản biện, **đã có** phản biện duyệt hoặc từ chối | Không sửa — chờ kết quả cuối |
| Bị từ chối (rejected) | Sửa, xóa, và **Submit again** (Nộp lại) |
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

- Chỉ phản biện bài đang ở bước `reviewer`, được gán cho mình, và quyết định của bước đó còn `pending`.
- Nếu đã cấp quyền nhóm, chỉ thấy bài của sinh viên thuộc nhóm sinh viên được nối với nhóm của mình.
- Nếu **một phản biện từ chối**, luận văn chuyển sang **bị từ chối**; sinh viên phải chỉnh sửa và nộp lại.
- Khi **tất cả phản biện của bước đó đã duyệt**, bài sang bước tiếp theo trong quy trình đã chụp lúc nộp.
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

Chỉ hiện bài đang ở bước `library_staff`. Với quy trình mặc định, đó là sau khi mọi phản biện của bước trước đã duyệt.

Thao tác trên từng bài:

| Nút | Tác dụng |
|-----|----------|
| Detail | Xem chi tiết |
| Duyệt | Duyệt tiếp nhận. Bước không phải cuối thì sang bước sau; bước cuối thì **approved** |
| Reject | Từ chối — nhập lý do, chuyển sang **rejected** |

**Bảng All submissions:** nhấp một dòng để mở **Chi tiết bài nộp**. Không còn nút Sửa/Chi tiết trên từng dòng. Nút **Export submissions** tải CSV của bảng đang lọc.

### 3. Tab Archive configuration (Cấu hình lưu trữ)

Nhân viên thư viện **được phép chỉnh sửa** cấu hình:

- **Faculties** (Khoa)
- **Semesters** (Học kỳ) — theo từng khoa
- **Submission periods** (Đợt nộp) — thời gian mở/đóng, trạng thái open/closed/draft

Tab **Push to DSpace** đẩy bài `approved` hoặc `archived` lên collection. Lọc theo khoa, học kỳ, đợt và DSpace status (`pending`, `published`, `failed`), chọn bài, rồi **Push selected**. Bài `draft`, `reviewing`, `rejected` không nằm trong hàng đợi này. Trên cây DSpace, bấm một collection để mở collection đó trên giao diện DSpace.

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

Liệt kê bài đang ở bước `director`. Bước cuối hiện **Archive**. Bước giám đốc ở giữa chuỗi hiện **Approve** và chỉ chuyển sang bước sau.

| Nút | Tác dụng |
|-----|----------|
| Detail | Xem chi tiết, file PDF và lịch sử |
| Archive | Chỉ ở bước cuối — lưu trên cổng, chuyển sang **archived**. Chưa tạo item DSpace |
| Approve | Bước giám đốc không phải cuối — sang bước tiếp |
| Reject | Nhập lý do, chuyển sang **rejected** |

**Bảng All submissions:** nhấp một dòng để mở chi tiết. Có **Export submissions** cho bảng đang lọc.

### 3. Tab Archive configuration

Giám đốc chỉ **xem** cấu hình khoa, học kỳ, đợt nộp — **không** tạo/sửa (do nhân viên thư viện hoặc quản trị viên thực hiện).

### 4. Quy trình đề xuất

1. Nhân viên thư viện duyệt tiếp nhận → **approved**.
2. Giám đốc kiểm tra metadata và file.
3. Giám đốc nhấn **Archive** để lưu trên cổng. Muốn trả lại bài thì nhấn **Reject** và nhập lý do.
4. Bài **approved** hoặc **archived** — nhân viên thư viện hoặc admin đẩy lên DSpace ở **Archive configuration → Push to DSpace**. `dspace_item_id` có sau khi push thành công. Sinh viên không sửa bài **archived**.
5. Cách kiểm tra bằng API: [`huong-dan-kiem-tra-archive-dspace.md`](./huong-dan-kiem-tra-archive-dspace.md).

---

## HƯỚNG DẪN CHO QUẢN TRỊ VIÊN (ADMIN)

### 1. Chức năng chính

- Quản lý tài khoản người dùng, gồm nhập từ file.
- Cấu hình quyền theo vai trò, form nộp bài, email và tham số hệ thống.
- Tạo hoặc sửa bài nộp thay sinh viên.
- Cấu hình lưu trữ và **Push to DSpace**.

**Lưu ý:** Quản trị viên không phản biện hay tiếp nhận luận văn. Dashboard có ba tab: **Administration**, **Submissions**, **Archive configuration**.

### 2. Tab Manage users (Quản lý người dùng)

| Thao tác | Mô tả |
|----------|--------|
| Create user | Tạo tài khoản (username, mật khẩu, tên hiển thị, vai trò). Student và reviewer bắt buộc chọn **faculty** |
| Import | Nhập nhiều tài khoản từ file; xem trước rồi xác nhận. Student/reviewer thiếu khoa trong file thì chọn khoa chung lúc import. File một vai trò thì gán vào một nhóm có sẵn hoặc tạo nhóm mới. File lẫn sinh viên và phản biện thì chọn hoặc tạo hai nhóm, mỗi vai trò một nhóm |
| Edit | Sửa thông tin, khoa, vai trò, kích hoạt/vô hiệu hóa |
| Delete | Xóa một tài khoản, hoặc chọn nhiều dòng rồi **Delete selected**. Không xóa được chính mình, admin đang hoạt động cuối cùng, hoặc tài khoản đã có hồ sơ / phản biện |
| Assign to group | Chọn nhiều sinh viên hoặc nhiều phản biện, rồi gán vào nhóm đúng loại. Thành viên đang có trong nhóm được giữ lại |
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
| dspace_api_base_url | Base URL REST DSpace, ví dụ `http://host.docker.internal:8080/server` hoặc `http://10.10.10.21:8080/server` |
| dspace_api_user | Email/username DSpace — dùng **auto-login** |
| dspace_api_password | Mật khẩu DSpace (auto-login) |
| thesis_max_file_size_mb | Dung lượng tối đa file PDF (mặc định 30 MB). Form nộp hiện đúng số này |
| submission_timezone | Múi giờ đợt nộp |
| library_support_phone | Số điện thoại hỗ trợ thư viện |
| maintenance_mode | Bật true: chỉ admin đăng nhập được |

Nhấn **Save** sau khi chỉnh sửa. Tab **Email configuration** đặt SMTP và mẫu thư quy trình.

**login_method:** `username` (mật khẩu) hoặc `google` (đăng nhập Google `@hcmut.edu.vn`).

**DSpace:** tab **Cài đặt DSpace** chỉ hiện base URL, user và password, kèm hướng dẫn đã dịch. `dspace_api_token` và `dspace_root_community_id` không hiện trên form và không bị xóa khi lưu. Đẩy item (và PDF) làm ở **Push to DSpace** cho bài `approved` hoặc `archived`. Nút **Duyệt** của thư viện không publish.

### 5. Tab Submissions

- **All submissions** (Tất cả bài nộp): nhấp dòng để mở **Chi tiết bài nộp**. Nút sửa nằm trong chi tiết. **Export submissions** xuất CSV các cột đang lọc.
- **Authors** và **Reviewers** trên form tìm theo tên hoặc username.
- **Submission fields** (Cấu trúc bài nộp): mọi ô, kể cả khoa, đợt nộp, tác giả, phản biện và PDF, đều bật/tắt, đổi kiểu nhập và xóa được. Trường tắt không bắt buộc lúc nộp. Đúng key và đúng kiểu thì form giữ ô chọn khoa, chọn phản biện hoặc tải PDF.
- **Approval workflow:** thêm, xóa bước duyệt và đặt thứ tự. Thứ tự được trùng: ví dụ reviewer, library staff và director cùng order 1 thì cả ba duyệt song song. Phải còn ít nhất một bước.
- **User groups:** tạo nhóm sinh viên hoặc phản biện, gán user đúng vai trò (từng người trong tab này, hoặc chọn nhiều user ở **Manage users** rồi **Assign to group**), rồi chọn nhóm sinh viên mà một nhóm phản biện được duyệt. Chưa có quyền cấp nào thì cách chọn phản biện giữ như cũ.

---

## PHỤ LỤC: XỬ LÝ SỰ CỐ THƯỜNG GẶP

| Vấn đề | Gợi ý xử lý |
|--------|-------------|
| Không đăng nhập được | Kiểm tra username/password; tài khoản có bị disabled; maintenance_mode |
| Không thấy đợt nộp | Đợt chưa **open** hoặc đã hết hạn; liên hệ thư viện |
| Không nộp được — đã có bài nộp | Chỉ một bài chính thức; dùng Edit trên bài hiện có hoặc lưu nháp khác |
| Không sửa được bài đang phản biện | Đã có phản biện quyết định; chờ kết quả hoặc liên hệ phản biện |
| File PDF bị lỗi | Đúng định dạng PDF và không vượt **thesis_max_file_size_mb** |
| Phản biện không thấy bài | Sinh viên chưa chọn đúng reviewer, bài chưa tới bước phản biện, hoặc quyền nhóm không cấp sinh viên này |
| Thư viện không thấy hàng đợi | Bài chưa ở bước thư viện |
| Đã duyệt hoặc Archive nhưng chưa thấy trên DSpace | Vào **Push to DSpace**. Hàng đợi gồm `approved` và `archived`. Lọc DSpace status `pending`, rồi push |

---

## LIÊN HỆ HỖ TRỢ

- Hỗ trợ kỹ thuật hệ thống: Quản trị viên (admin).
- Hỗ trợ nộp luận văn / đợt nộp: Nhân viên thư viện.
- Số điện thoại tham khảo (cấu hình trong hệ thống): **library_support_phone**.

---

*Tài liệu áp dụng cho phiên bản Thesis Portal hiện tại. Khi triển khai production, thay đổi URL, tài khoản demo và thông tin liên hệ cho phù hợp.*
