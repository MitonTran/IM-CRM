# Các quyết định cần xác nhận sau

Các mục này không chặn thiết kế MVP; mặc định bên dưới được dùng cho đến khi có quyết định khác.

| Quyết định | Mặc định MVP | Khi nào cần chốt | Ảnh hưởng |
|---|---|---|---|
| Đăng nhập | email + mật khẩu; Admin mời user | trước M1 UAT | UX và vận hành tài khoản |
| Một người/một team | đúng | trước schema M1 | RLS và membership |
| Lead chưa giao | Leader team/Admin thấy; Sale không thấy | trước M2 | policy customers |
| Trùng số/email | chặn trùng chính xác toàn tổ chức; không tự merge | trước M2 UAT | index và quy trình dữ liệu |
| Cửa sổ sửa activity của Sale | 24 giờ, sau đó Leader/Admin | trước M3 | policy và audit |
| Ngưỡng “không chăm sóc” | 3 ngày | trước M4 | cảnh báo dashboard |
| KPI mục tiêu cụ thể | Leader/Admin cấu hình, không hard-code | trước M4 UAT | seed và báo cáo |
| Attribution doanh thu sau chuyển giao | owner tại thời điểm deal | trước M4 | KPI cá nhân |
| Giới hạn file | 25 MB/file, allowlist MIME | trước M5 | Storage/cost |
| Quyền tài liệu cá nhân | đúng một user; chưa có ACL nhiều người | trước M5 | schema ACL |
| OCR và parser | bật theo định dạng/chi phí đã thử nghiệm | trước M5 UAT | worker/cost/chất lượng |
| Retention file đã xóa | không purge tự động trong MVP | trước Production | chi phí/pháp lý |
| Retention AI | 90 ngày hội thoại, analysis giữ cùng khách | trước M6/Production | privacy/cost |
| Model/quota AI | cấu hình server, quota theo user/ngày | trước M6 | chi phí/chất lượng |
| MFA Admin | bật nếu plan/quy trình hỗ trợ | trước Production | bảo mật/vận hành |
| Backup/PITR | chọn theo Supabase plan và RTO/RPO | trước Production | chi phí/khôi phục |

## Điều kiện bắt buộc dừng và hỏi lại

- Thay đổi ba role chính; nhân viên cần xem dữ liệu nhau; nhiều cơ sở hoặc đa chi nhánh cách ly.
- Một khách có nhiều người đồng phụ trách; xóa vĩnh viễn; người ngoài truy cập.
- AI ghi/sửa/xóa CRM; tích hợp Zalo/Facebook/tổng đài trong MVP.
- Dữ liệu tài chính chi tiết, sức khỏe, giấy tờ tùy thân hoặc dữ liệu nhạy cảm.
- Bất kỳ thay đổi nào tác động schema cốt lõi hoặc mô hình quyền đã chốt.

