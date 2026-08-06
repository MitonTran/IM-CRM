# Yêu cầu sản phẩm và MVP

## Vấn đề cần giải quyết

Dữ liệu khách hàng và hoạt động chăm sóc phân tán làm quản lý khó biết ai đang phụ trách, bước tiếp theo là gì, khách nào quá hạn và hiệu quả từng Sale/team. Tài liệu nội bộ cũng cần một nơi lưu trữ có quyền và có thể làm nguồn cho AI.

## Mục tiêu đo được

- 100% khách đang chăm sóc có người phụ trách, trạng thái và hoạt động gần nhất.
- 100% follow-up có hạn được hiển thị đúng trạng thái sắp đến/quá hạn.
- KPI hoạt động và doanh thu truy vết được về bản ghi nguồn.
- Sale không đọc được khách ngoài phạm vi; Leader chỉ đọc dữ liệu team; Admin đọc toàn hệ thống.
- Tài liệu và AI tuân thủ quyền của người dùng hiện tại.

## Đối tượng và nhu cầu

| Đối tượng | Nhu cầu chính |
|---|---|
| Sale | Danh sách khách của mình, nhập hoạt động nhanh, biết việc hôm nay, xem KPI cá nhân |
| Sale Leader | Phân công, theo dõi team, xử lý quá hạn, xem phễu và KPI team |
| Admin/Giám đốc | Quản trị, toàn cảnh doanh thu/KPI, audit, tài liệu và cấu hình |

## Module và hợp đồng chức năng

| Module | Mục tiêu | Đầu vào | Hành động | Đầu ra | Nghiệm thu cốt lõi |
|---|---|---|---|---|---|
| Auth/tổ chức | Truy cập an toàn | tài khoản, profile, team, role | đăng nhập, mời/khóa user, gán team | session và phạm vi dữ liệu | user khóa không đăng nhập; role/team có hiệu lực qua RLS |
| Khách hàng | Một hồ sơ chuẩn | thông tin liên hệ, nguồn, trạng thái | tạo, sửa, giao, chuyển, tìm/lọc | hồ sơ và danh sách | chống trùng; Sale chỉ thấy khách của mình |
| Hoạt động | Lưu hành trình có cấu trúc | loại, kết quả, nội dung, bước tiếp | ghi hoạt động/follow-up | timeline, việc cần làm | timeline đúng thứ tự; KPI truy vết được |
| Giao dịch | Ghi doanh thu cuối | khách, số tiền, ngày đăng ký | tạo/hủy hiệu lực | doanh thu | VND, số không âm, audit đầy đủ |
| KPI/dashboard | Đo hiệu quả | hoạt động, khách, giao dịch, mục tiêu | lọc, xem, drill-down | chỉ số/phễu/tiến độ | công thức thống nhất và theo quyền |
| Tài liệu | Kho tri thức có quyền | file, metadata, phạm vi | upload, phiên bản, tìm, tải/xóa mềm | file gốc và nội dung trích xuất | policy Storage + DB đồng nhất |
| AI | Hỗ trợ quyết định | dữ liệu CRM/tài liệu được phép | phân tích, hỏi đáp | JSON/answer có nguồn | không SQL tùy ý, không ghi CRM, lưu usage |

## Yêu cầu phi chức năng

- Giao diện responsive cho desktop/tablet/mobile web; tiếng Việt.
- Các trang danh sách thông thường phản hồi mục tiêu dưới 2 giây ở quy mô ban đầu, không tính upload/AI.
- Thao tác ghi quan trọng có trạng thái loading, thành công và lỗi; không gửi trùng khi double-click.
- Thời gian lưu UTC, hiển thị theo `Asia/Ho_Chi_Minh`.
- Có log lỗi server nhưng không ghi secret hoặc dữ liệu nhạy cảm không cần thiết.
- Backup/khôi phục theo khả năng Supabase plan; quy trình khôi phục phải được diễn tập trước Production.

## Definition of Done chung

- Đúng đặc tả và quyền; có migration, test phù hợp, lint/typecheck xanh.
- Có empty/loading/error/forbidden state.
- Audit cho hành động quan trọng; không lộ secret hoặc dữ liệu ngoài phạm vi.
- Có hướng dẫn kiểm thử và danh sách file/migration thay đổi.

