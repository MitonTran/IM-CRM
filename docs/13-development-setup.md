# Thiết lập phát triển

## Yêu cầu

- Node.js 22 trở lên, npm và Docker-compatible runtime (worker PDF dùng runtime Node 22+).
- Supabase project phát triển/Preview tách biệt Production.

## Local

1. Sao chép `.env.example` thành `.env.local` và điền URL/publishable key local hoặc project phát triển. Chỉ điền service role ở môi trường server tin cậy.
2. Chạy `npm install`.
3. Chạy `npm run db:start`, sau đó `npm run db:reset`.
4. Lấy URL và publishable key từ kết quả Supabase local, cập nhật `.env.local`.
5. Chạy `npm run dev`.

## Cấu hình AI từ M6

- Chọn `AI_PROVIDER` trong allowlist `openai`, `openrouter`, `gemini`, `deepseek`, `groq`, `nvidia`; đặt `AI_MODEL` và đúng một key tương ứng trong `.env.local`/Vercel Environment Variables. Không dùng tiền tố `NEXT_PUBLIC_` và không commit giá trị thật.
- Endpoint được cố định trong backend, không nhận URL tùy ý từ frontend. Nếu provider/key sai hoặc thiếu, nút phân tích trả thông báo cấu hình và không tạo request/quota dang dở.
- Gateway vẫn kiểm tra mọi kết quả bằng cùng schema Zod và evidence trong snapshot trước khi lưu. OpenAI dùng Responses API với `store: false`; các provider tương thích dùng Chat Completions.
- Trang `/ai` dùng hai lượt gọi có cấu trúc: lập kế hoạch tool rồi soạn câu trả lời từ kết quả đã qua RLS. Cần cấu hình `SUPABASE_SERVICE_ROLE_KEY` ở server để chỉ ghi completion/failure; key này không được dùng cho retrieval và không được lộ ra client.
- Semantic document search dùng `GEMINI_API_KEY` server-only và model cố định `GEMINI_EMBEDDING_MODEL=gemini-embedding-001` với output 1536 chiều để khớp cột `vector(1536)`. Document dùng task `RETRIEVAL_DOCUMENT`, câu hỏi dùng `RETRIEVAL_QUERY`; nếu thiếu key hoặc embedding query lỗi, retrieval fallback full-text dưới cùng RLS.
- Để chạy retention 90 ngày, gọi `purge_expired_ai_history()` từ job server tin cậy bằng `service_role`; không cấp RPC này cho user thường.
- `vercel.json` gọi extraction lúc `18:00 UTC` và retention AI lúc `18:30 UTC` mỗi ngày. Cả hai route yêu cầu đúng `Authorization: Bearer <CRON_SECRET>`; response lỗi không trả chi tiết database.
- Cron extraction cũng xử lý tối đa hai batch embedding mỗi lượt, 64 chunks/batch. `embedding_status` cho biết queue đang chờ, chạy, hoàn tất hay lỗi; không đổi model/dimensions nếu chưa có migration mới.
- Chỉ cấu hình và thử bằng Vercel Preview/Supabase Preview trước Production. Kết quả AI là đề xuất, không tự ghi customer, activity, follow-up hoặc deal.

| `AI_PROVIDER` | Key server | Model mặc định | Ghi chú khởi đầu |
|---|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/free` | Miễn phí, model được router chọn; giới hạn và model có thể thay đổi. |
| `gemini` | `GEMINI_API_KEY` | `gemini-3.1-flash-lite` | Có free tier theo quota Google AI Studio. |
| `nvidia` | `NVIDIA_NIM_API_KEY` | `nvidia/nemotron-3-nano-30b-a3b` | Free endpoint/trial cho phát triển, có thể bị rate limit. |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-v4-flash` | Chi phí thấp nhưng API chính thức không mặc định miễn phí. |
| `groq` | `GROQ_API_KEY` | `openai/gpt-oss-20b` | Có Free Plan theo rate limit; model mặc định hỗ trợ Structured Outputs strict. |
| `openai` | `OPENAI_API_KEY` | `gpt-5.6-terra` | Giữ tích hợp Structured Outputs hiện tại. |

