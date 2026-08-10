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
| Tài khoản UAT | Pass (thiết lập) | Preview hiện có đủ Admin, Sale A, Sale B/Team B, Leader Team A và Leader Team B; Leader Team B hiển thị đúng role Leader, Team B và trạng thái hoạt động. Kiểm tra chéo bằng từng phiên đăng nhập vẫn chưa thay thế ký duyệt UAT. |

Các checkbox bên dưới vẫn để trống cho đến khi có đủ tài khoản nhiều vai trò, thực hiện các bước ghi bằng dữ liệu giả và người dùng ký duyệt.

### UAT-01 — lời mời lỗi để lại profile mặc định

- Phát hiện lúc `2026-08-09T13:44:20Z` trên Supabase/Vercel Preview; không ảnh hưởng Production.
- Kỳ vọng: Leader Team B được gán role Leader, Team B và có trạng thái phù hợp sau lời mời.
- Thực tế: auth user/profile được tạo nhưng profile giữ mặc định `sale`, `team_id = null`, `is_active = false`.
- Chẩn đoán: trigger `handle_new_auth_user()` chủ động tạo profile mặc định trước; `invitePerson()` chỉ cập nhật role/team sau khi `inviteUserByEmail()` thành công. Nếu bước gửi lời mời lỗi sau khi auth user đã được tạo, action chuyển sang `invite-failed` và bỏ qua profile update, để lại trạng thái một phần.
- Khắc phục tại commit `61336c9192b4e4f95a9fc622e6056263859a5a97`, migration `20260809000200_m7_invitation_recovery.sql`:
  - RPC `configure_invited_profile` chỉ cho Admin đang hoạt động, chỉ xử lý profile chưa kích hoạt, kiểm tra team hoạt động và ghi audit qua trigger hiện có.
  - Khi Supabase chưa gửi được email, role/team dự kiến được lưu nhưng profile vẫn chưa kích hoạt; Admin có thể gửi lại cùng email.
  - Profile chỉ được kích hoạt sau khi `inviteUserByEmail()` trả thành công; tài khoản đã xác nhận/đã đăng nhập/đang hoạt động bị từ chối khỏi luồng recovery.
- Kiểm tra: local lint/typecheck `Pass`, unit `77/77`, database/RLS `353/353` với Sale A, Sale B, Leader A, Leader B và Admin; Quality workflow `31317594842` pass application/database/E2E; Vercel deployment của commit trên pass.
- Đối chiếu Preview sau deploy: trang `/admin/people` tải đúng UI mới và hiển thị Leader Team B là `Sale Leader` / `Team B` / `Hoạt động`, tổng cộng 5 tài khoản UAT đúng vai trò.
- Trạng thái: Resolved on Preview. Không gửi lại email live cho Leader Team B sau deploy vì tài khoản đã hoạt động; nhánh rate-limit/retry được xác minh bằng unit + database/RLS test, còn kiểm tra chéo bằng phiên đăng nhập từng vai trò vẫn thuộc checklist UAT bên dưới.

### Bằng chứng tích hợp Auth recovery và restore drill ngày 2026-08-09

- Commit SHA: `c19b07f919b81e91669808ef63e0e9bf252d5caa`.
- Hoàn tất đối chiếu lúc: `2026-08-09T14:42:49Z` trên Vercel/Supabase Preview; Production không thay đổi.
- Password recovery: invite dùng callback allowlist tới `/auth/update-password`; trang `/auth/forgot-password` hiển thị đúng trên Preview, email sai bị browser validation chặn và không phát sinh email. Phản hồi gửi email không tiết lộ tài khoản có tồn tại.
- Luồng tạo recovery token, đặt mật khẩu mới, từ chối mật khẩu cũ và đăng nhập bằng mật khẩu mới đã pass trong E2E local-only của Quality workflow `31318905871`; không dùng service-role hoặc token thật trên Preview.
- Restore drill: local run pass backup/restore isolated/fixture/migration/count/RLS và đã tự xóa database disposable; database job của workflow trên cũng pass và lưu artifact `restore-drill-report` 14 ngày.
- Giới hạn: chưa gửi email recovery thật và chưa đổi mật khẩu tài khoản UAT Preview trong phiên hỗ trợ này. Người dùng vẫn cần hoàn tất invite/recovery trong email để thực hiện checklist đăng nhập chéo và ký duyệt.

### UAT-02 — recovery Preview chuyển sang sai hostname

