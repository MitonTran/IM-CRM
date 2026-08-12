# Bảo mật, RLS và audit

## Kiểm soát truy cập

- Supabase Auth; xác minh email, chính sách mật khẩu và MFA cho Admin khi plan hỗ trợ.
- Session qua cookie an toàn theo hướng dẫn SSR hiện hành; middleware chỉ hỗ trợ UX, RLS là lớp bắt buộc.
- RLS trên tất cả bảng ứng dụng và policy trên private Storage bucket.
- Backend xác thực lại user; không tin role/team/owner từ client. Route quản trị kiểm tra Admin.
- Service role lưu server-only, giới hạn nơi sử dụng; không dùng cho browser hoặc câu hỏi AI trực tiếp.

## Audit bắt buộc

- Tạo/sửa/xóa mềm khách; đổi status/owner/team; assignment.
- Tạo/sửa/xóa activity quan trọng; hoàn thành/dời task.
- Tạo/điều chỉnh/vô hiệu hóa deal; thay đổi KPI target. Điều chỉnh phải lưu liên kết bản cũ/bản thay thế và lý do, không ghi đè lịch sử.
- Mời/khóa user, đổi role/team.
- Upload/version/xóa/đổi quyền tài liệu; AI request và tool access ở mức metadata.
- Log bất biến, tránh lưu secret; before/after che trường nhạy cảm và có request ID.

## Bảo vệ dữ liệu

- TLS; mã hóa at-rest theo nền tảng; signed URL ngắn hạn.
- Validation server, giới hạn file/request, sanitize tên file, không thực thi macro hoặc nội dung upload.
- CSRF theo mô hình auth, CSP và security headers; chống XSS qua escaping, không render HTML AI tùy ý.
- CSP production dùng nonce mới theo từng request, `strict-dynamic`, chặn object/frame/base ngoài allowlist và chỉ cho kết nối tới app + Supabase origin đã cấu hình. Script không dùng `unsafe-inline`; development chỉ thêm `unsafe-eval` cho React debugging.
- Rate limit đăng nhập, tìm kiếm, upload và AI. Không đưa PII vào log/analytics không cần thiết.
- Backup, PITR/retention phụ thuộc plan; có runbook khôi phục và kiểm thử định kỳ.

## Kiểm thử quyền tối thiểu

1. Hai Sale cùng/khác team không đọc/sửa khách của nhau.
2. Leader đọc team nhưng không đọc team khác; không chuyển liên-team.
3. Admin thao tác toàn hệ thống; thao tác được audit.
4. Thay owner/team trong payload bị `WITH CHECK` chặn.
5. Biết UUID/path không giúp đọc customer/activity/deal/document/chunk ngoài quyền.
6. RPC, view, realtime và signed URL không tạo đường vòng RLS.
7. User bị khóa mất quyền; token cũ được xử lý theo chính sách session.
8. AI tool và citation tái kiểm tra quyền sau khi user đổi team/quyền tài liệu.

## Checklist migration

- Migration chỉ tiến, có tên timestamp; schema, constraint, index, RLS/policy và seed cấu hình tách rõ.
- Review lock/backfill cho migration dữ liệu; không sửa migration đã chạy Production.
- Test migration trên local/Preview với dữ liệu giả; kiểm tra `EXPLAIN` cho query chính.
- Rollback nghiệp vụ ưu tiên migration sửa tiếp; backup trước thay đổi rủi ro.

## Deploy

1. Local: lint, typecheck, unit/integration/RLS tests.
2. Preview: Supabase project/branch riêng, secret riêng, migration tự động có kiểm soát, smoke/E2E.
3. Duyệt migration và biến môi trường; backup Production.
4. Apply migration rồi deploy Vercel Production; smoke test role và theo dõi log.

Endpoint `/api/health` chỉ trả `{ "status": "ok" }`, `no-store` và không kiểm tra/tiết lộ schema, secret hay trạng thái tài khoản. Dùng endpoint này cho liveness của Preview/Production; readiness dữ liệu phải nằm trong smoke test đã xác thực.
