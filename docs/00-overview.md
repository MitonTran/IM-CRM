# Tổng quan hệ thống CRM IELTS Mentor Thanh Hóa

## Mục đích

CRM nội bộ giúp đội kinh doanh quản lý khách hàng, lịch chăm sóc, lịch sử tương tác, doanh thu, KPI, tài liệu và trợ lý AI trong một hệ thống có phân quyền rõ ràng.

## Phạm vi MVP đã chốt

### Bao gồm

- Đăng nhập và quản lý người dùng theo ba vai trò: Admin, Sale Leader, Sale.
- Team, phân công và chuyển giao một khách hàng cho một Sale tại một thời điểm.
- Hồ sơ khách hàng, nguồn khách, trạng thái, tag, tìm kiếm, lọc và chống trùng.
- Timeline hoạt động: gọi, nhắn tin, hẹn, tư vấn, ghi chú, thay đổi trạng thái, đăng ký.
- Lịch follow-up, nhắc việc trong ứng dụng và phát hiện quá hạn.
- Ghi nhận giao dịch với doanh thu cuối cùng bằng VND.
- Mục tiêu KPI, KPI tự tổng hợp và dashboard theo quyền.
- Kho tài liệu dùng Supabase Storage, phân quyền toàn hệ thống/team/cá nhân.
- AI phân tích khách hàng và AI hỏi đáp qua các backend tool định nghĩa trước.
- Audit log, RLS, soft delete và lịch sử phân tích/hỏi đáp AI.

### Ngoài MVP

- ERP, kế toán, lương, chấm công, quản lý lớp học toàn diện.
- Công thức học phí/combo phức tạp; chỉ lưu số doanh thu cuối cùng.
- App mobile native; chatbot tự nhắn khách; Zalo cá nhân; tổng đài; Facebook Lead Ads.
- AI tự tạo, sửa hoặc xóa dữ liệu CRM; AI chạy SQL tùy ý.
- Đa chi nhánh cách ly dữ liệu, người ngoài tổ chức và dữ liệu sức khỏe/giấy tờ tùy thân.

## Giả định thiết kế

1. Một tổ chức và múi giờ `Asia/Ho_Chi_Minh`; tiền tệ `VND`.
2. Một người thuộc tối đa một team tại một thời điểm; Admin có thể không thuộc team.
3. Một khách hàng có đúng một Sale phụ trách tại một thời điểm; lịch sử chuyển giao được giữ lại.
4. Lead chưa giao chỉ Admin/Leader phù hợp được xem; Sale không xem hàng đợi chung.
5. Email hoặc số điện thoại chuẩn hóa được dùng phát hiện trùng; bản ghi nghi trùng cần người có quyền xử lý.
6. Xóa nghiệp vụ là xóa mềm. Xóa vĩnh viễn không thuộc MVP.
7. Nhắc việc MVP hiển thị trong app; email/push có thể bổ sung sau.
8. AI là tính năng hỗ trợ, người dùng chịu trách nhiệm kiểm tra đề xuất.

## Module

1. Nền tảng, Auth và tổ chức.
2. CRM khách hàng và phân công.
3. Hoạt động, timeline và follow-up.
4. Giao dịch, KPI và dashboard.
5. Kho tài liệu.
6. AI phân tích và hỏi đáp.
7. Quản trị, audit và bảo mật.

## Nguyên tắc sản phẩm

- Tối đa hóa tốc độ nhập liệu; form ngắn, mặc định hợp lý, thao tác chính rõ ràng.
- Hoạt động là nguồn sự thật của KPI; không cho nhân viên tự nhập kết quả KPI có thể tính được.
- Quyền được thực thi tại database bằng RLS, không chỉ ẩn trên giao diện.
- Mọi thay đổi schema qua migration; Preview trước Production.
- Thiết kế MVP đơn giản nhưng giữ được lịch sử và khả năng mở rộng.

## Kiến trúc mục tiêu

```text
Next.js trên Vercel
  -> Supabase Auth
  -> Supabase PostgreSQL + RLS
  -> Supabase Storage + policy
  -> Backend route/Edge Function cho AI và xử lý tài liệu
       -> OpenAI API
       -> pgvector (chỉ các đoạn tài liệu người dùng được phép đọc)
```

## Môi trường và biến cấu hình

- Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
- Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.
- Tùy chọn: model AI, giới hạn file, quota AI và cờ bật/tắt module.
- Không commit giá trị bí mật. Service role chỉ dùng trong backend tin cậy, không dùng để bỏ qua quyền người dùng trong truy vấn AI.