- Phát hiện khi người dùng thử “Quên mật khẩu” cho Sale A và Sale B trên Vercel Preview; callback trả `recovery-expired`.
- Nguyên nhân: biến Preview `NEXT_PUBLIC_APP_URL` cố định ở `https://crm.ieltsmentor.io.vn`, trong khi phiên PKCE được tạo trên hostname Vercel Preview. Email chuyển callback sang domain CRM nên trình duyệt không gửi code verifier cookie của hostname ban đầu.
- Khắc phục code: recovery và invitation lấy HTTPS origin của chính Server Action khi `Origin` khớp `Host`/`X-Forwarded-Host`; chỉ cho phép HTTP ở localhost và chỉ dùng `NEXT_PUBLIC_APP_URL` làm fallback đã kiểm tra.
- Khắc phục cấu hình lúc `2026-08-09T15:49:11Z`: Supabase Preview ref `mhnvjuppwyoqibhtevhv` đã thêm hai Redirect URLs `/auth/callback` và `/auth/callback?next=/auth/update-password` cho hostname UAT `im-crm-git-codex-preview-p-2d339c-…vercel.app`. Không thay đổi Site URL hoặc Production.
- Kiểm tra cục bộ: lint `Pass`, typecheck `Pass`, unit `89/89`, production build `Pass`; unit mới bao phủ Preview same-origin, local HTTP, origin độc hại/sai host và fallback an toàn.
- Triển khai: commit `2f315d1` đã deploy lên Vercel Preview; Quality workflow `31322197374` pass application, database/restore drill và E2E. Smoke chỉ đọc lúc `2026-08-09T15:53:57Z` pass health, login content, security headers và response budget; `/auth/forgot-password` trả `200` trên hostname UAT.
- Trạng thái: code và cấu hình Preview đã hoàn tất; còn chờ người dùng yêu cầu một email recovery mới trong cùng trình duyệt để xác nhận live flow. Link cũ đã dùng/hết hạn không được tái sử dụng.

### UAT-03 — recovery vẫn phụ thuộc PKCE của trình duyệt gửi yêu cầu

- Phát hiện khi người dùng thử lại live recovery sau UAT-02: ứng dụng vẫn trả `recovery-expired` khi link email được mở ngoài phiên trình duyệt đã gửi form.
- Bằng chứng Auth log đã khử PII: `/recover` trả `200`, sau đó `/verify` trả `303` và referer trỏ đúng hostname UAT; không có lượt `/token` tiếp theo để đổi authorization code thành session. Supabase đã nhận và xác minh link, nhưng callback ứng dụng thiếu PKCE code verifier của trình duyệt ban đầu.
- Khắc phục: recovery đặt `RedirectTo` tới `/auth/confirm` cùng origin; template Reset password dùng `{{ .RedirectTo }}`, `{{ .TokenHash }}` và `type=recovery`. Route server gọi `verifyOtp` rồi mới chuyển tới `/auth/update-password`, nên không phụ thuộc trình duyệt đã gửi yêu cầu.
- Người dùng xác nhận đã thêm hostname UAT `/auth/confirm` vào Supabase Preview Redirect URLs trước khi deploy code. Không thay đổi Production hoặc schema/database.
- Kiểm tra cục bộ lúc `2026-08-09T16:24:40Z`: lint `Pass`, typecheck `Pass`, unit `90/90`, production build `Pass`, database/RLS `353/353`.
- Triển khai: commit `6aef12f527c0` đã deploy lên Vercel Preview; Quality workflow `31323772367` pass application, database/restore drill, E2E và Vercel deployment. Template Reset password trên Supabase Preview đã được cập nhật thủ công để dùng `RedirectTo` + `TokenHash`; không ghi token hoặc secret vào repository.
- Kiểm tra live lúc `2026-08-09T16:46:04Z`: người dùng xác nhận email recovery mới đưa Sale A qua trang đặt mật khẩu và đăng nhập thành công trên Preview. Không thay đổi Production.
- Trạng thái: Resolved on Preview. Password recovery của Sale A `Pass`; các kiểm tra phạm vi dữ liệu và ký duyệt đầy đủ của Sale A vẫn tiếp tục theo checklist bên dưới.

### UAT-04 — Sale không tạo được khách vì thiếu trường quản trị ẩn

