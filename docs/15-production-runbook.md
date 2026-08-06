# Runbook Preview → Production

Tài liệu này quy định cách phát hành IM CRM trên GitHub, Supabase và Vercel. Mặc định là **không tự động đưa thay đổi lên Production**: mọi bản phát hành phải qua Preview, UAT và một người chịu trách nhiệm bấm duyệt.

## 1. Vai trò vận hành

| Vai trò | Trách nhiệm |
|---|---|
| Release owner | khóa phạm vi, xem CI/Preview, điều phối phát hành và rollback |
| Database owner | review migration/RLS, backup, `dry-run`, apply migration một lần |
| UAT approvers | đại diện Sale, Leader, Admin ký checklist Preview |
| Incident commander | quyết định dừng phát hành, rollback frontend hoặc khôi phục dữ liệu |

Tên và kênh liên lạc cụ thể phải được điền vào phiếu phát hành trước Production.

## 2. Cổng chặn trước Preview

- Pull request chỉ chứa phạm vi đã duyệt; không có PII, credential hoặc dữ liệu thật.
- CI xanh: lint, typecheck, unit, build, 300 database/RLS tests và Playwright E2E/security/performance.
- Migration chỉ tiến, tên rõ, không sửa file đã chạy; thay đổi rủi ro có kế hoạch forward-fix.
- Review bắt buộc khi chạm RLS: Sale A, Sale B, Leader team A, Leader team B và Admin.
- Các quyết định Production trong `docs/12-open-decisions.md` đã có chủ sở hữu; đặc biệt MFA Admin, retention file, nhà cung cấp AI và backup/PITR.

## 3. Tạo và kiểm tra Preview

