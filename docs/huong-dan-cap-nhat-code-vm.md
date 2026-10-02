# Cập nhật code trên VM

Áp dụng khi cổng đã cài theo [Cách 3 trong README](../README.md#cách-3--vm-debian-12-không-docker): source ở `/opt/thesis_portal`, API là service `thesis-portal`, giao diện là bản build trong `frontend/dist` do Nginx phục vụ.

Việc này thay code đang chạy. Không tạo lại database, không ghi đè `backend/.env`, không xóa PDF trong `backend/uploads/`.

## Trước khi cập nhật

SSH vào VM bằng tài khoản có quyền `sudo`.

```bash
cd /opt/thesis_portal
git status
git remote -v
```

`git status` phải sạch, hoặc chỉ có file local không thuộc repo (`.env`, `backend/uploads/`). Nếu có sửa tay trong source, ghi lại hoặc commit trước. `git pull` sẽ dừng nếu những sửa đó đụng file sắp được cập nhật.

Xem commit đang chạy và commit trên `main`:

```bash
git fetch origin
git log --oneline -1 HEAD
git log --oneline -1 origin/main
```

## Kéo code và build

Chạy tuần tự. Lệnh sau chỉ chạy khi lệnh trước thành công.

```bash
cd /opt/thesis_portal
git pull origin main

cd /opt/thesis_portal/backend
npm install
npm run build

cd /opt/thesis_portal/frontend
npm install
npm run build

chown -R thesis:thesis /opt/thesis_portal
systemctl restart thesis-portal
```

`npm install` ở cả hai thư mục vì khóa phụ thuộc có thể đổi. `npm run build` của backend ghi `backend/dist`; frontend ghi `frontend/dist`. Nginx đọc `dist` ngay, không cần reload trừ khi file site Nginx cũng đổi.

User `thesis` chạy API. `chown` để process đó đọc được `node_modules` và `dist`, và vẫn ghi được `backend/uploads/`.

## Kiểm tra

```bash
systemctl status thesis-portal --no-pager
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1/api/health
```

Kỳ vọng cả hai lệnh `curl` trả `{"status":"ok"}`. Mở `http://<ip-vm>/` trên trình duyệt và đăng nhập một tài khoản đã có.

Nếu API không lên:

```bash
journalctl -u thesis-portal -n 80 --no-pager
```

## Những thứ không làm lại

| Việc | Lý do |
| --- | --- |
| Chạy lại `db/thesis_portal_full.sql` hoặc `db/init/001_schema.sql` | Script tạo schema từ database trống. Chạy trên database đang dùng sẽ lỗi hoặc ghi đè dữ liệu. |
| Xóa hoặc copy đè `backend/.env` | Chứa `JWT_SECRET` và mật khẩu Postgres của máy này. |
| Xóa `backend/uploads/` | PDF luận văn đã nộp nằm ở đây. |
| `docker compose` trên VM này | Cách cài này không chạy app bằng Docker. |

Repo hiện không có file migration từng bước. Nếu bản cập nhật đổi cấu trúc bảng, chỉ chạy đúng câu SQL mới trên `thesis_portal`, sau khi đã xem diff của `db/init/001_schema.sql`. Sao lưu trước:

```bash
pg_dump -h 127.0.0.1 -U thesis_user -d thesis_portal -F c -f /root/thesis_portal-$(date +%F).dump
```

## Khi không dùng Git trên VM

Máy build phải có cùng nhánh với bản sẽ chạy. Đồng bộ cây source vào `/opt/thesis_portal`, nhưng loại trừ:

- `backend/.env`
- `backend/uploads/`
- `backend/node_modules/`
- `backend/dist/`
- `frontend/node_modules/`
- `frontend/dist/`

Ví dụ từ máy có repo, thay `<user>` và `<ip-vm>`:

```bash
rsync -av --delete \
  --exclude backend/.env \
  --exclude backend/uploads \
  --exclude backend/node_modules \
  --exclude backend/dist \
  --exclude frontend/node_modules \
  --exclude frontend/dist \
  ./ <user>@<ip-vm>:/opt/thesis_portal/
```

`--delete` xóa trên VM những file source không còn trong repo. Hai thư mục bị exclude ở trên không bị xóa. Sau đó SSH vào VM và chạy `npm install`, `npm run build`, `chown`, `systemctl restart thesis-portal` như mục trên.