- Phát hiện trong phiên UAT Sale A ngày `2026-08-09`: Dashboard, chặn trang Admin, quyền chỉ đọc tài liệu và đăng xuất/đăng nhập lại đều được người dùng xác nhận `Pass`; form tạo khách trả `Invalid input`.
- Nguyên nhân: UI không render `ownerUserId` và `teamId` cho Sale, nhưng schema Server Action vẫn yêu cầu hai field phải có mặt. Validation dừng request trước RPC; database và RLS không bị thay đổi.
- Khắc phục local: hai field quản trị được phép vắng mặt và chuẩn hóa thành `null`; RPC vẫn tự lấy owner/team từ phiên Sale đã xác thực. Giá trị UUID sai nếu được gửi thủ công vẫn bị từ chối.
- Kiểm tra local: lint `Pass`, typecheck `Pass`, unit `93/93`, production build bằng Webpack `Pass`. Turbopack trong sandbox Codex bị chặn bind cổng nội bộ; đây là giới hạn môi trường và cần được đối chiếu lại bởi Vercel Preview build.
- Triển khai: commit `c9b6ea0` đã được push; Quality workflow `31325089885` và Vercel Preview deployment đều pass.
- Xác nhận live ngày 2026-08-10: Sale A tạo thành công khách giả `Khách UAT Sale A 20260810-01` bằng email giả; không còn lỗi `Invalid input` và hệ thống mở hồ sơ khách vừa tạo.
- Xác nhận chống trùng ngày 2026-08-10: gửi lại form với cùng email giả bị hệ thống chặn và không tạo bản ghi thứ hai.
- Trạng thái: `Resolved` trên Preview; tạo khách hợp lệ và chống trùng email đều `Pass`. Các bước Sale A còn lại vẫn đang chờ UAT.

### UAT-05 — quản trị team và thành viên bằng khóa mềm

- Quy ước được người dùng chốt ngày `2026-08-10`: “xóa” team/nhân sự nghĩa là ngừng/khóa bằng trạng thái, không xóa cứng và phải giữ toàn bộ lịch sử.
- Migration `20260810000100_m7_admin_people_management.sql` thu hồi quyền sửa/xóa trực tiếp của authenticated và thêm hai RPC Admin-only cho đổi tên, role, team và trạng thái.
- Guardrail: chặn ngừng team còn member/khách hoạt động; chặn khóa, đổi role hoặc chuyển team Sale còn khách hay follow-up mở; chặn Admin hiện tại tự hạ quyền/chuyển team/tự khóa; chặn kích hoạt user trong team đã ngừng.
- Kiểm tra local: lint `Pass`, typecheck `Pass`, unit `93/93`, database/RLS `388/388` với Sale A, Sale B, Leader A, Leader B và Admin; production build Webpack `Pass`; Playwright E2E `8/8`, gồm đổi tên/ngừng/kích hoạt team và đổi tên/khóa/kích hoạt thành viên.
- Triển khai Preview ngày `2026-08-10`: commit `d591e2f` đã được Vercel deploy; migration trên đã apply và được xác nhận khớp local/remote tại Supabase Preview ref `mhnvjuppwyoqibhtevhv`. Workflow Preview smoke `31375393361` pass public smoke, kiểm tra đăng nhập có secrets, performance và Lighthouse; artifact được lưu 14 ngày.
- Trạng thái: automation Preview complete; còn chờ Admin đăng nhập và xác nhận thao tác trên dữ liệu giả. Production chưa thay đổi.

### UAT-06 — Sale A cập nhật hồ sơ đúng phạm vi

- Xác nhận live ngày 2026-08-10 trên Preview: Sale A đổi ưu tiên khách giả sang `Cao`, thêm ghi chú UAT và lưu thành công; dữ liệu vẫn đúng sau khi tải lại.
- UI Sale A không hiển thị công cụ đổi người phụ trách/team hoặc xóa khách. Các thao tác quản trị vẫn chỉ xuất hiện cho vai trò được phép.
- Sale A đã ghi thành công activity `Cuộc gọi` / `Đã kết nối` và tạo follow-up ưu tiên cao cho ngày 2026-08-11; activity xuất hiện trên timeline và task xuất hiện trong nhóm sắp tới theo giờ Việt Nam.
- Sale A dời task về `2026-08-10 00:05` giờ Việt Nam; task rời nhóm sắp tới, xuất hiện đúng trong cả `Hôm nay` và `Quá hạn`, kèm trạng thái cảnh báo.
- Sale A hoàn thành task với kết quả UAT; task biến mất khỏi danh sách quá hạn đang mở và vẫn xem được trong bộ lọc `Hôm nay` / `Hoàn thành` cùng lý do xử lý.
- Trạng thái: cập nhật thông tin, giới hạn công cụ quản trị và toàn bộ luồng activity/follow-up của Sale A đều `Pass`. Giao dịch VND đã pass tại UAT-07; kiểm tra chéo bằng Sale B vẫn đang chờ UAT.

