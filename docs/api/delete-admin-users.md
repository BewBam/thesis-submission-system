# DELETE /admin/users/:userId

Xóa tài khoản. JWT + `manage_users`.

Không cho xóa:

- chính tài khoản đang đăng nhập
- admin active cuối cùng
- user đã có bản nộp (`submissions.student_id`) hoặc bản review (`reviews.reviewer_id`) — dùng Disable thay vì xóa
