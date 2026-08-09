# Checklist UAT và smoke test

Chỉ thực hiện trên Vercel Preview + Supabase Preview bằng dữ liệu giả. Mỗi bước ghi `Pass`, `Fail` hoặc `Blocked`, kèm người thực hiện, thời gian UTC và issue nếu có. Không chép PII/secret vào bằng chứng.

## Thông tin phiên UAT

- Commit SHA:
- Vercel Preview URL:
- Supabase Preview ref:
- Migration cuối:
- Người điều phối:
- Thời gian bắt đầu/kết thúc (UTC):

### Bằng chứng kiểm tra đọc Admin ngày 2026-08-09

- Commit SHA: `85078011a536c67e1ca11a2258133747a9b4ff4b`.
- Vercel Preview: `https://im-crm-git-codex-preview-p-2d339c-thongtmmmd-gmailcoms-projects.vercel.app`.
- Supabase Preview ref: `mhnvjuppwyoqibhtevhv`.
- Hoàn tất lúc: `2026-08-09T12:13:04Z`.
- Phạm vi: kiểm tra đọc có hỗ trợ trên phiên Admin UAT; không tạo, sửa, xóa dữ liệu và không thay thế ký duyệt của người dùng.

| Khu vực | Kết quả | Bằng chứng |
|---|---|---|
| Dashboard Admin | Pass | Bộ lọc all/team/user/source có accessible name; KPI, funnel, leaderboard và target form hiển thị; không có lỗi console. |
| Khách hàng | Pass | Danh sách, bộ lọc, phân trang có nhãn, drawer hồ sơ, timeline, follow-up, deal và công cụ quản trị hiển thị bằng dữ liệu giả; không có lỗi console. |
| Kho tài liệu | Pass | Tài liệu organization ở trạng thái `Sẵn sàng cho AI`, semantic index sẵn sàng, lịch sử phiên bản và route signed URL hoạt động. |
| Trợ lý AI | Pass | Provider Groq, quota, token/latency, câu trả lời chỉ đọc và citation tới đúng tài liệu hiển thị; citation mở file private qua Supabase signed URL. |
| Tài khoản UAT | Blocked | Sale B/Team B và Leader Team A đã tạo đúng. Lời mời Leader Team B tạo profile chưa kích hoạt nhưng rơi về role Sale, chưa có team; chưa thể kiểm tra chéo RLS/quyền Team B. |

Các checkbox bên dưới vẫn để trống cho đến khi có đủ tài khoản nhiều vai trò, thực hiện các bước ghi bằng dữ liệu giả và người dùng ký duyệt.

### UAT-01 — lời mời lỗi để lại profile mặc định

- Phát hiện lúc `2026-08-09T13:44:20Z` trên Supabase/Vercel Preview; không ảnh hưởng Production.
- Kỳ vọng: Leader Team B được gán role Leader, Team B và có trạng thái phù hợp sau lời mời.
- Thực tế: auth user/profile được tạo nhưng profile giữ mặc định `sale`, `team_id = null`, `is_active = false`.
- Chẩn đoán: trigger `handle_new_auth_user()` chủ động tạo profile mặc định trước; `invitePerson()` chỉ cập nhật role/team sau khi `inviteUserByEmail()` thành công. Nếu bước gửi lời mời lỗi sau khi auth user đã được tạo, action chuyển sang `invite-failed` và bỏ qua profile update, để lại trạng thái một phần.
- Trạng thái: Blocked. Cần thiết kế luồng invite/recovery idempotent và kiểm thử quyền trước khi sửa profile hoặc tiếp tục UAT nhiều vai trò.

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