### UAT-07 — điều chỉnh giao dịch không ghi đè lịch sử

- Quyết định được người dùng chốt ngày 2026-08-10: Sale sửa deal do mình tạo trong 24 giờ; Leader/Admin sửa theo phạm vi. Mỗi lần sửa phải vô hiệu bản cũ và tạo bản thay thế trong một transaction, không ghi đè hoặc tạo bản mồ côi làm sai KPI/mục tiêu.
- Migration `20260810000200_m7_deal_amendments.sql` thêm liên kết self-FK, unique replacement trực tiếp và RPC `amend_deal` idempotent. Database vẫn chỉ cấp `SELECT` trực tiếp cho authenticated; mọi ghi đi qua RPC kiểm tra quyền.
- Kiểm tra local: lint `Pass`, typecheck `Pass`, unit `95/95`, database/RLS `411/411` với đủ năm vai trò, production build Webpack `Pass`, Playwright E2E `9/9`. Test bao phủ retry cùng idempotency key, no-op, cửa sổ Sale 24 giờ, chặn chéo team, Leader/Admin, FK không mồ côi và KPI chỉ cộng ba bản replacement active đúng `645.000.000 VND`.
- Triển khai Preview ngày 2026-08-10: commit `4c59e3a` đã push; migration đã dry-run rồi apply vào Supabase Preview ref `mhnvjuppwyoqibhtevhv`, và migration list local/remote khớp đến `20260810000200`. Quality workflow `31399244052` pass application, database/restore drill và E2E; Vercel deployment pass.
- Smoke chỉ đọc lúc `2026-08-10T14:42:45Z`: cả deployment URL và branch alias UAT pass health, login content, security headers và response budget, không cần protection bypass.
- Xác nhận live lúc `2026-08-10T15:17:45Z` bằng phiên Sale A: khách giả chỉ có một giao dịch Active `25.500.000 VND` và một bản nguồn `25.000.000 VND` ở trạng thái vô hiệu; bản Active hiển thị là bản điều chỉnh, có lý do và còn đúng sau tải lại.
- Dashboard Sale A cùng kỳ hiển thị doanh thu `25.500.000 VND`, khớp đúng tổng Active của khách giả và không cộng cả bản đã vô hiệu. Cơ chế retry/idempotency không tăng doanh thu hai lần đã được bao phủ thêm bởi database/RLS và Playwright E2E ở trên.
- Trạng thái: `Pass` trên Preview cho luồng Sale A và KPI không nhân đôi. Production chưa thay đổi; kiểm tra chéo Sale B/Leader/Admin vẫn thuộc các cổng UAT tiếp theo.

## Smoke test chung

- [ ] `/api/health` trả `200`, `{ "status": "ok" }`, `Cache-Control: no-store`.
- [ ] `/login` có CSP nonce, chặn frame/object; không lộ header nền tảng/secret.
- [ ] Sai email/mật khẩu trả thông báo chung; user khóa không vào CRM.
- [ ] Đăng xuất hủy phiên; URL bảo vệ quay về login.
- [ ] Mobile và desktop không vỡ layout; keyboard focus nhìn thấy; loading/empty/error state đọc được.
- [ ] Cron route từ chối request thiếu/sai `CRON_SECRET`; không chạy retention/extraction bằng request công khai.

## Sale A

- [x] Chỉ thấy khách do Sale A phụ trách; không thấy khách chưa giao hoặc Sale B.
- [x] Tạo khách hợp lệ; trùng phone/email chính xác bị cảnh báo/chặn.
- [x] Cập nhật thông tin được phép; không tự đổi owner/team hoặc xóa khách.
- [x] Ghi activity và follow-up; task hôm nay/quá hạn đúng `Asia/Ho_Chi_Minh`.
- [x] Tạo deal VND một lần; submit lặp không tăng doanh thu hai lần.
- [x] Dashboard cá nhân khớp dữ liệu nguồn; không vào được trang Admin.
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
- [ ] Mỗi thành viên hiển thị đúng email đăng nhập Auth cạnh họ tên; không hiển thị email ngoài trang Admin.
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
