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
   - `AI_PROVIDER`, `AI_MODEL` và đúng một API key server-only được duyệt;
   - `GEMINI_API_KEY` + `GEMINI_EMBEDDING_MODEL=gemini-embedding-001` cho semantic document search 1536 chiều.
5. Cấu hình Supabase Auth Site URL/redirect URL đúng domain Preview. Không bật public signup.
6. Deploy Vercel Preview từ pull request. Chạy GitHub Actions workflow `Preview smoke` với Preview origin để kiểm tra `/api/health`, nội dung login, CSP/security headers và response budget; sau đó thực hiện smoke/UAT có đăng nhập trong `docs/16-uat-checklist.md`.
7. Chạy Lighthouse/Speed Insights trên Preview cho `/login`, `/dashboard`, `/customers`; ghi kết quả và mọi ngoại lệ vào phiếu phát hành.

## 4. Cổng chặn Production

Không tiếp tục nếu thiếu bất kỳ mục nào:

- Ba UAT approver đã ký; không còn lỗi nghiêm trọng/cao.
- Commit SHA, Preview URL, Supabase Preview ref và kết quả CI đã được lưu.
- Biến môi trường Production được đối chiếu theo tên, không sao chép key Preview.
- Phương án Supabase Free, RPO `24 giờ` và RTO `8 giờ` đã được chốt. Logical backup mã hóa gần nhất phải `Pass` cả tạo bundle và verify checksum; manifest phải có đủ hai bucket private vì database dump chỉ chứa metadata Storage.
- Maintenance window, release owner, database owner, incident commander và kênh thông báo đã sẵn sàng.
- Bản Vercel Production tốt gần nhất vẫn được giữ lại cho Instant Rollback.

## 5. Trình tự phát hành

1. Tạm dừng thay đổi khác; thông báo bắt đầu maintenance window.
2. Database owner xác minh project Production đang link, chạy `supabase migration list` và `supabase db push --dry-run`; dừng nếu danh sách khác phiếu phát hành.
3. Chạy thủ công workflow `Free tier encrypted backup` trên Production và xác nhận artifact mã hóa/verify `Pass`, sau đó mới chạy `supabase db push` một lần. Không `db reset --linked`, không sửa SQL trực tiếp trên Production.
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
- Chỉ khôi phục logical backup khi có mất/hỏng dữ liệu và incident commander chấp nhận downtime/RPO. Với gói Free không có PITR; trong lúc restore, ứng dụng có thể không truy cập được và có thể mất tối đa 24 giờ dữ liệu kể từ artifact cuối.

## 7. Backup và diễn tập khôi phục

- Quyết định ngày 2026-08-10: giữ Supabase Free, không PITR; mục tiêu RPO `24 giờ`, RTO `8 giờ`. Nếu hai mục tiêu này không còn đáp ứng nghiệp vụ thì phải dừng và xem lại gói dịch vụ trước Production.
- Workflow `.github/workflows/free-tier-backup.yml` chạy lúc `18:15 UTC` mỗi ngày sau khi `FREE_BACKUP_ENABLED=true`. Lần đầu phải chạy thủ công trên Preview; lịch vẫn bị skip khi biến này chưa bật.
- Backup database bám quy trình Supabase CLI: `roles.sql`, `schema.sql`, `data.sql` và migration history. Storage API tải riêng hai bucket private `documents` và `document-extracted`; service role chỉ tồn tại trong GitHub secret và script không ghi/xóa object nguồn.
- Manifest lưu project ref, môi trường, kích thước và SHA-256. Toàn bundle được mã hóa AES-256-GCM trước khi artifact được upload; GitHub giữ artifact 14 ngày. Chỉ file mã hóa được phép rời runner. Recovery copy của key phải nằm trong password manager ngoài GitHub.
- Workflow giải mã tạm và kiểm tra toàn bộ checksum ngay sau tạo backup. Việc verify chỉ chứng minh bundle đọc được, chưa thay thế restore drill.
- Workflow `.github/workflows/hosted-restore-drill.yml` chỉ chạy thủ công. Input xác nhận phải khớp `RESTORE_DRILL_PROJECT_REF`; source/target ref và cả database/API URL phải khớp guardrail, target phải rỗng trước khi `psql` ghi dữ liệu. Artifact nguồn được ghim bằng `RESTORE_DRILL_BACKUP_RUN_ID`; report không chứa row data, object path hoặc secret.
- Với restore managed-to-managed, `roles.sql` chỉ được dùng để đối chiếu rằng mọi role nguồn đã tồn tại ở target; không chạy các `ALTER ROLE ... SET` vì Supabase hosted chặn thay đổi tham số hệ thống như `log_min_messages`. Schema/data vẫn restore bằng một transaction với `session_replication_role=replica`; thiếu bất kỳ role nào thì dừng trước khi ghi schema.
- Mỗi quý và trước Production, tải một artifact đã verify, restore vào Supabase project cô lập/disposable, chạy migration check, đếm bản ghi, đăng nhập năm vai trò, kiểm tra RLS và so khớp số object/checksum Storage. Không diễn tập bằng cách ghi đè Preview hoặc Production; dọn project đích sau khi lưu bằng chứng đã khử PII/secret.
- Khi restore sang project mới phải cấu hình lại Auth URL/template, API keys, Vercel env, cron và mọi platform setting không nằm trong database. Upload object phải qua Storage API/S3, không chèn trực tiếp `storage.objects` để tránh file mồ côi.
- Bài drill tự động `npm run db:restore-drill` vẫn chỉ chạy trên Supabase local project `im_crm`: tạo logical backup, restore database disposable, so khớp fixture/migration/số bản ghi/RLS rồi dọn. Đây là regression test kỹ thuật; cổng M7.2 chỉ hoàn tất sau lần restore artifact Free thật vào project hosted cô lập kèm Storage.

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
- Migration được apply; timestamp/manifest của logical backup mã hóa; RPO 24 giờ/RTO 8 giờ đã duyệt.
- Kết quả CI, UAT ba role, Lighthouse/Speed Insights, smoke test sau deploy.
- Release owner, database owner, incident commander; thời gian bắt đầu/kết thúc UTC.
- Quyết định release/rollback và vấn đề còn lại.

## Tham chiếu nền tảng

- Supabase: [Database Backups](https://supabase.com/docs/guides/platform/backups), [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) và [Download Storage Objects](https://supabase.com/docs/guides/storage/management/download-objects).
- Vercel: Managing Deployments, Preview/Production environments và Instant Rollback.
