# GET /health

## Mục đích

Endpoint health check phù hợp cho probe (Docker/Kubernetes) hoặc giám sát uptime.

## Yêu cầu

- **Phương thức:** `GET`
- **Đường dẫn:** `/health`
- **Xác thực:** Không

## Phản hồi thành công (200)

JSON:

| Trường   | Kiểu   | Mô tả            |
| -------- | ------ | ---------------- |
| `status` | string | Trạng thái (`ok`) |

## Ví dụ

```bash
curl -s http://localhost:3000/health
```