Với `AI_PROVIDER=groq`, model ID `openai/gpt-oss-20b` chạy trên GroqCloud bằng `GROQ_API_KEY`; không dùng OpenAI API key hay OpenAI credit. Endpoint và model bám theo [Groq OpenAI compatibility](https://console.groq.com/docs/openai), [Structured Outputs](https://console.groq.com/docs/structured-outputs) và [Free Plan limits](https://console.groq.com/docs/rate-limits).

Ví dụ khởi đầu với OpenRouter:

```dotenv
AI_PROVIDER=openrouter
AI_MODEL=openrouter/free
OPENROUTER_API_KEY=<đặt trong môi trường server>
```

Free tier có điều khoản lưu trữ/sử dụng dữ liệu khác nhau và có thể thay đổi. Chỉ dùng dữ liệu giả trong dev/Preview; không gửi dữ liệu CRM thật cho free endpoint trước khi duyệt điều khoản riêng tư, vùng xử lý dữ liệu, retention và hợp đồng phù hợp.

Hợp đồng embedding bám theo [Gemini Embeddings API](https://ai.google.dev/api/embeddings): backend gọi `batchEmbedContents`, cố định `gemini-embedding-001` và `outputDimensionality=1536`. Free Tier có thể dùng cho Preview với dữ liệu giả; điều khoản sử dụng dữ liệu phải được duyệt trước Production.

### Đánh giá provider bằng dữ liệu giả

Chạy `npm run eval:ai:live` khi đã đặt `AI_PROVIDER`, tùy chọn `AI_MODEL` và đúng API key server-only tương ứng. Bộ eval gọi provider thật với ba hợp đồng: phân tích khách hàng có evidence hợp lệ, planner chỉ dùng tool đọc trong allowlist, và câu trả lời bỏ qua prompt injection nằm trong dữ liệu tool. Fixture chỉ dùng UUID giả và miền `example.invalid`; không dùng Supabase, service role hoặc dữ liệu CRM thật.

Workflow thủ công `AI provider evaluation` chạy cùng bộ eval và lưu báo cáo 14 ngày. Chỉ cấu hình key trong GitHub Actions secret mang đúng tên provider; không đưa key vào input, log hay artifact. Workflow không chạy tự động trên pull request để tránh cấp secret cho code chưa duyệt và tránh tiêu quota ngoài ý muốn.

## Admin đầu tiên

Đây là thao tác bootstrap duy nhất và phải thực hiện trong Supabase Dashboard/SQL Editor của môi trường mới, không qua frontend:

1. Tạo user email đã xác minh trong Authentication > Users.
2. Lấy UUID user và chạy câu lệnh sau với UUID thật trong SQL Editor:

```sql
update public.profiles
set role = 'admin', is_active = true
where id = '<UUID_ADMIN>';
```

Không đưa email, mật khẩu hoặc UUID thật vào migration/seed/repository. Sau bootstrap, Admin mời các thành viên khác trong màn hình “Nhân sự & team”.

## Backup mã hóa cho Supabase Free

Gói Free không có scheduled project backup/PITR. IM CRM dùng workflow `Free tier encrypted backup` để tạo logical export mỗi 24 giờ và lưu artifact mã hóa ngoài Supabase trong 14 ngày. Workflow không chạy lịch cho đến khi repository variable `FREE_BACKUP_ENABLED=true`; phải chạy thủ công và xác minh Preview trước khi bật lịch.

GitHub Actions secrets bắt buộc:

- `FREE_BACKUP_DB_URL`: Session pooler/direct PostgreSQL URL có mật khẩu đã percent-encode.
- `FREE_BACKUP_SUPABASE_URL`: Project URL của đúng project nguồn.
- `FREE_BACKUP_SERVICE_ROLE_KEY`: chỉ dùng trên runner để đọc hai bucket private; không ghi log/artifact bản rõ.
- `BACKUP_ENCRYPTION_KEY`: base64 của đúng 32 byte, có thể tạo bằng `openssl rand -base64 32`. Release owner phải giữ thêm một bản trong password manager ngoài GitHub; mất key đồng nghĩa không thể khôi phục.

Repository variables bắt buộc:

- `FREE_BACKUP_PROJECT_REF`: project ref 20 ký tự phải khớp cả API URL và database URL.
- `FREE_BACKUP_SOURCE_ENV`: `preview` trong lần diễn tập, chỉ đổi sang `production` sau ký duyệt go-live.
- `FREE_BACKUP_ENABLED`: để `false`/trống khi thiết lập; chỉ đặt `true` sau lần chạy thủ công `Pass`.

Bundle gồm roles, schema, data, migration history và toàn bộ object của `documents`/`document-extracted`. Script tạo manifest SHA-256, mã hóa AES-256-GCM, xóa thư mục bản rõ rồi workflow giải mã tạm để xác minh checksum trước khi chỉ upload file `*.imcrm-backup`.

Lệnh cục bộ tương đương, không dán secret vào command history:

```bash
npm run backup:free
BACKUP_FILE=/path/to/file.imcrm-backup npm run backup:free:verify
```

Chỉ chạy restore vào Supabase project disposable/cô lập. Không restore đè Preview hoặc Production và không commit file backup/bản rõ; `.gitignore` chặn định dạng `*.imcrm-backup` cùng thư mục `backup-output`.

Email mời đi qua `/auth/callback`; email khôi phục đi qua `/auth/confirm`, sau đó tới `/auth/update-password`. Màn hình đăng nhập có liên kết “Quên mật khẩu”; phản hồi gửi email luôn dùng thông báo chung để không tiết lộ tài khoản có tồn tại. Server Action recovery đặt `RedirectTo` là `/auth/confirm` trên HTTPS origin của chính request khi `Origin` khớp `Host`/`X-Forwarded-Host`; `NEXT_PUBLIC_APP_URL` chỉ là fallback an toàn. Thêm `/auth/confirm` của từng hostname UAT vào Supabase Redirect URLs.

Khi đã cấu hình custom SMTP và Dashboard cho phép sửa Auth Email Templates, ưu tiên liên kết token-hash phía server cho Invite user và Reset password để người dùng có thể mở email ở trình duyệt khác:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password">Hoàn tất tài khoản</a>
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password">Đặt lại mật khẩu</a>
```

## Kiểm tra

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run db:test` khi Supabase local đang chạy
- `npm run test:e2e` khi Supabase local đang chạy
- `npm run build`

### E2E local

`npm run test:e2e` tự động build bản production, khởi động app ở `127.0.0.1:3200` và chạy Playwright Chromium với 5 luồng auth/quyền. Global setup tạo dữ liệu giả cho Sale A, Sale B, Leader hai team và Admin; global teardown dọn các fixture này sau khi chạy. Cả hai bước chỉ hoạt động khi Supabase API lẫn PostgreSQL URL trỏ về `localhost`/`127.0.0.1`.

Không chạy bộ fixture này với Preview hoặc Production. Tài khoản dùng tên miền `example.invalid`; có thể xóa toàn bộ dữ liệu local sau khi kiểm tra bằng `npm run db:reset`.

E2E cũng kiểm tra health/security headers và baseline production-like cho `/login`, `/dashboard`, `/customers`. Guardrail local/CI hiện tại: TTFB dưới 2 giây, DOMContentLoaded dưới 3,5 giây, load dưới 5 giây, tổng transfer dưới 3 MB và JavaScript transfer dưới 1,5 MB cho mỗi full navigation. File `performance-baseline.json` được đính kèm vào test result; GitHub Actions lưu cả thư mục `test-results` trong artifact `playwright-results` 14 ngày. Đây là ngưỡng chống hồi quy, không thay thế Lighthouse và Core Web Vitals thật trên Vercel Preview.

## Preview

Tạo Supabase branch/project Preview và Vercel Preview với secret riêng. Chạy migration bằng Supabase CLI đã link đúng project, kiểm tra ba role rồi mới xem xét Production.

Sau deploy, kiểm tra `GET /api/health` trả `200`, `Cache-Control: no-store`, sau đó kiểm tra CSP/security headers trên `/login`. Liveness không thay thế smoke test đăng nhập và quyền dữ liệu.

Có thể chạy kiểm tra chỉ đọc bằng `npm run smoke:deployment -- https://<preview-domain>`. Script từ chối HTTP từ xa, URL chứa credential/path/query, kiểm tra health, nội dung login, security headers và budget phản hồi 5 giây; báo cáo không chứa bypass secret. Workflow `Preview smoke` trong GitHub Actions nhận `preview_url` thủ công và lưu `deployment-smoke.json` 14 ngày.

Nếu Vercel Preview bật Deployment Protection, tạo Protection Bypass for Automation riêng cho CI và lưu giá trị vào GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. Script chỉ gửi secret bằng header `x-vercel-protection-bypass`; không đặt secret trong URL, repository hoặc report. Có thể bỏ secret này nếu Preview không được bảo vệ.

Workflow cũng chạy `npm run audit:preview-performance` bằng Chromium cho `/login`, `/dashboard` và `/customers`, mỗi route ba lượt context lạnh rồi lấy median của TTFB, FCP, LCP, CLS và transfer size. Sau đó `npm run audit:preview-lighthouse` dùng Lighthouse desktop trong cùng Chrome session: audit `/login` trước, đăng nhập bằng Playwright rồi audit `/dashboard` và `/customers`; chỉ lỗi runtime tạm thời `NO_FCP` được thử lại đúng một lần, score thấp không được retry. Tạo một tài khoản Admin UAT chỉ chứa dữ liệu giả trên Supabase Preview, lưu credential vào GitHub Actions secrets `PREVIEW_AUDIT_EMAIL` và `PREVIEW_AUDIT_PASSWORD`; report chỉ giữ score/metric số, không giữ Lighthouse report thô, email, mật khẩu hoặc DOM. SEO là thông tin tham khảo vì CRM nội bộ cố ý gửi `noindex, nofollow`; cổng pass áp dụng cho Performance, Accessibility và Best Practices. Artifact `preview-verification` giữ `deployment-smoke.json`, `preview-performance.json` và `preview-lighthouse.json` trong 14 ngày.
