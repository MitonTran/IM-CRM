# Checklist UAT và smoke test

Chỉ thực hiện trên Vercel Preview + Supabase Preview bằng dữ liệu giả. Mỗi bước ghi `Pass`, `Fail` hoặc `Blocked`, kèm người thực hiện, thời gian UTC và issue nếu có. Không chép PII/secret vào bằng chứng.

## Thông tin phiên UAT

- Commit SHA:
- Vercel Preview URL:
- Supabase Preview ref:
- Migration cuối:
- Người điều phối:
- Thời gian bắt đầu/kết thúc (UTC):

## Smoke test chung

- [ ] `/api/health` trả `200`, `{ "status": "ok" }`, `Cache-Control: no-store`.
- [ ] `/login` có CSP nonce, chặn frame/object; không lộ header nền tảng/secret.
- [ ] Sai email/mật khẩu trả thông báo chung; user khóa không vào CRM.
- [ ] Đăng xuất hủy phiên; URL bảo vệ quay về login.
- [ ] Mobile và desktop không vỡ layout; keyboard focus nhìn thấy; loading/empty/error state đọc được.
- [ ] Cron route từ chối request thiếu/sai `CRON_SECRET`; không chạy retention/extraction bằng request công khai.

## Sale A

- [ ] Chỉ thấy khách do Sale A phụ trách; không thấy khách chưa giao hoặc Sale B.
- [ ] Tạo khách hợp lệ; trùng phone/email chính xác bị cảnh báo/chặn.
- [ ] Cập nhật thông tin được phép; không tự đổi owner/team hoặc xóa khách.
- [ ] Ghi activity và follow-up; task hôm nay/quá hạn đúng `Asia/Ho_Chi_Minh`.
- [ ] Tạo deal VND một lần; submit lặp không tăng doanh thu hai lần.
- [ ] Dashboard cá nhân khớp dữ liệu nguồn; không vào được trang Admin.
- [ ] Chỉ xem tài liệu organization/team A/cá nhân của mình; citation AI không mở tài liệu ngoài quyền.

## Sale B (kiểm tra chéo)

- [ ] Không tìm, mở bằng UUID, sửa hoặc xem activity/deal/task của khách Sale A.
- [ ] Không xem tài liệu team A/cá nhân Sale A, kể cả khi biết URL/path.

## Leader team A

- [ ] Thấy Sale A và khách chưa giao team A; không thấy team B.
- [ ] Giao/chuyển khách trong team A transaction-safe; lịch sử assignment và audit rõ.
- [ ] Không chuyển khách sang team B hoặc tự nâng quyền.
- [ ] Dashboard/team KPI, leaderboard, filter và target chỉ giới hạn team A.
- [ ] Quản lý tài liệu team A; không thấy/chỉnh team B.

## Leader team B (kiểm tra chéo)

- [ ] Không đọc khách, task, deal, KPI hoặc tài liệu team A.
- [ ] UUID, filter query và URL trực tiếp không tạo đường vòng RLS.

## Admin

- [ ] Thấy toàn hệ thống và trang Nhân sự & team.
- [ ] Mời/kích hoạt/khóa user, đổi role/team đúng validation và có audit.
- [ ] User bị khóa mất quyền; không thể tự mở lại từ client.
- [ ] Dashboard all/team/user, KPI VND và void/deleted/late-entry khớp dữ liệu nguồn.
- [ ] Tài liệu organization/team/user, version, signed URL và extraction status hoạt động.
- [ ] AI quota/timeout/fallback hoạt động; tool chỉ đọc, citation mở được và usage/audit được ghi.

## Performance và quan sát

- [ ] Playwright performance budget trong CI đạt.
- [ ] Workflow `Preview smoke` đạt và artifact `preview-performance.json` cho `/login`, `/dashboard`, `/customers` đã được lưu.
- [ ] Lighthouse/Speed Insights Preview cho `/login`, `/dashboard`, `/customers` đã lưu kết quả; không có hồi quy nghiêm trọng.
- [ ] Log Vercel/Supabase không có lỗi nghiêm trọng, PII hoặc secret.
- [ ] Upload 25 MB bị giới hạn đúng; request AI/file không treo vô hạn.

Bằng chứng automation ngày 2026-08-09 nằm tại `docs/18-preview-performance-evidence.md`; workflow chốt `31312097712` đã pass smoke, Playwright performance và Lighthouse cho cả ba route, với Accessibility `1.00`. Các ô trên vẫn để trống cho đến khi được đối chiếu trong một phiên UAT có người thực hiện và thông tin phiên đầy đủ.

## Ký duyệt

| Vai trò | Họ tên | Kết quả | Thời gian UTC | Ghi chú/issue |
|---|---|---|---|---|
| Sale |  |  |  |  |
| Leader |  |  |  |  |
| Admin |  |  |  |  |
| Release owner |  |  |  |  |

Chỉ khi cả bốn hàng được ký `Pass` và không còn P0/P1 mới được chuyển sang cổng Production trong `docs/15-production-runbook.md`.