1. Tạo Supabase Preview branch/project riêng, không dùng chung database, Auth user, Storage hoặc secret với Production.
2. Link CLI đúng project Preview; ghi project ref vào phiếu phát hành. Kiểm tra `supabase migration list`, sau đó chạy `supabase db push --dry-run`.
3. Database owner xem danh sách migration rồi mới chạy `supabase db push`. Chỉ Preview được dùng seed/dữ liệu giả; không dùng `--include-seed` cho Production.
4. Cấu hình Vercel Preview bằng secret riêng:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`;
   - `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`;
   - `AI_PROVIDER`, `AI_MODEL` và đúng một API key server-only được duyệt.
5. Cấu hình Supabase Auth Site URL/redirect URL đúng domain Preview. Không bật public signup.
6. Deploy Vercel Preview từ pull request. Chạy GitHub Actions workflow `Preview smoke` với Preview origin để kiểm tra `/api/health`, nội dung login, CSP/security headers và response budget; sau đó thực hiện smoke/UAT có đăng nhập trong `docs/16-uat-checklist.md`.
7. Chạy Lighthouse/Speed Insights trên Preview cho `/login`, `/dashboard`, `/customers`; ghi kết quả và mọi ngoại lệ vào phiếu phát hành.

## 4. Cổng chặn Production

Không tiếp tục nếu thiếu bất kỳ mục nào:

- Ba UAT approver đã ký; không còn lỗi nghiêm trọng/cao.
- Commit SHA, Preview URL, Supabase Preview ref và kết quả CI đã được lưu.
- Biến môi trường Production được đối chiếu theo tên, không sao chép key Preview.
- RTO/RPO và Supabase plan/PITR đã được chốt. Backup gần nhất có trạng thái thành công; Storage được kiểm tra riêng vì database backup không chứa object file.
- Maintenance window, release owner, database owner, incident commander và kênh thông báo đã sẵn sàng.
- Bản Vercel Production tốt gần nhất vẫn được giữ lại cho Instant Rollback.

## 5. Trình tự phát hành

1. Tạm dừng thay đổi khác; thông báo bắt đầu maintenance window.
2. Database owner xác minh project Production đang link, chạy `supabase migration list` và `supabase db push --dry-run`; dừng nếu danh sách khác phiếu phát hành.
3. Xác nhận backup/PITR lần cuối, sau đó mới chạy `supabase db push` một lần. Không `db reset --linked`, không sửa SQL trực tiếp trên Production.
4. Kiểm tra nhanh database: migration history, RLS và các RPC chính; không ghi dữ liệu demo.
5. Tạo Vercel Production deployment dựa trên đúng commit đã UAT. Nếu plan/quy trình hỗ trợ, dùng staged Production deployment và chỉ gán domain sau smoke test.
6. Promote deployment đã duyệt; ghi deployment ID và thời gian UTC.
7. Chạy smoke test Production theo thứ tự: health → login → Sale → Leader → Admin → cron authorization. Chỉ dùng tài khoản nghiệm thu và bản ghi đã được phép.
8. Theo dõi log, error rate, latency và Auth/Database trong tối thiểu 30 phút; thông báo kết thúc hoặc chuyển sang incident.

## 6. Rollback

### Chỉ lỗi web/app, database vẫn tương thích

1. Incident commander dừng rollout và chọn Vercel deployment tốt gần nhất.
2. Dùng Instant Rollback/Promote deployment cũ; không xóa deployment cũ.
3. Lặp lại health và smoke test ba role; ghi mốc thời gian, deployment ID và phạm vi ảnh hưởng.

### Migration đã apply

- Vercel rollback **không** rollback database. Chỉ rollback web nếu code cũ tương thích schema mới.
- Ưu tiên migration forward-fix đã review và thử trên bản sao/Preview; không sửa migration cũ và không thao tác tay tùy ý.
- Chỉ khôi phục backup/PITR khi có mất/hỏng dữ liệu và incident commander chấp nhận downtime/RPO. Trong lúc restore, ứng dụng có thể không truy cập được.

## 7. Backup và diễn tập khôi phục

- Chốt RPO (mất tối đa bao nhiêu dữ liệu) và RTO (khôi phục trong bao lâu) trước khi chọn daily backup hay PITR.
- Supabase paid plan có daily backup theo thời gian lưu của plan; PITR là add-on. Free tier cần logical export định kỳ và lưu off-site được mã hóa.
- Database backup chỉ khôi phục metadata Storage, không khôi phục file object đã mất; phải có kế hoạch Storage riêng.
- Mỗi quý, restore backup vào project cô lập/disposable, chạy migration check, đếm bản ghi, kiểm tra Auth/RLS/Storage và ghi thời gian thực tế. Không diễn tập bằng cách ghi đè Production.

## 8. Phân loại sự cố

| Mức | Ví dụ | Phản ứng ban đầu |
|---|---|---|
| P0 | lộ secret/PII, sai RLS diện rộng, mất/hỏng dữ liệu | dừng truy cập/phát hành, xoay secret, báo incident commander ngay |
| P1 | không đăng nhập được, CRM cốt lõi không dùng được | rollback app nếu an toàn; kiểm tra Auth/DB và thông báo người dùng |
| P2 | một chức năng phụ lỗi, có workaround | khoanh vùng, tạo issue và lên bản sửa có kiểm soát |

Không ghi token, password, nội dung khách hàng hoặc file tài liệu vào ticket/log sự cố. Sau P0/P1 phải có timeline UTC, nguyên nhân, phạm vi dữ liệu, hành động khắc phục và owner phòng ngừa tái diễn.

## 9. Phiếu phát hành tối thiểu

- Commit SHA / PR / Preview URL / Production deployment ID.
- Supabase Preview ref / Production ref (chỉ ID, không secret).
- Migration được apply; backup timestamp UTC; RTO/RPO đã duyệt.
- Kết quả CI, UAT ba role, Lighthouse/Speed Insights, smoke test sau deploy.
- Release owner, database owner, incident commander; thời gian bắt đầu/kết thúc UTC.
- Quyết định release/rollback và vấn đề còn lại.

## Tham chiếu nền tảng

- Supabase: Database Migrations, Database Backups và Local development workflow.
- Vercel: Managing Deployments, Preview/Production environments và Instant Rollback.
