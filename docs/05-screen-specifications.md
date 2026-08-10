# Đặc tả màn hình

Mọi màn hình có skeleton/loading, lỗi có mã tham chiếu và nút thử lại, forbidden không tiết lộ sự tồn tại bản ghi.

| Màn hình | Quyền | Dữ liệu hiển thị | Hành động | Bộ lọc | Empty/error |
|---|---|---|---|---|---|
| Đăng nhập | công khai | form email/mật khẩu, quên mật khẩu | đăng nhập/khôi phục | không | thông báo chung, không lộ email tồn tại |
| Dashboard | theo role | KPI, task, phễu, doanh thu | đổi kỳ, drill-down | ngày/tháng/năm, source; Leader/Admin thêm user/team | hướng dẫn tạo dữ liệu; widget lỗi độc lập |
| Khách hàng | Sale own; Leader team; Admin all | tên, liên hệ che phù hợp, status, owner, source, hoạt động gần nhất, follow-up | tạo, mở, sửa; Leader/Admin giao/xóa mềm | tìm kiếm, status, owner, team, source, tag, quá hạn | CTA tạo khách; giữ filter khi retry |
| Tạo/sửa khách | theo quyền | trường hồ sơ, cảnh báo trùng | lưu/hủy | không | validation từng trường, xử lý conflict |
| Chi tiết khách | theo phạm vi | header, liên hệ, owner, status, timeline, task, giao dịch, AI | ghi hoạt động, lịch follow-up, sửa, đăng ký; quản lý chuyển giao | loại activity, khoảng ngày | timeline rỗng có CTA; 404/forbidden chung |
| Việc của tôi/team | Sale own; Leader team; Admin all | task nhóm quá hạn/hôm nay/sắp tới | hoàn thành, dời lịch, mở khách | assignee, due range, priority, status | chúc mừng khi hết việc; lỗi không mất lựa chọn |
| KPI cá nhân | authenticated | mục tiêu, thực tế, tiến độ, xu hướng | đổi kỳ, drill-down nguồn | ngày/tháng/năm, source | nêu rõ chưa đặt mục tiêu/không dữ liệu |
| KPI team | Leader/Admin | bảng Sale, tổng team, conversion | đặt mục tiêu, drill-down | team, user, kỳ, source | team chưa có Sale; lỗi widget |
| Giao dịch | theo phạm vi | khách, owner, amount, ngày, status | tạo; Leader/Admin vô hiệu hóa | kỳ, owner/team/source/status | chưa có doanh thu; validation tiền |
| Kho tài liệu | theo scope | cây thư mục, file, version, trạng thái AI | upload, tạo thư mục, preview, tải; có quyền thì sửa/xóa | scope, loại file, trạng thái, tìm kiếm | hướng dẫn upload; lỗi file riêng |
| Chi tiết tài liệu | theo scope | metadata, preview, version, quyền, trạng thái trích xuất | tải, tạo version, reprocess nếu có quyền | version | preview không hỗ trợ thì tải; lỗi xử lý rõ |
| AI phân tích khách | theo quyền khách | snapshot time, summary, score, objections, actions | chạy lại, copy gợi ý | phiên bản phân tích | cảnh báo thiếu dữ liệu/AI hỗ trợ |
| AI hỏi đáp | authenticated | hội thoại, câu trả lời, citations, usage tùy quyền | hỏi, mở nguồn, phản hồi | phạm vi thời gian/team theo quyền | câu hỏi mẫu; trạng thái không đủ dữ liệu |
| Quản trị user/team | Admin | họ tên, email đăng nhập từ Auth, role, team, trạng thái | mời, đổi tên, khóa/kích hoạt user, đổi role/team; tạo, đổi tên, ngừng/kích hoạt team | team/role/status | CTA mời; cảnh báo và chặn khi còn member, khách hoặc task mở; không xóa cứng |
| Audit | Admin | actor, action, entity, thời gian, diff an toàn | xem chi tiết/xuất sau MVP | thời gian, actor, entity, action | không log; payload lỗi được che |

## Form khách hàng tối thiểu

- Bắt buộc: họ tên, một trong phone/email, source; owner tùy quyền.
- Tùy chọn: status mặc định `new`, priority, tag, ghi chú tóm tắt.
- Không thu thập giấy tờ tùy thân, sức khỏe hoặc dữ liệu nhạy cảm.

## Quy ước bảng CRM khách hàng

Các quy ước này bổ sung từ nghiên cứu giao diện CRM mã nguồn mở, nhưng được điều chỉnh cho quy trình và quyền của IM CRM:

- Trạng thái danh sách gồm `q`, `status`, `owner`, `team`, `source`, `tag`, `overdue`, `sort`, `dir` và `page` nằm trong URL. Tải lại hoặc chia sẻ URL phải tái tạo đúng view trong phạm vi quyền hiện tại.
- Thay đổi tìm kiếm, filter hoặc sort đưa `page` về 1. Backend chỉ chấp nhận trường sort/filter nằm trong allowlist; không chuyển trực tiếp tên cột hoặc biểu thức từ URL thành SQL.
- Cột mặc định: Khách hàng, liên hệ chính, trạng thái, người phụ trách, nguồn, hoạt động gần nhất và follow-up tiếp theo. Trên màn hình nhỏ ưu tiên Khách hàng, trạng thái và follow-up; cột phụ được ẩn theo breakpoint.
- Header bảng giữ cố định khi cuộn. Cột sortable có `aria-sort`; loading giữ dữ liệu trang trước nếu vẫn cùng phạm vi quyền; empty state phân biệt “chưa có khách” với “không khớp bộ lọc”.
- Chỉ hiển thị lựa chọn facet có kết quả trong phạm vi người dùng. Số lượng facet phải được tính sau RLS, không được làm lộ dữ liệu ngoài quyền.
- Click một dòng mở detail sheet bên phải và giữ nguyên vị trí/filter của danh sách. URL lưu `customer=<uuid>` để Back/Forward hoạt động; server vẫn kiểm tra RLS khi tải sheet.
- Hover/focus có thể prefetch chi tiết nhưng không được dùng service role hoặc bỏ qua RLS. Prefetch lỗi không chặn thao tác chính.
- Tạo khách dùng sheet/form ngắn. Sau khi tạo thành công: đóng form, cập nhật cache/danh sách, mở chi tiết khách mới và hiển thị thông báo; submit được bảo vệ khỏi gửi trùng.
- Một `DataTable` dùng chung chịu trách nhiệm search slot, facets, sort, responsive columns, loading, empty, error và pagination. Cấu hình cột/dữ liệu của khách hàng nằm trong feature CRM, không đưa logic nghiệp vụ vào component UI dùng chung.

Chi tiết nguồn tham khảo và ranh giới áp dụng nằm tại `docs/14-reference-trycompai-crm.md`.
