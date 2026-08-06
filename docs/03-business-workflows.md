# Quy trình nghiệp vụ đội kinh doanh

## Trạng thái khách hàng

`new` → `contacting` → `consulting` → `follow_up` → `won` hoặc `lost`; `unqualified` dành cho lead không phù hợp. Chuyển ngược được phép nhưng phải ghi activity thay đổi trạng thái. `won` yêu cầu giao dịch hợp lệ; `lost/unqualified` yêu cầu lý do.

## Tiếp nhận và chống trùng

1. Người dùng nhập tên, ít nhất một kênh liên hệ, nguồn và ghi chú ban đầu.
2. Backend chuẩn hóa số điện thoại/email và tìm trùng trong phạm vi tổ chức.
3. Nếu trùng chính xác, không tạo; hiển thị bản ghi người dùng được quyền xem hoặc thông báo liên hệ Leader/Admin.
4. Nếu nghi trùng, đánh dấu `duplicate_review`; Leader/Admin quyết định giữ riêng hoặc hợp nhất ở phiên bản sau. MVP không tự merge.
5. Tạo khách, assignment đầu tiên và activity `customer_created` trong transaction.

## Giao và chuyển khách

1. Leader chọn khách và Sale đang hoạt động trong cùng team; Admin có thể chọn mọi team.
2. Backend khóa bản ghi, xác nhận quyền, kết thúc assignment cũ, ghi assignment mới.
3. Cập nhật `owner_user_id/team_id`; hủy hoặc chuyển follow-up chưa xong theo lựa chọn bắt buộc.
4. Ghi lý do, actor và activity hệ thống; người nhận thấy khách ngay sau transaction.

## Chăm sóc và timeline

1. Sale mở hồ sơ và ghi một activity có cấu trúc: loại, thời điểm, kết quả, nội dung ngắn.
2. Nếu cần chăm sóc tiếp, nhập `next_action` và `follow_up_at`; hệ thống tạo task liên kết.
3. Timeline sắp giảm dần theo `occurred_at`, phân biệt thời gian xảy ra và thời gian nhập.
4. Activity nhập muộn vẫn tính KPI theo `occurred_at` nếu trong thời gian cho phép; dashboard đánh dấu “nhập muộn”.

Loại tối thiểu: `call`, `message`, `appointment`, `consultation`, `note`, `status_change`, `assignment_change`, `registration`. Kết quả gợi ý: `connected`, `no_answer`, `replied`, `booked`, `attended`, `cancelled`, `interested`, `objection`, `not_interested`, `completed`.

## Follow-up

- Task có `due_at`, `status: pending|completed|cancelled`, priority và liên kết activity/customer.
- Quá hạn khi `status=pending AND due_at < now()`; sắp đến được cấu hình mặc định 24 giờ.
- Hoàn thành task yêu cầu activity kết quả hoặc lý do đóng; tạo lịch mới không tự hoàn thành lịch cũ.
- Khi khách `won/lost/unqualified`, hệ thống hỏi xác nhận đóng task còn lại.

## Đăng ký và doanh thu

1. Sale/Leader nhập số doanh thu cuối cùng, ngày đăng ký và ghi chú tùy chọn.
2. Backend xác nhận số tiền không âm, khách trong phạm vi, chống submit trùng bằng idempotency key.
3. Tạo `deals`, activity `registration`, chuyển khách sang `won` nếu chưa ở trạng thái này.
4. Sửa/vô hiệu hóa giao dịch phải có lý do và audit; KPI tính giao dịch `active` theo `registered_at`.

## Một ngày làm việc của Sale

1. Xem dashboard “Hôm nay”: task quá hạn, đến hạn, khách mới.
2. Thực hiện liên hệ và ghi activity ngay sau tương tác.
3. Chọn bước tiếp theo; cập nhật trạng thái khi đủ căn cứ.
4. Cuối ngày xử lý task còn quá hạn và kiểm tra tiến độ KPI.

