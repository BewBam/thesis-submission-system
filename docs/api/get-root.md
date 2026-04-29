# GET /

## Mục đích

Kiểm tra nhanh backend đang chạy và trả về thông tin dịch vụ cơ bản.

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/`
- **Xác thực:** Không

## Phản hồi thành công (200)

JSON:

| Trường    | Kiểu   | Mô tả                    |
| --------- | ------ | ------------------------ |
| `service` | string | Tên dịch vụ backend      |
| `status`  | string | Trạng thái (`ok`)        |
| `message` | string | Thông báo ngắn          |

## Ví dụ

```bash
curl -s http://localhost:3000/
```
