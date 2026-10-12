# DELETE /admin/users/:userId

Xóa tài khoản. JWT + `manage_users`.

Không cho xóa:

- chính tài khoản đang đăng nhập
- admin active cuối cùng
- user đã có bản nộp (`submissions.student_id`) hoặc bản review (`reviews.reviewer_id`) — dùng Disable thay vì xóa

# POST /admin/users/bulk-delete

Xóa nhiều tài khoản. JWT + `manage_users`.

Body:

```json
{ "userIds": ["student1", "student2"] }
```

Tối đa 500 id. Mỗi tài khoản áp dụng cùng quy tắc với `DELETE /admin/users/:userId`. Kết quả trả về từng phần:

```json
{
  "deleted": [{ "id": "student1", "username": "student1" }],
  "failed": [{ "id": "student2", "message": "This user has thesis submissions. Disable the account instead of deleting it." }]
}
```
