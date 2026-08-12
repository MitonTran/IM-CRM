# Tiêu chí nghiệm thu

## M1 Nền tảng và Auth

- [ ] Sale, Leader, Admin đăng nhập/đăng xuất/khôi phục được; user khóa bị chặn.
- [ ] Profile/team/role lấy từ server; không thể tự nâng quyền.
- [ ] RLS test chứng minh phạm vi own/team/all; Preview deploy thành công.
- [ ] CI chạy lint, typecheck, test; env mẫu không chứa secret.

## M2 CRM khách hàng

- [ ] Tạo khách yêu cầu tên + một kênh; chuẩn hóa và cảnh báo/chặn trùng.
- [ ] List/detail/search/filter/pagination đúng phạm vi và có empty/error state.
- [ ] Chuyển giao transaction-safe, giữ lịch sử, task được xử lý rõ và audit.
- [ ] Soft delete không làm mất lịch sử; Sale không xóa hoặc đổi owner.

## M3 Hành trình, follow-up, doanh thu

- [ ] Activity có type/outcome/occurred time/actor/next step và timeline đúng thứ tự.
- [ ] Task quá hạn theo timezone, hoàn thành/dời/hủy có lịch sử.
- [ ] Deal VND có idempotency, active/void; điều chỉnh nguyên tử giữ bản cũ, không tạo replacement trùng/mồ côi và doanh thu/KPI chỉ tính bản active.
- [ ] Quy trình từ lead mới đến won/lost chạy được với cả ba role.

## M4 KPI và dashboard

- [ ] Từng KPI khớp bộ dữ liệu kiểm thử và công thức trong tài liệu.
- [ ] Target ngày/tháng/năm; tiến độ và mẫu số 0 hiển thị đúng.
- [ ] Dashboard Sale/Leader/Admin có filter, drill-down và không vượt quyền.
- [ ] Nhập muộn, void, deleted và timezone được kiểm thử.

## M5 Kho tài liệu

- [ ] Private bucket, signed URL và ACL organization/team/user không thể bypass.
- [ ] Upload/version/soft delete/search/preview-download fallback hoạt động.
- [ ] PDF/DOCX/XLSX/PPTX/ảnh có trạng thái extraction rõ; file gốc tách text/chunk.
- [ ] Version/xóa/đổi quyền được audit; chunks mất quyền biến mất khỏi search.

## M6 AI

- [ ] Phân tích khách trả JSON hợp schema, evidence hợp lệ và lưu lịch sử/usage.
- [ ] Tool allowlist không nhận scope tùy ý và không thực thi SQL/ghi CRM.
- [ ] Câu trả lời tài liệu có citation mở được; thiếu dữ liệu thì nói rõ.
- [ ] Test đối kháng chứng minh AI không đọc khách/tài liệu ngoài quyền.
- [ ] Quota, timeout, token limit, error fallback và cảnh báo AI hoạt động.

## M7 Go-live

- [x] E2E/UAT ký duyệt bởi đại diện Sale, Leader, Admin.
- [ ] Security/performance/smoke test đạt; lỗi nghiêm trọng đã đóng.
- [ ] Backup, restore, incident và deploy/rollback runbook được diễn tập.
- [ ] Production deploy qua Preview; theo dõi sau deploy và owner hỗ trợ rõ ràng.

## Tiêu chí nghiệm thu từng issue

Mỗi issue phải có: hành vi happy path; validation/empty/error; ít nhất một test quyền nếu chạm dữ liệu; migration và policy nếu đổi DB; test tự động phù hợp; kiểm tra Preview; báo cáo file, migration và lệnh kiểm tra. Issue không đạt nếu chỉ ẩn UI mà RLS vẫn cho truy cập.
