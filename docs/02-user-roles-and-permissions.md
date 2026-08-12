# Vai trò và phân quyền

## Phạm vi dữ liệu

- `own`: bản ghi có `owner_user_id = auth.uid()`.
- `team`: bản ghi thuộc `team_id` của Leader đang hoạt động.
- `all`: toàn tổ chức, dành cho Admin.
- Người dùng bị khóa hoặc membership không hoạt động không có quyền nghiệp vụ.

## Ma trận quyền MVP

| Tài nguyên/hành động | Sale | Leader | Admin |
|---|---|---|---|
| Xem khách | own | team | all |
| Tạo khách | tạo và tự nhận | tạo trong team, giao Sale | tạo/giao bất kỳ team |
| Sửa khách | own, trừ trường quản trị | team | all |
| Xóa mềm khách | không | team, có lý do | all, có lý do |
| Chuyển người phụ trách | không | giữa Sale trong team | toàn hệ thống |
| Ghi/xem hoạt động | own | team | all |
| Sửa hoạt động | bản thân, trong cửa sổ cấu hình; không sửa loại hệ thống | team theo quyền quản lý | all |
| Giao dịch | tạo/xem cho own; điều chỉnh bản tự tạo trong 24 giờ; không tự vô hiệu hóa | team, điều chỉnh/vô hiệu hóa | all, điều chỉnh/vô hiệu hóa |
| Xem KPI | cá nhân | cá nhân + team | toàn hệ thống |
| Đặt mục tiêu | không | Sale/team của mình | all |
| Tài liệu `organization` | đọc | đọc | CRUD |
| Tài liệu `team` | đọc nếu team được cấp | CRUD team | CRUD |
| Tài liệu `user` | đọc nếu được cấp | chỉ khi được cấp | CRUD |
| AI phân tích khách | own | team | all |
| AI hỏi đáp | theo phạm vi CRM/tài liệu hiện tại | theo phạm vi | toàn hệ thống |
| User/team/audit | không | xem thành viên team | quản trị/xem toàn bộ |

## Quy tắc nghiệp vụ

- Role và team không nhận từ payload client; lấy từ profile/membership đã xác thực.
- Chuyển giao tạo `customer_assignments`, đóng assignment cũ và tạo activity hệ thống trong một transaction.
- Sửa owner/team trực tiếp trên `customers` bị cấm với Sale và chỉ đi qua function chuyển giao cho Leader/Admin.
- “Xóa” là cập nhật `deleted_at`, `deleted_by`, `delete_reason`; bản ghi đã xóa bị loại khỏi truy vấn mặc định.
- Không cho người dùng tự nâng role. Thay đổi role/team phải audit.
- Với user và team, “xóa” luôn có nghĩa là khóa/ngừng hoạt động bằng `is_active = false`; không xóa cứng để giữ assignment, activity, task, deal, tài liệu và audit.
- Điều chỉnh deal không cập nhật đè số tiền. RPC khóa bản active, vô hiệu bản cũ và tạo đúng một bản thay thế có liên kết; Sale chỉ được điều chỉnh deal do mình tạo trong 24 giờ, Leader trong đúng team và Admin toàn hệ thống.
- Chỉ Admin đang hoạt động được đổi tên, role, team hoặc trạng thái user/team qua RPC allowlist. Client authenticated không có quyền `UPDATE/DELETE` trực tiếp trên `profiles`/`teams`.
- Không được ngừng team còn thành viên hoạt động hoặc khách chưa xóa mềm. Không được khóa, chuyển team hoặc đổi role của Sale còn khách phụ trách hay follow-up `pending`.
- Admin hiện tại chỉ được đổi tên chính mình; không được tự hạ quyền, chuyển team hoặc tự khóa. User hoạt động không được gán vào team đã ngừng.

## Áp dụng RLS

- Bật RLS trên mọi bảng trong schema ứng dụng, kể cả bảng tổng hợp, AI và tài liệu.
- Policy `SELECT` dùng helper function ổn định như `is_admin()`, `current_team_id()` và kiểm tra owner/team.
- Policy `INSERT/UPDATE` có cả `USING` và `WITH CHECK` để ngăn đổi owner/team vượt quyền.
- View phải dùng `security_invoker`; function đặc quyền dùng `security definer`, `search_path` cố định và kiểm tra quyền bên trong.
- Storage object path không phải nguồn quyền duy nhất; policy đối chiếu `documents/storage_objects` và phạm vi truy cập.
- Service role chỉ dùng cho worker có allowlist; AI thao tác thay mặt user phải truyền user/session và áp dụng kiểm tra tương đương RLS.

## Kiểm tra điểm duyệt 2

- Sale ngoài owner: bị chặn ở `customers`, bảng con, RPC và Storage.
- Leader ngoài team: bị chặn; chuyển liên-team chỉ Admin.
- Admin: có toàn quyền nghiệp vụ cần thiết nhưng vẫn phải audit thao tác quan trọng.
- AI: chỉ gọi tool backend có kiểm tra user; không nhận raw SQL.
- Tài liệu: quyền riêng `organization/team/user`, không suy ra từ quyền CRM.
- Bảng cấu hình công khai nội bộ (ví dụ loại hoạt động) vẫn bật RLS và chỉ cho authenticated đọc.
